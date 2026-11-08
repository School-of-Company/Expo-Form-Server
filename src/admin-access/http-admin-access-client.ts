import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import {
  ExpoNotFoundException,
  ExternalServiceUnavailableException,
} from '../common/exceptions/domain.exception.js';
import { ExternalServiceError } from '../common/http/external-service.error.js';
import { fetchJson } from '../common/http/fetch-json.util.js';
import type { InternalServiceOptions } from '../common/http/internal-service.config.js';
import { INTERNAL_TOKEN_HEADER } from '../common/http/internal-token.constants.js';
import type { AdminAccessClient } from './admin-access-client.interface.js';
import type { AdminAccessRequestDto } from './dto/admin-access.request.dto.js';

/** 존재 확인 프로젝션과 분리해 권한을 매 요청마다 Expo에서 확인한다. */
export class HttpAdminAccessClient implements AdminAccessClient {
  constructor(private readonly options: InternalServiceOptions | null) {}

  async requireAccess(dto: AdminAccessRequestDto): Promise<void> {
    if (this.options === null) {
      throw new ExternalServiceUnavailableException();
    }

    let result: unknown;
    try {
      const url = new URL(
        `${this.options.baseUrl}/internal/expo/${encodeURIComponent(dto.expoId)}/admin-access`,
      );
      if (dto.permission !== undefined) {
        url.searchParams.set('permission', dto.permission);
      }

      result = await fetchJson(
        url.href,
        z.looseObject({
          expoId: z.literal(dto.expoId),
          permission: z.literal(dto.permission ?? 'APPLICATION_READ'),
        }),
        {
          headers: {
            authorization: dto.authorization,
            [INTERNAL_TOKEN_HEADER]: this.options.internalToken,
          },
          observe: { service: 'expo', operation: 'admin_access' },
        },
      );
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        if (error.status === 403) {
          throw new ForbiddenException();
        }

        if (error.status === 401) {
          throw new UnauthorizedException();
        }
      }

      throw new ExternalServiceUnavailableException();
    }

    if (result === null) {
      throw new ExpoNotFoundException();
    }
  }
}
