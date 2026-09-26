import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  SurveyAlreadyExistsException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { CreateSurveyRequestDto } from './dto/create-survey.request.dto.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyService } from './survey.service.js';
import { SurveyStore } from './survey.store.js';

const createDto = {
  expoId: '11111111-1111-1111-1111-111111111111',
  title: '행사 만족도 설문',
  informationText: '안내문',
  participationType: ParticipationType.TRAINEE,
  dynamicSurvey: [
    {
      title: '만족도',
      formType: DynamicFormFieldType.DROPDOWN,
      requiredStatus: true,
      jsonData: { '1': '만족', '2': '불만족' },
      otherJson: null,
    },
  ],
} satisfies CreateSurveyRequestDto;

/** 이미 응답이 쌓인 설문 — 수정이 누적 응답 수를 건드리지 않는지 보려고 0이 아닌 값을 준다. */
const existingSurvey = {
  id: 'survey-1',
  expoId: createDto.expoId,
  totalAnswers: 7,
  dynamicSurveys: [],
} as unknown as SurveyEntity;

describe('SurveyService', () => {
  let surveyStore: {
    findById: Mock;
    findByExpoAndType: Mock;
    existsByExpoAndType: Mock;
    save: Mock;
    updateWithQuestions: Mock;
    deleteById: Mock;
  };
  let service: SurveyService;

  beforeEach(() => {
    surveyStore = {
      findById: vi.fn(),
      findByExpoAndType: vi.fn(),
      existsByExpoAndType: vi.fn(),
      save: vi.fn(),
      updateWithQuestions: vi.fn(),
      deleteById: vi.fn(),
    };
    service = new SurveyService(surveyStore as unknown as SurveyStore);
  });

  describe('create', () => {
    it('같은 조합의 설문이 이미 있으면 거부한다', async () => {
      surveyStore.existsByExpoAndType.mockResolvedValue(true);

      await expect(service.create(createDto)).rejects.toThrow(
        SurveyAlreadyExistsException,
      );
      expect(surveyStore.save).not.toHaveBeenCalled();
    });

    it('중복이 없으면 문항까지 함께 저장한다', async () => {
      surveyStore.existsByExpoAndType.mockResolvedValue(false);
      surveyStore.save.mockResolvedValue({ id: 'survey-1' });

      await service.create(createDto);

      const saved = surveyStore.save.mock.calls[0][0] as SurveyEntity;
      expect(saved.expoId).toBe(createDto.expoId);
      expect(saved.dynamicSurveys).toHaveLength(1);
      expect(saved.dynamicSurveys[0].jsonData).toEqual({
        '1': '만족',
        '2': '불만족',
      });
    });

    it('누적 응답 수를 0으로 초기화해서 저장한다', async () => {
      surveyStore.existsByExpoAndType.mockResolvedValue(false);
      surveyStore.save.mockResolvedValue({ id: 'survey-1' });

      await service.create(createDto);

      const saved = surveyStore.save.mock.calls[0][0] as SurveyEntity;
      expect(saved.totalAnswers).toBe(0);
    });

    it('생성된 설문의 id를 돌려준다', async () => {
      surveyStore.existsByExpoAndType.mockResolvedValue(false);
      surveyStore.save.mockResolvedValue({ id: 'survey-1' });

      await expect(service.create(createDto)).resolves.toEqual({
        id: 'survey-1',
      });
    });
  });

  describe('update', () => {
    it('설문이 없으면 예외를 던진다', async () => {
      surveyStore.findById.mockResolvedValue(null);

      await expect(service.update('survey-1', createDto)).rejects.toThrow(
        SurveyNotFoundException,
      );
      expect(surveyStore.updateWithQuestions).not.toHaveBeenCalled();
    });

    it('기존 문항을 새 문항으로 통째로 교체한다', async () => {
      surveyStore.findById.mockResolvedValue(existingSurvey);
      surveyStore.findByExpoAndType.mockResolvedValue(existingSurvey);

      await service.update('survey-1', createDto);

      const [, questions] = surveyStore.updateWithQuestions.mock.calls[0];
      expect(questions).toHaveLength(1);
      expect(questions[0].title).toBe('만족도');
    });

    it('바꾸려는 참여자군을 다른 설문이 이미 쓰고 있으면 거부한다', async () => {
      surveyStore.findById.mockResolvedValue(existingSurvey);
      surveyStore.findByExpoAndType.mockResolvedValue({ id: 'survey-2' });

      await expect(service.update('survey-1', createDto)).rejects.toThrow(
        SurveyAlreadyExistsException,
      );
      expect(surveyStore.updateWithQuestions).not.toHaveBeenCalled();
    });

    it('참여자군이 그대로여서 자기 자신이 조회되는 경우는 통과시킨다', async () => {
      surveyStore.findById.mockResolvedValue(existingSurvey);
      surveyStore.findByExpoAndType.mockResolvedValue({ id: 'survey-1' });

      await service.update('survey-1', createDto);

      expect(surveyStore.updateWithQuestions).toHaveBeenCalled();
    });

    it('누적 응답 수는 수정 요청으로 덮어쓰지 않는다', async () => {
      surveyStore.findById.mockResolvedValue(existingSurvey);
      surveyStore.findByExpoAndType.mockResolvedValue(existingSurvey);

      await service.update('survey-1', createDto);

      const [updated] = surveyStore.updateWithQuestions.mock.calls[0];
      expect(updated.totalAnswers).toBe(7);
    });
  });

  describe('delete', () => {
    it('설문이 없으면 예외를 던진다', async () => {
      surveyStore.findById.mockResolvedValue(null);

      await expect(service.delete('survey-1')).rejects.toThrow(
        SurveyNotFoundException,
      );
      expect(surveyStore.deleteById).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('설문이 없으면 예외를 던진다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue(null);

      await expect(
        service.findOne({
          expoId: createDto.expoId,
          participationType: createDto.participationType,
        }),
      ).rejects.toThrow(SurveyNotFoundException);
    });

    it('문항 스펙과 누적 응답 수를 담아서 응답으로 변환한다', async () => {
      surveyStore.findByExpoAndType.mockResolvedValue({
        ...createDto,
        id: 'survey-1',
        totalAnswers: 7,
        dynamicSurveys: [{ ...createDto.dynamicSurvey[0], id: 1 }],
      });

      const result = await service.findOne({
        expoId: createDto.expoId,
        participationType: createDto.participationType,
      });

      expect(result.id).toBe('survey-1');
      expect(result.totalAnswers).toBe(7);
      expect(result.dynamicSurvey[0].jsonData).toEqual({
        '1': '만족',
        '2': '불만족',
      });
    });
  });
});
