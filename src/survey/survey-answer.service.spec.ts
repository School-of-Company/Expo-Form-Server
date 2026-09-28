import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DynamicFormFieldType } from '../common/enums/dynamic-form-field-type.enum.js';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  ParticipantNotFoundException,
  SurveyAnswerAlreadyExistsException,
  SurveyAnswerInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import { DuplicateSurveyAnswerError } from '../user-client/user-client.interface.js';
import { SubmitSurveyAnswerRequestDto } from './dto/submit-survey-answer.request.dto.js';
import { SurveyEntity } from './entities/survey.entity.js';
import { SurveyAnswerService } from './survey-answer.service.js';
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
  userId: 'user-1',
  participationType: ParticipationType.TRAINEE,
};

const submitDto = {
  phoneNumber: '010-1234-5678',
  personalInformationStatus: true,
  answers: { '1': '좋았습니다' },
} satisfies SubmitSurveyAnswerRequestDto;

describe('SurveyAnswerService', () => {
  let surveyStore: { findById: Mock; incrementTotalAnswers: Mock };
  let userClient: { findByPhoneNumber: Mock; submitSurveyAnswer: Mock };
  let service: SurveyAnswerService;

  beforeEach(() => {
    surveyStore = { findById: vi.fn(), incrementTotalAnswers: vi.fn() };
    userClient = { findByPhoneNumber: vi.fn(), submitSurveyAnswer: vi.fn() };
    service = new SurveyAnswerService(
      surveyStore as unknown as SurveyStore,
      userClient as never,
    );
  });

  it('설문이 없으면 예외를 던진다', async () => {
    surveyStore.findById.mockResolvedValue(null);

    await expect(service.submit('survey-1', submitDto)).rejects.toThrow(
      SurveyNotFoundException,
    );
    expect(userClient.findByPhoneNumber).not.toHaveBeenCalled();
  });

  it('전화번호를 숫자만 남겨 정규화한 뒤 조회한다', async () => {
    surveyStore.findById.mockResolvedValue(survey);
    userClient.findByPhoneNumber.mockResolvedValue(participant);

    await service.submit('survey-1', submitDto);

    expect(userClient.findByPhoneNumber).toHaveBeenCalledWith(
      survey.expoId,
      '01012345678',
    );
  });

  it('전화번호로 참가자를 찾지 못하면 예외를 던진다', async () => {
    surveyStore.findById.mockResolvedValue(survey);
    userClient.findByPhoneNumber.mockResolvedValue(null);

    await expect(service.submit('survey-1', submitDto)).rejects.toThrow(
      ParticipantNotFoundException,
    );
    expect(userClient.submitSurveyAnswer).not.toHaveBeenCalled();
  });

  it('참가자의 참여자군이 설문 대상과 다르면 예외를 던진다', async () => {
    surveyStore.findById.mockResolvedValue(survey);
    userClient.findByPhoneNumber.mockResolvedValue({
      userId: 'user-1',
      participationType: ParticipationType.STANDARD,
    });

    await expect(service.submit('survey-1', submitDto)).rejects.toThrow(
      ParticipantNotFoundException,
    );
  });

  it('필수 문항이 빠진 답변은 거부한다', async () => {
    surveyStore.findById.mockResolvedValue(survey);
    userClient.findByPhoneNumber.mockResolvedValue(participant);

    await expect(
      service.submit('survey-1', { ...submitDto, answers: {} }),
    ).rejects.toThrow(SurveyAnswerInvalidException);
    expect(userClient.submitSurveyAnswer).not.toHaveBeenCalled();
  });

  it('검증을 통과하면 유저 서비스에 위임하고 누적 응답 수를 늘린다', async () => {
    surveyStore.findById.mockResolvedValue(survey);
    userClient.findByPhoneNumber.mockResolvedValue(participant);

    await service.submit('survey-1', submitDto);

    expect(userClient.submitSurveyAnswer).toHaveBeenCalledWith({
      surveyId: 'survey-1',
      userId: 'user-1',
      answers: { '1': '좋았습니다' },
      personalInformationStatus: true,
    });
    expect(surveyStore.incrementTotalAnswers).toHaveBeenCalledWith('survey-1');
  });

  it('이미 제출한 응답자면 409로 변환한다', async () => {
    surveyStore.findById.mockResolvedValue(survey);
    userClient.findByPhoneNumber.mockResolvedValue(participant);
    userClient.submitSurveyAnswer.mockRejectedValue(
      new DuplicateSurveyAnswerError('이미 제출됨'),
    );

    await expect(service.submit('survey-1', submitDto)).rejects.toThrow(
      SurveyAnswerAlreadyExistsException,
    );
    expect(surveyStore.incrementTotalAnswers).not.toHaveBeenCalled();
  });

  it('유저 서비스 위임이 다른 이유로 실패하면 그대로 전파한다', async () => {
    surveyStore.findById.mockResolvedValue(survey);
    userClient.findByPhoneNumber.mockResolvedValue(participant);
    userClient.submitSurveyAnswer.mockRejectedValue(
      new Error('connection lost'),
    );

    await expect(service.submit('survey-1', submitDto)).rejects.toThrow(
      'connection lost',
    );
  });
});
