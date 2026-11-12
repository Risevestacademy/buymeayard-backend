import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { UserRole } from '@buymeayard/types';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AdminMaterialsService } from './admin-materials.service';
import {
  AdminCreateMaterialDto,
  AdminMaterialsQueryDto,
  AdminUpdateMaterialDto,
  ThumbnailUploadResponseDto,
} from './admin-materials.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/materials')
export class AdminMaterialsController {
  constructor(private readonly materials: AdminMaterialsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List all materials (platform and creator) with totals, creator-page visibility and last updated',
  })
  list(@Query() query: AdminMaterialsQueryDto) {
    return this.materials.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Material detail with every creator using it',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.materials.get(id);
  }

  @Post('thumbnail')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a material thumbnail image',
    description:
      'Uploads one image (JPEG, PNG or WebP, max 5 MB) and returns its URL. Call it once per image, then send the returned `url` as `thumbnailLargeUrl` or `thumbnailSmallUrl` on POST /admin/materials or PATCH /admin/materials/:id. It does not change any material by itself.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, type: ThumbnailUploadResponseDto })
  @ApiResponse({
    status: 400,
    description: 'No file, wrong file type, or file too large.',
    type: ErrorResponseDto,
  })
  uploadThumbnail(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp)$/,
            fallbackToMimetype: true,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.materials.uploadThumbnail(file);
  }

  @Post()
  @ApiOperation({ summary: 'Create a platform or creator material' })
  create(
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminCreateMaterialDto,
  ) {
    return this.materials.create(adminId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a material (any field, incl. price/status)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminUpdateMaterialDto,
  ) {
    return this.materials.update(id, adminId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a material, or deactivate it if it has support history',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.materials.remove(id, adminId);
  }
}
