import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { QueryFailedError } from 'typeorm';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  SurveyAnswerAlreadyExistsException,
  SurveyAnswerInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyQrAnswerStore } from './survey-qr-answer.store.js';
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
  let surveyStore: { findByExpoAndType: Mock };
  let qrAnswerStore: { existsByKey: Mock; create: Mock };
  let participationClient: { findEnteredToken: Mock };
  let service: SurveyQrService;

  beforeEach(() => {
    surveyStore = { findByExpoAndType: vi.fn().mockResolvedValue(survey) };
    qrAnswerStore = {
      existsByKey: vi.fn().mockResolvedValue(false),
      create: vi.fn(),
    };
    participationClient = {
      findEnteredToken: vi.fn().mockResolvedValue({ expoId }),
    };
    service = new SurveyQrService(
      surveyStore as unknown as SurveyStore,
      qrAnswerStore as unknown as SurveyQrAnswerStore,
      participationClient,
    );
  });

  describe('findSurvey', () => {
    it('입장하지 않았거나 없는 토큰이면 404', async () => {
      participationClient.findEnteredToken.mockResolvedValue(null);

      await expect(service.findSurvey('qr-1')).rejects.toThrow(
        SurveyNotFoundException,
      );
      expect(surveyStore.findByExpoAndType).not.toHaveBeenCalled();
    });

    it('참여 서비스가 알려 준 박람회의 일반 참가자 설문을 찾는다', async () => {
      const result = await service.findSurvey('qr-1');

      expect(surveyStore.findByExpoAndType).toHaveBeenCalledWith(
        expoId,
        ParticipationType.STANDARD,
      );
      expect(result.id).toBe('survey-1');
    });

    it('그 박람회에 일반 참가자 설문이 없으면 404', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue(null);

      await expect(service.findSurvey('qr-1')).rejects.toThrow(
        SurveyNotFoundException,
      );
    });

    it('이미 응답한 토큰이면 설문을 보여 주기 전에 409', async () => {
      qrAnswerStore.existsByKey.mockResolvedValue(true);

      await expect(service.findSurvey('qr-1')).rejects.toThrow(
        SurveyAnswerAlreadyExistsException,
      );
      expect(qrAnswerStore.existsByKey).toHaveBeenCalledWith(
        'survey-1',
        'qr-1',
      );
    });
  });

  describe('submit', () => {
    it('입장하지 않았거나 없는 토큰이면 404', async () => {
      participationClient.findEnteredToken.mockResolvedValue(null);

      await expect(service.submit('qr-1', answerDto)).rejects.toThrow(
        SurveyNotFoundException,
      );
      expect(qrAnswerStore.create).not.toHaveBeenCalled();
    });

    it('문항 스펙과 맞지 않으면 저장하지 않는다', async () => {
      await expect(service.submit('qr-1', { answers: {} })).rejects.toThrow(
        SurveyAnswerInvalidException,
      );
      expect(qrAnswerStore.create).not.toHaveBeenCalled();
    });

    it('같은 토큰의 동시 제출이 유니크 위반에 걸리면 409로 변환한다', async () => {
      qrAnswerStore.create.mockRejectedValue(
        new QueryFailedError('INSERT', [], { code: '23505' } as never),
      );

      await expect(service.submit('qr-1', answerDto)).rejects.toThrow(
        SurveyAnswerAlreadyExistsException,
      );
    });

    it('저장 전에 박람회 삭제로 설문이 지워져 외래 키 위반이 나면 404로 변환한다', async () => {
      qrAnswerStore.create.mockRejectedValue(
        new QueryFailedError('INSERT', [], { code: '23503' } as never),
      );

      await expect(service.submit('qr-1', answerDto)).rejects.toThrow(
        SurveyNotFoundException,
      );
    });

    it('유니크·외래 키 위반이 아닌 오류는 그대로 전파한다', async () => {
      qrAnswerStore.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.submit('qr-1', answerDto)).rejects.toThrow(
        'connection lost',
      );
    });

    it('검증된 답변을 토큰 키로 저장한다', async () => {
      await service.submit('qr-1', answerDto);

      expect(qrAnswerStore.create).toHaveBeenCalledWith('survey-1', 'qr-1', {
        '1': '좋았습니다',
      });
    });
  });
});
