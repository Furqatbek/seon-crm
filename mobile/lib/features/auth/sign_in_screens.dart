import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/phone.dart';
import '../../core/state.dart';
import '../../data/auth_failure.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import 'auth_widgets.dart';
import 'code_screen.dart';

/// 01e: phone and password.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _phone = TextEditingController(text: phonePrefix);
  final _password = TextEditingController();
  String? _phoneProblem;
  String? _passwordProblem;
  AuthFailure? _failure;
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  void _changed() {
    if (_phoneProblem != null || _passwordProblem != null || _failure != null) {
      setState(() {
        _phoneProblem = null;
        _passwordProblem = null;
        _failure = null;
      });
    }
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    final phone = fullPhone(_phone.text);
    setState(() {
      _phoneProblem = phone == null ? l.errorPhoneInvalid : null;
      _passwordProblem = _password.text.isEmpty ? l.errorPasswordRequired : null;
      _failure = null;
    });
    if (phone == null || _password.text.isEmpty) return;
    setState(() => _busy = true);
    final repository = ref.read(authRepositoryProvider);
    try {
      await repository.signIn(phone: phone, password: _password.text);
      // The router takes a signed-in person to Home.
    } on AuthFailureException catch (error) {
      if (!mounted) return;
      if (error.failure == AuthFailure.notConfirmed) {
        // They started signing up and never entered the code: send it again.
        try {
          await repository.resendSignUpCode(phone);
          if (mounted) {
            context.push(
              Routes.code,
              extra: CodeRequest(phone: phone, purpose: CodePurpose.signUp),
            );
          }
        } on AuthFailureException catch (again) {
          if (mounted) setState(() => _failure = again.failure);
        }
      } else {
        setState(() => _failure = error.failure);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return AuthPage(
      title: l.signIn,
      header: const Padding(
        padding: EdgeInsets.only(top: AppSpacing.x4, bottom: AppSpacing.x2),
        child: AppLogo(size: AppSizes.logoSmall),
      ),
      children: [
        LabeledField(
          label: l.phone,
          error: _phoneProblem,
          child: PhoneField(controller: _phone, hasError: _phoneProblem != null, onChanged: (_) => _changed()),
        ),
        LabeledField(
          label: l.password,
          error: _passwordProblem,
          child: PasswordField(controller: _password, label: l.password, hasError: _passwordProblem != null, onChanged: (_) => _changed()),
        ),
        if (_failure != null) ...[ErrorLine(authFailureText(l, _failure!)), const SizedBox(height: AppSpacing.x4)],
        PrimaryButton(label: l.signIn, onPressed: _submit, busy: _busy),
        const SizedBox(height: AppSpacing.x3),
        Center(
          child: LinkButton(label: l.forgotPassword, onPressed: () => context.push(Routes.forgot)),
        ),
      ],
    );
  }
}

/// Forgot password, step 1: the phone the code goes to.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _phone = TextEditingController(text: phonePrefix);
  String? _phoneProblem;
  AuthFailure? _failure;
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    final phone = fullPhone(_phone.text);
    setState(() {
      _phoneProblem = phone == null ? l.errorPhoneInvalid : null;
      _failure = null;
    });
    if (phone == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(authRepositoryProvider).sendResetCode(phone);
      if (mounted) {
        context.push(
          Routes.code,
          extra: CodeRequest(phone: phone, purpose: CodePurpose.resetPassword),
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
    return AuthPage(
      title: l.resetPassword,
      bottom: PrimaryButton(label: l.sendCode, onPressed: _submit, busy: _busy),
      children: [
        Transform.translate(
          offset: const Offset(0, -AppSpacing.x3),
          child: Text(l.resetHint, style: AppType.body.copyWith(color: c.textSecondary)),
        ),
        const SizedBox(height: AppSpacing.x2),
        LabeledField(
          label: l.phone,
          error: _phoneProblem,
          child: PhoneField(
            controller: _phone,
            hasError: _phoneProblem != null,
            textInputAction: TextInputAction.done,
            onChanged: (_) {
              if (_phoneProblem != null || _failure != null) {
                setState(() {
                  _phoneProblem = null;
                  _failure = null;
                });
              }
            },
          ),
        ),
        if (_failure != null) ErrorLine(authFailureText(l, _failure!)),
      ],
    );
  }
}

/// What is wrong with a new password typed twice. Null means fine.
({String? password, String? repeat}) validateNewPassword(AppLocalizations l, String password, String repeat) =>
    (password: password.length < 8 ? l.errorPasswordShort : null, repeat: password != repeat ? l.errorPasswordsDiffer : null);

/// 01f: Forgot password, step 3: the new password, twice.
class NewPasswordScreen extends ConsumerStatefulWidget {
  const NewPasswordScreen({super.key});

  @override
  ConsumerState<NewPasswordScreen> createState() => _NewPasswordScreenState();
}

class _NewPasswordScreenState extends ConsumerState<NewPasswordScreen> {
  final _password = TextEditingController();
  final _repeat = TextEditingController();
  ({String? password, String? repeat}) _problems = (password: null, repeat: null);
  AuthFailure? _failure;
  bool _submitted = false;
  bool _busy = false;

  @override
  void dispose() {
    _password.dispose();
    _repeat.dispose();
    super.dispose();
  }

  void _changed() {
    if (_submitted) setState(() => _problems = validateNewPassword(AppLocalizations.of(context), _password.text, _repeat.text));
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final problems = validateNewPassword(l, _password.text, _repeat.text);
    setState(() {
      _submitted = true;
      _problems = problems;
      _failure = null;
    });
    if (problems.password != null || problems.repeat != null) return;
    setState(() => _busy = true);
    try {
      await ref.read(authRepositoryProvider).setPassword(_password.text);
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text(l.passwordSaved)));
      context.go(Routes.home);
    } on AuthFailureException catch (error) {
      if (mounted) setState(() => _failure = error.failure);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return AuthPage(
      title: l.resetPassword,
      bottom: PrimaryButton(label: l.save, onPressed: _submit, busy: _busy),
      children: [
        LabeledField(
          label: l.newPassword,
          error: _problems.password,
          child: PasswordField(
            controller: _password,
            label: l.newPassword,
            hasError: _problems.password != null,
            newPassword: true,
            textInputAction: TextInputAction.next,
            onChanged: (_) => _changed(),
          ),
        ),
        LabeledField(
          label: l.repeatPassword,
          error: _problems.repeat,
          child: PasswordField(
            controller: _repeat,
            label: l.repeatPassword,
            hasError: _problems.repeat != null,
            newPassword: true,
            onChanged: (_) => _changed(),
          ),
        ),
        if (_failure != null) ErrorLine(authFailureText(l, _failure!)),
      ],
    );
  }
}
