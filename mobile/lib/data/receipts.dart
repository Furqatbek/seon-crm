import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'home.dart';

// Card payments and receipts — docs/STUDENT_APP_SPEC.md → "Rules → Receipts".
// The student transfers money to the centre's card and sends a receipt: a
// PNG, a JPG or a PDF of at most 5 MB. The file goes to the centre's private
// storage, in the student's own folder; the centre's server then reads it,
// checks what it really is, and writes the receipt. The app checks the file
// first only to say so sooner: the server's word is the one that counts.

const receiptMaxBytes = 5 * 1024 * 1024;

/// What a file is, from its first bytes: 'png', 'jpg' or 'pdf'; null for
/// anything else, whatever it is called.
String? sniffReceiptType(Uint8List bytes) {
  bool starts(List<int> signature) {
    if (bytes.length < signature.length) return false;
    for (var i = 0; i < signature.length; i++) {
      if (bytes[i] != signature[i]) return false;
    }
    return true;
  }

  if (starts(const [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'png';
  if (starts(const [0xFF, 0xD8, 0xFF])) return 'jpg';
  // "%PDF-"
  if (starts(const [0x25, 0x50, 0x44, 0x46, 0x2D])) return 'pdf';
  return null;
}

enum ReceiptFailure { fileEmpty, fileTooLarge, fileType, amount, date, group, notStudent, unavailable }

class ReceiptException implements Exception {
  const ReceiptException(this.failure);

  final ReceiptFailure failure;

  /// The server's own word for why it refused.
  static ReceiptException? fromServer(String? error) => switch (error) {
    'fileEmpty' => const ReceiptException(ReceiptFailure.fileEmpty),
    'fileTooLarge' => const ReceiptException(ReceiptFailure.fileTooLarge),
    'fileType' || 'file' => const ReceiptException(ReceiptFailure.fileType),
    'amount' => const ReceiptException(ReceiptFailure.amount),
    'date' => const ReceiptException(ReceiptFailure.date),
    'group' => const ReceiptException(ReceiptFailure.group),
    'notStudent' || 'unauthorized' => const ReceiptException(ReceiptFailure.notStudent),
    'not_configured' => const ReceiptException(ReceiptFailure.unavailable),
    _ => null,
  };

  @override
  String toString() => 'ReceiptException(${failure.name})';
}

/// The file's type, or a [ReceiptException]: empty, over 5 MB, or not a PNG, JPG or PDF.
String checkReceiptFile(Uint8List bytes) {
  if (bytes.isEmpty) throw const ReceiptException(ReceiptFailure.fileEmpty);
  if (bytes.length > receiptMaxBytes) throw const ReceiptException(ReceiptFailure.fileTooLarge);
  final type = sniffReceiptType(bytes);
  if (type == null) throw const ReceiptException(ReceiptFailure.fileType);
  return type;
}

/// A file the person chose for their receipt.
class PickedReceipt {
  const PickedReceipt({required this.name, required this.bytes});

  final String name;
  final Uint8List bytes;
}

/// Where a receipt's file comes from.
enum ReceiptSource { camera, gallery, file }

typedef ReceiptPicker = Future<PickedReceipt?> Function(ReceiptSource source);

/// What the Pay by card page shows.
class PayByCardInfo {
  const PayByCardInfo({
    required this.studentId,
    required this.amountDue,
    required this.instructions,
    this.cardNumber,
    this.cardHolder,
    this.bank,
    this.submitUrl,
  });

  final String studentId;

  /// "8600123456789012"; null when the centre has not set a card.
  final String? cardNumber;
  final String? cardHolder;
  final String? bank;

  /// The centre's own instructions, by language; a language may be missing.
  final Map<String, String> instructions;

  /// What the student owes, in whole soʻm; 0 when nothing.
  final int amountDue;

  /// Where a receipt is sent to be checked; null when receipts cannot be sent.
  final String? submitUrl;

  /// A card to pay to, and somewhere to send the receipt.
  bool get available => cardNumber != null && cardNumber!.isNotEmpty && submitUrl != null;

  factory PayByCardInfo.fromJson(Map<String, dynamic> json) {
    final card = json['card'] is Map ? Map<String, dynamic>.from(json['card'] as Map) : const <String, dynamic>{};
    final instructions = json['instructions'] is Map ? Map<String, dynamic>.from(json['instructions'] as Map) : const <String, dynamic>{};
    String? text(Object? value) => value is String && value.trim().isNotEmpty ? value.trim() : null;
    return PayByCardInfo(
      studentId: '${json['student_id']}',
      cardNumber: text(card['number']),
      cardHolder: text(card['holder']),
      bank: text(card['bank']),
      instructions: {
        for (final entry in instructions.entries)
          if (text(entry.value) != null) entry.key: text(entry.value)!,
      },
      amountDue: (json['amount_due'] as num?)?.toInt() ?? 0,
      submitUrl: text(json['submit_url']),
    );
  }
}

enum ReceiptStatus { pending, approved, rejected }

/// One receipt the student sent.
class Receipt {
  const Receipt({required this.id, required this.amount, required this.paidOn, required this.status, required this.createdAt, this.rejectReason});

  final String id;
  final int amount;

  /// The day the student paid, as a calendar day.
  final DateTime paidOn;
  final ReceiptStatus status;
  final String? rejectReason;
  final DateTime createdAt;

  factory Receipt.fromJson(Map<String, dynamic> json) => Receipt(
    id: '${json['id']}',
    amount: (json['amount'] as num).toInt(),
    paidOn: DateTime.parse('${json['paid_on']}T00:00:00Z'),
    status: ReceiptStatus.values.firstWhere((status) => status.name == json['status'], orElse: () => ReceiptStatus.pending),
    rejectReason: json['reject_reason'] as String?,
    createdAt: DateTime.parse(json['created_at'] as String).toUtc(),
  );
}

/// What the student fills in before sending.
class ReceiptDraft {
  const ReceiptDraft({required this.amount, required this.paidOn, required this.file, this.groupId, this.comment});

  final int amount;

  /// "2026-11-24"
  final String paidOn;
  final PickedReceipt file;
  final String? groupId;
  final String? comment;
}

abstract class ReceiptRepository {
  Future<PayByCardInfo> payInfo();

  /// The student's own receipts, the newest first.
  Future<List<Receipt>> receipts();

  /// Sends a receipt. Throws [ReceiptException] when it is refused.
  Future<void> submit(PayByCardInfo info, ReceiptDraft draft);
}

class SupabaseReceiptRepository implements ReceiptRepository {
  SupabaseReceiptRepository(this._client, {http.Client? httpClient}) : _http = httpClient ?? http.Client();

  final SupabaseClient _client;
  final http.Client _http;

  @override
  Future<PayByCardInfo> payInfo() => reachServer(() async => PayByCardInfo.fromJson(Map<String, dynamic>.from(await _client.rpc('pay_by_card_info') as Map)));

  @override
  Future<List<Receipt>> receipts() => reachServer(() async {
    // Row level security returns the student's own receipts only.
    final rows = await _client
        .from('payment_receipts')
        .select('id, amount, paid_on, status, reject_reason, created_at')
        .order('created_at', ascending: false)
        .limit(100);
    return [for (final row in rows) Receipt.fromJson(row)];
  });

  @override
  Future<void> submit(PayByCardInfo info, ReceiptDraft draft) => reachServer(() async {
    final url = info.submitUrl;
    final token = _client.auth.currentSession?.accessToken;
    if (url == null || token == null) throw const ReceiptException(ReceiptFailure.unavailable);
    final type = checkReceiptFile(draft.file.bytes);

    // The file first, into the student's own folder of the private bucket …
    final random = Random.secure();
    final name = [for (var i = 0; i < 16; i++) random.nextInt(256).toRadixString(16).padLeft(2, '0')].join();
    final path = '${info.studentId}/$name.$type';
    await _client.storage
        .from('receipts')
        .uploadBinary(path, draft.file.bytes, fileOptions: FileOptions(contentType: {'png': 'image/png', 'jpg': 'image/jpeg', 'pdf': 'application/pdf'}[type]));

    // … then the centre's server reads it, checks it, and writes the receipt.
    final response = await _http.post(
      Uri.parse(url),
      headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
      body: jsonEncode({'path': path, 'amount': draft.amount, 'paid_on': draft.paidOn, 'group_id': draft.groupId, 'comment': draft.comment}),
    );
    if (response.statusCode == 201) return;
    String? error;
    try {
      error = (jsonDecode(response.body) as Map)['error'] as String?;
    } catch (_) {
      error = null;
    }
    throw ReceiptException.fromServer(error) ?? StateError('receipt refused: ${response.statusCode}');
  });
}
