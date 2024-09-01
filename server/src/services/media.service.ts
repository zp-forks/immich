import { Inject, Injectable, UnsupportedMediaTypeException } from '@nestjs/common';
import { dirname } from 'node:path';
import {
  AudioCodec,
  Colorspace,
  ImageFormat,
  TranscodeHWAccel,
  TranscodePolicy,
  TranscodeTarget,
  VideoCodec,
  VideoContainer,
} from 'src/config';
import { GeneratedImageType, StorageCore, StorageFolder } from 'src/cores/storage.core';
import { SystemConfigCore } from 'src/cores/system-config.core';
import { SystemConfigFFmpegDto } from 'src/dtos/system-config.dto';
import { AssetEntity } from 'src/entities/asset.entity';
import { AssetPathType } from 'src/entities/move.entity';
import { AssetFileType, AssetType } from 'src/enum';
import { IAssetRepository, WithoutProperty } from 'src/interfaces/asset.interface';
import { ICryptoRepository } from 'src/interfaces/crypto.interface';
import {
  IBaseJob,
  IEntityJob,
  IJobRepository,
  JOBS_ASSET_PAGINATION_SIZE,
  JobItem,
  JobName,
  JobStatus,
  QueueName,
} from 'src/interfaces/job.interface';
import { ILoggerRepository } from 'src/interfaces/logger.interface';
import { AudioStreamInfo, IMediaRepository, VideoFormat, VideoStreamInfo } from 'src/interfaces/media.interface';
import { IMoveRepository } from 'src/interfaces/move.interface';
import { IPersonRepository } from 'src/interfaces/person.interface';
import { IStorageRepository } from 'src/interfaces/storage.interface';
import { ISystemMetadataRepository } from 'src/interfaces/system-metadata.interface';
import { getAssetFiles } from 'src/utils/asset.util';
import { BaseConfig, ThumbnailConfig } from 'src/utils/media';
import { mimeTypes } from 'src/utils/mime-types';
import { usePagination } from 'src/utils/pagination';

@Injectable()
export class MediaService {
  private configCore: SystemConfigCore;
  private storageCore: StorageCore;
  private maliOpenCL?: boolean;
  private devices?: string[];

  constructor(
    @Inject(IAssetRepository) private assetRepository: IAssetRepository,
    @Inject(IPersonRepository) private personRepository: IPersonRepository,
    @Inject(IJobRepository) private jobRepository: IJobRepository,
    @Inject(IMediaRepository) private mediaRepository: IMediaRepository,
    @Inject(IStorageRepository) private storageRepository: IStorageRepository,
    @Inject(ISystemMetadataRepository) systemMetadataRepository: ISystemMetadataRepository,
    @Inject(IMoveRepository) moveRepository: IMoveRepository,
    @Inject(ICryptoRepository) cryptoRepository: ICryptoRepository,
    @Inject(ILoggerRepository) private logger: ILoggerRepository,
  ) {
    this.logger.setContext(MediaService.name);
    this.configCore = SystemConfigCore.create(systemMetadataRepository, this.logger);
    this.storageCore = StorageCore.create(
      assetRepository,
      cryptoRepository,
      moveRepository,
      personRepository,
      storageRepository,
      systemMetadataRepository,
      this.logger,
    );
  }

  async handleQueueGenerateThumbnails({ force }: IBaseJob): Promise<JobStatus> {
    const assetPagination = usePagination(JOBS_ASSET_PAGINATION_SIZE, (pagination) => {
      return force
        ? this.assetRepository.getAll(pagination, {
            isVisible: true,
            withDeleted: true,
            withArchived: true,
          })
        : this.assetRepository.getWithout(pagination, WithoutProperty.THUMBNAIL);
    });

    for await (const assets of assetPagination) {
      const jobs: JobItem[] = [];

      for (const asset of assets) {
        const { previewFile, thumbnailFile } = getAssetFiles(asset.files);

        if (!previewFile || force) {
          jobs.push({ name: JobName.GENERATE_PREVIEW, data: { id: asset.id } });
          continue;
        }

        if (!thumbnailFile) {
          jobs.push({ name: JobName.GENERATE_THUMBNAIL, data: { id: asset.id } });
        }

        if (!asset.thumbhash) {
          jobs.push({ name: JobName.GENERATE_THUMBHASH, data: { id: asset.id } });
        }
      }

      await this.jobRepository.queueAll(jobs);
    }

    const jobs: JobItem[] = [];
    const personPagination = usePagination(JOBS_ASSET_PAGINATION_SIZE, (pagination) =>
      this.personRepository.getAll(pagination, { where: force ? undefined : { thumbnailPath: '' } }),
    );

    for await (const people of personPagination) {
      for (const person of people) {
        if (!person.faceAssetId) {
          const face = await this.personRepository.getRandomFace(person.id);
          if (!face) {
            continue;
          }

          await this.personRepository.update({ id: person.id, faceAssetId: face.id });
        }

        jobs.push({ name: JobName.GENERATE_PERSON_THUMBNAIL, data: { id: person.id } });
      }
    }

    await this.jobRepository.queueAll(jobs);

    return JobStatus.SUCCESS;
  }

