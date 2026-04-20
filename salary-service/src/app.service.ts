import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getLive() {
    return {
      status: 'ok',
      service: 'salary-service',
    };
  }
}
