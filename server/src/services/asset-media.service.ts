import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { extname } from 'node:path';
import sanitize from 'sanitize-filename';
import { StorageCore, StorageFolder } from 'src/cores/storage.core';
import {
  AssetBulkUploadCheckResponseDto,
  AssetMediaResponseDto,
  AssetMediaStatus,
  AssetRejectReason,
  AssetUploadAction,
  CheckExistingAssetsResponseDto,
} from 'src/dtos/asset-media-response.dto';
import {
  AssetBulkUploadCheckDto,
  AssetMediaCreateDto,
  AssetMediaOptionsDto,
  AssetMediaReplaceDto,
  AssetMediaSize,
  CheckExistingAssetsDto,
  UploadFieldName,
} from 'src/dtos/asset-media.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { ASSET_CHECKSUM_CONSTRAINT, AssetEntity } from 'src/entities/asset.entity';
import { AssetType, Permission } from 'src/enum';
import { IAccessRepository } from 'src/interfaces/access.interface';
import { IAssetRepository } from 'src/interfaces/asset.interface';
import { ClientEvent, IEventRepository } from 'src/interfaces/event.interface';
import { IJobRepository, JobName } from 'src/interfaces/job.interface';
import { ILoggerRepository } from 'src/interfaces/logger.interface';
import { IStorageRepository } from 'src/interfaces/storage.interface';
import { IUserRepository } from 'src/interfaces/user.interface';
import { requireAccess, requireUploadAccess } from 'src/utils/access';
import { getAssetFiles } from 'src/utils/asset.util';
import { CacheControl, ImmichFileResponse } from 'src/utils/file';
import { mimeTypes } from 'src/utils/mime-types';
import { fromChecksum } from 'src/utils/request';
import { QueryFailedError } from 'typeorm';
export interface UploadRequest {
  auth: AuthDto | null;
  fieldName: UploadFieldName;
  file: UploadFile;
}

export interface UploadFile {
  uuid: string;
  checksum: Buffer;
  originalPath: string;
  originalName: string;
  size: number;
}

@Injectable()
export class AssetMediaService {
  constructor(
    @Inject(IAccessRepository) private access: IAccessRepository,
    @Inject(IAssetRepository) private assetRepository: IAssetRepository,
    @Inject(IJobRepository) private jobRepository: IJobRepository,
    @Inject(IStorageRepository) private storageRepository: IStorageRepository,
    @Inject(IUserRepository) private userRepository: IUserRepository,
    @Inject(IEventRepository) private eventRepository: IEventRepository,
    @Inject(ILoggerRepository) private logger: ILoggerRepository,
  ) {
    this.logger.setContext(AssetMediaService.name);
  }

  async getUploadAssetIdByChecksum(auth: AuthDto, checksum?: string): Promise<AssetMediaResponseDto | undefined> {
    if (!checksum) {
      return;
    }

    const assetId = await this.assetRepository.getUploadAssetIdByChecksum(auth.user.id, fromChecksum(checksum));
    if (!assetId) {
      return;
    }

    return { id: assetId, status: AssetMediaStatus.DUPLICATE };
  }

  canUploadFile({ auth, fieldName, file }: UploadRequest): true {
    requireUploadAccess(auth);

    const filename = file.originalName;

    switch (fieldName) {
      case UploadFieldName.ASSET_DATA: {
        if (mimeTypes.isAsset(filename)) {
          return true;
        }
        break;
      }

      case UploadFieldName.SIDECAR_DATA: {
        if (mimeTypes.isSidecar(filename)) {
          return true;
        }
        break;
      }

      case UploadFieldName.PROFILE_DATA: {
        if (mimeTypes.isProfile(filename)) {
          return true;
        }
        break;
      }
    }

    this.logger.error(`Unsupported file type ${filename}`);
    throw new BadRequestException(`Unsupported file type ${filename}`);
  }

  getUploadFilename({ auth, fieldName, file }: UploadRequest): string {
    requireUploadAccess(auth);

    const originalExtension = extname(file.originalName);

    const lookup = {
      [UploadFieldName.ASSET_DATA]: originalExtension,
      [UploadFieldName.SIDECAR_DATA]: '.xmp',
      [UploadFieldName.PROFILE_DATA]: originalExtension,
    };

    return sanitize(`${file.uuid}${lookup[fieldName]}`);
  }

