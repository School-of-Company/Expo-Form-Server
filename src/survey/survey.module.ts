import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletedExpoModule } from '../deleted-expo/deleted-expo.module.js';
import { ExpoClientModule } from '../expo-client/expo-client.module.js';
import { ParticipationClientModule } from '../participation-client/participation-client.module.js';
import { UserClientModule } from '../user-client/user-client.module.js';
import { InternalSurveyController } from './internal-survey.controller.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyQrAnswerEntity } from './entities/survey-qr-answer.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyAnswerController } from './survey-answer.controller.js';
import { SurveyAnswerReconcileService } from './survey-answer-reconcile.service.js';
import { SurveyAnswerRelayService } from './survey-answer-relay.service.js';
import { SurveyAnswerResultConsumer } from './survey-answer-result.consumer.js';
import { SurveyAnswerService } from './survey-answer.service.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';
import { SurveyPublicController } from './survey-public.controller.js';
import { SurveyPublicService } from './survey-public.service.js';
import { SurveyQrAnswerStore } from './survey-qr-answer.store.js';
import { SurveyQrController } from './survey-qr.controller.js';
import { SurveyQrService } from './survey-qr.service.js';
import { SurveyController } from './survey.controller.js';
import { SurveyService } from './survey.service.js';
import { SurveyStore } from './survey.store.js';

/** survey 도메인(설문 정의 + 문항 + 답변 제출 + 현장 QR·공개 링크 응답) 모듈. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SurveyEntity,
      DynamicSurveyEntity,
      SurveyAnswerSubmissionEntity,
      SurveyQrAnswerEntity,
    ]),
    DeletedExpoModule,
    ExpoClientModule,
    UserClientModule,
    ParticipationClientModule,
  ],
  controllers: [
    SurveyController,
    SurveyAnswerController,
    SurveyQrController,
    SurveyPublicController,
    InternalSurveyController,
  ],
  providers: [
    SurveyService,
    SurveyStore,
    SurveyAnswerService,
    SurveyAnswerSubmissionStore,
    SurveyAnswerRelayService,
    SurveyAnswerResultConsumer,
    SurveyAnswerReconcileService,
    SurveyQrService,
    SurveyPublicService,
    SurveyQrAnswerStore,
  ],
  exports: [SurveyStore],
})
export class SurveyModule {}
