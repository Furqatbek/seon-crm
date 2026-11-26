// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Uzbek (`uz`).
class AppLocalizationsUz extends AppLocalizations {
  AppLocalizationsUz([String locale = 'uz']) : super(locale);

  @override
  String get appName => 'Seon Topik Student';

  @override
  String get welcomeHeadline => 'Koreys tilini mashq qiling, TOPIKka tayyorlaning';

  @override
  String get createAccount => 'Roʻyxatdan oʻtish';

  @override
  String get signIn => 'Kirish';

  @override
  String get chooseLanguage => 'Tilni tanlang';

  @override
  String get languageUz => 'Oʻzbekcha';

  @override
  String get languageRu => 'Русский';

  @override
  String get languageEn => 'English';

  @override
  String get languageKo => '한국어';

  @override
  String get back => 'Orqaga';

  @override
  String get fullName => 'Ism familiya';

  @override
  String get phone => 'Telefon raqam';

  @override
  String get password => 'Parol';

  @override
  String get showPassword => 'Parolni koʻrsatish';

  @override
  String get hidePassword => 'Parolni yashirish';

  @override
  String get koreanLevel => 'Koreys tili darajangiz';

  @override
  String get levelBeginner => 'Boshlangʻich';

  @override
  String get levelTopik1 => 'TOPIK I';

  @override
  String get levelTopik2 => 'TOPIK II';

  @override
  String get continueAction => 'Davom etish';

  @override
  String get consentBefore => 'Davom etib, ';

  @override
  String get consentLink => 'maxfiylik siyosatiga';

  @override
  String get consentAfter => ' rozilik bildirasiz';

  @override
  String get privacyPolicy => 'Maxfiylik siyosati';

  @override
  String get privacyEmpty => 'Maxfiylik siyosati hali qoʻshilmagan.';

  @override
  String get errorNameRequired => 'Ism va familiyangizni kiriting';

  @override
  String get errorPhoneInvalid => 'Telefon raqamni toʻliq kiriting';

  @override
  String get errorPasswordShort => 'Parol kamida 8 ta belgidan iborat boʻlsin';

  @override
  String get errorPasswordRequired => 'Parolni kiriting';

  @override
  String get errorLevelRequired => 'Darajangizni tanlang';

  @override
  String get errorPasswordsDiffer => 'Parollar mos kelmadi';

  @override
  String get smsCodeTitle => 'SMS kod';

  @override
  String get smsCodeSentBefore => '';

  @override
  String get smsCodeSentAfter => ' raqamiga 6 xonali kod yubordik';

  @override
  String get smsCodeField => '6 xonali kod';

  @override
  String resendIn(String time) {
    return 'Kodni qayta yuborish ($time)';
  }

  @override
  String get resend => 'Kodni qayta yuborish';

  @override
  String get codeResent => 'Kod qayta yuborildi';

  @override
  String get confirm => 'Tasdiqlash';

  @override
  String errorWrongCode(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Kod notoʻgʻri. Yana $count ta urinish qoldi',
      zero: 'Kod notoʻgʻri. Yangi kod soʻrang',
    );
    return '$_temp0';
  }

  @override
  String errorTooManySms(int minutes) {
    return 'Juda koʻp SMS soʻraldi. $minutes daqiqadan keyin urinib koʻring';
  }

  @override
  String get errorAlreadyRegistered => 'Bu raqam allaqachon roʻyxatdan oʻtgan';

  @override
  String get errorInvalidCredentials => 'Telefon raqam yoki parol notoʻgʻri';

  @override
  String get errorNoAccount => 'Bu raqam bilan hisob topilmadi';

  @override
  String get errorPhoneNotSupported => 'Faqat Oʻzbekiston raqamlari qabul qilinadi';

  @override
  String get errorNetwork => 'Internet aloqasi yoʻq. Qayta urinib koʻring';

  @override
  String get errorGeneric => 'Xatolik yuz berdi. Qayta urinib koʻring';

  @override
  String get linkedTitle => 'Akkauntingiz markazga ulandi';

  @override
  String get start => 'Boshlash';

  @override
  String get forgotPassword => 'Parolni unutdingizmi?';

  @override
  String get resetPassword => 'Parolni tiklash';

  @override
  String get resetHint => 'Telefon raqamingizni kiriting, SMS orqali kod yuboramiz';

  @override
  String get sendCode => 'Kod yuborish';

  @override
  String get newPassword => 'Yangi parol';

  @override
  String get repeatPassword => 'Parolni takrorlang';

  @override
  String get save => 'Saqlash';

  @override
  String get passwordSaved => 'Parol saqlandi';

  @override
  String get tabHome => 'Bosh sahifa';

  @override
  String get tabGame => 'Oʻyin';

  @override
  String get tabQr => 'QR kod';

  @override
  String get tabShop => 'Doʻkon';

  @override
  String get tabMore => 'Boshqa';

  @override
  String get soonTitle => 'Tez orada';

  @override
  String get homeStudentSoon => 'Keyingi dars, oʻrningiz, tangalar va balans shu yerda boʻladi.';

  @override
  String get homeAppUserSoon => 'Sinov imtihonlari, ochiq darslar va vaucheringiz shu yerda boʻladi.';

  @override
  String get gameStudentSoon => '1 ga 1 oʻyin va sinov imtihonlari. Gʻalaba uchun tanga olasiz.';

  @override
  String get gameAppUserSoon => '1 ga 1 oʻyin va sinov imtihonlari. Tangalar markazga qoʻshilganingizdan keyin beriladi.';

  @override
  String get qrStudentSoon => 'Markazga kirishda koʻrsatiladigan QR kodingiz shu yerda boʻladi.';

  @override
  String get qrAppUserSoon => 'QR orqali kirish faqat markaz oʻquvchilari uchun.';

  @override
  String get shopStudentSoon => 'Tangalaringizni sovgʻalarga almashtirasiz.';

  @override
  String get shopAppUserSoon => 'Sovgʻalarni koʻrishingiz mumkin. Tanga sarflash uchun markazga qoʻshiling.';

  @override
  String get moreStudentSoon => 'Profil, reyting, dars jadvali va toʻlovlar shu yerda boʻladi.';

  @override
  String get moreAppUserSoon => 'Profil, vaucher va ochiq darslar shu yerda boʻladi.';

  @override
  String get notifications => 'Bildirishnomalar';

  @override
  String get notificationsSoon => 'Bildirishnomalaringiz shu yerda boʻladi.';

  @override
  String get logOut => 'Chiqish';

  @override
  String money(String amount) {
    return '$amount soʻm';
  }

  @override
  String coinsCount(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$formatted tanga');
    return '$_temp0';
  }
}
