// Where tapping a notification leads. The server sends the notification's
// type and, for some, the screen to open, in the push's data.

/// Paths of the app's screens.
abstract final class Routes {
  static const welcome = '/welcome';
  static const signUp = '/sign-up';
  static const code = '/code';
  static const signIn = '/sign-in';
  static const forgot = '/forgot-password';
  static const newPassword = '/new-password';
  static const linked = '/linked';
  static const privacy = '/privacy';
  static const home = '/home';
  static const game = '/game';
  static const qr = '/qr';
  static const shop = '/shop';
  static const more = '/more';
  static const notifications = '/notifications';
}

const _byScreen = {
  'home': Routes.home,
  'game': Routes.game,
  'qr': Routes.qr,
  'shop': Routes.shop,
  'more': Routes.more,
  // Their own pages arrive with later phases; until then, the tab they live under.
  'coins': Routes.more,
  'payments': Routes.more,
  'orders': Routes.shop,
  'notifications': Routes.notifications,
};

const _byType = {
  'lesson_reminder': Routes.home,
  'account_linked': Routes.home,
  'payment_due': Routes.more,
  'payment_overdue': Routes.more,
  'receipt_approved': Routes.more,
  'receipt_rejected': Routes.more,
  'points_weekly': Routes.more,
  'points_deduction': Routes.more,
  'points_month_result': Routes.more,
  'reward_update': Routes.shop,
  'voucher_expiring': Routes.more,
  'open_lesson_reminder': Routes.more,
};

/// The screen a tapped notification opens: the one its data names, else the
/// one its type belongs to, else the notifications list.
String routeForNotification(Map<String, dynamic> data) => _byScreen[data['screen']] ?? _byType[data['type']] ?? Routes.notifications;
