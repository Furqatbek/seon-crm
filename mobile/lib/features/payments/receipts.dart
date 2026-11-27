import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/home_state.dart';
import '../../core/receipt_state.dart';
import '../../core/time.dart';
import '../../data/home.dart';
import '../../data/receipts.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../auth/auth_widgets.dart';
import '../more/sub_page.dart';

/// "8600123456789012" → "8600 1234 5678 9012"
String groupCard(String digits) => digits.replaceAllMapped(RegExp(r'(\d{4})(?=\d)'), (match) => '${match[1]} ');

/// "1,2 MB", "340 KB": a file's size as people read it.
String fileSize(int bytes, AppLocalizations l) {
  String decimal(double value) => value.toStringAsFixed(1).replaceAll('.', l.localeName == 'en' || l.localeName == 'ko' ? '.' : ',');
  return bytes >= 1024 * 1024 ? l.fileSizeMb(decimal(bytes / (1024 * 1024))) : l.fileSizeKb('${(bytes / 1024).ceil()}');
}

String receiptError(Object error, AppLocalizations l) => switch (error) {
  ReceiptException(failure: ReceiptFailure.fileType || ReceiptFailure.fileEmpty) => l.receiptErrorType,
  ReceiptException(failure: ReceiptFailure.fileTooLarge) => l.receiptErrorTooLarge,
  ReceiptException(failure: ReceiptFailure.amount) => l.receiptErrorAmount,
  ReceiptException(failure: ReceiptFailure.date) => l.receiptErrorDate,
  ReceiptException(failure: ReceiptFailure.group) => l.receiptErrorGroup,
  ReceiptException(failure: ReceiptFailure.unavailable || ReceiptFailure.notStudent) => l.payByCardOff,
  OfflineException() => l.errorNetwork,
  _ => l.errorGeneric,
};

/// Keeps an amount as digits grouped in threes: "600 000".
class MoneyInputFormatter extends TextInputFormatter {
  const MoneyInputFormatter();

  static String group(String digits) {
    final clean = digits.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^0+(?=\d)'), '');
    final out = StringBuffer();
    for (var i = 0; i < clean.length; i++) {
      if (i > 0 && (clean.length - i) % 3 == 0) out.write(' ');
      out.write(clean[i]);
    }
    return out.toString();
  }

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final text = group(newValue.text.length > 13 ? oldValue.text : newValue.text);
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

String _date(DateTime day) => '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
String _shownDate(DateTime day) => '${day.day.toString().padLeft(2, '0')}.${day.month.toString().padLeft(2, '0')}.${day.year}';

/// 25a and 25b: what is due, the centre's card with Copy, the instructions,
/// and the receipt: amount, date, the file and a comment.
class PayByCardPage extends ConsumerStatefulWidget {
  const PayByCardPage({super.key});

  @override
  ConsumerState<PayByCardPage> createState() => _PayByCardPageState();
}

class _PayByCardPageState extends ConsumerState<PayByCardPage> {
  final _amount = TextEditingController();
  final _comment = TextEditingController();
  DateTime? _paidOn;
  String? _groupId;
  PickedReceipt? _file;
  String? _error;
  bool _sending = false;
  bool _prefilled = false;

  @override
  void dispose() {
    _amount.dispose();
    _comment.dispose();
    super.dispose();
  }

  int get _amountValue => int.tryParse(_amount.text.replaceAll(' ', '')) ?? 0;

