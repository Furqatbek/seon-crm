import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'core/home_state.dart';
import 'core/checkin_state.dart';
import 'core/exam_state.dart';
import 'core/game_state.dart';
import 'core/more_state.dart';
import 'core/shop_state.dart';
import 'core/state.dart';
import 'data/auth_repository.dart';
import 'data/checkin.dart';
import 'data/device_tokens.dart';
import 'data/exams.dart';
import 'data/game.dart';
import 'data/home.dart';
import 'data/more.dart';
import 'data/photo_picker.dart';
import 'data/shop.dart';
import 'data/notifications.dart';
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
        homeRepositoryProvider.overrideWithValue(SupabaseHomeRepository(client)),
        notificationsRepositoryProvider.overrideWithValue(SupabaseNotificationsRepository(client)),
        moreRepositoryProvider.overrideWithValue(SupabaseMoreRepository(client)),
        shopRepositoryProvider.overrideWithValue(SupabaseShopRepository(client)),
        gameRepositoryProvider.overrideWithValue(SupabaseGameRepository(client)),
        examRepositoryProvider.overrideWithValue(SupabaseExamRepository(client)),
        checkinRepositoryProvider.overrideWithValue(SupabaseCheckinRepository(client)),
        qrSecretStoreProvider.overrideWithValue(const SecureQrSecretStore()),
        screenLightProvider.overrideWithValue(const DeviceScreenLight()),
        photoPickerProvider.overrideWithValue(pickPhoto),
        sharedPreferencesProvider.overrideWithValue(preferences),
        pushServiceProvider.overrideWithValue(push),
        appVersionProvider.overrideWithValue(package.version),
      ],
      child: const StudentApp(),
    ),
  );
}
