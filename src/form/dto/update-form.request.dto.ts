import { createZodDto } from 'nestjs-zod';
import { createFormSchema } from './create-form.request.dto.js';

/**
 * 생성과 같은 바디를 받는다. 대상 폼은 경로의 `expoId`와 바디의 `participantType`+
 * `applicationType` 조합으로 식별하므로, 이 조합을 바꾸는 것은 지원하지 않는다.
 * `occupationOpenAt`을 생략하면 기존 값을 유지한다 — 이 필드를 모르는 관리자 화면이 저장해도 지워지지 않게.
 */
export const updateFormSchema = createFormSchema;

export class UpdateFormRequestDto extends createZodDto(updateFormSchema) {}
