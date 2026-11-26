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
  static const editProfile = '/more/profile';
  static const changePhone = '/more/profile/phone';
  static const changePassword = '/more/profile/password';
  static const leaderboard = '/more/leaderboard';
  static const schedule = '/more/schedule';
  static const payments = '/more/payments';
  static const coinHistory = '/more/coins';
  static const voucher = '/more/voucher';
  static const openLessons = '/more/open-lessons';
  static const language = '/more/language';
  static const appearance = '/more/appearance';
  static const about = '/more/about';
  static const morePrivacy = '/more/privacy';
}

const _byScreen = {
  'home': Routes.home,
  'game': Routes.game,
  'qr': Routes.qr,
  'shop': Routes.shop,
  'more': Routes.more,
  'coins': Routes.coinHistory,
  'payments': Routes.payments,
  'schedule': Routes.schedule,
  'leaderboard': Routes.leaderboard,
  // Its own page arrives with a later phase; until then, the tab it lives under.
  'orders': Routes.shop,
  'notifications': Routes.notifications,
};

const _byType = {
  'lesson_reminder': Routes.home,
  'account_linked': Routes.home,
  'payment_due': Routes.payments,
  'payment_overdue': Routes.payments,
  'receipt_approved': Routes.payments,
  'receipt_rejected': Routes.payments,
  'points_weekly': Routes.coinHistory,
  'points_deduction': Routes.coinHistory,
  'points_month_result': Routes.leaderboard,
  'reward_update': Routes.shop,
  'voucher_expiring': Routes.voucher,
  'open_lesson_reminder': Routes.openLessons,
};

/// The screen a tapped notification opens: the one its data names, else the
/// one its type belongs to, else the notifications list.
String routeForNotification(Map<String, dynamic> data) => _byScreen[data['screen']] ?? _byType[data['type']] ?? Routes.notifications;
