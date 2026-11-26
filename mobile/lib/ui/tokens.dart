import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';

// The exact values behind the approved designs — docs/STUDENT_APP_SPEC.md →
// "Theme and languages". No widget takes a colour, radius, size or text style
// from anywhere else.

/// One theme's colours. Read with `AppColors.of(context)`.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.bg,
    required this.surface,
    required this.elevated,
    required this.border,
    required this.text,
    required this.textSecondary,
    required this.primary,
    required this.primaryFill,
    required this.onPrimaryFill,
    required this.accent,
    required this.accentText,
    required this.success,
    required this.warning,
    required this.danger,
    required this.glow,
    required this.elevatedShadow,
    required this.groupedBg,
    required this.groupedCard,
  });

  /// A page of grouped lists (More): the page behind, and the cards on it.
  final Color groupedBg;
  final Color groupedCard;

  /// Page.
  final Color bg;

  /// Cards, inputs, tab bar.
  final Color surface;

  /// Sheets, pop-overs.
  final Color elevated;

  /// Hairlines.
  final Color border;

  /// Main text.
  final Color text;

  /// Labels, hints.
  final Color textSecondary;

  /// Links, active icons, violet text.
  final Color primary;

  /// Primary buttons, the raised QR tab.
  final Color primaryFill;
  final Color onPrimaryFill;

  /// Highlights, the opponent's side in games. Decoration only in light.
  final Color accent;

  /// Cyan that is readable as text on this theme's background.
  final Color accentText;

  /// Paid, correct, approved.
  final Color success;

  /// Due soon, checking.
  final Color warning;

  /// Debt, wrong, rejected.
  final Color danger;

  /// Around primary buttons and the hero card: dark theme only.
  final List<BoxShadow> glow;

  /// The soft shadow under sheets and pop-overs: light theme only.
  final List<BoxShadow> elevatedShadow;

  static const light = AppColors(
    bg: Color(0xFFFFFFFF),
    surface: Color(0xFFF5F6FA),
    elevated: Color(0xFFFFFFFF),
    border: Color(0xFFE4E4EE),
    text: Color(0xFF0F0F1A),
    textSecondary: Color(0xFF5B5B70),
    primary: Color(0xFF7C4DFF),
    primaryFill: Color(0xFF7C4DFF),
    onPrimaryFill: Color(0xFFFFFFFF),
    accent: Color(0xFF00E5FF),
    accentText: Color(0xFF007C91),
    success: Color(0xFF007A3D),
    warning: Color(0xFF9A5B00),
    danger: Color(0xFFD7263D),
    glow: [],
    elevatedShadow: [BoxShadow(color: Color(0x1F0F0F1A), blurRadius: 24, offset: Offset(0, 8))],
    groupedBg: Color(0xFFF5F6FA),
    groupedCard: Color(0xFFFFFFFF),
  );

  static const dark = AppColors(
    bg: Color(0xFF0B0B14),
    surface: Color(0xFF151526),
    elevated: Color(0xFF1E1E33),
    border: Color(0xFF2A2A40),
    text: Color(0xFFF4F4FA),
    textSecondary: Color(0xFFA0A0B8),
    primary: Color(0xFF9D7BFF),
    primaryFill: Color(0xFF7C4DFF),
    onPrimaryFill: Color(0xFFFFFFFF),
    accent: Color(0xFF00E5FF),
    accentText: Color(0xFF00E5FF),
    success: Color(0xFF00E676),
    warning: Color(0xFFFFB300),
    danger: Color(0xFFFF4D6D),
    // 0 0 24 px violet at 35%.
    glow: [BoxShadow(color: Color(0x597C4DFF), blurRadius: 24)],
    elevatedShadow: [],
    groupedBg: Color(0xFF0B0B14),
    groupedCard: Color(0xFF151526),
  );

  /// A faint wash of the primary colour: icon circles, the unread dot's halo.
  Color get primaryTint => primary.withValues(alpha: 0.14);

  /// Behind a warning, such as the offline banner.
  Color get warningTint => warning.withValues(alpha: 0.14);

  static AppColors of(BuildContext context) => Theme.of(context).extension<AppColors>()!;

  @override
  AppColors copyWith() => this;

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) => other is AppColors && t >= 0.5 ? other : this;
}

