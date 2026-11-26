import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/more.dart';
import 'state.dart';

/// Set in main.
final moreRepositoryProvider = Provider<MoreRepository>((ref) => throw UnimplementedError('moreRepositoryProvider'));

/// Takes a photo or picks one from the gallery; null when the person backed out.
typedef PhotoPicker = Future<Uint8List?> Function(PhotoSource source);

/// Set in main.
final photoPickerProvider = Provider<PhotoPicker>(
  (ref) =>
      (_) async => null,
);

/// The signed-in person's own id: lists are read again for another person.
final _me = Provider<String?>((ref) => ref.watch(authProvider.select((auth) => auth.profile?.id)));

/// A link to the profile photo, or null without one.
final avatarUrlProvider = FutureProvider<String?>((ref) async {
  final path = ref.watch(authProvider.select((auth) => auth.profile?.avatarPath));
  if (path == null) return null;
  return ref.watch(moreRepositoryProvider).avatarUrl(path);
});

final studentDetailsProvider = FutureProvider.autoDispose<StudentDetails?>((ref) {
  ref.watch(_me);
  return ref.watch(moreRepositoryProvider).studentDetails();
});

/// Which board: the group's or the centre's, this month's or all-time.
typedef LeaderboardQuery = ({String scope, String? groupId, String period});

final leaderboardProvider = FutureProvider.autoDispose.family<List<LeaderRow>, LeaderboardQuery>((ref, query) {
  ref.watch(_me);
  return ref.watch(moreRepositoryProvider).leaderboard(scope: query.scope, groupId: query.groupId, period: query.period);
});

/// The Monday a day's week starts on.
DateTime weekStartOf(DateTime day) => DateTime.utc(day.year, day.month, day.day - (day.weekday - 1));

/// The lessons of the week that starts on this Monday.
final scheduleProvider = FutureProvider.autoDispose.family<List<ScheduleLesson>, DateTime>((ref, monday) {
  ref.watch(_me);
  return ref.watch(moreRepositoryProvider).schedule(monday, monday.add(const Duration(days: 6)));
});

final ledgerProvider = FutureProvider.autoDispose<List<LedgerEntry>>((ref) {
  ref.watch(_me);
  return ref.watch(moreRepositoryProvider).ledger();
});

final coinHistoryProvider = FutureProvider.autoDispose<List<CoinEntry>>((ref) {
  ref.watch(_me);
  return ref.watch(moreRepositoryProvider).coinHistory();
});

final aboutProvider = FutureProvider.autoDispose<String?>((ref) {
  final language = ref.watch(settingsProvider.select((settings) => settings.language));
  return ref.watch(moreRepositoryProvider).about(language);
});
