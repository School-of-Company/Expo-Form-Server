import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DynamicFormEntity } from './entities/dynamic-form.entity.js';
import { FormEntity } from './entities/form.entity.js';
import { FormController } from './form.controller.js';
import { FormService } from './form.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([FormEntity, DynamicFormEntity])],
  controllers: [FormController],
  providers: [FormService],
})
export class FormModule {}
