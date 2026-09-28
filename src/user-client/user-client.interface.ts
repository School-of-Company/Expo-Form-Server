import { ParticipationType } from '../common/enums/participation-type.enum.js';

/** {@link UserClient}를 주입받을 때 쓰는 DI 토큰. */
export const USER_CLIENT = 'USER_CLIENT';

/** 전화번호로 찾아낸 신청자를 식별하는 값. */
export interface UserLookupResult {
  userId: string;
  participationType: ParticipationType;
}

/**
 * 검증이 끝난 설문 답변을 유저 서비스에 위임할 때 넘기는 값.
 *
 * `answers`는 문항 id(문자열 키)별 답변이다. 문항마다 값 타입(문자열/배열/불리언)이 갈리고
 * 그 구성은 문항 스펙에 따라 런타임에만 정해지므로, 정적으로 더 좁은 타입을 줄 수 없다 —
 * 실제 타입 보장은 여기 도달하기 전에 `buildAnswerSchema`의 런타임 검증이 이미 끝낸다.
 */
export interface SubmitSurveyAnswerInput {
  surveyId: string;
  userId: string;
  answers: Record<string, unknown>;
  personalInformationStatus: boolean;
}

/**
 * 같은 응답자가 같은 설문에 이미 답변을 제출했을 때 {@link UserClient.submitSurveyAnswer}가
 * 던지는 에러. 답변 데이터 자체를 이 서비스가 갖지 않으므로, 중복 판정은 실제로 답변을 들고
 * 있는 유저 서비스만 할 수 있다.
 */
export class DuplicateSurveyAnswerError extends Error {}

/** 유저(교육생/일반 참가자) 서비스에 대한 게이트웨이. */
export interface UserClient {
  /** 해당 박람회에서 이 전화번호로 등록된 신청자를 찾는다. 없으면 null. */
  findByPhoneNumber(
    expoId: string,
    phoneNumber: string,
  ): Promise<UserLookupResult | null>;

  /**
   * 검증된 설문 답변을 저장한다. 이 서비스는 답변을 저장하지 않으므로 중복 제출 판정도
   * 여기서 한다 — 이미 제출한 적이 있으면 {@link DuplicateSurveyAnswerError}를 던진다.
   */
  submitSurveyAnswer(input: SubmitSurveyAnswerInput): Promise<void>;
}
