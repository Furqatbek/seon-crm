import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import 'tokens.dart';

/// Light and dark ThemeData, built only from the tokens.
ThemeData appTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? AppColors.dark : AppColors.light;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.primaryFill,
    onPrimary: c.onPrimaryFill,
    secondary: c.accent,
    onSecondary: c.text,
    error: c.danger,
    onError: c.onPrimaryFill,
    surface: c.bg,
    onSurface: c.text,
    onSurfaceVariant: c.textSecondary,
    outline: c.border,
    outlineVariant: c.border,
    surfaceContainerHighest: c.surface,
  );
  OutlineInputBorder field(Color color) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(AppRadii.field),
    borderSide: BorderSide(color: color, width: AppSizes.hairline),
  );
  const none = Color(0x00000000);

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: c.bg,
    canvasColor: c.bg,
    dividerColor: c.border,
    splashFactory: NoSplash.splashFactory,
    highlightColor: none,
    extensions: [c],
    fontFamily: appFontFamily,
    fontFamilyFallback: appFontFallback,
    textTheme: TextTheme(
      headlineMedium: AppType.largeTitle,
      titleLarge: AppType.title,
      titleMedium: AppType.headline,
      bodyLarge: AppType.body,
      bodyMedium: AppType.body,
      bodySmall: AppType.footnote,
      labelLarge: AppType.headline,
      labelSmall: AppType.caption,
    ).apply(bodyColor: c.text, displayColor: c.text),
    appBarTheme: AppBarTheme(
      backgroundColor: c.bg,
      foregroundColor: c.text,
      surfaceTintColor: none,
      elevation: 0,
      scrolledUnderElevation: 0,
      systemOverlayStyle: brightness == Brightness.dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4, vertical: AppSpacing.x4),
      hintStyle: AppType.body.copyWith(color: c.textSecondary),
      errorStyle: const TextStyle(fontSize: 0, height: 0),
      border: field(none),
      enabledBorder: field(none),
      focusedBorder: field(c.primary),
      errorBorder: field(c.danger),
      focusedErrorBorder: field(c.danger),
    ),
    textSelectionTheme: TextSelectionThemeData(cursorColor: c.primary, selectionColor: c.primary.withValues(alpha: 0.25), selectionHandleColor: c.primary),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.elevated,
      surfaceTintColor: none,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.card))),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: c.elevated,
      contentTextStyle: AppType.body.copyWith(color: c.text),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.button),
        side: BorderSide(color: c.border, width: AppSizes.hairline),
      ),
    ),
  );
}
