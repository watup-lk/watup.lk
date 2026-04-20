import { ApiProperty } from '@nestjs/swagger';

/**
 * Represents the seniority level of a candidate.
 * @enum {string}
 */
export enum ExperienceLevel {
  JUNIOR = 'junior',
  MID = 'mid',
  SENIOR = 'senior',
  LEAD = 'lead',
  PRINCIPAL = 'principal',
}

export const ExperienceLevelApiProperty = ApiProperty({
  enum: ExperienceLevel,
  enumName: 'ExperienceLevel',
  description: 'Seniority level of the candidate',
  example: ExperienceLevel.MID,
});
