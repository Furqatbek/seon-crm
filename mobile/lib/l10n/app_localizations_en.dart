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
  String get homeStudentSoon => 'Your next lesson, rank, coins and balance will be here.';

  @override
  String get homeAppUserSoon => 'Mock exams, open lessons and your voucher will be here.';

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
  String get notificationsSoon => 'Your notifications will be here.';

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
}
