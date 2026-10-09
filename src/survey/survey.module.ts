import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletedExpoModule } from '../deleted-expo/deleted-expo.module.js';
import { ExpoClientModule } from '../expo-client/expo-client.module.js';
import { UserClientModule } from '../user-client/user-client.module.js';
import { InternalSurveyController } from './internal-survey.controller.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyDrawResultEntity } from './entities/survey-draw-result.entity.js';
import { SurveyPublicAnswerEntity } from './entities/survey-public-answer.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyAnswerController } from './survey-answer.controller.js';
import { SurveyAnswerReconcileService } from './survey-answer-reconcile.service.js';
import { SurveyAnswerRelayService } from './survey-answer-relay.service.js';
import { SurveyAnswerResultConsumer } from './survey-answer-result.consumer.js';
import { SurveyAnswerService } from './survey-answer.service.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';
import { SurveyDrawResultRelayService } from './survey-draw-result-relay.service.js';
import { SurveyDrawResultStore } from './survey-draw-result.store.js';
import { SurveyLotteryController } from './survey-lottery.controller.js';
import { SurveyLotteryService } from './survey-lottery.service.js';
import { SurveyPublicController } from './survey-public.controller.js';
import { SurveyPublicService } from './survey-public.service.js';
import { SurveyPublicAnswerStore } from './survey-public-answer.store.js';
import { SurveyController } from './survey.controller.js';
import { SurveyService } from './survey.service.js';
import { SurveyStore } from './survey.store.js';

/** survey 도메인(설문 정의 + 문항 + 답변 제출 + 공개 링크 응답 + 경품 추첨) 모듈. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SurveyEntity,
      DynamicSurveyEntity,
      SurveyAnswerSubmissionEntity,
      SurveyPublicAnswerEntity,
      SurveyDrawResultEntity,
    ]),
    DeletedExpoModule,
    ExpoClientModule,
    UserClientModule,
  ],
  controllers: [
    SurveyController,
    SurveyAnswerController,
    SurveyPublicController,
    SurveyLotteryController,
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
    SurveyPublicService,
    SurveyLotteryService,
    SurveyDrawResultStore,
    SurveyDrawResultRelayService,
    SurveyPublicAnswerStore,
  ],
  exports: [SurveyStore],
})
export class SurveyModule {}
