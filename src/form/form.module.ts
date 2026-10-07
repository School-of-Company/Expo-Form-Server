import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletedExpoModule } from '../deleted-expo/deleted-expo.module.js';
import { ExpoClientModule } from '../expo-client/expo-client.module.js';
import { DynamicFormEntity } from './entities/dynamic-form.entity.js';
import { FormEntity } from './entities/form.entity.js';
import { FormController } from './form.controller.js';
import { FormService } from './form.service.js';
import { FormStore } from './form.store.js';
import { InternalFormController } from './internal-form.controller.js';

/** form 도메인(폼 정의 + 입력 필드) 모듈. */
@Module({
  imports: [
    TypeOrmModule.forFeature([FormEntity, DynamicFormEntity]),
    DeletedExpoModule,
    ExpoClientModule,
  ],
  controllers: [FormController, InternalFormController],
  providers: [FormService, FormStore],
  exports: [FormStore],
})
export class FormModule {}
