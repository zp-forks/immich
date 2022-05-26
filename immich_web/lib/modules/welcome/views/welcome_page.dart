import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

class WelcomePage extends HookConsumerWidget {
  const WelcomePage({Key? key}) : super(key: key);
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: Center(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Image(
              image: AssetImage('assets/immich-logo-no-outline.png'),
              width: 200,
              filterQuality: FilterQuality.high,
            ),
            Padding(
              padding: const EdgeInsets.all(24.0),
              child: Text(
                "WELCOME TO IMMICH WEB",
                style: TextStyle(
                    fontSize: 36,
                    fontFamily: "SnowburstOne",
                    color: Theme.of(context).primaryColor,
                    fontWeight: FontWeight.bold),
              ),
            ),
            ElevatedButton(
                style: ButtonStyle(
                  visualDensity: VisualDensity.standard,
                  padding:
                      MaterialStateProperty.all<EdgeInsets>(const EdgeInsets.symmetric(vertical: 10, horizontal: 25)),
                ),
                onPressed: () {},
                child: const Text(
                  "Getting Started",
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ))
          ],
        ),
      ),
    );
  }
}