  getUploadFolder({ auth, fieldName, file }: UploadRequest): string {
    auth = requireUploadAccess(auth);

    let folder = StorageCore.getNestedFolder(StorageFolder.UPLOAD, auth.user.id, file.uuid);
    if (fieldName === UploadFieldName.PROFILE_DATA) {
      folder = StorageCore.getFolderLocation(StorageFolder.PROFILE, auth.user.id);
    }

    this.storageRepository.mkdirSync(folder);

    return folder;
  }

  async uploadAsset(
    auth: AuthDto,
    dto: AssetMediaCreateDto,
    file: UploadFile,
    sidecarFile?: UploadFile,
  ): Promise<AssetMediaResponseDto> {
    try {
      await requireAccess(this.access, {
        auth,
        permission: Permission.ASSET_UPLOAD,
        // do not need an id here, but the interface requires it
        ids: [auth.user.id],
      });

      this.requireQuota(auth, file.size);

      if (dto.livePhotoVideoId) {
        const motionAsset = await this.assetRepository.getById(dto.livePhotoVideoId);
        if (!motionAsset) {
          throw new BadRequestException('Live photo video not found');
        }
        if (motionAsset.type !== AssetType.VIDEO) {
          throw new BadRequestException('Live photo vide must be a video');
        }
        if (motionAsset.ownerId !== auth.user.id) {
          throw new BadRequestException('Live photo video does not belong to the user');
        }
        if (motionAsset.isVisible) {
          await this.assetRepository.update({ id: motionAsset.id, isVisible: false });
          this.eventRepository.clientSend(ClientEvent.ASSET_HIDDEN, auth.user.id, motionAsset.id);
        }
      }

      const asset = await this.create(auth.user.id, dto, file, sidecarFile);

      await this.userRepository.updateUsage(auth.user.id, file.size);

      return { id: asset.id, status: AssetMediaStatus.CREATED };
    } catch (error: any) {
      return this.handleUploadError(error, auth, file, sidecarFile);
    }
  }

  async replaceAsset(
    auth: AuthDto,
    id: string,
    dto: AssetMediaReplaceDto,
    file: UploadFile,
    sidecarFile?: UploadFile,
  ): Promise<AssetMediaResponseDto> {
    try {
      await requireAccess(this.access, { auth, permission: Permission.ASSET_UPDATE, ids: [id] });
      const asset = (await this.assetRepository.getById(id)) as AssetEntity;

      this.requireQuota(auth, file.size);

      await this.replaceFileData(asset.id, dto, file, sidecarFile?.originalPath);

      // Next, create a backup copy of the existing record. The db record has already been updated above,
      // but the local variable holds the original file data paths.
      const copiedPhoto = await this.createCopy(asset);
      // and immediate trash it
      await this.assetRepository.softDeleteAll([copiedPhoto.id]);

      this.eventRepository.clientSend(ClientEvent.ASSET_TRASH, auth.user.id, [copiedPhoto.id]);

      await this.userRepository.updateUsage(auth.user.id, file.size);

      return { status: AssetMediaStatus.REPLACED, id: copiedPhoto.id };
    } catch (error: any) {
      return this.handleUploadError(error, auth, file, sidecarFile);
    }
  }

  async downloadOriginal(auth: AuthDto, id: string): Promise<ImmichFileResponse> {
    await requireAccess(this.access, { auth, permission: Permission.ASSET_DOWNLOAD, ids: [id] });

    const asset = await this.findOrFail(id);
    if (!asset) {
      throw new NotFoundException('Asset does not exist');
    }

    return new ImmichFileResponse({
      path: asset.originalPath,
      contentType: mimeTypes.lookup(asset.originalPath),
      cacheControl: CacheControl.PRIVATE_WITH_CACHE,
    });
  }

