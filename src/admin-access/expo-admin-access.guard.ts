import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  ParseUUIDPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  ADMIN_ACCESS_CLIENT,
  type AdminAccessClient,
} from './admin-access-client.interface.js';

export const ADMIN_ACCESS_PERMISSION = 'admin-access:permission';

@Injectable()
export class ExpoAdminAccessGuard implements CanActivate {
  constructor(
    @Inject(ADMIN_ACCESS_CLIENT) private readonly client: AdminAccessClient,
    @Inject(Reflector) protected readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.header('authorization');
    if (authorization === undefined || !/^bearer \S+$/iu.test(authorization)) {
      throw new UnauthorizedException();
    }

    const expoId = await this.resolveExpoId(request);
    const permission = this.reflector.get<'STATS_READ' | undefined>(
      ADMIN_ACCESS_PERMISSION,
      context.getHandler(),
    );
    await this.client.requireAccess({ expoId, authorization, permission });
    return true;
  }

  protected async resolveExpoId(request: Request): Promise<string> {
    // 가드는 파이프보다 먼저 실행되므로 저장소·하위 서비스 호출 전에 UUID를 검증한다.
    const { expoId } = request.params;
    if (typeof expoId !== 'string') {
      throw new BadRequestException();
    }

    return new ParseUUIDPipe().transform(expoId, {
      type: 'param',
      data: 'expoId',
    });
  }
}
