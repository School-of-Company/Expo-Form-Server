import { ParticipationType } from '../common/enums/participation-type.enum.js';

/** {@link UserClient}를 주입받을 때 쓰는 DI 토큰. */
export const USER_CLIENT = 'USER_CLIENT';

/** 전화번호로 찾아낸 신청자를 식별하는 값. */
export interface UserLookupResult {
  userId: string;
  participationType: ParticipationType;
}

/**
 * 유저(교육생/일반 참가자) 서비스에 대한 게이트웨이.
 *
 * 설문 답변 저장(`submitSurveyAnswer`)은 더 이상 이 게이트웨이를 거치지 않는다(#29) —
 * 접수 자체는 `SurveyAnswerSubmissionStore`에 남기고, 실제 저장 위임은 Kafka 이벤트로
 * 비동기 전달한다. 동기 호출로 남는 건 응답자 식별뿐이다.
 */
export interface UserClient {
  /** 해당 박람회에서 이 전화번호로 등록된 신청자를 찾는다. 없으면 null. */
  findByPhoneNumber(
    expoId: string,
    phoneNumber: string,
  ): Promise<UserLookupResult | null>;
}
