import { Inject, Injectable } from '@nestjs/common';
import { StorageCore, StorageFolder } from 'src/cores/storage.core';
import { OnEmit } from 'src/decorators';
import { IDeleteFilesJob, JobStatus } from 'src/interfaces/job.interface';
import { ILoggerRepository } from 'src/interfaces/logger.interface';
import { IStorageRepository } from 'src/interfaces/storage.interface';

@Injectable()
export class StorageService {
  constructor(
    @Inject(IStorageRepository) private storageRepository: IStorageRepository,
    @Inject(ILoggerRepository) private logger: ILoggerRepository,
  ) {
    this.logger.setContext(StorageService.name);
  }

  @OnEmit({ event: 'app.bootstrap' })
  onBootstrap() {
    const libraryBase = StorageCore.getBaseFolder(StorageFolder.LIBRARY);
    this.storageRepository.mkdirSync(libraryBase);
  }

  async handleDeleteFiles(job: IDeleteFilesJob) {
    const { files } = job;

    // TODO: one job per file
    for (const file of files) {
      if (!file) {
        continue;
      }

      try {
        await this.storageRepository.unlink(file);
      } catch (error: any) {
        this.logger.warn('Unable to remove file from disk', error);
      }
    }

    return JobStatus.SUCCESS;
  }
}
