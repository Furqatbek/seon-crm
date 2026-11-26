import 'dart:async';

import 'package:flutter/services.dart';
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

enum CodePurpose { signUp, resetPassword }

/// Which phone the code went to, and what it is for.
class CodeRequest {
  const CodeRequest({required this.phone, required this.purpose});

  /// +998XXXXXXXXX
  final String phone;
  final CodePurpose purpose;
}

/// The code can be asked for again after this long.
const resendAfter = Duration(seconds: 60);
const codeLength = 6;

/// "0:45"
String countdownText(int seconds) => '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';

/// 01c: six digits, Resend after 60 seconds, and what went wrong in plain words.
class CodeScreen extends ConsumerStatefulWidget {
  const CodeScreen({super.key, required this.request});

  final CodeRequest request;

  @override
  ConsumerState<CodeScreen> createState() => _CodeScreenState();
}

class _CodeScreenState extends ConsumerState<CodeScreen> {
  final _code = TextEditingController();
  final _focus = FocusNode();
  Timer? _timer;
  int _secondsLeft = resendAfter.inSeconds;
  int _triesLeft = codeAttempts;
  AuthFailure? _failure;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _timer?.cancel();
    _secondsLeft = resendAfter.inSeconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() => _secondsLeft -= 1);
      if (_secondsLeft <= 0) timer.cancel();
    });
  }

  Future<void> _resend() async {
    final repository = ref.read(authRepositoryProvider);
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _failure = null);
    try {
      if (widget.request.purpose == CodePurpose.signUp) {
        await repository.resendSignUpCode(widget.request.phone);
      } else {
        await repository.sendResetCode(widget.request.phone);
      }
      if (!mounted) return;
      // A new code has its own tries.
      setState(() {
        _triesLeft = codeAttempts;
        _code.clear();
        _startCountdown();
      });
      messenger.showSnackBar(SnackBar(content: Text(l.codeResent)));
    } on AuthFailureException catch (error) {
      if (mounted) setState(() => _failure = error.failure);
    }
  }

  Future<void> _confirm() async {
    if (_code.text.length != codeLength || _busy || _triesLeft <= 0) return;
    setState(() {
      _busy = true;
      _failure = null;
    });
    try {
      await ref.read(authRepositoryProvider).verifyCode(phone: widget.request.phone, code: _code.text);
      if (!mounted) return;
      if (widget.request.purpose == CodePurpose.resetPassword) {
        context.go(Routes.newPassword);
        return;
      }
      // Signed in: a phone the centre knows is linked by now.
      final profile = await ref.read(authProvider.notifier).refreshProfile();
      if (!mounted) return;
      context.go(profile?.role == AccountRole.student ? Routes.linked : Routes.home);
    } on AuthFailureException catch (error) {
      if (!mounted) return;
      setState(() {
        _failure = error.failure;
        if (error.failure == AuthFailure.wrongCode) {
          _triesLeft -= 1;
          _code.clear();
        }
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final digits = _code.text;
    final outOfTries = _triesLeft <= 0;
    return AuthPage(
      title: l.smsCodeTitle,
      // Always ready, as in the design; an unfinished code is simply not sent.
      bottom: PrimaryButton(label: l.confirm, onPressed: outOfTries ? null : _confirm, busy: _busy),
      children: [
        Transform.translate(
          offset: const Offset(0, -AppSpacing.x3),
          child: Text.rich(
            TextSpan(
              style: AppType.body.copyWith(color: c.textSecondary),
              children: [
                TextSpan(text: l.smsCodeSentBefore),
                // Kept on one line: a number is not read across a line break.
                TextSpan(
                  text: formatPhone(widget.request.phone).replaceAll(' ', '\u00A0'),
                  style: AppType.body.copyWith(color: c.text, fontWeight: FontWeight.w600),
                ),
                TextSpan(text: l.smsCodeSentAfter),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.x3),
        // One real field under six boxes: the keyboard, paste and the phone's
        // "code from SMS" suggestion all work as they do for any field.
        Stack(
          children: [
            Row(
              children: [
                for (var i = 0; i < codeLength; i++) ...[
                  if (i > 0) const SizedBox(width: AppSpacing.x2),
                  Expanded(
                    child: _CodeBox(
                      digit: i < digits.length ? digits[i] : null,
                      active: _focus.hasFocus && i == digits.length,
                      error: _failure == AuthFailure.wrongCode,
                    ),
                  ),
                ],
              ],
            ),
            Positioned.fill(
              child: Semantics(
                label: l.smsCodeField,
                child: Opacity(
                  opacity: 0,
                  child: TextField(
                    controller: _code,
                    focusNode: _focus,
                    autofocus: true,
                    enabled: !outOfTries,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(codeLength)],
                    showCursor: false,
                    enableInteractiveSelection: false,
                    onChanged: (value) {
                      setState(() {
                        if (value.isNotEmpty) _failure = null;
                      });
                      if (value.length == codeLength) _confirm();
                    },
                    onSubmitted: (_) => _confirm(),
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.x4),
        if (_failure != null) ...[ErrorLine(authFailureText(l, _failure!, triesLeft: _triesLeft < 0 ? 0 : _triesLeft)), const SizedBox(height: AppSpacing.x2)],
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: _secondsLeft > 0
              ? ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: AppSizes.tapTarget),
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    widthFactor: 1,
                    child: Text(l.resendIn(countdownText(_secondsLeft)), style: AppType.body.copyWith(color: c.textSecondary)),
                  ),
                )
              : LinkButton(label: l.resend, onPressed: _resend),
        ),
      ],
    );
  }
}

class _CodeBox extends StatelessWidget {
  const _CodeBox({required this.digit, required this.active, required this.error});

  final String? digit;
  final bool active;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final outline = error ? c.danger : (active ? c.primary : null);
    return ExcludeSemantics(
      child: Container(
        height: AppSizes.codeBoxHeight,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? c.bg : c.surface,
          borderRadius: BorderRadius.circular(AppRadii.field),
          border: outline == null ? null : Border.all(color: outline, width: AppSizes.outline),
        ),
        child: digit != null
            ? Text(digit!, style: AppType.title.copyWith(color: c.text))
            : active
            ? Container(width: AppSizes.outline, height: AppSpacing.x6, color: c.primary)
            : null,
      ),
    );
  }
}
