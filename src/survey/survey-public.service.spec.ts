import { QueryFailedError } from 'typeorm';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { Occupation } from '../common/enums/occupation.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  SurveyAnswerInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyPublicService } from './survey-public.service.js';
import { SurveyQrAnswerStore } from './survey-qr-answer.store.js';
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

const answerDto = {
  answers: { '1': '좋았습니다' },
  occupation: Occupation.ELEMENTARY_STUDENT,
};

describe('SurveyPublicService', () => {
  let surveyStore: { findByExpoAndType: Mock };
  let qrAnswerStore: { create: Mock };
  let service: SurveyPublicService;

  beforeEach(() => {
    surveyStore = { findByExpoAndType: vi.fn().mockResolvedValue(survey) };
    qrAnswerStore = { create: vi.fn() };
    service = new SurveyPublicService(
      surveyStore as unknown as SurveyStore,
      qrAnswerStore as unknown as SurveyQrAnswerStore,
    );
  });

  describe('findSurvey', () => {
    it('입장 확인 없이 박람회 일반 참가자 설문을 돌려준다', async () => {
      const result = await service.findSurvey(expoId);

      expect(surveyStore.findByExpoAndType).toHaveBeenCalledWith(
        expoId,
        ParticipationType.STANDARD,
      );
      expect(result.expoId).toBe(expoId);
    });

    it('그 박람회에 일반 참가자 설문이 없으면 404 예외를 던진다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue(null);

      await expect(service.findSurvey(expoId)).rejects.toBeInstanceOf(
        SurveyNotFoundException,
      );
    });
  });

  describe('submit', () => {
    it('답변을 토큰 없이 저장한다', async () => {
      await service.submit(expoId, answerDto);

      expect(qrAnswerStore.create).toHaveBeenCalledWith(
        'survey-1',
        null,
        { '1': '좋았습니다' },
        Occupation.ELEMENTARY_STUDENT,
      );
    });

    it('같은 박람회에 여러 번 제출해도 막지 않는다', async () => {
      await service.submit(expoId, answerDto);
      await service.submit(expoId, answerDto);

      expect(qrAnswerStore.create).toHaveBeenCalledTimes(2);
    });

    it('설문이 없으면 404 예외를 던지고 저장하지 않는다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue(null);

      await expect(service.submit(expoId, answerDto)).rejects.toBeInstanceOf(
        SurveyNotFoundException,
      );
      expect(qrAnswerStore.create).not.toHaveBeenCalled();
    });

    it('답변이 문항 스펙과 맞지 않으면 400 예외를 던지고 저장하지 않는다', async () => {
      await expect(
        service.submit(expoId, { ...answerDto, answers: {} }),
      ).rejects.toBeInstanceOf(SurveyAnswerInvalidException);
      expect(qrAnswerStore.create).not.toHaveBeenCalled();
    });

    it('저장 직전에 설문이 지워지면(외래 키 위반) 404 예외로 바꾼다', async () => {
      const fkViolation = new QueryFailedError('INSERT', [], {
        code: '23503',
      } as unknown as Error);
      qrAnswerStore.create.mockRejectedValue(fkViolation);

      await expect(service.submit(expoId, answerDto)).rejects.toBeInstanceOf(
        SurveyNotFoundException,
      );
    });

    it('알 수 없는 저장 오류는 그대로 던진다', async () => {
      const error = new Error('db down');
      qrAnswerStore.create.mockRejectedValue(error);

      await expect(service.submit(expoId, answerDto)).rejects.toBe(error);
    });
  });
});
