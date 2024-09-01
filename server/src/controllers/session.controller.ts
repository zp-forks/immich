import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthDto } from 'src/dtos/auth.dto';
import { SessionResponseDto } from 'src/dtos/session.dto';
import { Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { SessionService } from 'src/services/session.service';
import { UUIDParamDto } from 'src/validation';

@ApiTags('Sessions')
@Controller('sessions')
export class SessionController {
  constructor(private service: SessionService) {}

  @Get()
  @Authenticated({ permission: Permission.SESSION_READ })
  getSessions(@Auth() auth: AuthDto): Promise<SessionResponseDto[]> {
    return this.service.getAll(auth);
  }

  @Delete()
  @Authenticated({ permission: Permission.SESSION_DELETE })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAllSessions(@Auth() auth: AuthDto): Promise<void> {
    return this.service.deleteAll(auth);
  }

  @Delete(':id')
  @Authenticated({ permission: Permission.SESSION_DELETE })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSession(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    return this.service.delete(auth, id);
  }
}
