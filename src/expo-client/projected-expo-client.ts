import { Logger } from '@nestjs/common';
import { ProjectionMissLogger } from '../common/projection/projection-miss-logger.js';
import type { ExpoProjectionStore } from '../expo-projection/expo-projection.store.js';
import type { ExpoClient, ExpoPeriod } from './expo-client.interface.js';

/**
 * 박람회 조회(`exists`, `findPeriod`)를 `expo.expo.changed`로 채운 로컬 프로젝션에서 읽는 {@link ExpoClient}.
 *
 * 프로젝션에 아직 없는 박람회(미스)는 원래 클라이언트로 동기 조회한다 — 첫 재발행(republish) 전에 켜도
 * 안전하다. 지워진 박람회(tombstone)는 박람회 서비스의 404와 같게 답한다. 프로그램용 폼 변경 예약·해제는
 * 박람회 서비스 상태를 바꾸는 호출이라 그대로 원래 클라이언트로 보낸다.
 * `KAFKA_EXPO_PROJECTION_ENABLED=true`일 때만 쓴다(`ExpoClientModule`).
 */
export class ProjectedExpoClient implements ExpoClient {
  private readonly logger = new Logger(ProjectedExpoClient.name);
  private readonly misses = new ProjectionMissLogger(this.logger);

  constructor(
    private readonly delegate: ExpoClient,
    private readonly store: ExpoProjectionStore,
  ) {}

  async exists(expoId: string): Promise<boolean> {
    const found = await this.store.find(expoId);
    if (found.state === 'miss') {
      this.logMiss(expoId);
      return this.delegate.exists(expoId);
    }

    return found.state === 'present';
  }

  async findPeriod(expoId: string): Promise<ExpoPeriod | null> {
    const found = await this.store.find(expoId);
    if (found.state === 'miss') {
      this.logMiss(expoId);
      return this.delegate.findPeriod(expoId);
    }

    return found.state === 'present' ? found.period : null;
  }

  async reserveProgramFormUpdate(
    formId: string,
    changeId: string,
  ): Promise<void> {
    return this.delegate.reserveProgramFormUpdate(formId, changeId);
  }

  async releaseProgramFormChange(
    formId: string,
    changeId: string,
  ): Promise<void> {
    return this.delegate.releaseProgramFormChange(formId, changeId);
  }

  private logMiss(expoId: string): void {
    this.misses.record(
      expoId,
      `박람회 프로젝션에 없어 박람회 서비스로 조회합니다: expoId=${expoId}`,
    );
  }
}
