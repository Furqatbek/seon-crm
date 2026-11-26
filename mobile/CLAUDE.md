# Student app (Flutter)

Student app for the Edu CRM, in the same repo. Spec: ../docs/STUDENT_APP_SPEC.md.
Approved designs: ../docs/design/student-app/ (light and dark). Same Supabase project as
the CRM: never bypass RLS and never put a service or secret key in the app.

## Stack
- Flutter stable, Dart 3, iOS and Android only
- supabase_flutter (auth, data, realtime, RPC), flutter_riverpod, go_router
- flutter_localizations + gen-l10n: lib/l10n/app_uz.arb, app_ru.arb, app_en.arb, app_ko.arb
- qr_flutter, flutter_secure_storage, firebase_messaging, cached_network_image,
  image_picker, just_audio (exam listening)

## Commands
- flutter pub get | dart format . | flutter analyze | flutter test
- flutter test integration_test
- flutter run --dart-define-from-file=env/dev.json

## Rules
- IMPORTANT: build only what the spec lists. Match the approved design for looks; the
  spec wins for behaviour. List any conflict before coding.
- Colours, radii, spacing and type only from lib/ui/tokens.dart (light and dark).
- Every visible string goes into all four ARB files in the same change.
- Money is int soʻm, coins are int; display through formatMoney() / formatCoins().
- Results, coins, exam scores, QR checks, vouchers and leaderboards are decided by the
  server. The app only shows state and sends the user's taps.
- Every tab has a Student and an App user version, chosen from the profile role.
- Only SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY come in through --dart-define.
- Screens in lib/features/<feature>/, shared widgets in lib/ui/, data access in
  lib/data/ repositories.
- Accessibility: semantic labels, text scaling to 200% without overflow, tap targets
  at least 44 pt, 4.5:1 contrast in both themes.

## Done means
analyze is clean, tests pass, and golden screenshots at 390×844 and 412×915, in light
and dark, in uz, ru, en and ko, match the approved designs.
