import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator.js';
import {
  ADMIN_ACCESS_PERMISSION,
  ExpoAdminAccessGuard,
} from './expo-admin-access.guard.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
export function ExpoAdminAccess(permission?: 'STATS_READ'): MethodDecorator {
  return applyDecorators(
    UseGuards(ExpoAdminAccessGuard),
    SetMetadata(ADMIN_ACCESS_PERMISSION, permission),
    ApiBearerAuth(),
    ApiErrorResponse(401, '인증이 필요함'),
    ApiErrorResponse(403, '박람회 접근 권한이 없음'),
    ApiErrorResponse(404, '박람회 또는 대상 리소스가 없음'),
    ApiErrorResponse(503, '박람회 권한을 확인할 수 없음'),
  );
}
