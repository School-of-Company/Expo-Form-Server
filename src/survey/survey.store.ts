import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
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
  ) {}

  /** id로 설문 하나를 문항까지 함께 조회한다. 없으면 null. */
  findById(id: string): Promise<SurveyEntity | null> {
    return this.surveys.findOne({
      where: { id },
      relations: { dynamicSurveys: true },
      order: DYNAMIC_SURVEY_ORDER,
    });
  }

  /**
   * 설문을 유일하게 식별하는 (박람회, 참여자군) 조합으로 조회한다.
   * 응답 페이지는 surveyId를 모르고 이 두 값만 알기 때문에 이 경로가 따로 필요하다.
   */
  findByExpoAndType(
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
  existsByExpoAndType(
    expoId: string,
    participationType: ParticipationType,
  ): Promise<boolean> {
    return this.surveys.existsBy({ expoId, participationType });
  }

  /**
   * 설문과 문항을 함께 저장한다.
   * `dynamicSurveys` 관계에 cascade가 걸려 있어서, 자식 문항도 이 한 번의 호출로 같이 들어간다.
   */
  save(survey: SurveyEntity): Promise<SurveyEntity> {
    return this.surveys.save(survey);
  }

  /**
   * 설문 메타를 갱신하면서 문항을 통째로 교체한다.
   *
   * 삭제와 재삽입 사이에 다른 요청이 설문을 조회하면 문항이 하나도 없는 상태를 보게 되므로,
   * 두 작업을 한 트랜잭션으로 묶는다.
   *
   * 주의: 여기서 저장하는 `survey`에는 메모리상의 `totalAnswers`가 같이 실려 나간다. 지금은
   * 직전에 읽어온 값이라 안전하지만, 응답 제출 기능이 붙으면 조회~저장 사이에 늘어난 응답 수를
   * 덮어쓰는 lost update가 된다. 그때는 증가를 `increment()`로 돌리고 이 save에서 해당 컬럼을
   * 빼야 한다.
   *
   * @param survey 조회해온 설문 엔티티(메타데이터는 이미 갱신된 상태)
   * @param questions 이 설문의 문항을 전부 대체할 새 문항들
   */
  async updateWithQuestions(
    survey: SurveyEntity,
    questions: DynamicSurveyEntity[],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(DynamicSurveyEntity, { survey: { id: survey.id } });

      // 조회해온 survey에는 방금 지운 옛 문항들이 매달려 있다. 새 문항으로 바꿔놓지 않으면
      // dynamicSurveys의 cascade가 옛 문항을 그대로 되살려버린다.
      survey.dynamicSurveys = questions;
      await manager.save(SurveyEntity, survey);
    });
  }

  /** 설문을 삭제한다. 딸린 문항은 FK의 `ON DELETE CASCADE`로 DB가 알아서 지운다. */
  async deleteById(id: string): Promise<void> {
    await this.surveys.delete({ id });
  }
}
