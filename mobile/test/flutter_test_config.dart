import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Loads real fonts for every test, so text is measured and drawn as on a
/// phone: Inter (the Android font), a Korean test font, and the icons.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> load(String family, List<String> paths) async {
    final loader = FontLoader(family);
    for (final path in paths) {
      final file = File(path);
      if (file.existsSync()) loader.addFont(file.readAsBytes().then((bytes) => ByteData.sublistView(bytes)));
    }
    await loader.load();
  }

  await load('Inter', ['assets/fonts/Inter-Regular.ttf', 'assets/fonts/Inter-SemiBold.ttf', 'assets/fonts/Inter-Bold.ttf']);
  // Hangul comes from the phone's own fonts; tests stand this one in for them.
  await load('Noto Sans KR', [
    'test/fonts/NotoSansKR-Regular-subset.ttf',
    'test/fonts/NotoSansKR-SemiBold-subset.ttf',
    'test/fonts/NotoSansKR-Bold-subset.ttf',
  ]);
  final flutterRoot = Platform.environment['FLUTTER_ROOT'];
  if (flutterRoot != null) {
    await load('MaterialIcons', ['$flutterRoot/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf']);
  }

  await testMain();
}
