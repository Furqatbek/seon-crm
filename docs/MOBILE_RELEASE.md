# Releasing the student app

How to put the Flutter app in `mobile/` on the App Store and Google Play.
Do the CRM first (docs/DEPLOY.md): the app uses the same Supabase project.

Menu names in the Apple, Google and Firebase consoles change from time to
time. If a label differs, look for the nearest match.

## 1. What you need

| Thing | Where | Cost, time |
|---|---|---|
| Apple Developer Program | developer.apple.com → Enroll | 99 USD a year; an organisation needs a D-U-N-S number and a few days |
| Google Play Console | play.google.com/console → Create account | 25 USD once; identity check takes a few days |
| Firebase project | console.firebase.google.com | Free; used for push only |
| A Mac with Xcode, or Codemagic | section 7 | iOS cannot be built on Windows or Linux |
| A public privacy policy page | section 5 | Both stores ask for a web address |

Enrol as the organisation (the centre), not as a person, so the stores show
the centre's name. A personal Google Play account made after November 2023
must also run a closed test with 12 testers for 14 days before going public;
an organisation account does not.

## 2. Identifiers

| | Value |
|---|---|
| Android application id | `uz.seon.student` |
| iOS bundle id | `uz.seon.student` |
| Version | `version:` in `mobile/pubspec.yaml`, now `1.0.0+1` (name + build number) |
| Minimum system | Android 7.0 (API 24), iOS 15 |

Raise the build number (the part after `+`) for every upload; both stores
refuse a number they have seen.

The name under the icon is "Seon Topik" in Uzbek, Russian and English and
"Seon 토픽" in Korean (`android/app/src/main/res/values*/strings.xml`,
`ios/Runner/*.lproj/InfoPlist.strings`). Change them there if you prefer
another spelling.

The icon and the start screen come from the centre's logo:
`mobile/assets/icon/`. To change them, replace the images (the icon should be
1024 × 1024 without transparency) and run, in `mobile/`:

```bash
dart run flutter_launcher_icons
```

```bash
dart run flutter_native_splash:create
```

The logo file in the repo is 500 × 500, so the icon is slightly soft. If you
have the logo as a vector or a larger image, replace `assets/icon/*.png` with
sharper ones before the first release.

## 3. Keys the app is built with

Only two values go into the app, and both are public:

```json
{
  "SUPABASE_URL": "https://<project>.supabase.co",
  "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_..."
}
```

Save them as `mobile/env/prod.json` (the folder ignores everything but the
example). Never put the service-role or secret key in the app.

### Firebase (push)

1. In the Firebase console create a project, then add an **Android app** with
   the package `uz.seon.student` and an **iOS app** with the bundle id
   `uz.seon.student`.
2. Download `google-services.json` into `mobile/android/app/` and
   `GoogleService-Info.plist` into `mobile/ios/Runner/` (on a Mac, drag it
   into the Runner folder in Xcode so it joins the target). Neither is a
   secret, but they are not in the repo.
3. **APNs for iOS:** developer.apple.com → Certificates, Identifiers &
   Profiles → Keys → **+** → tick *Apple Push Notifications service (APNs)*
   → download the `.p8` file (once only) and note the Key ID and your Team
   ID. In Firebase → Project settings → Cloud Messaging → your iOS app →
   *APNs Authentication Key* → upload the `.p8` with both ids.
4. In Xcode → Runner → Signing & Capabilities add **Push Notifications** and
   **Background Modes → Remote notifications**.
5. For the CRM to send pushes: Firebase → Project settings → Service
   accounts → *Generate new private key*. Put the whole JSON, on one line,
   in Vercel as `FIREBASE_SERVICE_ACCOUNT` and redeploy. This one is a secret.

Without the Firebase files the app builds and works; only push is off.

### Store links in the CRM

After the app is published, put its two addresses in Vercel as
`APP_STORE_URL` and `GOOGLE_PLAY_URL` and redeploy. The "Send app invite"
SMS uses them.

## 4. Signing

### Android

