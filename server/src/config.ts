import { RegisterQueueOptions } from '@nestjs/bullmq';
import { ConfigModuleOptions } from '@nestjs/config';
import { CronExpression } from '@nestjs/schedule';
import { QueueOptions } from 'bullmq';
import { Request, Response } from 'express';
import { RedisOptions } from 'ioredis';
import Joi, { Root } from 'joi';
import { CLS_ID, ClsModuleOptions } from 'nestjs-cls';
import { ImmichHeader } from 'src/dtos/auth.dto';
import { ConcurrentQueueName, QueueName } from 'src/interfaces/job.interface';

export enum TranscodePolicy {
  ALL = 'all',
  OPTIMAL = 'optimal',
  BITRATE = 'bitrate',
  REQUIRED = 'required',
  DISABLED = 'disabled',
}

export enum TranscodeTarget {
  NONE,
  AUDIO,
  VIDEO,
  ALL,
}

export enum VideoCodec {
  H264 = 'h264',
  HEVC = 'hevc',
  VP9 = 'vp9',
  AV1 = 'av1',
}

export enum AudioCodec {
  MP3 = 'mp3',
  AAC = 'aac',
  LIBOPUS = 'libopus',
}

export enum VideoContainer {
  MOV = 'mov',
  MP4 = 'mp4',
  OGG = 'ogg',
  WEBM = 'webm',
}

export enum TranscodeHWAccel {
  NVENC = 'nvenc',
  QSV = 'qsv',
  VAAPI = 'vaapi',
  RKMPP = 'rkmpp',
  DISABLED = 'disabled',
}

export enum ToneMapping {
  HABLE = 'hable',
  MOBIUS = 'mobius',
  REINHARD = 'reinhard',
  DISABLED = 'disabled',
}

export enum CQMode {
  AUTO = 'auto',
  CQP = 'cqp',
  ICQ = 'icq',
}

export enum Colorspace {
  SRGB = 'srgb',
  P3 = 'p3',
}

export enum ImageFormat {
  JPEG = 'jpeg',
  WEBP = 'webp',
}

