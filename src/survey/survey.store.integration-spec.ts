import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { Occupation } from '../common/enums/occupation.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { SurveyAlreadyAnsweredException } from '../common/exceptions/domain.exception.js';
import { namingStrategy } from '../database/database.config.js';
import { DeletedExpoEntity } from '../deleted-expo/entities/deleted-expo.entity.js';
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyPublicAnswerEntity } from './entities/survey-public-answer.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyPublicAnswerStore } from './survey-public-answer.store.js';
import { SurveyStore } from './survey.store.js';

const adminUrl = process.env.DATABASE_URL;

function question(title: string): DynamicSurveyEntity {
  return Object.assign(new DynamicSurveyEntity(), {
    title,
    formType: DynamicFormFieldType.DROPDOWN,
    requiredStatus: true,
    jsonData: { '1': '좋음', '2': { value: '나쁨', isAlwaysSelected: false } },
    // jsonb는 키를 길이순으로 다시 정렬해 저장한다. 순서가 달라도 같은 문항으로 봐야 한다.
    otherJson: {
      hasEtc: false,
      maxSelection: 1,
      conditional: { parentIndex: 0, triggerValue: '1' },
    },
  });
}

describe.skipIf(adminUrl === undefined)(
  '설문 수정의 문항 교체 / PostgreSQL',
  () => {
    const dbName = `survey_update_${randomUUID().replaceAll('-', '')}`;
    let admin: DataSource;
    let dataSource: DataSource;
    let surveyStore: SurveyStore;
    let answerStore: SurveyPublicAnswerStore;

    beforeAll(async () => {
      if (adminUrl === undefined) {
        throw new Error('DATABASE_URL is required');
      }

      admin = new DataSource({ type: 'postgres', url: adminUrl });
      await admin.initialize();
      await admin.query(`CREATE DATABASE "${dbName}"`);
      const url = new URL(adminUrl);
      url.pathname = `/${dbName}`;
      dataSource = new DataSource({
        type: 'postgres',
        url: url.href,
        namingStrategy,
        entities: [
          DeletedExpoEntity,
          SurveyEntity,
          DynamicSurveyEntity,
          SurveyDrawResultEntity,
          SurveyPublicAnswerEntity,
        ],
        synchronize: true,
      });
      await dataSource.initialize();
      surveyStore = new SurveyStore(
        dataSource.getRepository(SurveyEntity),
        dataSource,
        new DeletedExpoStore(),
      );
      answerStore = new SurveyPublicAnswerStore(dataSource);
    });

    afterAll(async () => {
      await dataSource?.destroy();
      await admin?.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin?.destroy();
    });

    async function seed(answered: boolean) {
      const saved = await dataSource.getRepository(SurveyEntity).save({
        expoId: randomUUID(),
        title: '설문',
        informationText: '안내',
        participationType: ParticipationType.STANDARD,
        dynamicSurveys: [question('만족도'), question('재방문')],
      });
      if (answered) {
        await answerStore.create(saved.id, {}, Occupation.GENERAL, null);
      }

      const survey = await surveyStore.findByExpoAndType(
        saved.expoId,
        ParticipationType.STANDARD,
      );
      return survey!;
    }

    async function questionsOf(survey: SurveyEntity) {
      const found = await surveyStore.findByExpoAndType(
        survey.expoId,
        ParticipationType.STANDARD,
      );
      return found!.dynamicSurveys.map(({ id, title }) => ({ id, title }));
    }

    it('응답이 없으면 문항을 새로 만들어 교체한다', async () => {
      const survey = await seed(false);
      const before = await questionsOf(survey);

      await surveyStore.updateWithQuestions(survey, [question('만족도(수정)')]);

      const after = await questionsOf(survey);
      expect(after).toHaveLength(1);
      expect(after[0].title).toBe('만족도(수정)');
      expect(after[0].id).not.toBe(before[0].id);
    });

    it('응답이 있어도 문항이 같으면 메타데이터만 바꾸고 문항 id를 유지한다', async () => {
      const survey = await seed(true);
      const before = await questionsOf(survey);
      survey.title = '바뀐 제목';

      await surveyStore.updateWithQuestions(survey, [
        question('만족도'),
        question('재방문'),
      ]);

      expect(await questionsOf(survey)).toEqual(before);
      expect(
        await dataSource
          .getRepository(SurveyEntity)
          .findOneByOrFail({ id: survey.id }),
      ).toMatchObject({ title: '바뀐 제목', totalAnswers: 1 });
    });

    it.each([
      ['문구 변경', ['만족도?', '재방문']],
      ['순서 변경', ['재방문', '만족도']],
      ['추가', ['만족도', '재방문', '추천']],
      ['삭제', ['만족도']],
    ])(
      '응답이 있으면 문항 %s 요청을 막고 아무것도 바꾸지 않는다',
      async (_, titles) => {
        const survey = await seed(true);
        const before = await questionsOf(survey);
        survey.title = '바뀐 제목';

        await expect(
          surveyStore.updateWithQuestions(
            survey,
            titles.map((title) => question(title)),
          ),
        ).rejects.toBeInstanceOf(SurveyAlreadyAnsweredException);

        expect(await questionsOf(survey)).toEqual(before);
        expect(
          await dataSource
            .getRepository(SurveyEntity)
            .findOneByOrFail({ id: survey.id }),
        ).toMatchObject({ title: '설문' });
      },
    );

    it('응답이 있으면 문항 유형·선택지 변경도 막는다', async () => {
      const survey = await seed(true);
      const changed = [question('만족도'), question('재방문')];
      changed[1].formType = DynamicFormFieldType.CHECKBOX;

      await expect(
        surveyStore.updateWithQuestions(survey, changed),
      ).rejects.toBeInstanceOf(SurveyAlreadyAnsweredException);

      changed[1] = question('재방문');
      changed[1].jsonData = { '1': '좋음' };
      await expect(
        surveyStore.updateWithQuestions(survey, changed),
      ).rejects.toBeInstanceOf(SurveyAlreadyAnsweredException);
    });
  },
);
