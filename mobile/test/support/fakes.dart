import 'dart:async';
import 'dart:typed_data';

import 'package:student/data/auth_failure.dart';
import 'package:student/data/auth_repository.dart';
import 'package:student/data/checkin.dart';
import 'package:student/data/device_tokens.dart';
import 'package:student/data/home.dart';
import 'package:student/data/models.dart';
import 'package:student/data/more.dart';
import 'package:student/data/notifications.dart';
import 'package:student/data/shop.dart';
import 'package:student/push/push_service.dart';

/// Supabase Auth, as far as the app can tell: accounts by phone, one code,
/// and what was asked of it.
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.profile, bool signedIn = false, this.groups = const [], this.policy})
    // ignore: prefer_initializing_formals
    : _signedIn = signedIn;

  /// The profile the signed-in person has.
  Profile? profile;
  List<String> groups;
  String? policy;

  /// The code that is right.
  String code = '482193';

  /// What the next call fails with, once.
  AuthFailure? failNext;

  /// Phones that already have an account.
  final registered = <String>{};
  final calls = <String>[];
  final _changes = StreamController<bool>.broadcast();
  bool _signedIn;
  String? savedLanguage;
  String? savedTheme;
  String? newPassword;
  Map<String, Object?>? signUpData;

  void _maybeFail() {
    final failure = failNext;
    if (failure != null) {
      failNext = null;
      throw AuthFailureException(failure);
    }
  }

  void _set(bool signedIn) {
    _signedIn = signedIn;
    _changes.add(signedIn);
  }

  @override
  bool get isSignedIn => _signedIn;

  @override
  Stream<bool> get signedInChanges => _changes.stream;

  @override
  Future<void> signUp({required String fullName, required String phone, required String password, required KoreanLevel level, required String language}) async {
    calls.add('signUp');
    _maybeFail();
    if (registered.contains(phone)) throw const AuthFailureException(AuthFailure.alreadyRegistered);
    signUpData = {'fullName': fullName, 'phone': phone, 'password': password, 'level': level, 'language': language};
  }

  @override
  Future<void> verifyCode({required String phone, required String code}) async {
    calls.add('verifyCode:$code');
    _maybeFail();
    if (code != this.code) throw const AuthFailureException(AuthFailure.wrongCode);
    _set(true);
  }

  @override
  Future<void> resendSignUpCode(String phone) async {
    calls.add('resend');
    _maybeFail();
  }

  @override
  Future<void> signIn({required String phone, required String password}) async {
    calls.add('signIn');
    _maybeFail();
    if (deleted) throw const AuthFailureException(AuthFailure.invalidCredentials);
    _set(true);
  }

  @override
  Future<void> sendResetCode(String phone) async {
    calls.add('sendResetCode');
    _maybeFail();
  }

  @override
  Future<void> setPassword(String password) async {
    calls.add('setPassword');
    _maybeFail();
    newPassword = password;
  }

  @override
  Future<void> signOut() async {
    calls.add('signOut');
    _set(false);
  }

  /// A deleted account is gone for good: nobody can sign in to it again.
  bool deleted = false;
  String? pendingPhone;

  @override
  Future<void> startPhoneChange(String phone) async {
    calls.add('startPhoneChange:$phone');
    _maybeFail();
    if (registered.contains(phone)) throw const AuthFailureException(AuthFailure.alreadyRegistered);
    pendingPhone = phone;
  }

  @override
  Future<void> confirmPhoneChange({required String phone, required String code}) async {
    calls.add('confirmPhoneChange:$code');
    _maybeFail();
    if (code != this.code || phone != pendingPhone) throw const AuthFailureException(AuthFailure.wrongCode);
    final current = profile!;
    profile = Profile(
      id: current.id,
      fullName: current.fullName,
      role: current.role,
      language: current.language,
      theme: current.theme,
      koreanLevel: current.koreanLevel,
      phone: phone,
      avatarPath: current.avatarPath,
    );
  }

  @override
  Future<void> deleteAccount() async {
    calls.add('deleteAccount');
    _maybeFail();
    deleted = true;
    profile = null;
    _set(false);
  }

  @override
  Future<Profile?> loadProfile() async => _signedIn ? profile : null;

  @override
  Future<void> saveLanguage(String language) async => savedLanguage = language;

  @override
  Future<void> saveTheme(String theme) async => savedTheme = theme;

  @override
  Future<List<String>> groupNames() async => groups;

  @override
  Future<String?> privacyPolicy(String language) async => policy;
}

