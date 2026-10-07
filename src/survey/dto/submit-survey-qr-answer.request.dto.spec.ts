import { describe, expect, it } from 'vitest';
import { Occupation } from '../../common/enums/occupation.enum.js';
import { submitSurveyQrAnswerSchema } from './submit-survey-qr-answer.request.dto.js';

describe('submitSurveyQrAnswerSchema', () => {
  const answers = { '1': '좋았습니다' };

  it('답변과 직업을 받는다', () => {
    expect(
      submitSurveyQrAnswerSchema.safeParse({
        answers,
        occupation: Occupation.MIDDLE_SCHOOL_STUDENT,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['직업이 없으면', { answers }],
    ['직업이 enum 값이 아니면', { answers, occupation: '중학생' }],
  ])('%s 거부한다', (_label, body) => {
    expect(submitSurveyQrAnswerSchema.safeParse(body).success).toBe(false);
  });
});
