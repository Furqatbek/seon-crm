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

  /// No description provided for @notifications.
  ///
  /// In uz, this message translates to:
  /// **'Bildirishnomalar'**
  String get notifications;

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

  /// No description provided for @greeting.
  ///
  /// In uz, this message translates to:
  /// **'Salom, {name}'**
  String greeting(String name);

  /// No description provided for @unreadCount.
  ///
  /// In uz, this message translates to:
  /// **'{count, plural, =0{Oʻqilmagan bildirishnoma yoʻq} other{{count} ta oʻqilmagan bildirishnoma}}'**
  String unreadCount(int count);

  /// No description provided for @chooseGroup.
  ///
  /// In uz, this message translates to:
  /// **'Guruhni tanlang'**
  String get chooseGroup;

  /// No description provided for @offlineBanner.
  ///
  /// In uz, this message translates to:
  /// **'Internet aloqasi yoʻq. Maʼlumotlar yangilanmagan boʻlishi mumkin.'**
  String get offlineBanner;

  /// No description provided for @loadFailedBanner.
  ///
  /// In uz, this message translates to:
  /// **'Maʼlumotlarni yangilab boʻlmadi. Pastga tortib qayta urinib koʻring.'**
  String get loadFailedBanner;

  /// No description provided for @retry.
  ///
  /// In uz, this message translates to:
  /// **'Qayta urinish'**
  String get retry;

  /// No description provided for @nextLesson.
  ///
  /// In uz, this message translates to:
  /// **'Keyingi dars'**
  String get nextLesson;

  /// No description provided for @exam.
  ///
  /// In uz, this message translates to:
  /// **'Imtihon'**
  String get exam;

  /// No description provided for @nothingScheduled.
  ///
  /// In uz, this message translates to:
  /// **'Yaqin darslar yoʻq'**
  String get nothingScheduled;

  /// No description provided for @today.
  ///
  /// In uz, this message translates to:
  /// **'Bugun'**
  String get today;

  /// No description provided for @tomorrow.
  ///
  /// In uz, this message translates to:
  /// **'Ertaga'**
  String get tomorrow;

  /// No description provided for @yesterday.
  ///
  /// In uz, this message translates to:
  /// **'Kecha'**
  String get yesterday;

  /// No description provided for @earlier.
  ///
  /// In uz, this message translates to:
  /// **'Oldinroq'**
  String get earlier;

  /// No description provided for @dayAtTime.
  ///
  /// In uz, this message translates to:
  /// **'{day}, {time}'**
  String dayAtTime(String day, String time);

  /// No description provided for @roomNumber.
  ///
  /// In uz, this message translates to:
  /// **'{room}-xona'**
  String roomNumber(String room);

  /// No description provided for @weekdays.
  ///
  /// In uz, this message translates to:
  /// **'Dushanba,Seshanba,Chorshanba,Payshanba,Juma,Shanba,Yakshanba'**
  String get weekdays;

  /// No description provided for @months.
  ///
  /// In uz, this message translates to:
  /// **'yanvar,fevral,mart,aprel,may,iyun,iyul,avgust,sentabr,oktabr,noyabr,dekabr'**
  String get months;

  /// No description provided for @dayMonth.
  ///
  /// In uz, this message translates to:
  /// **'{day}-{month}'**
  String dayMonth(int day, String month);

  /// No description provided for @inDays.
  ///
  /// In uz, this message translates to:
  /// **'{count} kundan soʻng'**
  String inDays(int count);

  /// No description provided for @inHoursMinutes.
  ///
  /// In uz, this message translates to:
  /// **'{hours} soat {minutes} daqiqadan soʻng'**
  String inHoursMinutes(int hours, int minutes);

  /// No description provided for @inHours.
  ///
  /// In uz, this message translates to:
  /// **'{hours} soatdan soʻng'**
  String inHours(int hours);

  /// No description provided for @inMinutes.
  ///
  /// In uz, this message translates to:
  /// **'{minutes} daqiqadan soʻng'**
  String inMinutes(int minutes);

  /// No description provided for @startingNow.
  ///
  /// In uz, this message translates to:
  /// **'Hozir boshlanadi'**
  String get startingNow;

  /// No description provided for @rankInGroup.
  ///
  /// In uz, this message translates to:
  /// **'Guruhdagi oʻrin'**
  String get rankInGroup;

  /// No description provided for @rankPlace.
  ///
  /// In uz, this message translates to:
  /// **'{rank}-oʻrin'**
  String rankPlace(int rank);

  /// No description provided for @rankOf.
  ///
  /// In uz, this message translates to:
  /// **'{count} kishidan, shu oy'**
  String rankOf(int count);

  /// No description provided for @rankNone.
  ///
  /// In uz, this message translates to:
  /// **'Bu oy hali reyting yoʻq'**
  String get rankNone;

  /// No description provided for @coins.
  ///
  /// In uz, this message translates to:
  /// **'Tangalar'**
  String get coins;

  /// No description provided for @coinsThisWeek.
  ///
  /// In uz, this message translates to:
  /// **'+{count} shu hafta'**
  String coinsThisWeek(String count);

  /// No description provided for @balance.
  ///
  /// In uz, this message translates to:
  /// **'Balans'**
  String get balance;

  /// No description provided for @balancePaid.
  ///
  /// In uz, this message translates to:
  /// **'Toʻlangan'**
  String get balancePaid;

  /// No description provided for @nextPaymentOn.
  ///
  /// In uz, this message translates to:
  /// **'keyingi toʻlov {date}'**
  String nextPaymentOn(String date);

  /// No description provided for @balanceDueBy.
  ///
  /// In uz, this message translates to:
  /// **'{date} gacha toʻlang'**
  String balanceDueBy(String date);

  /// No description provided for @balanceDebtSince.
  ///
  /// In uz, this message translates to:
  /// **'qarz, muddati {date} edi'**
  String balanceDebtSince(String date);

  /// No description provided for @attendance.
  ///
  /// In uz, this message translates to:
  /// **'Davomat'**
  String get attendance;

  /// No description provided for @thisMonth.
  ///
  /// In uz, this message translates to:
  /// **'shu oy'**
  String get thisMonth;

  /// No description provided for @noLessonsYet.
  ///
  /// In uz, this message translates to:
  /// **'Bu oy hali dars boʻlmagan'**
  String get noLessonsYet;

  /// No description provided for @levelPill.
  ///
  /// In uz, this message translates to:
  /// **'{level} darajasi'**
  String levelPill(String level);

  /// No description provided for @mockExamTitle.
  ///
  /// In uz, this message translates to:
  /// **'Sinov imtihoni'**
  String get mockExamTitle;

  /// No description provided for @mockExamSoon.
  ///
  /// In uz, this message translates to:
  /// **'TOPIK uslubidagi mashq imtihonlari tez orada shu yerda boʻladi.'**
  String get mockExamSoon;

  /// No description provided for @lockedCoins.
  ///
  /// In uz, this message translates to:
  /// **'Qulflangan tangalar'**
  String get lockedCoins;

  /// No description provided for @lockedCoinsHint.
  ///
  /// In uz, this message translates to:
  /// **'Markazga qoʻshilganingizda ochiladi'**
  String get lockedCoinsHint;

  /// No description provided for @openLessonTitle.
  ///
  /// In uz, this message translates to:
  /// **'Bepul ochiq dars'**
  String get openLessonTitle;

  /// No description provided for @openLessonSoon.
  ///
  /// In uz, this message translates to:
  /// **'Ochiq darslarga yozilish tez orada shu yerda ochiladi.'**
  String get openLessonSoon;

  /// No description provided for @bookOpenLesson.
  ///
  /// In uz, this message translates to:
  /// **'Bepul ochiq darsga yozilish'**
  String get bookOpenLesson;

  /// No description provided for @voucherTitle.
  ///
  /// In uz, this message translates to:
  /// **'Sizga sovgʻa!'**
  String get voucherTitle;

  /// No description provided for @voucherPercent.
  ///
  /// In uz, this message translates to:
  /// **'Birinchi oyga {percent}% chegirma'**
  String voucherPercent(int percent);

  /// No description provided for @voucherFixed.
  ///
  /// In uz, this message translates to:
  /// **'Birinchi oyga {amount} chegirma'**
  String voucherFixed(String amount);

  /// No description provided for @voucherTrialWeek.
  ///
  /// In uz, this message translates to:
  /// **'Bir haftalik bepul sinov darslari'**
  String get voucherTrialWeek;

  /// No description provided for @validUntil.
  ///
  /// In uz, this message translates to:
  /// **'{date}gacha'**
  String validUntil(String date);

  /// No description provided for @markAllRead.
  ///
  /// In uz, this message translates to:
  /// **'Hammasini oʻqildi deb belgilash'**
  String get markAllRead;

  /// No description provided for @notificationsEmpty.
  ///
  /// In uz, this message translates to:
  /// **'Hozircha bildirishnomalar yoʻq'**
  String get notificationsEmpty;

  /// No description provided for @unread.
  ///
  /// In uz, this message translates to:
  /// **'Oʻqilmagan'**
  String get unread;

  /// No description provided for @editProfile.
  ///
  /// In uz, this message translates to:
  /// **'Profilni tahrirlash'**
  String get editProfile;

  /// No description provided for @leaderboard.
  ///
  /// In uz, this message translates to:
  /// **'Reyting'**
  String get leaderboard;

  /// No description provided for @schedule.
  ///
  /// In uz, this message translates to:
  /// **'Dars jadvali'**
  String get schedule;

  /// No description provided for @payments.
  ///
  /// In uz, this message translates to:
  /// **'Toʻlovlar'**
  String get payments;

  /// No description provided for @coinHistory.
  ///
  /// In uz, this message translates to:
  /// **'Tanga tarixi'**
  String get coinHistory;

  /// No description provided for @myVoucher.
  ///
  /// In uz, this message translates to:
  /// **'Mening vaucherim'**
  String get myVoucher;

  /// No description provided for @openLessons.
  ///
  /// In uz, this message translates to:
  /// **'Ochiq darslarim'**
  String get openLessons;

  /// No description provided for @language.
  ///
  /// In uz, this message translates to:
  /// **'Til'**
  String get language;

  /// No description provided for @appearance.
  ///
  /// In uz, this message translates to:
  /// **'Koʻrinish'**
  String get appearance;

  /// No description provided for @themeSystem.
  ///
  /// In uz, this message translates to:
  /// **'Tizim'**
  String get themeSystem;

  /// No description provided for @themeLight.
  ///
  /// In uz, this message translates to:
  /// **'Yorugʻ'**
  String get themeLight;

  /// No description provided for @themeDark.
  ///
  /// In uz, this message translates to:
  /// **'Qorongʻi'**
  String get themeDark;

  /// No description provided for @aboutCentre.
  ///
  /// In uz, this message translates to:
  /// **'Markaz haqida'**
  String get aboutCentre;

  /// No description provided for @aboutEmpty.
  ///
  /// In uz, this message translates to:
  /// **'Markaz haqida maʼlumot hali qoʻshilmagan.'**
  String get aboutEmpty;

  /// No description provided for @deleteAccount.
  ///
  /// In uz, this message translates to:
  /// **'Hisobni oʻchirish'**
  String get deleteAccount;

  /// No description provided for @deleteWillBeDeleted.
  ///
  /// In uz, this message translates to:
  /// **'Oʻchiriladi'**
  String get deleteWillBeDeleted;

  /// No description provided for @deleteLogin.
  ///
  /// In uz, this message translates to:
  /// **'Login'**
  String get deleteLogin;

  /// No description provided for @deleteCoins.
  ///
  /// In uz, this message translates to:
  /// **'Tangalar'**
  String get deleteCoins;

  /// No description provided for @deleteResults.
  ///
  /// In uz, this message translates to:
  /// **'Natijalar'**
  String get deleteResults;

  /// No description provided for @deleteBookings.
  ///
  /// In uz, this message translates to:
  /// **'Ochiq darsga yozilishlar'**
  String get deleteBookings;

  /// No description provided for @deleteKept.
  ///
  /// In uz, this message translates to:
  /// **'Markazda saqlanadi'**
  String get deleteKept;

  /// No description provided for @deletePaymentRecords.
  ///
  /// In uz, this message translates to:
  /// **'Toʻlov yozuvlari'**
  String get deletePaymentRecords;

  /// No description provided for @deleteAction.
  ///
  /// In uz, this message translates to:
  /// **'Oʻchirish'**
  String get deleteAction;

  /// No description provided for @cancel.
  ///
  /// In uz, this message translates to:
  /// **'Bekor qilish'**
  String get cancel;

  /// No description provided for @deleteFailed.
  ///
  /// In uz, this message translates to:
  /// **'Hisobni oʻchirib boʻlmadi. Qayta urinib koʻring'**
  String get deleteFailed;

  /// No description provided for @you.
  ///
  /// In uz, this message translates to:
  /// **'{name} (siz)'**
  String you(String name);

  /// No description provided for @scopeGroup.
  ///
  /// In uz, this message translates to:
  /// **'Guruhim'**
  String get scopeGroup;

  /// No description provided for @scopeCentre.
  ///
  /// In uz, this message translates to:
  /// **'Markaz'**
  String get scopeCentre;

  /// No description provided for @periodMonth.
  ///
  /// In uz, this message translates to:
  /// **'Shu oy'**
  String get periodMonth;

  /// No description provided for @periodAll.
  ///
  /// In uz, this message translates to:
  /// **'Umumiy'**
  String get periodAll;

  /// No description provided for @ofPeople.
  ///
  /// In uz, this message translates to:
  /// **'{count} kishidan'**
  String ofPeople(int count);

  /// No description provided for @leaderboardEmpty.
  ///
  /// In uz, this message translates to:
  /// **'Hozircha reyting boʻsh'**
  String get leaderboardEmpty;

  /// No description provided for @noGroupYet.
  ///
  /// In uz, this message translates to:
  /// **'Siz hali guruhga qoʻshilmagansiz'**
  String get noGroupYet;

  /// No description provided for @weekdaysShort.
  ///
  /// In uz, this message translates to:
  /// **'Du,Se,Cho,Pa,Ju,Sh,Ya'**
  String get weekdaysShort;

  /// No description provided for @weekRange.
  ///
  /// In uz, this message translates to:
  /// **'{from}–{to}'**
  String weekRange(String from, String to);

  /// No description provided for @previousWeek.
  ///
  /// In uz, this message translates to:
  /// **'Oldingi hafta'**
  String get previousWeek;

  /// No description provided for @nextWeek.
  ///
  /// In uz, this message translates to:
  /// **'Keyingi hafta'**
  String get nextWeek;

  /// No description provided for @dayWithDate.
  ///
  /// In uz, this message translates to:
  /// **'{weekday}, {date}'**
  String dayWithDate(String weekday, String date);

  /// No description provided for @cancelled.
  ///
  /// In uz, this message translates to:
  /// **'Bekor qilindi'**
  String get cancelled;

  /// No description provided for @noLessonsThisWeek.
  ///
  /// In uz, this message translates to:
  /// **'Bu hafta dars yoʻq'**
  String get noLessonsThisWeek;

  /// No description provided for @timeRange.
  ///
  /// In uz, this message translates to:
  /// **'{from}–{to}'**
  String timeRange(String from, String to);

  /// No description provided for @nextPaymentBy.
  ///
  /// In uz, this message translates to:
  /// **'Keyingi toʻlov {date}gacha'**
  String nextPaymentBy(String date);

  /// No description provided for @balanceDue.
  ///
  /// In uz, this message translates to:
  /// **'Toʻlov kutilmoqda'**
  String get balanceDue;

  /// No description provided for @balanceDebt.
  ///
  /// In uz, this message translates to:
  /// **'Qarz'**
  String get balanceDebt;

  /// No description provided for @payByCard.
  ///
  /// In uz, this message translates to:
  /// **'Karta orqali toʻlash'**
  String get payByCard;

  /// No description provided for @myReceipts.
  ///
  /// In uz, this message translates to:
  /// **'Mening cheklarim'**
  String get myReceipts;

  /// No description provided for @comingSoon.
  ///
  /// In uz, this message translates to:
  /// **'Tez orada ochiladi'**
  String get comingSoon;

  /// No description provided for @paymentReceived.
  ///
  /// In uz, this message translates to:
  /// **'Toʻlov qabul qilindi'**
  String get paymentReceived;

  /// No description provided for @receiptLine.
  ///
  /// In uz, this message translates to:
  /// **'{date} · kvitansiya №{number}'**
  String receiptLine(String date, String number);

  /// No description provided for @monthFee.
  ///
  /// In uz, this message translates to:
  /// **'{month} toʻlovi'**
  String monthFee(String month);

  /// No description provided for @chargedLine.
  ///
  /// In uz, this message translates to:
  /// **'{date} · hisoblandi'**
  String chargedLine(String date);

  /// No description provided for @adjustment.
  ///
  /// In uz, this message translates to:
  /// **'Tuzatish'**
  String get adjustment;

  /// No description provided for @monthsNominative.
  ///
  /// In uz, this message translates to:
  /// **'Yanvar,Fevral,Mart,Aprel,May,Iyun,Iyul,Avgust,Sentabr,Oktabr,Noyabr,Dekabr'**
  String get monthsNominative;

  /// No description provided for @paymentsEmpty.
  ///
  /// In uz, this message translates to:
  /// **'Hozircha toʻlovlar yoʻq'**
  String get paymentsEmpty;

  /// No description provided for @payAtReception.
  ///
  /// In uz, this message translates to:
  /// **'Qabulxonada toʻlang'**
  String get payAtReception;

  /// No description provided for @payAtReceptionHint.
  ///
  /// In uz, this message translates to:
  /// **'Naqd yoki karta orqali'**
  String get payAtReceptionHint;

  /// No description provided for @coinHistoryEmpty.
  ///
  /// In uz, this message translates to:
  /// **'Hozircha tangalar yoʻq'**
  String get coinHistoryEmpty;

  /// No description provided for @sourceAttendance.
  ///
  /// In uz, this message translates to:
  /// **'Darsga keldi'**
  String get sourceAttendance;

  /// No description provided for @sourcePerfectMonth.
  ///
  /// In uz, this message translates to:
  /// **'Oylik aʼlo davomat'**
  String get sourcePerfectMonth;

  /// No description provided for @sourceOnTime.
  ///
  /// In uz, this message translates to:
  /// **'Toʻlov oʻz vaqtida'**
  String get sourceOnTime;

  /// No description provided for @sourceReferral.
  ///
  /// In uz, this message translates to:
  /// **'Doʻstingiz yozildi'**
  String get sourceReferral;

  /// No description provided for @sourceTeacherAward.
  ///
  /// In uz, this message translates to:
  /// **'Oʻqituvchidan'**
  String get sourceTeacherAward;

  /// No description provided for @sourceTeacherDeduction.
  ///
  /// In uz, this message translates to:
  /// **'Oʻqituvchi oldi'**
  String get sourceTeacherDeduction;

  /// No description provided for @sourceAdjustment.
  ///
  /// In uz, this message translates to:
  /// **'Markaz tuzatishi'**
  String get sourceAdjustment;

  /// No description provided for @sourceRewardHold.
  ///
  /// In uz, this message translates to:
  /// **'Buyurtma'**
  String get sourceRewardHold;

  /// No description provided for @sourceRewardReturn.
  ///
  /// In uz, this message translates to:
  /// **'Buyurtma qaytarildi'**
  String get sourceRewardReturn;

  /// No description provided for @sourceGameWin.
  ///
  /// In uz, this message translates to:
  /// **'Oʻyinda gʻalaba'**
  String get sourceGameWin;

  /// No description provided for @sourceExam.
  ///
  /// In uz, this message translates to:
  /// **'Sinov imtihoni'**
  String get sourceExam;

  /// No description provided for @voucherEmpty.
  ///
  /// In uz, this message translates to:
  /// **'Sizda hali vaucher yoʻq. Birinchi sinov imtihonidan keyin beriladi.'**
  String get voucherEmpty;

  /// No description provided for @photo.
  ///
  /// In uz, this message translates to:
  /// **'Rasm'**
  String get photo;

  /// No description provided for @changePhoto.
  ///
  /// In uz, this message translates to:
  /// **'Rasmni oʻzgartirish'**
  String get changePhoto;

  /// No description provided for @takePhoto.
  ///
  /// In uz, this message translates to:
  /// **'Kamera'**
  String get takePhoto;

  /// No description provided for @chooseFromGallery.
  ///
  /// In uz, this message translates to:
  /// **'Galereya'**
  String get chooseFromGallery;

  /// No description provided for @removePhoto.
  ///
  /// In uz, this message translates to:
  /// **'Rasmni olib tashlash'**
  String get removePhoto;

  /// No description provided for @cropTitle.
  ///
  /// In uz, this message translates to:
  /// **'Rasmni kesish'**
  String get cropTitle;

  /// No description provided for @cropHint.
  ///
  /// In uz, this message translates to:
  /// **'Rasmni suring va kattalashtiring'**
  String get cropHint;

  /// No description provided for @done.
  ///
  /// In uz, this message translates to:
  /// **'Tayyor'**
  String get done;

  /// No description provided for @photoFailed.
  ///
  /// In uz, this message translates to:
  /// **'Rasmni saqlab boʻlmadi. Qayta urinib koʻring'**
  String get photoFailed;

  /// No description provided for @photoSaved.
  ///
  /// In uz, this message translates to:
  /// **'Rasm saqlandi'**
  String get photoSaved;

  /// No description provided for @changePhone.
  ///
  /// In uz, this message translates to:
  /// **'Telefon raqamni oʻzgartirish'**
  String get changePhone;

  /// No description provided for @newPhone.
  ///
  /// In uz, this message translates to:
  /// **'Yangi telefon raqam'**
  String get newPhone;

  /// No description provided for @phoneChangeHint.
  ///
  /// In uz, this message translates to:
  /// **'Yangi raqamga SMS kod yuboramiz. Kod tasdiqlangach raqam oʻzgaradi.'**
  String get phoneChangeHint;

  /// No description provided for @phoneSame.
  ///
  /// In uz, this message translates to:
  /// **'Bu sizning hozirgi raqamingiz'**
  String get phoneSame;

  /// No description provided for @phoneChanged.
  ///
  /// In uz, this message translates to:
  /// **'Telefon raqam oʻzgartirildi'**
  String get phoneChanged;

  /// No description provided for @changePassword.
  ///
  /// In uz, this message translates to:
  /// **'Parolni oʻzgartirish'**
  String get changePassword;

  /// No description provided for @staffOnlyHint.
  ///
  /// In uz, this message translates to:
  /// **'Ism, tugʻilgan sana va ota-ona maʼlumotlarini faqat markaz xodimlari oʻzgartiradi.'**
  String get staffOnlyHint;

  /// No description provided for @birthDate.
  ///
  /// In uz, this message translates to:
  /// **'Tugʻilgan sana'**
  String get birthDate;

  /// No description provided for @parentName.
  ///
  /// In uz, this message translates to:
  /// **'Ota-ona'**
  String get parentName;

  /// No description provided for @parentPhone.
  ///
  /// In uz, this message translates to:
  /// **'Ota-ona telefoni'**
  String get parentPhone;

  /// No description provided for @fullDate.
  ///
  /// In uz, this message translates to:
  /// **'{day}, {year}'**
  String fullDate(String day, int year);

  /// No description provided for @weekInMonth.
  ///
  /// In uz, this message translates to:
  /// **'{from}–{to} {month}'**
  String weekInMonth(int from, int to, String month);

  /// No description provided for @myOrders.
  ///
  /// In uz, this message translates to:
  /// **'Mening buyurtmalarim'**
  String get myOrders;

  /// No description provided for @shopEmpty.
  ///
  /// In uz, this message translates to:
  /// **'Hozircha sovgʻalar yoʻq'**
  String get shopEmpty;

  /// No description provided for @soldOut.
  ///
  /// In uz, this message translates to:
  /// **'Tugagan'**
  String get soldOut;

  /// No description provided for @moreCoinsNeeded.
  ///
  /// In uz, this message translates to:
  /// **'Yana {coins} kerak'**
  String moreCoinsNeeded(String coins);

  /// No description provided for @shopJoinBanner.
  ///
  /// In uz, this message translates to:
  /// **'Tangalarni sarflash uchun markazga qoʻshiling'**
  String get shopJoinBanner;

  /// No description provided for @freeLesson.
  ///
  /// In uz, this message translates to:
  /// **'Bepul dars'**
  String get freeLesson;

  /// No description provided for @shopVariant.
  ///
  /// In uz, this message translates to:
  /// **'Variant'**
  String get shopVariant;

  /// No description provided for @chooseVariant.
  ///
  /// In uz, this message translates to:
  /// **'Variantni tanlang'**
  String get chooseVariant;

  /// No description provided for @unitsLeft.
  ///
  /// In uz, this message translates to:
  /// **'{count} dona qoldi'**
  String unitsLeft(int count);

  /// No description provided for @orderAction.
  ///
  /// In uz, this message translates to:
  /// **'Buyurtma berish'**
  String get orderAction;

  /// No description provided for @confirmOrderTitle.
  ///
  /// In uz, this message translates to:
  /// **'Buyurtmani tasdiqlang'**
  String get confirmOrderTitle;

  /// No description provided for @balanceNow.
  ///
  /// In uz, this message translates to:
  /// **'Hozirgi balans'**
  String get balanceNow;

  /// No description provided for @balanceAfter.
  ///
  /// In uz, this message translates to:
  /// **'Buyurtmadan keyin'**
  String get balanceAfter;

  /// No description provided for @pickupNote.
  ///
  /// In uz, this message translates to:
  /// **'Mahsulotni qabulxonadan olasiz'**
  String get pickupNote;

  /// No description provided for @orderPlaced.
  ///
  /// In uz, this message translates to:
  /// **'Buyurtma qabul qilindi'**
  String get orderPlaced;

  /// No description provided for @orderRequested.
  ///
  /// In uz, this message translates to:
  /// **'Soʻraldi'**
  String get orderRequested;

  /// No description provided for @orderReady.
  ///
  /// In uz, this message translates to:
  /// **'Olib ketishga tayyor'**
  String get orderReady;

  /// No description provided for @orderGiven.
  ///
  /// In uz, this message translates to:
  /// **'Topshirildi'**
  String get orderGiven;

  /// No description provided for @orderRejected.
  ///
  /// In uz, this message translates to:
  /// **'Rad etildi'**
  String get orderRejected;

  /// No description provided for @orderCancelled.
  ///
  /// In uz, this message translates to:
  /// **'Bekor qilindi'**
  String get orderCancelled;

  /// No description provided for @pickupNow.
  ///
  /// In uz, this message translates to:
  /// **'Qabulxonadan olib keting'**
  String get pickupNow;

  /// No description provided for @givenOn.
  ///
  /// In uz, this message translates to:
  /// **'Topshirildi, {date}'**
  String givenOn(String date);

  /// No description provided for @coinsReturned.
  ///
  /// In uz, this message translates to:
  /// **'Tangalar qaytarildi'**
  String get coinsReturned;

  /// No description provided for @orderCancelDone.
  ///
  /// In uz, this message translates to:
  /// **'Buyurtma bekor qilindi, tangalar qaytarildi'**
  String get orderCancelDone;

  /// No description provided for @cancelOrder.
  ///
  /// In uz, this message translates to:
  /// **'Buyurtmani bekor qilish'**
  String get cancelOrder;

  /// No description provided for @ordersEmpty.
  ///
  /// In uz, this message translates to:
  /// **'Hali buyurtma yoʻq'**
  String get ordersEmpty;

  /// No description provided for @shopErrorCoins.
  ///
  /// In uz, this message translates to:
  /// **'Tangalar yetarli emas'**
  String get shopErrorCoins;

  /// No description provided for @shopErrorSoldOut.
  ///
  /// In uz, this message translates to:
  /// **'Afsus, bu mahsulot tugadi'**
  String get shopErrorSoldOut;

  /// No description provided for @shopErrorNotOnOffer.
  ///
  /// In uz, this message translates to:
  /// **'Bu mahsulot endi sotuvda yoʻq'**
  String get shopErrorNotOnOffer;

  /// No description provided for @shopErrorTooLate.
  ///
  /// In uz, this message translates to:
  /// **'Bu buyurtmani endi bekor qilib boʻlmaydi'**
  String get shopErrorTooLate;

  /// No description provided for @productGone.
  ///
  /// In uz, this message translates to:
  /// **'Mahsulot topilmadi'**
  String get productGone;

  /// No description provided for @qrRotates.
  ///
  /// In uz, this message translates to:
  /// **'Kod har 30 soniyada yangilanadi'**
  String get qrRotates;

  /// No description provided for @qrShowAtReception.
  ///
  /// In uz, this message translates to:
  /// **'Buni qabulxonada koʻrsating'**
  String get qrShowAtReception;

  /// No description provided for @qrWorksOffline.
  ///
  /// In uz, this message translates to:
  /// **'Internet boʻlmasa ham ishlaydi'**
  String get qrWorksOffline;

  /// No description provided for @qrTodayArrived.
  ///
  /// In uz, this message translates to:
  /// **'Bugun: Keldi {time}'**
  String qrTodayArrived(String time);

  /// No description provided for @qrTodayLeft.
  ///
  /// In uz, this message translates to:
  /// **'Bugun: Ketdi {time}'**
  String qrTodayLeft(String time);

  /// No description provided for @qrTodayNone.
  ///
  /// In uz, this message translates to:
  /// **'Bugun hali kelmagan'**
  String get qrTodayNone;

  /// No description provided for @qrLockedTitle.
  ///
  /// In uz, this message translates to:
  /// **'QR kod markaz oʻquvchilari uchun'**
  String get qrLockedTitle;

  /// No description provided for @qrLockedHint.
  ///
  /// In uz, this message translates to:
  /// **'Markazga qoʻshilganingizda ishlaydi'**
  String get qrLockedHint;

  /// No description provided for @qrBookFreeLesson.
  ///
  /// In uz, this message translates to:
  /// **'Bepul ochiq darsga yozilish'**
  String get qrBookFreeLesson;

  /// No description provided for @qrNeedsInternet.
  ///
  /// In uz, this message translates to:
  /// **'Kodni birinchi marta olish uchun internetga ulaning'**
  String get qrNeedsInternet;

  /// No description provided for @qrCodeLabel.
  ///
  /// In uz, this message translates to:
  /// **'Markazga kirish uchun QR kod'**
  String get qrCodeLabel;

  /// No description provided for @gameZone.
  ///
  /// In uz, this message translates to:
  /// **'Oʻyin zonasi'**
  String get gameZone;

  /// No description provided for @gameDuel.
  ///
  /// In uz, this message translates to:
  /// **'1 ga 1'**
  String get gameDuel;

  /// No description provided for @gameExams.
  ///
  /// In uz, this message translates to:
  /// **'Sinov imtihonlari'**
  String get gameExams;

  /// No description provided for @gameExamsSoon.
  ///
  /// In uz, this message translates to:
  /// **'Sinov imtihonlari tez orada shu yerda boʻladi.'**
  String get gameExamsSoon;

  /// No description provided for @gamePitch.
  ///
  /// In uz, this message translates to:
  /// **'1 ga 1 bellashuv. Gʻolib {coins} oladi.'**
  String gamePitch(String coins);

  /// No description provided for @gamePitchNoCoins.
  ///
  /// In uz, this message translates to:
  /// **'1 ga 1 bellashuv: 10 ta savol, arqonni oʻz tomoningizga torting.'**
  String get gamePitchNoCoins;

  /// No description provided for @gameNoCoinsAppUser.
  ///
  /// In uz, this message translates to:
  /// **'Markazga qoʻshilmaguningizcha tanga berilmaydi'**
  String get gameNoCoinsAppUser;

  /// No description provided for @gamePlayNow.
  ///
  /// In uz, this message translates to:
  /// **'Hozir oʻynash'**
  String get gamePlayNow;

  /// No description provided for @gameChallenge.
  ///
  /// In uz, this message translates to:
  /// **'Sinfdoshni chaqirish'**
  String get gameChallenge;

  /// No description provided for @gameBankNotReady.
  ///
  /// In uz, this message translates to:
  /// **'Bu fanda savollar hali yetarli emas'**
  String get gameBankNotReady;

  /// No description provided for @gameRewardedWins.
  ///
  /// In uz, this message translates to:
  /// **'Bugungi mukofotli gʻalabalar: {done}/{of}'**
  String gameRewardedWins(int done, int of);

  /// No description provided for @gameRecent.
  ///
  /// In uz, this message translates to:
  /// **'Oxirgi oʻyinlar'**
  String get gameRecent;

  /// No description provided for @gameRecentEmpty.
  ///
  /// In uz, this message translates to:
  /// **'Hali oʻyin oʻynalmagan'**
  String get gameRecentEmpty;

  /// No description provided for @gameWin.
  ///
  /// In uz, this message translates to:
  /// **'Gʻalaba'**
  String get gameWin;

  /// No description provided for @gameLoss.
  ///
  /// In uz, this message translates to:
  /// **'Magʻlubiyat'**
  String get gameLoss;

  /// No description provided for @gameDraw.
  ///
  /// In uz, this message translates to:
  /// **'Durang'**
  String get gameDraw;

  /// No description provided for @gameComputer.
  ///
  /// In uz, this message translates to:
  /// **'Kompyuter'**
  String get gameComputer;

  /// No description provided for @gameSearching.
  ///
  /// In uz, this message translates to:
  /// **'Raqib qidirilmoqda…'**
  String get gameSearching;

  /// No description provided for @gameNobodyFree.
  ///
  /// In uz, this message translates to:
  /// **'Hozir boʻsh raqib yoʻq'**
  String get gameNobodyFree;

  /// No description provided for @gamePractice.
  ///
  /// In uz, this message translates to:
  /// **'Kompyuter bilan mashq'**
  String get gamePractice;

  /// No description provided for @gamePracticeNoCoins.
  ///
  /// In uz, this message translates to:
  /// **'Mashqda tanga berilmaydi'**
  String get gamePracticeNoCoins;

  /// No description provided for @gameWaitMore.
  ///
  /// In uz, this message translates to:
  /// **'Yana kutish'**
  String get gameWaitMore;

  /// No description provided for @gameInvite.
  ///
  /// In uz, this message translates to:
  /// **'Chaqirish'**
  String get gameInvite;

  /// No description provided for @gameInviteWaiting.
  ///
  /// In uz, this message translates to:
  /// **'Kutilmoqda…'**
  String get gameInviteWaiting;

  /// No description provided for @gameInviteDeclined.
  ///
  /// In uz, this message translates to:
  /// **'{name} chaqiruvni rad etdi'**
  String gameInviteDeclined(String name);

  /// No description provided for @gameInviteExpired.
  ///
  /// In uz, this message translates to:
  /// **'{name} javob bermadi'**
  String gameInviteExpired(String name);

  /// No description provided for @gameClassmatesEmpty.
  ///
  /// In uz, this message translates to:
  /// **'Bu guruhda ilovasi bor sinfdosh hali yoʻq'**
  String get gameClassmatesEmpty;

  /// No description provided for @gameSearchHint.
  ///
  /// In uz, this message translates to:
  /// **'Qidirish'**
  String get gameSearchHint;

  /// No description provided for @gameInvitedYou.
  ///
  /// In uz, this message translates to:
  /// **'{name} sizni oʻyinga chaqirdi'**
  String gameInvitedYou(String name);

  /// No description provided for @gameAccept.
  ///
  /// In uz, this message translates to:
  /// **'Qabul qilish'**
  String get gameAccept;

  /// No description provided for @gameDecline.
  ///
  /// In uz, this message translates to:
  /// **'Rad etish'**
  String get gameDecline;

  /// No description provided for @gameInviteGone.
  ///
  /// In uz, this message translates to:
  /// **'Chaqiruv muddati tugadi'**
  String get gameInviteGone;

  /// No description provided for @gameInMatch.
  ///
  /// In uz, this message translates to:
  /// **'Siz hozir oʻyindasiz'**
  String get gameInMatch;

  /// No description provided for @gameGetReady.
  ///
  /// In uz, this message translates to:
  /// **'Tayyorlaning'**
  String get gameGetReady;

  /// No description provided for @gameQuestionOf.
  ///
  /// In uz, this message translates to:
  /// **'{n}/{of}'**
  String gameQuestionOf(int n, int of);

  /// No description provided for @gameCorrect.
  ///
  /// In uz, this message translates to:
  /// **'Toʻgʻri!'**
  String get gameCorrect;

  /// No description provided for @gameCorrectFaster.
  ///
  /// In uz, this message translates to:
  /// **'Toʻgʻri! Siz tezroq edingiz'**
  String get gameCorrectFaster;

  /// No description provided for @gameCorrectSlower.
  ///
  /// In uz, this message translates to:
  /// **'Toʻgʻri, lekin raqib tezroq edi'**
  String get gameCorrectSlower;

  /// No description provided for @gameWrong.
  ///
  /// In uz, this message translates to:
  /// **'Notoʻgʻri'**
  String get gameWrong;

  /// No description provided for @gameTimeUp.
  ///
  /// In uz, this message translates to:
  /// **'Vaqt tugadi'**
  String get gameTimeUp;

  /// No description provided for @gameOpponentAnswered.
  ///
  /// In uz, this message translates to:
  /// **'Raqib javob berdi'**
  String get gameOpponentAnswered;

  /// No description provided for @gameWaitingOpponent.
  ///
  /// In uz, this message translates to:
  /// **'Raqib javobi kutilmoqda…'**
  String get gameWaitingOpponent;

  /// No description provided for @gameReconnecting.
  ///
  /// In uz, this message translates to:
  /// **'Aloqa uzildi. Qayta ulanmoqda…'**
  String get gameReconnecting;

  /// No description provided for @gameMatchGone.
  ///
  /// In uz, this message translates to:
  /// **'Bu oʻyin topilmadi'**
  String get gameMatchGone;

  /// No description provided for @gameCancelled.
  ///
  /// In uz, this message translates to:
  /// **'Oʻyin bekor qilindi'**
  String get gameCancelled;

  /// No description provided for @gameBackToLobby.
  ///
  /// In uz, this message translates to:
  /// **'Oʻyin zonasiga qaytish'**
  String get gameBackToLobby;

  /// No description provided for @gameWinTitle.
  ///
  /// In uz, this message translates to:
  /// **'Gʻalaba!'**
  String get gameWinTitle;

  /// No description provided for @gameLossTitle.
  ///
  /// In uz, this message translates to:
  /// **'Magʻlubiyat'**
  String get gameLossTitle;

  /// No description provided for @gameDrawTitle.
  ///
  /// In uz, this message translates to:
  /// **'Durang'**
  String get gameDrawTitle;

  /// No description provided for @gameForfeitWin.
  ///
  /// In uz, this message translates to:
  /// **'Raqib oʻyinni tark etdi'**
  String get gameForfeitWin;

  /// No description provided for @gameForfeitLoss.
  ///
  /// In uz, this message translates to:
  /// **'Aloqa uzilgani uchun oʻyin tugadi'**
  String get gameForfeitLoss;

  /// No description provided for @gameCorrectAnswers.
  ///
  /// In uz, this message translates to:
  /// **'Toʻgʻri javoblar: {you} – {opponent}'**
  String gameCorrectAnswers(int you, int opponent);

  /// No description provided for @gameLimitReached.
  ///
  /// In uz, this message translates to:
  /// **'Bugungi limit tugadi — tanga berilmadi'**
  String get gameLimitReached;

  /// No description provided for @gameOpponentNotStudent.
  ///
  /// In uz, this message translates to:
  /// **'Raqib markaz oʻquvchisi emas — tanga berilmadi'**
  String get gameOpponentNotStudent;

  /// No description provided for @gamePlayAgain.
  ///
  /// In uz, this message translates to:
  /// **'Yana oʻynash'**
  String get gamePlayAgain;

  /// No description provided for @gameSeeQuestions.
  ///
  /// In uz, this message translates to:
  /// **'Savollarni koʻrish'**
  String get gameSeeQuestions;

  /// No description provided for @gameQuestions.
  ///
  /// In uz, this message translates to:
  /// **'Savollar'**
  String get gameQuestions;

  /// No description provided for @gameRightAnswer.
  ///
  /// In uz, this message translates to:
  /// **'Toʻgʻri javob:'**
  String get gameRightAnswer;

  /// No description provided for @gameYourAnswer.
  ///
  /// In uz, this message translates to:
  /// **'Sizning javobingiz: {answer}'**
  String gameYourAnswer(String answer);

  /// No description provided for @gameNoAnswer.
  ///
  /// In uz, this message translates to:
  /// **'Javob berilmadi'**
  String get gameNoAnswer;

  /// No description provided for @gameYou.
  ///
  /// In uz, this message translates to:
  /// **'Siz'**
  String get gameYou;

  /// No description provided for @gameRopeLabel.
  ///
  /// In uz, this message translates to:
  /// **'Arqon: {position}'**
  String gameRopeLabel(int position);

  /// No description provided for @gameSecondsLeft.
  ///
  /// In uz, this message translates to:
  /// **'{seconds} soniya qoldi'**
  String gameSecondsLeft(int seconds);
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
