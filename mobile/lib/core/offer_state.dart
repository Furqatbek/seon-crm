import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/home.dart';
import '../data/offers.dart';
import 'state.dart';

/// Set in main.
final offerRepositoryProvider = Provider<OfferRepository>((ref) => throw UnimplementedError('offerRepositoryProvider'));

/// The person's voucher, whatever its state.
final voucherProvider = FutureProvider.autoDispose<HomeVoucher?>((ref) {
  ref.watch(authProvider.select((auth) => auth.profile?.id));
  return ref.watch(offerRepositoryProvider).voucher();
}, retry: (_, _) => null);

/// The open lessons of the next four weeks and the person's booking.
final openLessonsProvider = FutureProvider.autoDispose<OpenLessons>((ref) {
  ref.watch(authProvider.select((auth) => auth.profile?.id));
  return ref.watch(offerRepositoryProvider).openLessons();
}, retry: (_, _) => null);
