import { Controller } from '@nestjs/common';
import { FormService } from './form.service.js';

@Controller('v1/forms')
export class FormController {
  constructor(private readonly formService: FormService) {}
}
