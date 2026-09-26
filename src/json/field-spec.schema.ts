import { z } from 'zod';

/**
 * 선택지 목록. v1(Expo-Server)과 동일한 모양을 유지한다 —
 * `{ "1": "선택지", "2": { "value": "선택지", "isAlwaysSelected": true } }`처럼
 * 1부터 시작하는 인덱스를 키로 쓰고, 값은 문자열이거나 옵션 객체다.
 */
export const jsonDataSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.object({ value: z.string(), isAlwaysSelected: z.boolean() }),
  ]),
);

/**
 * 필드 부가 설정. 기타 입력 허용 여부, 최대 선택 개수, 조건부 표시 규칙을 담는다.
 * `conditional`은 "parentIndex번째 필드가 triggerValue일 때만 이 필드를 보여준다"는 뜻으로,
 * 해석은 전적으로 클라이언트가 한다 — 서버는 모양만 검증하고 그대로 저장한다.
 */
export const otherJsonSchema = z.object({
  hasEtc: z.boolean(),
  maxSelection: z.number().int().positive().optional(),
  conditional: z
    .object({
      parentIndex: z.number().int().nonnegative(),
      triggerValue: z.string(),
    })
    .optional(),
});

export type JsonData = z.infer<typeof jsonDataSchema>;
export type OtherJson = z.infer<typeof otherJsonSchema>;
