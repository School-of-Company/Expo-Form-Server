import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { InternalTokenGuard } from '../common/http/internal-token.guard.js';
import { SurveyService } from './survey.service.js';
import { InternalSurveyController } from './internal-survey.controller.js';

describe('InternalSurveyController', () => {
  let surveyService: { summarize: Mock };
  let controller: InternalSurveyController;

  beforeEach(() => {
    surveyService = { summarize: vi.fn() };
    controller = new InternalSurveyController(
      surveyService as unknown as SurveyService,
    );
  });

  it('컨트롤러 전체가 내부 토큰 가드로 보호된다', () => {
    expect(
      new Reflector().get(GUARDS_METADATA, InternalSurveyController),
    ).toEqual([InternalTokenGuard]);
  });

  it('현황 요청에 바디의 expoIds를 넘긴다', async () => {
    await controller.summarize({ expoIds: ['expo-1', 'expo-2'] });

    expect(surveyService.summarize).toHaveBeenCalledWith(['expo-1', 'expo-2']);
  });
});
