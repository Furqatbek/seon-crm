import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_ko.dart';
import 'app_localizations_ru.dart';
import 'app_localizations_uz.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('uz'), Locale('en'), Locale('ko'), Locale('ru')];

  /// No description provided for @appName.
  ///
  /// In uz, this message translates to:
  /// **'Seon Topik Student'**
  String get appName;

  /// No description provided for @welcomeHeadline.
  ///
  /// In uz, this message translates to:
  /// **'Koreys tilini mashq qiling, TOPIKka tayyorlaning'**
  String get welcomeHeadline;

  /// No description provided for @createAccount.
  ///
  /// In uz, this message translates to:
  /// **'Roʻyxatdan oʻtish'**
  String get createAccount;

  /// No description provided for @signIn.
  ///
  /// In uz, this message translates to:
  /// **'Kirish'**
  String get signIn;

  /// No description provided for @chooseLanguage.
  ///
  /// In uz, this message translates to:
  /// **'Tilni tanlang'**
  String get chooseLanguage;

  /// No description provided for @languageUz.
  ///
  /// In uz, this message translates to:
  /// **'Oʻzbekcha'**
  String get languageUz;

  /// No description provided for @languageRu.
  ///
  /// In uz, this message translates to:
  /// **'Русский'**
  String get languageRu;

  /// No description provided for @languageEn.
  ///
  /// In uz, this message translates to:
  /// **'English'**
  String get languageEn;

  /// No description provided for @languageKo.
  ///
  /// In uz, this message translates to:
  /// **'한국어'**
  String get languageKo;

  /// No description provided for @back.
  ///
  /// In uz, this message translates to:
  /// **'Orqaga'**
  String get back;

  /// No description provided for @fullName.
  ///
  /// In uz, this message translates to:
  /// **'Ism familiya'**
  String get fullName;

  /// No description provided for @phone.
  ///
  /// In uz, this message translates to:
  /// **'Telefon raqam'**
  String get phone;

  /// No description provided for @password.
  ///
  /// In uz, this message translates to:
  /// **'Parol'**
  String get password;

  /// No description provided for @showPassword.
  ///
  /// In uz, this message translates to:
  /// **'Parolni koʻrsatish'**
  String get showPassword;

  /// No description provided for @hidePassword.
  ///
  /// In uz, this message translates to:
  /// **'Parolni yashirish'**
  String get hidePassword;

  /// No description provided for @koreanLevel.
  ///
  /// In uz, this message translates to:
  /// **'Koreys tili darajangiz'**
  String get koreanLevel;

  /// No description provided for @levelBeginner.
  ///
  /// In uz, this message translates to:
  /// **'Boshlangʻich'**
  String get levelBeginner;

  /// No description provided for @levelTopik1.
  ///
  /// In uz, this message translates to:
  /// **'TOPIK I'**
  String get levelTopik1;

  /// No description provided for @levelTopik2.
  ///
  /// In uz, this message translates to:
  /// **'TOPIK II'**
  String get levelTopik2;

  /// No description provided for @continueAction.
  ///
  /// In uz, this message translates to:
  /// **'Davom etish'**
  String get continueAction;

  /// No description provided for @consentBefore.
  ///
  /// In uz, this message translates to:
  /// **'Davom etib, '**
  String get consentBefore;

  /// No description provided for @consentLink.
  ///
  /// In uz, this message translates to:
  /// **'maxfiylik siyosatiga'**
  String get consentLink;

  /// No description provided for @consentAfter.
  ///
  /// In uz, this message translates to:
  /// **' rozilik bildirasiz'**
  String get consentAfter;

  /// No description provided for @privacyPolicy.
  ///
  /// In uz, this message translates to:
  /// **'Maxfiylik siyosati'**
  String get privacyPolicy;

  /// No description provided for @privacyEmpty.
  ///
  /// In uz, this message translates to:
  /// **'Maxfiylik siyosati hali qoʻshilmagan.'**
  String get privacyEmpty;

  /// No description provided for @errorNameRequired.
  ///
  /// In uz, this message translates to:
  /// **'Ism va familiyangizni kiriting'**
  String get errorNameRequired;

  /// No description provided for @errorPhoneInvalid.
  ///
  /// In uz, this message translates to:
  /// **'Telefon raqamni toʻliq kiriting'**
  String get errorPhoneInvalid;

  /// No description provided for @errorPasswordShort.
  ///
  /// In uz, this message translates to:
  /// **'Parol kamida 8 ta belgidan iborat boʻlsin'**
  String get errorPasswordShort;

  /// No description provided for @errorPasswordRequired.
  ///
  /// In uz, this message translates to:
  /// **'Parolni kiriting'**
  String get errorPasswordRequired;

  /// No description provided for @errorLevelRequired.
  ///
  /// In uz, this message translates to:
  /// **'Darajangizni tanlang'**
  String get errorLevelRequired;

  /// No description provided for @errorPasswordsDiffer.
  ///
  /// In uz, this message translates to:
  /// **'Parollar mos kelmadi'**
  String get errorPasswordsDiffer;

  /// No description provided for @smsCodeTitle.
  ///
  /// In uz, this message translates to:
  /// **'SMS kod'**
  String get smsCodeTitle;

  /// No description provided for @smsCodeSentBefore.
  ///
  /// In uz, this message translates to:
  /// **''**
  String get smsCodeSentBefore;

  /// No description provided for @smsCodeSentAfter.
  ///
  /// In uz, this message translates to:
  /// **' raqamiga 6 xonali kod yubordik'**
  String get smsCodeSentAfter;

  /// No description provided for @smsCodeField.
  ///
  /// In uz, this message translates to:
  /// **'6 xonali kod'**
  String get smsCodeField;

  /// No description provided for @resendIn.
  ///
  /// In uz, this message translates to:
  /// **'Kodni qayta yuborish ({time})'**
  String resendIn(String time);

  /// No description provided for @resend.
  ///
  /// In uz, this message translates to:
  /// **'Kodni qayta yuborish'**
  String get resend;

  /// No description provided for @codeResent.
  ///
  /// In uz, this message translates to:
  /// **'Kod qayta yuborildi'**
  String get codeResent;

  /// No description provided for @confirm.
  ///
  /// In uz, this message translates to:
  /// **'Tasdiqlash'**
  String get confirm;

  /// No description provided for @errorWrongCode.
  ///
  /// In uz, this message translates to:
  /// **'{count, plural, =0{Kod notoʻgʻri. Yangi kod soʻrang} other{Kod notoʻgʻri. Yana {count} ta urinish qoldi}}'**
  String errorWrongCode(int count);

  /// No description provided for @errorTooManySms.
  ///
  /// In uz, this message translates to:
  /// **'Juda koʻp SMS soʻraldi. {minutes} daqiqadan keyin urinib koʻring'**
  String errorTooManySms(int minutes);

  /// No description provided for @errorAlreadyRegistered.
  ///
  /// In uz, this message translates to:
  /// **'Bu raqam allaqachon roʻyxatdan oʻtgan'**
  String get errorAlreadyRegistered;

  /// No description provided for @errorInvalidCredentials.
  ///
  /// In uz, this message translates to:
  /// **'Telefon raqam yoki parol notoʻgʻri'**
  String get errorInvalidCredentials;

  /// No description provided for @errorNoAccount.
  ///
  /// In uz, this message translates to:
  /// **'Bu raqam bilan hisob topilmadi'**
  String get errorNoAccount;

  /// No description provided for @errorPhoneNotSupported.
  ///
  /// In uz, this message translates to:
  /// **'Faqat Oʻzbekiston raqamlari qabul qilinadi'**
  String get errorPhoneNotSupported;

  /// No description provided for @errorNetwork.
  ///
  /// In uz, this message translates to:
  /// **'Internet aloqasi yoʻq. Qayta urinib koʻring'**
  String get errorNetwork;

  /// No description provided for @errorGeneric.
  ///
  /// In uz, this message translates to:
  /// **'Xatolik yuz berdi. Qayta urinib koʻring'**
  String get errorGeneric;

  /// No description provided for @linkedTitle.
  ///
  /// In uz, this message translates to:
  /// **'Akkauntingiz markazga ulandi'**
  String get linkedTitle;

  /// No description provided for @start.
  ///
  /// In uz, this message translates to:
  /// **'Boshlash'**
  String get start;

  /// No description provided for @forgotPassword.
  ///
  /// In uz, this message translates to:
  /// **'Parolni unutdingizmi?'**
  String get forgotPassword;

  /// No description provided for @resetPassword.
  ///
  /// In uz, this message translates to:
  /// **'Parolni tiklash'**
  String get resetPassword;

  /// No description provided for @resetHint.
  ///
  /// In uz, this message translates to:
  /// **'Telefon raqamingizni kiriting, SMS orqali kod yuboramiz'**
  String get resetHint;

  /// No description provided for @sendCode.
  ///
  /// In uz, this message translates to:
  /// **'Kod yuborish'**
  String get sendCode;

  /// No description provided for @newPassword.
  ///
  /// In uz, this message translates to:
  /// **'Yangi parol'**
  String get newPassword;

  /// No description provided for @repeatPassword.
  ///
  /// In uz, this message translates to:
  /// **'Parolni takrorlang'**
  String get repeatPassword;

  /// No description provided for @save.
  ///
  /// In uz, this message translates to:
  /// **'Saqlash'**
  String get save;

  /// No description provided for @passwordSaved.
  ///
  /// In uz, this message translates to:
  /// **'Parol saqlandi'**
  String get passwordSaved;

  /// No description provided for @tabHome.
  ///
  /// In uz, this message translates to:
  /// **'Bosh sahifa'**
  String get tabHome;

  /// No description provided for @tabGame.
  ///
  /// In uz, this message translates to:
  /// **'Oʻyin'**
  String get tabGame;

  /// No description provided for @tabQr.
  ///
  /// In uz, this message translates to:
  /// **'QR kod'**
  String get tabQr;

  /// No description provided for @tabShop.
  ///
  /// In uz, this message translates to:
  /// **'Doʻkon'**
  String get tabShop;

  /// No description provided for @tabMore.
  ///
  /// In uz, this message translates to:
  /// **'Boshqa'**
  String get tabMore;

  /// No description provided for @soonTitle.
  ///
  /// In uz, this message translates to:
  /// **'Tez orada'**
  String get soonTitle;

  /// No description provided for @homeStudentSoon.
  ///
  /// In uz, this message translates to:
  /// **'Keyingi dars, oʻrningiz, tangalar va balans shu yerda boʻladi.'**
  String get homeStudentSoon;

  /// No description provided for @homeAppUserSoon.
  ///
  /// In uz, this message translates to:
  /// **'Sinov imtihonlari, ochiq darslar va vaucheringiz shu yerda boʻladi.'**
  String get homeAppUserSoon;

  /// No description provided for @gameStudentSoon.
  ///
  /// In uz, this message translates to:
  /// **'1 ga 1 oʻyin va sinov imtihonlari. Gʻalaba uchun tanga olasiz.'**
  String get gameStudentSoon;

  /// No description provided for @gameAppUserSoon.
  ///
  /// In uz, this message translates to:
  /// **'1 ga 1 oʻyin va sinov imtihonlari. Tangalar markazga qoʻshilganingizdan keyin beriladi.'**
  String get gameAppUserSoon;

  /// No description provided for @qrStudentSoon.
  ///
  /// In uz, this message translates to:
  /// **'Markazga kirishda koʻrsatiladigan QR kodingiz shu yerda boʻladi.'**
  String get qrStudentSoon;

  /// No description provided for @qrAppUserSoon.
  ///
  /// In uz, this message translates to:
  /// **'QR orqali kirish faqat markaz oʻquvchilari uchun.'**
  String get qrAppUserSoon;

  /// No description provided for @shopStudentSoon.
  ///
  /// In uz, this message translates to:
  /// **'Tangalaringizni sovgʻalarga almashtirasiz.'**
  String get shopStudentSoon;

  /// No description provided for @shopAppUserSoon.
  ///
  /// In uz, this message translates to:
  /// **'Sovgʻalarni koʻrishingiz mumkin. Tanga sarflash uchun markazga qoʻshiling.'**
  String get shopAppUserSoon;

  /// No description provided for @moreStudentSoon.
  ///
  /// In uz, this message translates to:
  /// **'Profil, reyting, dars jadvali va toʻlovlar shu yerda boʻladi.'**
  String get moreStudentSoon;

  /// No description provided for @moreAppUserSoon.
  ///
  /// In uz, this message translates to:
  /// **'Profil, vaucher va ochiq darslar shu yerda boʻladi.'**
  String get moreAppUserSoon;

  /// No description provided for @notifications.
  ///
  /// In uz, this message translates to:
  /// **'Bildirishnomalar'**
  String get notifications;

  /// No description provided for @notificationsSoon.
  ///
  /// In uz, this message translates to:
  /// **'Bildirishnomalaringiz shu yerda boʻladi.'**
  String get notificationsSoon;

  /// No description provided for @logOut.
  ///
  /// In uz, this message translates to:
  /// **'Chiqish'**
  String get logOut;

  /// No description provided for @money.
  ///
  /// In uz, this message translates to:
  /// **'{amount} soʻm'**
  String money(String amount);

  /// No description provided for @coinsCount.
  ///
  /// In uz, this message translates to:
  /// **'{count, plural, other{{formatted} tanga}}'**
  String coinsCount(int count, String formatted);
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['en', 'ko', 'ru', 'uz'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'ko':
      return AppLocalizationsKo();
    case 'ru':
      return AppLocalizationsRu();
    case 'uz':
      return AppLocalizationsUz();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
