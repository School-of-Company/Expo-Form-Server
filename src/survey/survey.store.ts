import { isDeepStrictEqual } from 'node:util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  Repository,
  type EntityManager,
  type FindOptionsSelect,
} from 'typeorm';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { SurveyAlreadyAnsweredException } from '../common/exceptions/domain.exception.js';
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import { allocateFieldIds } from '../database/dynamic-field-ids.js';
import {
  toStoredQuestion,
  type DynamicSurveyQuestion,
  type NewDynamicSurveyQuestion,
} from './dynamic-survey-question.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';

/** 문항 배열(`questions`)만 뺀 설문 행 컬럼. 문항이 필요 없는 경로가 배열을 읽지 않게 한다. */
const HEADER_COLUMNS = {
  id: true,
  title: true,
  informationText: true,
  participationType: true,
  totalAnswers: true,
  lotteryEnabled: true,
  lotteryNumbers: true,
  lotterySequence: true,
  expoId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies FindOptionsSelect<SurveyEntity>;

/**
 * 답변 검증과 화면이 쓰는 문항 내용. jsonb는 키 순서를 바꿔 저장하지만 {@link isDeepStrictEqual}은 키 순서를
 * 보지 않는다. 저장된 문항의 `otherJson`은 null이고 요청에서는 빠질 수 있어서 같은 값으로 맞춘다.
 */
function questionContent({
  title,
  formType,
  requiredStatus,
  jsonData,
  otherJson,
}: NewDynamicSurveyQuestion) {
  return { title, formType, requiredStatus, jsonData, otherJson: otherJson ?? null };
}

/** 문항 수·순서·내용이 모두 같은지. 조건부 표시가 문항 위치(`parentIndex`)를 가리키므로 순서도 본다. */
function hasSameQuestions(
  current: DynamicSurveyQuestion[],
  next: NewDynamicSurveyQuestion[],
): boolean {
  return (
    current.length === next.length &&
    current.every((question, index) =>
      isDeepStrictEqual(
        questionContent(question),
        questionContent(next[index]),
      ),
    )
  );
}

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
    });
  }

  /**
   * `findByExpoAndType`과 같지만 문항을 불러오지 않는다. id·경품 추첨 설정·누적 응답 수처럼 설문 행만
   * 필요한 경로가 문항 배열을 읽고 옮기는 비용을 치르지 않게 따로 둔다.
   */
  async findHeaderByExpoAndType(
    expoId: string,
    participationType: ParticipationType,
  ): Promise<SurveyEntity | null> {
    return this.surveys.findOne({
      where: { expoId, participationType },
      select: HEADER_COLUMNS,
    });
  }

  /**
   * 경품 추첨 설정만 바꾼다. 순번은 건드리지 않는다 — 껐다 켜도 이어서 세고, 응답이 설문 행을 잠그고 읽는
   * 값과 어긋나지 않게 컬럼을 지정해서만 갱신한다.
   */
  async updateLottery(
    id: string,
    enabled: boolean,
    numbers: number[],
  ): Promise<void> {
    await this.surveys.update(id, {
      lotteryEnabled: enabled,
      lotteryNumbers: numbers,
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
   * 설문과 문항을 함께 저장한다. 새 문항의 id는 {@link allocateFieldIds}로 받아 작성 순서대로 붙인다.
   *
   * 삭제된 박람회에는 저장하지 않는다. 박람회 삭제와 같은 잠금 안에서 확인하고 저장하므로, 삭제가
   * 끝나는 순간 설문이 새로 생기는 일이 없다.
   *
   * @throws {ExpoDeletedException} 삭제된 박람회일 때
   */
  async save(
    survey: SurveyEntity,
    questions: NewDynamicSurveyQuestion[],
  ): Promise<SurveyEntity> {
    return this.dataSource.transaction(async (manager) => {
      await this.deletedExpos.lockAndAssertNotDeleted(manager, survey.expoId);

      survey.dynamicSurveys = await this.withNewIds(manager, questions);
      return manager.save(SurveyEntity, survey);
    });
  }

  /**
   * 설문 메타를 갱신하면서 문항을 통째로 교체한다.
   *
   * 문항이 지금과 똑같으면 교체하지 않는다. 다시 만들면 내용이 같아도 문항 id가 바뀌어, 열어 둔 화면의
   * 제출이 400이 된다. 문항이 하나라도 다르면 교체하는데, 응답이 있는 설문이면 막는다(#179). 응답 여부는
   * 누적 응답 수로 본다 — 공개 답변·로그인/SMS 답변 접수가 저장과 같은 트랜잭션에서 이 값을 늘리고(옛 종이
   * QR 답변도 당시 같은 방식으로 셌다), 거절된 접수만 되돌린다. 설문 row를 잠근 뒤 읽으므로 그 사이 들어온 응답도 빠뜨리지 않는다.
   *
   * 메타데이터와 문항은 `update()`로 컬럼을 지정해서만 바꾼다 — `save(SurveyEntity, survey)`로
   * 엔티티를 통째로 저장하면 메모리상의 `totalAnswers`도 같이 실려 나가서, 이 트랜잭션이
   * 열려 있는 사이에 답변 제출이 늘려놓은 응답 수를 덮어써버린다(lost update). 문항은 설문 행 안(`questions`)에
   * 있으므로 같은 UPDATE 한 문장으로 바뀐다.
   *
   * 설문을 읽은 뒤 그 설문이 삭제됐다면 아래 UPDATE는 0행이 바뀌고 조용히 끝난다. 그래서 박람회 삭제와 같은 잠금 안에서 삭제 기록을 확인하고, 설문
   * row를 잠가 아직 있는지 확인한 뒤에만 바꾼다.
   *
   * @param survey 조회해온 설문 엔티티(메타데이터는 이미 갱신된 상태)
   * @param questions 이 설문의 문항을 전부 대체할 새 문항들
   * @param lottery 경품 추첨 옵션. 보낸 값만 바꾸고 비어 있는 값은 지금 값을 그대로 둔다
   * @param lottery.enabled 추첨을 켤지
   * @param lottery.numbers 당첨 번호 목록
   * @returns 갱신했으면 true, 그 사이 설문이 삭제돼 아무것도 바꾸지 않았으면 false
   * @throws {ExpoDeletedException} 삭제된 박람회일 때
   * @throws {SurveyAlreadyAnsweredException} 응답이 있는 설문의 문항을 바꾸려 할 때
   */
  async updateWithQuestions(
    survey: SurveyEntity,
    questions: NewDynamicSurveyQuestion[],
    lottery: { enabled?: boolean; numbers?: number[] } = {},
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      await this.deletedExpos.lockAndAssertNotDeleted(manager, survey.expoId);

      const locked = await manager.findOne(SurveyEntity, {
        where: { id: survey.id },
        select: { id: true, totalAnswers: true, dynamicSurveys: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        return false;
      }

      const replace = !hasSameQuestions(locked.dynamicSurveys, questions);
      if (replace && locked.totalAnswers > 0) {
        throw new SurveyAlreadyAnsweredException();
      }

      const replaced = replace
        ? await this.withNewIds(manager, questions)
        : undefined;

      await manager.update(SurveyEntity, survey.id, {
        title: survey.title,
        informationText: survey.informationText,
        participationType: survey.participationType,
        // 경품 추첨 옵션은 보낸 것만 바꾼다. 읽어 온 값을 그대로 다시 쓰면 그 사이에 설정 API로 바뀐 값을 덮어쓴다.
        ...(lottery.enabled !== undefined && {
          lotteryEnabled: lottery.enabled,
        }),
        ...(lottery.numbers !== undefined && {
          lotteryNumbers: lottery.numbers,
        }),
        ...(replaced && { dynamicSurveys: replaced }),
      });

      survey.dynamicSurveys = replaced ?? locked.dynamicSurveys;

      return true;
    });
  }

  /** 새 문항들에 `dynamic_survey_id_seq`에서 받은 id를 작성 순서대로 붙인다. */
  private async withNewIds(
    manager: EntityManager,
    questions: NewDynamicSurveyQuestion[],
  ) {
    const ids = await allocateFieldIds(
      manager,
      'dynamic_survey_id_seq',
      questions.length,
    );
    return questions.map((question, index) =>
      toStoredQuestion(question, ids[index]),
    );
  }

  /** 설문을 삭제한다. 문항은 설문 행 안(`questions`)에 있어 함께 지워진다. */
  async deleteById(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(SurveyEntity, { id });
      // 접수 기록(아웃박스)에는 설문 FK가 없어 CASCADE가 닿지 않는다. 남겨 두면 릴레이가 지워진 설문의 답변을 계속
      // 유저 서비스로 발행한다. 설문을 먼저 지우는 순서는 박람회 일괄 삭제(`deleteByExpoId`)와 같다 — 접수가 설문
      // row를 잠근 채 진행 중이면 이 DELETE가 커밋을 기다리고, 그 뒤 접수 기록 삭제가 방금 커밋된 기록까지 지운다.
      await manager.delete(SurveyAnswerSubmissionEntity, { surveyId: id });
    });
  }

  /** 여러 박람회의 설문을 식별 값과 추첨 준비 상태만 골라 조회한다. 문항은 끌고 오지 않는다. */
  async findSummariesByExpoIds(
    expoIds: string[],
  ): Promise<
    Array<
      Pick<
        SurveyEntity,
        'expoId' | 'participationType' | 'lotteryEnabled' | 'lotteryNumbers'
      >
    >
  > {
    return this.surveys.find({
      select: {
        expoId: true,
        participationType: true,
        lotteryEnabled: true,
        lotteryNumbers: true,
      },
      where: { expoId: In(expoIds) },
    });
  }

  /**
   * 박람회의 설문을 모두 삭제하고 지운 개수를 돌려준다. 문항은 설문 행 안에 있어 함께 지워지고, 공개 링크
   * 답변은 FK CASCADE로 함께 지워진다.
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
