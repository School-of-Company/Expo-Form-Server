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

  it.each([
    ['yyyy-MM-dd HH:mm', '2026-10-10 09:00', '2026-10-10T00:00:00.000Z'],
    ['T로 구분한 시각', '2026-10-10T09:00', '2026-10-10T00:00:00.000Z'],
    ['초가 있는 시각', '2026-10-10T09:00:30', '2026-10-10T00:00:30.000Z'],
    [
      '밀리초가 있는 시각',
      '2026-10-10T09:00:30.123',
      '2026-10-10T00:00:30.123Z',
    ],
    ['날짜만', '2026-10-10', '2026-10-09T15:00:00.000Z'],
    ['앞뒤 공백', ' 2026-10-10 09:00 ', '2026-10-10T00:00:00.000Z'],
  ])(
    '시간대 표기가 없는 값(%s)은 한국 시간으로 해석한다',
    (_label, input, utc) => {
      expect(dateTimeRequestSchema().parse(input).toISOString()).toBe(utc);
    },
  );

  it.each([
    ['Z', '2026-10-10T09:00:00Z', '2026-10-10T09:00:00.000Z'],
    ['+09:00', '2026-10-10T09:00:00+09:00', '2026-10-10T00:00:00.000Z'],
    ['-05:00', '2026-10-10T09:00:00-05:00', '2026-10-10T14:00:00.000Z'],
  ])('시간대 표기(%s)가 있으면 그대로 따른다', (_label, input, utc) => {
    expect(dateTimeRequestSchema().parse(input).toISOString()).toBe(utc);
  });

  it.each([
    '2026-13-45 99:99',
    '2026-10-10 9:00',
    '09:00',
    '2026/10/10',
    'Oct 10 2026',
  ])('해석할 수 없는 값(%s)은 거부한다', (input) => {
    expect(dateTimeRequestSchema().safeParse(input).success).toBe(false);
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
