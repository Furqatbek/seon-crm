import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/more_state.dart';
import '../../core/state.dart';
import '../../data/models.dart';
import '../../l10n/app_localizations.dart';
import '../../ui/tokens.dart';
import '../auth/linked_screen.dart' show privacyPolicyProvider;
import '../auth/welcome_screen.dart' show languageName;
import 'more_tab.dart' show themeName;
import 'sub_page.dart';

/// Language: the four languages, each in its own name. The app switches at once.
class LanguagePage extends ConsumerWidget {
  const LanguagePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final current = ref.watch(settingsProvider).language;
    return SubPage(
      title: l.language,
      grouped: true,
      child: ListView(
        children: [
          RowGroup(
            children: [
              for (final code in supportedLanguages)
                ListRow(
                  icon: Icons.language,
                  label: languageName(l, code),
                  selected: code == current,
                  onTap: () => ref.read(settingsProvider.notifier).setLanguage(code),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Appearance: follow the phone, or force Light or Dark. Saved to the profile.
class AppearancePage extends ConsumerWidget {
  const AppearancePage({super.key});

  static const _icons = {'system': Icons.brightness_auto_outlined, 'light': Icons.light_mode_outlined, 'dark': Icons.dark_mode_outlined};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final current = ref.watch(settingsProvider).theme;
    return SubPage(
      title: l.appearance,
      grouped: true,
      child: ListView(
        children: [
          RowGroup(
            children: [
              for (final theme in supportedThemes)
                ListRow(
                  icon: _icons[theme]!,
                  label: themeName(l, theme),
                  selected: theme == current,
                  onTap: () => ref.read(settingsProvider.notifier).setTheme(theme),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A text the owner writes in the CRM's settings: the privacy policy, or About the centre.
class CentreTextPage extends ConsumerWidget {
  const CentreTextPage({super.key, required this.about});

  /// About the centre; otherwise the privacy policy.
  final bool about;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final provider = about ? aboutProvider : privacyPolicyProvider;
    // Nothing written reads as an empty text, so it is told apart from "still loading".
    final text = ref.watch(provider).whenData((value) => value ?? '');
    return SubPage(
      title: about ? l.aboutCentre : l.privacyPolicy,
      child: AsyncList<String>(
        value: text,
        onRefresh: () => ref.refresh(provider.future).then((_) {}, onError: (_) {}),
        emptyIcon: about ? Icons.info_outline : Icons.description_outlined,
        emptyTitle: about ? l.aboutEmpty : l.privacyEmpty,
        isEmpty: (value) => value.trim().isEmpty,
        builder: (value) => SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: AppSpacing.x8),
          child: Text(value, style: AppType.body.copyWith(color: c.text)),
        ),
      ),
    );
  }
}
