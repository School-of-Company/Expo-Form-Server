import { Controller } from '@nestjs/common';
import { FormService } from './form.service.js';

/** `/v1/forms` HTTP 엔트리포인트. 라우트는 아직 미구현. */
@Controller('v1/forms')
export class FormController {
  constructor(private readonly formService: FormService) {}
}
