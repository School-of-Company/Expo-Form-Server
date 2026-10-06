import { ParticipationType } from '../common/enums/participation-type.enum.js';

/** {@link UserClient}를 주입받을 때 쓰는 DI 토큰. */
export const USER_CLIENT = 'USER_CLIENT';

/**
 * 응답자를 찾을 때 넘기는 값. 유저 서비스의 `(expo_id, phone_number)` 유니크 제약은
 * 참여자군 테이블마다 따로 걸려 있어서, 같은 번호가 교육생과 일반 참가자 양쪽에 있을 수 있다 —
 * 그래서 어느 참여자군에서 찾을지 호출하는 쪽이 정한다.
 */
export type ParticipantLookupInput = {
  expoId: string;
  /** {@link normalizePhoneNumber}로 정규화된 값. */
  phoneNumber: string;
  participationType: ParticipationType;
};

/** 찾아낸 응답자. */
export type ParticipantLookupResult = {
  participantId: number;
  participationType: ParticipationType;
};

/**
 * 유저(교육생/일반 참가자) 서비스에 대한 게이트웨이.
 *
 * 설문 답변 저장(`submitSurveyAnswer`)은 더 이상 이 게이트웨이를 거치지 않는다(#29) —
 * 접수 자체는 `SurveyAnswerSubmissionStore`에 남기고, 실제 저장 위임은 Kafka 이벤트로
 * 비동기 전달한다. 동기 호출로 남는 건 응답자 식별뿐이다.
 */
export interface UserClient {
  /**
   * 해당 박람회·참여자군에서 이 전화번호로 등록된 응답자를 찾는다. 없으면 null.
   *
   * @throws {ExternalServiceUnavailableException} 유저 서비스에서 응답을 받지 못했을 때 —
   *   "없음"으로 돌려보내면 정상 응답자가 거절되므로 구분한다
   * @throws {ParticipantAmbiguousException} 같은 번호가 여러 표기로 저장돼 응답자를 특정할 수 없을 때(409)
   */
  findParticipant(
    input: ParticipantLookupInput,
  ): Promise<ParticipantLookupResult | null>;
}
