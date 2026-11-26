import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { Occupation } from '../common/enums/occupation.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  ExternalServiceUnavailableException,
  SurveyAnswerInvalidException,
  SurveyFeatureDisabledException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import type { ExpoClient } from '../expo-client/expo-client.interface.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { hashGiftToken } from './gift-secret.js';
import { SurveyPublicService } from './survey-public.service.js';
import { SurveyPublicAnswerStore } from './survey-public-answer.store.js';
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
  let answerStore: { create: Mock };
  let expoClient: { findFeatures: Mock };
  let service: SurveyPublicService;

  beforeEach(() => {
    surveyStore = { findByExpoAndType: vi.fn().mockResolvedValue(survey) };
    answerStore = {
      create: vi.fn().mockResolvedValue({ won: false, drawNumber: null }),
    };
    expoClient = {
      findFeatures: vi
        .fn()
        .mockResolvedValue({ survey: true, surveyLottery: true }),
    };
    service = new SurveyPublicService(
      surveyStore as unknown as SurveyStore,
      answerStore as unknown as SurveyPublicAnswerStore,
      expoClient as unknown as ExpoClient,
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

    it('박람회 추첨 기능이 꺼져 있으면 lotteryEnabled는 false다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue({
        ...survey,
        lotteryEnabled: true,
      });
      expoClient.findFeatures.mockResolvedValue({
        survey: true,
        surveyLottery: false,
      });

      const result = await service.findSurvey(expoId);

      expect(result.lotteryEnabled).toBe(false);
    });

    it('박람회 설문 기능이 꺼져 있으면 409', async () => {
      expoClient.findFeatures.mockResolvedValue({
        survey: false,
        surveyLottery: true,
      });

      await expect(service.findSurvey(expoId)).rejects.toBeInstanceOf(
        SurveyFeatureDisabledException,
      );
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

      expect(result).toEqual({
        won: false,
        giftToken: expect.any(String) as string,
      });

      expect(answerStore.create).toHaveBeenCalledWith(
        'survey-1',
        { '1': '좋았습니다' },
        Occupation.ELEMENTARY_STUDENT,
        null,
        hashGiftToken(result.giftToken),
      );
    });

    it('당첨과 상관없이 제출마다 다른 수령 토큰을 발급하고 해시만 저장소에 넘긴다', async () => {
      const first = await service.submit(expoId, answerDto);
      const second = await service.submit(expoId, answerDto);

      expect(first.giftToken).not.toBe(second.giftToken);
      const tokenHash = (answerStore.create.mock.calls[0] as string[])[4];
      expect(tokenHash).toBe(hashGiftToken(first.giftToken));
      expect(tokenHash).not.toBe(first.giftToken);
    });

    it('검증에 실패하면 토큰을 발급하지 않고 저장도 하지 않는다', async () => {
      await expect(
        service.submit(expoId, { ...answerDto, answers: {} }),
      ).rejects.toBeInstanceOf(SurveyAnswerInvalidException);
      expect(answerStore.create).not.toHaveBeenCalled();
    });

    it('같은 박람회에 여러 번 제출해도 막지 않는다', async () => {
      await service.submit(expoId, answerDto);
      await service.submit(expoId, answerDto);

      expect(answerStore.create).toHaveBeenCalledTimes(2);
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

      it('당첨 여부만 알리고 추첨 순번은 노출하지 않는다', async () => {
        answerStore.create.mockResolvedValue({ won: true, drawNumber: 30 });

        await expect(service.submit(expoId, answerDto)).resolves.toEqual({
          won: true,
          giftToken: expect.any(String) as string,
        });
      });

      it('번호 없이 제출하면 번호 없이 저장소에 넘기고, 저장소 결과(미당첨)를 그대로 알린다', async () => {
        // 저장소는 번호 없는 응답을 당첨시키지 않는다(survey-public-answer.store.spec 참고).
        answerStore.create.mockResolvedValue({ won: false, drawNumber: null });

        const result = await service.submit(expoId, answerDto);

        expect(answerStore.create).toHaveBeenCalledWith(
          'survey-1',
          expect.anything(),
          Occupation.ELEMENTARY_STUDENT,
          null,
          expect.any(String),
        );
        expect(result.won).toBe(false);
      });

      it('추첨이 켜져 있으면 번호를 숫자만 남겨 넘긴다', async () => {
        await service.submit(expoId, consented);

        expect(answerStore.create).toHaveBeenCalledWith(
          'survey-1',
          { '1': '좋았습니다' },
          Occupation.ELEMENTARY_STUDENT,
          '01012345678',
          expect.any(String),
        );
      });

      it('박람회 설정에서 추첨이 꺼져 있으면 설문의 추첨이 켜져 있어도 번호 없이 응답만 받는다', async () => {
        expoClient.findFeatures.mockResolvedValue({
          survey: true,
          surveyLottery: false,
        });

        await service.submit(expoId, consented);

        expect(answerStore.create).toHaveBeenCalledWith(
          'survey-1',
          { '1': '좋았습니다' },
          Occupation.ELEMENTARY_STUDENT,
          null,
          expect.any(String),
        );
      });

      it('번호를 보내지 않으면 번호 없이 응답만 받는다', async () => {
        await service.submit(expoId, answerDto);
        await service.submit(expoId, { ...answerDto, phoneNumber: '  ' });

        expect(answerStore.create).toHaveBeenNthCalledWith(
          1,
          'survey-1',
          expect.anything(),
          Occupation.ELEMENTARY_STUDENT,
          null,
          expect.any(String),
        );
        expect(answerStore.create).toHaveBeenNthCalledWith(
          2,
          'survey-1',
          expect.anything(),
          Occupation.ELEMENTARY_STUDENT,
          null,
          expect.any(String),
        );
      });

      it('추첨이 꺼져 있으면 형식이 틀린 번호도 저장하지 않고 응답만 받는다', async () => {
        surveyStore.findByExpoAndType.mockResolvedValue(survey);

        await service.submit(expoId, {
          ...answerDto,
          phoneNumber: 'abc',
        });

        expect(answerStore.create).toHaveBeenCalledWith(
          'survey-1',
          expect.anything(),
          Occupation.ELEMENTARY_STUDENT,
          null,
          expect.any(String),
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
          expect(answerStore.create).not.toHaveBeenCalled();
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

    it('박람회 설정에서 설문이 꺼져 있으면 409로 거부하고 저장하지 않는다', async () => {
      expoClient.findFeatures.mockResolvedValue({
        survey: false,
        surveyLottery: true,
      });

      await expect(service.submit(expoId, answerDto)).rejects.toThrow(
        SurveyFeatureDisabledException,
      );
      expect(answerStore.create).not.toHaveBeenCalled();
    });

    it('설정을 확인할 수 없으면 허용으로 보지 않고 저장하지 않는다', async () => {
      expoClient.findFeatures.mockRejectedValue(
        new ExternalServiceUnavailableException(),
      );

      await expect(service.submit(expoId, answerDto)).rejects.toThrow(
        ExternalServiceUnavailableException,
      );
      expect(answerStore.create).not.toHaveBeenCalled();
    });

    it('설문이 없으면 404 예외를 던지고 저장하지 않는다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue(null);

      await expect(service.submit(expoId, answerDto)).rejects.toBeInstanceOf(
        SurveyNotFoundException,
      );
      expect(answerStore.create).not.toHaveBeenCalled();
    });

    it('답변이 문항 스펙과 맞지 않으면 400 예외를 던지고 저장하지 않는다', async () => {
      await expect(
        service.submit(expoId, { ...answerDto, answers: {} }),
      ).rejects.toBeInstanceOf(SurveyAnswerInvalidException);
      expect(answerStore.create).not.toHaveBeenCalled();
    });

    it('알 수 없는 저장 오류는 그대로 던진다', async () => {
      const error = new Error('db down');
      answerStore.create.mockRejectedValue(error);

      await expect(service.submit(expoId, answerDto)).rejects.toBe(error);
    });
  });
});
