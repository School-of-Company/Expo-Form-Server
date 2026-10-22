import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import {
  ExternalServiceUnavailableException,
  ProgramFormChangeInProgressException,
  ProgramFormGuardianPolicyInUseException,
  ProgramFormReservationUnavailableException,
} from '../common/exceptions/domain.exception.js';
import { HttpExpoClient } from './http-expo-client.js';

const internalToken = 'x'.repeat(32);
const expoId = '11111111-1111-1111-1111-111111111111';

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpExpoClient', () => {
  let fetchMock: Mock;
  let client: HttpExpoClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new HttpExpoClient({
      baseUrl: 'http://expo-server',
      internalToken,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('내부 토큰을 헤더에 싣고 박람회 id를 경로로 조회한다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        startedDay: '2026-10-10',
        finishedDay: '2026-10-12',
      }),
    );

    await client.exists(expoId);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://expo-server/internal/expo/${expoId}`);
    expect(init.headers).toMatchObject({ 'X-Internal-Token': internalToken });
  });

  it('200이면 박람회가 있다고 답한다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { startedDay: '2026-10-10' }),
    );

    await expect(client.exists(expoId)).resolves.toBe(true);
  });

  it('404면 없다고 답한다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404));

    await expect(client.exists(expoId)).resolves.toBe(false);
  });

  it.each([
    ['5xx 응답', () => jsonResponse(503)],
    ['인증 실패', () => jsonResponse(401)],
    ['객체가 아닌 응답', () => jsonResponse(200, 'ok')],
  ])('%s은 없음이 아니라 장애로 던진다', async (_label, response) => {
    fetchMock.mockResolvedValue(response());

    await expect(client.exists(expoId)).rejects.toThrow(
      ExternalServiceUnavailableException,
    );
  });

  it('연결 실패·타임아웃도 장애로 던진다', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(client.exists(expoId)).rejects.toThrow(
      ExternalServiceUnavailableException,
    );
  });

  it('경로에 넣는 값은 인코딩한다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404));

    await client.exists('a/b?c');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://expo-server/internal/expo/a%2Fb%3Fc');
  });

  describe('findPeriod', () => {
    it('박람회 기간을 돌려주고 내부 토큰을 싣는다', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          startedDay: '2026-10-01',
          finishedDay: '2026-10-31',
          extra: 'ignored',
        }),
      );

      await expect(client.findPeriod(expoId)).resolves.toEqual({
        startedDay: '2026-10-01',
        finishedDay: '2026-10-31',
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://expo-server/internal/expo/${expoId}`);
      expect(init.headers).toMatchObject({ 'X-Internal-Token': internalToken });
    });

    it('박람회가 없으면(404) null이다', async () => {
      fetchMock.mockResolvedValue(jsonResponse(404));

      await expect(client.findPeriod(expoId)).resolves.toBeNull();
    });

    it('5xx·연결 실패·모양이 다른 응답은 없음이 아니라 장애로 던진다', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500));
      await expect(client.findPeriod(expoId)).rejects.toThrow(
        ExternalServiceUnavailableException,
      );

      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
      await expect(client.findPeriod(expoId)).rejects.toThrow(
        ExternalServiceUnavailableException,
      );

      fetchMock.mockResolvedValueOnce(jsonResponse(200, { finishedDay: 1 }));
      await expect(client.findPeriod(expoId)).rejects.toThrow(
        ExternalServiceUnavailableException,
      );
    });
  });

  describe('프로그램용 폼 수정 예약', () => {
    const formId = '22222222-2222-4222-8222-222222222222';
    const changeId = '33333333-3333-4333-8333-333333333333';
    const changeUrl = `http://expo-server/internal/forms/by-id/${formId}/changes/${changeId}`;

    it('kind=UPDATE를 PUT으로 보내고 내부 토큰을 싣는다', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { formId }));

      await client.reserveProgramFormUpdate(formId, changeId);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(changeUrl);
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body as string)).toEqual({ kind: 'UPDATE' });
      expect(init.headers).toMatchObject({ 'X-Internal-Token': internalToken });
    });

    it('409면 보호자 동반 정책 사용 중으로 거절한다', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409));

      await expect(
        client.reserveProgramFormUpdate(formId, changeId),
      ).rejects.toThrow(ProgramFormGuardianPolicyInUseException);
    });

    it('409의 사유 코드가 정책 참조면 보호자 동반 정책 사용 중으로 거절한다', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(409, { code: 'PROGRAM_FORM_GUARDIAN_POLICY_IN_USE' }),
      );

      await expect(
        client.reserveProgramFormUpdate(formId, changeId),
      ).rejects.toThrow(ProgramFormGuardianPolicyInUseException);
    });

    it('409의 사유 코드가 진행 중인 변경이면 그 사유로 거절한다', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(409, { code: 'PROGRAM_FORM_CHANGE_IN_PROGRESS' }),
      );

      await expect(
        client.reserveProgramFormUpdate(formId, changeId),
      ).rejects.toThrow(ProgramFormChangeInProgressException);
    });

    it.each([
      ['404', jsonResponse(404)],
      ['5xx', jsonResponse(500)],
      ['연결 실패', new TypeError('fetch failed')],
    ])('%s는 수정을 막고 예약 불가 오류로 던진다', async (_label, outcome) => {
      if (outcome instanceof Response) {
        fetchMock.mockResolvedValue(outcome);
      } else {
        fetchMock.mockRejectedValue(outcome);
      }

      await expect(
        client.reserveProgramFormUpdate(formId, changeId),
      ).rejects.toThrow(ProgramFormReservationUnavailableException);
    });

    it('예약 해제는 DELETE로 보내고, 실패해도 던지지 않는다', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      await client.releaseProgramFormChange(formId, changeId);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(changeUrl);
      expect(init.method).toBe('DELETE');

      fetchMock.mockResolvedValueOnce(jsonResponse(500));
      await expect(
        client.releaseProgramFormChange(formId, changeId),
      ).resolves.toBeUndefined();
    });
  });
});
