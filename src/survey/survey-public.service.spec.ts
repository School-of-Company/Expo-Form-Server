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
  lotteryEnabled: false,
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
    qrAnswerStore = {
      create: vi.fn().mockResolvedValue({ won: false, drawNumber: null }),
    };
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
      expect(result.lotteryEnabled).toBe(false);
    });

    it('추첨이 켜져 있는지 함께 알려 준다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue({
        ...survey,
        lotteryEnabled: true,
      });

      const result = await service.findSurvey(expoId);

      expect(result.lotteryEnabled).toBe(true);
    });

    it('그 박람회에 일반 참가자 설문이 없으면 404 예외를 던진다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue(null);

      await expect(service.findSurvey(expoId)).rejects.toBeInstanceOf(
        SurveyNotFoundException,
      );
    });
  });

  describe('submit', () => {
    it('답변을 저장하고 당첨이 아니라고 알려 준다', async () => {
      const result = await service.submit(expoId, answerDto);

      expect(result).toEqual({ won: false, drawNumber: null });

      expect(qrAnswerStore.create).toHaveBeenCalledWith(
        'survey-1',
        { '1': '좋았습니다' },
        Occupation.ELEMENTARY_STUDENT,
        null,
      );
    });

    it('같은 박람회에 여러 번 제출해도 막지 않는다', async () => {
      await service.submit(expoId, answerDto);
      await service.submit(expoId, answerDto);

      expect(qrAnswerStore.create).toHaveBeenCalledTimes(2);
    });

    describe('경품 번호', () => {
      const lotterySurvey = { ...survey, lotteryEnabled: true };
      const consented = {
        ...answerDto,
        phoneNumber: '010-1234-5678',
        personalInformationStatus: true,
      };

      beforeEach(() => {
        surveyStore.findByExpoAndType.mockResolvedValue(lotterySurvey);
      });

      it('당첨이면 몇 번째 응답이었는지 알려 준다', async () => {
        qrAnswerStore.create.mockResolvedValue({ won: true, drawNumber: 30 });

        await expect(service.submit(expoId, answerDto)).resolves.toEqual({
          won: true,
          drawNumber: 30,
        });
      });

      it('번호 없이 당첨돼도 당첨을 알려 준다', async () => {
        qrAnswerStore.create.mockResolvedValue({ won: true, drawNumber: 10 });

        const result = await service.submit(expoId, answerDto);

        expect(qrAnswerStore.create).toHaveBeenCalledWith(
          'survey-1',
          expect.anything(),
          Occupation.ELEMENTARY_STUDENT,
          null,
        );
        expect(result.won).toBe(true);
      });

      it('추첨이 켜져 있으면 번호를 숫자만 남겨 넘긴다', async () => {
        await service.submit(expoId, consented);

        expect(qrAnswerStore.create).toHaveBeenCalledWith(
          'survey-1',
          { '1': '좋았습니다' },
          Occupation.ELEMENTARY_STUDENT,
          '01012345678',
        );
      });

      it('번호를 보내지 않으면 번호 없이 응답만 받는다', async () => {
        await service.submit(expoId, answerDto);
        await service.submit(expoId, { ...answerDto, phoneNumber: '  ' });

        expect(qrAnswerStore.create).toHaveBeenNthCalledWith(
          1,
          'survey-1',
          expect.anything(),
          Occupation.ELEMENTARY_STUDENT,
          null,
        );
        expect(qrAnswerStore.create).toHaveBeenNthCalledWith(
          2,
          'survey-1',
          expect.anything(),
          Occupation.ELEMENTARY_STUDENT,
          null,
        );
      });

      it('추첨이 꺼져 있으면 형식이 틀린 번호도 저장하지 않고 응답만 받는다', async () => {
        surveyStore.findByExpoAndType.mockResolvedValue(survey);

        await service.submit(expoId, {
          ...answerDto,
          phoneNumber: 'abc',
        });

        expect(qrAnswerStore.create).toHaveBeenCalledWith(
          'survey-1',
          expect.anything(),
          Occupation.ELEMENTARY_STUDENT,
          null,
        );
      });

      it.each([
        ['동의 없이', { ...consented, personalInformationStatus: undefined }],
        ['동의하지 않고', { ...consented, personalInformationStatus: false }],
        ['형식이 틀린', { ...consented, phoneNumber: '02-123-4567' }],
      ])(
        '번호를 %s 보내면 400 예외를 던지고 저장하지 않는다',
        async (_label, dto) => {
          await expect(service.submit(expoId, dto)).rejects.toBeInstanceOf(
            SurveyAnswerInvalidException,
          );
          expect(qrAnswerStore.create).not.toHaveBeenCalled();
        },
      );

      it('오류 메시지에 전화번호를 담지 않는다', async () => {
        const error = await service
          .submit(expoId, { ...consented, phoneNumber: '02-123-4567' })
          .catch((error_: unknown) => error_);

        expect(JSON.stringify(error)).not.toContain('02-123-4567');
        expect((error as Error).message).not.toContain('4567');
      });
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