export enum LogLevel {
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  LOG = 'log',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export interface SystemConfig {
  ffmpeg: {
    crf: number;
    threads: number;
    preset: string;
    targetVideoCodec: VideoCodec;
    acceptedVideoCodecs: VideoCodec[];
    targetAudioCodec: AudioCodec;
    acceptedAudioCodecs: AudioCodec[];
    acceptedContainers: VideoContainer[];
    targetResolution: string;
    maxBitrate: string;
    bframes: number;
    refs: number;
    gopSize: number;
    npl: number;
    temporalAQ: boolean;
    cqMode: CQMode;
    twoPass: boolean;
    preferredHwDevice: string;
    transcode: TranscodePolicy;
    accel: TranscodeHWAccel;
    accelDecode: boolean;
    tonemap: ToneMapping;
  };
  job: Record<ConcurrentQueueName, { concurrency: number }>;
  logging: {
    enabled: boolean;
    level: LogLevel;
  };
  machineLearning: {
    enabled: boolean;
    url: string;
    clip: {
      enabled: boolean;
      modelName: string;
    };
    duplicateDetection: {
      enabled: boolean;
      maxDistance: number;
    };
    facialRecognition: {
      enabled: boolean;
      modelName: string;
      minScore: number;
      minFaces: number;
      maxDistance: number;
    };
  };
  map: {
    enabled: boolean;
    lightStyle: string;
    darkStyle: string;
  };
  reverseGeocoding: {
    enabled: boolean;
  };
  oauth: {
    autoLaunch: boolean;
    autoRegister: boolean;
    buttonText: string;
    clientId: string;
    clientSecret: string;
    defaultStorageQuota: number;
    enabled: boolean;
    issuerUrl: string;
    mobileOverrideEnabled: boolean;
    mobileRedirectUri: string;
    scope: string;
    signingAlgorithm: string;
    profileSigningAlgorithm: string;
    storageLabelClaim: string;
    storageQuotaClaim: string;
  };
  passwordLogin: {
    enabled: boolean;
  };
  storageTemplate: {
    enabled: boolean;
    hashVerificationEnabled: boolean;
    template: string;
  };
  image: {
    thumbnailFormat: ImageFormat;
    thumbnailSize: number;
    previewFormat: ImageFormat;
    previewSize: number;
    quality: number;
    colorspace: Colorspace;
    extractEmbedded: boolean;
  };
  newVersionCheck: {
    enabled: boolean;
  };
  trash: {
    enabled: boolean;
    days: number;
  };
  theme: {
    customCss: string;
  };
  library: {
    scan: {
      enabled: boolean;
      cronExpression: string;
    };
    watch: {
      enabled: boolean;
    };
  };
  notifications: {
    smtp: {
      enabled: boolean;
      from: string;
      replyTo: string;
      transport: {
        ignoreCert: boolean;
        host: string;
        port: number;
        username: string;
        password: string;
      };
    };
  };
  server: {
    externalDomain: string;
    loginPageMessage: string;
  };
  user: {
    deleteDelay: number;
  };
}

export const defaults = Object.freeze<SystemConfig>({
  ffmpeg: {
    crf: 23,
    threads: 0,
    preset: 'ultrafast',
    targetVideoCodec: VideoCodec.H264,
    acceptedVideoCodecs: [VideoCodec.H264],
    targetAudioCodec: AudioCodec.AAC,
    acceptedAudioCodecs: [AudioCodec.AAC, AudioCodec.MP3, AudioCodec.LIBOPUS],
    acceptedContainers: [VideoContainer.MOV, VideoContainer.OGG, VideoContainer.WEBM],
    targetResolution: '720',
    maxBitrate: '0',
    bframes: -1,
    refs: 0,
    gopSize: 0,
    npl: 0,
    temporalAQ: false,
    cqMode: CQMode.AUTO,
    twoPass: false,
    preferredHwDevice: 'auto',
    transcode: TranscodePolicy.REQUIRED,
    tonemap: ToneMapping.HABLE,
    accel: TranscodeHWAccel.DISABLED,
    accelDecode: false,
  },
  job: {
    [QueueName.BACKGROUND_TASK]: { concurrency: 5 },
    [QueueName.SMART_SEARCH]: { concurrency: 2 },
    [QueueName.METADATA_EXTRACTION]: { concurrency: 5 },
    [QueueName.FACE_DETECTION]: { concurrency: 2 },
    [QueueName.SEARCH]: { concurrency: 5 },
    [QueueName.SIDECAR]: { concurrency: 5 },
    [QueueName.LIBRARY]: { concurrency: 5 },
    [QueueName.MIGRATION]: { concurrency: 5 },
    [QueueName.THUMBNAIL_GENERATION]: { concurrency: 3 },
    [QueueName.VIDEO_CONVERSION]: { concurrency: 1 },
    [QueueName.NOTIFICATION]: { concurrency: 5 },
  },
  logging: {
    enabled: true,
    level: LogLevel.LOG,
  },
  machineLearning: {
    enabled: process.env.IMMICH_MACHINE_LEARNING_ENABLED !== 'false',
    url: process.env.IMMICH_MACHINE_LEARNING_URL || 'http://immich-machine-learning:3003',
    clip: {
      enabled: true,
      modelName: 'ViT-B-32__openai',
    },
    duplicateDetection: {
      enabled: true,
      maxDistance: 0.01,
    },
    facialRecognition: {
      enabled: true,
      modelName: 'buffalo_l',
      minScore: 0.7,
      maxDistance: 0.5,
      minFaces: 3,
    },
  },
  map: {
    enabled: true,
    lightStyle: '',
    darkStyle: '',
  },
  reverseGeocoding: {
    enabled: true,
  },
  oauth: {
    autoLaunch: false,
    autoRegister: true,
    buttonText: 'Login with OAuth',
    clientId: '',
    clientSecret: '',
    defaultStorageQuota: 0,
    enabled: false,
    issuerUrl: '',
    mobileOverrideEnabled: false,
    mobileRedirectUri: '',
    scope: 'openid email profile',
    signingAlgorithm: 'RS256',
    profileSigningAlgorithm: 'none',
    storageLabelClaim: 'preferred_username',
    storageQuotaClaim: 'immich_quota',
  },
  passwordLogin: {
    enabled: true,
  },
  storageTemplate: {
    enabled: false,
    hashVerificationEnabled: true,
    template: '{{y}}/{{y}}-{{MM}}-{{dd}}/{{filename}}',
  },
  image: {
    thumbnailFormat: ImageFormat.WEBP,
    thumbnailSize: 250,
    previewFormat: ImageFormat.JPEG,
    previewSize: 1440,
    quality: 80,
    colorspace: Colorspace.P3,
    extractEmbedded: false,
  },
  newVersionCheck: {
    enabled: true,
  },
  trash: {
    enabled: true,
    days: 30,
  },
  theme: {
    customCss: '',
  },
  library: {
    scan: {
      enabled: true,
      cronExpression: CronExpression.EVERY_DAY_AT_MIDNIGHT,
    },
    watch: {
      enabled: false,
    },
  },
  server: {
    externalDomain: '',
    loginPageMessage: '',
  },
  notifications: {
    smtp: {
      enabled: false,
      from: '',
      replyTo: '',
      transport: {
        ignoreCert: false,
        host: '',
        port: 587,
        username: '',
        password: '',
      },
    },
  },
  user: {
    deleteDelay: 7,
  },
});

const WHEN_DB_URL_SET = Joi.when('DB_URL', {
  is: Joi.exist(),
  then: Joi.string().optional(),
  otherwise: Joi.string().required(),
});

export const immichAppConfig: ConfigModuleOptions = {
  envFilePath: '.env',
  isGlobal: true,
  validationSchema: Joi.object({
    IMMICH_ENV: Joi.string().optional().valid('development', 'testing', 'production').default('production'),
    IMMICH_LOG_LEVEL: Joi.string()
      .optional()
      .valid(...Object.values(LogLevel)),

    DB_USERNAME: WHEN_DB_URL_SET,
    DB_PASSWORD: WHEN_DB_URL_SET,
    DB_DATABASE_NAME: WHEN_DB_URL_SET,
    DB_URL: Joi.string().optional(),
    DB_VECTOR_EXTENSION: Joi.string().optional().valid('pgvector', 'pgvecto.rs').default('pgvecto.rs'),
    DB_SKIP_MIGRATIONS: Joi.boolean().optional().default(false),

    IMMICH_PORT: Joi.number().optional(),
    IMMICH_API_METRICS_PORT: Joi.number().optional(),
    IMMICH_MICROSERVICES_METRICS_PORT: Joi.number().optional(),

    IMMICH_TRUSTED_PROXIES: Joi.extend((joi: Root) => ({
      type: 'stringArray',
      base: joi.array(),
      coerce: (value) => (value.split ? value.split(',') : value),
    }))
      .stringArray()
      .single()
      .items(
        Joi.string().ip({
          version: ['ipv4', 'ipv6'],
          cidr: 'optional',
        }),
      ),

    IMMICH_METRICS: Joi.boolean().optional().default(false),
    IMMICH_HOST_METRICS: Joi.boolean().optional().default(false),
    IMMICH_API_METRICS: Joi.boolean().optional().default(false),
    IMMICH_IO_METRICS: Joi.boolean().optional().default(false),
  }),
};

export function parseRedisConfig(): RedisOptions {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && redisUrl.startsWith('ioredis://')) {
    try {
      const decodedString = Buffer.from(redisUrl.slice(10), 'base64').toString();
      return JSON.parse(decodedString);
    } catch (error) {
      throw new Error(`Failed to decode redis options: ${error}`);
    }
  }
  return {
    host: process.env.REDIS_HOSTNAME || 'redis',
    port: Number.parseInt(process.env.REDIS_PORT || '6379'),
    db: Number.parseInt(process.env.REDIS_DBINDEX || '0'),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    path: process.env.REDIS_SOCKET || undefined,
  };
}

