import { Controller, Post, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SegmentService } from './segment.service';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.interface';

@Controller('segments')
@UseGuards(AuthGuard('jwt'))
export class SegmentController {
  constructor(private readonly segmentService: SegmentService) {}

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  retry(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.segmentService.retrySegment(id, user.sub);
  }
}
