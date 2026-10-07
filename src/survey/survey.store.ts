import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, type EntityManager } from 'typeorm';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';

/**
 * 문항 순서는 별도 컬럼 없이 삽입 순서(= auto-increment PK 오름차순)로 유지한다.
 * 명시하지 않으면 DB가 임의 순서로 돌려줄 수 있어서, 조회마다 이 정렬을 붙인다.
 */
const DYNAMIC_SURVEY_ORDER = { dynamicSurveys: { id: 'ASC' } } as const;

/**
 * 설문 영속성 접근을 한 곳에 모아둔 store.
 *
 * 서비스가 TypeORM을 직접 만지지 않게 하는 게 이 프로젝트 규칙이다 — 쿼리 방식이나 ORM이
 * 바뀌어도 서비스 코드가 흔들리지 않고, 서비스 단위 테스트에서 이 클래스만 mock하면 된다.
 */
@Injectable()
export class SurveyStore {
  constructor(
    @InjectRepository(SurveyEntity)
    private readonly surveys: Repository<SurveyEntity>,
    private readonly dataSource: DataSource,
    private readonly deletedExpos: DeletedExpoStore,
  ) {}

  /**
   * 설문을 유일하게 식별하는 (박람회, 참여자군) 조합으로 조회한다.
   * 응답 페이지는 surveyId를 모르고 이 두 값만 알기 때문에 이 경로가 따로 필요하다.
   */
  async findByExpoAndType(
    expoId: string,
    participationType: ParticipationType,
  ): Promise<SurveyEntity | null> {
    return this.surveys.findOne({
      where: { expoId, participationType },
      relations: { dynamicSurveys: true },
      order: DYNAMIC_SURVEY_ORDER,
    });
  }

  /**
   * 같은 조합의 설문이 이미 있는지만 확인한다.
   * 중복 검사에는 엔티티 본문이 필요 없어서, 문항까지 끌고 오는 조회 대신 이쪽을 쓴다.
   */
  async existsByExpoAndType(
    expoId: string,
    participationType: ParticipationType,
  ): Promise<boolean> {
    return this.surveys.existsBy({ expoId, participationType });
  }

  /**
   * 설문과 문항을 함께 저장한다.
   * `dynamicSurveys` 관계에 cascade가 걸려 있어서, 자식 문항도 이 한 번의 호출로 같이 들어간다.
   *
   * 삭제된 박람회에는 저장하지 않는다. 박람회 삭제와 같은 잠금 안에서 확인하고 저장하므로, 삭제가
   * 끝나는 순간 설문이 새로 생기는 일이 없다.
   *
   * @throws {ExpoDeletedException} 삭제된 박람회일 때
   */
  async save(survey: SurveyEntity): Promise<SurveyEntity> {
    return this.dataSource.transaction(async (manager) => {
      await this.deletedExpos.lockAndAssertNotDeleted(manager, survey.expoId);

      return manager.save(SurveyEntity, survey);
    });
  }

  /**
   * 설문 메타를 갱신하면서 문항을 통째로 교체한다.
   *
   * 삭제와 재삽입 사이에 다른 요청이 설문을 조회하면 문항이 하나도 없는 상태를 보게 되므로,
   * 두 작업을 한 트랜잭션으로 묶는다.
   *
   * 메타데이터는 `update()`로 컬럼을 지정해서만 바꾼다 — `save(SurveyEntity, survey)`로
   * 엔티티를 통째로 저장하면 메모리상의 `totalAnswers`도 같이 실려 나가서, 이 트랜잭션이
   * 열려 있는 사이에 답변 제출이 늘려놓은 응답 수를 덮어써버린다(lost update). 그 대신 자식
   * 문항은 더 이상 부모 저장에 얹혀가는 cascade로 들어가지 않으므로, 여기서 직접 관계를
   * 채워 저장한다.
   *
   * 설문을 읽은 뒤 그 설문이 삭제됐다면 아래 UPDATE는 0행이 바뀌고 문항 저장이 외래 키 위반(500)이
   * 되거나 빈 문항으로 조용히 끝난다. 그래서 박람회 삭제와 같은 잠금 안에서 삭제 기록을 확인하고, 설문
   * row를 잠가 아직 있는지 확인한 뒤에만 바꾼다.
   *
   * @param survey 조회해온 설문 엔티티(메타데이터는 이미 갱신된 상태)
   * @param questions 이 설문의 문항을 전부 대체할 새 문항들
   * @returns 갱신했으면 true, 그 사이 설문이 삭제돼 아무것도 바꾸지 않았으면 false
   * @throws {ExpoDeletedException} 삭제된 박람회일 때
   */
  async updateWithQuestions(
    survey: SurveyEntity,
    questions: DynamicSurveyEntity[],
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      await this.deletedExpos.lockAndAssertNotDeleted(manager, survey.expoId);

      const locked = await manager.findOne(SurveyEntity, {
        where: { id: survey.id },
        select: { id: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        return false;
      }

      await manager.delete(DynamicSurveyEntity, { survey: { id: survey.id } });

      await manager.update(SurveyEntity, survey.id, {
        title: survey.title,
        informationText: survey.informationText,
        participationType: survey.participationType,
      });

      for (const question of questions) {
        question.survey = survey;
      }

      survey.dynamicSurveys = questions;
      await manager.save(DynamicSurveyEntity, questions);

      return true;
    });
  }

  /** 설문을 삭제한다. 딸린 문항은 FK의 `ON DELETE CASCADE`로 DB가 알아서 지운다. */
  async deleteById(id: string): Promise<void> {
    await this.surveys.delete({ id });
  }

  /** 여러 박람회의 설문을 식별 값만 골라 조회한다. 문항은 끌고 오지 않는다. */
  async findSummariesByExpoIds(
    expoIds: string[],
  ): Promise<Array<Pick<SurveyEntity, 'expoId' | 'participationType'>>> {
    return this.surveys.find({
      select: { expoId: true, participationType: true },
      where: { expoId: In(expoIds) },
    });
  }

  /**
   * 박람회의 설문을 모두 삭제하고 지운 개수를 돌려준다. 문항과 종이 QR 답변은 FK CASCADE로 함께
   * 지워진다.
   *
   * 설문 답변 접수 기록(아웃박스)은 설문 FK가 없어 여기서 직접 지운다. 남겨 두면 릴레이가 지워진
   * 설문의 답변을 계속 발행한다. 설문을 먼저 지우는 건 접수(`createReceived`)와 순서를 맞추기
   * 위해서다 — 접수가 설문 row를 잠근 채 진행 중이면 이 DELETE가 커밋을 기다리고, 그 뒤의 접수
   * 기록 삭제는 새 스냅샷으로 실행돼 방금 커밋된 기록까지 지운다.
   *
   * 박람회 삭제 트랜잭션(`ExpoPurgeService`) 안에서 부르므로 그 트랜잭션의 `manager`로 지운다.
   */
  async deleteByExpoId(
    expoId: string,
    manager: EntityManager,
  ): Promise<number> {
    const result = await manager.delete(SurveyEntity, { expoId });
    await manager.delete(SurveyAnswerSubmissionEntity, { expoId });
    return result.affected ?? 0;
  }
}
