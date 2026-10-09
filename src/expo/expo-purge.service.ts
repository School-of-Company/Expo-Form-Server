import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DeletedExpoStore } from '../deleted-expo/deleted-expo.store.js';
import { FormStore } from '../form/form.store.js';
import { SurveyStore } from '../survey/survey.store.js';

/**
 * 박람회가 삭제될 때 이 서비스가 소유한 데이터를 한 번에 정리한다(v1 `DeleteExpo`).
 *
 * 삭제 기록 → 폼 → 설문(문항·공개 링크 답변·답변 접수 기록 포함) 순서로 한 트랜잭션에서 지운다. 박람회
 * 서비스는 이 호출이 성공한 뒤에만 자기 박람회 행을 지우므로, 중간에 실패하면 전부 되돌아가 다시 불러도
 * 안전해야 한다. 이미 삭제됐거나 데이터가 없어도 성공한다.
 *
 * 삭제 기록은 가장 먼저 남긴다. 같은 박람회의 폼·설문 생성이 같은 잠금을 쓰므로(`DeletedExpoStore`),
 * 삭제와 겹친 생성은 삭제가 끝난 뒤 거절되거나 삭제가 새 데이터까지 함께 지운다.
 */
@Injectable()
export class ExpoPurgeService {
  private readonly logger = new Logger(ExpoPurgeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly deletedExpoStore: DeletedExpoStore,
    private readonly formStore: FormStore,
    private readonly surveyStore: SurveyStore,
  ) {}

  async purge(expoId: string): Promise<void> {
    const { forms, surveys } = await this.dataSource.transaction(
      async (manager) => {
        await this.deletedExpoStore.markDeleted(manager, expoId);

        return {
          forms: await this.formStore.deleteByExpoId(expoId, manager),
          surveys: await this.surveyStore.deleteByExpoId(expoId, manager),
        };
      },
    );

    this.logger.log(
      `박람회 데이터 삭제: expoId=${expoId}, 폼 ${forms}개, 설문 ${surveys}개`,
    );
  }
}
