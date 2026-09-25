import { Module } from '@nestjs/common';
import { EXPO_CLIENT, type ExpoClient } from './expo-client.interface.js';

/**
 * 박람회 서비스가 아직 코드로 존재하지 않아 실제 구현체가 없다.
 * `useFactory`로 즉시 던지면 이 모듈을 import하는 순간 앱 부트스트랩 자체가 죽는다 —
 * 그 대신 메서드 호출 시점에만 에러가 나는 객체를 `useValue`로 등록해둔다.
 */
const notImplementedExpoClient: ExpoClient = {
  async exists() {
    throw new Error(
      'ExpoClient is not implemented. 박람회 서비스 연동 후 구현체를 등록하세요.',
    );
  },
};

@Module({
  providers: [{ provide: EXPO_CLIENT, useValue: notImplementedExpoClient }],
  exports: [EXPO_CLIENT],
})
export class ExpoClientModule {}
