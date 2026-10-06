import { Injectable, Logger } from '@nestjs/common';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  FormAlreadyExistsException,
  FormNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { isUniqueViolation } from '../common/exceptions/postgres-error.util.js';
import { CreateFormRequestDto } from './dto/create-form.request.dto.js';
import { CreateFormResponseDto } from './dto/create-form.response.dto.js';
import { FindFormRequestDto } from './dto/find-form.request.dto.js';
import { FormSummaryDto } from './dto/form-summary.response.dto.js';
import { FormResponseDto } from './dto/form.response.dto.js';
import { UpdateFormRequestDto } from './dto/update-form.request.dto.js';
import { ApplicationType } from './entities/application-type.enum.js';
import { DynamicFormEntity } from './entities/dynamic-form.entity.js';
import { FormEntity } from './entities/form.entity.js';
import { FormStore } from './form.store.js';

/** 폼을 새로 만들 때 우리가 직접 채워야 하는 필드들 — id와 감사 컬럼은 DB/TypeORM이 정한다. */
type FormFields = Omit<FormEntity, 'id' | 'createdAt' | 'updatedAt'>;

/** 수정 요청으로 바꿀 수 있는 폼 메타데이터. 소속 박람회와 필드 목록은 여기 포함되지 않는다. */
type UpdatableFormFields = Omit<FormFields, 'expoId' | 'dynamicForms'>;

/** 입력 필드를 새로 만들 때 채워야 하는 값들 — 부모 관계(`form`)는 저장 시점에 TypeORM이 연결한다. */
type DynamicFormFields = Omit<
  DynamicFormEntity,
  'id' | 'form' | 'createdAt' | 'updatedAt'
>;

/**
 * 폼 정의의 생성·조회·수정·삭제를 담당한다.
 *
 * 폼은 `(expoId, participationType, applicationType)` 조합당 하나만 존재한다 —
 * 예를 들어 같은 박람회라도 교육생용 사전등록 폼과 일반참가자용 사전등록 폼은 별개다.
 *
 * `expoId`가 박람회 서비스에 실제로 존재하는지는 검증하지 않는다. 박람회 서비스가 아직 없고,
 * 서비스별 DB 분리 구조라 FK로도 막을 수 없다 — uuid 형식 검증까지만 하고 값으로 신뢰한다.
 */
@Injectable()
export class FormService {
  private readonly logger = new Logger(FormService.name);

  constructor(private readonly formStore: FormStore) {}

  /**
   * 폼과 그 입력 필드들을 함께 생성한다.
   *
   * @returns 생성된 폼의 id — 이어서 수정·삭제하려면 필요하다.
   * @throws {FormAlreadyExistsException} 같은 (박람회, 참여자군, 신청방식) 조합의 폼이 이미 있을 때
   *   (동시 요청 사이의 경합으로 DB 유니크 제약이 걸린 경우 포함)
   */
  async create(
    expoId: string,
    dto: CreateFormRequestDto,
  ): Promise<CreateFormResponseDto> {
    const duplicated = await this.formStore.existsByExpoAndTypes(
      expoId,
      dto.participantType,
      dto.applicationType,
    );

    if (duplicated) {
      throw new FormAlreadyExistsException();
    }

    // dynamicForm만 엔티티로 변환이 필요하고 나머지 필드는 이름·타입이 그대로라 한 번에 옮긴다.
    // `satisfies`가 빠진 필드를 컴파일 타임에 잡아준다 — 엔티티에 컬럼이 늘면 여기서 먼저 깨진다.
    // DTO의 `participantType`은 엔티티 컬럼 `participationType`으로 이름을 맞춰 옮긴다.
    const { dynamicForm, participantType, ...meta } = dto;
    const form = Object.assign(new FormEntity(), {
      ...meta,
      participationType: participantType,
      expoId,
      dynamicForms: dynamicForm.map((field) => this.toFieldEntity(field)),
    } satisfies FormFields);

    // 위 existsByExpoAndTypes 검사와 이 save 사이에 다른 요청이 끼어들면 둘 다 통과한 채로
    // 여기까지 올 수 있다. 그럴 땐 DB 유니크 제약이 마지막으로 걸러주는데, 그 위반을 그대로
    // 두면 409가 아니라 500이 나간다 — 여기서 잡아 도메인 예외로 바꾼다.
    let saved: FormEntity;
    try {
      saved = await this.formStore.save(form);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new FormAlreadyExistsException();
      }

      throw error;
    }

    this.logger.log(`폼 생성 완료: formId=${saved.id}, expoId=${expoId}`);

