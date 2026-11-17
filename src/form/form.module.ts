import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAccessModule } from '../admin-access/admin-access.module.js';
import { DeletedExpoModule } from '../deleted-expo/deleted-expo.module.js';
import { ExpoClientModule } from '../expo-client/expo-client.module.js';
import { ProgramAdminAccessGuard } from './program-admin-access.guard.js';
import { DynamicFormEntity } from './entities/dynamic-form.entity.js';
import { FormEntity } from './entities/form.entity.js';
import { FormController } from './form.controller.js';
import { FormService } from './form.service.js';
import { FormStore } from './form.store.js';
import { InternalFormController } from './internal-form.controller.js';
import { InternalProgramFormController } from './internal-program-form.controller.js';
import { ProgramFormController } from './program-form.controller.js';

/** form 도메인(폼 정의 + 입력 필드) 모듈. */
@Module({
  imports: [
    AdminAccessModule,
    TypeOrmModule.forFeature([FormEntity, DynamicFormEntity]),
    DeletedExpoModule,
    ExpoClientModule,
  ],
  controllers: [
    FormController,
    ProgramFormController,
    InternalFormController,
    InternalProgramFormController,
  ],
  providers: [FormService, FormStore, ProgramAdminAccessGuard],
  exports: [FormStore],
})
export class FormModule {}
