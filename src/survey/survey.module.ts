import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserClientModule } from '../user-client/user-client.module.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyAnswerController } from './survey-answer.controller.js';
import { SurveyAnswerRelayService } from './survey-answer-relay.service.js';
import { SurveyAnswerResultConsumer } from './survey-answer-result.consumer.js';
import { SurveyAnswerService } from './survey-answer.service.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';
import { SurveyController } from './survey.controller.js';
import { SurveyService } from './survey.service.js';
import { SurveyStore } from './survey.store.js';

/** survey 도메인(설문 정의 + 문항 + 답변 제출) 모듈. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SurveyEntity,
      DynamicSurveyEntity,
      SurveyAnswerSubmissionEntity,
    ]),
    UserClientModule,
  ],
  controllers: [SurveyController, SurveyAnswerController],
  providers: [
    SurveyService,
    SurveyStore,
    SurveyAnswerService,
    SurveyAnswerSubmissionStore,
    SurveyAnswerRelayService,
    SurveyAnswerResultConsumer,
  ],
})
export class SurveyModule {}
