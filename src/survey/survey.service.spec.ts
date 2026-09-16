import { describe, expect, it } from 'vitest';
import { SurveyService } from './survey.service.js';

describe('SurveyService', () => {
  it('의존성 없이 생성된다', () => {
    expect(new SurveyService()).toBeInstanceOf(SurveyService);
  });
});
