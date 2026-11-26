# Seon Topik Student

The student app for the Edu CRM (`uz.seon.student`), for iOS and Android.
Rules for working on it are in `CLAUDE.md`; what it does is in
`../docs/STUDENT_APP_SPEC.md`.

## Run

1. Copy `env/dev.json.example` to `env/dev.json` and fill in the Supabase
   project's URL and publishable key. Never a service or secret key.
2. `flutter pub get`
3. `flutter run --dart-define-from-file=env/dev.json`

## Push notifications

Push is off until the Firebase files are added; everything else works without them.

- Android: download `google-services.json` for the Android app
  `uz.seon.student` from the Firebase console into `android/app/`.
- iOS: download `GoogleService-Info.plist` for the iOS app `uz.seon.student`
  and add it to the Runner target in Xcode; turn on the Push Notifications
  capability there, and upload the APNs key in the Firebase console.

## Checks

- `dart format .` · `flutter analyze` · `flutter test`
- Screenshots: `flutter test --update-goldens test/goldens` rewrites the
  images in `test/goldens/` after a deliberate change of looks. They are drawn
  with Inter and a Korean test font, on Linux; another system may differ by a
  few pixels.
