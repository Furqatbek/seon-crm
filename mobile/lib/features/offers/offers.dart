import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/format.dart';
import '../../core/home_state.dart';
import '../../core/offer_state.dart';
import '../../core/state.dart';
import '../../core/time.dart';
import '../../data/home.dart';
import '../../data/models.dart';
import '../../data/offers.dart';
import '../../l10n/app_localizations.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../more/sub_page.dart';

/// What a voucher gives, in words.
String voucherOffer(HomeVoucher voucher, AppLocalizations l) => switch (voucher.kind) {
  'percent' => l.voucherPercent(voucher.value),
  'fixed' => l.voucherFixed(formatMoney(voucher.value, l)),
  _ => voucher.value == 7 ? l.voucherTrialWeek : l.voucherTrialDays(voucher.value),
};

/// "11:00–12:30"
String lessonHours(DateTime startsAt, DateTime endsAt) => '${clockTime(startsAt)}–${clockTime(endsAt)}';

/// "Shanba, 28-noyabr"
String lessonDay(DateTime startsAt, AppLocalizations l) {
  final day = tashkentDay(startsAt);
  return l.weekdayAndDate(weekdayName(day, l), dayMonth(day, l));
}

String? _levelLabel(String? level, AppLocalizations l) => switch (level) {
  'beginner' => l.levelBeginner,
  'topik1' => l.levelTopik1,
  'topik2' => l.levelTopik2,
  _ => null,
};

/// "TOPIK I · 101-xona · Malika Tursunova": whatever of the three is known.
String lessonPlace(AppLocalizations l, {String? level, String? room, String? teacher}) =>
    [_levelLabel(level, l), room, teacher].where((part) => part != null && part.trim().isNotEmpty).join(' · ');

/// A voucher's code in a box, with a button that copies it.
class CodeBox extends StatelessWidget {
  const CodeBox({super.key, required this.code, this.dimmed = false});

  final String code;

  /// A code that can no longer be used.
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.maybeOf(context);
    return Container(
      padding: const EdgeInsetsDirectional.only(start: AppSpacing.x4, end: AppSpacing.x1),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppRadii.button)),
      child: Row(
        children: [
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: SelectableText(
                code,
                maxLines: 1,
                style: AppType.tabular(AppType.title.copyWith(color: dimmed ? c.textSecondary : c.text, letterSpacing: 2)),
              ),
            ),
          ),
          Semantics(
            container: true,
            button: true,
            label: l.voucherCopy,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () async {
                await Clipboard.setData(ClipboardData(text: code));
                messenger?.showSnackBar(SnackBar(content: Text(l.voucherCopied)));
              },
              child: SizedBox(
                width: AppSizes.buttonHeight,
                height: AppSizes.buttonHeight,
                child: ExcludeSemantics(
                  child: Icon(Icons.copy_outlined, color: c.primary, size: AppSizes.icon),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 24a: the voucher as a ticket: what it gives, its code, and until when.
class VoucherTicket extends StatelessWidget {
  const VoucherTicket({super.key, required this.voucher});

  final HomeVoucher voucher;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final until = keepTogether(l.validUntil(dayMonth(tashkentDay(voucher.expiresAt), l)));
    final (String headline, String note) = switch (voucher.status) {
      'redeemed' => (l.voucherUsed, voucherOffer(voucher, l)),
      'expired' => (l.voucherExpired, until),
      _ => (until, l.voucherTellCode),
    };
    final ticket = Padding(
      padding: const EdgeInsets.all(AppSpacing.x5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.voucherLabel, style: AppType.footnote.copyWith(color: c.textSecondary)),
          const SizedBox(height: AppSpacing.x1),
          Text(voucherOffer(voucher, l), style: AppType.title.copyWith(color: c.text)),
          const SizedBox(height: AppSpacing.x4),
          CodeBox(code: voucher.code, dimmed: !voucher.usable),
          const SizedBox(height: AppSpacing.x4),
          ExcludeSemantics(child: _Dashes(color: c.border)),
          const SizedBox(height: AppSpacing.x4),
          Text(headline, style: AppType.headline.copyWith(color: voucher.usable ? c.text : c.textSecondary)),
          const SizedBox(height: AppSpacing.x1),
          Text(note, style: AppType.body.copyWith(color: c.textSecondary)),
        ],
      ),
    );
    // The gradient outline is for a voucher that can still be used.
    if (voucher.usable) return GradientOutline(glow: false, child: ticket);
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: c.border, width: AppSizes.hairline),
      ),
      child: ticket,
    );
  }
}