Make the upload key once and keep it and its passwords somewhere safe
(a password manager and a second copy). It is never committed.

```bash
keytool -genkey -v -keystore ~/seon-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Then create `mobile/android/key.properties`:

```properties
storeFile=/absolute/path/to/seon-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

With that file a release build is signed with your key. Without it the build
is signed with the debug key: it installs on a phone, but Google Play refuses
it. On the first upload accept **Play App Signing**: Google keeps the real
signing key, and a lost upload key can be replaced through support.

### iOS

In Xcode → Runner → Signing & Capabilities choose your team and leave
*Automatically manage signing* on. Xcode makes the certificate and the
profile. For Codemagic see section 7.

## 5. Privacy policy and account deletion

**Privacy policy address.** Both stores need a public web page; the CRM does
not serve one. Publish the same text you keep in Settings → About and
Privacy on the centre's website (for example `https://<your-site>/privacy`)
and give that address to both stores. The app shows the text itself from the
Welcome screen and from More → Privacy policy.

**Deleting an account in the app:** More → Delete account → the sheet lists
what is deleted and what the centre keeps → Delete. It happens at once and
signs the person out. Removed: the login and the profile with its photo,
push tokens, notifications, game and exam results, open-lesson
bookings and coins still waiting to be unlocked. Kept by the centre, as its
own business records and no longer tied to any login: the student record
with its attendance, charges, payments, receipts and the coins the centre
has awarded. Say the same in the privacy policy.

Google Play also asks for a web address where a person can ask for deletion
without the app. Add a short paragraph to the privacy page: "To delete your
account open the app → More → Delete account, or write to <the centre's
email or Telegram>", and give that page's address.

## 6. What the app collects (store forms)

These answers describe what the app really does. It has no advertising, no
analytics and no tracking, and shares nothing with other companies. Data is
sent over HTTPS to the centre's Supabase project and, for push, a device
token goes to Firebase Cloud Messaging.

| Data | Why | Required |
|---|---|---|
| Phone number | Sign-in, SMS code, linking the account to the student record | Yes |
| Name | Shown in the app, on leaderboards and to staff | Yes |
| Korean level, interface language | Choosing questions and exams; the language of messages | Yes |
| Profile photo | Optional avatar, shown to classmates and staff | No |
| Payment receipts (photo or PDF), amount, date, comment | Sent by a student so staff can confirm a card transfer | No |
| Exam answers and results, game answers and results | Scores, coins, leaderboards | Yes, when used |
| Coins, shop orders, open-lesson bookings, vouchers | The app's own features | Yes, when used |
| Attendance, schedule, balance, charges and payments | Shown to a linked student from the centre's records | — (not collected by the app) |
| Push token | Notifications | No |

The camera and the photo library are opened only when the person chooses a
profile photo or a receipt. The app does not read contacts, location, or
anything in the background. Card numbers are never entered in the app: the
student pays in their bank's app and sends the receipt.

### Google Play → Data safety

- Does the app collect or share user data? **Yes, collects; shares: No.**
- Encrypted in transit: **Yes.** Can users ask for deletion: **Yes** (in the app).
- Data types, all *collected*, *not shared*, purpose **App functionality**
  (and **Account management** for the first two):
  - Personal info → **Name**, **Phone number** (required)
  - Photos and videos → **Photos** (optional: avatar, receipts)
  - Files and docs → **Files and docs** (optional: a PDF receipt)
  - Financial info → **Purchase history** (charges and payments shown to the
    student) and **Other financial info** (receipts) (optional)
  - App activity → **Other user-generated content** (exam and game answers),
    **Other actions** (orders, bookings)
  - Device or other IDs → **Device or other IDs** (push token; optional)
- Target audience: 13 and older (the app has no content for small children;
  parents use the Telegram bot). Ads: **No**.
- Content rating questionnaire: Education; no violence, no user-to-user
  chat, no purchases. Players see each other's name and photo only.

### App Store → App Privacy

Answer "Yes, we collect data", then for each type choose **App
Functionality**, **Linked to the user**, **Not used for tracking**:

