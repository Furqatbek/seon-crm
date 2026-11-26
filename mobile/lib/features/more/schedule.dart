import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/home_state.dart';
import '../../core/more_state.dart';
import '../../core/time.dart';
import '../../data/more.dart';
import '../../l10n/app_localizations.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import 'sub_page.dart';

/// "16–22 noyabr", or "30-noyabr – 6-dekabr" across two months.
String weekTitle(DateTime monday, AppLocalizations l) {
  final sunday = monday.add(const Duration(days: 6));
  if (monday.month == sunday.month) return l.weekInMonth(monday.day, sunday.day, l.months.split(',')[monday.month - 1]);
  return l.weekRange(dayMonth(monday, l), dayMonth(sunday, l));
}

/// 15: the week, Monday first, in Tashkent time. Exams are highlighted and a
/// cancelled lesson is struck through.
class SchedulePage extends ConsumerStatefulWidget {
  const SchedulePage({super.key});

  @override
  ConsumerState<SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends ConsumerState<SchedulePage> {
  /// Weeks from the current one.
  int _offset = 0;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final today = tashkentDay(ref.watch(clockProvider)());
    final monday = weekStartOf(today).add(Duration(days: 7 * _offset));
    final week = ref.watch(scheduleProvider(monday));
    final lessons = week.value ?? const <ScheduleLesson>[];
    final days = [for (var i = 0; i < 7; i++) monday.add(Duration(days: i))];
    final shortNames = l.weekdaysShort.split(',');

    Widget arrow(IconData icon, String label, VoidCallback onTap) => Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          width: AppSizes.roundButton,
          height: AppSizes.roundButton,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: c.border, width: AppSizes.hairline),
          ),
          child: ExcludeSemantics(
            child: Icon(icon, color: c.primary, size: AppSizes.icon),
          ),
        ),
      ),
    );

    return SubPage(
      title: l.schedule,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              arrow(Icons.chevron_left, l.previousWeek, () => setState(() => _offset -= 1)),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    weekTitle(monday, l),
                    textAlign: TextAlign.center,
                    style: AppType.headline.copyWith(color: c.text),
                  ),
                ),
              ),
              arrow(Icons.chevron_right, l.nextWeek, () => setState(() => _offset += 1)),
            ],
          ),
          const SizedBox(height: AppSpacing.x3),
          // The seven days: today filled, a dot under a day with lessons.
          ExcludeSemantics(
            child: MediaQuery.withClampedTextScaling(
              maxScaleFactor: 1.3,
              child: Row(
                children: [
                  for (final (index, day) in days.indexed)
                    Expanded(
                      child: _DayCell(
                        name: shortNames[index],
                        day: day,
                        today: day == today,
                        // Violet when something is on; grey when everything that day is cancelled.
                        dot: lessons.any((lesson) => lesson.day == day && !lesson.cancelled)
                            ? c.primary
                            : (lessons.any((lesson) => lesson.day == day) ? c.border : null),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.x2),
          Expanded(
            child: AsyncList<List<ScheduleLesson>>(
              value: week,
              onRefresh: () => ref.refresh(scheduleProvider(monday).future).then((_) {}, onError: (_) {}),
              emptyIcon: Icons.calendar_today_outlined,
              emptyTitle: l.noLessonsThisWeek,
              builder: (lessons) => ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.only(bottom: AppSpacing.x8),
                children: [
                  for (final day in days)
                    if (lessons.any((lesson) => lesson.day == day)) ...[
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.x3, bottom: AppSpacing.x2),
                        child: Row(
                          children: [
                            Expanded(
                              child: Semantics(
                                header: true,
                                child: Text.rich(
                                  TextSpan(
                                    style: AppType.footnote.copyWith(color: c.textSecondary, fontWeight: FontWeight.w600),
                                    children: [
                                      TextSpan(text: l.dayWithDate(weekdayName(day, l), dayMonth(day, l))),
                                      if (day == today)
                                        TextSpan(
                                          text: ' · ${l.today}',
                                          style: TextStyle(color: c.primary),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            if (lessons.where((lesson) => lesson.day == day).every((lesson) => lesson.cancelled)) Pill(label: l.cancelled),
                          ],
                        ),
                      ),
                      for (final lesson in lessons.where((lesson) => lesson.day == day))
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.x2),
                          child: LessonTile(lesson: lesson),
                        ),
                    ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.name, required this.day, required this.today, required this.dot});

  final String name;
  final DateTime day;
  final bool today;
  final Color? dot;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Column(
      children: [
        Text(
          name,
          style: AppType.caption.copyWith(color: today ? c.primary : c.textSecondary, fontWeight: today ? FontWeight.w600 : FontWeight.w400),
        ),
        const SizedBox(height: AppSpacing.x1),
        Container(
          width: AppSpacing.x10,
          height: AppSpacing.x10,
          alignment: Alignment.center,
          decoration: today ? BoxDecoration(color: c.primaryFill, shape: BoxShape.circle) : null,
          child: Text('${day.day}', style: AppType.tabular(AppType.headline).copyWith(color: today ? c.onPrimaryFill : c.text)),
        ),
        const SizedBox(height: AppSpacing.x1),
        Container(
          width: AppSpacing.x1,
          height: AppSpacing.x1,
          decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
        ),
      ],
    );
  }
}

/// One lesson of the week: when, which group, where and with whom.
class LessonTile extends StatelessWidget {
  const LessonTile({super.key, required this.lesson});

  final ScheduleLesson lesson;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final struck = lesson.cancelled ? TextDecoration.lineThrough : null;
    final place = [if (lesson.room != null) l.roomNumber(lesson.room!), if (lesson.teacher != null) lesson.teacher!].join(' · ');
    final title = lesson.isExam ? (lesson.examTitle ?? l.exam) : lesson.groupName;
    final faded = lesson.cancelled ? c.textSecondary : c.text;
    return Semantics(
      container: true,
      label: lesson.cancelled ? l.cancelled : (lesson.isExam ? l.exam : null),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.x4),
        decoration: BoxDecoration(
          // An exam stands out on the violet wash.
          color: lesson.isExam && !lesson.cancelled ? c.primaryTint : c.bg,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: lesson.isExam && !lesson.cancelled ? null : Border.all(color: c.border, width: AppSizes.hairline),
        ),
        child: Row(
          children: [
            Text(
              l.timeRange(lesson.startsAt, lesson.endsAt),
              style: AppType.tabular(AppType.body).copyWith(color: faded, fontWeight: FontWeight.w600, decoration: struck),
            ),
            const SizedBox(width: AppSpacing.x4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: AppType.body.copyWith(color: faded, fontWeight: FontWeight.w600, decoration: struck),
                  ),
                  if (place.isNotEmpty)
                    Text(
                      place,
                      style: AppType.footnote.copyWith(color: c.textSecondary, decoration: struck),
                    ),
                ],
              ),
            ),
            if (lesson.isExam && !lesson.cancelled) ...[const SizedBox(width: AppSpacing.x2), Pill(label: l.exam, tone: PillTone.primary, outlined: true)],
          ],
        ),
      ),
    );
  }
}
