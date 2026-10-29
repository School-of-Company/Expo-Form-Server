import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  GiftPickupTokenInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { hashGiftToken } from './gift-secret.js';
import { SurveyGiftService } from './survey-gift.service.js';
import { SurveyGiftStore } from './survey-gift.store.js';
import { SurveyStore } from './survey.store.js';

const expoId = '11111111-1111-4111-8111-111111111111';

describe('SurveyGiftService', () => {
  let surveyStore: { findByExpoAndType: Mock };
  let giftStore: {
    hasPin: Mock;
    savePin: Mock;
    findState: Mock;
    confirm: Mock;
  };
  let service: SurveyGiftService;

  beforeEach(() => {
    surveyStore = {
      findByExpoAndType: vi.fn().mockResolvedValue({ id: 'survey-1' }),
    };
    giftStore = {
      hasPin: vi.fn(),
      savePin: vi.fn(),
      findState: vi.fn(),
      confirm: vi.fn(),
    };
    service = new SurveyGiftService(
      surveyStore as unknown as SurveyStore,
      giftStore as unknown as SurveyGiftStore,
    );
  });

  it('설문이 없으면 어떤 동작도 404다', async () => {
    surveyStore.findByExpoAndType.mockResolvedValue(null);

    await expect(service.findPin(expoId)).rejects.toBeInstanceOf(
      SurveyNotFoundException,
    );
    await expect(
      service.confirm(expoId, { token: 't', pin: '1234' }),
    ).rejects.toBeInstanceOf(SurveyNotFoundException);
  });

  describe('PIN 설정', () => {
    it('해시만 저장하고 응답에 PIN을 싣지 않는다', async () => {
      const result = await service.updatePin(expoId, { pin: '123456' });

      expect(result).toEqual({ configured: true });
      const [surveyId, stored] = giftStore.savePin.mock.calls[0] as string[];
      expect(surveyId).toBe('survey-1');
      expect(stored).not.toContain('123456');
      expect(stored.startsWith('scrypt$')).toBe(true);
    });

    it('설정 여부만 조회한다', async () => {
      giftStore.hasPin.mockResolvedValue(false);

      await expect(service.findPin(expoId)).resolves.toEqual({
        configured: false,
      });
    });
  });

  describe('수령 상태 조회', () => {
    it('토큰 해시로만 찾고 상태 외 정보는 돌려주지 않는다', async () => {
      const claimedAt = new Date('2026-10-27T01:00:00.000Z');
      giftStore.findState.mockResolvedValue({ claimedAt, pinConfigured: true });

      const result = await service.findStatus(expoId, { token: 'secret' });

      expect(giftStore.findState).toHaveBeenCalledWith(
        'survey-1',
        hashGiftToken('secret'),
      );
      expect(result).toEqual({
        claimed: true,
        claimedAt: claimedAt.toISOString(),
        pinConfigured: true,
      });
    });

    it('미수령이면 claimedAt이 비어 있다', async () => {
      giftStore.findState.mockResolvedValue({
        claimedAt: null,
        pinConfigured: false,
      });

      await expect(
        service.findStatus(expoId, { token: 'secret' }),
      ).resolves.toEqual({
        claimed: false,
        claimedAt: null,
        pinConfigured: false,
      });
    });

    it('없거나 다른 박람회의 토큰이면 404다', async () => {
      giftStore.findState.mockResolvedValue(null);

      await expect(
        service.findStatus(expoId, { token: 'x' }),
      ).rejects.toBeInstanceOf(GiftPickupTokenInvalidException);
    });
  });

  describe('수령 확인', () => {
    const claimedAt = new Date('2026-10-29T01:00:00.000Z');

    it('토큰 해시만 저장소에 넘기고 PIN 없이 완료한다', async () => {
      giftStore.confirm.mockResolvedValue({
        status: 'CLAIMED',
        claimedAt,
        alreadyClaimed: false,
      });
      giftStore.hasPin.mockResolvedValue(false);

      const result = await service.confirm(expoId, { token: 'secret' });

      expect(giftStore.confirm).toHaveBeenCalledWith(
        'survey-1',
        hashGiftToken('secret'),
      );
      expect(result).toEqual({
        claimed: true,
        claimedAt: claimedAt.toISOString(),
        pinConfigured: false,
      });
    });

    it('이전 클라이언트가 pin을 보내도 무시한다', async () => {
      giftStore.confirm.mockResolvedValue({
        status: 'CLAIMED',
        claimedAt,
        alreadyClaimed: false,
      });
      giftStore.hasPin.mockResolvedValue(true);

      await service.confirm(expoId, { token: 'secret', pin: '0000' });

      expect(giftStore.confirm).toHaveBeenCalledWith(
        'survey-1',
        hashGiftToken('secret'),
      );
    });

    it('이미 완료된 건은 같은 완료 상태를 그대로 돌려준다', async () => {
      giftStore.confirm.mockResolvedValue({
        status: 'CLAIMED',
        claimedAt,
        alreadyClaimed: true,
      });
      giftStore.hasPin.mockResolvedValue(true);

      await expect(
        service.confirm(expoId, { token: 'secret' }),
      ).resolves.toMatchObject({
        claimed: true,
        claimedAt: claimedAt.toISOString(),
      });
    });

    it('없거나 다른 박람회의 토큰이면 404다', async () => {
      giftStore.confirm.mockResolvedValue({ status: 'NOT_FOUND' });

      await expect(
        service.confirm(expoId, { token: 'x' }),
      ).rejects.toBeInstanceOf(GiftPickupTokenInvalidException);
    });
  });
});
