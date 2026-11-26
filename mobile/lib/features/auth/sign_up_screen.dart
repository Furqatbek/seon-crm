import 'package:flutter/gestures.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/phone.dart';
import '../../core/state.dart';
import '../../data/auth_failure.dart';
import '../../data/models.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import 'auth_widgets.dart';
import 'code_screen.dart';

/// What is wrong with the sign-up form, field by field. Null means fine.
class SignUpProblems {
  const SignUpProblems({this.name, this.phone, this.password, this.level});

  final String? name;
  final String? phone;
  final String? password;
  final String? level;

  bool get any => name != null || phone != null || password != null || level != null;
}

/// The rules of Create account: a full name, a whole +998 number, a password
/// of 8 characters or more, and a level.
SignUpProblems validateSignUp(AppLocalizations l, {required String name, required String phone, required String password, required KoreanLevel? level}) =>
    SignUpProblems(
      name: name.trim().length < 2 ? l.errorNameRequired : null,
      phone: fullPhone(phone) == null ? l.errorPhoneInvalid : null,
      password: password.length < 8 ? l.errorPasswordShort : null,
      level: level == null ? l.errorLevelRequired : null,
    );

String levelName(AppLocalizations l, KoreanLevel level) => switch (level) {
  KoreanLevel.beginner => l.levelBeginner,
  KoreanLevel.topik1 => l.levelTopik1,
  KoreanLevel.topik2 => l.levelTopik2,
};

/// 01b: full name, phone, password and Korean level, then the SMS code.
class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController(text: phonePrefix);
  final _password = TextEditingController();
  late final TapGestureRecognizer _openPrivacy = TapGestureRecognizer()..onTap = () => context.push(Routes.privacy);
  KoreanLevel? _level;
  SignUpProblems _problems = const SignUpProblems();
  AuthFailure? _failure;
  bool _submitted = false;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _password.dispose();
    _openPrivacy.dispose();
    super.dispose();
  }

  SignUpProblems _check() => validateSignUp(AppLocalizations.of(context), name: _name.text, phone: _phone.text, password: _password.text, level: _level);

  /// Once Continue has been pressed, a problem goes away as it is fixed.
  void _changed() {
    if (_submitted || _failure != null) {
      setState(() {
        _failure = null;
        if (_submitted) _problems = _check();
      });
    }
  }

  Future<void> _submit() async {
    final problems = _check();
    setState(() {
      _submitted = true;
      _problems = problems;
      _failure = null;
    });
    if (problems.any) return;
    final phone = fullPhone(_phone.text)!;
    setState(() => _busy = true);
    try {
      await ref
          .read(authRepositoryProvider)
          .signUp(fullName: _name.text.trim(), phone: phone, password: _password.text, level: _level!, language: ref.read(settingsProvider).language);
      if (mounted) {
        context.push(
          Routes.code,
          extra: CodeRequest(phone: phone, purpose: CodePurpose.signUp),
        );
      }
    } on AuthFailureException catch (error) {
      if (mounted) setState(() => _failure = error.failure);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final small = AppType.footnote.copyWith(color: c.textSecondary);
    return AuthPage(
      title: l.createAccount,
      bottom: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_failure != null) ...[
            ErrorLine(authFailureText(l, _failure!)),
            // Someone who already has an account is offered the way in.
            if (_failure == AuthFailure.alreadyRegistered)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: LinkButton(label: l.signIn, onPressed: () => context.pushReplacement(Routes.signIn)),
              )
            else
              const SizedBox(height: AppSpacing.x3),
          ],
          PrimaryButton(label: l.continueAction, onPressed: _submit, busy: _busy),
          const SizedBox(height: AppSpacing.x3),
          Text.rich(
            TextSpan(
              style: small,
              children: [
                TextSpan(text: l.consentBefore),
                TextSpan(
                  text: l.consentLink,
                  style: small.copyWith(color: c.primary),
                  recognizer: _openPrivacy,
                ),
                TextSpan(text: l.consentAfter),
              ],
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
      children: [
        LabeledField(
          label: l.fullName,
          error: _problems.name,
          child: AppTextField(
            controller: _name,
            label: l.fullName,
            hasError: _problems.name != null,
            keyboardType: TextInputType.name,
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.name],
            onChanged: (_) => _changed(),
          ),
        ),
        LabeledField(
          label: l.phone,
          error: _problems.phone,
          child: PhoneField(controller: _phone, hasError: _problems.phone != null, onChanged: (_) => _changed()),
        ),
        LabeledField(
          label: l.password,
          error: _problems.password,
          child: PasswordField(controller: _password, label: l.password, hasError: _problems.password != null, newPassword: true, onChanged: (_) => _changed()),
        ),
        LabeledField(
          label: l.koreanLevel,
          error: _problems.level,
          child: Semantics(
            label: l.koreanLevel,
            container: true,
            child: Wrap(
              spacing: AppSpacing.x2,
              runSpacing: AppSpacing.x2,
              children: [
                for (final level in KoreanLevel.values)
                  Pill(
                    label: levelName(l, level),
                    outlined: true,
                    selected: _level == level,
                    onTap: () {
                      setState(() => _level = level);
                      _changed();
                    },
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
