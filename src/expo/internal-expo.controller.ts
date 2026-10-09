import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InternalTokenGuard } from '../common/http/internal-token.guard.js';
import { ExpoPurgeService } from './expo-purge.service.js';

/**
 * 다른 서비스가 부르는 `/internal/expos` 엔트리포인트. Gateway를 거치지 않고 `X-Internal-Token`으로만
 * 인증한다({@link InternalTokenGuard}).
 */
@ApiTags('internal')
@UseGuards(InternalTokenGuard)
@Controller('internal/expos')
export class InternalExpoController {
  constructor(private readonly expoPurgeService: ExpoPurgeService) {}

  /** 박람회 서비스가 박람회를 지울 때 이 서비스의 데이터를 정리한다(v1 `DeleteExpo`). */
  @ApiOperation({
    summary: '박람회 데이터 삭제 (내부)',
    description:
      '박람회의 폼·설문과 문항, 공개 링크 답변, 답변 접수 기록을 모두 삭제하고 삭제 기록을 남긴다. 삭제 기록이 있는 박람회에는 폼·설문을 새로 만들 수 없다. 이미 삭제됐거나 데이터가 없어도 204라 실패 후 다시 불러도 안전하다.',
  })
  @ApiNoContentResponse({ description: '삭제 완료' })
  @Delete(':expoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async purge(@Param('expoId', ParseUUIDPipe) expoId: string): Promise<void> {
    return this.expoPurgeService.purge(expoId);
  }
}
