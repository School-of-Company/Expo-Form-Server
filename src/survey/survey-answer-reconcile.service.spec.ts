import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerReconcileService } from './survey-answer-reconcile.service.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';

describe('SurveyAnswerReconcileService', () => {
  let store: { findExhausted: Mock; markFinal: Mock };
  let userClient: { findParticipant: Mock; findSurveyAnswerResult: Mock };
  let dicoshot: { sendCustom: Mock };
  let service: SurveyAnswerReconcileService;

  const exhausted = (...eventIds: string[]) =>
    eventIds.map((eventId) => ({ eventId }));

  beforeEach(() => {
    store = {
      findExhausted: vi.fn().mockResolvedValue([]),
      markFinal: vi.fn().mockResolvedValue(true),
    };
    userClient = { findParticipant: vi.fn(), findSurveyAnswerResult: vi.fn() };
    dicoshot = { sendCustom: vi.fn() };
    service = new SurveyAnswerReconcileService(
      { get: vi.fn(() => '5') } as never,
      store as unknown as SurveyAnswerSubmissionStore,
      userClient,
      dicoshot as never,
    );
  });

  it('재발행 상한을 다 쓴 기록만 대상으로 찾는다', async () => {
    await service.reconcile();

    expect(store.findExhausted).toHaveBeenCalledWith(5, 100);
  });

  it('대상이 없으면 유저 서비스를 부르지 않고 알리지도 않는다', async () => {
    await expect(service.reconcile()).resolves.toMatchObject({ checked: 0 });

    expect(userClient.findSurveyAnswerResult).not.toHaveBeenCalled();
    expect(dicoshot.sendCustom).not.toHaveBeenCalled();
  });

  it('유저 서비스가 저장했다고 답하면 결과 컨슈머와 같은 경로로 STORED를 반영한다', async () => {
    store.findExhausted.mockResolvedValue(exhausted('event-1'));
    userClient.findSurveyAnswerResult.mockResolvedValue({
      status: 'STORED',
      reason: null,
    });

    const summary = await service.reconcile();

    expect(store.markFinal).toHaveBeenCalledWith(
      'event-1',
      SurveyAnswerSubmissionStatus.STORED,
      null,
    );
    expect(summary.applied).toBe(1);
    expect(dicoshot.sendCustom).not.toHaveBeenCalled();
  });

  it('거절됐다고 답하면 사유와 함께 REJECTED를 반영한다', async () => {
    store.findExhausted.mockResolvedValue(exhausted('event-1'));
    userClient.findSurveyAnswerResult.mockResolvedValue({
      status: 'REJECTED',
      reason: '응답자 없음',
    });

    await service.reconcile();

    expect(store.markFinal).toHaveBeenCalledWith(
      'event-1',
      SurveyAnswerSubmissionStatus.REJECTED,
      '응답자 없음',
    );
  });

  it('처리한 적 없는 기록은 상태를 바꾸지 않고 eventId와 함께 알린다', async () => {
    store.findExhausted.mockResolvedValue(exhausted('event-1'));
    userClient.findSurveyAnswerResult.mockResolvedValue(null);

    const summary = await service.reconcile();

    expect(store.markFinal).not.toHaveBeenCalled();
    expect(summary.unprocessedEventIds).toEqual(['event-1']);
    const [alert] = dicoshot.sendCustom.mock.calls[0] as [
      { fields: Array<{ value: string }> },
    ];
    expect(alert.fields.some((field) => field.value.includes('event-1'))).toBe(
      true,
    );
  });

  it('유저 서비스 장애는 확인 불가로 세고 나머지 기록은 계속 점검한다', async () => {
    store.findExhausted.mockResolvedValue(exhausted('event-1', 'event-2'));
    userClient.findSurveyAnswerResult
      .mockRejectedValueOnce(new ExternalServiceUnavailableException())
      .mockResolvedValueOnce({ status: 'STORED', reason: null });

    const summary = await service.reconcile();

    expect(summary).toMatchObject({ checked: 2, applied: 1, unavailable: 1 });
    expect(store.markFinal).toHaveBeenCalledTimes(1);
    expect(dicoshot.sendCustom).toHaveBeenCalledTimes(1);
  });

  it('그사이 결과 이벤트가 먼저 반영돼 markFinal이 무시되면 반영 수에 넣지 않는다', async () => {
    store.findExhausted.mockResolvedValue(exhausted('event-1'));
    userClient.findSurveyAnswerResult.mockResolvedValue({
      status: 'STORED',
      reason: null,
    });
    store.markFinal.mockResolvedValue(false);

    await expect(service.reconcile()).resolves.toMatchObject({ applied: 0 });
  });

  it('알림에는 eventId를 최대 10개까지만 싣고 나머지는 개수로 적는다', async () => {
    const ids = Array.from({ length: 12 }, (_, index) => `event-${index}`);
    store.findExhausted.mockResolvedValue(exhausted(...ids));
    userClient.findSurveyAnswerResult.mockResolvedValue(null);

    await service.reconcile();

    const [alert] = dicoshot.sendCustom.mock.calls[0] as [
      { fields: Array<{ name: string; value: string }> },
    ];
    const idField = alert.fields.find(
      (field) => field.name === '미처리 eventId',
    );
    expect(idField?.value.split('\n')).toHaveLength(11);
    expect(idField?.value).toContain('외 2건');
  });
});
