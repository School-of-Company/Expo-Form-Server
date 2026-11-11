import {
  BadRequestException,
  Inject,
  Injectable,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  ADMIN_ACCESS_CLIENT,
  type AdminAccessClient,
} from '../admin-access/admin-access-client.interface.js';
import { ExpoAdminAccessGuard } from '../admin-access/expo-admin-access.guard.js';
import { FormNotFoundException } from '../common/exceptions/domain.exception.js';
import { FormStore } from './form.store.js';

@Injectable()
export class ProgramAdminAccessGuard extends ExpoAdminAccessGuard {
  constructor(
    @Inject(ADMIN_ACCESS_CLIENT) client: AdminAccessClient,
    @Inject(Reflector) reflector: Reflector,
    @Inject(FormStore) private readonly forms: FormStore,
  ) {
    super(client, reflector);
  }

  protected override async resolveExpoId(request: Request): Promise<string> {
    const rawFormId = request.params.formId;
    if (typeof rawFormId !== 'string') {
      throw new BadRequestException();
    }

    const formId = await new ParseUUIDPipe().transform(rawFormId, {
      type: 'param',
      data: 'formId',
    });
    const form = await this.forms.findProgramById(formId);
    if (form === null) {
      throw new FormNotFoundException();
    }

    return form.expoId;
  }
}
