// Golden screenshots of Home (02), notifications (03) and the states (18):
// light and dark, in uz, ru, en and ko, at 390×844 and 412×915, and in Uzbek
// at 200% text size. Compare with docs/design/student-app/.
//   flutter test --update-goldens test/goldens
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:student/app.dart';
import 'package:student/data/home.dart';
import 'package:student/data/models.dart';
import 'package:student/features/home/home_widgets.dart';

import '../support/fakes.dart';
import '../support/harness.dart';

const sizes = {'390x844': Size(390, 844), '412x915': Size(412, 915)};
const themes = ['light', 'dark'];
const languages = ['uz', 'ru', 'en', 'ko'];

class Scene {
  const Scene({
    this.student = true,
    this.home,
    this.appUser = const AppUserHome(lockedCoins: 34),
    this.notifications = false,
    this.items,
    this.hang = false,
    this.offline = false,
  });

  final bool student;
  final Map<String, dynamic>? home;
  final AppUserHome appUser;

  /// Open the notifications list.
  final bool notifications;
  final List<dynamic>? items;
  final bool hang;

  /// Lose the connection after the first load, then pull to refresh.
  final bool offline;
}

final scenes = <String, Scene>{
  '02a_home_student': const Scene(),
  '02b_home_student_debt': Scene(
    home: {
      'groups': [
        {'id': 'g-1', 'name': 'TOPIK II · Kechki'},
        {'id': 'g-2', 'name': 'Matematika · Shanba'},
      ],
      'next': {
        'id': 'l-2',
        'kind': 'exam',
        'exam_title': 'Mock TOPIK II',
        'starts_at': '2026-11-27T05:00:00+00:00',
        'room': '301',
        'teacher': 'Malika Tursunova',
      },
      'next_exam': null,
      'balance': {'amount': -600000, 'oldest_unpaid_month': '2026-11-01', 'due_day': 5},
      'attendance': {'present': 0, 'late': 0, 'absent': 0, 'excused': 0, 'marked': 0, 'rate': null},
    },
  ),
  '02d_home_app_user': const Scene(student: false),
  '02e_home_app_user_voucher': Scene(
    student: false,
    appUser: AppUserHome(
      lockedCoins: 34,
      voucher: HomeVoucher(kind: 'percent', value: 20, expiresAt: DateTime.utc(2026, 12, 7, 10)),
    ),
  ),
  '03_notifications': const Scene(notifications: true),
  '18a_loading': const Scene(hang: true),
  '18b_offline': const Scene(offline: true, home: {'next_exam': null}),
  '18c_notifications_empty': const Scene(notifications: true, items: []),
  '18d_nothing_scheduled': const Scene(home: {'next': null, 'next_exam': null}),
};

Future<void> show(WidgetTester tester, Scene scene, String theme, String language) async {
  final base = scene.student ? studentProfile : appUserProfile;
  final profile = Profile(id: base.id, fullName: base.fullName, role: base.role, language: language, theme: theme, koreanLevel: base.koreanLevel);
  final home = FakeHomeRepository(home: homeJson(scene.home ?? const {}), appUser: scene.appUser)..hang = scene.hang;
  final app = TestApp(
    auth: FakeAuthRepository(signedIn: true, profile: profile),
    home: home,
    notifications: FakeNotificationsRepository(scene.items == null ? sampleNotifications() : [...scene.items!]),
    preferences: {'language': language, 'theme': theme},
  );
  if (scene.hang) {
    await tester.pumpWidget(await app.build());
    await tester.pump();
    await tester.pump();
    return;
  }
  await app.pump(tester);
  if (scene.offline) {
    home.failure = const OfflineException();
    await tester.drag(find.byType(HomeHeader), const Offset(0, 300));
    await tester.pumpAndSettle();
  }
  if (scene.notifications) {
    await tester.tap(find.byType(BellButton));
    await tester.pumpAndSettle();
  }
}

void main() {
  for (final scene in scenes.entries) {
    group(scene.key, () {
      for (final size in sizes.entries) {
        for (final theme in themes) {
          for (final language in languages) {
            testWidgets('${size.key} $theme $language', (tester) async {
              useScreen(tester, size.value);
              await show(tester, scene.value, theme, language);
              expect(tester.takeException(), isNull);
              await expectLater(find.byType(StudentApp), matchesGoldenFile('${scene.key}/${size.key}_${theme}_$language.png'));
              await tester.pumpWidget(const SizedBox());
            });
          }
        }
      }

      // 200% text: nothing is cut or overflows.
      for (final theme in themes) {
        testWidgets('390x844 $theme uz at 200% text', (tester) async {
          useScreen(tester, sizes['390x844']!, textScale: 2);
          await show(tester, scene.value, theme, 'uz');
          expect(tester.takeException(), isNull);
          await expectLater(find.byType(StudentApp), matchesGoldenFile('${scene.key}/390x844_${theme}_uz_text200.png'));
          await tester.pumpWidget(const SizedBox());
        });
      }
    });
  }
}
