import { z } from 'zod';

/** 이 서비스가 해석할 줄 아는 메시지 형식 버전. 필드 추가는 같은 버전에서 하고, 의미를 바꿀 때만 올라간다. */
export const SUPPORTED_SCHEMA_VERSION = 1;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const envelopeSchema = z.looseObject({
  schemaVersion: z.literal(SUPPORTED_SCHEMA_VERSION),
  eventId: z.uuid(),
  // 박람회 서비스의 Long sequence. JSON 숫자로 오고, 안전한 정수 범위를 넘으면 순서 비교를 믿을 수 없다.
  version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expoId: z.uuid(),
});

const tombstoneSchema = envelopeSchema.extend({ deleted: z.literal(true) });

/** 박람회 상태 중 이 서비스가 읽는 필드만 본다. 나머지(프로그램·회차 등)는 무시한다. */
const changedSchema = envelopeSchema.extend({
  deleted: z.literal(false),
  expo: z.looseObject({
    startedDay: z.string().regex(DAY_PATTERN),
    finishedDay: z.string().regex(DAY_PATTERN),
  }),
});

const expoChangedEventSchema = z.discriminatedUnion('deleted', [
  tombstoneSchema,
  changedSchema,
]);

/** 프로젝션에 반영할 이벤트. tombstone이면 `period`가 없다. */
export type ExpoChangedEvent = {
  eventId: string;
  version: number;
  expoId: string;
} & (
  | { deleted: true }
  | { deleted: false; period: { startedDay: string; finishedDay: string } }
);

/**
 * `expo.expo.changed` 메시지 값을 해석한다. JSON이 아니거나 모양이 다르거나 모르는 `schemaVersion`이면
 * `undefined`다 — 다시 읽어도 결과가 같으니 재시도하지 않고 DLT로 보낸다.
 */
export function parseExpoChangedEvent(
  value: string,
): ExpoChangedEvent | undefined {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return undefined;
  }

  const parsed = expoChangedEventSchema.safeParse(json);
  if (!parsed.success) {
    return undefined;
  }

  const { eventId, version, expoId } = parsed.data;
  if (parsed.data.deleted) {
    return { eventId, version, expoId, deleted: true };
  }

  const { startedDay, finishedDay } = parsed.data.expo;
  return {
    eventId,
    version,
    expoId,
    deleted: false,
    period: { startedDay, finishedDay },
  };
}
