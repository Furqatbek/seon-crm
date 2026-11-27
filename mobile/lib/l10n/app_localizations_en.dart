// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Seon Topik';

  @override
  String get welcomeHeadline => 'Practise Korean and get ready for TOPIK';

  @override
  String get createAccount => 'Create account';

  @override
  String get signIn => 'Sign in';

  @override
  String get chooseLanguage => 'Choose a language';

  @override
  String get languageUz => 'Oʻzbekcha';

  @override
  String get languageRu => 'Русский';

  @override
  String get languageEn => 'English';

  @override
  String get languageKo => '한국어';

  @override
  String get back => 'Back';

  @override
  String get fullName => 'Full name';

  @override
  String get phone => 'Phone number';

  @override
  String get password => 'Password';

  @override
  String get showPassword => 'Show password';

  @override
  String get hidePassword => 'Hide password';

  @override
  String get koreanLevel => 'Your Korean level';

  @override
  String get levelBeginner => 'Beginner';

  @override
  String get levelTopik1 => 'TOPIK I';

  @override
  String get levelTopik2 => 'TOPIK II';

  @override
  String get continueAction => 'Continue';

  @override
  String get consentBefore => 'By continuing you agree to the ';

  @override
  String get consentLink => 'privacy policy';

  @override
  String get consentAfter => '';

  @override
  String get privacyPolicy => 'Privacy policy';

  @override
  String get privacyEmpty => 'The privacy policy has not been added yet.';

  @override
  String get errorNameRequired => 'Enter your full name';

  @override
  String get errorPhoneInvalid => 'Enter the whole phone number';

  @override
  String get errorPasswordShort => 'The password needs at least 8 characters';

  @override
  String get errorPasswordRequired => 'Enter your password';

  @override
  String get errorLevelRequired => 'Choose your level';

  @override
  String get errorPasswordsDiffer => 'The passwords do not match';

  @override
  String get smsCodeTitle => 'SMS code';

  @override
  String get smsCodeSentBefore => 'We sent a 6-digit code to ';

  @override
  String get smsCodeSentAfter => '';

  @override
  String get smsCodeField => '6-digit code';

  @override
  String resendIn(String time) {
    return 'Send the code again ($time)';
  }

  @override
  String get resend => 'Send the code again';

  @override
  String get codeResent => 'The code was sent again';

  @override
  String get confirm => 'Confirm';

  @override
  String errorWrongCode(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Wrong code. $count tries left',
      one: 'Wrong code. $count try left',
      zero: 'Wrong code. Ask for a new one',
    );
    return '$_temp0';
  }

  @override
  String errorTooManySms(int minutes) {
    return 'Too many SMS. Try again in $minutes minutes';
  }

  @override
  String get errorAlreadyRegistered => 'This number is already registered';

  @override
  String get errorInvalidCredentials => 'Wrong phone number or password';

  @override
  String get errorNoAccount => 'No account was found for this number';

  @override
  String get errorPhoneNotSupported => 'Only Uzbek phone numbers can be used';

  @override
  String get errorNetwork => 'No internet connection. Try again';

  @override
  String get errorGeneric => 'Something went wrong. Try again';

  @override
  String get linkedTitle => 'Your account is linked to the centre';

  @override
  String get start => 'Start';

  @override
  String get forgotPassword => 'Forgot your password?';

  @override
  String get resetPassword => 'Reset password';

  @override
  String get resetHint => 'Enter your phone number and we will text you a code';

  @override
  String get sendCode => 'Send code';

  @override
  String get newPassword => 'New password';

  @override
  String get repeatPassword => 'Repeat the password';

  @override
  String get save => 'Save';

  @override
  String get passwordSaved => 'Password saved';

  @override
  String get tabHome => 'Home';

  @override
  String get tabGame => 'Game';

  @override
  String get tabQr => 'QR code';

  @override
  String get tabShop => 'Shop';

  @override
  String get tabMore => 'More';

  @override
  String get soonTitle => 'Coming soon';

  @override
  String get notifications => 'Notifications';

  @override
  String get logOut => 'Log out';

  @override
  String money(String amount) {
    return 'UZS $amount';
  }

  @override
  String coinsCount(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$formatted coins', one: '$formatted coin');
    return '$_temp0';
  }

  @override
  String greeting(String name) {
    return 'Hello, $name';
  }

  @override
  String unreadCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count unread notifications',
      one: '$count unread notification',
      zero: 'No unread notifications',
    );
    return '$_temp0';
  }

  @override
  String get chooseGroup => 'Choose a group';

  @override
  String get offlineBanner => 'No internet connection. What you see may be out of date.';

  @override
  String get loadFailedBanner => 'The page could not be updated. Pull down to try again.';

  @override
  String get retry => 'Try again';

  @override
  String get nextLesson => 'Next lesson';

  @override
  String get exam => 'Exam';

  @override
  String get nothingScheduled => 'No lessons coming up';

  @override
  String get today => 'Today';

  @override
  String get tomorrow => 'Tomorrow';

  @override
  String get yesterday => 'Yesterday';

  @override
  String get earlier => 'Earlier';

  @override
  String dayAtTime(String day, String time) {
    return '$day, $time';
  }

  @override
  String roomNumber(String room) {
    return 'Room $room';
  }

  @override
  String get weekdays => 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday';

  @override
  String get months => 'January,February,March,April,May,June,July,August,September,October,November,December';

  @override
  String dayMonth(int day, String month) {
    return '$month $day';
  }

  @override
  String inDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'in $count days', one: 'in $count day');
    return '$_temp0';
  }

  @override
  String inHoursMinutes(int hours, int minutes) {
    return 'in $hours h $minutes min';
  }

  @override
  String inHours(int hours) {
    return 'in $hours h';
  }

  @override
  String inMinutes(int minutes) {
    return 'in $minutes min';
  }

  @override
  String get startingNow => 'Starting now';

  @override
  String get rankInGroup => 'Rank in group';

  @override
  String rankPlace(int rank) {
    return '#$rank';
  }

  @override
  String rankOf(int count) {
    return 'of $count, this month';
  }

  @override
  String get rankNone => 'No ranking yet this month';

  @override
  String get coins => 'Coins';

  @override
  String coinsThisWeek(String count) {
    return '+$count this week';
  }

  @override
  String get balance => 'Balance';

  @override
  String get balancePaid => 'Paid';

  @override
  String nextPaymentOn(String date) {
    return 'next payment $date';
  }

  @override
  String balanceDueBy(String date) {
    return 'pay by $date';
  }

  @override
  String balanceDebtSince(String date) {
    return 'overdue since $date';
  }

  @override
  String get attendance => 'Attendance';

  @override
  String get thisMonth => 'this month';

  @override
  String get noLessonsYet => 'No lessons yet this month';

  @override
  String levelPill(String level) {
    return '$level level';
  }

  @override
  String get mockExamTitle => 'Mock exam';

  @override
  String get lockedCoins => 'Locked coins';

  @override
  String get lockedCoinsHint => 'Unlocked when you join the centre';

  @override
  String get openLessonTitle => 'Free open lesson';

  @override
  String get bookOpenLesson => 'Book a free open lesson';

  @override
  String get voucherTitle => 'A gift for you!';

  @override
  String voucherPercent(int percent) {
    return '$percent% off your first month';
  }

  @override
  String voucherFixed(String amount) {
    return '$amount off your first month';
  }

  @override
  String get voucherTrialWeek => 'A free trial week';

  @override
  String validUntil(String date) {
    return 'until $date';
  }

  @override
  String get markAllRead => 'Mark all as read';

  @override
  String get notificationsEmpty => 'No notifications yet';

  @override
  String get unread => 'Unread';

  @override
  String get editProfile => 'Edit profile';

  @override
  String get leaderboard => 'Leaderboard';

  @override
  String get schedule => 'Schedule';

  @override
  String get payments => 'Payments';

  @override
  String get coinHistory => 'Coin history';

  @override
  String get myVoucher => 'My voucher';

  @override
  String get openLessons => 'Open lessons';

  @override
  String get language => 'Language';

  @override
  String get appearance => 'Appearance';

  @override
  String get themeSystem => 'System';

  @override
  String get themeLight => 'Light';

  @override
  String get themeDark => 'Dark';

  @override
  String get aboutCentre => 'About the centre';

  @override
  String get aboutEmpty => 'Nothing has been written about the centre yet.';

  @override
  String get deleteAccount => 'Delete account';

  @override
  String get deleteWillBeDeleted => 'Will be deleted';

  @override
  String get deleteLogin => 'Login';

  @override
  String get deleteCoins => 'Coins';

  @override
  String get deleteResults => 'Results';

  @override
  String get deleteBookings => 'Open lesson bookings';

  @override
  String get deleteKept => 'The centre keeps';

  @override
  String get deletePaymentRecords => 'Payment records';

  @override
  String get deleteAction => 'Delete';

  @override
  String get cancel => 'Cancel';

  @override
  String get deleteFailed => 'The account could not be deleted. Try again';

  @override
  String you(String name) {
    return '$name (you)';
  }

  @override
  String get scopeGroup => 'My group';

  @override
  String get scopeCentre => 'Centre';

  @override
  String get periodMonth => 'This month';

  @override
  String get periodAll => 'All time';

  @override
  String ofPeople(int count) {
    return 'of $count';
  }

  @override
  String get leaderboardEmpty => 'The leaderboard is empty for now';

  @override
  String get noGroupYet => 'You are not in a group yet';

  @override
  String get weekdaysShort => 'Mon,Tue,Wed,Thu,Fri,Sat,Sun';

  @override
  String weekRange(String from, String to) {
    return '$from – $to';
  }

  @override
  String get previousWeek => 'Previous week';

  @override
  String get nextWeek => 'Next week';

  @override
  String dayWithDate(String weekday, String date) {
    return '$weekday, $date';
  }

  @override
  String get cancelled => 'Cancelled';

  @override
  String get noLessonsThisWeek => 'No lessons this week';

  @override
  String timeRange(String from, String to) {
    return '$from–$to';
  }

  @override
  String nextPaymentBy(String date) {
    return 'Next payment by $date';
  }

  @override
  String get balanceDue => 'Payment due';

  @override
  String get balanceDebt => 'Overdue';

  @override
  String get payByCard => 'Pay by card';

  @override
  String get myReceipts => 'My receipts';

  @override
  String get comingSoon => 'Coming soon';

  @override
  String get paymentReceived => 'Payment received';

  @override
  String receiptLine(String date, String number) {
    return '$date · receipt no. $number';
  }

  @override
  String monthFee(String month) {
    return '$month fee';
  }

  @override
  String chargedLine(String date) {
    return '$date · charged';
  }

  @override
  String get adjustment => 'Adjustment';

  @override
  String get monthsNominative => 'January,February,March,April,May,June,July,August,September,October,November,December';

  @override
  String get paymentsEmpty => 'No payments yet';

  @override
  String get payAtReception => 'Pay at reception';

  @override
  String get payAtReceptionHint => 'In cash or by card';

  @override
  String get coinHistoryEmpty => 'No coins yet';

  @override
  String get sourceAttendance => 'Came to the lesson';

  @override
  String get sourcePerfectMonth => 'Perfect month';

  @override
  String get sourceOnTime => 'Fee paid on time';

  @override
  String get sourceReferral => 'A friend enrolled';

  @override
  String get sourceTeacherAward => 'From the teacher';

  @override
  String get sourceTeacherDeduction => 'Taken by the teacher';

  @override
  String get sourceAdjustment => 'Changed by the centre';

  @override
  String get sourceRewardHold => 'Order';

  @override
  String get sourceRewardReturn => 'Order returned';

  @override
  String get sourceGameWin => 'Game win';

  @override
  String get sourceExam => 'Mock exam';

  @override
  String get voucherEmpty => 'You have no voucher yet. You get one after your first mock exam.';

  @override
  String get photo => 'Photo';

  @override
  String get changePhoto => 'Change photo';

  @override
  String get takePhoto => 'Camera';

  @override
  String get chooseFromGallery => 'Gallery';

  @override
  String get removePhoto => 'Remove photo';

  @override
  String get cropTitle => 'Crop the photo';

  @override
  String get cropHint => 'Move and zoom the photo';

  @override
  String get done => 'Done';

  @override
  String get photoFailed => 'The photo could not be saved. Try again';

  @override
  String get photoSaved => 'Photo saved';

  @override
  String get changePhone => 'Change phone number';

  @override
  String get newPhone => 'New phone number';

  @override
  String get phoneChangeHint => 'We text a code to the new number. The number changes once the code is confirmed.';

  @override
  String get phoneSame => 'This is your current number';

  @override
  String get phoneChanged => 'Phone number changed';

  @override
  String get changePassword => 'Change password';

  @override
  String get staffOnlyHint => 'Your name, birthday and parent details are changed by the centre\'s staff only.';

  @override
  String get birthDate => 'Birthday';

  @override
  String get parentName => 'Parent';

  @override
  String get parentPhone => 'Parent\'s phone';

  @override
  String fullDate(String day, int year) {
    return '$day, $year';
  }

  @override
  String weekInMonth(int from, int to, String month) {
    return '$month $from–$to';
  }

  @override
  String get myOrders => 'My orders';

  @override
  String get shopEmpty => 'No rewards yet';

  @override
  String get soldOut => 'Sold out';

  @override
  String moreCoinsNeeded(String coins) {
    return '$coins more needed';
  }

  @override
  String get shopJoinBanner => 'Join the centre to spend coins';

  @override
  String get freeLesson => 'Free lesson';

  @override
  String get shopVariant => 'Option';

  @override
  String get chooseVariant => 'Choose an option';

  @override
  String unitsLeft(int count) {
    return '$count left';
  }

  @override
  String get orderAction => 'Order';

  @override
  String get confirmOrderTitle => 'Confirm your order';

  @override
  String get balanceNow => 'Balance now';

  @override
  String get balanceAfter => 'After the order';

  @override
  String get pickupNote => 'You collect it at reception';

  @override
  String get orderPlaced => 'Order placed';

  @override
  String get orderRequested => 'Requested';

  @override
  String get orderReady => 'Ready for pickup';

  @override
  String get orderGiven => 'Given';

  @override
  String get orderRejected => 'Rejected';

  @override
  String get orderCancelled => 'Cancelled';

  @override
  String get pickupNow => 'Collect it at reception';

  @override
  String givenOn(String date) {
    return 'Given, $date';
  }

  @override
  String get coinsReturned => 'Coins returned';

  @override
  String get orderCancelDone => 'Order cancelled, coins returned';

  @override
  String get cancelOrder => 'Cancel order';

  @override
  String get ordersEmpty => 'No orders yet';

  @override
  String get shopErrorCoins => 'Not enough coins';

  @override
  String get shopErrorSoldOut => 'Sorry, this has just sold out';

  @override
  String get shopErrorNotOnOffer => 'This is no longer on offer';

  @override
  String get shopErrorTooLate => 'This order can no longer be cancelled';

  @override
  String get productGone => 'This item was not found';

  @override
  String get qrRotates => 'The code changes every 30 seconds';

  @override
  String get qrShowAtReception => 'Show this at reception';

  @override
  String get qrWorksOffline => 'Works without the internet too';

  @override
  String qrTodayArrived(String time) {
    return 'Today: arrived $time';
  }

  @override
  String qrTodayLeft(String time) {
    return 'Today: left $time';
  }

  @override
  String get qrTodayNone => 'Not arrived yet today';

  @override
  String get qrLockedTitle => 'The QR code is for the centre\'s students';

  @override
  String get qrLockedHint => 'It works once you join the centre';

  @override
  String get qrBookFreeLesson => 'Book a free open lesson';

  @override
  String get qrNeedsInternet => 'Connect to the internet once to get your code';

  @override
  String get qrCodeLabel => 'QR code for checking in at the centre';

  @override
  String get gameZone => 'Game zone';

  @override
  String get gameDuel => '1v1';

  @override
  String get gameExams => 'Mock exams';

  @override
  String gamePitch(String coins) {
    return 'A 1v1 duel. The winner gets $coins.';
  }

  @override
  String get gamePitchNoCoins => 'A 1v1 duel: 10 questions, pull the rope to your side.';

  @override
  String get gameNoCoinsAppUser => 'No coins until you join the centre';

  @override
  String get gamePlayNow => 'Play now';

  @override
  String get gameChallenge => 'Challenge a classmate';

  @override
  String get gameBankNotReady => 'This subject does not have enough questions yet';

  @override
  String gameRewardedWins(int done, int of) {
    return 'Rewarded wins today: $done/$of';
  }

  @override
  String get gameRecent => 'Recent matches';

  @override
  String get gameRecentEmpty => 'No matches yet';

  @override
  String get gameWin => 'Win';

  @override
  String get gameLoss => 'Loss';

  @override
  String get gameDraw => 'Draw';

  @override
  String get gameComputer => 'Computer';

  @override
  String get gameSearching => 'Looking for an opponent…';

  @override
  String get gameNobodyFree => 'Nobody is free right now';

  @override
  String get gamePractice => 'Practise against the computer';

  @override
  String get gamePracticeNoCoins => 'Practice gives no coins';

  @override
  String get gameWaitMore => 'Keep waiting';

  @override
  String get gameInvite => 'Challenge';

  @override
  String get gameInviteWaiting => 'Waiting…';

  @override
  String gameInviteDeclined(String name) {
    return '$name declined the challenge';
  }

  @override
  String gameInviteExpired(String name) {
    return '$name did not answer';
  }

  @override
  String get gameClassmatesEmpty => 'No classmate in this group has the app yet';

  @override
  String get gameSearchHint => 'Search';

  @override
  String gameInvitedYou(String name) {
    return '$name challenged you to a game';
  }

  @override
  String get gameAccept => 'Accept';

  @override
  String get gameDecline => 'Decline';

  @override
  String get gameInviteGone => 'The challenge is no longer open';

  @override
  String get gameInMatch => 'You are in a match';

  @override
  String get gameGetReady => 'Get ready';

  @override
  String gameQuestionOf(int n, int of) {
    return '$n/$of';
  }

  @override
  String get gameCorrect => 'Right!';

  @override
  String get gameCorrectFaster => 'Right! You were faster';

  @override
  String get gameCorrectSlower => 'Right, but your opponent was faster';

  @override
  String get gameWrong => 'Wrong';

  @override
  String get gameTimeUp => 'Time is up';

  @override
  String get gameOpponentAnswered => 'Your opponent has answered';

  @override
  String get gameWaitingOpponent => 'Waiting for your opponent…';

  @override
  String get gameReconnecting => 'Connection lost. Reconnecting…';

  @override
  String get gameMatchGone => 'This match was not found';

  @override
  String get gameCancelled => 'The match was cancelled';

  @override
  String get gameBackToLobby => 'Back to the game zone';

  @override
  String get gameWinTitle => 'You won!';

  @override
  String get gameLossTitle => 'You lost';

  @override
  String get gameDrawTitle => 'A draw';

  @override
  String get gameForfeitWin => 'Your opponent left the match';

  @override
  String get gameForfeitLoss => 'The match ended because the connection was lost';

  @override
  String gameCorrectAnswers(int you, int opponent) {
    return 'Right answers: $you – $opponent';
  }

  @override
  String get gameLimitReached => 'Today\'s limit is reached — no coins given';

  @override
  String get gameOpponentNotStudent => 'Your opponent is not the centre\'s student — no coins given';

  @override
  String get gamePlayAgain => 'Play again';

  @override
  String get gameSeeQuestions => 'See the questions';

  @override
  String get gameQuestions => 'Questions';

  @override
  String get gameRightAnswer => 'Right answer:';

  @override
  String gameYourAnswer(String answer) {
    return 'Your answer: $answer';
  }

  @override
  String get gameNoAnswer => 'No answer';

  @override
  String get gameYou => 'You';

  @override
  String gameRopeLabel(int position) {
    return 'Rope: $position';
  }

  @override
  String gameSecondsLeft(int seconds) {
    return '$seconds seconds left';
  }

  @override
  String get examsEmpty => 'No practice exams for this level yet';

  @override
  String examMeta(int listening, int reading, int minutes) {
    return 'Listening $listening · Reading $reading · $minutes min';
  }

  @override
  String examUpToCoins(String coins) {
    return 'up to $coins';
  }

  @override
  String examDone(int correct, int of) {
    return 'Completed · $correct/$of';
  }

  @override
  String get examRetake => 'Retake (no coins)';

  @override
  String get examRetakePlain => 'Retake';

  @override
  String get examContinue => 'Continue';

  @override
  String get examListening => 'Listening';

  @override
  String get examReading => 'Reading';

  @override
  String examSectionMeta(int questions, int minutes) {
    return '$questions questions · $minutes min';
  }

  @override
  String get examPractice => 'TOPIK-style practice exam';

  @override
  String get examRules => 'Rules';

  @override
  String examRulePlays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'Each audio plays $count times', one: 'Each audio plays once');
    return '$_temp0';
  }

  @override
  String get examRuleClock => 'The clock does not stop';

  @override
  String examRuleCoins(String coins) {
    return 'Each right answer = $coins (first attempt only)';
  }

  @override
  String get examRuleLocked => 'The coins unlock when you join the centre';

  @override
  String get examRuleNoCoins => 'A retake gives no coins';

  @override
  String get examHeadphones => 'Put on headphones';

  @override
  String get examStart => 'Start';

  @override
  String get examNotOpen => 'This exam is not open now';

  @override
  String examPlaysLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count plays left', one: '$count play left');
    return '$_temp0';
  }

  @override
  String get examNoPlaysLeft => 'No plays left';

  @override
  String get examPlay => 'Play the audio';

  @override
  String get examPlaying => 'Playing…';

  @override
  String get examAudioFailed => 'The audio could not be played. Try again';

  @override
  String get examFlag => 'Flag';

  @override
  String get examUnflag => 'Unflag';

  @override
  String get examNext => 'Next';

  @override
  String get examSubmitSection => 'Submit section';

  @override
  String get examQuestions => 'Questions';

  @override
  String get examAnswered => 'Answered';

  @override
  String get examFlagged => 'Flagged';

  @override
  String get examUnanswered => 'Unanswered';

  @override
  String examQuestionNumber(int number) {
    return 'Question $number';
  }

  @override
  String get examOpenGrid => 'Question list';

  @override
  String examTimeLeft(String time) {
    return 'Time left: $time';
  }

  @override
  String examUnansweredCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count questions unanswered', one: '$count question unanswered');
    return '$_temp0';
  }

  @override
  String examChoice(int number) {
    return 'Choice $number';
  }

  @override
  String get examResult => 'Result';

  @override
  String get examTotal => 'Total';

  @override
  String get examEstimateLabel => 'Estimated level:';

  @override
  String examLevelN(int level) {
    return 'Level $level';
  }

  @override
  String get examEstimateNote => 'Practice estimate, not an official TOPIK result';

  @override
  String examCoinsLocked(String coins) {
    return '$coins locked';
  }

  @override
  String get examNoCoinsRetake => 'A retake: no coins given';

  @override
  String get examReview => 'Review answers';

  @override
  String get examOfferTitle => 'Unlock your coins';

  @override
  String get examOfferText => 'Join the centre and your locked coins move to your balance. Start with a free open lesson.';

  @override
  String get later => 'Later';

  @override
  String get examYourAnswer => 'Your answer';

  @override
  String get examRightAnswer => 'Right answer';

  @override
  String get examNotAnswered => 'Not answered';

  @override
  String get examTranscript => 'What the audio says';

  @override
  String get examGone => 'The exam was not found';

  @override
  String get examBackToList => 'Back to the exams';

  @override
  String get examHeroAllDone => 'You have completed every exam of your level';

  @override
  String get voucherLabel => 'Voucher';

  @override
  String voucherTrialDays(int days) {
    return '$days free trial days';
  }

  @override
  String get voucherTellCode => 'Tell this code at reception';

  @override
  String get voucherOnePerPerson => 'One voucher per person';

  @override
  String get voucherCopy => 'Copy the code';

  @override
  String get voucherCopied => 'Code copied';

  @override
  String get voucherExpired => 'Expired';

  @override
  String get voucherUsed => 'Used';

  @override
  String get openLessonsTitle => 'Free open lessons';

  @override
  String get openLessonsEmpty => 'No open lessons in the next 4 weeks';

  @override
  String openLessonSeatsLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count seats left', one: '$count seat left');
    return '$_temp0';
  }

  @override
  String get openLessonFull => 'No seats left';

  @override
  String get openLessonBook => 'Book a seat';

  @override
  String get openLessonBooked => 'Seat booked';

  @override
  String get openLessonCancelHint => 'You can cancel up to 2 hours before';

  @override
  String get openLessonCancel => 'Cancel the booking';

  @override
  String get openLessonCancelled => 'Booking cancelled';

  @override
  String get openLessonCancelClosed => 'Too late to cancel: the lesson starts in under 2 hours';

  @override
  String get openLessonYours => 'Your booking';

  @override
  String get openLessonOneBooking => 'One booking at a time';

  @override
  String get openLessonNext => 'Next lesson';

  @override
  String get openLessonEveryLevel => 'Every level';

  @override
  String get openLessonErrorFull => 'This lesson has no seats left';

  @override
  String get openLessonErrorGone => 'This lesson is no longer available';

  @override
  String get openLessonErrorHasBooking => 'You already have a booking';

  @override
  String weekdayAndDate(String weekday, String date) {
    return '$weekday, $date';
  }

  @override
  String get amountDue => 'Amount due';

  @override
  String get nothingDue => 'Nothing is due';

  @override
  String get cardCopy => 'Copy';

  @override
  String get cardCopied => 'Card number copied';

  @override
  String get payStep1 => 'Transfer to this card from your bank\'s app.';

  @override
  String get payStep2 => 'Upload the receipt.';

  @override
  String get receiptAmount => 'Amount';

  @override
  String get receiptDate => 'Date';

  @override
  String get receiptGroup => 'Group';

  @override
  String get receiptUpload => 'Upload receipt';

  @override
  String get receiptUploadHint => 'PNG, JPG or PDF, up to 5 MB';

  @override
  String get receiptRemoveFile => 'Remove the file';

  @override
  String get receiptComment => 'Comment (optional)';

  @override
  String get receiptSend => 'Send';

  @override
  String get receiptSent => 'Receipt sent. We will tell you once it is checked.';

  @override
  String get receiptFromCamera => 'Camera';

  @override
  String get receiptFromGallery => 'Gallery';

  @override
  String get receiptFromFile => 'PDF file';

  @override
  String get receiptPending => 'Being checked';

  @override
  String get receiptApproved => 'Approved';

  @override
  String receiptRejected(String reason) {
    return 'Rejected: $reason';
  }

  @override
  String get receiptsEmpty => 'You have not sent any receipts yet';

  @override
  String get receiptErrorType => 'The file must be a PNG, a JPG or a PDF';

  @override
  String get receiptErrorTooLarge => 'The file is larger than 5 MB';

  @override
  String get receiptErrorAmount => 'Enter the amount';

  @override
  String get receiptErrorDate => 'Check the date';

  @override
  String get receiptErrorGroup => 'Choose the group';

  @override
  String get payByCardOff => 'Pay by card is not available yet. You can pay at reception.';

  @override
  String fileSizeMb(String size) {
    return '$size MB';
  }

  @override
  String fileSizeKb(String size) {
    return '$size KB';
  }

  @override
  String get moneyUnit => 'soʻm';
}