/// The tear line of a ticket.
class _Dashes extends StatelessWidget {
  const _Dashes({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: AppSizes.hairline,
    child: CustomPaint(painter: _DashPainter(color)),
  );
}

class _DashPainter extends CustomPainter {
  const _DashPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = AppSizes.hairline;
    for (var x = 0.0; x < size.width; x += AppSpacing.x2) {
      canvas.drawLine(Offset(x, 0), Offset(x + AppSpacing.x1, 0), paint);
    }
  }

  @override
  bool shouldRepaint(_DashPainter old) => old.color != color;
}

/// 24a: My voucher.
class VoucherPage extends ConsumerWidget {
  const VoucherPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final voucher = ref.watch(voucherProvider);
    final value = voucher.value;
    Future<void> reread() => ref.refresh(voucherProvider.future).then((_) {}, onError: (_) {});

    final Widget body;
    if (value != null) {
      body = RefreshIndicator(
        color: c.primary,
        backgroundColor: c.elevated,
        onRefresh: reread,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: AppSpacing.x8),
          children: [
            VoucherTicket(voucher: value),
            const SizedBox(height: AppSpacing.x4),
            Text(
              l.voucherOnePerPerson,
              textAlign: TextAlign.center,
              style: AppType.footnote.copyWith(color: c.textSecondary),
            ),
          ],
        ),
      );
    } else if (voucher.hasError) {
      body = EmptyState(
        icon: Icons.wifi_off_outlined,
        title: voucher.error is OfflineException ? l.errorNetwork : l.errorGeneric,
        action: SecondaryButton(label: l.retry, onPressed: reread),
      );
    } else if (voucher.isLoading) {
      body = const Align(alignment: Alignment.topCenter, child: Skeleton.card());
    } else {
      // No voucher yet: it comes with the first finished mock exam.
      body = EmptyState(icon: Icons.card_giftcard_outlined, title: l.myVoucher, message: l.voucherEmpty);
    }
    return SubPage(title: l.myVoucher, child: body);
  }
}

String offerError(Object error, AppLocalizations l) => switch (error) {
  OfferException(failure: OfferFailure.full) => l.openLessonErrorFull,
  OfferException(failure: OfferFailure.alreadyBooked) => l.openLessonErrorHasBooking,
  OfferException(failure: OfferFailure.tooLate) => l.openLessonCancelClosed,
  OfferException(failure: OfferFailure.noSuchSession) => l.openLessonErrorGone,
  OfflineException() => l.errorNetwork,
  _ => l.errorGeneric,
};

/// The sessions a level's pill shows: its own, and those for every level.
/// Beginners are shown with TOPIK I, as the mock exams are.
bool _forLevel(String? sessionLevel, bool topik2) => sessionLevel == null || (topik2 ? sessionLevel == 'topik2' : sessionLevel != 'topik2');

/// 24b: the free open lessons of the next four weeks, with the seats left,
/// Book, and the person's own booking with Cancel.
class OpenLessonsPage extends ConsumerStatefulWidget {
  const OpenLessonsPage({super.key});

  @override
  ConsumerState<OpenLessonsPage> createState() => _OpenLessonsPageState();
}

class _OpenLessonsPageState extends ConsumerState<OpenLessonsPage> {
  bool? _topik2;

  /// The session being booked, or the booking being cancelled.
  String? _busy;

  void _reread() {
    ref.invalidate(openLessonsProvider);
    ref.invalidate(appUserHomeProvider);
  }