class FakeDeviceTokens implements DeviceTokenRepository {
  final saved = <String, ({String platform, String? appVersion})>{};
  final removed = <String>[];

  @override
  Future<void> save({required String token, required String platform, String? appVersion}) async {
    saved[token] = (platform: platform, appVersion: appVersion);
  }

  @override
  Future<void> remove(String token) async {
    saved.remove(token);
    removed.add(token);
  }
}

class FakePush implements PushService {
  FakePush({this.deviceToken = 'device-token-1', this.launch});

  String? deviceToken;
  Map<String, dynamic>? launch;
  final taps = StreamController<Map<String, dynamic>>.broadcast();
  final refreshed = StreamController<String>.broadcast();

  @override
  String get platform => 'android';

  @override
  Future<String?> token() async => deviceToken;

  @override
  Stream<String> get tokenChanges => refreshed.stream;

  @override
  Stream<Map<String, dynamic>> get opened => taps.stream;

  @override
  Future<Map<String, dynamic>?> launchedFrom() async => launch;
}

const studentProfile = Profile(
  id: 'p-student',
  fullName: 'Aziza Karimova',
  role: AccountRole.student,
  language: 'uz',
  theme: 'system',
  koreanLevel: KoreanLevel.topik2,
  phone: '+998901234567',
);
const appUserProfile = Profile(
  id: 'p-app-user',
  fullName: 'Bekzod Aliyev',
  role: AccountRole.appUser,
  language: 'uz',
  theme: 'system',
  koreanLevel: KoreanLevel.topik1,
  phone: '+998935551234',
);

/// 15:45 in Tashkent on Thursday 26 November 2026: the moment the design frames show.
final testNow = DateTime.utc(2026, 11, 26, 10, 45);

/// student_home() as the server answers it; `changes` replaces parts of it.
Map<String, dynamic> homeJson([Map<String, dynamic> changes = const {}]) => {
  'student': {'id': 's-1', 'full_name': 'Aziza Karimova'},
  'today': '2026-11-26',
  'groups': [
    {'id': 'g-1', 'name': 'TOPIK II · Kechki', 'subject': 'Korean', 'level': 'TOPIK II'},
  ],
  'group_id': 'g-1',
  'next': {
    'id': 'l-1',
    'kind': 'lesson',
    'exam_title': null,
    'starts_at': '2026-11-26T13:00:00+00:00',
    'duration_min': 90,
    'room': '204',
    'teacher': 'Malika Tursunova',
  },
  'next_exam': {
    'id': 'l-2',
    'kind': 'exam',
    'exam_title': 'Mock TOPIK II',
    'starts_at': '2026-11-27T05:00:00+00:00',
    'duration_min': 90,
    'room': '301',
    'teacher': 'Malika Tursunova',
  },
  'rank': {'rank': 3, 'of': 14},
  'coins': 128,
  'coins_week': 12,
  'balance': {'amount': 0, 'oldest_unpaid_month': null, 'due_day': 5},
  'attendance': {'present': 11, 'late': 1, 'absent': 1, 'excused': 0, 'marked': 13, 'rate': 92},
  'unread': 3,
  ...changes,
};

class FakeHomeRepository implements HomeRepository {
  FakeHomeRepository({Map<String, dynamic>? home, this.appUser = const AppUserHome(lockedCoins: 34)}) : home = home ?? homeJson();

  Map<String, dynamic> home;
  AppUserHome appUser;

  /// Throw this from the next calls: an [OfflineException], or anything else.
  Object? failure;

  /// Never answers: the screen stays on its skeleton.
  bool hang = false;
  final asked = <String?>[];

  @override
  Future<Map<String, dynamic>> studentHome(String? groupId) async {
    asked.add(groupId);
    if (hang) return Completer<Map<String, dynamic>>().future;
    if (failure != null) throw failure!;
    return {...home, if (groupId != null && (home['groups'] as List).any((group) => group['id'] == groupId)) 'group_id': groupId};
  }

  @override
  Future<AppUserHome> appUserHome() async {
    if (hang) return Completer<AppUserHome>().future;
    if (failure != null) throw failure!;
    return appUser;
  }
}

AppNotification notification(String id, String type, String body, DateTime at, {bool read = false, Map<String, dynamic> data = const {}}) =>
    AppNotification(id: id, type: type, title: 'Seon', body: body, data: data, createdAt: at, readAt: read ? at : null);