- Contact Info → **Phone Number**, **Name**
- User Content → **Photos or Videos** (avatar, receipts), **Other User
  Content** (exam and game answers)
- Financial Info → **Other Financial Info** (receipts, balance)
- Identifiers → **User ID**, **Device ID** (push token)
- Usage Data → **Product Interaction** (orders, bookings)

Other App Store answers: the app uses only standard HTTPS encryption (export
compliance: exempt; `ITSAppUsesNonExemptEncryption = NO` can be added to
`Info.plist` to skip the question on each upload). No in-app purchases:
coins are earned, never bought, and tuition is paid to the centre outside
the app, which Apple allows for real-world services such as classes.

## 7. Building

Before every build, in `mobile/`:

```bash
flutter pub get
```

```bash
flutter analyze
```

```bash
flutter test
```

### Android (any computer)

Needs Java 17 or later and the Android SDK (Android Studio installs both).

```bash
flutter build appbundle --release --dart-define-from-file=env/prod.json
```

The bundle is `build/app/outputs/bundle/release/app-release.aab`.

### iOS on a Mac

Needs Xcode. CocoaPods is not needed: the plugins come through Swift Package
Manager.

```bash
flutter build ipa --release --dart-define-from-file=env/prod.json
```

The archive is in `build/ios/archive/` and the file to upload in
`build/ios/ipa/`. Upload it with the **Transporter** app from the Mac App
Store, or open the archive in Xcode → Organizer → Distribute App.

The first time, open `ios/Runner.xcworkspace` in Xcode once to pick the
team (section 4) and check that the four `InfoPlist.strings` files (uz, ru,
en, ko) appear under Runner. They were added to the project file by hand
on Linux, where Xcode could not confirm it.

### iOS without a Mac: Codemagic

1. codemagic.io → sign in with GitHub → add this repository → Flutter App,
   project path `mobile`.
2. Team settings → Integrations → **App Store Connect**: add an API key
   (App Store Connect → Users and Access → Integrations → App Store Connect
   API → generate a key with the *App Manager* role; upload the `.p8`, the
   Key ID and the Issuer ID).
3. Workflow → Distribution → iOS code signing → **Automatic**, bundle id
   `uz.seon.student`, profile type *App Store*.
4. Environment variables: add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`,
   and, as secure files or base64 variables, `GoogleService-Info.plist`
   (write it to `mobile/ios/Runner/` in a pre-build script).
5. Build arguments for iOS:
   `--release --dart-define=SUPABASE_URL=$SUPABASE_URL --dart-define=SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY`
6. Distribution → App Store Connect → tick *Submit to TestFlight*. Start
   the build; the result appears in App Store Connect → TestFlight.

The free plan's build minutes are enough for a release a month.

## 8. Demo logins for the reviewers

Both stores sign in to check the app. They cannot receive the SMS code, so
they need accounts that already exist.

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -v password='<choose one>' -f supabase/demo/store_review.sql
```

(`SUPABASE_DB_URL` is the connection string from Supabase → Connect.)

| Account | Phone | Password | What the reviewer sees |
|---|---|---|---|
| Linked student | +998 90 000 01 01 | the one you chose | Group "Demo · TOPIK I" with lessons, attendance, coins, a shop order, a finished game and a mock exam result, the QR code, Payments |
| App user | +998 90 000 01 02 | the same | The guest version: a voucher, a booked open lesson, the shop to browse, the locked QR tab |

Give these to the stores:

- **App Store Connect** → the version → App Review Information → *Sign-in
  required*: the student's phone and password; put the second account and
  this note in *Notes*: "Sign in with phone and password (Log in on the
  first screen). New sign-ups need an SMS code sent to Uzbek numbers only.
  The student account is linked to a demo group; the second account is a
  guest without a group. Account deletion: More → Delete account."
- **Google Play Console** → App content → App access → *All or some
  functionality is restricted* → add both logins with the same note.

Things to know:

- The script needs, in the centre's own data: at least 10 active questions
  (for the game), one published mock exam, one active reward of 100 coins or
  less without sizes, and one active open lesson for TOPIK I. It says which
  part it skipped when one is missing.
