import type { AdminAccessRequestDto } from './dto/admin-access.request.dto.js';

export const ADMIN_ACCESS_CLIENT = Symbol('ADMIN_ACCESS_CLIENT');

export interface AdminAccessClient {
  requireAccess(dto: AdminAccessRequestDto): Promise<void>;
}
