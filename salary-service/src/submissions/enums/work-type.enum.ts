import { ApiProperty } from '@nestjs/swagger';

/**
 * Work arrangement type for a role.
 * @enum {string}
 */
export enum WorkType {
  REMOTE = 'Remote',
  HYBRID = 'Hybrid',
  ONSITE = 'Onsite',
}

export const WorkTypeApiProperty = ApiProperty({
  enum: WorkType,
  enumName: 'WorkType',
  description: 'Work arrangement type',
  example: WorkType.HYBRID,
});
