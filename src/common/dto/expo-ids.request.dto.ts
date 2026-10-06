import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 여러 박람회를 한 번에 묻는 내부 API의 바디. 박람회 목록 화면 하나가 한 번에 묻는 양을 넘지 않게
 * 상한을 둔다. id가 많아 쿼리스트링 대신 바디로 받는다.
 */
export const expoIdsSchema = z.object({
  expoIds: z.array(z.uuid()).min(1).max(100),
});

export class ExpoIdsRequestDto extends createZodDto(expoIdsSchema) {}
