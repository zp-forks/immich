import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_web/constants/immich_colors.dart';
import 'package:immich_web/routing/router.dart';

void main() {
  runApp(const ProviderScope(child: ImmichWebApp()));
}

class ImmichWebApp extends ConsumerStatefulWidget {
  const ImmichWebApp({Key? key}) : super(key: key);

  @override
  _ImmichAppState createState() => _ImmichAppState();
}

class _ImmichAppState extends ConsumerState<ImmichWebApp> with WidgetsBindingObserver {
  Future<void> initApp() async {
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  initState() {
    super.initState();
    initApp().then((_) => debugPrint("App Init Completed"));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  final _immichRouter = AppRouter();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Stack(
        children: [
          MaterialApp.router(
            title: 'Immich',
            debugShowCheckedModeBanner: false,
            theme: ThemeData(
              brightness: Brightness.light,
              primarySwatch: Colors.indigo,
              fontFamily: 'WorkSans',
              snackBarTheme: const SnackBarThemeData(contentTextStyle: TextStyle(fontFamily: 'WorkSans')),
              scaffoldBackgroundColor: immichBackgroundColor,
              appBarTheme: const AppBarTheme(
                backgroundColor: immichBackgroundColor,
                foregroundColor: Colors.indigo,
                elevation: 1,
                centerTitle: true,
                systemOverlayStyle: SystemUiOverlayStyle.dark,
              ),
            ),
            routeInformationParser: _immichRouter.defaultRouteParser(),
            routerDelegate: _immichRouter.delegate(),
          ),
        ],
      ),
    );
  }
}
