import { z } from 'zod';

/**
 * 런타임 검증은 그대로 두고 OpenAPI 문서에서만 `Date`를 `date-time` 문자열로 보이게 한다.
 *
 * Zod는 `Date`를 JSON 스키마로 바꾸지 못해서(`Date cannot be represented in JSON Schema`) 이
 * 처리가 없으면 문서 생성 단계에서 앱이 뜨지 않는다. 실제로 오가는 값은 JSON이라 항상
 * 문자열이다 — 요청은 문자열로 받아 `Date`로 바꾸고, 응답은 `Date`가 ISO 문자열로 직렬화된다.
 * `_zod.toJSONSchema`는 Zod가 스키마별로 JSON 스키마 변환을 대체할 수 있게 열어 둔 훅이다.
 */
function describedAsDateTime<T extends z.ZodType>(schema: T): T {
  schema._zod.toJSONSchema = () => ({ type: 'string', format: 'date-time' });
  return schema;
}

/** 서비스가 다루는 시간대(한국 시간)의 UTC 오프셋. */
const KOREA_OFFSET = '+09:00';

/**
 * 시간대 표기가 없는 날짜·시간: `yyyy-MM-dd`, `yyyy-MM-dd HH:mm`, `yyyy-MM-ddTHH:mm[:ss[.SSS]]`.
 * 노션 명세의 `yyyy-MM-DD HH:mm`이 여기에 해당한다.
 */
const OFFSETLESS_DATE_TIME =
  /^(?<date>\d{4}-\d{2}-\d{2})(?:[ T](?<time>\d{2}:\d{2})(?<seconds>:\d{2}(?:\.\d{1,3})?)?)?$/u;

/** `Z`나 `+09:00`처럼 시간대 표기가 있는 ISO 8601 날짜·시간. */
const ISO_DATE_TIME_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})$/iu;

/**
 * 문자열 날짜를 어느 서버에서도 같은 순간이 되도록 정규화한다.
 *
 * - 시간대 표기가 없는 값은 한국 시간으로 본다. `new Date('2026-10-10 09:00')`에 맡기면 서버 시간대에
 *   따라 해석이 달라져서, 서버가 UTC일 때 한국 시간 09:00이 18:00으로 저장된다. 그래서 오프셋을 직접
 *   붙인다.
 * - 시간대 표기가 있는 ISO 값은 그대로 따른다.
 * - 그 밖의 형식은 `Date` 파서가 서버 시간대로 멋대로 해석하므로 받지 않는다.
 */
function normalizeDateString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const text = value.trim();
  const groups = OFFSETLESS_DATE_TIME.exec(text)?.groups;
  if (groups !== undefined) {
    const { date, time = '00:00', seconds = ':00' } = groups;
    return `${date}T${time}${seconds}${KOREA_OFFSET}`;
  }

  return ISO_DATE_TIME_WITH_OFFSET.test(text) ? text : NaN;
}

/**
 * 요청 바디의 날짜. JSON 문자열(또는 `Date`로 해석되는 값)을 `Date`로 바꿔 받는다. 시간대 표기가 없는
 * 문자열은 한국 시간으로 본다.
 */
export const dateTimeRequestSchema = () =>
  describedAsDateTime(z.preprocess(normalizeDateString, z.coerce.date()));

/** 응답의 날짜. `Date`로 들고 있다가 JSON으로 나갈 때 ISO 문자열이 된다. */
export const dateTimeResponseSchema = () => describedAsDateTime(z.date());
