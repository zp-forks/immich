import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:immich_web/modules/login/views/login_page.dart';
import 'package:immich_web/modules/welcome/views/welcome_page.dart';

part 'router.gr.dart';

@MaterialAutoRouter(
  replaceInRouteName: 'Page,Route',
  routes: <AutoRoute>[
    AutoRoute(page: WelcomePage, initial: true),
    AutoRoute(page: LoginPage),
  ],
)
// class AppRouter extends _$AppRouter {
// AppRouter() : super(authGuard: AuthGuard());
// }

class AppRouter extends _$AppRouter {}
