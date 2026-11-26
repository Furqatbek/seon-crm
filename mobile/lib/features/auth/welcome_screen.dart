import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/state.dart';
import '../../data/models.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import 'auth_widgets.dart';

String languageName(AppLocalizations l, String code) => switch (code) {
  'ru' => l.languageRu,
  'en' => l.languageEn,
  'ko' => l.languageKo,
  _ => l.languageUz,
};

/// The four languages on a sheet; choosing one switches the app at once.
Future<void> showLanguageSheet(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: false,
    builder: (sheet) {
      final c = AppColors.of(sheet);
      final l = AppLocalizations.of(sheet);
      final current = ref.read(settingsProvider).language;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.page),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l.chooseLanguage, style: AppType.headline.copyWith(color: c.text)),
              const SizedBox(height: AppSpacing.x2),
              for (final code in supportedLanguages)
                Semantics(
                  button: true,
                  selected: code == current,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () {
                      ref.read(settingsProvider.notifier).setLanguage(code);
                      Navigator.of(sheet).pop();
                    },
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: AppSizes.buttonHeight),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(languageName(l, code), style: AppType.body.copyWith(color: c.text)),
                          ),
                          if (code == current)
                            ExcludeSemantics(
                              child: Icon(Icons.check, color: c.primary, size: AppSizes.icon),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    },
  );
}

/// 01a: the logo, one line about the app, Create account and Sign in.
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final language = ref.watch(settingsProvider).language;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x2, AppSpacing.page, AppSpacing.x4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: Semantics(
                  button: true,
                  label: l.chooseLanguage,
                  value: languageName(l, language),
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => showLanguageSheet(context, ref),
                    child: Container(
                      constraints: const BoxConstraints(minHeight: AppSizes.tapTarget),
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x3),
                      decoration: BoxDecoration(
                        color: c.bg,
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                        border: Border.all(color: c.border, width: AppSizes.hairline),
                      ),
                      child: ExcludeSemantics(
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.language, color: c.text, size: AppSpacing.x5),
                            const SizedBox(width: AppSpacing.x2),
                            Text(
                              language.toUpperCase(),
                              style: AppType.footnote.copyWith(color: c.text, fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const AppLogo(),
                        const SizedBox(height: AppSpacing.x10),
                        Text(
                          l.welcomeHeadline,
                          textAlign: TextAlign.center,
                          style: AppType.largeTitle.copyWith(color: c.text),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              PrimaryButton(label: l.createAccount, onPressed: () => context.push(Routes.signUp)),
              const SizedBox(height: AppSpacing.x3),
              SecondaryButton(label: l.signIn, onPressed: () => context.push(Routes.signIn)),
            ],
          ),
        ),
      ),
    );
  }
}