/// The list of frame 03.
List<AppNotification> sampleNotifications() => [
  notification('n-1', 'custom', '+5 tanga: oʻyinda gʻalaba', DateTime.utc(2026, 11, 26, 10, 20), data: {'screen': 'coins'}),
  notification('n-2', 'reward_update', 'Buyurtmangiz olib ketishga tayyor: Brendli futbolka (M)', DateTime.utc(2026, 11, 26, 7, 40)),
  notification('n-3', 'lesson_reminder', 'Ertaga imtihon: Mock TOPIK II, 10:00', DateTime.utc(2026, 11, 26, 4)),
  notification('n-4', 'custom', 'Jasur T. sizni oʻyinga chaqirdi', DateTime.utc(2026, 11, 25, 14, 5), read: true, data: {'screen': 'game'}),
  notification('n-5', 'receipt_approved', 'Noyabr toʻlovi qabul qilindi: 600 000 soʻm', DateTime.utc(2026, 11, 3, 6), read: true),
];

class FakeNotificationsRepository implements NotificationsRepository {
  FakeNotificationsRepository([List<AppNotification>? items]) : items = items ?? [];

  List<AppNotification> items;
  Object? failure;
  final _changes = StreamController<void>.broadcast();
  final markedRead = <String>[];
  var markedAll = 0;

  /// The server added one, as Realtime would tell the app.
  void arrive(AppNotification item) {
    items = [item, ...items];
    _changes.add(null);
  }

  @override
  Future<List<AppNotification>> list() async {
    if (failure != null) throw failure!;
    return [...items];
  }

  @override
  Future<int> unreadCount() async => items.where((item) => item.unread).length;

  @override
  Stream<void> changes() => _changes.stream;

  @override
  Future<void> markRead(String id) async {
    markedRead.add(id);
    items = [for (final item in items) item.id == id ? item.read(testNow) : item];
  }

  @override
  Future<void> markAllRead() async {
    markedAll += 1;
    items = [for (final item in items) item.read(testNow)];
  }
}

/// The group board of frame 14a and the centre board of 14b.
List<LeaderRow> groupBoard() => const [
  LeaderRow(rank: 1, name: 'Jasur T.', coins: 164),
  LeaderRow(rank: 2, name: 'Madina R.', coins: 151),
  LeaderRow(rank: 3, name: 'Aziza K.', coins: 128, isMe: true),
  LeaderRow(rank: 4, name: 'Otabek S.', coins: 120),
  LeaderRow(rank: 5, name: 'Dilnoza A.', coins: 114),
  LeaderRow(rank: 6, name: 'Sardor M.', coins: 97),
  LeaderRow(rank: 7, name: 'Nilufar Y.', coins: 90),
  LeaderRow(rank: 8, name: 'Bekzod H.', coins: 85),
];

List<LeaderRow> centreBoard() {
  const top = ['Shahzod N.', 'Kamola E.', 'Temur A.', 'Zarina Q.', 'Malika O.', 'Jasur T.', 'Diyor R.', 'Sevara B.', 'Madina R.', 'Azizbek U.'];
  const coins = [231, 218, 204, 189, 176, 164, 160, 157, 151, 149];
  return [
    for (var i = 0; i < 180; i++)
      if (i < top.length)
        LeaderRow(rank: i + 1, name: top[i], coins: coins[i])
      else if (i == 26)
        const LeaderRow(rank: 27, name: 'Aziza K.', coins: 128, isMe: true)
      else
        LeaderRow(rank: i + 1, name: 'Oʻquvchi ${String.fromCharCode(65 + i % 26)}.', coins: 148 - i ~/ 2),
  ];
}

