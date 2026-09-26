import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { DynamicFormEntity } from './entities/dynamic-form.entity.js';
import { ApplicationType } from './entities/application-type.enum.js';
import { FormEntity } from './entities/form.entity.js';

/**
 * 필드 순서는 별도 컬럼 없이 삽입 순서(= auto-increment PK 오름차순)로 유지한다.
 * 명시하지 않으면 DB가 임의 순서로 돌려줄 수 있어서, 조회마다 이 정렬을 붙인다.
 */
const DYNAMIC_FORM_ORDER = { dynamicForms: { id: 'ASC' } } as const;

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
  ) {}

  /** id로 폼 하나를 입력 필드까지 함께 조회한다. 없으면 null. */
  findById(id: string): Promise<FormEntity | null> {
    return this.forms.findOne({
      where: { id },
      relations: { dynamicForms: true },
      order: DYNAMIC_FORM_ORDER,
    });
  }

  /**
   * 폼을 유일하게 식별하는 (박람회, 참여자군, 신청방식) 조합으로 조회한다.
   * 신청 페이지는 formId를 모르고 이 세 값만 알기 때문에 이 경로가 따로 필요하다.
   */
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

  /**
   * 같은 조합의 폼이 이미 있는지만 확인한다.
   * 중복 검사에는 엔티티 본문이 필요 없어서, 필드까지 끌고 오는 조회 대신 이쪽을 쓴다.
   */
  existsByExpoAndTypes(
    expoId: string,
    participationType: ParticipationType,
    applicationType: ApplicationType,
  ): Promise<boolean> {
    return this.forms.existsBy({ expoId, participationType, applicationType });
  }

  /**
   * 폼과 입력 필드를 함께 저장한다.
   * `dynamicForms` 관계에 cascade가 걸려 있어서, 자식 필드도 이 한 번의 호출로 같이 들어간다.
   */
  save(form: FormEntity): Promise<FormEntity> {
    return this.forms.save(form);
  }

  /**
   * 폼 메타를 갱신하면서 입력 필드를 통째로 교체한다.
   *
   * 삭제와 재삽입 사이에 다른 요청이 폼을 조회하면 필드가 하나도 없는 상태를 보게 되므로,
   * 두 작업을 한 트랜잭션으로 묶는다.
   *
   * @param form 조회해온 폼 엔티티(메타데이터는 이미 갱신된 상태)
   * @param fields 이 폼의 입력 필드를 전부 대체할 새 필드들
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

  /** 폼을 삭제한다. 딸린 입력 필드는 FK의 `ON DELETE CASCADE`로 DB가 알아서 지운다. */
  async deleteById(id: string): Promise<void> {
    await this.forms.delete({ id });
  }
}