  async viewThumbnail(auth: AuthDto, id: string, dto: AssetMediaOptionsDto): Promise<ImmichFileResponse> {
    await requireAccess(this.access, { auth, permission: Permission.ASSET_VIEW, ids: [id] });

    const asset = await this.findOrFail(id);
    const size = dto.size ?? AssetMediaSize.THUMBNAIL;

    const { thumbnailFile, previewFile } = getAssetFiles(asset.files);
    let filepath = previewFile?.path;
    if (size === AssetMediaSize.THUMBNAIL && thumbnailFile) {
      filepath = thumbnailFile.path;
    }

    if (!filepath) {
      throw new NotFoundException('Asset media not found');
    }

    return new ImmichFileResponse({
      path: filepath,
      contentType: mimeTypes.lookup(filepath),
      cacheControl: CacheControl.PRIVATE_WITH_CACHE,
    });
  }

  async playbackVideo(auth: AuthDto, id: string): Promise<ImmichFileResponse> {
    await requireAccess(this.access, { auth, permission: Permission.ASSET_VIEW, ids: [id] });

    const asset = await this.findOrFail(id);
    if (!asset) {
      throw new NotFoundException('Asset does not exist');
    }

    if (asset.type !== AssetType.VIDEO) {
      throw new BadRequestException('Asset is not a video');
    }

    const filepath = asset.encodedVideoPath || asset.originalPath;

    return new ImmichFileResponse({
      path: filepath,
      contentType: mimeTypes.lookup(filepath),
      cacheControl: CacheControl.PRIVATE_WITH_CACHE,
    });
  }

  async checkExistingAssets(
    auth: AuthDto,
    checkExistingAssetsDto: CheckExistingAssetsDto,
  ): Promise<CheckExistingAssetsResponseDto> {
    const existingIds = await this.assetRepository.getByDeviceIds(
      auth.user.id,
      checkExistingAssetsDto.deviceId,
      checkExistingAssetsDto.deviceAssetIds,
    );
    return { existingIds };
  }

  async bulkUploadCheck(auth: AuthDto, dto: AssetBulkUploadCheckDto): Promise<AssetBulkUploadCheckResponseDto> {
    const checksums: Buffer[] = dto.assets.map((asset) => fromChecksum(asset.checksum));
    const results = await this.assetRepository.getByChecksums(auth.user.id, checksums);
    const checksumMap: Record<string, string> = {};

    for (const { id, checksum } of results) {
      checksumMap[checksum.toString('hex')] = id;
    }

    return {
      results: dto.assets.map(({ id, checksum }) => {
        const duplicate = checksumMap[fromChecksum(checksum).toString('hex')];
        if (duplicate) {
          return {
            id,
            assetId: duplicate,
            action: AssetUploadAction.REJECT,
            reason: AssetRejectReason.DUPLICATE,
          };
        }

        // TODO mime-check

        return {
          id,
          action: AssetUploadAction.ACCEPT,
        };
      }),
    };
  }

  private async handleUploadError(
    error: any,
    auth: AuthDto,
    file: UploadFile,
    sidecarFile?: UploadFile,
  ): Promise<AssetMediaResponseDto> {
    // clean up files
    await this.jobRepository.queue({
      name: JobName.DELETE_FILES,
      data: { files: [file.originalPath, sidecarFile?.originalPath] },
    });

    // handle duplicates with a success response
    if (error instanceof QueryFailedError && (error as any).constraint === ASSET_CHECKSUM_CONSTRAINT) {
      const duplicateId = await this.assetRepository.getUploadAssetIdByChecksum(auth.user.id, file.checksum);
      if (!duplicateId) {
        this.logger.error(`Error locating duplicate for checksum constraint`);
        throw new InternalServerErrorException();
      }
      return { status: AssetMediaStatus.DUPLICATE, id: duplicateId };
    }

    this.logger.error(`Error uploading file ${error}`, error?.stack);
    throw error;
  }

