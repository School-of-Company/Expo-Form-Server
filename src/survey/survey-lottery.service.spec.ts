import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { SurveyNotFoundException } from '../common/exceptions/domain.exception.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyLotteryService } from './survey-lottery.service.js';
import { SurveyStore } from './survey.store.js';

const expoId = '11111111-1111-1111-1111-111111111111';

const survey = {
  id: 'survey-1',
  expoId,
  participationType: ParticipationType.STANDARD,
  lotteryEnabled: false,
  lotteryNumbers: [],
  lotterySequence: 0,
} as unknown as SurveyEntity;

describe('SurveyLotteryService', () => {
  let surveyStore: { findByExpoAndType: Mock; updateLottery: Mock };
  let service: SurveyLotteryService;

  beforeEach(() => {
    surveyStore = {
      findByExpoAndType: vi.fn().mockResolvedValue(survey),
      updateLottery: vi.fn(),
    };
    service = new SurveyLotteryService(surveyStore as unknown as SurveyStore);
  });

  describe('find', () => {
    it('일반 참가자 설문의 설정과 현재까지 센 순번을 돌려준다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue({
        ...survey,
        lotteryEnabled: true,
        lotteryNumbers: [30, 62],
        lotterySequence: 17,
      });

      await expect(service.find(expoId)).resolves.toEqual({
        enabled: true,
        numbers: [30, 62],
        currentSequence: 17,
      });
      expect(surveyStore.findByExpoAndType).toHaveBeenCalledWith(
        expoId,
        ParticipationType.STANDARD,
      );
    });

    it('설문이 없으면 404 예외를 던진다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue(null);

      await expect(service.find(expoId)).rejects.toBeInstanceOf(
        SurveyNotFoundException,
      );
    });
  });

  describe('update', () => {
    it('당첨 번호를 작은 순서로 저장하고 바뀐 설정을 돌려준다', async () => {
      surveyStore.findByExpoAndType
        .mockResolvedValueOnce(survey)
        .mockResolvedValueOnce({
          ...survey,
          lotteryEnabled: true,
          lotteryNumbers: [10, 30, 62],
          lotterySequence: 4,
        });

      const result = await service.update(expoId, {
        enabled: true,
        numbers: [62, 10, 30],
      });

      expect(surveyStore.updateLottery).toHaveBeenCalledWith(
        'survey-1',
        true,
        [10, 30, 62],
      );
      expect(result).toEqual({
        enabled: true,
        numbers: [10, 30, 62],
        currentSequence: 4,
      });
    });

    it('설문이 없으면 404 예외를 던지고 바꾸지 않는다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue(null);

      await expect(
        service.update(expoId, { enabled: true, numbers: [1] }),
      ).rejects.toBeInstanceOf(SurveyNotFoundException);
      expect(surveyStore.updateLottery).not.toHaveBeenCalled();
    });
  });
});
