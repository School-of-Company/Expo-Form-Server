import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { InternalTokenGuard } from '../common/http/internal-token.guard.js';
import { ExpoPurgeService } from './expo-purge.service.js';
import { InternalExpoController } from './internal-expo.controller.js';

describe('InternalExpoController', () => {
  let expoPurgeService: { purge: Mock };
  let controller: InternalExpoController;

  beforeEach(() => {
    expoPurgeService = { purge: vi.fn() };
    controller = new InternalExpoController(
      expoPurgeService as unknown as ExpoPurgeService,
    );
  });

  it('컨트롤러 전체가 내부 토큰 가드로 보호된다', () => {
    expect(
      new Reflector().get(GUARDS_METADATA, InternalExpoController),
    ).toEqual([InternalTokenGuard]);
  });

  it('삭제 요청에 경로의 expoId를 넘긴다', async () => {
    await controller.purge('expo-1');

    expect(expoPurgeService.purge).toHaveBeenCalledWith('expo-1');
  });
});