  async handleQueueMigration(): Promise<JobStatus> {
    const assetPagination = usePagination(JOBS_ASSET_PAGINATION_SIZE, (pagination) =>
      this.assetRepository.getAll(pagination),
    );

    const { active, waiting } = await this.jobRepository.getJobCounts(QueueName.MIGRATION);
    if (active === 1 && waiting === 0) {
      await this.storageCore.removeEmptyDirs(StorageFolder.THUMBNAILS);
      await this.storageCore.removeEmptyDirs(StorageFolder.ENCODED_VIDEO);
    }

    for await (const assets of assetPagination) {
      await this.jobRepository.queueAll(
        assets.map((asset) => ({ name: JobName.MIGRATE_ASSET, data: { id: asset.id } })),
      );
    }

    const personPagination = usePagination(JOBS_ASSET_PAGINATION_SIZE, (pagination) =>
      this.personRepository.getAll(pagination),
    );

    for await (const people of personPagination) {
      await this.jobRepository.queueAll(
        people.map((person) => ({ name: JobName.MIGRATE_PERSON, data: { id: person.id } })),
      );
    }

    return JobStatus.SUCCESS;
  }

  async handleAssetMigration({ id }: IEntityJob): Promise<JobStatus> {
    const { image } = await this.configCore.getConfig({ withCache: true });
    const [asset] = await this.assetRepository.getByIds([id], { files: true });
    if (!asset) {
      return JobStatus.FAILED;
    }

    await this.storageCore.moveAssetImage(asset, AssetPathType.PREVIEW, image.previewFormat);
    await this.storageCore.moveAssetImage(asset, AssetPathType.THUMBNAIL, image.thumbnailFormat);
    await this.storageCore.moveAssetVideo(asset);

    return JobStatus.SUCCESS;
  }

  async handleGeneratePreview({ id }: IEntityJob): Promise<JobStatus> {
    const [{ image }, [asset]] = await Promise.all([
      this.configCore.getConfig({ withCache: true }),
      this.assetRepository.getByIds([id], { exifInfo: true }),
    ]);
    if (!asset) {
      return JobStatus.FAILED;
    }

    if (!asset.isVisible) {
      return JobStatus.SKIPPED;
    }

    const previewPath = await this.generateThumbnail(asset, AssetPathType.PREVIEW, image.previewFormat);
    if (!previewPath) {
      return JobStatus.SKIPPED;
    }

    const { previewFile } = getAssetFiles(asset.files);
    if (previewFile && previewFile.path !== previewPath) {
      this.logger.debug(`Deleting old preview for asset ${asset.id}`);
      await this.storageRepository.unlink(previewFile.path);
    }

    await this.assetRepository.upsertFile({ assetId: asset.id, type: AssetFileType.PREVIEW, path: previewPath });
    await this.assetRepository.update({ id: asset.id, updatedAt: new Date() });
    await this.assetRepository.upsertJobStatus({ assetId: asset.id, previewAt: new Date() });

    return JobStatus.SUCCESS;
  }

