import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/home.dart';
import '../data/notifications.dart';
import 'state.dart';

/// Set in main.
final homeRepositoryProvider = Provider<HomeRepository>((ref) => throw UnimplementedError('homeRepositoryProvider'));

/// Set in main.
final notificationsRepositoryProvider = Provider<NotificationsRepository>((ref) => throw UnimplementedError('notificationsRepositoryProvider'));

/// The time now. Tests set it.
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// What stopped the last refresh.
enum HomeProblem { none, offline, failed }

class StudentHomeState {
  const StudentHomeState({this.home, this.loading = false, this.problem = HomeProblem.none});

  /// The last answer from the server, or the one kept on the phone.
  final StudentHome? home;
  final bool loading;
  final HomeProblem problem;
}

const _groupKey = 'home_group';
const _cacheKey = 'home_cache';

/// The Student Home: one call to student_home(group_id) for the group chosen
/// in the header. The chosen group is remembered on the phone, and so is the
/// last answer, which is shown under the offline banner when there is no
/// connection.
class StudentHomeController extends Notifier<StudentHomeState> {
  @override
  StudentHomeState build() {
    // A different person starts from nothing.
    final profileId = ref.watch(authProvider.select((auth) => auth.profile?.id));
    final cached = profileId == null ? null : _readCache(profileId);
    if (profileId != null) unawaited(Future.microtask(refresh));
    return StudentHomeState(home: cached, loading: profileId != null);
  }

  StudentHome? _readCache(String profileId) {
    try {
      final saved = ref.read(sharedPreferencesProvider).getString(_cacheKey);
      if (saved == null) return null;
      final json = jsonDecode(saved) as Map<String, dynamic>;
      if (json['profile_id'] != profileId) return null;
      return StudentHome.fromJson(Map<String, dynamic>.from(json['home'] as Map));
    } catch (_) {
      return null;
    }
  }

  /// Pull to refresh, and every time the tab is opened.
  Future<void> refresh() async {
    final profileId = ref.read(authProvider).profile?.id;
    if (profileId == null) return;
    final preferences = ref.read(sharedPreferencesProvider);
    state = StudentHomeState(home: state.home, loading: true, problem: state.problem);
    try {
      final json = await ref.read(homeRepositoryProvider).studentHome(preferences.getString(_groupKey));
      if (ref.read(authProvider).profile?.id != profileId) return;
      state = StudentHomeState(home: StudentHome.fromJson(json));
      await preferences.setString(_cacheKey, jsonEncode({'profile_id': profileId, 'home': json}));
    } on OfflineException {
      state = StudentHomeState(home: state.home, problem: HomeProblem.offline);
    } catch (_) {
      state = StudentHomeState(home: state.home, problem: HomeProblem.failed);
    }
  }

  /// The header's group switcher.
  Future<void> chooseGroup(String groupId) async {
    await ref.read(sharedPreferencesProvider).setString(_groupKey, groupId);
    await refresh();
  }
}

final studentHomeProvider = NotifierProvider<StudentHomeController, StudentHomeState>(StudentHomeController.new);

/// The App user Home.
final appUserHomeProvider = FutureProvider.autoDispose<AppUserHome>((ref) {
  ref.watch(authProvider.select((auth) => auth.profile?.id));
  return ref.watch(homeRepositoryProvider).appUserHome();
});

/// The bell's count, kept live: read once, then again whenever Realtime says
/// one of the person's notifications changed.
final unreadCountProvider = StreamProvider<int>((ref) async* {
  final profileId = ref.watch(authProvider.select((auth) => auth.profile?.id));
  if (profileId == null) {
    yield 0;
    return;
  }
  final repository = ref.watch(notificationsRepositoryProvider);
  Future<int?> count() async {
    try {
      return await repository.unreadCount();
    } catch (_) {
      return null;
    }
  }

  final first = await count();
  if (first != null) yield first;
  await for (final _ in repository.changes()) {
    final next = await count();
    if (next != null) yield next;
  }
});

/// The notifications list. Marking read changes it in place, so the list
/// does not jump while it is being read.
class NotificationsController extends AsyncNotifier<List<AppNotification>> {
  @override
  Future<List<AppNotification>> build() {
    final repository = ref.watch(notificationsRepositoryProvider);
    final changes = repository.changes().listen((_) => unawaited(_reload()));
    ref.onDispose(changes.cancel);
    return repository.list();
  }

  Future<void> _reload() async {
    try {
      state = AsyncData(await ref.read(notificationsRepositoryProvider).list());
    } catch (_) {
      // What is on screen stays.
    }
  }

  Future<void> refresh() => _reload();

  /// Opened: read from now on.
  Future<void> markRead(AppNotification notification) async {
    if (!notification.unread) return;
    final now = ref.read(clockProvider)();
    state = AsyncData([for (final item in state.value ?? const <AppNotification>[]) item.id == notification.id ? item.read(now) : item]);
    try {
      await ref.read(notificationsRepositoryProvider).markRead(notification.id);
    } catch (_) {
      // Stays unread on the server; the next open marks it again.
    }
    ref.invalidate(unreadCountProvider);
  }

  Future<void> markAllRead() async {
    final now = ref.read(clockProvider)();
    state = AsyncData([for (final item in state.value ?? const <AppNotification>[]) item.read(now)]);
    try {
      await ref.read(notificationsRepositoryProvider).markAllRead();
    } catch (_) {}
    ref.invalidate(unreadCountProvider);
  }
}

final notificationsProvider = AsyncNotifierProvider.autoDispose<NotificationsController, List<AppNotification>>(NotificationsController.new);
