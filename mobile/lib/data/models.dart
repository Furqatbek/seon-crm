/// Who is signed in. The app has two kinds of account: a student linked to
/// the centre, and an app user who is not linked yet.
enum AccountRole { student, appUser }

enum KoreanLevel {
  beginner('beginner'),
  topik1('topik1'),
  topik2('topik2');

  const KoreanLevel(this.value);

  /// As the database stores it.
  final String value;

  static KoreanLevel? parse(Object? value) {
    for (final level in values) {
      if (level.value == value) return level;
    }
    return null;
  }
}

/// The languages of the interface. Uzbek is the default.
const supportedLanguages = ['uz', 'ru', 'en', 'ko'];

/// Appearance: follow the phone, or force one theme.
const supportedThemes = ['system', 'light', 'dark'];

class Profile {
  const Profile({
    required this.id,
    required this.fullName,
    required this.role,
    required this.language,
    required this.theme,
    this.koreanLevel,
    this.phone,
    this.avatarPath,
  });

  final String id;
  final String fullName;
  final AccountRole role;

  /// uz, ru, en or ko.
  final String language;

  /// system, light or dark.
  final String theme;
  final KoreanLevel? koreanLevel;

  /// +998XXXXXXXXX
  final String? phone;

  /// The photo's path in the avatars bucket.
  final String? avatarPath;

  /// "AK" for Aziza Karimova: shown until there is a photo.
  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+')).where((part) => part.isNotEmpty).toList();
    if (parts.isEmpty) return '';
    final first = parts.first.substring(0, 1);
    return (parts.length > 1 ? first + parts.last.substring(0, 1) : first).toUpperCase();
  }

  /// From a row of `profiles`. Null for an account that is not the app's
  /// (staff, a kiosk): it has nothing to see here.
  static Profile? fromRow(Map<String, dynamic> row) {
    final role = switch (row['role']) {
      'student' => AccountRole.student,
      'app_user' => AccountRole.appUser,
      _ => null,
    };
    if (role == null) return null;
    final language = row['language'];
    final theme = row['theme'];
    return Profile(
      id: row['id'] as String,
      fullName: (row['full_name'] as String?) ?? '',
      role: role,
      language: supportedLanguages.contains(language) ? language as String : 'uz',
      theme: supportedThemes.contains(theme) ? theme as String : 'system',
      koreanLevel: KoreanLevel.parse(row['korean_level']),
      phone: row['phone'] as String?,
      avatarPath: row['avatar_path'] as String?,
    );
  }
}
