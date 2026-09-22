import { describe, expect, it } from 'vitest';
import { FormService } from './form.service.js';

describe('FormService', () => {
  it('의존성 없이 생성된다', () => {
    expect(new FormService()).toBeInstanceOf(FormService);
  });
});
