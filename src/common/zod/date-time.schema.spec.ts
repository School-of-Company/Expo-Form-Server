import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  dateTimeRequestSchema,
  dateTimeResponseSchema,
} from './date-time.schema.js';

describe('date-time schema', () => {
  it('요청용 스키마는 문자열을 Date로 바꿔 받고, 해석할 수 없는 값은 거부한다', () => {
    const schema = dateTimeRequestSchema();

    expect(schema.parse('2026-10-01T09:00:00Z')).toEqual(
      new Date('2026-10-01T09:00:00Z'),
    );
    expect(schema.safeParse('날짜 아님').success).toBe(false);
  });

  it('요청·응답 스키마 모두 JSON 스키마 변환이 date-time 문자열로 나온다', () => {
    // 이 변환이 던지면(`Date cannot be represented in JSON Schema`) 문서 생성 단계에서 앱이 뜨지 않는다.
    const json = z.toJSONSchema(
      z.object({
        requested: dateTimeRequestSchema(),
        responded: dateTimeResponseSchema(),
      }),
    );

    expect(json.properties).toEqual({
      requested: { type: 'string', format: 'date-time' },
      responded: { type: 'string', format: 'date-time' },
    });
  });
});