  private async generateThumbnail(asset: AssetEntity, type: GeneratedImageType, format: ImageFormat) {
    const { image, ffmpeg } = await this.configCore.getConfig({ withCache: true });
    const size = type === AssetPathType.PREVIEW ? image.previewSize : image.thumbnailSize;
    const path = StorageCore.getImagePath(asset, type, format);
    this.storageCore.ensureFolders(path);

    switch (asset.type) {
      case AssetType.IMAGE: {
        const shouldExtract = image.extractEmbedded && mimeTypes.isRaw(asset.originalPath);
        const extractedPath = StorageCore.getTempPathInDir(dirname(path));
        const didExtract = shouldExtract && (await this.mediaRepository.extract(asset.originalPath, extractedPath));

        try {
          const useExtracted = didExtract && (await this.shouldUseExtractedImage(extractedPath, image.previewSize));
          const colorspace = this.isSRGB(asset) ? Colorspace.SRGB : image.colorspace;
          const imageOptions = {
            format,
            size,
            colorspace,
            quality: image.quality,
            processInvalidImages: process.env.IMMICH_PROCESS_INVALID_IMAGES === 'true',
          };

          const outputPath = useExtracted ? extractedPath : asset.originalPath;
          await this.mediaRepository.generateThumbnail(outputPath, path, imageOptions);
        } finally {
          if (didExtract) {
            await this.storageRepository.unlink(extractedPath);
          }
        }
        break;
      }

      case AssetType.VIDEO: {
        const { audioStreams, videoStreams } = await this.mediaRepository.probe(asset.originalPath);
        const mainVideoStream = this.getMainStream(videoStreams);
        if (!mainVideoStream) {
          this.logger.warn(`Skipped thumbnail generation for asset ${asset.id}: no video streams found`);
          return;
        }
        const mainAudioStream = this.getMainStream(audioStreams);
        const config = ThumbnailConfig.create({ ...ffmpeg, targetResolution: size.toString() });
        const options = config.getCommand(TranscodeTarget.VIDEO, mainVideoStream, mainAudioStream);
        await this.mediaRepository.transcode(asset.originalPath, path, options);
        break;
      }

      default: {
        throw new UnsupportedMediaTypeException(`Unsupported asset type for thumbnail generation: ${asset.type}`);
      }
    }

    const assetLabel = asset.isExternal ? asset.originalPath : asset.id;
    this.logger.log(
      `Successfully generated ${format.toUpperCase()} ${asset.type.toLowerCase()} ${type} for asset ${assetLabel}`,
    );

    return path;
  }

  async handleGenerateThumbnail({ id }: IEntityJob): Promise<JobStatus> {
    const [{ image }, [asset]] = await Promise.all([
      this.configCore.getConfig({ withCache: true }),
      this.assetRepository.getByIds([id], { exifInfo: true, files: true }),
    ]);
    if (!asset) {
      return JobStatus.FAILED;
    }

    if (!asset.isVisible) {
      return JobStatus.SKIPPED;
    }

    const thumbnailPath = await this.generateThumbnail(asset, AssetPathType.THUMBNAIL, image.thumbnailFormat);
    if (!thumbnailPath) {
      return JobStatus.SKIPPED;
    }

    const { thumbnailFile } = getAssetFiles(asset.files);
    if (thumbnailFile && thumbnailFile.path !== thumbnailPath) {
      this.logger.debug(`Deleting old thumbnail for asset ${asset.id}`);
      await this.storageRepository.unlink(thumbnailFile.path);
    }

    await this.assetRepository.upsertFile({ assetId: asset.id, type: AssetFileType.THUMBNAIL, path: thumbnailPath });
    await this.assetRepository.update({ id: asset.id, updatedAt: new Date() });
    await this.assetRepository.upsertJobStatus({ assetId: asset.id, thumbnailAt: new Date() });

    return JobStatus.SUCCESS;
  }

  async handleGenerateThumbhash({ id }: IEntityJob): Promise<JobStatus> {
    const [asset] = await this.assetRepository.getByIds([id], { files: true });
    if (!asset) {
      return JobStatus.FAILED;
    }

    if (!asset.isVisible) {
      return JobStatus.SKIPPED;
    }

    const { previewFile } = getAssetFiles(asset.files);
    if (!previewFile) {
      return JobStatus.FAILED;
    }

    const thumbhash = await this.mediaRepository.generateThumbhash(previewFile.path);
    await this.assetRepository.update({ id: asset.id, thumbhash });

    return JobStatus.SUCCESS;
  }

  async handleQueueVideoConversion(job: IBaseJob): Promise<JobStatus> {
    const { force } = job;

    const assetPagination = usePagination(JOBS_ASSET_PAGINATION_SIZE, (pagination) => {
      return force
        ? this.assetRepository.getAll(pagination, { type: AssetType.VIDEO })
        : this.assetRepository.getWithout(pagination, WithoutProperty.ENCODED_VIDEO);
    });

    for await (const assets of assetPagination) {
      await this.jobRepository.queueAll(
        assets.map((asset) => ({ name: JobName.VIDEO_CONVERSION, data: { id: asset.id } })),
      );
    }

    return JobStatus.SUCCESS;
  }

