import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/format.dart';
import '../../core/home_state.dart';
import '../../core/more_state.dart';
import '../../core/time.dart';
import '../../data/home.dart';
import '../../data/more.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import 'sub_page.dart';

/// "+600 000 soʻm" for money in, "−600 000 soʻm" for a fee.
String signedMoney(int amount, AppLocalizations l) => amount > 0 ? '+${formatMoney(amount, l)}' : formatMoney(amount, l);

/// 16a: the balance, then every payment and charge by month.
class PaymentsPage extends ConsumerWidget {
  const PaymentsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final home = ref.watch(studentHomeProvider).home;
    final ledger = ref.watch(ledgerProvider);
    final monthNames = l.monthsNominative.split(',');

    return SubPage(
      title: l.payments,
      child: AsyncList<List<LedgerEntry>>(
        value: ledger,
        onRefresh: () async {
          await Future.wait([ref.read(studentHomeProvider.notifier).refresh(), ref.refresh(ledgerProvider.future).then((_) {}, onError: (_) {})]);
        },
        emptyIcon: Icons.account_balance_wallet_outlined,
        emptyTitle: l.paymentsEmpty,
        // The balance and the ways to pay are shown even before the first payment.
        isEmpty: (_) => false,
        builder: (entries) {
          final months = <DateTime>[];
          for (final entry in entries) {
            if (!months.contains(entry.month)) months.add(entry.month);
          }
          months.sort((a, b) => b.compareTo(a));
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: AppSpacing.x8),
            children: [
              if (home != null) BalanceCard(home: home),
              const SizedBox(height: AppSpacing.x3),
              // Transfer to the centre's card and send the receipt; what was sent, and the answers.
              PrimaryButton(label: l.payByCard, onPressed: () => context.go(Routes.payByCard)),
              Center(
                child: LinkButton(label: l.myReceipts, onPressed: () => context.go(Routes.myReceipts)),
              ),
              if (entries.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.x6),
                  child: Text(
                    l.paymentsEmpty,
                    textAlign: TextAlign.center,
                    style: AppType.body.copyWith(color: c.textSecondary),
                  ),
                ),
              for (final month in months) ...[
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.x4, bottom: AppSpacing.x1),
                  child: Semantics(
                    header: true,
                    child: Text(
                      monthNames[month.month - 1],
                      style: AppType.footnote.copyWith(color: c.textSecondary, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
                for (final (index, entry) in entries.where((entry) => entry.month == month).indexed) ...[
                  if (index > 0) Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
                  LedgerTile(entry: entry),
                ],
              ],
              const SizedBox(height: AppSpacing.x4),
              Container(
                padding: const EdgeInsets.all(AppSpacing.x4),
                decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(AppRadii.card)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l.payAtReception,
                      style: AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w600),
                    ),
                    Text(l.payAtReceptionHint, style: AppType.footnote.copyWith(color: c.textSecondary)),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// The balance, how it reads today, and when the next payment or the debt is due.
class BalanceCard extends StatelessWidget {
  const BalanceCard({super.key, required this.home});

  final StudentHome home;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final (label, tone, line) = switch (home.balanceState) {
      BalanceState.paid => (l.balancePaid, PillTone.success, l.nextPaymentBy(dayMonth(home.nextPaymentDate, l))),
      BalanceState.due => (l.balanceDue, PillTone.warning, l.balanceDueBy(dayMonth(home.dueDate, l))),
      BalanceState.debt => (l.balanceDebt, PillTone.danger, l.balanceDebtSince(dayMonth(home.dueDate, l))),
    };
    return Container(
      padding: const EdgeInsets.all(AppSpacing.x4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: c.border, width: AppSizes.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l.balance, style: AppType.footnote.copyWith(color: c.textSecondary)),
                    MoneyText(home.balance, style: AppType.title.copyWith(color: c.text)),
                  ],
                ),
              ),
              Pill(label: label, tone: tone),
            ],
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.x3),
            child: Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
          ),
          Text(keepTogether(line), style: AppType.footnote.copyWith(color: c.textSecondary)),
        ],
      ),
    );
  }
}

/// A payment with its receipt number, or a fee with the month it is for.
class LedgerTile extends StatelessWidget {
  const LedgerTile({super.key, required this.entry});