  /**
   * Updates the specified assetId to the specified photo data file properties: checksum, path,
   * timestamps, deviceIds, and sidecar. Derived properties like: faces, smart search info, etc
   * are UNTOUCHED. The photo data files modification times on the filesysytem are updated to
   * the specified timestamps. The exif db record is upserted, and then A METADATA_EXTRACTION
   * job is queued to update these derived properties.
   */
  private async replaceFileData(
    assetId: string,
    dto: AssetMediaReplaceDto,
    file: UploadFile,
    sidecarPath?: string,
  ): Promise<void> {
    await this.assetRepository.update({
      id: assetId,

      checksum: file.checksum,
      originalPath: file.originalPath,
      type: mimeTypes.assetType(file.originalPath),
      originalFileName: file.originalName,

      deviceAssetId: dto.deviceAssetId,
      deviceId: dto.deviceId,
      fileCreatedAt: dto.fileCreatedAt,
      fileModifiedAt: dto.fileModifiedAt,
      localDateTime: dto.fileCreatedAt,
      duration: dto.duration || null,

      livePhotoVideo: null,
      sidecarPath: sidecarPath || null,
    });

    await this.storageRepository.utimes(file.originalPath, new Date(), new Date(dto.fileModifiedAt));
    await this.assetRepository.upsertExif({ assetId, fileSizeInByte: file.size });
    await this.jobRepository.queue({
      name: JobName.METADATA_EXTRACTION,
      data: { id: assetId, source: 'upload' },
    });
  }

  /**
   * Create a 'shallow' copy of the specified asset record creating a new asset record in the database.
   * Uses only vital properties excluding things like: stacks, faces, smart search info, etc,
   * and then queues a METADATA_EXTRACTION job.
   */
  private async createCopy(asset: AssetEntity): Promise<AssetEntity> {
    const created = await this.assetRepository.create({
      ownerId: asset.ownerId,
      originalPath: asset.originalPath,
      originalFileName: asset.originalFileName,
      libraryId: asset.libraryId,
      deviceAssetId: asset.deviceAssetId,
      deviceId: asset.deviceId,
      type: asset.type,
      checksum: asset.checksum,
      fileCreatedAt: asset.fileCreatedAt,
      localDateTime: asset.localDateTime,
      fileModifiedAt: asset.fileModifiedAt,
      livePhotoVideoId: asset.livePhotoVideoId,
      sidecarPath: asset.sidecarPath,
    });

    const { size } = await this.storageRepository.stat(created.originalPath);
    await this.assetRepository.upsertExif({ assetId: created.id, fileSizeInByte: size });
    await this.jobRepository.queue({ name: JobName.METADATA_EXTRACTION, data: { id: created.id, source: 'copy' } });
    return created;
  }

  private async create(
    ownerId: string,
    dto: AssetMediaCreateDto,
    file: UploadFile,
    sidecarFile?: UploadFile,
  ): Promise<AssetEntity> {
    const asset = await this.assetRepository.create({
      ownerId,
      libraryId: null,

      checksum: file.checksum,
      originalPath: file.originalPath,

      deviceAssetId: dto.deviceAssetId,
      deviceId: dto.deviceId,

      fileCreatedAt: dto.fileCreatedAt,
      fileModifiedAt: dto.fileModifiedAt,
      localDateTime: dto.fileCreatedAt,

      type: mimeTypes.assetType(file.originalPath),
      isFavorite: dto.isFavorite,
      isArchived: dto.isArchived ?? false,
      duration: dto.duration || null,
      isVisible: dto.isVisible ?? true,
      livePhotoVideoId: dto.livePhotoVideoId,
      originalFileName: file.originalName,
      sidecarPath: sidecarFile?.originalPath,
      isOffline: dto.isOffline ?? false,
    });

    if (sidecarFile) {
      await this.storageRepository.utimes(sidecarFile.originalPath, new Date(), new Date(dto.fileModifiedAt));
    }
    await this.storageRepository.utimes(file.originalPath, new Date(), new Date(dto.fileModifiedAt));
    await this.assetRepository.upsertExif({ assetId: asset.id, fileSizeInByte: file.size });
    await this.jobRepository.queue({ name: JobName.METADATA_EXTRACTION, data: { id: asset.id, source: 'upload' } });

    return asset;
  }

  private requireQuota(auth: AuthDto, size: number) {
    if (auth.user.quotaSizeInBytes && auth.user.quotaSizeInBytes < auth.user.quotaUsageInBytes + size) {
      throw new BadRequestException('Quota has been exceeded!');
    }
  }

  private async findOrFail(id: string): Promise<AssetEntity> {
    const asset = await this.assetRepository.getById(id, { files: true });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return asset;
  }
}
