import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Occupation } from '../common/enums/occupation.enum.js';
import { SurveyQrController } from './survey-qr.controller.js';
import { SurveyQrService } from './survey-qr.service.js';

describe('SurveyQrController', () => {
  let surveyQrService: { findSurvey: Mock; submit: Mock };
  let controller: SurveyQrController;

  beforeEach(() => {
    surveyQrService = { findSurvey: vi.fn(), submit: vi.fn() };
    controller = new SurveyQrController(
      surveyQrService as unknown as SurveyQrService,
    );
  });

  it('QR 토큰으로 설문 조회를 서비스에 위임한다', async () => {
    await controller.findSurvey('qr-1');

    expect(surveyQrService.findSurvey).toHaveBeenCalledWith('qr-1');
  });

  it('QR 토큰과 답변을 그대로 서비스에 넘긴다', async () => {
    const dto = {
      answers: { '1': '좋았습니다' },
      occupation: Occupation.TEACHER,
    };

    await controller.submit('qr-1', dto);

    expect(surveyQrService.submit).toHaveBeenCalledWith('qr-1', dto);
  });
});