/// A week like frame 15: a lesson, a cancelled one, one today-ish, and a Saturday with an exam and a second group.
List<ScheduleLesson> weekLessons(DateTime monday) => [
  ScheduleLesson(id: 'w-1', groupName: 'TOPIK II', day: monday, startMinutes: 18 * 60, durationMin: 90, room: '204', teacher: 'Malika Tursunova'),
  ScheduleLesson(
    id: 'w-2',
    groupName: 'TOPIK II',
    day: monday.add(const Duration(days: 2)),
    startMinutes: 18 * 60,
    durationMin: 90,
    room: '204',
    teacher: 'Malika Tursunova',
    cancelled: true,
  ),
  ScheduleLesson(
    id: 'w-3',
    groupName: 'TOPIK II',
    day: monday.add(const Duration(days: 3)),
    startMinutes: 18 * 60,
    durationMin: 90,
    room: '204',
    teacher: 'Malika Tursunova',
  ),
  ScheduleLesson(
    id: 'w-4',
    groupName: 'TOPIK II',
    day: monday.add(const Duration(days: 5)),
    startMinutes: 10 * 60,
    durationMin: 90,
    room: '301',
    isExam: true,
    examTitle: 'Mock TOPIK II',
  ),
  ScheduleLesson(id: 'w-5', groupName: 'Matematika', day: monday.add(const Duration(days: 5)), startMinutes: 12 * 60, durationMin: 60),
];

List<LedgerEntry> sampleLedger() => [
  LedgerEntry(at: DateTime.utc(2026, 11, 3, 6), amount: 600000, isPayment: true, receiptNo: 1043),
  LedgerEntry(at: DateTime.utc(2026, 11, 1, 4), amount: -600000, isPayment: false, billingMonth: DateTime.utc(2026, 11)),
  LedgerEntry(at: DateTime.utc(2026, 10, 4, 6), amount: 600000, isPayment: true, receiptNo: 987),
  LedgerEntry(at: DateTime.utc(2026, 10, 1, 4), amount: -600000, isPayment: false, billingMonth: DateTime.utc(2026, 10)),
];

List<CoinEntry> sampleCoins() => [
  CoinEntry(delta: 5, source: 'game_win', at: DateTime.utc(2026, 11, 26, 10, 20)),
  CoinEntry(delta: 2, source: 'attendance', at: DateTime.utc(2026, 11, 26, 9, 52)),
  CoinEntry(delta: 2, source: 'teacher_award', reason: 'Uy vazifasi bajarildi', at: DateTime.utc(2026, 11, 25, 12)),
  CoinEntry(delta: -100, source: 'reward_hold', reason: 'Buyurtma: Brendli futbolka', at: DateTime.utc(2026, 11, 22, 8)),
  CoinEntry(delta: 10, source: 'perfect_month', at: DateTime.utc(2026, 11, 1, 5)),
];

class FakeMoreRepository implements MoreRepository {
  StudentDetails? details = StudentDetails(
    fullName: 'Aziza Karimova',
    birthDate: DateTime.utc(2009, 4, 12),
    parentName: 'Dilfuza Karimova',
    parentPhone: '+998971112233',
  );
  List<LeaderRow> group = groupBoard();
  List<LeaderRow> centre = centreBoard();
  List<ScheduleLesson> Function(DateTime monday) week = weekLessons;
  List<LedgerEntry> ledgerEntries = sampleLedger();
  List<CoinEntry> coins = sampleCoins();
  String? aboutText = 'Seon Topik — Toshkentdagi koreys tili markazi.';
  Object? failure;
  final boards = <String>[];
  final weeks = <(DateTime, DateTime)>[];
  final uploads = <Uint8List>[];
  final removed = <String>[];

  /// Called when a photo is saved or removed, with the profile's new path.
  void Function(String? path)? onAvatar;

  void _check() {
    if (failure != null) throw failure!;
  }

  @override
  Future<StudentDetails?> studentDetails() async => details;

  @override
  Future<List<LeaderRow>> leaderboard({required String scope, String? groupId, required String period}) async {
    _check();
    boards.add('$scope:$period:${groupId ?? ''}');
    return scope == 'group' ? group : centre;
  }

  @override
  Future<List<ScheduleLesson>> schedule(DateTime from, DateTime to) async {
    _check();
    weeks.add((from, to));
    return week(from);
  }

  @override
  Future<List<LedgerEntry>> ledger() async {
    _check();
    return ledgerEntries;
  }

  @override
  Future<List<CoinEntry>> coinHistory() async {
    _check();
    return coins;
  }

  @override
  Future<String?> about(String language) async => aboutText;

  @override
  Future<String?> avatarUrl(String path) async => null;

  @override
  Future<String> saveAvatar(Uint8List png, {String? replacing}) async {
    _check();
    uploads.add(png);
    if (replacing != null) removed.add(replacing);
    const path = 'p-student/photo.png';
    onAvatar?.call(path);
    return path;
  }

  @override
  Future<void> removeAvatar(String path) async {
    _check();
    removed.add(path);
    onAvatar?.call(null);
  }
}

// ── Shop ──

