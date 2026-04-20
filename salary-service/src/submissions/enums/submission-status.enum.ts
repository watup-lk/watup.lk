import { ApiProperty } from '@nestjs/swagger';

/**
 * Review status of a salary submission.
 * @enum {string}
 */
export enum SubmissionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const SubmissionStatusApiProperty = ApiProperty({
  enum: SubmissionStatus,
  enumName: 'SubmissionStatus',
  description: 'Review status of the submission',
  example: SubmissionStatus.PENDING,
});
