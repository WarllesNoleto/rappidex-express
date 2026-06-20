import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  isMongoQuotaError,
  mongoQuotaFriendlyMessage,
} from './mongodb-quota.util';

@Catch()
export class MongoDbQuotaExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (isMongoQuotaError(exception)) {
      return response.status(507).json({
        statusCode: 507,
        error: 'MongoDB storage quota exceeded',
        message: mongoQuotaFriendlyMessage(),
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return response.status(status).json(exception.getResponse());
    }

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno no servidor.',
    });
  }
}
