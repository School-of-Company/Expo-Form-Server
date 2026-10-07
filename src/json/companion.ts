import { z } from 'zod';

/** 대표자 한 명이 추가할 수 있는 동반자 수의 상한. 사전등록은 대표자를 포함해 최대 5명이므로 동반자는 4명까지다. */
export const COMPANION_MAX_COUNT = 4;

/**
 * 동반자 한 명. 동반자는 전화번호 없이 대표자 번호로만 등록되므로 이름과 학교만 받는다.
 * 이름 길이는 참가자 이름 컬럼(10자)에 맞춘다.
 */
export const companionSchema = z.object({
  name: z.string().trim().min(1).max(10),
  school: z.string().trim().min(1).max(100),
});

export type Companion = z.infer<typeof companionSchema>;