/// #7C4DFF → #00E5FF: the Home hero outline, timers, the game rope and
/// progress rings only.
const appGradient = LinearGradient(colors: [Color(0xFF7C4DFF), Color(0xFF00E5FF)], begin: Alignment.centerLeft, end: Alignment.centerRight);

/// Shapes.
abstract final class AppRadii {
  static const card = 20.0;
  static const button = 14.0;
  static const field = 14.0;
  static const pill = 999.0;
}

abstract final class AppSizes {
  /// Buttons and inputs.
  static const buttonHeight = 52.0;

  /// The smallest thing a finger is asked to hit.
  static const tapTarget = 44.0;

  /// Card and field hairline.
  static const hairline = 1.0;

  /// The raised QR tab.
  static const qrTab = 56.0;
  static const tabBarHeight = 64.0;
  static const icon = 24.0;

  /// The gradient outline of the hero card, and a spinner's line.
  static const outline = 2.0;

  /// A card-sized skeleton.
  static const skeletonCard = 96.0;

  /// One box of the SMS code.
  static const codeBoxHeight = 60.0;

  /// The big tick on the linked confirmation.
  static const badge = 80.0;

  /// The logo on Welcome, and the smaller one on Sign in.
  static const logo = 160.0;

  /// The check-in code at its largest.
  static const qrMax = 260.0;
  static const logoSmall = 112.0;

  /// The bell, a notification's icon circle and other round buttons.
  static const roundButton = 44.0;

  /// The dot of an unread notification, and the least width of the bell's badge.
  static const dot = 8.0;
  static const counter = 20.0;

  /// A row of a grouped list.
  static const row = 52.0;

  /// The photo on the More hero and on Edit profile, and on the podium.
  static const avatar = 72.0;
  static const avatarLarge = 96.0;

  /// The side of the square a profile photo is saved as, in pixels.
  static const avatarPixels = 512;

  /// How faded a disabled control is.
  static const disabledOpacity = 0.5;
}

/// A 4 pt grid; 16 pt at the sides of a page.
abstract final class AppSpacing {
  static const x1 = 4.0;
  static const x2 = 8.0;
  static const x3 = 12.0;
  static const x4 = 16.0;
  static const x5 = 20.0;
  static const x6 = 24.0;
  static const x8 = 32.0;
  static const x10 = 40.0;
  static const page = 16.0;
}

/// SF Pro on iPhone (the system font), Inter on Android. Hangul falls back to
/// the phone's own fonts.
String? get appFontFamily => defaultTargetPlatform == TargetPlatform.iOS ? null : 'Inter';
const appFontFallback = ['Apple SD Gothic Neo', 'Noto Sans CJK KR', 'Noto Sans KR'];

/// Type: size / line height. The two titles are
/// bold, as the approved designs draw them; the headline is semibold.
abstract final class AppType {
  static TextStyle _style(double size, double height, FontWeight weight) =>
      TextStyle(fontFamily: appFontFamily, fontFamilyFallback: appFontFallback, fontSize: size, height: height / size, fontWeight: weight, letterSpacing: 0);

  /// Equal-width digits, for numbers that change or line up: money, coins, timers.
  static TextStyle tabular(TextStyle style) => style.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);

  static final largeTitle = _style(28, 34, FontWeight.w700);
  static final title = _style(22, 28, FontWeight.w700);
  static final headline = _style(17, 22, FontWeight.w600);
  static final body = _style(15, 20, FontWeight.w400);
  static final footnote = _style(13, 18, FontWeight.w400);
  static final caption = _style(12, 16, FontWeight.w400);
}
