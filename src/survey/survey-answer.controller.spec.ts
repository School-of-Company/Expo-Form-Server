import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SurveyAnswerController } from './survey-answer.controller.js';
import { SurveyAnswerService } from './survey-answer.service.js';

describe('SurveyAnswerController', () => {
  let surveyAnswerService: { submit: Mock };
  let controller: SurveyAnswerController;

  beforeEach(() => {
    surveyAnswerService = { submit: vi.fn() };
    controller = new SurveyAnswerController(
      surveyAnswerService as unknown as SurveyAnswerService,
    );
  });

  it('제출 요청에 경로의 surveyId와 바디를 함께 넘긴다', async () => {
    const dto = {
      phoneNumber: '010-1234-5678',
      personalInformationStatus: true,
      answers: { '1': '좋았습니다' },
    } as never;

    await controller.submit('survey-1', dto);

    expect(surveyAnswerService.submit).toHaveBeenCalledWith('survey-1', dto);
  });
});
