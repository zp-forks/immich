import { AssetFaceEntity } from 'src/entities/asset-face.entity';
import { AssetEntity } from 'src/entities/asset.entity';
import { PersonEntity } from 'src/entities/person.entity';
import { Paginated, PaginationOptions } from 'src/utils/pagination';
import { FindManyOptions, FindOptionsRelations, FindOptionsSelect } from 'typeorm';

export const IPersonRepository = 'IPersonRepository';

export interface PersonSearchOptions {
  minimumFaceCount: number;
  withHidden: boolean;
}

export interface PersonNameSearchOptions {
  withHidden?: boolean;
}

export interface AssetFaceId {
  assetId: string;
  personId: string;
}

export interface UpdateFacesData {
  oldPersonId?: string;
  faceIds?: string[];
  newPersonId: string;
}

export interface PersonStatistics {
  assets: number;
}

export interface PeopleStatistics {
  total: number;
  hidden: number;
}

export interface IPersonRepository {
  getAll(pagination: PaginationOptions, options?: FindManyOptions<PersonEntity>): Paginated<PersonEntity>;
  getAllForUser(pagination: PaginationOptions, userId: string, options: PersonSearchOptions): Paginated<PersonEntity>;
  getAllWithoutFaces(): Promise<PersonEntity[]>;
  getById(personId: string): Promise<PersonEntity | null>;
  getByName(userId: string, personName: string, options: PersonNameSearchOptions): Promise<PersonEntity[]>;

  getAssets(personId: string): Promise<AssetEntity[]>;

  create(entity: Partial<PersonEntity>): Promise<PersonEntity>;
  createFaces(entities: Partial<AssetFaceEntity>[]): Promise<string[]>;
  delete(entities: PersonEntity[]): Promise<void>;
  deleteAll(): Promise<void>;
  deleteAllFaces(): Promise<void>;
  getAllFaces(pagination: PaginationOptions, options?: FindManyOptions<AssetFaceEntity>): Paginated<AssetFaceEntity>;
  getFaceById(id: string): Promise<AssetFaceEntity>;
  getFaceByIdWithAssets(
    id: string,
    relations?: FindOptionsRelations<AssetFaceEntity>,
    select?: FindOptionsSelect<AssetFaceEntity>,
  ): Promise<AssetFaceEntity | null>;
  getFaces(assetId: string): Promise<AssetFaceEntity[]>;
  getFacesByIds(ids: AssetFaceId[]): Promise<AssetFaceEntity[]>;
  getRandomFace(personId: string): Promise<AssetFaceEntity | null>;
  getStatistics(personId: string): Promise<PersonStatistics>;
  reassignFace(assetFaceId: string, newPersonId: string): Promise<number>;
  getNumberOfPeople(userId: string): Promise<PeopleStatistics>;
  reassignFaces(data: UpdateFacesData): Promise<number>;
  update(entity: Partial<PersonEntity>): Promise<PersonEntity>;
  getLatestFaceDate(): Promise<string | undefined>;
}