export const bullConfig: QueueOptions = {
  prefix: 'immich_bull',
  connection: parseRedisConfig(),
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: true,
    removeOnFail: false,
  },
};

export const bullQueues: RegisterQueueOptions[] = Object.values(QueueName).map((name) => ({ name }));

export const clsConfig: ClsModuleOptions = {
  middleware: {
    mount: true,
    generateId: true,
    setup: (cls, req: Request, res: Response) => {
      const headerValues = req.headers[ImmichHeader.CID];
      const headerValue = Array.isArray(headerValues) ? headerValues[0] : headerValues;
      const cid = headerValue || cls.get(CLS_ID);
      cls.set(CLS_ID, cid);
      res.header(ImmichHeader.CID, cid);
    },
  },
};

export const getBuildMetadata = () => ({
  build: process.env.IMMICH_BUILD,
  buildUrl: process.env.IMMICH_BUILD_URL,
  buildImage: process.env.IMMICH_BUILD_IMAGE,
  buildImageUrl: process.env.IMMICH_BUILD_IMAGE_URL,
  repository: process.env.IMMICH_REPOSITORY,
  repositoryUrl: process.env.IMMICH_REPOSITORY_URL,
  sourceRef: process.env.IMMICH_SOURCE_REF,
  sourceCommit: process.env.IMMICH_SOURCE_COMMIT,
  sourceUrl: process.env.IMMICH_SOURCE_URL,
});

