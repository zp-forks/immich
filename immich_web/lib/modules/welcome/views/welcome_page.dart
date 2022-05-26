import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

class WelcomePage extends HookConsumerWidget {
  const WelcomePage({Key? key}) : super(key: key);
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final serverUrlInputController = useTextEditingController.fromValue(TextEditingValue.empty);
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 550),
          child: Wrap(
            spacing: 24,
            runSpacing: 36,
            alignment: WrapAlignment.center,
            children: [
              const Image(
                image: AssetImage('assets/immich-logo-no-outline.png'),
                width: 250,
                filterQuality: FilterQuality.high,
              ),
              Text(
                "WELCOME TO IMMICH WEB",
                style: TextStyle(
                  fontSize: 36,
                  fontFamily: "SnowburstOne",
                  color: Theme.of(context).primaryColor,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              SizedBox(
                width: 400,
                child: TextFormField(
                  controller: serverUrlInputController,
                  decoration: const InputDecoration(
                    labelText: 'Server URL',
                    border: OutlineInputBorder(),
                    hintText: 'http://your-server-ip:2283',
                  ),
                ),
              ),
              ElevatedButton(
                  style: ButtonStyle(
                    visualDensity: VisualDensity.standard,
                    padding: MaterialStateProperty.all<EdgeInsets>(
                      const EdgeInsets.symmetric(
                        vertical: 18,
                        horizontal: 80,
                      ),
                    ),
                  ),
                  onPressed: () {},
                  child: const Text(
                    "Getting Started",
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ))
            ],
          ),
        ),
      ),
    );
  }
}
