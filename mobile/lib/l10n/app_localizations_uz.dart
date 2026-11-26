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
  String get gameStudentSoon => '1 ga 1 oʻyin va sinov imtihonlari. Gʻalaba uchun tanga olasiz.';

  @override
  String get gameAppUserSoon => '1 ga 1 oʻyin va sinov imtihonlari. Tangalar markazga qoʻshilganingizdan keyin beriladi.';

  @override
  String get notifications => 'Bildirishnomalar';

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

  @override
  String greeting(String name) {
    return 'Salom, $name';
  }

  @override
  String unreadCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ta oʻqilmagan bildirishnoma', zero: 'Oʻqilmagan bildirishnoma yoʻq');
    return '$_temp0';
  }

  @override
  String get chooseGroup => 'Guruhni tanlang';

  @override
  String get offlineBanner => 'Internet aloqasi yoʻq. Maʼlumotlar yangilanmagan boʻlishi mumkin.';

  @override
  String get loadFailedBanner => 'Maʼlumotlarni yangilab boʻlmadi. Pastga tortib qayta urinib koʻring.';

  @override
  String get retry => 'Qayta urinish';

  @override
  String get nextLesson => 'Keyingi dars';

  @override
  String get exam => 'Imtihon';

  @override
  String get nothingScheduled => 'Yaqin darslar yoʻq';

  @override
  String get today => 'Bugun';

  @override
  String get tomorrow => 'Ertaga';

  @override
  String get yesterday => 'Kecha';

  @override
  String get earlier => 'Oldinroq';

  @override
  String dayAtTime(String day, String time) {
    return '$day, $time';
  }

  @override
  String roomNumber(String room) {
    return '$room-xona';
  }

  @override
  String get weekdays => 'Dushanba,Seshanba,Chorshanba,Payshanba,Juma,Shanba,Yakshanba';

  @override
  String get months => 'yanvar,fevral,mart,aprel,may,iyun,iyul,avgust,sentabr,oktabr,noyabr,dekabr';

  @override
  String dayMonth(int day, String month) {
    return '$day-$month';
  }

  @override
  String inDays(int count) {
    return '$count kundan soʻng';
  }

  @override
  String inHoursMinutes(int hours, int minutes) {
    return '$hours soat $minutes daqiqadan soʻng';
  }

  @override
  String inHours(int hours) {
    return '$hours soatdan soʻng';
  }

  @override
  String inMinutes(int minutes) {
    return '$minutes daqiqadan soʻng';
  }

  @override
  String get startingNow => 'Hozir boshlanadi';

  @override
  String get rankInGroup => 'Guruhdagi oʻrin';

  @override
  String rankPlace(int rank) {
    return '$rank-oʻrin';
  }

  @override
  String rankOf(int count) {
    return '$count kishidan, shu oy';
  }

  @override
  String get rankNone => 'Bu oy hali reyting yoʻq';

  @override
  String get coins => 'Tangalar';

  @override
  String coinsThisWeek(String count) {
    return '+$count shu hafta';
  }

  @override
  String get balance => 'Balans';

  @override
  String get balancePaid => 'Toʻlangan';

  @override
  String nextPaymentOn(String date) {
    return 'keyingi toʻlov $date';
  }

  @override
  String balanceDueBy(String date) {
    return '$date gacha toʻlang';
  }

  @override
  String balanceDebtSince(String date) {
    return 'qarz, muddati $date edi';
  }

  @override
  String get attendance => 'Davomat';

  @override
  String get thisMonth => 'shu oy';

  @override
  String get noLessonsYet => 'Bu oy hali dars boʻlmagan';

  @override
  String levelPill(String level) {
    return '$level darajasi';
  }

  @override
  String get mockExamTitle => 'Sinov imtihoni';

  @override
  String get mockExamSoon => 'TOPIK uslubidagi mashq imtihonlari tez orada shu yerda boʻladi.';

  @override
  String get lockedCoins => 'Qulflangan tangalar';

  @override
  String get lockedCoinsHint => 'Markazga qoʻshilganingizda ochiladi';

  @override
  String get openLessonTitle => 'Bepul ochiq dars';

  @override
  String get openLessonSoon => 'Ochiq darslarga yozilish tez orada shu yerda ochiladi.';

  @override
  String get bookOpenLesson => 'Bepul ochiq darsga yozilish';

  @override
  String get voucherTitle => 'Sizga sovgʻa!';

  @override
  String voucherPercent(int percent) {
    return 'Birinchi oyga $percent% chegirma';
  }

  @override
  String voucherFixed(String amount) {
    return 'Birinchi oyga $amount chegirma';
  }

  @override
  String get voucherTrialWeek => 'Bir haftalik bepul sinov darslari';

  @override
  String validUntil(String date) {
    return '${date}gacha';
  }

  @override
  String get markAllRead => 'Hammasini oʻqildi deb belgilash';

  @override
  String get notificationsEmpty => 'Hozircha bildirishnomalar yoʻq';

  @override
  String get unread => 'Oʻqilmagan';

  @override
  String get editProfile => 'Profilni tahrirlash';

  @override
  String get leaderboard => 'Reyting';

  @override
  String get schedule => 'Dars jadvali';

  @override
  String get payments => 'Toʻlovlar';

  @override
  String get coinHistory => 'Tanga tarixi';

  @override
  String get myVoucher => 'Mening vaucherim';

  @override
  String get openLessons => 'Ochiq darslarim';

  @override
  String get language => 'Til';

  @override
  String get appearance => 'Koʻrinish';

  @override
  String get themeSystem => 'Tizim';

  @override
  String get themeLight => 'Yorugʻ';

  @override
  String get themeDark => 'Qorongʻi';

  @override
  String get aboutCentre => 'Markaz haqida';

  @override
  String get aboutEmpty => 'Markaz haqida maʼlumot hali qoʻshilmagan.';

  @override
  String get deleteAccount => 'Hisobni oʻchirish';

  @override
  String get deleteWillBeDeleted => 'Oʻchiriladi';

  @override
  String get deleteLogin => 'Login';

  @override
  String get deleteCoins => 'Tangalar';

  @override
  String get deleteResults => 'Natijalar';

  @override
  String get deleteBookings => 'Ochiq darsga yozilishlar';

  @override
  String get deleteKept => 'Markazda saqlanadi';

  @override
  String get deletePaymentRecords => 'Toʻlov yozuvlari';

  @override
  String get deleteAction => 'Oʻchirish';

  @override
  String get cancel => 'Bekor qilish';

  @override
  String get deleteFailed => 'Hisobni oʻchirib boʻlmadi. Qayta urinib koʻring';

  @override
  String you(String name) {
    return '$name (siz)';
  }

  @override
  String get scopeGroup => 'Guruhim';

  @override
  String get scopeCentre => 'Markaz';

  @override
  String get periodMonth => 'Shu oy';

  @override
  String get periodAll => 'Umumiy';

  @override
  String ofPeople(int count) {
    return '$count kishidan';
  }

  @override
  String get leaderboardEmpty => 'Hozircha reyting boʻsh';

  @override
  String get noGroupYet => 'Siz hali guruhga qoʻshilmagansiz';

  @override
  String get weekdaysShort => 'Du,Se,Cho,Pa,Ju,Sh,Ya';

  @override
  String weekRange(String from, String to) {
    return '$from–$to';
  }

  @override
  String get previousWeek => 'Oldingi hafta';

  @override
  String get nextWeek => 'Keyingi hafta';

  @override
  String dayWithDate(String weekday, String date) {
    return '$weekday, $date';
  }

  @override
  String get cancelled => 'Bekor qilindi';

  @override
  String get noLessonsThisWeek => 'Bu hafta dars yoʻq';

  @override
  String timeRange(String from, String to) {
    return '$from–$to';
  }

  @override
  String nextPaymentBy(String date) {
    return 'Keyingi toʻlov ${date}gacha';
  }

  @override
  String get balanceDue => 'Toʻlov kutilmoqda';

  @override
  String get balanceDebt => 'Qarz';

  @override
  String get payByCard => 'Karta orqali toʻlash';

  @override
  String get myReceipts => 'Mening cheklarim';

  @override
  String get comingSoon => 'Tez orada ochiladi';

  @override
  String get paymentReceived => 'Toʻlov qabul qilindi';

  @override
  String receiptLine(String date, String number) {
    return '$date · kvitansiya №$number';
  }

  @override
  String monthFee(String month) {
    return '$month toʻlovi';
  }

  @override
  String chargedLine(String date) {
    return '$date · hisoblandi';
  }

  @override
  String get adjustment => 'Tuzatish';

  @override
  String get monthsNominative => 'Yanvar,Fevral,Mart,Aprel,May,Iyun,Iyul,Avgust,Sentabr,Oktabr,Noyabr,Dekabr';

  @override
  String get paymentsEmpty => 'Hozircha toʻlovlar yoʻq';

  @override
  String get payAtReception => 'Qabulxonada toʻlang';

  @override
  String get payAtReceptionHint => 'Naqd yoki karta orqali';

  @override
  String get coinHistoryEmpty => 'Hozircha tangalar yoʻq';

  @override
  String get sourceAttendance => 'Darsga keldi';

  @override
  String get sourcePerfectMonth => 'Oylik aʼlo davomat';

  @override
  String get sourceOnTime => 'Toʻlov oʻz vaqtida';

  @override
  String get sourceReferral => 'Doʻstingiz yozildi';

  @override
  String get sourceTeacherAward => 'Oʻqituvchidan';

  @override
  String get sourceTeacherDeduction => 'Oʻqituvchi oldi';

  @override
  String get sourceAdjustment => 'Markaz tuzatishi';

  @override
  String get sourceRewardHold => 'Buyurtma';

  @override
  String get sourceRewardReturn => 'Buyurtma qaytarildi';

  @override
  String get sourceGameWin => 'Oʻyinda gʻalaba';

  @override
  String get sourceExam => 'Sinov imtihoni';

  @override
  String get voucherEmpty => 'Sizda hali vaucher yoʻq. Birinchi sinov imtihonidan keyin beriladi.';

  @override
  String get photo => 'Rasm';

  @override
  String get changePhoto => 'Rasmni oʻzgartirish';

  @override
  String get takePhoto => 'Kamera';

  @override
  String get chooseFromGallery => 'Galereya';

  @override
  String get removePhoto => 'Rasmni olib tashlash';

  @override
  String get cropTitle => 'Rasmni kesish';

  @override
  String get cropHint => 'Rasmni suring va kattalashtiring';

  @override
  String get done => 'Tayyor';

  @override
  String get photoFailed => 'Rasmni saqlab boʻlmadi. Qayta urinib koʻring';

  @override
  String get photoSaved => 'Rasm saqlandi';

  @override
  String get changePhone => 'Telefon raqamni oʻzgartirish';

  @override
  String get newPhone => 'Yangi telefon raqam';

  @override
  String get phoneChangeHint => 'Yangi raqamga SMS kod yuboramiz. Kod tasdiqlangach raqam oʻzgaradi.';

  @override
  String get phoneSame => 'Bu sizning hozirgi raqamingiz';

  @override
  String get phoneChanged => 'Telefon raqam oʻzgartirildi';

  @override
  String get changePassword => 'Parolni oʻzgartirish';

  @override
  String get staffOnlyHint => 'Ism, tugʻilgan sana va ota-ona maʼlumotlarini faqat markaz xodimlari oʻzgartiradi.';

  @override
  String get birthDate => 'Tugʻilgan sana';

  @override
  String get parentName => 'Ota-ona';

  @override
  String get parentPhone => 'Ota-ona telefoni';

  @override
  String fullDate(String day, int year) {
    return '$day, $year';
  }

  @override
  String weekInMonth(int from, int to, String month) {
    return '$from–$to $month';
  }

  @override
  String get myOrders => 'Mening buyurtmalarim';

  @override
  String get shopEmpty => 'Hozircha sovgʻalar yoʻq';

  @override
  String get soldOut => 'Tugagan';

  @override
  String moreCoinsNeeded(String coins) {
    return 'Yana $coins kerak';
  }

  @override
  String get shopJoinBanner => 'Tangalarni sarflash uchun markazga qoʻshiling';

  @override
  String get freeLesson => 'Bepul dars';

  @override
  String get shopVariant => 'Variant';

  @override
  String get chooseVariant => 'Variantni tanlang';

  @override
  String unitsLeft(int count) {
    return '$count dona qoldi';
  }

  @override
  String get orderAction => 'Buyurtma berish';

  @override
  String get confirmOrderTitle => 'Buyurtmani tasdiqlang';

  @override
  String get balanceNow => 'Hozirgi balans';

  @override
  String get balanceAfter => 'Buyurtmadan keyin';

  @override
  String get pickupNote => 'Mahsulotni qabulxonadan olasiz';

  @override
  String get orderPlaced => 'Buyurtma qabul qilindi';

  @override
  String get orderRequested => 'Soʻraldi';

  @override
  String get orderReady => 'Olib ketishga tayyor';

  @override
  String get orderGiven => 'Topshirildi';

  @override
  String get orderRejected => 'Rad etildi';

  @override
  String get orderCancelled => 'Bekor qilindi';

  @override
  String get pickupNow => 'Qabulxonadan olib keting';

  @override
  String givenOn(String date) {
    return 'Topshirildi, $date';
  }

  @override
  String get coinsReturned => 'Tangalar qaytarildi';

  @override
  String get orderCancelDone => 'Buyurtma bekor qilindi, tangalar qaytarildi';

  @override
  String get cancelOrder => 'Buyurtmani bekor qilish';

  @override
  String get ordersEmpty => 'Hali buyurtma yoʻq';

  @override
  String get shopErrorCoins => 'Tangalar yetarli emas';

  @override
  String get shopErrorSoldOut => 'Afsus, bu mahsulot tugadi';

  @override
  String get shopErrorNotOnOffer => 'Bu mahsulot endi sotuvda yoʻq';

  @override
  String get shopErrorTooLate => 'Bu buyurtmani endi bekor qilib boʻlmaydi';

  @override
  String get productGone => 'Mahsulot topilmadi';

  @override
  String get qrRotates => 'Kod har 30 soniyada yangilanadi';

  @override
  String get qrShowAtReception => 'Buni qabulxonada koʻrsating';

  @override
  String get qrWorksOffline => 'Internet boʻlmasa ham ishlaydi';

  @override
  String qrTodayArrived(String time) {
    return 'Bugun: Keldi $time';
  }

  @override
  String qrTodayLeft(String time) {
    return 'Bugun: Ketdi $time';
  }

  @override
  String get qrTodayNone => 'Bugun hali kelmagan';

  @override
  String get qrLockedTitle => 'QR kod markaz oʻquvchilari uchun';

  @override
  String get qrLockedHint => 'Markazga qoʻshilganingizda ishlaydi';

  @override
  String get qrBookFreeLesson => 'Bepul ochiq darsga yozilish';

  @override
  String get qrNeedsInternet => 'Kodni birinchi marta olish uchun internetga ulaning';

  @override
  String get qrCodeLabel => 'Markazga kirish uchun QR kod';
}
