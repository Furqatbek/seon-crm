import '../l10n/app_localizations.dart';

// Dates and times as the centre reads them: Tashkent wall-clock (UTC+5, no
// daylight saving), written in the interface language.

const _tashkentOffset = Duration(hours: 5);

/// The Tashkent wall-clock of a moment, as a UTC-flagged DateTime whose
/// fields (year … minute) are the Tashkent ones.
DateTime tashkent(DateTime moment) => moment.toUtc().add(_tashkentOffset);

/// The Tashkent calendar day of a moment.
DateTime tashkentDay(DateTime moment) {
  final local = tashkent(moment);
  return DateTime.utc(local.year, local.month, local.day);
}

/// "18:00"
String clockTime(DateTime moment) {
  final local = tashkent(moment);
  return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

/// "5-dekabr", "5 декабря", "December 5", "12월 5일". `day` is a calendar day.
String dayMonth(DateTime day, AppLocalizations l) => l.dayMonth(day.day, l.months.split(',')[day.month - 1]);

/// "Shanba": 1 = Monday … 7 = Sunday.
String weekdayName(DateTime day, AppLocalizations l) => l.weekdays.split(',')[day.weekday - 1];

/// How a day is named next to today: Today, Tomorrow, the weekday within a
/// week, otherwise the date.
String relativeDay(DateTime moment, DateTime now, AppLocalizations l) {
  final day = tashkentDay(moment);
  final days = day.difference(tashkentDay(now)).inDays;
  if (days == 0) return l.today;
  if (days == 1) return l.tomorrow;
  if (days == -1) return l.yesterday;
  if (days > 1 && days < 7) return weekdayName(day, l);
  return dayMonth(day, l);
}

/// "Bugun, 18:00"
String dayAndTime(DateTime moment, DateTime now, AppLocalizations l) => l.dayAtTime(relativeDay(moment, now, l), clockTime(moment));

/// "2 soat 15 daqiqadan soʻng": how long until something starts.
String countdown(DateTime startsAt, DateTime now, AppLocalizations l) {
  final left = startsAt.difference(now);
  if (left.inSeconds <= 0) return l.startingNow;
  // A started minute counts: 59 seconds away is "in 1 min", not "in 0 min".
  final minutes = (left.inSeconds + 59) ~/ 60;
  if (minutes >= 48 * 60) return l.inDays(minutes ~/ (24 * 60));
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  if (hours == 0) return l.inMinutes(rest);
  return rest == 0 ? l.inHours(hours) : l.inHoursMinutes(hours, rest);
}