    return { id: saved.id };
  }

  /**
   * 폼 메타데이터를 갱신하고 입력 필드를 통째로 교체한다.
   *
   * 대상 폼은 경로의 `expoId`와 바디의 `participationType`+`applicationType` 조합으로
   * 식별한다. 이 조합이 곧 폼을 유일하게 식별하는 키이므로, 이 요청으로 참여자군·신청방식
   * 자체를 바꿀 수는 없다 — 바디의 값이 실제 소유 폼과 다르면 그 폼을 찾지 못해 404가 난다.
   *
   * 필드는 개별로 수정/추가/삭제하는 게 아니라 **전부 지우고 새로 만든다**(v1과 동일).
   * 그래서 기존 필드의 id는 보존되지 않는다 — 이미 제출된 응답이 옛 필드를 가리키고 있다면
   * 연결이 끊긴다. 스펙 버저닝으로 이 문제를 해결하는 건 별도 과제로 남아 있다.
   *
   * @throws {FormNotFoundException} 해당 조합의 폼이 없을 때(수정하는 사이 삭제된 경우 포함)
   * @throws {ExpoDeletedException} 삭제된 박람회일 때
   */
  async update(expoId: string, dto: UpdateFormRequestDto): Promise<void> {
    const form = await this.formStore.findByExpoAndTypes(
      expoId,
      dto.participantType,
      dto.applicationType,
    );
    if (!form) {
      throw new FormNotFoundException();
    }

    const { dynamicForm, participantType, ...meta } = dto;
    Object.assign(form, {
      ...meta,
      participationType: participantType,
    } satisfies UpdatableFormFields);

    const fields = dynamicForm.map((field) => this.toFieldEntity(field));

    // 폼을 읽은 뒤 그 폼이 삭제됐다면 아무것도 바꾸지 않고 false가 온다.
    const updated = await this.formStore.updateWithFields(form, fields);
    if (!updated) {
      throw new FormNotFoundException();
    }

    this.logger.log(
      `폼 수정 완료: formId=${form.id}, 필드 ${fields.length}개로 교체`,
    );
  }

  /**
   * 폼을 삭제한다. 딸린 입력 필드는 DB의 FK CASCADE로 함께 지워진다.
   * 대상 폼은 (박람회, 참여자군, 신청방식) 조합으로 식별한다.
   *
   * @throws {FormNotFoundException} 해당 조합의 폼이 없을 때
   */
  async delete(
    expoId: string,
    participationType: ParticipationType,
    applicationType: ApplicationType,
  ): Promise<void> {
    const form = await this.formStore.findByExpoAndTypes(
      expoId,
      participationType,
      applicationType,
    );
    if (!form) {
      throw new FormNotFoundException();
    }

    await this.formStore.deleteById(form.id);
    this.logger.log(`폼 삭제 완료: formId=${form.id}`);
  }

  /** 여러 박람회에 어떤 폼이 만들어져 있는지 돌려준다. 폼이 없는 박람회는 결과에 나오지 않는다. */
  async summarize(expoIds: string[]): Promise<FormSummaryDto[]> {
    const forms = await this.formStore.findSummariesByExpoIds(expoIds);
    return forms.map(({ expoId, participationType, applicationType }) => ({
      expoId,
      participationType,
      applicationType,
    }));
  }

  /**
   * (박람회, 참여자군, 신청방식) 조합으로 폼 하나를 조회한다.
   * 신청 페이지를 그릴 때 쓰는 경로라, 입력 필드와 그 스펙까지 한 번에 담아서 돌려준다.
   *
   * @throws {FormNotFoundException} 조건에 맞는 폼이 없을 때
   */
  async findOne(
    expoId: string,
    dto: FindFormRequestDto,
  ): Promise<FormResponseDto> {
    const form = await this.formStore.findByExpoAndTypes(
      expoId,
      dto.type,
      dto.applicationType,
    );

    if (!form) {
      throw new FormNotFoundException();
    }

    return this.toResponse(form);
  }

  /**
   * 요청 DTO의 필드 하나를 엔티티로 옮긴다.
   * id와 부모 관계(`form`)는 여기서 채우지 않는다 — 저장 시점에 TypeORM이 정한다.
   */
  private toFieldEntity(
    field: CreateFormRequestDto['dynamicForm'][number],
  ): DynamicFormEntity {
    return Object.assign(
      new DynamicFormEntity(),
      field satisfies DynamicFormFields,
    );
  }

  /**
   * 엔티티를 응답 DTO로 변환한다. 엔티티를 그대로 내보내지 않는 이유는,
   * 감사 컬럼(`createdAt`/`updatedAt`)이나 양방향 관계처럼 외부에 노출할 필요 없는 것들을
   * 응답 계약에서 분리해두기 위해서다.
   */
  private toResponse(form: FormEntity): FormResponseDto {
    return {
      id: form.id,
      expoId: form.expoId,
      title: form.title,
      informationText: form.informationText,
      participantType: form.participationType,
      applicationType: form.applicationType,
      startDate: form.startDate,
      endDate: form.endDate,
      dynamicForm: form.dynamicForms.map((field) => ({
        id: field.id,
        title: field.title,
        formType: field.formType,
        requiredStatus: field.requiredStatus,
        jsonData: field.jsonData,
        otherJson: field.otherJson,
        dynamicFormType: field.dynamicFormType,
      })),
    };
  }
}
