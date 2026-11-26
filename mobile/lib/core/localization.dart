import 'package:cupertino_ui/cupertino_ui.dart' show GlobalCupertinoLocalizations;
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart' show GlobalWidgetsLocalizations;
import 'package:material_ui/material_ui.dart' show GlobalMaterialLocalizations;

import '../l10n/app_localizations.dart';

/// The app's own texts and Flutter's built-in ones (dates, the copy and paste
/// menu, screen-reader hints) in uz, ru, en and ko. The list gen-l10n writes
/// still names the delegates of the old Material library, which this Flutter
/// no longer reads, so the app gives its own.
const appLocalizationsDelegates = <LocalizationsDelegate<dynamic>>[
  AppLocalizations.delegate,
  GlobalMaterialLocalizations.delegate,
  GlobalCupertinoLocalizations.delegate,
  GlobalWidgetsLocalizations.delegate,
];
