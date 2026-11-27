import 'dart:typed_data';

import 'package:student/data/receipts.dart';

// Receipts in memory, with the server's rules: a file is taken only when its
// content is a PNG, a JPG or a PDF of at most 5 MB, whatever it is called; a
// new receipt is pending until the centre approves or rejects it.

/// A file with a real picture's or PDF's first bytes, of the given size.
Uint8List fileBytes(String type, {int length = 1258291}) {
  final head = switch (type) {
    'png' => const [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    'jpg' => const [0xFF, 0xD8, 0xFF, 0xE0],
    'pdf' => const [0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37],
    // "MZ": a Windows program.
    _ => const [0x4D, 0x5A, 0x90, 0x00],
  };
  return Uint8List(length)..setRange(0, head.length, head);
}

/// "chek_dekabr.jpg", 1,2 MB, as in the designs.
PickedReceipt sampleReceiptFile() => PickedReceipt(name: 'chek_dekabr.jpg', bytes: fileBytes('jpg'));

PayByCardInfo samplePayInfo({
  int amountDue = 600000,
  Map<String, String> instructions = const {},
  bool card = true,
  String? submitUrl = 'https://crm.example.uz/api/v1/receipts',
}) => PayByCardInfo(
  studentId: 'student-1',
  cardNumber: card ? '8600123456789012' : null,
  cardHolder: card ? 'SEON TOPIK MCHJ' : null,
  bank: card ? 'Kapitalbank' : null,
  instructions: instructions,
  amountDue: amountDue,
  submitUrl: submitUrl,
);

class FakeReceiptRepository implements ReceiptRepository {
  FakeReceiptRepository({required this.now, PayByCardInfo? info}) : info = info ?? samplePayInfo();

  DateTime Function() now;
  PayByCardInfo info;

  /// The student's receipts, the newest first.
  final sent = <Receipt>[];

  /// What was sent, in order.
  final drafts = <ReceiptDraft>[];

  /// Every call fails with this while it is set.
  Object? failure;

  /// Told when the centre approves a receipt, with its amount: the balance changes.
  void Function(int amount)? onApproved;

  @override
  Future<PayByCardInfo> payInfo() async {
    if (failure != null) throw failure!;
    return info;
  }

  @override
  Future<List<Receipt>> receipts() async {
    if (failure != null) throw failure!;
    return List.of(sent);
  }

  @override
  Future<void> submit(PayByCardInfo info, ReceiptDraft draft) async {
    if (failure != null) throw failure!;
    // The server reads the file itself: a name proves nothing.
    checkReceiptFile(draft.file.bytes);
    if (draft.amount <= 0) throw const ReceiptException(ReceiptFailure.amount);
    drafts.add(draft);
    sent.insert(
      0,
      Receipt(
        id: 'receipt-${drafts.length}',
        amount: draft.amount,
        paidOn: DateTime.parse('${draft.paidOn}T00:00:00Z'),
        status: ReceiptStatus.pending,
        createdAt: now(),
      ),
    );
  }

  void _decide(String id, ReceiptStatus status, String? reason) {
    final index = sent.indexWhere((receipt) => receipt.id == id);
    final old = sent[index];
    sent[index] = Receipt(id: old.id, amount: old.amount, paidOn: old.paidOn, status: status, rejectReason: reason, createdAt: old.createdAt);
    if (status == ReceiptStatus.approved) onApproved?.call(old.amount);
  }

  /// The centre approves: exactly one payment of the receipt's amount.
  void approve(String id) => _decide(id, ReceiptStatus.approved, null);

  void reject(String id, String reason) => _decide(id, ReceiptStatus.rejected, reason);
}
