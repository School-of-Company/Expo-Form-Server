import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { ExternalServiceUnavailableException } from '../common/exceptions/domain.exception.js';
import { HttpUserClient } from './http-user-client.js';

const token = 'x'.repeat(32);
const input = {
  expoId: '11111111-1111-1111-1111-111111111111',
  phoneNumber: '01012345678',
  participationType: ParticipationType.STANDARD,
};

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpUserClient', () => {
  let fetchMock: Mock;
  let client: HttpUserClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new HttpUserClient({
      baseUrl: 'http://user-server',
      internalToken: token,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('내부 토큰을 헤더에 싣고 전화번호는 URL이 아니라 바디로 보낸다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        participantId: 42,
        participationType: ParticipationType.STANDARD,
      }),
    );

    await client.findParticipant(input);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://user-server/internal/participants/resolve');
    expect(url).not.toContain(input.phoneNumber);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'X-Internal-Token': token });
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it('찾으면 응답자 정보를 돌려준다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        participantId: 42,
        participationType: ParticipationType.STANDARD,
      }),
    );

    await expect(client.findParticipant(input)).resolves.toEqual({
      participantId: 42,
      participationType: ParticipationType.STANDARD,
    });
  });

  it('404는 응답자 없음(null)이다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404));

    await expect(client.findParticipant(input)).resolves.toBeNull();
  });

  it.each([
    ['401(토큰 불일치)', () => jsonResponse(401)],
    ['500', () => jsonResponse(500)],
    ['계약과 다른 응답 모양', () => jsonResponse(200, { id: 'x' })],
  ])('%s는 없음이 아니라 서비스 장애로 던진다', async (_label, response) => {
    fetchMock.mockResolvedValue(response());

    await expect(client.findParticipant(input)).rejects.toThrow(
      ExternalServiceUnavailableException,
    );
  });

  it('연결 실패·타임아웃도 서비스 장애로 던진다', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.findParticipant(input)).rejects.toThrow(
      ExternalServiceUnavailableException,
    );
  });
});
