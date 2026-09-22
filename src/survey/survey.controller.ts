import { Controller } from '@nestjs/common';
import { SurveyService } from './survey.service.js';

/** `/v1/surveys` HTTP 엔트리포인트. 라우트는 아직 미구현. */
@Controller('v1/surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}
}
