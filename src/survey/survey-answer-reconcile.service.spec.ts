import { Logger } from '@nestjs/common';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyAnswerReconcileService } from './survey-answer-reconcile.service.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';

type Row = { id: string; eventId: string };

const rows = (...eventIds: string[]): Row[] =>
  eventIds.map((eventId) => ({ id: `id-${eventId}`, eventId }));

/** 점검이 켜져 있고 웹훅이 설정된 기본 환경. */
type Env = Array<[key: string, value: string]>;

const enabledEnv: Env = [
  ['SURVEY_ANSWER_RECONCILE_ENABLED', 'true'],
  ['DISCORD_WEBHOOK_URL', 'https://discord.invalid/webhook'],
];

const configWith = (env: Env) =>
  ({ get: vi.fn((key: string) => new Map(env).get(key)) }) as never;

/** `id` 순으로 정렬된 기록 집합에서 키셋 페이지를 흉내 낸다. */
const pagedStore = (all: Row[]) =>
  vi.fn(async ({ afterId, limit }: { afterId?: string; limit: number }) =>
    all
      .filter((row) => afterId === undefined || row.id > afterId)
      .slice(0, limit),
  );

const dataset = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => {
    const id = `r${String(index).padStart(4, '0')}`;
    return { id, eventId: `event-${id}` };
  });

