import { describe, expect, it } from 'vitest';
import { SurveyController } from './survey.controller.js';
import { SurveyService } from './survey.service.js';

describe('SurveyController', () => {
  it('SurveyService를 주입받아 생성된다', () => {
    const service = {} as SurveyService;

    expect(new SurveyController(service)).toBeInstanceOf(SurveyController);
  });
});
