import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../authenticator/guards/jwt-auth.guard';
import { User } from '../shared/decorators';
import { UserRequest } from '../shared/interfaces';
import { onlyForAdmin } from '../shared/utils/permissions.function';
import { MongodbMaintenanceService } from './mongodb-maintenance.service';

@Controller('admin/mongodb')
@UseGuards(JwtAuthGuard)
export class MongodbMaintenanceController {
  constructor(private readonly maintenanceService: MongodbMaintenanceService) {}

  @Get('diagnostics')
  diagnostics(@User() user: UserRequest, @Query('cutoff') cutoff?: string) {
    this.ensureAdmin(user);
    return this.maintenanceService.diagnostics(cutoff);
  }

  @Post('cleanup/preview')
  preview(@User() user: UserRequest, @Body() body: any) {
    this.ensureAdmin(user);
    return this.maintenanceService.preview(body?.cutoff, body?.collections);
  }

  @Post('cleanup')
  cleanup(@User() user: UserRequest, @Body() body: any) {
    this.ensureAdmin(user);
    return this.maintenanceService.cleanup(
      body?.cutoff,
      body?.collections,
      body?.confirm,
    );
  }

  private ensureAdmin(user: UserRequest) {
    if (!onlyForAdmin(user?.type)) {
      throw new UnauthorizedException(
        'Somente admin/super admin pode executar manutenção do MongoDB.',
      );
    }
  }
}
