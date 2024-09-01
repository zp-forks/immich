// ignore_for_file: null_argument_to_non_null_type

import 'dart:async';

import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/entities/asset.entity.dart';
import 'package:immich_mobile/entities/etag.entity.dart';
import 'package:immich_mobile/entities/exif_info.entity.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/entities/user.entity.dart';
import 'package:immich_mobile/models/backup/backup_candidate.model.dart';
import 'package:immich_mobile/providers/api.provider.dart';
import 'package:immich_mobile/providers/db.provider.dart';
import 'package:immich_mobile/services/album.service.dart';
import 'package:immich_mobile/services/api.service.dart';
import 'package:immich_mobile/services/backup.service.dart';
import 'package:immich_mobile/services/sync.service.dart';
import 'package:immich_mobile/services/user.service.dart';
import 'package:isar/isar.dart';
import 'package:logging/logging.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:openapi/api.dart';

final assetServiceProvider = Provider(
  (ref) => AssetService(
    ref.watch(apiServiceProvider),
    ref.watch(syncServiceProvider),
    ref.watch(userServiceProvider),
    ref.watch(backupServiceProvider),
    ref.watch(albumServiceProvider),
    ref.watch(dbProvider),
  ),
);

class AssetService {
  final ApiService _apiService;
  final SyncService _syncService;
  final UserService _userService;
  final BackupService _backupService;
  final AlbumService _albumService;
  final log = Logger('AssetService');
  final Isar _db;

  AssetService(
    this._apiService,
    this._syncService,
    this._userService,
    this._backupService,
    this._albumService,
    this._db,
  );

  /// Checks the server for updated assets and updates the local database if
  /// required. Returns `true` if there were any changes.
  Future<bool> refreshRemoteAssets() async {
    final syncedUserIds = await _db.eTags.where().idProperty().findAll();
    final List<User> syncedUsers = syncedUserIds.isEmpty
        ? []
        : await _db.users
            .where()
            .anyOf(syncedUserIds, (q, id) => q.idEqualTo(id))
            .findAll();
    final Stopwatch sw = Stopwatch()..start();
    final bool changes = await _syncService.syncRemoteAssetsToDb(
      users: syncedUsers,
      getChangedAssets: _getRemoteAssetChanges,
      loadAssets: _getRemoteAssets,
      refreshUsers: _userService.getUsersFromServer,
    );
    debugPrint("refreshRemoteAssets full took ${sw.elapsedMilliseconds}ms");
    return changes;
  }

  /// Returns `(null, null)` if changes are invalid -> requires full sync
  Future<(List<Asset>? toUpsert, List<String>? toDelete)>
      _getRemoteAssetChanges(List<User> users, DateTime since) async {
    final dto = AssetDeltaSyncDto(
      updatedAfter: since,
      userIds: users.map((e) => e.id).toList(),
    );
    final changes = await _apiService.syncApi.getDeltaSync(dto);
    return changes == null || changes.needsFullSync
        ? (null, null)
        : (changes.upserted.map(Asset.remote).toList(), changes.deleted);
  }

  /// Returns the list of people of the given asset id.
  // If the server is not reachable `null` is returned.
  Future<List<PersonWithFacesResponseDto>?> getRemotePeopleOfAsset(
    String remoteId,
  ) async {
    try {
      final AssetResponseDto? dto =
          await _apiService.assetsApi.getAssetInfo(remoteId);

      return dto?.people;
    } catch (error, stack) {
      log.severe(
        'Error while getting remote asset info: ${error.toString()}',
        error,
        stack,
      );

      return null;
    }
  }

  /// Returns `null` if the server state did not change, else list of assets
  Future<List<Asset>?> _getRemoteAssets(User user, DateTime until) async {
    const int chunkSize = 10000;
    try {
      final List<Asset> allAssets = [];
      String? lastId;
      // will break on error or once all assets are loaded
      while (true) {
        final dto = AssetFullSyncDto(
          limit: chunkSize,
          updatedUntil: until,
          lastId: lastId,
          userId: user.id,
        );
        log.fine("Requesting $chunkSize assets from $lastId");
        final List<AssetResponseDto>? assets =
            await _apiService.syncApi.getFullSyncForUser(dto);
        if (assets == null) return null;
        log.fine(
          "Received ${assets.length} assets from ${assets.firstOrNull?.id} to ${assets.lastOrNull?.id}",
        );
        allAssets.addAll(assets.map(Asset.remote));
        if (assets.length != chunkSize) break;
        lastId = assets.last.id;
      }
      return allAssets;
    } catch (error, stack) {
      log.severe('Error while getting remote assets', error, stack);
      return null;
    }
  }

  Future<bool> deleteAssets(
    Iterable<Asset> deleteAssets, {
    bool? force = false,
  }) async {
    try {
      final List<String> payload = [];

      for (final asset in deleteAssets) {
        payload.add(asset.remoteId!);
      }

      await _apiService.assetsApi.deleteAssets(
        AssetBulkDeleteDto(
          ids: payload,
          force: force,
        ),
      );
      return true;
    } catch (error, stack) {
      log.severe("Error while deleting assets", error, stack);
    }
    return false;
  }