ShopVariant _size(String name, int? stock) => ShopVariant(id: 'v-${name.toLowerCase()}', names: {'uz': name, 'ru': name, 'en': name, 'ko': name}, stock: stock);

List<ShopItem> sampleShop() => [
  ShopItem(id: 'r-pens', name: 'Ruchka toʻplami', cost: 25),
  ShopItem(id: 'r-notebook', name: 'Daftar toʻplami', cost: 40, stock: 12),
  ShopItem(id: 'r-mug', name: 'Termos krujka', cost: 80, stock: 4),
  ShopItem(
    id: 'r-shirt',
    name: 'Brendli futbolka',
    description: 'Markazimizning brendli paxta futbolkasi. Yumshoq mato, koʻkrak qismida logotip.',
    cost: 100,
    variants: [_size('S', 5), _size('M', 3), _size('L', 0), _size('XL', 2)],
  ),
  ShopItem(id: 'r-ticket', name: 'Kino chiptasi', cost: 150, stock: 6),
  ShopItem(id: 'r-bag', name: 'Ryukzak', cost: 200, stock: 0),
];

List<ShopOrder> sampleOrders() => [
  ShopOrder(id: 'o-3', rewardId: 'r-pens', rewardName: 'Ruchka toʻplami', cost: 25, status: OrderStatus.requested, createdAt: DateTime.utc(2026, 11, 26, 9)),
  ShopOrder(
    id: 'o-2',
    rewardId: 'r-shirt',
    rewardName: 'Brendli futbolka',
    variantNames: const {'uz': 'M', 'ru': 'M', 'en': 'M', 'ko': 'M'},
    cost: 100,
    status: OrderStatus.ready,
    createdAt: DateTime.utc(2026, 11, 20, 9),
    readyAt: DateTime.utc(2026, 11, 25, 9),
  ),
  ShopOrder(
    id: 'o-1',
    rewardId: 'r-notebook',
    rewardName: 'Daftar toʻplami',
    cost: 40,
    status: OrderStatus.given,
    createdAt: DateTime.utc(2026, 10, 30, 9),
    handledAt: DateTime.utc(2026, 11, 2, 9),
  ),
];

/// The shop as the server keeps it: coins are held and stock is taken when an
/// order is placed, and both come back when it is cancelled or rejected. The
/// methods at the end are the centre's side, as the CRM's Requests tab.
class FakeShopRepository implements ShopRepository {
  FakeShopRepository({List<ShopItem>? items, List<ShopOrder>? orders}) : shopItems = items ?? sampleShop(), shopOrders = orders ?? sampleOrders();

  List<ShopItem> shopItems;
  List<ShopOrder> shopOrders;

  /// The student's coins. The test app points these at the Home it serves.
  int Function() balance = () => 128;
  void Function(int coins) setBalance = (_) {};

  /// A linked student may order; the database refuses anyone else.
  bool allowed = true;
  DateTime Function() clock = () => testNow;
  Object? failure;
  final _changes = StreamController<void>.broadcast();
  final _keys = <String>{};
  var _next = 100;

  void _check() {
    if (failure != null) throw failure!;
  }

  void _restock(String rewardId, String? variantName, int by) {
    shopItems = [
      for (final item in shopItems)
        if (item.id != rewardId)
          item
        else
          ShopItem(
            id: item.id,
            name: item.name,
            description: item.description,
            cost: item.cost,
            photoPath: item.photoPath,
            stock: variantName == null && item.stock != null ? item.stock! + by : item.stock,
            variants: [
              for (final variant in item.variants)
                variant.names['uz'] == variantName && variant.stock != null
                    ? ShopVariant(id: variant.id, names: variant.names, stock: variant.stock! + by)
                    : variant,
            ],
          ),
    ];
  }

  void _close(String orderId, OrderStatus status, {String? note, bool giveBack = false}) {
    final order = shopOrders.firstWhere((order) => order.id == orderId);
    shopOrders = [
      for (final each in shopOrders)
        if (each.id != orderId)
          each
        else
          ShopOrder(
            id: each.id,
            rewardId: each.rewardId,
            rewardName: each.rewardName,
            cost: each.cost,
            status: status,
            createdAt: each.createdAt,
            photoPath: each.photoPath,
            variantNames: each.variantNames,
            readyAt: status == OrderStatus.ready ? clock() : each.readyAt,
            handledAt: status == OrderStatus.ready ? null : clock(),
            note: note,
          ),
    ];
    if (giveBack) {
      setBalance(balance() + order.cost);
      _restock(order.rewardId, order.variantNames?['uz'], 1);
    }
    _changes.add(null);
  }

