import { ParticipationType } from '../common/enums/participation-type.enum.js';

/** {@link ParticipantClient}를 주입받을 때 쓰는 DI 토큰. */
export const PARTICIPANT_CLIENT = 'PARTICIPANT_CLIENT';

/** 전화번호로 찾아낸 신청자를 식별하는 값. */
export interface ParticipantLookupResult {
  participantId: string;
  participationType: ParticipationType;
}

/** 유저(교육생/일반 참가자) 서비스에 대한 읽기 전용 게이트웨이. */
export interface ParticipantClient {
  /** 해당 박람회에서 이 전화번호로 등록된 신청자를 찾는다. 없으면 null. */
  findByPhoneNumber(
    expoId: string,
    phoneNumber: string,
  ): Promise<ParticipantLookupResult | null>;
}
