import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import 'core/localization.dart';
import 'core/router.dart';
import 'core/state.dart';
import 'l10n/app_localizations.dart';
import 'push/notification_routes.dart';
import 'ui/theme.dart';

/// The app: light and dark themes from the tokens, the four languages, the
/// router, and the screen a tapped notification opens.
class StudentApp extends ConsumerStatefulWidget {
  const StudentApp({super.key});

  @override
  ConsumerState<StudentApp> createState() => _StudentAppState();
}

class _StudentAppState extends ConsumerState<StudentApp> {
  StreamSubscription<Map<String, dynamic>>? _opened;

  @override
  void initState() {
    super.initState();
    final push = ref.read(pushServiceProvider);
    _opened = push.opened.listen(_openNotification);
    // The notification that started the app, once the first screen is up.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final data = await push.launchedFrom();
      if (data != null && mounted) _openNotification(data);
    });
  }

  @override
  void dispose() {
    _opened?.cancel();
    super.dispose();
  }

  /// Opens the notification's screen. Signed out, the router leads to Welcome instead.
  void _openNotification(Map<String, dynamic> data) => ref.read(routerProvider).go(routeForNotification(data));

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);
    return MaterialApp.router(
      onGenerateTitle: (context) => AppLocalizations.of(context).appName,
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),
      theme: appTheme(Brightness.light),
      darkTheme: appTheme(Brightness.dark),
      themeMode: settings.themeMode,
      locale: settings.locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: appLocalizationsDelegates,
    );
  }
}
