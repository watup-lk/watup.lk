import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { Submission } from './entities/submission.entity';
import { SubmissionsService } from './submissions.service';

@ApiTags('submissions')
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a salary entry',
    description: 'Creates a new salary submission pending review.',
  })
  @ApiCreatedResponse({
    description: 'Submission created successfully.',
    type: Submission,
  })
  async create(@Body() createSubmissionDto: CreateSubmissionDto) {
    return this.submissionsService.create(createSubmissionDto);
  }
}