  /// Loads the exif information from the database. If there is none, loads
  /// the exif info from the server (remote assets only)
  Future<Asset> loadExif(Asset a) async {
    a.exifInfo ??= await _db.exifInfos.get(a.id);
    // fileSize is always filled on the server but not set on client
    if (a.exifInfo?.fileSize == null) {
      if (a.isRemote) {
        final dto = await _apiService.assetsApi.getAssetInfo(a.remoteId!);
        if (dto != null && dto.exifInfo != null) {
          final newExif = Asset.remote(dto).exifInfo!.copyWith(id: a.id);
          a.exifInfo = newExif;
          if (newExif != a.exifInfo) {
            if (a.isInDb) {
              _db.writeTxn(() => a.put(_db));
            } else {
              debugPrint("[loadExif] parameter Asset is not from DB!");
            }
          }
        }
      } else {
        // TODO implement local exif info parsing
      }
    }
    return a;
  }

  Future<void> updateAssets(
    List<Asset> assets,
    UpdateAssetDto updateAssetDto,
  ) async {
    return await _apiService.assetsApi.updateAssets(
      AssetBulkUpdateDto(
        ids: assets.map((e) => e.remoteId!).toList(),
        dateTimeOriginal: updateAssetDto.dateTimeOriginal,
        isFavorite: updateAssetDto.isFavorite,
        isArchived: updateAssetDto.isArchived,
        latitude: updateAssetDto.latitude,
        longitude: updateAssetDto.longitude,
      ),
    );
  }

  Future<List<Asset?>> changeFavoriteStatus(
    List<Asset> assets,
    bool isFavorite,
  ) async {
    try {
      await updateAssets(assets, UpdateAssetDto(isFavorite: isFavorite));

      for (var element in assets) {
        element.isFavorite = isFavorite;
      }

      await _syncService.upsertAssetsWithExif(assets);

      return assets;
    } catch (error, stack) {
      log.severe("Error while changing favorite status", error, stack);
      return Future.value(null);
    }
  }

  Future<List<Asset?>> changeArchiveStatus(
    List<Asset> assets,
    bool isArchived,
  ) async {
    try {
      await updateAssets(assets, UpdateAssetDto(isArchived: isArchived));

      for (var element in assets) {
        element.isArchived = isArchived;
      }

      await _syncService.upsertAssetsWithExif(assets);

      return assets;
    } catch (error, stack) {
      log.severe("Error while changing archive status", error, stack);
      return Future.value(null);
    }
  }

  Future<List<Asset?>> changeDateTime(
    List<Asset> assets,
    String updatedDt,
  ) async {
    try {
      await updateAssets(
        assets,
        UpdateAssetDto(dateTimeOriginal: updatedDt),
      );

      for (var element in assets) {
        element.fileCreatedAt = DateTime.parse(updatedDt);
        element.exifInfo?.dateTimeOriginal = DateTime.parse(updatedDt);
      }

      await _syncService.upsertAssetsWithExif(assets);

      return assets;
    } catch (error, stack) {
      log.severe("Error while changing date/time status", error, stack);
      return Future.value(null);
    }
  }

  Future<List<Asset?>> changeLocation(
    List<Asset> assets,
    LatLng location,
  ) async {
    try {
      await updateAssets(
        assets,
        UpdateAssetDto(
          latitude: location.latitude,
          longitude: location.longitude,
        ),
      );

      for (var element in assets) {
        element.exifInfo?.lat = location.latitude;
        element.exifInfo?.long = location.longitude;
      }

      await _syncService.upsertAssetsWithExif(assets);

      return assets;
    } catch (error, stack) {
      log.severe("Error while changing location status", error, stack);
      return Future.value(null);
    }
  }

  Future<void> syncUploadedAssetToAlbums() async {
    try {
      final [selectedAlbums, excludedAlbums] = await Future.wait([
        _backupService.selectedAlbumsQuery().findAll(),
        _backupService.excludedAlbumsQuery().findAll(),
      ]);

      final candidates = await _backupService.buildUploadCandidates(
        selectedAlbums,
        excludedAlbums,
        useTimeFilter: false,
      );

      final duplicates = await _apiService.assetsApi.checkExistingAssets(
        CheckExistingAssetsDto(
          deviceAssetIds: candidates.map((c) => c.asset.id).toList(),
          deviceId: Store.get(StoreKey.deviceId),
        ),
      );

      if (duplicates != null) {
        candidates
            .removeWhere((c) => !duplicates.existingIds.contains(c.asset.id));
      }

      await refreshRemoteAssets();
      final remoteAssets = await _db.assets
          .where()
          .localIdIsNotNull()
          .filter()
          .remoteIdIsNotNull()
          .findAll();

      /// Map<AlbumName, [AssetId]>
      Map<String, List<String>> assetToAlbums = {};

      for (BackupCandidate candidate in candidates) {
        final asset = remoteAssets.firstWhereOrNull(
          (a) => a.localId == candidate.asset.id,
        );

        if (asset != null) {
          for (final albumName in candidate.albumNames) {
            assetToAlbums.putIfAbsent(albumName, () => []).add(asset.remoteId!);
          }
        }
      }

      // Upload assets to albums
      for (final entry in assetToAlbums.entries) {
        final albumName = entry.key;
        final assetIds = entry.value;

        await _albumService.syncUploadAlbums([albumName], assetIds);
      }
    } catch (error, stack) {
      log.severe("Error while syncing uploaded asset to albums", error, stack);
    }
  }
}
