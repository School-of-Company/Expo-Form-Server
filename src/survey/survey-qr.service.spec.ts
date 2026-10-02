import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  SurveyAnswerAlreadyExistsException,
  SurveyAnswerInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyQrService } from './survey-qr.service.js';
import { SurveyStore } from './survey.store.js';

const expoId = '11111111-1111-1111-1111-111111111111';

const survey = {
  id: 'survey-1',
  expoId,
  participationType: ParticipationType.STANDARD,
  dynamicSurveys: [
    {
      id: 1,
      formType: DynamicFormFieldType.SENTENCE,
      requiredStatus: true,
      jsonData: {},
      otherJson: null,
    },
  ],
} as unknown as SurveyEntity;

const answerDto = { answers: { '1': '좋았습니다' } };

describe('SurveyQrService', () => {
  let surveyStore: {
    findByExpoAndType: Mock;
    saveQrTokens: Mock;
    findQrToken: Mock;
    submitQrAnswer: Mock;
  };
  let service: SurveyQrService;

  beforeEach(() => {
    surveyStore = {
      findByExpoAndType: vi.fn(),
      saveQrTokens: vi.fn(),
      findQrToken: vi.fn(),
      submitQrAnswer: vi.fn(),
    };
    surveyStore.findQrToken.mockResolvedValue({
      token: 'qr-1',
      survey,
      submittedAt: null,
    });
    service = new SurveyQrService(surveyStore as unknown as SurveyStore);
  });

  describe('issueTokens', () => {
    it('일반 참가자 설문이 없으면 404', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue(null);

      await expect(service.issueTokens(expoId, { count: 3 })).rejects.toThrow(
        SurveyNotFoundException,
      );
      expect(surveyStore.findByExpoAndType).toHaveBeenCalledWith(
        expoId,
        ParticipationType.STANDARD,
      );
    });

    it('요청한 개수만큼 서로 다른 토큰을 저장하고 돌려준다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue(survey);

      const { tokens } = await service.issueTokens(expoId, { count: 3 });

      expect(new Set(tokens).size).toBe(3);
      expect(surveyStore.saveQrTokens).toHaveBeenCalledWith('survey-1', tokens);
    });
  });

  describe('findSurvey', () => {
    it('없는 토큰이면 404', async () => {
      surveyStore.findQrToken.mockResolvedValue(null);

      await expect(service.findSurvey('qr-1')).rejects.toThrow(
        SurveyNotFoundException,
      );
    });

    it('이미 쓴 토큰이면 설문을 보여 주기 전에 409', async () => {
      surveyStore.findQrToken.mockResolvedValue({
        survey,
        submittedAt: new Date(),
      });

      await expect(service.findSurvey('qr-1')).rejects.toThrow(
        SurveyAnswerAlreadyExistsException,
      );
    });
  });

  describe('submit', () => {
    it('없는 토큰이면 404', async () => {
      surveyStore.findQrToken.mockResolvedValue(null);

      await expect(service.submit('qr-1', answerDto)).rejects.toThrow(
        SurveyNotFoundException,
      );
    });

    it('문항 스펙과 맞지 않으면 저장하지 않는다', async () => {
      await expect(service.submit('qr-1', { answers: {} })).rejects.toThrow(
        SurveyAnswerInvalidException,
      );
      expect(surveyStore.submitQrAnswer).not.toHaveBeenCalled();
    });

    it('조건부 갱신이 실패하면(이미 쓴 토큰) 409', async () => {
      surveyStore.submitQrAnswer.mockResolvedValue(false);

      await expect(service.submit('qr-1', answerDto)).rejects.toThrow(
        SurveyAnswerAlreadyExistsException,
      );
    });

    it('검증된 답변을 토큰에 기록한다', async () => {
      surveyStore.submitQrAnswer.mockResolvedValue(true);

      await service.submit('qr-1', answerDto);

      expect(surveyStore.submitQrAnswer).toHaveBeenCalledWith(
        'qr-1',
        'survey-1',
        { '1': '좋았습니다' },
      );
    });
  });
});