- It adds a teacher "Demo Teacher" without a pay rate, a group with a fee of
  0 soʻm and a student "Demo Student". They cost nothing and pay nothing, so
  finance and salary reports do not change, but they appear in the lists.
  Archive them when the reviews are over.
- Run it again before each submission: it sets the password again, renews
  the voucher (60 days) and books the next open lesson.
- A reviewer may press Delete account. Run the script again afterwards.
- Do not share the password anywhere but the two store forms.

## 9. Screenshots

Take them from the release build signed in as the demo student (and the
guest for the two guest screens), in English, light theme, plus two in
dark. The numbers are the design frames in `docs/design/student-app/`.

| # | Screen | Design | Account |
|---|---|---|---|
| 1 | Home: next lesson, rank, coins, balance | 02a (dark: 26) | Student |
| 2 | Game lobby | 04 | Student |
| 3 | A match question with the rope | 06a | Student |
| 4 | Mock exams list | 20a | Student |
| 5 | Exam, reading question | 22a | Student |
| 6 | Exam result | 23a | Student |
| 7 | QR check-in | 08a | Student |
| 8 | Shop | 09a | Student |
| 9 | Leaderboard | 14a | Student |
| 10 | Payments and Pay by card | 16a, 25a | Student |
| 11 | Guest Home with the voucher, Open lessons | 02d, 24a, 24b | App user |

Sizes: App Store needs 6.9-inch iPhone shots (1320 × 2868 or 1290 × 2796);
it scales them for smaller phones. The app is iPhone-only in practice, but
the project still allows iPad, and then Apple asks for 13-inch iPad shots
too: either add them or untick iPad under Runner → General → Supported
Destinations before archiving. Google Play needs 2 to 8 phone screenshots
(at least 1080 px on the short side), a 512 × 512 icon
(`mobile/assets/icon/icon.png` scaled down) and a 1024 × 500 feature
graphic, which has to be drawn.

## 10. Submitting

### Google Play

1. Play Console → **Create app**: name "Seon Topik", default language,
   App, Free.
2. **App content**: privacy policy address, App access (the demo logins),
   Ads: no, Content rating, Target audience, Data safety (section 6),
   Data deletion address (section 5).
3. **Store listing** in each language you want: short and full description,
   icon, feature graphic, screenshots.
4. **Testing → Internal testing** → Create release → upload
   `app-release.aab` → accept Play App Signing → add your own address as a
   tester and install from the link. Check sign-up with a real SMS, push,
   and a receipt upload.
5. **Production** → Create release → *Add from library* (the same bundle) →
   countries: Uzbekistan (and any others) → Send for review. The first
   review usually takes a few days.

### App Store

1. developer.apple.com → Identifiers → **+** → App ID `uz.seon.student`
   with Push Notifications ticked.
2. App Store Connect → Apps → **+** → New App: iOS, name "Seon Topik",
   bundle id `uz.seon.student`, SKU of your choice.
3. Upload the build (section 7). It appears under TestFlight after
   processing; install it with the TestFlight app and check the same three
   things.
4. On the version page: screenshots, description, keywords, support
   address, privacy policy address; **App Privacy** (section 6); **App
   Review Information** (section 8); age rating; price Free; availability.
5. Select the build → **Add for Review** → Submit. Reviews usually take one
   to three days. If Apple asks how tuition is paid: lessons are a
   real-world service paid to the centre by bank transfer or cash; the app
   only sends a photo of the receipt.

### After approval

Put the two store addresses in Vercel (section 3), send yourself an app
invite from a student's page, and archive the demo records when you no
longer need them.

## 11. What was checked, and what was not

Built and checked on Linux: `flutter analyze`, the widget, golden and
integration tests, and a release Android App Bundle. Not checked there, so
check on the first real build: anything in Xcode (signing, the localized
names, the icon and start screen on iOS, the iOS archive), push on real
phones, the camera and file pickers, audio playback in exams, and the store
consoles themselves.
