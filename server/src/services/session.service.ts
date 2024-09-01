import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AuthDto } from 'src/dtos/auth.dto';
import { SessionResponseDto, mapSession } from 'src/dtos/session.dto';
import { Permission } from 'src/enum';
import { IAccessRepository } from 'src/interfaces/access.interface';
import { JobStatus } from 'src/interfaces/job.interface';
import { ILoggerRepository } from 'src/interfaces/logger.interface';
import { ISessionRepository } from 'src/interfaces/session.interface';
import { requireAccess } from 'src/utils/access';

@Injectable()
export class SessionService {
  constructor(
    @Inject(IAccessRepository) private access: IAccessRepository,
    @Inject(ILoggerRepository) private logger: ILoggerRepository,
    @Inject(ISessionRepository) private sessionRepository: ISessionRepository,
  ) {
    this.logger.setContext(SessionService.name);
  }

  async handleCleanup() {
    const sessions = await this.sessionRepository.search({
      updatedBefore: DateTime.now().minus({ days: 90 }).toJSDate(),
    });

    if (sessions.length === 0) {
      return JobStatus.SKIPPED;
    }

    for (const session of sessions) {
      await this.sessionRepository.delete(session.id);
      this.logger.verbose(`Deleted expired session token: ${session.deviceOS}/${session.deviceType}`);
    }

    this.logger.log(`Deleted ${sessions.length} expired session tokens`);

    return JobStatus.SUCCESS;
  }

  async getAll(auth: AuthDto): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionRepository.getByUserId(auth.user.id);
    return sessions.map((session) => mapSession(session, auth.session?.id));
  }

  async delete(auth: AuthDto, id: string): Promise<void> {
    await requireAccess(this.access, { auth, permission: Permission.AUTH_DEVICE_DELETE, ids: [id] });
    await this.sessionRepository.delete(id);
  }

  async deleteAll(auth: AuthDto): Promise<void> {
    const sessions = await this.sessionRepository.getByUserId(auth.user.id);
    for (const session of sessions) {
      if (session.id === auth.session?.id) {
        continue;
      }
      await this.sessionRepository.delete(session.id);
    }
  }
}
