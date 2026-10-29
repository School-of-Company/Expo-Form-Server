import { Injectable, Logger } from '@nestjs/common';
import { ParticipationType } from '../common/enums/participation-type.enum.js';
import {
  GiftPickupTokenInvalidException,
  SurveyNotFoundException,
} from '../common/exceptions/domain.exception.js';
import {
  ConfirmGiftPickupRequestDto,
  GiftPickupStatusRequestDto,
  GiftPickupStatusResponseDto,
  GiftPinResponseDto,
  UpdateGiftPinRequestDto,
} from './dto/survey-gift.dto.js';
import { hashGiftToken, hashPin } from './gift-secret.js';
import { SurveyGiftStore } from './survey-gift.store.js';
import { SurveyStore } from './survey.store.js';

/**
 * 공개 설문 응답별 기념품 수령 확인. 제출자가 받은 토큰만으로 수령을 완료하는 흐름(#267)과, 이제 확인에 쓰이지 않는
 * 직원 PIN 설정(#239)을 맡는다. PIN·토큰 원문은 로그에 남기지 않는다.
 */
@Injectable()
export class SurveyGiftService {
  private readonly logger = new Logger(SurveyGiftService.name);

  constructor(
    private readonly surveyStore: SurveyStore,
    private readonly giftStore: SurveyGiftStore,
  ) {}

  /**
   * 직원 PIN이 설정돼 있는지만 조회한다.
   *
   * @throws {SurveyNotFoundException} 그 박람회에 일반 참가자 설문이 없을 때
   */
  async findPin(expoId: string): Promise<GiftPinResponseDto> {
    const surveyId = await this.findSurveyId(expoId);
    return { configured: await this.giftStore.hasPin(surveyId) };
  }

  /** 직원 PIN을 설정하거나 바꾼다. 바꾸면 그 뒤 확인부터 옛 PIN은 통하지 않는다. */
  async updatePin(
    expoId: string,
    dto: UpdateGiftPinRequestDto,
  ): Promise<GiftPinResponseDto> {
    const surveyId = await this.findSurveyId(expoId);
    await this.giftStore.savePin(surveyId, await hashPin(dto.pin));

    this.logger.log(`기념품 직원 PIN 설정 완료: surveyId=${surveyId}`);

    return { configured: true };
  }

  /**
   * 토큰의 수령 상태만 돌려준다.
   *
   * @throws {GiftPickupTokenInvalidException} 토큰이 없거나 다른 박람회의 것일 때
   */
  async findStatus(
    expoId: string,
    dto: GiftPickupStatusRequestDto,
  ): Promise<GiftPickupStatusResponseDto> {
    const surveyId = await this.findSurveyId(expoId);
    const state = await this.giftStore.findState(
      surveyId,
      hashGiftToken(dto.token),
    );
    if (!state) {
      throw new GiftPickupTokenInvalidException();
    }

    return toStatus(state.claimedAt, state.pinConfigured);
  }

  /**
   * 토큰만으로 수령을 완료한다(직원 PIN은 보지 않는다). 이미 완료된 토큰은 기존 완료 상태를 그대로 돌려준다.
   * 요청에 `pin`이 있어도 무시한다 — 이전 클라이언트와의 호환용이다.
   *
   * @throws {GiftPickupTokenInvalidException} 토큰이 없거나 다른 박람회의 것일 때
   */
  async confirm(
    expoId: string,
    dto: ConfirmGiftPickupRequestDto,
  ): Promise<GiftPickupStatusResponseDto> {
    const surveyId = await this.findSurveyId(expoId);
    const result = await this.giftStore.confirm(
      surveyId,
      hashGiftToken(dto.token),
    );
    if (result.status === 'NOT_FOUND') {
      throw new GiftPickupTokenInvalidException();
    }

    if (!result.alreadyClaimed) {
      this.logger.log(`기념품 수령 완료: surveyId=${surveyId}`);
    }

    return toStatus(result.claimedAt, await this.giftStore.hasPin(surveyId));
  }

  private async findSurveyId(expoId: string): Promise<string> {
    const survey = await this.surveyStore.findByExpoAndType(
      expoId,
      ParticipationType.STANDARD,
    );
    if (!survey) {
      throw new SurveyNotFoundException();
    }

    return survey.id;
  }
}

function toStatus(
  claimedAt: Date | null,
  pinConfigured: boolean,
): GiftPickupStatusResponseDto {
  return {
    claimed: claimedAt !== null,
    claimedAt: claimedAt?.toISOString() ?? null,
    pinConfigured,
  };
}
