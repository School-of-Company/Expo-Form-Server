import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { DynamicFormEntity } from './entities/dynamic-form.entity.js';
import { ApplicationType } from './entities/application-type.enum.js';
import { FormEntity } from './entities/form.entity.js';

/** 필드 순서는 별도 컬럼 없이 삽입 순서(=PK 오름차순)로 유지한다. */
const DYNAMIC_FORM_ORDER = { dynamicForms: { id: 'ASC' } } as const;

@Injectable()
export class FormStore {
  constructor(
    @InjectRepository(FormEntity)
    private readonly forms: Repository<FormEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findById(id: string): Promise<FormEntity | null> {
    return this.forms.findOne({
      where: { id },
      relations: { dynamicForms: true },
      order: DYNAMIC_FORM_ORDER,
    });
  }

  findByExpoAndTypes(
    expoId: string,
    participationType: ParticipationType,
    applicationType: ApplicationType,
  ): Promise<FormEntity | null> {
    return this.forms.findOne({
      where: { expoId, participationType, applicationType },
      relations: { dynamicForms: true },
      order: DYNAMIC_FORM_ORDER,
    });
  }

  existsByExpoAndTypes(
    expoId: string,
    participationType: ParticipationType,
    applicationType: ApplicationType,
  ): Promise<boolean> {
    return this.forms.existsBy({ expoId, participationType, applicationType });
  }

  /** 폼과 필드를 함께 저장한다. `dynamicForms`에 cascade가 걸려 있어 한 번에 들어간다. */
  save(form: FormEntity): Promise<FormEntity> {
    return this.forms.save(form);
  }

  /**
   * 폼 메타를 갱신하면서 필드를 통째로 교체한다.
   * 지우고 다시 넣는 사이에 다른 요청이 끼어들지 않도록 한 트랜잭션으로 처리한다.
   */
  async updateWithFields(
    form: FormEntity,
    fields: DynamicFormEntity[],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(DynamicFormEntity, { form: { id: form.id } });

      // 조회해온 form에는 방금 지운 옛 필드들이 매달려 있다. 새 필드로 바꿔놓지 않으면
      // dynamicForms의 cascade가 옛 필드를 그대로 되살려버린다.
      form.dynamicForms = fields;
      await manager.save(FormEntity, form);
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.forms.delete({ id });
  }
}
