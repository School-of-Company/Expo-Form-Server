import { z } from 'zod';
import {
  Occupation,
  SCHOOL_OCCUPATIONS,
} from '../common/enums/occupation.enum.js';
import { Region } from '../common/enums/region.enum.js';

/** 대표자 한 명이 추가할 수 있는 동반자 수의 상한. 사전등록은 대표자를 포함해 최대 5명이므로 동반자는 4명까지다. */
export const COMPANION_MAX_COUNT = 4;

/**
 * 동반자 한 명. 동반자도 정원에 들어가는 개별 참가자라 대표자와 같이 구분(직업)과 지역을 받는다.
 * 전화번호는 없고 대표자 번호로만 등록된다. 이름 길이는 참가자 이름 컬럼(10자)에 맞춘다.
 *
 * 소속 학교는 직업이 학생·교직원·교사처럼 소속이 필요한 값({@link SCHOOL_OCCUPATIONS})일 때만 받는다.
 * 직업·소속 학교 필드와 같은 기준이다. 그 외 직업이 소속을 보내면 거부한다 — 화면에서 숨긴 값이 섞여
 * 저장되지 않게 한다.
 */
export const companionSchema = z
  .object({
    name: z.string().trim().min(1).max(10),
    occupation: z.enum(Occupation),
    region: z.enum(Region),
    school: z.string().trim().min(1).max(100).optional(),
  })
  .superRefine((companion, ctx) => {
    const needsSchool = SCHOOL_OCCUPATIONS.includes(companion.occupation);
    if (needsSchool && companion.school === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: '이 구분은 소속 학교가 필요합니다.',
        path: ['school'],
      });
    }

    if (!needsSchool && companion.school !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: '이 구분은 소속 학교를 받지 않습니다.',
        path: ['school'],
      });
    }
  });

export type Companion = z.infer<typeof companionSchema>;
