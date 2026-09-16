import { Module } from '@nestjs/common';
import { FormController } from './form.controller.js';
import { FormService } from './form.service.js';

@Module({
  controllers: [FormController],
  providers: [FormService],
})
export class FormModule {}
