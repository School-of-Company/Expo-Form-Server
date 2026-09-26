import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  FormAlreadyExistsException,
  FormNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { CreateFormRequestDto } from './dto/create-form.request.dto.js';
import { ApplicationType } from './entities/application-type.enum.js';
import { DynamicFormType } from './entities/dynamic-form-type.enum.js';
import { FormEntity } from './entities/form.entity.js';
import { FormService } from './form.service.js';
import { FormStore } from './form.store.js';

const createDto = {
  expoId: '11111111-1111-1111-1111-111111111111',
  title: '사전 등록 폼',
  informationText: '안내문',
  participationType: ParticipationType.TRAINEE,
  applicationType: ApplicationType.PRE,
  startDate: new Date('2026-01-01T00:00:00Z'),
  endDate: new Date('2026-01-31T00:00:00Z'),
  dynamicForm: [
    {
      title: '참여 형태',
      formType: DynamicFormFieldType.DROPDOWN,
      requiredStatus: true,
      jsonData: { '1': '온라인', '2': '오프라인' },
      otherJson: null,
      dynamicFormType: DynamicFormType.DEFAULT,
    },
  ],
} satisfies CreateFormRequestDto;

const existingForm = {
  id: 'form-1',
  dynamicForms: [],
} as unknown as FormEntity;

describe('FormService', () => {
  let formStore: {
    findById: Mock;
    findByExpoAndTypes: Mock;
    existsByExpoAndTypes: Mock;
    save: Mock;
    updateWithFields: Mock;
    deleteById: Mock;
  };
  let service: FormService;

  beforeEach(() => {
    formStore = {
      findById: vi.fn(),
      findByExpoAndTypes: vi.fn(),
      existsByExpoAndTypes: vi.fn(),
      save: vi.fn(),
      updateWithFields: vi.fn(),
      deleteById: vi.fn(),
    };
    service = new FormService(formStore as unknown as FormStore);
  });

  describe('create', () => {
    it('같은 조합의 폼이 이미 있으면 거부한다', async () => {
      formStore.existsByExpoAndTypes.mockResolvedValue(true);

      await expect(service.create(createDto)).rejects.toThrow(
        FormAlreadyExistsException,
      );
      expect(formStore.save).not.toHaveBeenCalled();
    });

    it('중복이 없으면 필드까지 함께 저장한다', async () => {
      formStore.existsByExpoAndTypes.mockResolvedValue(false);
      formStore.save.mockResolvedValue({ id: 'form-1' });

      await service.create(createDto);

      const saved = formStore.save.mock.calls[0][0] as FormEntity;
      expect(saved.expoId).toBe(createDto.expoId);
      expect(saved.dynamicForms).toHaveLength(1);
      expect(saved.dynamicForms[0].jsonData).toEqual({
        '1': '온라인',
        '2': '오프라인',
      });
    });
  });

  describe('update', () => {
    it('폼이 없으면 예외를 던진다', async () => {
      formStore.findById.mockResolvedValue(null);

      await expect(service.update('form-1', createDto)).rejects.toThrow(
        FormNotFoundException,
      );
      expect(formStore.updateWithFields).not.toHaveBeenCalled();
    });

    it('기존 필드를 새 필드로 통째로 교체한다', async () => {
      formStore.findById.mockResolvedValue(existingForm);
      formStore.findByExpoAndTypes.mockResolvedValue(existingForm);

      await service.update('form-1', createDto);

      const [, fields] = formStore.updateWithFields.mock.calls[0];
      expect(fields).toHaveLength(1);
      expect(fields[0].title).toBe('참여 형태');
    });

    it('바꾸려는 조합을 다른 폼이 이미 쓰고 있으면 거부한다', async () => {
      formStore.findById.mockResolvedValue(existingForm);
      formStore.findByExpoAndTypes.mockResolvedValue({ id: 'form-2' });

      await expect(service.update('form-1', createDto)).rejects.toThrow(
        FormAlreadyExistsException,
      );
      expect(formStore.updateWithFields).not.toHaveBeenCalled();
    });

    it('조합이 그대로여서 자기 자신이 조회되는 경우는 통과시킨다', async () => {
      formStore.findById.mockResolvedValue(existingForm);
      formStore.findByExpoAndTypes.mockResolvedValue({ id: 'form-1' });

      await service.update('form-1', createDto);

      expect(formStore.updateWithFields).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('폼이 없으면 예외를 던진다', async () => {
      formStore.findById.mockResolvedValue(null);

      await expect(service.delete('form-1')).rejects.toThrow(
        FormNotFoundException,
      );
      expect(formStore.deleteById).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('폼이 없으면 예외를 던진다', async () => {
      formStore.findByExpoAndTypes.mockResolvedValue(null);

      await expect(
        service.findOne({
          expoId: createDto.expoId,
          participationType: createDto.participationType,
          applicationType: createDto.applicationType,
        }),
      ).rejects.toThrow(FormNotFoundException);
    });

    it('필드 스펙을 그대로 담아서 응답으로 변환한다', async () => {
      formStore.findByExpoAndTypes.mockResolvedValue({
        ...createDto,
        id: 'form-1',
        dynamicForms: [{ ...createDto.dynamicForm[0], id: 1 }],
      });

      const result = await service.findOne({
        expoId: createDto.expoId,
        participationType: createDto.participationType,
        applicationType: createDto.applicationType,
      });

      expect(result.id).toBe('form-1');
      expect(result.dynamicForm[0].jsonData).toEqual({
        '1': '온라인',
        '2': '오프라인',
      });
    });
  });
});
