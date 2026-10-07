import { Inject, Injectable, Logger } from '@nestjs/common';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  ExpoNotFoundException,
  SurveyAlreadyExistsException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { isUniqueViolation } from '../common/exceptions/postgres-error.util.js';
import {
  EXPO_CLIENT,
  type ExpoClient,
} from '../expo-client/expo-client.interface.js';
import { CreateSurveyRequestDto } from './dto/create-survey.request.dto.js';
import { CreateSurveyResponseDto } from './dto/create-survey.response.dto.js';
import { FindSurveyRequestDto } from './dto/find-survey.request.dto.js';
import { SurveySummaryDto } from './dto/survey-summary.response.dto.js';
import {
  SurveyResponseDto,
  toSurveyResponse,
} from './dto/survey.response.dto.js';
import { UpdateSurveyRequestDto } from './dto/update-survey.request.dto.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyStore } from './survey.store.js';

/** 설문을 새로 만들 때 우리가 직접 채워야 하는 필드들 — id와 감사 컬럼은 DB/TypeORM이 정한다. */
type SurveyFields = Omit<SurveyEntity, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * 수정 요청으로 바꿀 수 있는 설문 메타데이터. 소속 박람회와 문항 목록은 여기 포함되지 않고,
 * `totalAnswers`도 빠진다 — 누적 응답 수는 응답 제출이 만들어내는 값이지 설문 작성자가
 * 요청으로 덮어쓸 값이 아니다.
 */
type UpdatableSurveyFields = Omit<
  SurveyFields,
  'expoId' | 'dynamicSurveys' | 'totalAnswers'
>;

/** 문항을 새로 만들 때 채워야 하는 값들 — 부모 관계(`survey`)는 저장 시점에 TypeORM이 연결한다. */
type DynamicSurveyFields = Omit<
  DynamicSurveyEntity,
  'id' | 'survey' | 'createdAt' | 'updatedAt'
>;

/**
 * 설문 정의의 생성·조회·수정·삭제를 담당한다.
 *
 * 설문은 `(expoId, participationType)` 조합당 하나만 존재한다 — 폼과 달리 신청 방식 구분이
 * 없어서, 같은 박람회라도 교육생용 설문과 일반참가자용 설문 둘로만 나뉜다.
 *
 * `expoId`가 박람회 서비스에 실제로 존재하는지는 검증하지 않는다. 박람회 서비스가 아직 없고,
 * 서비스별 DB 분리 구조라 FK로도 막을 수 없다 — uuid 형식 검증까지만 하고 값으로 신뢰한다.
 */
@Injectable()
export class SurveyService {
  private readonly logger = new Logger(SurveyService.name);

  constructor(
    private readonly surveyStore: SurveyStore,
    @Inject(EXPO_CLIENT) private readonly expoClient: ExpoClient,
  ) {}

  /**
   * 설문과 그 문항들을 함께 생성한다.
   *
   * @returns 생성된 설문의 id — 이어서 수정·삭제하려면 필요하다.
   * @throws {ExpoNotFoundException} 박람회 서비스에 없는 박람회일 때
   * @throws {ExternalServiceUnavailableException} 박람회 서비스에 확인할 수 없을 때
   * @throws {SurveyAlreadyExistsException} 같은 (박람회, 참여자군) 조합의 설문이 이미 있을 때
   *   (동시 요청 사이의 경합으로 DB 유니크 제약이 걸린 경우 포함)
   */
  async create(
    expoId: string,
    dto: CreateSurveyRequestDto,
  ): Promise<CreateSurveyResponseDto> {
    if (!(await this.expoClient.exists(expoId))) {
      throw new ExpoNotFoundException();
    }

    const duplicated = await this.surveyStore.existsByExpoAndType(
      expoId,
      dto.participationType,
    );

    if (duplicated) {
      throw new SurveyAlreadyExistsException();
    }

    // dynamicSurveyRequestDto만 엔티티로 변환이 필요하고 나머지 필드는 이름·타입이 그대로라
    // 한 번에 옮긴다. `satisfies`가 빠진 필드를 컴파일 타임에 잡아준다 — 엔티티에 컬럼이 늘면
    // 여기서 먼저 깨진다.
    const { dynamicSurveyRequestDto, ...meta } = dto;
    const survey = Object.assign(new SurveyEntity(), {
      ...meta,
      expoId,
      // 컬럼 default(0)에 맡기지 않고 명시한다. SurveyFields에서 빼버리면 위의 안전망에 구멍이
      // 생기고, 저장 직전 엔티티의 totalAnswers가 number 타입인 채 undefined가 된다.
      totalAnswers: 0,
      dynamicSurveys: dynamicSurveyRequestDto.map((question) =>
        this.toQuestionEntity(question),
      ),
    } satisfies SurveyFields);

    // 위 existsByExpoAndType 검사와 이 save 사이에 다른 요청이 끼어들면 둘 다 통과한 채로
    // 여기까지 올 수 있다. 그럴 땐 DB 유니크 제약이 마지막으로 걸러주는데, 그 위반을 그대로
    // 두면 409가 아니라 500이 나간다 — 여기서 잡아 도메인 예외로 바꾼다.
    let saved: SurveyEntity;
    try {
      saved = await this.surveyStore.save(survey);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SurveyAlreadyExistsException();
      }

      throw error;
    }

