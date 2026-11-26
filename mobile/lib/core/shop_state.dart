import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/shop.dart';
import 'home_state.dart';
import 'state.dart';

/// Set in main.
final shopRepositoryProvider = Provider<ShopRepository>((ref) => throw UnimplementedError('shopRepositoryProvider'));

/// What is on offer. Read again for another person.
final shopItemsProvider = FutureProvider.autoDispose<List<ShopItem>>((ref) {
  ref.watch(authProvider.select((auth) => auth.profile?.id));
  return ref.watch(shopRepositoryProvider).items();
});

/// A link to a reward's photo.
final rewardPhotoProvider = FutureProvider.family<String?, String>((ref, path) => ref.watch(shopRepositoryProvider).photoUrl(path));

/// The student's orders, kept live: when the centre marks one Ready or Given,
/// the list, the balance and the stock follow.
class OrdersController extends AsyncNotifier<List<ShopOrder>> {
  @override
  Future<List<ShopOrder>> build() {
    ref.watch(authProvider.select((auth) => auth.profile?.id));
    final repository = ref.watch(shopRepositoryProvider);
    final changes = repository.orderChanges().listen((_) => unawaited(refresh()));
    ref.onDispose(changes.cancel);
    return repository.orders();
  }

  /// Reads the orders again, with the coins and the stock they changed.
  Future<void> refresh() async {
    ref.invalidate(shopItemsProvider);
    unawaited(ref.read(studentHomeProvider.notifier).refresh());
    try {
      final orders = await ref.read(shopRepositoryProvider).orders();
      if (ref.mounted) state = AsyncData(orders);
    } catch (error, stack) {
      // What is on screen stays; with nothing on screen, the problem shows.
      if (ref.mounted && state.value == null) state = AsyncError(error, stack);
    }
  }

  /// Throws [ShopException] when the server refuses.
  Future<void> order({required String rewardId, String? variantId, required String requestKey}) async {
    try {
      await ref.read(shopRepositoryProvider).order(rewardId: rewardId, variantId: variantId, requestKey: requestKey);
    } finally {
      // Refused or not, the balance and the stock may have moved.
      if (ref.mounted) await refresh();
    }
  }

  Future<void> cancel(String orderId) async {
    try {
      await ref.read(shopRepositoryProvider).cancel(orderId);
    } finally {
      if (ref.mounted) await refresh();
    }
  }
}

final ordersProvider = AsyncNotifierProvider<OrdersController, List<ShopOrder>>(OrdersController.new);
