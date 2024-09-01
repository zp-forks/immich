import 'dart:math' as math;

import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/extensions/asyncvalue_extensions.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/theme_extensions.dart';
import 'package:immich_mobile/models/search/search_curated_content.model.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/providers/search/people.provider.dart';
import 'package:immich_mobile/providers/search/search_page_state.provider.dart';
import 'package:immich_mobile/widgets/search/curated_people_row.dart';
import 'package:immich_mobile/widgets/search/curated_places_row.dart';
import 'package:immich_mobile/widgets/search/person_name_edit_form.dart';
import 'package:immich_mobile/widgets/search/search_row_section.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/entities/asset.entity.dart';
import 'package:immich_mobile/providers/server_info.provider.dart';
import 'package:immich_mobile/widgets/common/immich_app_bar.dart';
import 'package:immich_mobile/widgets/common/scaffold_error_body.dart';

@RoutePage()
// ignore: must_be_immutable
class SearchPage extends HookConsumerWidget {
  const SearchPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final places = ref.watch(getPreviewPlacesProvider);
    final curatedPeople = ref.watch(getAllPeopleProvider);
    final isMapEnabled =
        ref.watch(serverInfoProvider.select((v) => v.serverFeatures.map));
    final double imageSize = math.min(context.width / 3, 150);

    TextStyle categoryTitleStyle = const TextStyle(
      fontWeight: FontWeight.w500,
      fontSize: 15.0,
    );

    Color categoryIconColor = context.colorScheme.onSurface;

    showNameEditModel(
      String personId,
      String personName,
    ) {
      return showDialog(
        context: context,
        builder: (BuildContext context) {
          return PersonNameEditForm(personId: personId, personName: personName);
        },
      );
    }

    buildPeople() {
      return curatedPeople.widgetWhen(
        onError: (error, stack) => const ScaffoldErrorBody(withIcon: false),
        onData: (people) {
          return SearchRowSection(
            onViewAllPressed: () => context.pushRoute(const AllPeopleRoute()),
            title: "search_page_people".tr(),
            isEmpty: people.isEmpty,
            child: CuratedPeopleRow(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              content: people
                  .map((e) => SearchCuratedContent(label: e.name, id: e.id))
                  .take(12)
                  .toList(),
              onTap: (content, index) {
                context.pushRoute(
                  PersonResultRoute(
                    personId: content.id,
                    personName: content.label,
                  ),
                );
              },
              onNameTap: (person, index) => {
                showNameEditModel(person.id, person.label),
              },
            ),
          );
        },
      );
    }

    buildPlaces() {
      return places.widgetWhen(
        onError: (error, stack) => const ScaffoldErrorBody(withIcon: false),
        onData: (data) {
          return SearchRowSection(
            onViewAllPressed: () => context.pushRoute(const AllPlacesRoute()),
            title: "search_page_places".tr(),
            isEmpty: !isMapEnabled && data.isEmpty,
            child: CuratedPlacesRow(
              isMapEnabled: isMapEnabled,
              content: data,
              imageSize: imageSize,
              onTap: (content, index) {
                context.pushRoute(
                  SearchInputRoute(
                    prefilter: SearchFilter(
                      people: {},
                      location: SearchLocationFilter(
                        city: content.label,
                      ),
                      camera: SearchCameraFilter(),
                      date: SearchDateFilter(),
                      display: SearchDisplayFilters(
                        isNotInAlbum: false,
                        isArchive: false,
                        isFavorite: false,
                      ),
                      mediaType: AssetType.other,
                    ),
                  ),
                );
              },
            ),
          );
        },
      );
    }

    buildSearchButton() {
      return GestureDetector(
        onTap: () {
          context.pushRoute(SearchInputRoute());
        },
        child: Card(
          elevation: 0,
          color: context.colorScheme.surfaceContainerHigh,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(50),
          ),
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 16.0,
              vertical: 12.0,
            ),
            child: Row(
              children: [
                Icon(
                  Icons.search,
                  color: context.colorScheme.onSurfaceSecondary,
                ),
                const SizedBox(width: 16.0),
                Text(
                  "search_bar_hint",
                  style: context.textTheme.bodyLarge?.copyWith(
                    color: context.colorScheme.onSurfaceSecondary,
                    fontWeight: FontWeight.w400,
                  ),
                ).tr(),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: const ImmichAppBar(),
      body: ListView(
        children: [
          buildSearchButton(),
          const SizedBox(height: 8.0),
          buildPeople(),
          const SizedBox(height: 8.0),
          buildPlaces(),
          const SizedBox(height: 24.0),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'search_page_your_activity',
              style: context.textTheme.bodyLarge?.copyWith(
                fontWeight: FontWeight.w500,
              ),
            ).tr(),
          ),
          ListTile(
            leading: Icon(
              Icons.favorite_border_rounded,
              color: categoryIconColor,
            ),
            title:
                Text('search_page_favorites', style: categoryTitleStyle).tr(),
            onTap: () => context.pushRoute(const FavoritesRoute()),
          ),
          const CategoryDivider(),
          ListTile(
            leading: Icon(
              Icons.schedule_outlined,
              color: categoryIconColor,
            ),
            title: Text(
              'search_page_recently_added',
              style: categoryTitleStyle,
            ).tr(),
            onTap: () => context.pushRoute(const RecentlyAddedRoute()),
          ),
          const SizedBox(height: 24.0),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0),
            child: Text(
              'search_page_categories',
              style: context.textTheme.bodyLarge?.copyWith(
                fontWeight: FontWeight.w500,
              ),
            ).tr(),
          ),
          ListTile(
            title: Text('search_page_videos', style: categoryTitleStyle).tr(),
            leading: Icon(
              Icons.play_circle_outline,
              color: categoryIconColor,
            ),
            onTap: () => context.pushRoute(const AllVideosRoute()),
          ),
          const CategoryDivider(),
          ListTile(
            title: Text(
              'search_page_motion_photos',
              style: categoryTitleStyle,
            ).tr(),
            leading: Icon(
              Icons.motion_photos_on_outlined,
              color: categoryIconColor,
            ),
            onTap: () => context.pushRoute(const AllMotionPhotosRoute()),
          ),
        ],
      ),
    );
  }
}

class CategoryDivider extends StatelessWidget {
  const CategoryDivider({super.key});

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(
        left: 56,
        right: 16,
      ),
      child: Divider(
        height: 0,
      ),
    );
  }
}
