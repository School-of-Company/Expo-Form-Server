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
import { HttpParticipationClient } from './http-participation-client.js';

const internalToken = 'x'.repeat(32);
const qrToken = 'QkliJ4pD71V6EEUUZqzydQ';
const expoId = '11111111-1111-1111-1111-111111111111';

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpParticipationClient', () => {
  let fetchMock: Mock;
  let client: HttpParticipationClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new HttpParticipationClient({
      baseUrl: 'http://attendance-server',
      internalToken,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('내부 토큰을 헤더에 싣고 QR 토큰은 URL이 아니라 바디로 보낸다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { expoId }));

    await client.findEnteredToken(qrToken);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://attendance-server/internal/qr-tokens/resolve');
    expect(url).not.toContain(qrToken);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'X-Internal-Token': internalToken });
    expect(JSON.parse(init.body as string)).toEqual({ token: qrToken });
  });

  it('입장이 확인된 토큰이면 박람회 id를 돌려준다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { expoId }));

    await expect(client.findEnteredToken(qrToken)).resolves.toEqual({
      expoId,
    });
  });

  it('404(없거나 입장하지 않은 토큰)는 null이다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404));

    await expect(client.findEnteredToken(qrToken)).resolves.toBeNull();
  });

  it.each([
    ['401(토큰 불일치)', () => jsonResponse(401)],
    ['500', () => jsonResponse(500)],
    ['계약과 다른 응답 모양', () => jsonResponse(200, { expoId: 'not-uuid' })],
  ])('%s는 없음이 아니라 서비스 장애로 던진다', async (_label, response) => {
    fetchMock.mockResolvedValue(response());

    await expect(client.findEnteredToken(qrToken)).rejects.toThrow(
      ExternalServiceUnavailableException,
    );
  });

  it('연결 실패·타임아웃도 서비스 장애로 던진다', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.findEnteredToken(qrToken)).rejects.toThrow(
      ExternalServiceUnavailableException,
    );
  });
});
