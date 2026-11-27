import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:student/app.dart';
import 'package:student/core/checkin_state.dart';
import 'package:student/core/exam_state.dart';
import 'package:student/core/game_state.dart';
import 'package:student/core/localization.dart';
import 'package:student/core/home_state.dart';
import 'package:student/core/more_state.dart';
import 'package:student/core/offer_state.dart';
import 'package:student/core/receipt_state.dart';
import 'package:student/core/shop_state.dart';
import 'package:student/core/state.dart';
import 'package:student/data/exams.dart';
import 'package:student/data/models.dart';
import 'package:student/data/receipts.dart';
import 'package:student/l10n/app_localizations.dart';
import 'package:student/ui/theme.dart';

import 'fake_exams.dart';
import 'fake_game.dart';
import 'fake_offers.dart';
import 'fake_receipts.dart';
import 'fakes.dart';

/// The whole app on fakes: what a test needs to drive it and to look at what it did.
class TestApp {
  TestApp({
    FakeAuthRepository? auth,
    FakePush? push,
    FakeHomeRepository? home,
    FakeNotificationsRepository? notifications,
    this.deviceLanguage = 'uz',
    this.preferences = const {},
  }) : auth = auth ?? FakeAuthRepository(),
       push = push ?? FakePush(),
       home = home ?? FakeHomeRepository(),
       notifications = notifications ?? FakeNotificationsRepository(),
       tokens = FakeDeviceTokens();

  final FakeHomeRepository home;
  final FakeNotificationsRepository notifications;
  final more = FakeMoreRepository();
  final shop = FakeShopRepository();
  final checkin = FakeCheckinRepository();
  final secrets = FakeQrSecretStore();
  final light = FakeScreenLight();
  final feedback = FakeGameFeedback();

  /// The game server, with the signed-in person and three classmates in it.
  late final game = FakeGameServer(now: () => clock?.call() ?? now)
    ..add(
      FakePlayer(
        auth.profile?.id ?? 'nobody',
        'Aziza K.',
        student: auth.profile?.role == AccountRole.student,
        groupId: auth.profile?.role == AccountRole.student ? 'g-1' : null,
      ),
    )
    ..add(FakePlayer('p-jasur', 'Jasur T.'))
    ..add(FakePlayer('p-madina', 'Madina R.'))
    ..add(FakePlayer('p-otabek', 'Otabek S.'))
    ..add(FakePlayer('p-guest', 'Sardor M.', student: false, groupId: null));
  late final gameRepository = FakeGameRepository(game, auth.profile?.id ?? 'nobody');

  /// The exam server: a TOPIK I exam as in the designs and a TOPIK II one,
  /// with the signed-in person a student or an App user as their profile says.
  late final exams = FakeExamServer(now: () => clock?.call() ?? now)
    ..exams.addAll([
      sampleExam(),
      sampleExam(id: 'exam-ii-1', title: 'TOPIK II — Mock 1', level: ExamLevel.topik2, listening: 50, reading: 50, thresholds: const {}),
    ])
    ..students.addAll([if (auth.profile?.role == AccountRole.student) auth.profile!.id]);
  late final examRepository = FakeExamRepository(exams, auth.profile?.id ?? 'nobody');
  final audio = FakeExamAudio();

  /// The voucher and the open lessons. An App user's first finished exam
  /// brings the voucher, as on the server.
  late final offers = FakeOfferRepository(now: () => clock?.call() ?? now);

  /// Receipts: an approved one is a payment, so the balance Home shows goes up by its amount.
  late final receipts = FakeReceiptRepository(now: () => clock?.call() ?? now)
    ..onApproved = (amount) {
      final balance = Map<String, dynamic>.from(home.home['balance'] as Map);
      final next = (balance['amount'] as num).toInt() + amount;
      home.home = {
        ...home.home,
        'balance': {...balance, 'amount': next, if (next >= 0) 'oldest_unpaid_month': null},
      };
    };

