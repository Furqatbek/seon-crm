import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'home.dart';

/// One row of the bell's list.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.data,
    required this.createdAt,
    this.readAt,
  });

  final String id;

  /// The server's message type: lesson_reminder, reward_update, …
  final String type;
  final String title;
  final String body;

  /// Where a tap leads: {screen: …}.
  final Map<String, dynamic> data;
  final DateTime createdAt;
  final DateTime? readAt;

  bool get unread => readAt == null;

  /// What the row says: the message itself, or its title when there is no more.
  String get text => body.trim().isEmpty ? title : body;

  AppNotification read(DateTime at) => AppNotification(id: id, type: type, title: title, body: body, data: data, createdAt: createdAt, readAt: readAt ?? at);

  factory AppNotification.fromRow(Map<String, dynamic> row) => AppNotification(
    id: row['id'] as String,
    type: '${row['type']}',
    title: '${row['title'] ?? ''}',
    body: '${row['body'] ?? ''}',
    data: row['data'] is Map ? Map<String, dynamic>.from(row['data'] as Map) : const {},
    createdAt: DateTime.parse(row['created_at'] as String).toUtc(),
    readAt: row['read_at'] == null ? null : DateTime.parse(row['read_at'] as String).toUtc(),
  );
}

abstract class NotificationsRepository {
  /// The newest first.
  Future<List<AppNotification>> list();

  Future<int> unreadCount();

  /// Fires whenever one of the signed-in person's notifications is added or changed.
  Stream<void> changes();

  Future<void> markRead(String id);

  Future<void> markAllRead();
}

class SupabaseNotificationsRepository implements NotificationsRepository {
  SupabaseNotificationsRepository(this._client);

  final SupabaseClient _client;

  /// Enough for the list; older ones stay on the server.
  static const _limit = 100;

  @override
  Future<List<AppNotification>> list() => reachServer(() async {
    final rows = await _client
        .from('notifications')
        .select('id, type, title, body, data, read_at, created_at')
        .order('created_at', ascending: false)
        .limit(_limit);
    return [for (final row in rows) AppNotification.fromRow(row)];
  });

  @override
  Future<int> unreadCount() => reachServer(() => _client.from('notifications').count().isFilter('read_at', null));

  @override
  Stream<void> changes() {
    final id = _client.auth.currentUser?.id;
    if (id == null) return const Stream.empty();
    late final StreamController<void> controller;
    RealtimeChannel? channel;
    controller = StreamController<void>.broadcast(
      onListen: () {
        // Realtime sends only rows the person may read: their own.
        channel = _client
            .channel('notifications:$id')
            .onPostgresChanges(
              event: PostgresChangeEvent.all,
              schema: 'public',
              table: 'notifications',
              filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'profile_id', value: id),
              callback: (_) => controller.add(null),
            )
            .subscribe();
      },
      onCancel: () {
        final open = channel;
        channel = null;
        if (open != null) _client.removeChannel(open);
      },
    );
    return controller.stream;
  }

  @override
  Future<void> markRead(String id) =>
      reachServer(() => _client.from('notifications').update({'read_at': DateTime.now().toUtc().toIso8601String()}).eq('id', id).isFilter('read_at', null));

  @override
  Future<void> markAllRead() =>
      reachServer(() => _client.from('notifications').update({'read_at': DateTime.now().toUtc().toIso8601String()}).isFilter('read_at', null));
}
