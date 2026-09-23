import { Module } from '@nestjs/common';
import { EXPO_CLIENT } from './expo-client.interface.js';

/**
 * 박람회 서비스가 아직 코드로 존재하지 않아 실제 구현체가 없다.
 * 주입 자체는 되도록 토큰만 먼저 등록해두고, 실제로 호출되면 바로 에러가 나도록 한다.
 */
@Module({
  providers: [
    {
      provide: EXPO_CLIENT,
      useFactory: () => {
        throw new Error(
          'ExpoClient is not implemented. 박람회 서비스 연동 후 구현체를 등록하세요.',
        );
      },
    },
  ],
  exports: [EXPO_CLIENT],
})
export class ExpoClientModule {}
