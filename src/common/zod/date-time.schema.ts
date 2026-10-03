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

/** 요청 바디의 날짜. JSON 문자열(또는 `Date`로 해석되는 값)을 `Date`로 바꿔 받는다. */
export const dateTimeRequestSchema = () => describedAsDateTime(z.coerce.date());

/** 응답의 날짜. `Date`로 들고 있다가 JSON으로 나갈 때 ISO 문자열이 된다. */
export const dateTimeResponseSchema = () => describedAsDateTime(z.date());
