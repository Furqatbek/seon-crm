import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'home.dart';

// The shop: rewards a student orders with coins and picks up at reception.
// The server decides every order: the app asks and shows the answer.

/// One choice of a reward, such as a size.
class ShopVariant {
  const ShopVariant({required this.id, required this.names, this.stock});

  final String id;

  /// Its name in uz, ru, en and ko.
  final Map<String, String> names;

  /// Units left; null when there is no limit.
  final int? stock;

  bool get soldOut => stock == 0;

  /// The name in an interface language, falling back to Uzbek.
  String label(String language) => names[language] ?? names['uz'] ?? '';
}

class ShopItem {
  const ShopItem({required this.id, required this.name, required this.cost, this.description, this.stock, this.photoPath, this.variants = const []});

  final String id;
  final String name;
  final String? description;

  /// In coins.
  final int cost;

  /// Units left when it has no variants; null when there is no limit.
  final int? stock;
  final String? photoPath;
  final List<ShopVariant> variants;

  /// With variants, the units are the variants' own.
  bool get soldOut => variants.isEmpty ? stock == 0 : variants.every((variant) => variant.soldOut);

  factory ShopItem.fromRow(Map<String, dynamic> row) {
    final variants = [...(row['reward_variants'] as List? ?? const [])]..sort((a, b) => '${a['created_at']}'.compareTo('${b['created_at']}'));
    return ShopItem(
      id: '${row['id']}',
      name: '${row['name']}',
      description: row['description'] as String?,
      cost: (row['cost'] as num).toInt(),
      stock: (row['stock'] as num?)?.toInt(),
      photoPath: row['photo_path'] as String?,
      variants: [
        for (final variant in variants) ShopVariant(id: '${variant['id']}', names: _names(variant['name']), stock: (variant['stock'] as num?)?.toInt()),
      ],
    );
  }
}

Map<String, String> _names(Object? json) => json is Map ? {for (final entry in json.entries) '${entry.key}': '${entry.value}'} : const {};

enum OrderStatus { requested, ready, given, rejected, cancelled }

class ShopOrder {
  const ShopOrder({
    required this.id,
    required this.rewardId,
    required this.rewardName,
    required this.cost,
    required this.status,
    required this.createdAt,
    this.photoPath,
    this.variantNames,
    this.readyAt,
    this.handledAt,
    this.note,
  });

  final String id;
  final String rewardId;
  final String rewardName;
  final int cost;
  final OrderStatus status;
  final DateTime createdAt;
  final String? photoPath;
  final Map<String, String>? variantNames;
  final DateTime? readyAt;

  /// When it was given, rejected or cancelled.
  final DateTime? handledAt;

  /// The centre's reason for rejecting or cancelling it.
  final String? note;

  /// Still on its way: it can become Ready or Given.
  bool get open => status == OrderStatus.requested || status == OrderStatus.ready;

  /// "Brendli futbolka (M)"
  String title(String language) {
    final variant = variantNames?[language] ?? variantNames?['uz'];
    return variant == null || variant.isEmpty ? rewardName : '$rewardName ($variant)';
  }

  factory ShopOrder.fromRow(Map<String, dynamic> row) => ShopOrder(
    id: '${row['id']}',
    rewardId: '${row['reward_id']}',
    rewardName: '${row['reward_name']}',
    cost: (row['cost'] as num).toInt(),
    status: OrderStatus.values.firstWhere((status) => status.name == row['status'], orElse: () => OrderStatus.requested),
    createdAt: DateTime.parse(row['created_at'] as String).toUtc(),
    photoPath: row['photo_path'] as String?,
    variantNames: row['variant_name'] == null ? null : _names(row['variant_name']),
    readyAt: row['ready_at'] is String ? DateTime.parse(row['ready_at'] as String).toUtc() : null,
    handledAt: row['handled_at'] is String ? DateTime.parse(row['handled_at'] as String).toUtc() : null,
    note: row['note'] as String?,
  );
}

/// Why the server refused an order or a cancellation.
enum ShopFailure { notEnoughCoins, soldOut, notOnOffer, chooseVariant, tooLate, notAllowed }

class ShopException implements Exception {
  const ShopException(this.failure);

  final ShopFailure failure;

  /// The server's error code, when it is one of the shop's.
  static ShopException? fromCode(String? code) => switch (code) {
    'ER001' => const ShopException(ShopFailure.notEnoughCoins),
    'ER002' => const ShopException(ShopFailure.soldOut),
    'ER005' => const ShopException(ShopFailure.notOnOffer),
    'ER006' => const ShopException(ShopFailure.chooseVariant),
    'ER003' || 'ER007' => const ShopException(ShopFailure.tooLate),
    '42501' => const ShopException(ShopFailure.notAllowed),
    _ => null,
  };
}

abstract class ShopRepository {
  /// Everything on offer, cheapest first.
  Future<List<ShopItem>> items();

  /// The student's orders, the newest first.
  Future<List<ShopOrder>> orders();

  /// Orders one unit. `requestKey` makes a repeated tap the same order.
  /// Throws [ShopException] when the server refuses.
  Future<void> order({required String rewardId, String? variantId, required String requestKey});

  /// Cancels an order that is still Requested: the coins and the unit come back.
  Future<void> cancel(String orderId);

  /// Fires whenever one of the student's orders changes on the server.
  Stream<void> orderChanges();

  /// A short-lived link to a photo in the private reward-photos bucket.
  Future<String?> photoUrl(String path);
}

class SupabaseShopRepository implements ShopRepository {
  SupabaseShopRepository(this._client);

  final SupabaseClient _client;

  Future<T> _ask<T>(Future<T> Function() call) => reachServer(() async {
    try {
      return await call();
    } on PostgrestException catch (error) {
      throw ShopException.fromCode(error.code) ?? error;
    }
  });

  @override
  Future<List<ShopItem>> items() => reachServer(() async {
    // Row level security returns what is on offer, without archived variants.
    final rows = await _client
        .from('rewards')
        .select('id, name, description, cost, stock, photo_path, reward_variants(id, name, stock, created_at)')
        .order('cost')
        .order('name');
    return [for (final row in rows) ShopItem.fromRow(row)];
  });

  @override
  Future<List<ShopOrder>> orders() => reachServer(() async {
    final rows = await _client.rpc('my_orders') as List;
    return [for (final row in rows) ShopOrder.fromRow(Map<String, dynamic>.from(row as Map))];
  });

  @override
  Future<void> order({required String rewardId, String? variantId, required String requestKey}) => _ask(() async {
    // The server orders for the signed-in student, whoever is named here.
    await _client.rpc('request_reward', params: {'p_student_id': null, 'p_reward_id': rewardId, 'p_variant_id': variantId, 'p_request_key': requestKey});
  });

  @override
  Future<void> cancel(String orderId) => _ask(() async {
    await _client.rpc('handle_redemption', params: {'p_id': orderId, 'p_action': 'cancel'});
  });

  @override
  Stream<void> orderChanges() {
    final id = _client.auth.currentUser?.id;
    if (id == null) return const Stream.empty();
    late final StreamController<void> controller;
    RealtimeChannel? channel;
    controller = StreamController<void>.broadcast(
      onListen: () {
        // Realtime sends only rows the person may read: their own orders.
        channel = _client
            .channel('orders:$id')
            .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'redemptions', callback: (_) => controller.add(null))
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
  Future<String?> photoUrl(String path) async {
    try {
      return await _client.storage.from('reward-photos').createSignedUrl(path, 3600);
    } catch (_) {
      return null;
    }
  }
}
