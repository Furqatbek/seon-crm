import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import '../../l10n/app_localizations.dart';
import '../../ui/tokens.dart';

/// "Jasur T." → "JT"
String initialsOf(String? name) =>
    (name ?? '').split(RegExp(r'\s+')).where((part) => part.isNotEmpty).map((part) => part.substring(0, 1)).take(2).join().toUpperCase().replaceAll('.', '');

/// A player's round badge: violet for the player, cyan for the opponent.
class PlayerBadge extends StatelessWidget {
  const PlayerBadge({super.key, required this.initials, required this.mine, this.size = AppSizes.qrTab, this.icon, this.dashed = false});

  final String initials;

  /// The player's own side (violet); otherwise the opponent's (cyan).
  final bool mine;
  final double size;

  /// Shown instead of initials: the computer.
  final IconData? icon;

  /// Nobody there yet.
  final bool dashed;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final ring = dashed ? c.border : (mine ? c.primaryFill : c.accent);
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: dashed ? c.bg : (mine ? c.primaryTint : c.surface),
          shape: BoxShape.circle,
          border: Border.all(color: ring, width: AppSizes.outline),
        ),
        child: icon != null
            ? Icon(icon, color: c.text, size: size * 0.45)
            : Text(
                initials,
                textScaler: TextScaler.noScaling,
                style: (size >= AppSizes.avatar ? AppType.title : AppType.footnote).copyWith(color: c.text, fontWeight: FontWeight.w700),
              ),
      ),
    );
  }
}

/// The rope of the tug of war: eleven places from the player's end (left,
/// violet) to the opponent's (right, cyan). The knot slides one place per step.
class RopeBar extends StatelessWidget {
  const RopeBar({super.key, required this.rope, this.yourLabel, this.opponentLabel});

  /// −5…5, positive on the player's side.
  final int rope;
  final String? yourLabel;
  final String? opponentLabel;

  static const steps = 5;

  /// Where the knot is along the bar, from 0 (the player's end) to 1 (the opponent's).
  static double fractionOf(int rope) => (steps - rope.clamp(-steps, steps)) / (2 * steps);

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    const knot = AppSpacing.x5;
    const height = AppSpacing.x8;
    final color = rope >= 0 ? c.primaryFill : c.accent;
    return Semantics(
      label: l.gameRopeLabel(rope),
      child: ExcludeSemantics(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: height,
              child: LayoutBuilder(
                builder: (context, box) {
                  final track = box.maxWidth - knot;
                  return TweenAnimationBuilder<double>(
                    tween: Tween(end: fractionOf(rope)),
                    duration: const Duration(milliseconds: 350),
                    curve: Curves.easeOutCubic,
                    builder: (context, at, _) {
                      final x = knot / 2 + track * at;
                      final centre = box.maxWidth / 2;
                      return Stack(
                        clipBehavior: Clip.none,
                        children: [
                          // The rope itself.
                          Positioned(
                            left: knot / 2,
                            right: knot / 2,
                            top: height / 2 - AppSpacing.x1 / 2,
                            height: AppSpacing.x1,
                            child: DecoratedBox(
                              decoration: BoxDecoration(color: c.border, borderRadius: BorderRadius.circular(AppRadii.pill)),
                            ),
                          ),
                          // One mark per step.
                          for (var step = 0; step <= 2 * steps; step++)
                            Positioned(
                              left: knot / 2 + track * step / (2 * steps) - AppSizes.hairline,
                              top: step == steps ? 0 : height / 2 + AppSpacing.x1,
                              width: AppSizes.outline,
                              height: step == steps ? height : AppSpacing.x1,
                              child: ColoredBox(
                                color: step == steps
                                    ? c.text
                                    : step == 0
                                    ? c.primaryFill
                                    : step == 2 * steps
                                    ? c.accent
                                    : c.border,
                              ),
                            ),
                          // From the centre to the knot, in the colour of whoever is ahead.
                          Positioned(
                            left: math.min(x, centre),
                            width: (x - centre).abs(),
                            top: height / 2 - AppSpacing.x1 / 2,
                            height: AppSpacing.x1,
                            child: ColoredBox(color: color),
                          ),
                          Positioned(
                            key: const ValueKey('rope-knot'),
                            left: x - knot / 2,
                            top: (height - knot) / 2,
                            width: knot,
                            height: knot,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: c.bg,
                                shape: BoxShape.circle,
                                border: Border.all(color: color, width: AppSpacing.x1),
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  );
                },
              ),
            ),
            if (yourLabel != null || opponentLabel != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.x1),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Flexible(
                      child: Text(
                        yourLabel ?? '',
                        style: AppType.caption.copyWith(color: c.primary, fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.x3),
                    Flexible(
                      child: Text(
                        opponentLabel ?? '',
                        textAlign: TextAlign.end,
                        style: AppType.caption.copyWith(color: c.accentText, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A ring that empties as time runs out, with what is left written inside.
class TimerRing extends StatelessWidget {
  const TimerRing({super.key, required this.fraction, required this.label, this.size = AppSizes.avatar, this.semanticLabel});

  /// How much of the ring is drawn, from 0 to 1.
  final double fraction;
  final String label;
  final double size;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Semantics(
      label: semanticLabel ?? label,
      child: ExcludeSemantics(
        child: SizedBox(
          width: size,
          height: size,
          child: CustomPaint(
            painter: _RingPainter(fraction: fraction.clamp(0.0, 1.0), track: c.surface, from: c.primaryFill, to: c.accent),
            child: Center(
              child: Text(
                label,
                textScaler: TextScaler.noScaling,
                style: AppType.tabular(AppType.title.copyWith(color: c.text)),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({required this.fraction, required this.track, required this.from, required this.to});

  final double fraction;
  final Color track;
  final Color from;
  final Color to;

  @override
  void paint(Canvas canvas, Size size) {
    const width = AppSpacing.x1 + AppSizes.outline;
    final rect = Offset.zero & size;
    final circle = rect.deflate(width / 2);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(circle, 0, 2 * math.pi, false, paint..color = track);
    if (fraction <= 0) return;
    paint.shader = SweepGradient(colors: [to, from, to], transform: const GradientRotation(-math.pi / 2)).createShader(rect);
    canvas.drawArc(circle, -math.pi / 2, 2 * math.pi * fraction, false, paint);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.fraction != fraction || old.track != track || old.from != from || old.to != to;
}

/// "0:42"
String clockOf(Duration time) {
  final seconds = (time.inMilliseconds / 1000).ceil().clamp(0, 5999);
  return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
}
