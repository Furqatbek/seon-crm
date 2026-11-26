// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Seon Topik Student';

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
  String get gameStudentSoon => '1v1 games and mock exams. Wins earn coins.';

  @override
  String get gameAppUserSoon => '1v1 games and mock exams. No coins until you join the centre.';

  @override
  String get qrStudentSoon => 'Your QR code for check-in at reception will be here.';

  @override
  String get qrAppUserSoon => 'QR check-in is for the centre\'s students.';

  @override
  String get shopStudentSoon => 'You will spend your coins on rewards here.';

  @override
  String get shopAppUserSoon => 'You can browse the rewards. Join the centre to spend coins.';

  @override
  String get moreStudentSoon => 'Your profile, leaderboard, schedule and payments will be here.';

  @override
  String get moreAppUserSoon => 'Your profile, voucher and open lessons will be here.';

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
  String get mockExamSoon => 'TOPIK-style practice exams will be here soon.';

  @override
  String get lockedCoins => 'Locked coins';

  @override
  String get lockedCoinsHint => 'Unlocked when you join the centre';

  @override
  String get openLessonTitle => 'Free open lesson';

  @override
  String get openLessonSoon => 'Booking a free open lesson will be here soon.';

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
}
