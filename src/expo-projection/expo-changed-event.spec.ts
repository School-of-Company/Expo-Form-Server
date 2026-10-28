import { describe, expect, it } from 'vitest';
import { parseExpoChangedEvent } from './expo-changed-event.js';

const envelope = {
  schemaVersion: 1,
  eventId: '6f1c3a0e-8a43-4d4e-9a55-0d6f3e1b2c11',
  version: 1042,
  occurredAt: '2030-01-01T00:00:00.123456Z',
  expoId: '0192f0c8-0000-4000-8000-000000000001',
};

describe('parseExpoChangedEvent', () => {
  it('변경 이벤트에서 박람회 기간만 꺼내고 나머지 필드는 무시한다', () => {
    const value = JSON.stringify({
      ...envelope,
      deleted: false,
      expo: {
        title: '예시 박람회',
        startedDay: '2030-01-01',
        finishedDay: '2030-01-02',
        deleting: false,
      },
      standardPrograms: [{ id: 1 }],
      trainingPrograms: [],
      preregisterSessions: [],
      futureField: 'ignored',
    });

    expect(parseExpoChangedEvent(value)).toEqual({
      eventId: envelope.eventId,
      version: 1042,
      expoId: envelope.expoId,
      deleted: false,
      period: { startedDay: '2030-01-01', finishedDay: '2030-01-02' },
    });
  });

  it('tombstone은 상태 없이 삭제 이벤트로 읽는다', () => {
    expect(
      parseExpoChangedEvent(JSON.stringify({ ...envelope, deleted: true })),
    ).toEqual({
      eventId: envelope.eventId,
      version: 1042,
      expoId: envelope.expoId,
      deleted: true,
    });
  });

  it.each([
    ['JSON이 아님', 'not-json'],
    [
      '모르는 schemaVersion',
      JSON.stringify({ ...envelope, schemaVersion: 2, deleted: true }),
    ],
    [
      'version 없음',
      JSON.stringify({ ...envelope, version: undefined, deleted: true }),
    ],
    [
      '정수가 아닌 version',
      JSON.stringify({ ...envelope, version: 1.5, deleted: true }),
    ],
    [
      'UUID가 아닌 expoId',
      JSON.stringify({ ...envelope, expoId: 'x', deleted: true }),
    ],
    ['상태가 빠진 변경', JSON.stringify({ ...envelope, deleted: false })],
    [
      '날짜 형식이 다름',
      JSON.stringify({
        ...envelope,
        deleted: false,
        expo: { startedDay: '2030/01/01', finishedDay: '2030-01-02' },
      }),
    ],
  ])('%s이면 해석하지 않는다', (_label, value) => {
    expect(parseExpoChangedEvent(value)).toBeUndefined();
  });
});