  async handleVideoConversion({ id }: IEntityJob): Promise<JobStatus> {
    const [asset] = await this.assetRepository.getByIds([id]);
    if (!asset || asset.type !== AssetType.VIDEO) {
      return JobStatus.FAILED;
    }

    const input = asset.originalPath;
    const output = StorageCore.getEncodedVideoPath(asset);
    this.storageCore.ensureFolders(output);

    const { videoStreams, audioStreams, format } = await this.mediaRepository.probe(input);
    const mainVideoStream = this.getMainStream(videoStreams);
    const mainAudioStream = this.getMainStream(audioStreams);
    if (!mainVideoStream || !format.formatName) {
      return JobStatus.FAILED;
    }

    if (!mainVideoStream.height || !mainVideoStream.width) {
      this.logger.warn(`Skipped transcoding for asset ${asset.id}: no video streams found`);
      return JobStatus.FAILED;
    }

    const { ffmpeg } = await this.configCore.getConfig({ withCache: true });
    const target = this.getTranscodeTarget(ffmpeg, mainVideoStream, mainAudioStream);
    if (target === TranscodeTarget.NONE && !this.isRemuxRequired(ffmpeg, format)) {
      if (asset.encodedVideoPath) {
        this.logger.log(`Transcoded video exists for asset ${asset.id}, but is no longer required. Deleting...`);
        await this.jobRepository.queue({ name: JobName.DELETE_FILES, data: { files: [asset.encodedVideoPath] } });
        await this.assetRepository.update({ id: asset.id, encodedVideoPath: null });
      }

      return JobStatus.SKIPPED;
    }

    let command;
    try {
      const config = BaseConfig.create(ffmpeg, await this.getDevices(), await this.hasMaliOpenCL());
      command = config.getCommand(target, mainVideoStream, mainAudioStream);
    } catch (error) {
      this.logger.error(`An error occurred while configuring transcoding options: ${error}`);
      return JobStatus.FAILED;
    }

    this.logger.log(`Started encoding video ${asset.id} ${JSON.stringify(command)}`);
    try {
      await this.mediaRepository.transcode(input, output, command);
    } catch (error) {
      this.logger.error(error);
      if (ffmpeg.accel !== TranscodeHWAccel.DISABLED) {
        this.logger.error(
          `Error occurred during transcoding. Retrying with ${ffmpeg.accel.toUpperCase()} acceleration disabled.`,
        );
      }
      const config = BaseConfig.create({ ...ffmpeg, accel: TranscodeHWAccel.DISABLED });
      command = config.getCommand(target, mainVideoStream, mainAudioStream);
      await this.mediaRepository.transcode(input, output, command);
    }

    this.logger.log(`Successfully encoded ${asset.id}`);

    await this.assetRepository.update({ id: asset.id, encodedVideoPath: output });

    return JobStatus.SUCCESS;
  }

  private getMainStream<T extends VideoStreamInfo | AudioStreamInfo>(streams: T[]): T {
    return streams.sort((stream1, stream2) => stream2.frameCount - stream1.frameCount)[0];
  }

  private getTranscodeTarget(
    config: SystemConfigFFmpegDto,
    videoStream?: VideoStreamInfo,
    audioStream?: AudioStreamInfo,
  ): TranscodeTarget {
    if (!videoStream && !audioStream) {
      return TranscodeTarget.NONE;
    }

    const isAudioTranscodeRequired = this.isAudioTranscodeRequired(config, audioStream);
    const isVideoTranscodeRequired = this.isVideoTranscodeRequired(config, videoStream);

    if (isAudioTranscodeRequired && isVideoTranscodeRequired) {
      return TranscodeTarget.ALL;
    }

    if (isAudioTranscodeRequired) {
      return TranscodeTarget.AUDIO;
    }

    if (isVideoTranscodeRequired) {
      return TranscodeTarget.VIDEO;
    }

    return TranscodeTarget.NONE;
  }

