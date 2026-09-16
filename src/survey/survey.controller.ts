import { Controller } from '@nestjs/common';
import { SurveyService } from './survey.service.js';

@Controller('v1/surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}
}
