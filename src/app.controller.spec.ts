import { describe, expect, it } from 'vitest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  it('AppService의 getHello 결과를 그대로 반환한다', () => {
    const service = { getHello: () => 'Hello World!' } as AppService;

    expect(new AppController(service).getHello()).toBe('Hello World!');
  });
});
