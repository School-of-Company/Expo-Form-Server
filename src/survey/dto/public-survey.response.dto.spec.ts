import { describe, expect, it } from 'vitest';
import type { SurveyEntity } from '../entities/survey.entity.js';
import { toPublicSurveyResponse } from './public-survey.response.dto.js';

describe('toPublicSurveyResponse', () => {
  it('누적 응답 수를 싣지 않고 추첨 여부는 싣는다', () => {
    const response = toPublicSurveyResponse({
      id: '3f9d2c1e-0000-4000-8000-000000000001',
      expoId: '3f9d2c1e-0000-4000-8000-000000000002',
      title: 't',
      informationText: 'i',
      participationType: 'STANDARD',
      totalAnswers: 99,
      lotteryEnabled: true,
      dynamicSurveys: [],
    } as unknown as SurveyEntity);

    expect(response).not.toHaveProperty('totalAnswers');
    expect(response.lotteryEnabled).toBe(true);
  });
});
