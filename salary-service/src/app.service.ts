import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getLive() {
    return {
      status: 'ok',
      service: 'salary-service',
    };
  }
}
