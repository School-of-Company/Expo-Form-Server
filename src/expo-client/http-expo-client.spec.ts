import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
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
});
