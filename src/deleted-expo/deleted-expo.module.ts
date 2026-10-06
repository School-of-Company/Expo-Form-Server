import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletedExpoStore } from './deleted-expo.store.js';
import { DeletedExpoEntity } from './entities/deleted-expo.entity.js';

/**
 * 삭제된 박람회 기록 모듈. 폼·설문 모듈이 생성 경로에서 이 기록을 확인하고, 삭제 모듈(`ExpoModule`)이
 * 기록을 남긴다. 어느 쪽도 이 모듈에 의존하게 해서 모듈 사이에 순환이 생기지 않게 한다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DeletedExpoEntity])],
  providers: [DeletedExpoStore],
  exports: [DeletedExpoStore],
})
export class DeletedExpoModule {}
