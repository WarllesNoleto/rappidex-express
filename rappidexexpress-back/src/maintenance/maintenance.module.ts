import { Module } from '@nestjs/common';
import { MongodbMaintenanceController } from './mongodb-maintenance.controller';
import { MongodbMaintenanceService } from './mongodb-maintenance.service';

@Module({
  controllers: [MongodbMaintenanceController],
  providers: [MongodbMaintenanceService],
})
export class MaintenanceModule {}
