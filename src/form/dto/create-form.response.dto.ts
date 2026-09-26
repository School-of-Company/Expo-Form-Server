import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 폼 생성 결과. 생성 직후 수정·삭제하려면 `formId`가 필요한데,
 * 이걸 안 돌려주면 클라이언트가 조회를 한 번 더 해야 해서 id만 담아 반환한다.
 */
export const createFormResponseSchema = z.object({
  id: z.uuid(),
});

export class CreateFormResponseDto extends createZodDto(
  createFormResponseSchema,
) {}
