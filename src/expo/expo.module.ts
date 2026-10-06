import { Module } from '@nestjs/common';
import { DeletedExpoModule } from '../deleted-expo/deleted-expo.module.js';
import { FormModule } from '../form/form.module.js';
import { SurveyModule } from '../survey/survey.module.js';
import { ExpoPurgeService } from './expo-purge.service.js';
import { InternalExpoController } from './internal-expo.controller.js';

/** 박람회 단위로 이 서비스의 데이터를 다루는 모듈(지금은 삭제만). 폼·설문 모듈을 가져다 쓴다. */
@Module({
  imports: [DeletedExpoModule, FormModule, SurveyModule],
  controllers: [InternalExpoController],
  providers: [ExpoPurgeService],
})
export class ExpoModule {}
