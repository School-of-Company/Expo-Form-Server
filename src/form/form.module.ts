import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DynamicFormEntity } from './entities/dynamic-form.entity.js';
import { FormEntity } from './entities/form.entity.js';
import { FormController } from './form.controller.js';
import { FormService } from './form.service.js';
import { FormStore } from './form.store.js';

/** form 도메인(폼 정의 + 입력 필드) 모듈. */
@Module({
  imports: [TypeOrmModule.forFeature([FormEntity, DynamicFormEntity])],
  controllers: [FormController],
  providers: [FormService, FormStore],
})
export class FormModule {}
