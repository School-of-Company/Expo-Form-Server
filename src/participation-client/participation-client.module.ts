import { Module } from '@nestjs/common';
import {
  PARTICIPATION_CLIENT,
  type ParticipationClient,
} from './participation-client.interface.js';

/**
 * 참여 서비스가 아직 코드로 존재하지 않아 실제 구현체가 없다.
 * `useFactory`로 즉시 던지면 이 모듈을 import하는 순간 앱 부트스트랩 자체가 죽는다 —
 * 그 대신 메서드 호출 시점에만 에러가 나는 객체를 `useValue`로 등록해둔다
 * (`UserClientModule`과 같은 방식).
 */
const notImplementedParticipationClient: ParticipationClient = {
  async findEnteredToken() {
    throw new Error(
      'ParticipationClient is not implemented. 참여 서비스 연동 후 구현체를 등록하세요.',
    );
  },
};

@Module({
  providers: [
    {
      provide: PARTICIPATION_CLIENT,
      useValue: notImplementedParticipationClient,
    },
  ],
  exports: [PARTICIPATION_CLIENT],
})
export class ParticipationClientModule {}
