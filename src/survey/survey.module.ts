import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserClientModule } from '../user-client/user-client.module.js';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyAnswerController } from './survey-answer.controller.js';
import { SurveyAnswerService } from './survey-answer.service.js';
import { SurveyController } from './survey.controller.js';
import { SurveyService } from './survey.service.js';
import { SurveyStore } from './survey.store.js';

/** survey 도메인(설문 정의 + 문항 + 답변 제출) 모듈. */
@Module({
  imports: [
    TypeOrmModule.forFeature([SurveyEntity, DynamicSurveyEntity]),
    UserClientModule,
  ],
  controllers: [SurveyController, SurveyAnswerController],
  providers: [SurveyService, SurveyStore, SurveyAnswerService],
})
export class SurveyModule {}