  Future<void> _choose() async {
    final l = AppLocalizations.of(context);
    final source = await showModalBottomSheet<ReceiptSource>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
          child: RowGroup(
            children: [
              ListRow(icon: Icons.photo_camera_outlined, label: l.receiptFromCamera, onTap: () => Navigator.of(sheet).pop(ReceiptSource.camera)),
              ListRow(icon: Icons.photo_library_outlined, label: l.receiptFromGallery, onTap: () => Navigator.of(sheet).pop(ReceiptSource.gallery)),
              ListRow(icon: Icons.picture_as_pdf_outlined, label: l.receiptFromFile, onTap: () => Navigator.of(sheet).pop(ReceiptSource.file)),
            ],
          ),
        ),
      ),
    );
    if (source == null || !mounted) return;
    try {
      final picked = await ref.read(receiptPickerProvider)(source);
      if (picked == null || !mounted) return;
      // Said at once when the file is not one the centre takes; the server checks again.
      checkReceiptFile(picked.bytes);
      setState(() {
        _file = picked;
        _error = null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = receiptError(error, l));
    }
  }

  Future<void> _pickDate(DateTime today) async {
    final picked = await showDatePicker(context: context, initialDate: _paidOn ?? today, firstDate: today.subtract(const Duration(days: 90)), lastDate: today);
    if (picked != null && mounted) setState(() => _paidOn = DateTime.utc(picked.year, picked.month, picked.day));
  }

  Future<void> _send(PayByCardInfo info, DateTime today) async {
    final l = AppLocalizations.of(context);
    final file = _file;
    if (_sending || file == null) return;
    if (_amountValue <= 0) return setState(() => _error = l.receiptErrorAmount);
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref
          .read(receiptRepositoryProvider)
          .submit(
            info,
            ReceiptDraft(
              amount: _amountValue,
              paidOn: _date(_paidOn ?? today),
              file: file,
              groupId: _groupId,
              comment: _comment.text.trim().isEmpty ? null : _comment.text.trim(),
            ),
          );
      if (!mounted) return;
      ref.invalidate(receiptsProvider);
      messenger.showSnackBar(SnackBar(content: Text(l.receiptSent)));
      // On to My receipts, where it waits for the centre's answer.
      router.pushReplacement(Routes.myReceipts);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = receiptError(error, l);
        // A file the server refused is not offered again.
        if (error is ReceiptException && {ReceiptFailure.fileType, ReceiptFailure.fileTooLarge, ReceiptFailure.fileEmpty}.contains(error.failure)) _file = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final info = ref.watch(payInfoProvider);
    final home = ref.watch(studentHomeProvider).home;
    final today = tashkentDay(ref.watch(clockProvider)());
    final groups = home?.groups ?? const <HomeGroup>[];
    _groupId ??= home?.groupId ?? groups.firstOrNull?.id;

    return SubPage(
      title: l.payByCard,
      home: Routes.payments,
      padded: false,
      child: AsyncList<PayByCardInfo>(
        value: info,
        onRefresh: () => ref.refresh(payInfoProvider.future).then((_) {}, onError: (_) {}),
        emptyIcon: Icons.credit_card_off_outlined,
        emptyTitle: l.payByCardOff,
        isEmpty: (value) => !value.available,
        builder: (value) {
          if (!_prefilled) {
            _prefilled = true;
            // Usually the student pays what they owe.
            if (value.amountDue > 0) _amount.text = MoneyInputFormatter.group('${value.amountDue}');
          }
          final month = home?.oldestUnpaidMonth;
          final instructions = value.instructions[l.localeName] ?? '1. ${l.payStep1}\n2. ${l.payStep2}';
          final file = _file;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
                  children: [
                    MergeSemantics(
                      child: Container(
                        padding: const EdgeInsets.all(AppSpacing.x4),
                        decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppRadii.card)),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(l.amountDue, style: AppType.footnote.copyWith(color: c.textSecondary)),
                                  const SizedBox(height: AppSpacing.x1),
                                  if (value.amountDue > 0)
                                    MoneyText(value.amountDue, style: AppType.title.copyWith(color: c.text))
                                  else
                                    Text(l.nothingDue, style: AppType.headline.copyWith(color: c.text)),
                                ],
                              ),
                            ),
                            if (value.amountDue > 0 && month != null) Pill(label: l.monthsNominative.split(',')[month.month - 1], outlined: true),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.x3),
                    CentreCard(info: value),
                    const SizedBox(height: AppSpacing.x3),
                    Text(instructions, style: AppType.body.copyWith(color: c.textSecondary)),
                    const SizedBox(height: AppSpacing.x4),
                    if (groups.length > 1) ...[
                      LabeledField(
                        label: l.receiptGroup,
                        child: Wrap(
                          spacing: AppSpacing.x2,
                          runSpacing: AppSpacing.x2,
                          children: [
                            for (final group in groups)
                              Pill(label: group.name, outlined: true, selected: group.id == _groupId, onTap: () => setState(() => _groupId = group.id)),
                          ],
                        ),
                      ),
                    ],
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: LabeledField(
                            label: l.receiptAmount,
                            child: AppTextField(
                              controller: _amount,
                              label: l.receiptAmount,
                              keyboardType: TextInputType.number,
                              inputFormatters: const [MoneyInputFormatter()],
                              onChanged: (_) => setState(() => _error = null),
                              suffix: Padding(
                                padding: const EdgeInsetsDirectional.only(end: AppSpacing.x3),
                                child: Center(
                                  widthFactor: 1,
                                  child: Text(l.moneyUnit, style: AppType.body.copyWith(color: c.textSecondary)),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.x3),
                        Expanded(
                          child: LabeledField(
                            label: l.receiptDate,
                            child: Semantics(
                              button: true,
                              label: l.receiptDate,
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () => _pickDate(today),
                                child: Container(
                                  constraints: const BoxConstraints(minHeight: AppSizes.buttonHeight),
                                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4),
                                  alignment: AlignmentDirectional.centerStart,
                                  decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppRadii.field)),
                                  child: Text(_shownDate(_paidOn ?? today), style: AppType.tabular(AppType.body.copyWith(color: c.text))),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (file == null) UploadBox(onTap: _choose) else ChosenFile(file: file, onRemove: () => setState(() => _file = null)),
                    const SizedBox(height: AppSpacing.x3),
                    AppTextField(
                      controller: _comment,
                      label: l.receiptComment,
                      hint: l.receiptComment,
                      textCapitalization: TextCapitalization.sentences,
                      maxLength: 500,
                    ),
                    if (_error != null) ...[const SizedBox(height: AppSpacing.x3), ErrorLine(_error!)],
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
                child: Opacity(
                  opacity: file == null ? AppSizes.disabledOpacity : 1,
                  child: PrimaryButton(label: l.receiptSend, busy: _sending, onPressed: file == null ? null : () => _send(value, today)),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// The centre's card: bank, number, holder, and Copy.
class CentreCard extends StatelessWidget {
  const CentreCard({super.key, required this.info});

  final PayByCardInfo info;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.maybeOf(context);
    final number = info.cardNumber ?? '';
    return GradientOutline(
      glow: false,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.x4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (info.bank != null) Text(info.bank!, style: AppType.footnote.copyWith(color: c.textSecondary)),
            const SizedBox(height: AppSpacing.x2),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: SelectableText(groupCard(number), maxLines: 1, style: AppType.tabular(AppType.title.copyWith(color: c.text))),
            ),
            const SizedBox(height: AppSpacing.x2),
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: AppSpacing.x3,
              runSpacing: AppSpacing.x2,
              children: [
                if (info.cardHolder != null)
                  Text(
                    info.cardHolder!,
                    style: AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w600),
                  ),
                Pill(
                  label: l.cardCopy,
                  tone: PillTone.primary,
                  outlined: true,
                  onTap: () async {
                    await Clipboard.setData(ClipboardData(text: number));
                    messenger?.showSnackBar(SnackBar(content: Text(l.cardCopied)));
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// "Upload receipt": opens the choice of camera, gallery or a PDF file.
class UploadBox extends StatelessWidget {
  const UploadBox({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return Semantics(
      button: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: CustomPaint(
          painter: _DashedBorder(c.border),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.x4),
            child: Row(
              children: [
                ExcludeSemantics(
                  child: Container(
                    width: AppSizes.roundButton,
                    height: AppSizes.roundButton,
                    decoration: BoxDecoration(color: c.primaryTint, shape: BoxShape.circle),
                    child: Icon(Icons.file_upload_outlined, color: c.primary, size: AppSizes.icon),
                  ),
                ),
                const SizedBox(width: AppSpacing.x3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l.receiptUpload, style: AppType.headline.copyWith(color: c.primary)),
                      Text(l.receiptUploadHint, style: AppType.footnote.copyWith(color: c.textSecondary)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DashedBorder extends CustomPainter {
  const _DashedBorder(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = AppSizes.hairline;
    final outline = Path()..addRRect(RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(AppRadii.card)));
    for (final metric in outline.computeMetrics()) {
      for (var at = 0.0; at < metric.length; at += AppSpacing.x2) {
        canvas.drawPath(metric.extractPath(at, at + AppSpacing.x1), paint);
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorder old) => old.color != color;
}

/// 25b: the chosen file with its size, and a button to take it away.
class ChosenFile extends StatelessWidget {
  const ChosenFile({super.key, required this.file, required this.onRemove});

  final PickedReceipt file;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.x3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: c.border, width: AppSizes.hairline),
      ),
      child: Row(
        children: [
          ExcludeSemantics(
            child: Container(
              width: AppSizes.roundButton,
              height: AppSizes.roundButton,
              decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppSpacing.x2)),
              child: Icon(
                sniffReceiptType(file.bytes) == 'pdf' ? Icons.picture_as_pdf_outlined : Icons.image_outlined,
                color: c.textSecondary,
                size: AppSizes.icon,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.x3),
          Expanded(
            child: MergeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    file.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w600),
                  ),
                  Text(fileSize(file.bytes.length, l), style: AppType.tabular(AppType.footnote.copyWith(color: c.textSecondary))),
                ],
              ),
            ),
          ),
          Semantics(
            container: true,
            button: true,
            label: l.receiptRemoveFile,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: onRemove,
              child: Container(
                width: AppSizes.tapTarget,
                height: AppSizes.tapTarget,
                decoration: BoxDecoration(color: c.surface, shape: BoxShape.circle),
                child: ExcludeSemantics(
                  child: Icon(Icons.close, color: c.text, size: AppSpacing.x5),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 25c: every receipt the student sent, with the centre's answer.
class MyReceiptsPage extends ConsumerWidget {
  const MyReceiptsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final receipts = ref.watch(receiptsProvider);
    return SubPage(
      title: l.myReceipts,
      home: Routes.payments,
      child: AsyncList<List<Receipt>>(
        value: receipts,
        onRefresh: () => ref.refresh(receiptsProvider.future).then((_) {}, onError: (_) {}),
        emptyIcon: Icons.receipt_long_outlined,
        emptyTitle: l.receiptsEmpty,
        builder: (list) => ListView.separated(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: AppSpacing.x8),
          itemCount: list.length,
          separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.x3),
          itemBuilder: (_, index) => ReceiptCard(receipt: list[index]),
        ),
      ),
    );
  }
}

/// One receipt: the month paid for, the amount, and where it stands.
class ReceiptCard extends StatelessWidget {
  const ReceiptCard({super.key, required this.receipt});

  final Receipt receipt;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final (String label, PillTone tone) = switch (receipt.status) {
      ReceiptStatus.pending => (l.receiptPending, PillTone.warning),
      ReceiptStatus.approved => (l.receiptApproved, PillTone.success),
      ReceiptStatus.rejected => (l.receiptRejected(receipt.rejectReason ?? ''), PillTone.danger),
    };
    return MergeSemantics(
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.x4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: c.border, width: AppSizes.hairline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: double.infinity,
              child: Wrap(
                alignment: WrapAlignment.spaceBetween,
                spacing: AppSpacing.x3,
                runSpacing: AppSpacing.x1,
                children: [
                  Text(l.monthsNominative.split(',')[receipt.paidOn.month - 1], style: AppType.headline.copyWith(color: c.text)),
                  MoneyText(receipt.amount, style: AppType.headline.copyWith(color: c.text)),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.x1),
            Text(dayMonth(receipt.paidOn, l), style: AppType.footnote.copyWith(color: c.textSecondary)),
            const SizedBox(height: AppSpacing.x3),
            Pill(label: label, tone: tone),
          ],
        ),
      ),
    );
  }
}