    this.logger.log(`설문 생성 완료: surveyId=${saved.id}, expoId=${expoId}`);

    return { id: saved.id };
  }

  /**
   * 설문 메타데이터를 갱신하고 문항을 통째로 교체한다.
   *
   * 대상 설문은 경로의 `expoId`와 바디의 `participationType` 조합으로 식별한다. 이 조합이
   * 곧 설문을 유일하게 식별하는 키이므로, 이 요청으로 참여자군 자체를 바꿀 수는 없다 —
   * 바디의 값이 실제 소유 설문과 다르면 그 설문을 찾지 못해 404가 난다.
   *
   * 문항은 개별로 수정/추가/삭제하는 게 아니라 **전부 지우고 새로 만든다**(폼과 동일).
   * 그래서 기존 문항의 id는 보존되지 않는다 — 이미 제출된 응답이 옛 문항을 가리키고 있다면
   * 연결이 끊긴다. 스펙 버저닝으로 이 문제를 해결하는 건 별도 과제로 남아 있다.
   *
   * @throws {SurveyNotFoundException} 해당 조합의 설문이 없을 때(수정하는 사이 삭제된 경우 포함)
   * @throws {ExpoDeletedException} 삭제된 박람회일 때
   */
  async update(expoId: string, dto: UpdateSurveyRequestDto): Promise<void> {
    const survey = await this.surveyStore.findByExpoAndType(
      expoId,
      dto.participationType,
    );
    if (!survey) {
      throw new SurveyNotFoundException();
    }

    const { dynamicSurveyRequestDto, ...meta } = dto;
    Object.assign(survey, meta satisfies UpdatableSurveyFields);

    const questions = dynamicSurveyRequestDto.map((question) =>
      this.toQuestionEntity(question),
    );

    // 설문을 읽은 뒤 그 설문이 삭제됐다면 아무것도 바꾸지 않고 false가 온다.
    const updated = await this.surveyStore.updateWithQuestions(
      survey,
      questions,
    );
    if (!updated) {
      throw new SurveyNotFoundException();
    }

    this.logger.log(
      `설문 수정 완료: surveyId=${survey.id}, 문항 ${questions.length}개로 교체`,
    );
  }

  /**
   * 설문을 삭제한다. 딸린 문항은 DB의 FK CASCADE로 함께 지워진다.
   * 대상 설문은 (박람회, 참여자군) 조합으로 식별한다.
   *
   * @throws {SurveyNotFoundException} 해당 조합의 설문이 없을 때
   */
  async delete(
    expoId: string,
    participationType: ParticipationType,
  ): Promise<void> {
    const survey = await this.surveyStore.findByExpoAndType(
      expoId,
      participationType,
    );
    if (!survey) {
      throw new SurveyNotFoundException();
    }

    await this.surveyStore.deleteById(survey.id);
    this.logger.log(`설문 삭제 완료: surveyId=${survey.id}`);
  }

  /** 여러 박람회에 어떤 설문이 만들어져 있는지 돌려준다. 설문이 없는 박람회는 결과에 나오지 않는다. */
  async summarize(expoIds: string[]): Promise<SurveySummaryDto[]> {
    const surveys = await this.surveyStore.findSummariesByExpoIds(expoIds);
    return surveys.map(({ expoId, participationType }) => ({
      expoId,
      participationType,
    }));
  }

  /**
   * (박람회, 참여자군) 조합으로 설문 하나를 조회한다.
   * 응답 페이지를 그릴 때 쓰는 경로라, 문항과 그 스펙까지 한 번에 담아서 돌려준다.
   *
   * @throws {SurveyNotFoundException} 조건에 맞는 설문이 없을 때
   */
  async findOne(
    expoId: string,
    dto: FindSurveyRequestDto,
  ): Promise<SurveyResponseDto> {
    const survey = await this.surveyStore.findByExpoAndType(expoId, dto.type);

    if (!survey) {
      throw new SurveyNotFoundException();
    }

    return toSurveyResponse(survey);
  }

  /**
   * 요청 DTO의 문항 하나를 엔티티로 옮긴다.
   * id와 부모 관계(`survey`)는 여기서 채우지 않는다 — 저장 시점에 TypeORM이 정한다.
   */
  private toQuestionEntity(
    question: CreateSurveyRequestDto['dynamicSurveyRequestDto'][number],
  ): DynamicSurveyEntity {
    return Object.assign(
      new DynamicSurveyEntity(),
      question satisfies DynamicSurveyFields,
    );
  }
}
