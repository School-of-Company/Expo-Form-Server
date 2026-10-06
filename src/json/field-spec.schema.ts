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
 * 조건부 표시 규칙. "parentIndex번째 필드의 값이 triggerValue(또는 triggerValues 중 하나)일 때만 이
 * 필드를 보여준다"는 뜻이다. 값 하나에 반응할 때는 v1과 같은 `triggerValue`를, 여러 값에 반응해야
 * 할 때(예: 교사·교직원일 때 소속 학교)는 `triggerValues`를 쓰고 둘 중 하나만 둔다.
 */
export const conditionalSchema = z
  .object({
    parentIndex: z.number().int().nonnegative(),
    triggerValue: z.string().optional(),
    triggerValues: z.array(z.string()).min(1).optional(),
  })
  .refine(
    (value) =>
      (value.triggerValue === undefined) !==
      (value.triggerValues === undefined),
    { message: 'triggerValue와 triggerValues 중 하나만 지정해야 합니다.' },
  );

/**
 * 필드 부가 설정. 기타 입력 허용 여부, 최대 선택 개수, 조건부 표시 규칙을 담는다.
 * 조건부 표시의 해석은 전적으로 클라이언트가 한다 — 서버는 모양만 검증하고 그대로 저장한다
 * (고정 의미 필드의 조건만 예외로 폼 검증에서 본다).
 */
export const otherJsonSchema = z.object({
  hasEtc: z.boolean(),
  maxSelection: z.number().int().positive().optional(),
  conditional: conditionalSchema.optional(),
});

/** 조건부 표시가 반응하는 값들. `triggerValue` 하나든 `triggerValues` 여럿이든 같은 모양으로 꺼낸다. */
export function triggerValuesOf(
  conditional: z.infer<typeof conditionalSchema>,
): string[] {
  return conditional.triggerValues ?? [conditional.triggerValue ?? ''];
}

export type JsonData = z.infer<typeof jsonDataSchema>;
export type OtherJson = z.infer<typeof otherJsonSchema>;