  @override
  Future<List<ShopItem>> items() async {
    _check();
    return shopItems;
  }

  @override
  Future<List<ShopOrder>> orders() async {
    _check();
    return allowed ? shopOrders : const [];
  }

  @override
  Future<void> order({required String rewardId, String? variantId, required String requestKey}) async {
    _check();
    if (!allowed) throw const ShopException(ShopFailure.notAllowed);
    if (!_keys.add(requestKey)) return;
    final item = shopItems.where((item) => item.id == rewardId).firstOrNull;
    if (item == null) throw const ShopException(ShopFailure.notOnOffer);
    final variant = item.variants.where((variant) => variant.id == variantId).firstOrNull;
    if (item.variants.isNotEmpty && variant == null) throw const ShopException(ShopFailure.chooseVariant);
    if (balance() < item.cost) throw const ShopException(ShopFailure.notEnoughCoins);
    if ((variant?.stock ?? item.stock) == 0) throw const ShopException(ShopFailure.soldOut);
    setBalance(balance() - item.cost);
    _restock(item.id, variant?.names['uz'], -1);
    shopOrders = [
      ShopOrder(
        id: 'o-${_next++}',
        rewardId: item.id,
        rewardName: item.name,
        cost: item.cost,
        status: OrderStatus.requested,
        createdAt: clock(),
        photoPath: item.photoPath,
        variantNames: variant?.names,
      ),
      ...shopOrders,
    ];
    _changes.add(null);
  }

  @override
  Future<void> cancel(String orderId) async {
    _check();
    final order = shopOrders.where((order) => order.id == orderId).firstOrNull;
    if (order == null || order.status != OrderStatus.requested) throw const ShopException(ShopFailure.tooLate);
    _close(orderId, OrderStatus.cancelled, giveBack: true);
  }

  @override
  Stream<void> orderChanges() => _changes.stream;

  @override
  Future<String?> photoUrl(String path) async => null;

  // The centre's side.

  void markReady(String orderId) => _close(orderId, OrderStatus.ready);

  void give(String orderId) => _close(orderId, OrderStatus.given);

  void reject(String orderId, String reason) => _close(orderId, OrderStatus.rejected, note: reason, giveBack: true);
}

// ── QR check-in ──

/// The same fixed secret and student as supabase/tests/checkin.test.ts.
const testQrIdentity = QrIdentity(
  studentId: '11111111-2222-4333-8444-555555555555',
  secret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
);

class FakeCheckinRepository implements CheckinRepository {
  /// What the server would hand out now.
  QrIdentity serverIdentity = testQrIdentity;

  /// Today's visits, the oldest first, as reception scanned them.
  List<Visit> visits = [];
  Object? failure;
  int asked = 0;
  final _changes = StreamController<void>.broadcast();

  /// Reception scans the code: Arrived, then Left, and so on.
  void scan(DateTime at) {
    visits = [...visits, Visit(arrived: visits.isEmpty || !visits.last.arrived, at: at)];
    _changes.add(null);
  }

  @override
  Future<QrIdentity> identity() async {
    asked++;
    if (failure != null) throw failure!;
    return serverIdentity;
  }

  @override
  Future<Visit?> lastVisitToday(DateTime now) async {
    if (failure != null) throw failure!;
    return visits.isEmpty ? null : visits.last;
  }

  @override
  Stream<void> visitChanges() => _changes.stream;
}

/// The phone's secure storage, in memory.
class FakeQrSecretStore implements QrSecretStore {
  String? profileId;
  QrIdentity? kept;

  @override
  Future<QrIdentity?> read(String profileId) async => this.profileId == profileId ? kept : null;

  @override
  Future<void> write(String profileId, QrIdentity identity) async {
    this.profileId = profileId;
    kept = identity;
  }

  @override
  Future<void> clear() async {
    profileId = null;
    kept = null;
  }
}

class FakeScreenLight implements ScreenLight {
  /// 'raise' and 'restore', in the order they were asked for.
  final calls = <String>[];

  bool get raised => calls.isNotEmpty && calls.last == 'raise';

  @override
  Future<void> raise() async => calls.add('raise');

  @override
  Future<void> restore() async => calls.add('restore');
}
