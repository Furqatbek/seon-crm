import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'core/state.dart';
import 'data/auth_repository.dart';
import 'data/device_tokens.dart';
import 'env.dart';
import 'push/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  assert(isConfigured, 'Run with --dart-define-from-file=env/dev.json (see env/dev.json.example).');

  // The session is kept on the phone until Log out or Delete account.
  await Supabase.initialize(url: supabaseUrl, publishableKey: supabasePublishableKey);
  final client = Supabase.instance.client;
  final preferences = await SharedPreferences.getInstance();
  final push = await FirebasePushService.start();
  final package = await PackageInfo.fromPlatform();

  runApp(
    ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(SupabaseAuthRepository(client)),
        deviceTokenRepositoryProvider.overrideWithValue(SupabaseDeviceTokenRepository(client)),
        sharedPreferencesProvider.overrideWithValue(preferences),
        pushServiceProvider.overrideWithValue(push),
        appVersionProvider.overrideWithValue(package.version),
      ],
      child: const StudentApp(),
    ),
  );
}
