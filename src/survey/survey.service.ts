import { Injectable, Logger } from '@nestjs/common';
import {
  SurveyAlreadyExistsException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { CreateSurveyRequestDto } from './dto/create-survey.request.dto.js';
import { CreateSurveyResponseDto } from './dto/create-survey.response.dto.js';
import { FindSurveyRequestDto } from './dto/find-survey.request.dto.js';
import { SurveyResponseDto } from './dto/survey.response.dto.js';
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

  constructor(private readonly surveyStore: SurveyStore) {}

  /**
   * 설문과 그 문항들을 함께 생성한다.
   *
   * @returns 생성된 설문의 id — 이어서 수정·삭제하려면 필요하다.
   * @throws {SurveyAlreadyExistsException} 같은 (박람회, 참여자군) 조합의 설문이 이미 있을 때
   */
  async create(dto: CreateSurveyRequestDto): Promise<CreateSurveyResponseDto> {
    const duplicated = await this.surveyStore.existsByExpoAndType(
      dto.expoId,
      dto.participationType,
    );

    if (duplicated) throw new SurveyAlreadyExistsException();

    // dynamicSurvey만 엔티티로 변환이 필요하고 나머지 필드는 이름·타입이 그대로라 한 번에 옮긴다.
    // `satisfies`가 빠진 필드를 컴파일 타임에 잡아준다 — 엔티티에 컬럼이 늘면 여기서 먼저 깨진다.
    const { dynamicSurvey, ...meta } = dto;
    const survey = Object.assign(new SurveyEntity(), {
      ...meta,
      // 컬럼 default(0)에 맡기지 않고 명시한다. SurveyFields에서 빼버리면 위의 안전망에 구멍이
      // 생기고, 저장 직전 엔티티의 totalAnswers가 number 타입인 채 undefined가 된다.
      totalAnswers: 0,
      dynamicSurveys: dynamicSurvey.map((question) =>
        this.toQuestionEntity(question),
      ),
    } satisfies SurveyFields);

    const saved = await this.surveyStore.save(survey);
    this.logger.log(
      `설문 생성 완료: surveyId=${saved.id}, expoId=${dto.expoId}`,
    );

    return { id: saved.id };
  }

  /**
   * 설문 메타데이터를 갱신하고 문항을 통째로 교체한다.
   *
   * 문항은 개별로 수정/추가/삭제하는 게 아니라 **전부 지우고 새로 만든다**(폼과 동일).
   * 그래서 기존 문항의 id는 보존되지 않는다.
   *
   * 참여자군도 바꿀 수 있기 때문에, 바꾼 결과가 다른 설문과 같은 조합이 되지 않는지 여기서
   * 확인한다. DB 유니크 제약이 최종 방어선이지만 그건 500으로 터지므로, 409로 돌려주려면
   * 애플리케이션에서도 걸러야 한다.
   *
   * @throws {SurveyNotFoundException} 해당 id의 설문이 없을 때
   * @throws {SurveyAlreadyExistsException} 바꾸려는 조합을 이미 다른 설문이 쓰고 있을 때
   */
  async update(surveyId: string, dto: UpdateSurveyRequestDto): Promise<void> {
    const survey = await this.surveyStore.findById(surveyId);
    if (!survey) throw new SurveyNotFoundException();

    const conflict = await this.surveyStore.findByExpoAndType(
      survey.expoId,
      dto.participationType,
    );
    if (conflict && conflict.id !== surveyId)
      throw new SurveyAlreadyExistsException();

    const { dynamicSurvey, ...meta } = dto;
    Object.assign(survey, meta satisfies UpdatableSurveyFields);

    const questions = dynamicSurvey.map((question) =>
      this.toQuestionEntity(question),
    );

    await this.surveyStore.updateWithQuestions(survey, questions);
    this.logger.log(
      `설문 수정 완료: surveyId=${surveyId}, 문항 ${questions.length}개로 교체`,
    );
  }

  /**
   * 설문을 삭제한다. 딸린 문항은 DB의 FK CASCADE로 함께 지워진다.
   *
   * @throws {SurveyNotFoundException} 해당 id의 설문이 없을 때
   */
  async delete(surveyId: string): Promise<void> {
    const survey = await this.surveyStore.findById(surveyId);
    if (!survey) throw new SurveyNotFoundException();

    await this.surveyStore.deleteById(surveyId);
    this.logger.log(`설문 삭제 완료: surveyId=${surveyId}`);
  }

  /**
   * (박람회, 참여자군) 조합으로 설문 하나를 조회한다.
   * 응답 페이지를 그릴 때 쓰는 경로라, 문항과 그 스펙까지 한 번에 담아서 돌려준다.
   *
   * @throws {SurveyNotFoundException} 조건에 맞는 설문이 없을 때
   */
  async findOne(dto: FindSurveyRequestDto): Promise<SurveyResponseDto> {
    const survey = await this.surveyStore.findByExpoAndType(
      dto.expoId,
      dto.participationType,
    );

    if (!survey) throw new SurveyNotFoundException();

    return this.toResponse(survey);
  }

  /**
   * 요청 DTO의 문항 하나를 엔티티로 옮긴다.
   * id와 부모 관계(`survey`)는 여기서 채우지 않는다 — 저장 시점에 TypeORM이 정한다.
   */
  private toQuestionEntity(
    question: CreateSurveyRequestDto['dynamicSurvey'][number],
  ): DynamicSurveyEntity {
    return Object.assign(
      new DynamicSurveyEntity(),
      question satisfies DynamicSurveyFields,
    );
  }

  /**
   * 엔티티를 응답 DTO로 변환한다. 엔티티를 그대로 내보내지 않는 이유는,
   * 감사 컬럼(`createdAt`/`updatedAt`)이나 양방향 관계처럼 외부에 노출할 필요 없는 것들을
   * 응답 계약에서 분리해두기 위해서다.
   */
  private toResponse(survey: SurveyEntity): SurveyResponseDto {
    return {
      id: survey.id,
      expoId: survey.expoId,
      title: survey.title,
      informationText: survey.informationText,
      participationType: survey.participationType,
      totalAnswers: survey.totalAnswers,
      dynamicSurvey: survey.dynamicSurveys.map((question) => ({
        id: question.id,
        title: question.title,
        formType: question.formType,
        requiredStatus: question.requiredStatus,
        jsonData: question.jsonData,
        otherJson: question.otherJson,
      })),
    };
  }
}