  final LedgerEntry entry;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final date = dayMonth(tashkentDay(entry.at), l);
    final String title;
    final String line;
    if (entry.isPayment) {
      title = l.paymentReceived;
      line = entry.receiptNo == null ? date : l.receiptLine(date, entry.receiptNo.toString().padLeft(4, '0'));
    } else {
      title = entry.isAdjustment || entry.billingMonth == null ? l.adjustment : l.monthFee(l.monthsNominative.split(',')[entry.billingMonth!.month - 1]);
      line = l.chargedLine(date);
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.x3),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppType.body.copyWith(color: c.text)),
                Text(keepTogether(line), style: AppType.footnote.copyWith(color: c.textSecondary)),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.x3),
          Text(
            signedMoney(entry.amount, l),
            style: AppType.tabular(AppType.body).copyWith(color: entry.amount > 0 ? c.success : c.text, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// What a row of the coin history is called: the teacher's or the centre's own
/// words when there are some, otherwise where the coins came from.
String coinTitle(CoinEntry entry, AppLocalizations l) {
  final reason = entry.reason?.trim();
  if (reason != null && reason.isNotEmpty) return reason;
  return switch (entry.source) {
    'attendance' => l.sourceAttendance,
    'perfect_month' => l.sourcePerfectMonth,
    'on_time_payment' => l.sourceOnTime,
    'referral' => l.sourceReferral,
    'teacher_award' => l.sourceTeacherAward,
    'teacher_deduction' => l.sourceTeacherDeduction,
    'reward_hold' => l.sourceRewardHold,
    'reward_return' => l.sourceRewardReturn,
    'game_win' => l.sourceGameWin,
    'exam' => l.sourceExam,
    _ => l.sourceAdjustment,
  };
}

/// "Bugun, 15:20", "Kecha", or the date.
String coinWhen(DateTime at, DateTime now, AppLocalizations l) {
  final days = tashkentDay(now).difference(tashkentDay(at)).inDays;
  if (days <= 0) return l.dayAtTime(l.today, clockTime(at));
  if (days == 1) return l.yesterday;
  return dayMonth(tashkentDay(at), l);
}

/// 16b: the coins now, and every time they were earned or spent.
class CoinHistoryPage extends ConsumerWidget {
  const CoinHistoryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final home = ref.watch(studentHomeProvider).home;
    final history = ref.watch(coinHistoryProvider);
    final now = ref.watch(clockProvider)();

    return SubPage(
      title: l.coinHistory,
      child: AsyncList<List<CoinEntry>>(
        value: history,
        onRefresh: () async {
          await Future.wait([ref.read(studentHomeProvider.notifier).refresh(), ref.refresh(coinHistoryProvider.future).then((_) {}, onError: (_) {})]);
        },
        emptyIcon: Icons.toll_outlined,
        emptyTitle: l.coinHistoryEmpty,
        isEmpty: (_) => false,
        builder: (entries) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: AppSpacing.x8),
          children: [
            if (home != null)
              Container(
                padding: const EdgeInsets.all(AppSpacing.x4),
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
                        decoration: BoxDecoration(color: c.primaryTint, shape: BoxShape.circle),
                        child: Icon(Icons.toll_outlined, color: c.primary, size: AppSizes.icon),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.x4),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CoinsText(home.coins, style: AppType.title.copyWith(color: c.text)),
                          Text(l.coinsThisWeek('${home.coinsWeek}'), style: AppType.footnote.copyWith(color: c.textSecondary)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            if (entries.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.x6),
                child: Text(
                  l.coinHistoryEmpty,
                  textAlign: TextAlign.center,
                  style: AppType.body.copyWith(color: c.textSecondary),
                ),
              ),
            for (final (index, entry) in entries.indexed) ...[
              if (index > 0) Divider(height: AppSizes.hairline, thickness: AppSizes.hairline, color: c.border),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.x3),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(coinTitle(entry, l), style: AppType.body.copyWith(color: c.text)),
                          Text(keepTogether(coinWhen(entry.at, now, l)), style: AppType.footnote.copyWith(color: c.textSecondary)),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppSpacing.x3),
                    Text(
                      entry.delta > 0 ? '+${entry.delta}' : '−${entry.delta.abs()}',
                      style: AppType.tabular(AppType.headline).copyWith(color: entry.delta > 0 ? c.success : c.text),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
