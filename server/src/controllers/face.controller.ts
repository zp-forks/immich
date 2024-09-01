import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthDto } from 'src/dtos/auth.dto';
import { AssetFaceResponseDto, FaceDto, PersonResponseDto } from 'src/dtos/person.dto';
import { Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { PersonService } from 'src/services/person.service';
import { UUIDParamDto } from 'src/validation';

@ApiTags('Faces')
@Controller('faces')
export class FaceController {
  constructor(private service: PersonService) {}

  @Get()
  @Authenticated({ permission: Permission.FACE_READ })
  getFaces(@Auth() auth: AuthDto, @Query() dto: FaceDto): Promise<AssetFaceResponseDto[]> {
    return this.service.getFacesById(auth, dto);
  }

  @Put(':id')
  @Authenticated({ permission: Permission.FACE_UPDATE })
  reassignFacesById(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: FaceDto,
  ): Promise<PersonResponseDto> {
    return this.service.reassignFacesById(auth, id, dto);
  }
}
