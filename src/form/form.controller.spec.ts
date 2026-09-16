import { describe, expect, it } from 'vitest';
import { FormController } from './form.controller.js';
import { FormService } from './form.service.js';

describe('FormController', () => {
  it('FormService를 주입받아 생성된다', () => {
    const service = {} as FormService;

    expect(new FormController(service)).toBeInstanceOf(FormController);
  });
});