  /// The file the receipt picker hands back; null as if the person backed out.
  PickedReceipt? receiptFile;

  /// Where the last receipt file was asked from.
  ReceiptSource? receiptSource;

  /// A clock that moves, for screens that count seconds: tests pass the test binding's.
  DateTime Function()? clock;

  /// The photo the picker hands back; null as if the person backed out.
  Uint8List? photo;

  /// The time the app believes it is.
  DateTime now = testNow;

  final FakeAuthRepository auth;
  final FakePush push;
  final FakeDeviceTokens tokens;
  final String deviceLanguage;

  /// What the phone already has saved: 'language', 'theme'.
  final Map<String, Object> preferences;
  late SharedPreferences saved;

  Future<Widget> build() async {
    // A saved or removed photo shows up in the profile, as it does on the server.
    more.onAvatar = (path) {
      final current = auth.profile;
      if (current != null) {
        auth.profile = Profile(
          id: current.id,
          fullName: current.fullName,
          role: current.role,
          language: current.language,
          theme: current.theme,
          koreanLevel: current.koreanLevel,
          phone: current.phone,
          avatarPath: path,
        );
      }
    };
    // The shop spends and returns the coins Home shows, and only a student may order.
    shop
      ..balance = (() => (home.home['coins'] as num).toInt())
      ..setBalance = ((coins) => home.home = {...home.home, 'coins': coins})
      ..allowed = auth.profile?.role == AccountRole.student
      ..clock = () => now;
    exams.onFinished = (profileId) {
      if (auth.profile?.role == AccountRole.appUser && profileId == auth.profile?.id) offers.voucherValue ??= sampleVoucher();
    };
    SharedPreferences.setMockInitialValues(preferences);
    saved = await SharedPreferences.getInstance();
    return ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(auth),
        deviceTokenRepositoryProvider.overrideWithValue(tokens),
        homeRepositoryProvider.overrideWithValue(home),
        notificationsRepositoryProvider.overrideWithValue(notifications),
        clockProvider.overrideWithValue(() => clock?.call() ?? now),
        moreRepositoryProvider.overrideWithValue(more),
        shopRepositoryProvider.overrideWithValue(shop),
        checkinRepositoryProvider.overrideWithValue(checkin),
        gameRepositoryProvider.overrideWithValue(gameRepository),
        gameFeedbackProvider.overrideWithValue(feedback),
        examRepositoryProvider.overrideWithValue(examRepository),
        examAudioProvider.overrideWithValue(() => audio),
        offerRepositoryProvider.overrideWithValue(offers),
        receiptRepositoryProvider.overrideWithValue(receipts),
        receiptPickerProvider.overrideWithValue((source) async {
          receiptSource = source;
          return receiptFile;
        }),
        qrSecretStoreProvider.overrideWithValue(secrets),
        screenLightProvider.overrideWithValue(light),
        photoPickerProvider.overrideWithValue((_) async => photo),
        sharedPreferencesProvider.overrideWithValue(saved),
        pushServiceProvider.overrideWithValue(push),
        appVersionProvider.overrideWithValue('1.0.0'),
        deviceLanguageProvider.overrideWithValue(deviceLanguage),
      ],
      child: const StudentApp(),
    );
  }

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(await build());
    // Images decode off the test clock: let the logo finish before looking.
    await tester.runAsync(() => precacheImage(const AssetImage('assets/images/logo.png'), tester.element(find.byType(StudentApp))));
    await tester.pumpAndSettle();
  }
}

/// A phone screen of this many logical points.
void useScreen(WidgetTester tester, Size size, {double textScale = 1}) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);
}

/// One widget with the app's theme and language, for tests of shared widgets.
Widget themed(Widget child, {Brightness brightness = Brightness.light, String language = 'uz'}) => MaterialApp(
  debugShowCheckedModeBanner: false,
  theme: appTheme(brightness),
  locale: Locale(language),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: Scaffold(body: child),
);

AppLocalizations l10n(String language) => lookupAppLocalizations(Locale(language));
