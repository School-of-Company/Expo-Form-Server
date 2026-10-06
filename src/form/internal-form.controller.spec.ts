import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { InternalTokenGuard } from '../common/http/internal-token.guard.js';
import { FormService } from './form.service.js';
import { InternalFormController } from './internal-form.controller.js';

describe('InternalFormController', () => {
  let formService: { summarize: Mock; deleteAllByExpo: Mock };
  let controller: InternalFormController;

  beforeEach(() => {
    formService = { summarize: vi.fn(), deleteAllByExpo: vi.fn() };
    controller = new InternalFormController(
      formService as unknown as FormService,
    );
  });

  it('컨트롤러 전체가 내부 토큰 가드로 보호된다', () => {
    expect(
      new Reflector().get(GUARDS_METADATA, InternalFormController),
    ).toEqual([InternalTokenGuard]);
  });

  it('현황 요청에 바디의 expoIds를 넘긴다', async () => {
    await controller.summarize({ expoIds: ['expo-1', 'expo-2'] });

    expect(formService.summarize).toHaveBeenCalledWith(['expo-1', 'expo-2']);
  });

  it('일괄 삭제 요청에 경로의 expoId를 넘긴다', async () => {
    await controller.deleteAll('expo-1');

    expect(formService.deleteAllByExpo).toHaveBeenCalledWith('expo-1');
  });
});
