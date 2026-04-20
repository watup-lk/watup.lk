import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { FindSubmissionsQueryDto } from './dto/find-submissions-query.dto';
import { Submission } from './entities/submission.entity';
import { SubmissionStatus } from './enums/submission-status.enum';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectRepository(Submission)
    private readonly submissionRepository: Repository<Submission>,
  ) {}

  /**
   * Get all approved salary submissions, with optional filtering by role, country, 
   * experience level, work type, and currency.
   * 
   * @param query search filters
   * @returns list of approved submissions matching the filters
   */
  async findAll(query: FindSubmissionsQueryDto) {
    const where: Record<string, unknown> = {
      status: SubmissionStatus.APPROVED,
    };

    if (query.role) where.role = ILike(`%${query.role}%`);
    if (query.country) where.country = query.country.toUpperCase();
    if (query.experienceLevel) where.experienceLevel = query.experienceLevel;
    if (query.workType) where.workType = query.workType;
    if (query.currency) where.currency = query.currency.toUpperCase();

    const submissions = await this.submissionRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return submissions.map((s) => ({
      id: s.id,
      role: s.role,
      company: s.isAnonymized ? null : s.company,
      country: s.country,
      city: s.city,
      salaryAmount: Number(s.salaryAmount),
      currency: s.currency,
      experienceYears: s.experienceYears,
      experienceLevel: s.experienceLevel,
      workType: s.workType,
      createdAt: s.createdAt,
    }));
  }

  /**
   * Create a new salary submission.
   *
   * @param createSubmissionDto
   * @returns
   */
  async create(createSubmissionDto: CreateSubmissionDto) {
    const submission = this.submissionRepository.create({
      role: createSubmissionDto.role.trim(),
      company: createSubmissionDto.company?.trim() || null,
      country: createSubmissionDto.country?.trim().toUpperCase() || 'LK',
      city: createSubmissionDto.city?.trim() || null,
      salaryAmount: createSubmissionDto.salaryAmount.toFixed(2),
      currency: createSubmissionDto.currency?.trim().toUpperCase() || 'LKR',
      experienceYears: createSubmissionDto.experienceYears ?? null,
      experienceLevel: createSubmissionDto.experienceLevel ?? null,
      workType: createSubmissionDto.workType ?? null,
      isAnonymized: createSubmissionDto.anonymize ?? false,
      status: SubmissionStatus.PENDING,
    });

    const saved = await this.submissionRepository.save(submission);

    return {
      id: saved.id,
      role: saved.role,
      company: saved.company,
      country: saved.country,
      city: saved.city,
      monthlySalaryLKR: Number(saved.salaryAmount),
      currency: saved.currency,
      yearsOfExperience: saved.experienceYears,
      experienceLevel: saved.experienceLevel,
      workType: saved.workType,
      anonymize: saved.isAnonymized,
      status: saved.status,
      createdAt: saved.createdAt,
    };
  }
}
