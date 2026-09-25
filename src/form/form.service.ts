import { Injectable, Logger } from '@nestjs/common';
import {
  FormAlreadyExistsException,
  FormNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { CreateFormRequestDto } from './dto/create-form.request.dto.js';
import { FindFormRequestDto } from './dto/find-form.request.dto.js';
import { FormResponseDto } from './dto/form.response.dto.js';
import { UpdateFormRequestDto } from './dto/update-form.request.dto.js';
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
   * @throws {FormAlreadyExistsException} 같은 (박람회, 참여자군, 신청방식) 조합의 폼이 이미 있을 때
   */
  async create(dto: CreateFormRequestDto): Promise<void> {
    const duplicated = await this.formStore.existsByExpoAndTypes(
      dto.expoId,
      dto.participationType,
      dto.applicationType,
    );

    if (duplicated) throw new FormAlreadyExistsException();

    // dynamicForm만 엔티티로 변환이 필요하고 나머지 필드는 이름·타입이 그대로라 한 번에 옮긴다.
    // `satisfies`가 빠진 필드를 컴파일 타임에 잡아준다 — 엔티티에 컬럼이 늘면 여기서 먼저 깨진다.
    const { dynamicForm, ...meta } = dto;
    const form = Object.assign(new FormEntity(), {
      ...meta,
      dynamicForms: dynamicForm.map((field) => this.toFieldEntity(field)),
    } satisfies FormFields);

    const saved = await this.formStore.save(form);
    this.logger.log(`폼 생성 완료: formId=${saved.id}, expoId=${dto.expoId}`);
  }

  /**
   * 폼 메타데이터를 갱신하고 입력 필드를 통째로 교체한다.
   *
   * 필드는 개별로 수정/추가/삭제하는 게 아니라 **전부 지우고 새로 만든다**(v1과 동일).
   * 그래서 기존 필드의 id는 보존되지 않는다 — 이미 제출된 응답이 옛 필드를 가리키고 있다면
   * 연결이 끊긴다. 스펙 버저닝으로 이 문제를 해결하는 건 별도 과제로 남아 있다.
   *
   * @throws {FormNotFoundException} 해당 id의 폼이 없을 때
   */
  async update(formId: string, dto: UpdateFormRequestDto): Promise<void> {
    const form = await this.formStore.findById(formId);
    if (!form) throw new FormNotFoundException();

    const { dynamicForm, ...meta } = dto;
    Object.assign(form, meta satisfies UpdatableFormFields);

    const fields = dynamicForm.map((field) => this.toFieldEntity(field));

    await this.formStore.updateWithFields(form, fields);
    this.logger.log(
      `폼 수정 완료: formId=${formId}, 필드 ${fields.length}개로 교체`,
    );
  }

  /**
   * 폼을 삭제한다. 딸린 입력 필드는 DB의 FK CASCADE로 함께 지워진다.
   *
   * @throws {FormNotFoundException} 해당 id의 폼이 없을 때
   */
  async delete(formId: string): Promise<void> {
    const form = await this.formStore.findById(formId);
    if (!form) throw new FormNotFoundException();

    await this.formStore.deleteById(formId);
    this.logger.log(`폼 삭제 완료: formId=${formId}`);
  }

  /**
   * (박람회, 참여자군, 신청방식) 조합으로 폼 하나를 조회한다.
   * 신청 페이지를 그릴 때 쓰는 경로라, 입력 필드와 그 스펙까지 한 번에 담아서 돌려준다.
   *
   * @throws {FormNotFoundException} 조건에 맞는 폼이 없을 때
   */
  async findOne(dto: FindFormRequestDto): Promise<FormResponseDto> {
    const form = await this.formStore.findByExpoAndTypes(
      dto.expoId,
      dto.participationType,
      dto.applicationType,
    );

    if (!form) throw new FormNotFoundException();

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
      participationType: form.participationType,
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
