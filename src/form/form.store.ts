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
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import { allocateFieldIds } from '../database/dynamic-field-ids.js';
import { isOccupationOpenAtInPeriod } from './dto/create-form.request.dto.js';
import {
  matchExistingIds,
  toStoredField,
  type DynamicFormField,
  type NewDynamicFormField,
} from './dynamic-form-field.js';
import { ApplicationType } from './entities/application-type.enum.js';
import { FormPurpose } from './entities/form-purpose.enum.js';
import { FormEntity } from './entities/form.entity.js';

/** 입력 필드 배열(`fields`)만 뺀 폼 행 컬럼. 필드가 필요 없는 목록 조회가 배열을 읽지 않게 한다. */
const HEADER_COLUMNS = {
  id: true,
  purpose: true,
  version: true,
  title: true,
  informationText: true,
  participationType: true,
  applicationType: true,
  startDate: true,
  endDate: true,
  occupationOpenAt: true,
  expoId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies FindOptionsSelect<FormEntity>;

/** {@link FormStore.updateProgramWithFields}의 결과. */
export type ProgramFormUpdateResult =
  | { status: 'UPDATED'; version: number }
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT' }
  | { status: 'PERIOD_SHRUNK' };

export type FormUpdateResult = 'UPDATED' | 'NOT_FOUND' | 'OUT_OF_PERIOD';

/**
 * 폼 영속성 접근을 한 곳에 모아둔 store.
 *
 * 서비스가 TypeORM을 직접 만지지 않게 하는 게 이 프로젝트 규칙이다 — 쿼리 방식이나 ORM이
 * 바뀌어도 서비스 코드가 흔들리지 않고, 서비스 단위 테스트에서 이 클래스만 mock하면 된다.
 */
@Injectable()
export class FormStore {
  constructor(
    @InjectRepository(FormEntity)
    private readonly forms: Repository<FormEntity>,
    private readonly dataSource: DataSource,
    private readonly deletedExpos: DeletedExpoStore,
  ) {}

  /**
   * 폼을 유일하게 식별하는 (박람회, 참여자군, 신청방식) 조합으로 조회한다.
   * 신청 페이지는 formId를 모르고 이 세 값만 알기 때문에 이 경로가 따로 필요하다.
   */
  async findByExpoAndTypes(
    expoId: string,
    participationType: ParticipationType,
    applicationType: ApplicationType,
  ): Promise<FormEntity | null> {
    return this.forms.findOne({
      where: {
        expoId,
        participationType,
        applicationType,
        purpose: FormPurpose.REGISTRATION,
      },
    });
  }

  /**
   * 같은 조합의 폼이 이미 있는지만 확인한다.
   * 중복 검사에는 엔티티 본문이 필요 없어서, 필드까지 끌고 오는 조회 대신 이쪽을 쓴다.
   */
  async existsByExpoAndTypes(
    expoId: string,
    participationType: ParticipationType,
    applicationType: ApplicationType,
  ): Promise<boolean> {
    return this.forms.existsBy({
      expoId,
      participationType,
      applicationType,
      purpose: FormPurpose.REGISTRATION,
    });
  }

  /**
   * 폼과 입력 필드를 함께 저장한다. 새 필드의 id는 {@link allocateFieldIds}로 받아 작성 순서대로 붙인다.
   *
   * 삭제된 박람회에는 저장하지 않는다. 박람회 삭제와 같은 잠금 안에서 확인하고 저장하므로, 삭제가
   * 끝나는 순간 폼이 새로 생기는 일이 없다.
   *
   * @throws {ExpoDeletedException} 삭제된 박람회일 때
   */
  async save(
    form: FormEntity,
    fields: NewDynamicFormField[],
  ): Promise<FormEntity> {
    return this.dataSource.transaction(async (manager) => {
      await this.deletedExpos.lockAndAssertNotDeleted(manager, form.expoId);

      form.dynamicForms = await this.withIds(manager, fields, []);
      return manager.save(FormEntity, form);
    });
  }

  /**
   * 폼 메타를 갱신하면서 입력 필드를 통째로 교체한다. 기존 필드와 짝이 맞는 필드는 그 id를 유지하고
   * ({@link matchExistingIds}), 나머지만 새 id를 받는다.
   *
   * 폼을 읽은 뒤 그 폼이 삭제됐다면 아래 `save`가 지워진 폼을 다시 INSERT해 버린다. 그래서 박람회
   * 삭제와 같은 잠금 안에서 삭제 기록을 확인하고, 폼 row를 잠가 아직 있는지 확인한 뒤에만 바꾼다.
   *
   * @param form 조회해온 폼 엔티티(메타데이터는 이미 갱신된 상태)
   * `keepOccupationOpenAt`이면 오픈 시각은 잠근 뒤 읽은 현재 값을 유지하고, 그 값이 새 접수 기간 안인지 다시 본다.
   * 조회한 뒤 다른 요청이 오픈 시각을 바꿨을 수 있어서다.
   *
   * @param fields 이 폼의 입력 필드를 전부 대체할 새 필드들
   * @param keepOccupationOpenAt 요청이 오픈 시각을 생략했는지
   * @returns 갱신했으면 `UPDATED`, 그 사이 폼이 삭제됐으면 `NOT_FOUND`, 유지한 오픈 시각이 기간 밖이면 `OUT_OF_PERIOD`
   * @throws {ExpoDeletedException} 삭제된 박람회일 때
   */
  async updateWithFields(
    form: FormEntity,
    fields: NewDynamicFormField[],
    keepOccupationOpenAt = false,
  ): Promise<FormUpdateResult> {
    return this.dataSource.transaction(async (manager) => {
      await this.deletedExpos.lockAndAssertNotDeleted(manager, form.expoId);

      const locked = await manager.findOne(FormEntity, {
        where: { id: form.id },
        select: {
          id: true,
          version: true,
          occupationOpenAt: true,
          dynamicForms: true,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        return 'NOT_FOUND';
      }

      if (keepOccupationOpenAt) {
        form.occupationOpenAt = locked.occupationOpenAt;
        if (!isOccupationOpenAtInPeriod(form, form.occupationOpenAt)) {
          return 'OUT_OF_PERIOD';
        }
      }

      // 폼을 읽은 뒤 다른 요청이 먼저 고쳤다면 `form.version`은 낡은 값이다. 그대로 저장한 뒤 +1 하면
      // 버전이 거꾸로 가므로, 잠근 뒤 읽은 현재 값으로 맞춘 다음 올린다.
      form.version = locked.version;
      form.dynamicForms = await this.withIds(
        manager,
        fields,
        locked.dynamicForms,
      );
      await manager.save(FormEntity, form);
      await manager.increment(FormEntity, { id: form.id }, 'version', 1);

      return 'UPDATED';
    });
  }

  /** formId로 프로그램용 폼 하나를 입력 필드까지 담아 조회한다. 등록용 폼의 id로는 찾지 못한다. */
  async findProgramById(id: string): Promise<FormEntity | null> {
    return this.forms.findOne({
      where: { id, purpose: FormPurpose.PROGRAM },
    });
  }

  /** 박람회의 프로그램용 폼을 생성순으로 모두 조회한다. 입력 필드는 불러오지 않는다. */
  async findProgramsByExpoId(expoId: string): Promise<FormEntity[]> {
    return this.forms.find({
      select: HEADER_COLUMNS,
      where: { expoId, purpose: FormPurpose.PROGRAM },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  /**
   * 프로그램용 폼 메타를 갱신하면서 입력 필드를 통째로 교체한다. 폼 row를 잠근 뒤 `expectedVersion`이
   * 현재 버전과 같을 때만 바꾸고, 바꾸면 버전을 1 올린다.
   *
   * 읽어온 엔티티의 `version`은 읽은 뒤 다른 요청이 바꿨을 수 있어 낡은 값일 수 있다. 그대로 저장하면
   * 버전이 거꾸로 가므로 잠근 뒤에 읽은 현재 값으로 맞춰서 저장한다.
   *
   * @param form 조회해온 폼 엔티티(메타데이터는 이미 갱신된 상태)
   * @param expectedVersion 수정할 때 기준으로 삼은 버전
   * @param fields 이 폼의 입력 필드를 전부 대체할 새 필드들
   * @returns 갱신했으면 새 버전, 그 사이 삭제됐으면 `NOT_FOUND`, 버전이 다르면 `CONFLICT`, 현재 기간보다 줄면 `PERIOD_SHRUNK`
   * @throws {ExpoDeletedException} 삭제된 박람회일 때
   */
  async updateProgramWithFields(
    form: FormEntity,
    expectedVersion: number,
    fields: NewDynamicFormField[],
  ): Promise<ProgramFormUpdateResult> {
    return this.dataSource.transaction(async (manager) => {
      await this.deletedExpos.lockAndAssertNotDeleted(manager, form.expoId);

      const locked = await manager.findOne(FormEntity, {
        where: { id: form.id, purpose: FormPurpose.PROGRAM },
        select: {
          id: true,
          version: true,
          startDate: true,
          endDate: true,
          dynamicForms: true,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        return { status: 'NOT_FOUND' };
      }

      if (locked.version !== expectedVersion) {
        return { status: 'CONFLICT' };
      }

      // 서비스의 사전 검사는 잠그기 전에 읽은 기간과 비교한다. 그 사이 다른 수정이 기간을 바꿨을 수 있어 다시 본다.
      if (form.startDate > locked.startDate || form.endDate < locked.endDate) {
        return { status: 'PERIOD_SHRUNK' };
      }

      form.version = locked.version;
      form.dynamicForms = await this.withIds(
        manager,
        fields,
        locked.dynamicForms,
      );
      await manager.save(FormEntity, form);
      await manager.increment(FormEntity, { id: form.id }, 'version', 1);

      return { status: 'UPDATED', version: locked.version + 1 };
    });
  }

  /** 기존 필드와 짝이 맞으면 그 id를, 아니면 `dynamic_form_id_seq`에서 받은 id를 작성 순서대로 붙인다. */
  private async withIds(
    manager: EntityManager,
    fields: NewDynamicFormField[],
    current: DynamicFormField[],
  ) {
    const kept = matchExistingIds(fields, current);
    const fresh = await allocateFieldIds(
      manager,
      'dynamic_form_id_seq',
      kept.filter((id) => id === undefined).length,
    );
    return fields.map((field, index) =>
      toStoredField(field, kept[index] ?? fresh.shift()!),
    );
  }

  /** 폼을 삭제한다. 입력 필드는 폼 행 안(`fields`)에 있어 함께 지워진다. */
  async deleteById(id: string): Promise<void> {
    await this.forms.delete({ id });
  }

  /** 여러 박람회의 폼을 식별 값만 골라 조회한다. 입력 필드는 끌고 오지 않는다. */
  async findSummariesByExpoIds(
    expoIds: string[],
  ): Promise<
    Array<Pick<FormEntity, 'expoId' | 'participationType' | 'applicationType'>>
  > {
    return this.forms.find({
      select: { expoId: true, participationType: true, applicationType: true },
      where: { expoId: In(expoIds), purpose: FormPurpose.REGISTRATION },
    });
  }

  /**
   * 박람회의 폼을 모두 삭제하고 지운 개수를 돌려준다. 입력 필드는 폼 행 안에 있어 함께 지워진다.
   * 박람회 삭제 트랜잭션(`ExpoPurgeService`) 안에서 부르므로 그 트랜잭션의 `manager`로 지운다.
   */
  async deleteByExpoId(
    expoId: string,
    manager: EntityManager,
  ): Promise<number> {
    const result = await manager.delete(FormEntity, { expoId });
    return result.affected ?? 0;
  }
}