  Future<void> _book(OpenLessonSession session) async {
    if (_busy != null) return;
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = '${session.slotId}/${session.date}');
    try {
      await ref.read(offerRepositoryProvider).book(session.slotId, session.date);
      if (!mounted) return;
      _reread();
      setState(() => _busy = null);
      await showModalBottomSheet<void>(
        context: context,
        // Over the tab bar, as in the designs.
        useRootNavigator: true,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => BookedSheet(session: session),
      );
    } catch (error) {
      if (!mounted) return;
      // Somebody took the last seat, or the list is out of date: read it again.
      _reread();
      setState(() => _busy = null);
      messenger.showSnackBar(SnackBar(content: Text(offerError(error, l))));
    }
  }

  Future<void> _cancel(OpenLessonBooking booking) async {
    if (_busy != null) return;
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = booking.id);
    try {
      await ref.read(offerRepositoryProvider).cancel(booking.id);
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text(l.openLessonCancelled)));
    } catch (error) {
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text(offerError(error, l))));
    }
    _reread();
    setState(() => _busy = null);
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final lessons = ref.watch(openLessonsProvider);
    final topik2 = _topik2 ?? (ref.watch(authProvider).profile?.koreanLevel == KoreanLevel.topik2);
    final now = ref.watch(clockProvider)();

    return SubPage(
      title: l.openLessonsTitle,
      child: AsyncList<OpenLessons>(
        value: lessons,
        onRefresh: () => ref.refresh(openLessonsProvider.future).then((_) {}, onError: (_) {}),
        emptyIcon: Icons.event_available_outlined,
        emptyTitle: l.openLessonsEmpty,
        isEmpty: (value) => value.sessions.isEmpty && value.booking == null,
        builder: (value) {
          final booking = value.booking;
          final sessions = value.sessions.where((session) => _forLevel(session.level, topik2)).toList();
          final firstOpen = sessions.where((session) => session.seatsLeft > 0).firstOrNull;
          String? day;
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: AppSpacing.x8),
            children: [
              if (booking != null) ...[
                BookingCard(booking: booking, now: now, busy: _busy == booking.id, onCancel: () => _cancel(booking)),
                const SizedBox(height: AppSpacing.x5),
              ],
              Wrap(
                spacing: AppSpacing.x2,
                runSpacing: AppSpacing.x2,
                children: [
                  for (final (value, label) in [(false, l.levelTopik1), (true, l.levelTopik2)])
                    Pill(label: label, outlined: true, selected: value == topik2, onTap: () => setState(() => _topik2 = value)),
                ],
              ),
              if (booking != null) ...[
                const SizedBox(height: AppSpacing.x3),
                Text(l.openLessonOneBooking, style: AppType.footnote.copyWith(color: c.textSecondary)),
              ],
              if (sessions.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.x6),
                  child: Text(l.openLessonsEmpty, style: AppType.body.copyWith(color: c.textSecondary)),
                ),
              for (final session in sessions) ...[
                if (lessonDay(session.startsAt, l) != day) ...[
                  const SizedBox(height: AppSpacing.x5),
                  Semantics(
                    header: true,
                    child: Text(
                      (day = lessonDay(session.startsAt, l)),
                      style: AppType.footnote.copyWith(color: c.textSecondary, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.x2),
                SessionCard(
                  session: session,
                  mine: booking != null && booking.slotId == session.slotId && booking.date == session.date,
                  // The first lesson with a seat is the one put forward.
                  primary: identical(session, firstOpen),
                  busy: _busy == '${session.slotId}/${session.date}',
                  onBook: booking == null && session.seatsLeft > 0 ? () => _book(session) : null,
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// One session: its hours, where and with whom, the seats left, and Book.
class SessionCard extends StatelessWidget {
  const SessionCard({super.key, required this.session, required this.mine, required this.primary, required this.busy, required this.onBook});

  final OpenLessonSession session;

  /// The person's own booking is for this session.
  final bool mine;
  final bool primary;
  final bool busy;
  final VoidCallback? onBook;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final full = session.seatsLeft <= 0;
    final place = lessonPlace(l, level: session.level, room: session.room, teacher: session.teacher);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.x4),
      decoration: BoxDecoration(
        color: full && !mine ? c.surface : null,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: full && !mine ? null : Border.all(color: mine ? c.primary : c.border, width: mine ? AppSizes.outline : AppSizes.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MergeSemantics(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: AppSpacing.x2,
                  runSpacing: AppSpacing.x1,
                  children: [
                    Text(
                      lessonHours(session.startsAt, session.endsAt),
                      style: AppType.tabular(AppType.headline.copyWith(color: full && !mine ? c.textSecondary : c.text)),
                    ),
                    if (mine)
                      Pill(label: l.openLessonYours, tone: PillTone.primary)
                    else if (full)
                      Pill(label: l.openLessonFull, outlined: true)
                    else
                      Pill(label: l.openLessonSeatsLeft(session.seatsLeft), tone: PillTone.success),
                  ],
                ),
                const SizedBox(height: AppSpacing.x1),
                Text(session.title, style: AppType.body.copyWith(color: c.text)),
                if (place.isNotEmpty) Text(place, style: AppType.footnote.copyWith(color: c.textSecondary)),
              ],
            ),
          ),
          if (onBook != null) ...[
            const SizedBox(height: AppSpacing.x3),
            if (primary)
              PrimaryButton(label: l.openLessonBook, busy: busy, onPressed: onBook)
            else
              SecondaryButton(label: l.openLessonBook, onPressed: busy ? null : onBook),
          ],
        ],
      ),
    );
  }
}

/// The person's booking: when and where, and Cancel while it is still allowed.
class BookingCard extends StatelessWidget {
  const BookingCard({super.key, required this.booking, required this.now, this.busy = false, this.onCancel});

  final OpenLessonBooking booking;
  final DateTime now;
  final bool busy;

  /// Null on Home, where the card only leads to the open lessons.
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final place = lessonPlace(l, level: booking.level, room: booking.room, teacher: booking.teacher);
    final canCancel = now.isBefore(booking.cancelUntil);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.x4),
      decoration: BoxDecoration(color: c.primaryTint, borderRadius: BorderRadius.circular(AppRadii.card)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MergeSemantics(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.openLessonYours, style: AppType.footnote.copyWith(color: c.textSecondary)),
                const SizedBox(height: AppSpacing.x1),
                Text(
                  '${lessonDay(booking.startsAt, l)} · ${lessonHours(booking.startsAt, booking.endsAt)}',
                  style: AppType.tabular(AppType.headline.copyWith(color: c.text)),
                ),
                const SizedBox(height: AppSpacing.x1),
                Text(booking.title, style: AppType.body.copyWith(color: c.text)),
                if (place.isNotEmpty) Text(place, style: AppType.footnote.copyWith(color: c.textSecondary)),
              ],
            ),
          ),
          if (onCancel != null) ...[
            const SizedBox(height: AppSpacing.x3),
            if (canCancel) ...[
              SecondaryButton(label: l.openLessonCancel, destructive: true, onPressed: busy ? null : onCancel),
              const SizedBox(height: AppSpacing.x2),
              Text(
                l.openLessonCancelHint,
                textAlign: TextAlign.center,
                style: AppType.footnote.copyWith(color: c.textSecondary),
              ),
            ] else
              Text(l.openLessonCancelClosed, style: AppType.footnote.copyWith(color: c.textSecondary)),
          ],
        ],
      ),
    );
  }
}

