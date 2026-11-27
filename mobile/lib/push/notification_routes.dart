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
  static String gameSearch(String? groupId) => groupId == null ? '/game/search' : '/game/search?group=$groupId';
  static String gameClassmates(String groupId) => '/game/classmates?group=$groupId';
  static String match(String id, {String? groupId}) => groupId == null ? '/game/match/$id' : '/game/match/$id?group=$groupId';
  static String matchReview(String id) => '/game/match/$id/review';

  /// The Game tab with the mock exams showing.
  static const gameExams = '/game?side=exams';
  static String examIntro(String examId) => '/game/exam/$examId';
  static String examAttempt(String attemptId) => '/game/attempt/$attemptId';
  static String examReview(String attemptId) => '/game/attempt/$attemptId/review';
  static const orders = '/shop/orders';
  static String product(String id) => '/shop/product/$id';
  static const more = '/more';
  static const notifications = '/notifications';
  static const editProfile = '/more/profile';
  static const changePhone = '/more/profile/phone';
  static const changePassword = '/more/profile/password';
  static const leaderboard = '/more/leaderboard';
  static const schedule = '/more/schedule';
  static const payments = '/more/payments';
  static const payByCard = '/more/payments/card';
  static const myReceipts = '/more/payments/receipts';
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
  'orders': Routes.orders,
  'notifications': Routes.notifications,
};

const _byType = {
  'lesson_reminder': Routes.home,
  'game_invite': Routes.game,
  'account_linked': Routes.home,
  'payment_due': Routes.payments,
  'payment_overdue': Routes.payments,
  'receipt_approved': Routes.payments,
  'receipt_rejected': Routes.payments,
  'points_weekly': Routes.coinHistory,
  'points_deduction': Routes.coinHistory,
  'points_month_result': Routes.leaderboard,
  'reward_update': Routes.orders,
  'voucher_expiring': Routes.voucher,
  'open_lesson_reminder': Routes.openLessons,
};

/// The screen a tapped notification opens: the one its data names, else the
/// one its type belongs to, else the notifications list.
String routeForNotification(Map<String, dynamic> data) => _byScreen[data['screen']] ?? _byType[data['type']] ?? Routes.notifications;
