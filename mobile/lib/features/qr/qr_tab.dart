import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/checkin_state.dart';
import '../../core/home_state.dart';
import '../../core/state.dart';
import '../../core/time.dart';
import '../../data/checkin.dart';
import '../../data/home.dart';
import '../../data/models.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../more/more_tab.dart';

/// 08: the code reception scans. A student's changes every 30 seconds and is
/// made on the phone; an App user sees why there is none and the way in.
class QrTab extends ConsumerWidget {
  const QrTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final auth = ref.watch(authProvider);
    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x4, AppSpacing.page, AppSpacing.x4),
            child: Semantics(
              header: true,
              child: Text(
                l.tabQr,
                textAlign: TextAlign.center,
                style: AppType.headline.copyWith(color: c.text),
              ),
            ),
          ),
          Expanded(
            child: !auth.profileLoaded
                ? const Padding(padding: EdgeInsets.all(AppSpacing.page), child: Skeleton.card())
                : auth.profile?.role == AccountRole.student
                ? const StudentQr()
                : const LockedQr(),
          ),
        ],
      ),
    );
  }
}

/// 08c: check-in is for the centre's students.
class LockedQr extends StatelessWidget {
  const LockedQr({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x6),
      child: Column(
        children: [
          Expanded(
            child: Center(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: AppSizes.avatar,
                      height: AppSizes.avatar,
                      decoration: BoxDecoration(color: c.surface, shape: BoxShape.circle),
                      child: ExcludeSemantics(
                        child: Icon(Icons.lock_outline, color: c.textSecondary, size: AppSizes.icon),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.x6),
                    Text(
                      l.qrLockedTitle,
                      textAlign: TextAlign.center,
                      style: AppType.title.copyWith(color: c.text),
                    ),
                    const SizedBox(height: AppSpacing.x2),
                    Text(
                      l.qrLockedHint,
                      textAlign: TextAlign.center,
                      style: AppType.body.copyWith(color: c.textSecondary),
                    ),
                  ],
                ),
              ),
            ),
          ),
          PrimaryButton(label: l.qrBookFreeLesson, onPressed: () => context.go(Routes.openLessons)),
        ],
      ),
    );
  }
}

/// The code itself: always black on white, whatever the theme, so every scanner reads it.
class QrCodeView extends StatelessWidget {
  const QrCodeView({super.key, required this.data, required this.size});

  /// What the scanner reads.
  final String data;
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
    image: true,
    label: AppLocalizations.of(context).qrCodeLabel,
    child: ExcludeSemantics(
      child: QrImageView(
        data: data,
        size: size,
        padding: const EdgeInsets.all(AppSpacing.x3),
        backgroundColor: AppColors.light.bg,
        eyeStyle: QrEyeStyle(eyeShape: QrEyeShape.square, color: AppColors.light.text),
        dataModuleStyle: QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: AppColors.light.text),
        errorCorrectionLevel: QrErrorCorrectLevel.M,
        gapless: true,
      ),
    ),
  );
}

/// 08a and 08b: the student's code, how long it has left, and today's status.
class StudentQr extends ConsumerStatefulWidget {
  const StudentQr({super.key});

  @override
  ConsumerState<StudentQr> createState() => _StudentQrState();
}

class _StudentQrState extends ConsumerState<StudentQr> {
  Timer? _timer;
  bool _showing = false;
  late ScreenLight _light;

  @override
  void initState() {
    super.initState();
    _light = ref.read(screenLightProvider);
    // The code and its countdown follow the clock.
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _showing) setState(() {});
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // The tab is on screen while its animations may run: the other tabs are kept alive, switched off.
    final showing = TickerMode.valuesOf(context).enabled;
    if (showing == _showing) return;
    _showing = showing;
    if (showing) {
      unawaited(_light.raise());
      // A new password or phone replaced the secret; reception may have just scanned.
      unawaited(
        Future.microtask(() {
          if (!mounted) return;
          unawaited(ref.read(qrIdentityProvider.notifier).refresh());
          ref.invalidate(todayVisitProvider);
        }),
      );
    } else {
      unawaited(_light.restore());
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    if (_showing) unawaited(_light.restore());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final profile = ref.watch(authProvider).profile;
    final identity = ref.watch(qrIdentityProvider);
    final visit = ref.watch(todayVisitProvider).value;
    final now = ref.watch(clockProvider)();
    final data = identity.value;

    if (data == null) {
      if (identity.isLoading) return const Padding(padding: EdgeInsets.all(AppSpacing.page), child: Skeleton.card());
      // Never signed in with a connection on this phone: there is no secret to sign with yet.
      return EmptyState(
        icon: Icons.wifi_off_outlined,
        title: identity.error is OfflineException || identity.error == null ? l.qrNeedsInternet : l.errorGeneric,
        action: SecondaryButton(label: l.retry, onPressed: () => ref.invalidate(qrIdentityProvider)),
      );
    }

    final (statusText, statusTone) = visit == null
        ? (l.qrTodayNone, PillTone.neutral)
        : visit.arrived
        ? (l.qrTodayArrived(clockTime(visit.at)), PillTone.success)
        : (l.qrTodayLeft(clockTime(visit.at)), PillTone.neutral);

    return LayoutBuilder(
      builder: (context, box) {
        final side = (box.maxWidth - 2 * AppSpacing.page - 2 * AppSpacing.x5).clamp(AppSizes.logo, AppSizes.qrMax).toDouble();
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x8),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(AppSpacing.x5),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppRadii.card),
                  border: Border.all(color: c.border, width: AppSizes.hairline),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const ProfileAvatar(size: AppSizes.roundButton),
                        const SizedBox(width: AppSpacing.x3),
                        Flexible(
                          child: Text(profile?.fullName ?? '', style: AppType.headline.copyWith(color: c.text)),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.x4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadii.button),
                      child: QrCodeView(
                        data: qrCode(secret: data.secret, studentId: data.studentId, now: now),
                        size: side,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.x4),
                    // What is left of this code's 30 seconds.
                    ExcludeSemantics(
                      child: SizedBox(
                        width: side,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                          child: Container(
                            height: AppSpacing.x1,
                            color: c.surface,
                            alignment: AlignmentDirectional.centerStart,
                            child: FractionallySizedBox(
                              widthFactor: (1 - qrStepProgress(now)).clamp(0.0, 1.0),
                              child: const DecoratedBox(
                                decoration: BoxDecoration(gradient: appGradient),
                                child: SizedBox.expand(),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.x2),
                    Text(
                      l.qrRotates,
                      textAlign: TextAlign.center,
                      style: AppType.footnote.copyWith(color: c.textSecondary),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.x5),
              Text(
                l.qrShowAtReception,
                textAlign: TextAlign.center,
                style: AppType.headline.copyWith(color: c.text),
              ),
              const SizedBox(height: AppSpacing.x3),
              Semantics(
                liveRegion: true,
                child: Pill(label: statusText, tone: statusTone),
              ),
              const SizedBox(height: AppSpacing.x3),
              Text(
                l.qrWorksOffline,
                textAlign: TextAlign.center,
                style: AppType.footnote.copyWith(color: c.textSecondary),
              ),
            ],
          ),
        );
      },
    );
  }
}