/// 24c: the seat is booked: when and where, and until when it can be cancelled.
class BookedSheet extends StatelessWidget {
  const BookedSheet({super.key, required this.session});

  final OpenLessonSession session;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final place = lessonPlace(l, level: session.level, room: session.room, teacher: session.teacher);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: ExcludeSemantics(
                child: Container(
                  width: AppSizes.qrTab,
                  height: AppSizes.qrTab,
                  decoration: BoxDecoration(color: c.primaryFill, shape: BoxShape.circle),
                  child: Icon(Icons.check, color: c.onPrimaryFill, size: AppSizes.icon),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.x3),
            Semantics(
              header: true,
              child: Text(
                l.openLessonBooked,
                textAlign: TextAlign.center,
                style: AppType.title.copyWith(color: c.text),
              ),
            ),
            const SizedBox(height: AppSpacing.x4),
            Container(
              padding: const EdgeInsets.all(AppSpacing.x4),
              decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppRadii.card)),
              child: Column(
                children: [
                  Text(
                    '${lessonDay(session.startsAt, l)} · ${lessonHours(session.startsAt, session.endsAt)}',
                    textAlign: TextAlign.center,
                    style: AppType.tabular(AppType.headline.copyWith(color: c.text)),
                  ),
                  const SizedBox(height: AppSpacing.x1),
                  Text(
                    [session.title, place].where((part) => part.isNotEmpty).join(' · '),
                    textAlign: TextAlign.center,
                    style: AppType.footnote.copyWith(color: c.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.x3),
            Text(
              l.openLessonCancelHint,
              textAlign: TextAlign.center,
              style: AppType.footnote.copyWith(color: c.textSecondary),
            ),
            const SizedBox(height: AppSpacing.x4),
            PrimaryButton(label: l.done, onPressed: () => Navigator.of(context).pop()),
          ],
        ),
      ),
    );
  }
}
