import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { SurveyAnswerController } from './survey-answer.controller.js';
import { SurveyAnswerService } from './survey-answer.service.js';

describe('SurveyAnswerController', () => {
  let surveyAnswerService: { submit: Mock };
  let controller: SurveyAnswerController;

  const dto = {
    phoneNumber: '010-1234-5678',
    personalInformationStatus: true,
    answers: { '1': '좋았습니다' },
  } as never;

  beforeEach(() => {
    surveyAnswerService = { submit: vi.fn() };
    controller = new SurveyAnswerController(
      surveyAnswerService as unknown as SurveyAnswerService,
    );
  });

  it('일반 참가자 제출 요청에 STANDARD를 고정해서 넘긴다', async () => {
    await controller.submitStandard('expo-1', dto);

    expect(surveyAnswerService.submit).toHaveBeenCalledWith(
      'expo-1',
      ParticipationType.STANDARD,
      dto,
    );
  });

  it('교원연수자 제출 요청에 TRAINEE를 고정해서 넘긴다', async () => {
    await controller.submitTrainee('expo-1', dto);

    expect(surveyAnswerService.submit).toHaveBeenCalledWith(
      'expo-1',
      ParticipationType.TRAINEE,
      dto,
    );
  });
});
