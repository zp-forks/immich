import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { BulkIdsDto } from 'src/dtos/asset-ids.response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { StackCreateDto, StackResponseDto, StackSearchDto, StackUpdateDto, mapStack } from 'src/dtos/stack.dto';
import { Permission } from 'src/enum';
import { IAccessRepository } from 'src/interfaces/access.interface';
import { ClientEvent, IEventRepository } from 'src/interfaces/event.interface';
import { IStackRepository } from 'src/interfaces/stack.interface';
import { requireAccess } from 'src/utils/access';

@Injectable()
export class StackService {
  constructor(
    @Inject(IAccessRepository) private access: IAccessRepository,
    @Inject(IEventRepository) private eventRepository: IEventRepository,
    @Inject(IStackRepository) private stackRepository: IStackRepository,
  ) {}

  async search(auth: AuthDto, dto: StackSearchDto): Promise<StackResponseDto[]> {
    const stacks = await this.stackRepository.search({
      ownerId: auth.user.id,
      primaryAssetId: dto.primaryAssetId,
    });

    return stacks.map((stack) => mapStack(stack, { auth }));
  }

  async create(auth: AuthDto, dto: StackCreateDto): Promise<StackResponseDto> {
    await requireAccess(this.access, { auth, permission: Permission.ASSET_UPDATE, ids: dto.assetIds });

    const stack = await this.stackRepository.create({ ownerId: auth.user.id, assetIds: dto.assetIds });

    this.eventRepository.clientSend(ClientEvent.ASSET_STACK_UPDATE, auth.user.id, []);

    return mapStack(stack, { auth });
  }

  async get(auth: AuthDto, id: string): Promise<StackResponseDto> {
    await requireAccess(this.access, { auth, permission: Permission.STACK_READ, ids: [id] });
    const stack = await this.findOrFail(id);
    return mapStack(stack, { auth });
  }

  async update(auth: AuthDto, id: string, dto: StackUpdateDto): Promise<StackResponseDto> {
    await requireAccess(this.access, { auth, permission: Permission.STACK_UPDATE, ids: [id] });
    const stack = await this.findOrFail(id);
    if (dto.primaryAssetId && !stack.assets.some(({ id }) => id === dto.primaryAssetId)) {
      throw new BadRequestException('Primary asset must be in the stack');
    }

    const updatedStack = await this.stackRepository.update({ id, primaryAssetId: dto.primaryAssetId });

    this.eventRepository.clientSend(ClientEvent.ASSET_STACK_UPDATE, auth.user.id, []);

    return mapStack(updatedStack, { auth });
  }

  async delete(auth: AuthDto, id: string): Promise<void> {
    await requireAccess(this.access, { auth, permission: Permission.STACK_DELETE, ids: [id] });
    await this.stackRepository.delete(id);

    this.eventRepository.clientSend(ClientEvent.ASSET_STACK_UPDATE, auth.user.id, []);
  }

  async deleteAll(auth: AuthDto, dto: BulkIdsDto): Promise<void> {
    await requireAccess(this.access, { auth, permission: Permission.STACK_DELETE, ids: dto.ids });
    await this.stackRepository.deleteAll(dto.ids);

    this.eventRepository.clientSend(ClientEvent.ASSET_STACK_UPDATE, auth.user.id, []);
  }

  private async findOrFail(id: string) {
    const stack = await this.stackRepository.getById(id);
    if (!stack) {
      throw new Error('Asset stack not found');
    }

    return stack;
  }
}
