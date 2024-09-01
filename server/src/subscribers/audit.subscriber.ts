import { AlbumEntity } from 'src/entities/album.entity';
import { AssetEntity } from 'src/entities/asset.entity';
import { AuditEntity } from 'src/entities/audit.entity';
import { DatabaseAction, EntityType } from 'src/enum';
import { EntitySubscriberInterface, EventSubscriber, RemoveEvent } from 'typeorm';

@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface<AssetEntity | AlbumEntity> {
  async afterRemove(event: RemoveEvent<AssetEntity>): Promise<void> {
    await this.onEvent(DatabaseAction.DELETE, event);
  }

  private async onEvent<T>(action: DatabaseAction, event: RemoveEvent<T>): Promise<any> {
    const audit = this.getAudit(event.metadata.name, { ...event.entity, id: event.entityId });
    if (audit && audit.entityId && audit.ownerId) {
      await event.manager.getRepository(AuditEntity).save({ ...audit, action });
    }
  }

  private getAudit(entityName: string, entity: any): Partial<AuditEntity> | null {
    switch (entityName) {
      case AssetEntity.name: {
        const asset = entity as AssetEntity;
        return {
          entityType: EntityType.ASSET,
          entityId: asset.id,
          ownerId: asset.ownerId,
        };
      }

      case AlbumEntity.name: {
        const album = entity as AlbumEntity;
        return {
          entityType: EntityType.ALBUM,
          entityId: album.id,
          ownerId: album.ownerId,
        };
      }
    }

    return null;
  }
}
