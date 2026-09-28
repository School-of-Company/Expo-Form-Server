import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DynamicSurveyEntity } from './entities/dynamic-survey.entity.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyController } from './survey.controller.js';
import { SurveyService } from './survey.service.js';
import { SurveyStore } from './survey.store.js';

/** survey 도메인(설문 정의 + 문항) 모듈. */
@Module({
  imports: [TypeOrmModule.forFeature([SurveyEntity, DynamicSurveyEntity])],
  controllers: [SurveyController],
  providers: [SurveyService, SurveyStore],
})
export class SurveyModule {}