const clientLicensePublicKeyProd =
  'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUF2LzdTMzJjUkE1KysxTm5WRHNDTQpzcFAvakpISU1xT0pYRm5oNE53QTJPcHorUk1mZGNvOTJQc09naCt3d1FlRXYxVTJjMnBqelRpUS8ybHJLcS9rCnpKUmxYd2M0Y1Vlc1FETUpPRitQMnFPTlBiQUprWHZDWFlCVUxpdENJa29Md2ZoU0dOanlJS2FSRGhkL3ROeU4KOCtoTlJabllUMWhTSWo5U0NrS3hVQ096YXRQVjRtQ0RlclMrYkUrZ0VVZVdwOTlWOWF6dkYwRkltblRXcFFTdwpjOHdFWmdPTWg0c3ZoNmFpY3dkemtQQ3dFTGFrMFZhQkgzMUJFVUNRTGI5K0FJdEhBVXRKQ0t4aGI1V2pzMXM5CmJyWGZpMHZycGdjWi82RGFuWTJxZlNQem5PbXZEMkZycmxTMXE0SkpOM1ZvN1d3LzBZeS95TWNtelRXWmhHdWgKVVFJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tDQo=';

const clientLicensePublicKeyStaging =
  'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUFuSUNyTm5jbGpPSC9JdTNtWVVaRQp0dGJLV1c3OGRuajl5M0U2ekk3dU1NUndEckdYWFhkTGhkUDFxSWtlZHh0clVVeUpCMWR4R04yQW91S082MlNGCldrbU9PTmNGQlRBWFZTdjhUNVY0S0VwWnFQYWEwaXpNaGxMaE5sRXEvY1ZKdllrWlh1Z2x6b1o3cG1nbzFSdHgKam1iRm5NNzhrYTFRUUJqOVdLaEw2eWpWRUl2MDdVS0lKWHBNTnNuS2g1V083MjZhYmMzSE9udTlETjY5VnFFRQo3dGZrUnRWNmx2U1NzMkFVMngzT255cHA4ek53b0lPTWRibGsyb09aWWROZzY0Y3l2SzJoU0FlU3NVMFRyOVc5Ckgra0Y5QlNCNlk0QXl0QlVkSmkrK2pMSW5HM2Q5cU9ieFVzTlYrN05mRkF5NjJkL0xNR0xSOC9OUFc0U0s3c0MKRlFJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tDQo=';

export const getClientLicensePublicKey = (): string => {
  if (process.env.IMMICH_ENV === 'production') {
    return clientLicensePublicKeyProd;
  }
  return clientLicensePublicKeyStaging;
};

const serverLicensePublicKeyProd =
  'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUFvcG5ZRGEwYS9kVTVJZUc3NGlFRQpNd2RBS2pzTmN6TGRDcVJkMVo5eTVUMndqTzdlWUlPZUpUc2wzNTBzUjBwNEtmU1VEU1h2QzlOcERwYzF0T0tsCjVzaEMvQXhwdlFBTENva0Y0anQ4dnJyZDlmQ2FYYzFUcVJiT21uaGl1Z0Q2dmtyME8vRmIzVURpM1UwVHZoUFAKbFBkdlNhd3pMcldaUExmbUhWVnJiclNLbW45SWVTZ3kwN3VrV1RJeUxzY2lOcnZuQnl3c0phUmVEdW9OV1BCSApVL21vMm1YYThtNHdNV2hpWGVoaUlPUXFNdVNVZ1BlQ3NXajhVVngxQ0dsUnpQREEwYlZOUXZlS1hXVnhjRUk2ClVMRWdKeTJGNDlsSDArYVlDbUJmN05FcjZWUTJXQjk1ZXZUS1hLdm4wcUlNN25nRmxjVUF3NmZ1VjFjTkNUSlMKNndJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tDQo=';

const serverLicensePublicKeyStaging =
  'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUE3Sy8yd3ZLUS9NdU8ydi9MUm5saAoyUy9zTHhDOGJiTEw1UUlKOGowQ3BVZW40YURlY2dYMUpKUmtGNlpUVUtpNTdTbEhtS3RSM2JOTzJmdTBUUVg5Ck5WMEJzVzllZVB0MmlTMWl4VVFmTzRObjdvTjZzbEtac01qd29RNGtGRGFmM3VHTlZJc0dMb3UxVWRLUVhpeDEKUlRHcXVTb3NZVjNWRlk3Q1hGYTVWaENBL3poVXNsNGFuVXp3eEF6M01jUFVlTXBaenYvbVZiQlRKVzBPSytWZgpWQUJvMXdYMkVBanpBekVHVzQ3Vko4czhnMnQrNHNPaHFBNStMQjBKVzlORUg5QUpweGZzWE4zSzVtM00yNUJVClZXcTlRYStIdHRENnJ0bnAvcUFweXVkWUdwZk9HYTRCUlZTR1MxMURZM0xrb2FlRzYwUEU5NHpoYjduOHpMWkgKelFJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tDQo=';

export const getServerLicensePublicKey = (): string => {
  if (process.env.IMMICH_ENV === 'production') {
    return serverLicensePublicKeyProd;
  }
  return serverLicensePublicKeyStaging;
};
