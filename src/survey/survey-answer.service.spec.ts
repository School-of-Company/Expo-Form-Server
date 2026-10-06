import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { QueryFailedError } from 'typeorm';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  ExternalServiceUnavailableException,
  ParticipantNotFoundException,
  SurveyAnswerAlreadyExistsException,
  SurveyAnswerInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { SubmitSurveyAnswerRequestDto } from './dto/submit-survey-answer.request.dto.js';
import { SurveyAnswerSubmissionEntity } from './entities/survey-answer-submission.entity.js';
import { SurveyAnswerSubmissionStatus } from './entities/survey-answer-submission-status.enum.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyAnswerService } from './survey-answer.service.js';
import { SurveyAnswerSubmissionStore } from './survey-answer-submission.store.js';
import { SurveyStore } from './survey.store.js';

const survey = {
  id: 'survey-1',
  expoId: '11111111-1111-1111-1111-111111111111',
  participationType: ParticipationType.TRAINEE,
  dynamicSurveys: [
    {
      id: 1,
      formType: DynamicFormFieldType.SENTENCE,
      requiredStatus: true,
      jsonData: {},
      otherJson: null,
    },
  ],
} as unknown as SurveyEntity;

const participant = {
  participantId: 42,
  participationType: ParticipationType.TRAINEE,
};

const submitDto = {
  phoneNumber: '010-1234-5678',
  personalInformationStatus: true,
  answers: { '1': '좋았습니다' },
} satisfies SubmitSurveyAnswerRequestDto;

describe('SurveyAnswerService', () => {
  let surveyStore: { findByExpoAndType: Mock };
  let submissionStore: { findActiveByKey: Mock; createReceived: Mock };
  let userClient: { findParticipant: Mock; findSurveyAnswerResult: Mock };
  let service: SurveyAnswerService;

  beforeEach(() => {
    surveyStore = { findByExpoAndType: vi.fn() };
    submissionStore = { findActiveByKey: vi.fn(), createReceived: vi.fn() };
    userClient = { findParticipant: vi.fn(), findSurveyAnswerResult: vi.fn() };
    submissionStore.findActiveByKey.mockResolvedValue(null);
    service = new SurveyAnswerService(
      surveyStore as unknown as SurveyStore,
      submissionStore as unknown as SurveyAnswerSubmissionStore,
      userClient,
    );
  });

  it('설문이 없으면 예외를 던진다', async () => {
    surveyStore.findByExpoAndType.mockResolvedValue(null);

    await expect(
      service.submit(survey.expoId, ParticipationType.TRAINEE, submitDto),
    ).rejects.toThrow(SurveyNotFoundException);
    expect(userClient.findParticipant).not.toHaveBeenCalled();
  });

  it('전화번호를 숫자만 남겨 정규화하고, 설문의 참여자군에서 찾는다', async () => {
    surveyStore.findByExpoAndType.mockResolvedValue(survey);
    userClient.findParticipant.mockResolvedValue(participant);

    await service.submit(survey.expoId, ParticipationType.TRAINEE, submitDto);

    expect(userClient.findParticipant).toHaveBeenCalledWith({
      expoId: survey.expoId,
      phoneNumber: '01012345678',
      participationType: ParticipationType.TRAINEE,
    });
  });

  it('전화번호로 참가자를 찾지 못하면 예외를 던진다', async () => {
    surveyStore.findByExpoAndType.mockResolvedValue(survey);
    userClient.findParticipant.mockResolvedValue(null);

    await expect(
      service.submit(survey.expoId, ParticipationType.TRAINEE, submitDto),
    ).rejects.toThrow(ParticipantNotFoundException);
    expect(submissionStore.createReceived).not.toHaveBeenCalled();
  });

  it('유저 서비스가 다른 참여자군의 응답자를 돌려주면 없음과 같이 거부한다', async () => {
    surveyStore.findByExpoAndType.mockResolvedValue(survey);
    userClient.findParticipant.mockResolvedValue({
      participantId: 42,
      participationType: ParticipationType.STANDARD,
    });

    await expect(
      service.submit(survey.expoId, ParticipationType.TRAINEE, submitDto),
    ).rejects.toThrow(ParticipantNotFoundException);
    expect(submissionStore.createReceived).not.toHaveBeenCalled();
  });

  it('유저 서비스 장애는 응답자 없음으로 바꾸지 않고 그대로 전파한다', async () => {
    surveyStore.findByExpoAndType.mockResolvedValue(survey);
    userClient.findParticipant.mockRejectedValue(
      new ExternalServiceUnavailableException(),
    );

    await expect(
      service.submit(survey.expoId, ParticipationType.TRAINEE, submitDto),
    ).rejects.toThrow(ExternalServiceUnavailableException);
    expect(submissionStore.createReceived).not.toHaveBeenCalled();
  });

  it('필수 문항이 빠진 답변은 거부한다', async () => {
    surveyStore.findByExpoAndType.mockResolvedValue(survey);
    userClient.findParticipant.mockResolvedValue(participant);

    await expect(
      service.submit(survey.expoId, ParticipationType.TRAINEE, {
        ...submitDto,
        answers: {},
      }),
    ).rejects.toThrow(SurveyAnswerInvalidException);
    expect(submissionStore.createReceived).not.toHaveBeenCalled();
  });

  it('같은 응답자의 활성 제출 기록이 있으면 409로 변환한다', async () => {
    surveyStore.findByExpoAndType.mockResolvedValue(survey);
    userClient.findParticipant.mockResolvedValue(participant);
    submissionStore.findActiveByKey.mockResolvedValue({
      id: 'existing-submission',
    });

    await expect(
      service.submit(survey.expoId, ParticipationType.TRAINEE, submitDto),
    ).rejects.toThrow(SurveyAnswerAlreadyExistsException);
    expect(submissionStore.createReceived).not.toHaveBeenCalled();
  });

  it('동시 요청이 사전 조회를 함께 통과해 유니크 제약에 걸리면 409로 변환한다', async () => {
    surveyStore.findByExpoAndType.mockResolvedValue(survey);
    userClient.findParticipant.mockResolvedValue(participant);
    submissionStore.createReceived.mockRejectedValue(
      new QueryFailedError('INSERT', [], { code: '23505' } as never),
    );

    await expect(
      service.submit(survey.expoId, ParticipationType.TRAINEE, submitDto),
    ).rejects.toThrow(SurveyAnswerAlreadyExistsException);
  });

  it('검증을 통과하면 접수 기록을 RECEIVED로 저장한다', async () => {
    surveyStore.findByExpoAndType.mockResolvedValue(survey);
    userClient.findParticipant.mockResolvedValue(participant);

    await service.submit(survey.expoId, ParticipationType.TRAINEE, submitDto);

    const saved = submissionStore.createReceived.mock
      .calls[0][0] as SurveyAnswerSubmissionEntity;
    expect(saved.surveyId).toBe('survey-1');
    expect(saved.expoId).toBe(survey.expoId);
    expect(saved.participationType).toBe(ParticipationType.TRAINEE);
    expect(saved.phoneNumber).toBe('01012345678');
    expect(saved.status).toBe(SurveyAnswerSubmissionStatus.RECEIVED);
    expect(saved.eventId).toEqual(expect.any(String));
    expect(saved.payload).toEqual({
      answers: { '1': '좋았습니다' },
      personalInformationStatus: true,
    });
  });
});
