import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import { SurveyController } from './survey.controller.js';
import { SurveyService } from './survey.service.js';

describe('SurveyController', () => {
  let surveyService: {
    create: Mock;
    findOne: Mock;
    update: Mock;
    delete: Mock;
  };
  let controller: SurveyController;

  beforeEach(() => {
    surveyService = {
      create: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    controller = new SurveyController(
      surveyService as unknown as SurveyService,
    );
  });

  it('조회 요청에 경로의 expoId와 쿼리 DTO를 함께 넘긴다', async () => {
    const query = { type: ParticipationType.TRAINEE };

    await controller.findOne('expo-1', query);

    expect(surveyService.findOne).toHaveBeenCalledWith('expo-1', query);
  });

  it('수정 요청에 경로의 expoId와 바디를 함께 넘긴다', async () => {
    const dto = { title: '수정된 설문' } as never;

    await controller.update('expo-1', dto);

    expect(surveyService.update).toHaveBeenCalledWith('expo-1', dto);
  });

  it('삭제 요청에 경로의 expoId와 participationType을 함께 넘긴다', async () => {
    await controller.delete('expo-1', ParticipationType.STANDARD);

    expect(surveyService.delete).toHaveBeenCalledWith(
      'expo-1',
      ParticipationType.STANDARD,
    );
  });
});