describe('SurveyAnswerReconcileService', () => {
  let store: { findExhausted: Mock; markFinal: Mock };
  let userClient: { findParticipant: Mock; findSurveyAnswerResult: Mock };
  let dicoshot: { sendCustom: Mock };
  let service: SurveyAnswerReconcileService;
  let errorLog: MockInstance<Logger['error']>;

  const createService = (env: Env) =>
    new SurveyAnswerReconcileService(
      configWith(env),
      store as unknown as SurveyAnswerSubmissionStore,
      userClient,
      dicoshot as never,
    );

  /** n번째(0부터) 실행의 첫 페이지 조회에 넘긴 시작 위치. */
  const firstAfterIdOfRun = (callIndex: number) =>
    (store.findExhausted.mock.calls[callIndex]?.[0] as { afterId?: string })
      .afterId;

  /** 첫 페이지만 돌려주고 그다음은 비어 있게 한다. */
  const givenExhausted = (page: Row[]) => {
    store.findExhausted.mockResolvedValueOnce(page).mockResolvedValue([]);
  };

  const sentAlert = () =>
    dicoshot.sendCustom.mock.calls[0]?.[0] as {
      description: string;
      fields: Array<{ name: string; value: string }>;
    };

  beforeEach(() => {
    store = {
      findExhausted: vi.fn().mockResolvedValue([]),
      markFinal: vi.fn().mockResolvedValue(true),
    };
    userClient = { findParticipant: vi.fn(), findSurveyAnswerResult: vi.fn() };
    dicoshot = { sendCustom: vi.fn().mockResolvedValue(true) };
    errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    service = createService(enabledEnv);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('재발행 상한을 다 썼고 마지막 발행이 충분히 지난 기록만 찾는다', async () => {
    const now = new Date('2026-10-06T12:00:00.000Z');
    const fiveMinutesMs = 5 * 60 * 1000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
      await service.reconcile();
    } finally {
      vi.useRealTimers();
    }

    const [query] = store.findExhausted.mock.calls[0] as [
      { maxRetryCount: number; staleBefore: Date; limit: number },
    ];
    expect(query.maxRetryCount).toBe(5);
    expect(query.limit).toBe(100);
    // 기본 5분 전보다 오래된 발행만 대상이다 — 방금 마지막으로 발행한 기록은 아직 처리 중일 수 있다.
    expect(query.staleBefore).toEqual(new Date(now.getTime() - fiveMinutesMs));
  });

  it('대상이 없으면 유저 서비스를 부르지 않고 알리지도 않는다', async () => {
    await expect(service.reconcile()).resolves.toMatchObject({ checked: 0 });

    expect(userClient.findSurveyAnswerResult).not.toHaveBeenCalled();
    expect(dicoshot.sendCustom).not.toHaveBeenCalled();
  });

  it('저장됐다고 답하면 STORED로 반영하고, 사유가 와도 남기지 않는다', async () => {
    givenExhausted(rows('event-1'));
    userClient.findSurveyAnswerResult.mockResolvedValue({
      status: 'STORED',
      reason: '무시돼야 하는 값',
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
    givenExhausted(rows('event-1'));
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
    givenExhausted(rows('event-1'));
    userClient.findSurveyAnswerResult.mockResolvedValue(null);

    const summary = await service.reconcile();

    expect(store.markFinal).not.toHaveBeenCalled();
    expect(summary.unprocessedEventIds).toEqual(['event-1']);
    expect(
      sentAlert().fields.some((field) => field.value.includes('event-1')),
    ).toBe(true);
  });

  it('유저 서비스가 응답하지 않으면 그 자리에서 멈추고 중단 사실을 알린다', async () => {
    givenExhausted(rows('event-1', 'event-2'));
    userClient.findSurveyAnswerResult.mockRejectedValueOnce(
      new ExternalServiceUnavailableException(),
    );

    const summary = await service.reconcile();

    expect(summary).toMatchObject({ interrupted: true, checked: 0 });
    expect(userClient.findSurveyAnswerResult).toHaveBeenCalledTimes(1);
    expect(sentAlert().description).toContain('점검을 중단');
  });

  it('해결되지 않는 기록이 남아도 다음 페이지까지 이어서 점검한다', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `id-${String(index).padStart(3, '0')}`,
      eventId: `event-${index}`,
    }));
    store.findExhausted
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(rows('event-last'))
      .mockResolvedValue([]);
    userClient.findSurveyAnswerResult.mockResolvedValue(null);

    const summary = await service.reconcile();

    const [secondQuery] = store.findExhausted.mock.calls[1] as [
      { afterId: string },
    ];
    expect(secondQuery.afterId).toBe('id-099');
    expect(summary.checked).toBe(101);
    expect(store.findExhausted).toHaveBeenCalledTimes(2);
  });

  it('한 번에 점검하는 상한(1000건)에 걸리면 멈추고 남은 기록이 있을 수 있다고 알린다', async () => {
    let page = 0;
    store.findExhausted.mockImplementation(async () => {
      page++;
      return Array.from({ length: 100 }, (_, index) => ({
        id: `${page}-${index}`,
        eventId: `event-${page}-${index}`,
      }));
    });
    userClient.findSurveyAnswerResult.mockResolvedValue({
      status: 'STORED',
      reason: null,
    });

    const summary = await service.reconcile();

    expect(summary).toMatchObject({ checked: 1000, truncated: true });
    expect(store.findExhausted).toHaveBeenCalledTimes(10);
    expect(sentAlert().description).toContain('상한');
  });

  it('이전 점검이 끝나지 않았으면 이번 점검은 건너뛴다', async () => {
    let release!: (value: Row[]) => void;
    store.findExhausted.mockReturnValueOnce(
      new Promise<Row[]>((resolve) => {
        release = resolve;
      }),
    );

    const first = service.reconcile();
    const second = await service.reconcile();
    release([]);
    await first;

    expect(second.skipped).toBe(true);
    expect(store.findExhausted).toHaveBeenCalledTimes(1);
  });

  it('그사이 결과 이벤트가 먼저 반영돼 markFinal이 무시되면 반영 수에 넣지 않는다', async () => {
    givenExhausted(rows('event-1'));
    userClient.findSurveyAnswerResult.mockResolvedValue({
      status: 'STORED',
      reason: null,
    });
    store.markFinal.mockResolvedValue(false);

    await expect(service.reconcile()).resolves.toMatchObject({ applied: 0 });
  });

  it('알림에는 eventId를 최대 10개까지만 싣고 나머지는 개수로 적는다', async () => {
    givenExhausted(rows(...Array.from({ length: 12 }, (_, i) => `e${i}`)));
    userClient.findSurveyAnswerResult.mockResolvedValue(null);

    await service.reconcile();

    const idField = sentAlert().fields.find(
      (field) => field.name === '미처리 eventId',
    );
    expect(idField?.value.split('\n')).toHaveLength(11);
    expect(idField?.value).toContain('외 2건');
  });

  it('설정값이 숫자가 아니면 기본값을 쓴다', async () => {
    service = createService([
      ...enabledEnv,
      ['SURVEY_ANSWER_MAX_RETRY_COUNT', 'not-a-number'],
      ['SURVEY_ANSWER_STALE_MS', 'not-a-number'],
    ]);

    await service.reconcile();

    const [query] = store.findExhausted.mock.calls[0] as [
      { maxRetryCount: number },
    ];
    expect(query.maxRetryCount).toBe(5);
  });

  describe('켜고 끄기(SURVEY_ANSWER_RECONCILE_ENABLED)', () => {
    it.each<[string, Env]>([
      ['설정이 없으면', []],
      ['true가 아니면', [['SURVEY_ANSWER_RECONCILE_ENABLED', 'false']]],
    ])('%s 아무것도 하지 않는다', async (_label, env) => {
      service = createService(env);

      const summary = await service.reconcile();

      expect(summary.disabled).toBe(true);
      expect(store.findExhausted).not.toHaveBeenCalled();
      expect(userClient.findSurveyAnswerResult).not.toHaveBeenCalled();
    });

    it('true면 점검한다', async () => {
      const summary = await service.reconcile();

      expect(summary.disabled).toBe(false);
      expect(store.findExhausted).toHaveBeenCalled();
    });
  });

  describe('다음 점검으로 이어 보기', () => {
    it('상한에 걸리면 다음 점검은 마지막으로 확인한 기록 다음부터 이어 본다', async () => {
      store.findExhausted = pagedStore(dataset(1100));
      userClient.findSurveyAnswerResult.mockResolvedValue(null);

      const first = await service.reconcile();
      const firstRunCalls = store.findExhausted.mock.calls.length;
      const second = await service.reconcile();

      expect(first).toMatchObject({ checked: 1000, truncated: true });
      expect(firstAfterIdOfRun(0)).toBeUndefined();
      expect(firstAfterIdOfRun(firstRunCalls)).toBe('r0999');
      // 남은 100건만 확인하고 끝까지 훑었다.
      expect(second).toMatchObject({ checked: 100, truncated: false });
      expect(second.unprocessedEventIds[0]).toBe('event-r1000');
    });

    it('끝까지 훑었으면 다음 점검은 처음부터 다시 본다', async () => {
      store.findExhausted = pagedStore(dataset(1100));
      userClient.findSurveyAnswerResult.mockResolvedValue(null);

      await service.reconcile();
      await service.reconcile();
      const callsBeforeThird = store.findExhausted.mock.calls.length;
      await service.reconcile();

      expect(firstAfterIdOfRun(callsBeforeThird)).toBeUndefined();
    });

    it('장애로 멈추면 다음 점검은 마지막으로 확인한 기록 다음부터 이어 본다', async () => {
      store.findExhausted = pagedStore(dataset(5));
      userClient.findSurveyAnswerResult
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new ExternalServiceUnavailableException())
        .mockResolvedValue(null);

      const first = await service.reconcile();
      const firstRunCalls = store.findExhausted.mock.calls.length;
      await service.reconcile();

      expect(first).toMatchObject({ interrupted: true, checked: 2 });
      expect(firstAfterIdOfRun(firstRunCalls)).toBe('r0001');
    });
  });

  describe('알림이 사라지지 않게 하기', () => {
    it('알림이 필요한 결과는 Discord와 별개로 오류 로그에도 남긴다', async () => {
      givenExhausted(rows('event-1'));
      userClient.findSurveyAnswerResult.mockResolvedValue(null);

      await service.reconcile();

      const logged = String(errorLog.mock.calls[0]?.[0]);
      expect(logged).toContain('event-1');
      expect(logged).not.toContain('웹훅 미설정');
      expect(dicoshot.sendCustom).toHaveBeenCalledTimes(1);
    });

    it('웹훅이 없으면 Discord는 부르지 않고, 미설정이라고 오류 로그에 남긴다', async () => {
      service = createService([['SURVEY_ANSWER_RECONCILE_ENABLED', 'true']]);
      givenExhausted(rows('event-1'));
      userClient.findSurveyAnswerResult.mockResolvedValue(null);

      await service.reconcile();

      const logged = String(errorLog.mock.calls[0]?.[0]);
      expect(logged).toContain('event-1');
      expect(logged).toContain('Discord 웹훅 미설정');
      expect(dicoshot.sendCustom).not.toHaveBeenCalled();
    });

    it('Discord 전송이 실패하면 오류 로그를 남긴다', async () => {
      givenExhausted(rows('event-1'));
      userClient.findSurveyAnswerResult.mockResolvedValue(null);
      dicoshot.sendCustom.mockResolvedValue(false);

      await service.reconcile();

      expect(
        errorLog.mock.calls.some((call) =>
          String(call[0]).includes('Discord로 보내지 못했습니다'),
        ),
      ).toBe(true);
    });

    it('알릴 것이 없으면 오류 로그를 남기지 않는다', async () => {
      givenExhausted(rows('event-1'));
      userClient.findSurveyAnswerResult.mockResolvedValue({
        status: 'STORED',
        reason: null,
      });

      await service.reconcile();

      expect(errorLog).not.toHaveBeenCalled();
    });
  });
});
