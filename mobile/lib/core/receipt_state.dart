import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/receipts.dart';
import 'state.dart';

/// Set in main.
final receiptRepositoryProvider = Provider<ReceiptRepository>((ref) => throw UnimplementedError('receiptRepositoryProvider'));

/// Chooses a receipt's file. Set in main; tests hand back bytes of their own.
final receiptPickerProvider = Provider<ReceiptPicker>(
  (ref) =>
      (_) async => null,
);

/// The centre's card, its instructions and what the student owes.
final payInfoProvider = FutureProvider.autoDispose<PayByCardInfo>((ref) {
  ref.watch(authProvider.select((auth) => auth.profile?.id));
  return ref.watch(receiptRepositoryProvider).payInfo();
}, retry: (_, _) => null);

/// The student's receipts, the newest first.
final receiptsProvider = FutureProvider.autoDispose<List<Receipt>>((ref) {
  ref.watch(authProvider.select((auth) => auth.profile?.id));
  return ref.watch(receiptRepositoryProvider).receipts();
}, retry: (_, _) => null);
