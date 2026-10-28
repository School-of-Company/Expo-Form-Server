import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpoProjectionVersionEntity } from './entities/expo-projection-version.entity.js';
import { ExpoProjectionEntity } from './entities/expo-projection.entity.js';
import { ExpoProjectionStore } from './expo-projection.store.js';

/**
 * 박람회 프로젝션 저장소 모듈. 읽는 쪽(`ExpoClientModule`)과 쓰는 쪽(`ExpoChangedConsumerModule`)이 함께 쓴다.
 * 테이블은 기능 플래그와 상관없이 마이그레이션으로 만들어 두고, 플래그가 꺼져 있으면 읽지도 쓰지도 않는다.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExpoProjectionEntity,
      ExpoProjectionVersionEntity,
    ]),
  ],
  providers: [ExpoProjectionStore],
  exports: [ExpoProjectionStore],
})
export class ExpoProjectionModule {}