  private isAudioTranscodeRequired(ffmpegConfig: SystemConfigFFmpegDto, stream?: AudioStreamInfo): boolean {
    if (!stream) {
      return false;
    }

    switch (ffmpegConfig.transcode) {
      case TranscodePolicy.DISABLED: {
        return false;
      }
      case TranscodePolicy.ALL: {
        return true;
      }
      case TranscodePolicy.REQUIRED:
      case TranscodePolicy.OPTIMAL:
      case TranscodePolicy.BITRATE: {
        return !ffmpegConfig.acceptedAudioCodecs.includes(stream.codecName as AudioCodec);
      }
      default: {
        throw new Error(`Unsupported transcode policy: ${ffmpegConfig.transcode}`);
      }
    }
  }

  private isVideoTranscodeRequired(ffmpegConfig: SystemConfigFFmpegDto, stream?: VideoStreamInfo): boolean {
    if (!stream) {
      return false;
    }

    const scalingEnabled = ffmpegConfig.targetResolution !== 'original';
    const targetRes = Number.parseInt(ffmpegConfig.targetResolution);
    const isLargerThanTargetRes = scalingEnabled && Math.min(stream.height, stream.width) > targetRes;
    const isLargerThanTargetBitrate = stream.bitrate > this.parseBitrateToBps(ffmpegConfig.maxBitrate);

    const isTargetVideoCodec = ffmpegConfig.acceptedVideoCodecs.includes(stream.codecName as VideoCodec);
    const isRequired = !isTargetVideoCodec || stream.isHDR;

    switch (ffmpegConfig.transcode) {
      case TranscodePolicy.DISABLED: {
        return false;
      }
      case TranscodePolicy.ALL: {
        return true;
      }
      case TranscodePolicy.REQUIRED: {
        return isRequired;
      }
      case TranscodePolicy.OPTIMAL: {
        return isRequired || isLargerThanTargetRes;
      }
      case TranscodePolicy.BITRATE: {
        return isRequired || isLargerThanTargetBitrate;
      }
      default: {
        throw new Error(`Unsupported transcode policy: ${ffmpegConfig.transcode}`);
      }
    }
  }

  private isRemuxRequired(ffmpegConfig: SystemConfigFFmpegDto, { formatName, formatLongName }: VideoFormat): boolean {
    if (ffmpegConfig.transcode === TranscodePolicy.DISABLED) {
      return false;
    }

    const name = formatLongName === 'QuickTime / MOV' ? VideoContainer.MOV : (formatName as VideoContainer);
    return name !== VideoContainer.MP4 && !ffmpegConfig.acceptedContainers.includes(name);
  }

  isSRGB(asset: AssetEntity): boolean {
    const { colorspace, profileDescription, bitsPerSample } = asset.exifInfo ?? {};
    if (colorspace || profileDescription) {
      return [colorspace, profileDescription].some((s) => s?.toLowerCase().includes('srgb'));
    } else if (bitsPerSample) {
      // assume sRGB for 8-bit images with no color profile or colorspace metadata
      return bitsPerSample === 8;
    } else {
      // assume sRGB for images with no relevant metadata
      return true;
    }
  }

  private parseBitrateToBps(bitrateString: string) {
    const bitrateValue = Number.parseInt(bitrateString);

    if (Number.isNaN(bitrateValue)) {
      return 0;
    }

    if (bitrateString.toLowerCase().endsWith('k')) {
      return bitrateValue * 1000; // Kilobits per second to bits per second
    } else if (bitrateString.toLowerCase().endsWith('m')) {
      return bitrateValue * 1_000_000; // Megabits per second to bits per second
    } else {
      return bitrateValue;
    }
  }

  private async shouldUseExtractedImage(extractedPath: string, targetSize: number) {
    const { width, height } = await this.mediaRepository.getImageDimensions(extractedPath);
    const extractedSize = Math.min(width, height);

    return extractedSize >= targetSize;
  }

  private async getDevices() {
    if (!this.devices) {
      try {
        this.devices = await this.storageRepository.readdir('/dev/dri');
      } catch {
        this.logger.debug('No devices found in /dev/dri.');
        this.devices = [];
      }
    }

    return this.devices;
  }

  private async hasMaliOpenCL() {
    if (this.maliOpenCL === undefined) {
      try {
        const maliIcdStat = await this.storageRepository.stat('/etc/OpenCL/vendors/mali.icd');
        const maliDeviceStat = await this.storageRepository.stat('/dev/mali0');
        this.maliOpenCL = maliIcdStat.isFile() && maliDeviceStat.isCharacterDevice();
      } catch {
        this.logger.debug('OpenCL not available for transcoding, using CPU decoding instead.');
        this.maliOpenCL = false;
      }
    }

    return this.maliOpenCL;
  }
}
