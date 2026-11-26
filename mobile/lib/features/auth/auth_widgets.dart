import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/phone.dart';
import '../../data/auth_failure.dart';
import '../../l10n/app_localizations.dart';
import '../../ui/tokens.dart';

/// A page of the sign-up and sign-in flow: a back chevron, a large title, the
/// fields, and the main action pinned to the bottom.
class AuthPage extends StatelessWidget {
  const AuthPage({super.key, this.title, required this.children, this.bottom, this.showBack = true, this.header});

  final String? title;
  final List<Widget> children;

  /// The main action and anything under it.
  final Widget? bottom;
  final bool showBack;

  /// Above the title: the logo on Sign in.
  final Widget? header;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.x4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (showBack)
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: Semantics(
                          button: true,
                          label: l.back,
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () => context.canPop() ? context.pop() : context.go('/welcome'),
                            child: SizedBox(
                              width: AppSizes.tapTarget,
                              height: AppSizes.tapTarget,
                              child: Align(
                                alignment: AlignmentDirectional.centerStart,
                                child: ExcludeSemantics(
                                  child: Icon(Icons.arrow_back_ios_new, color: c.primary, size: AppSpacing.x5),
                                ),
                              ),
                            ),
                          ),
                        ),
                      )
                    else
                      const SizedBox(height: AppSizes.tapTarget),
                    ?header,
                    if (title != null) ...[
                      const SizedBox(height: AppSpacing.x4),
                      Semantics(
                        header: true,
                        child: Text(title!, style: AppType.largeTitle.copyWith(color: c.text)),
                      ),
                      const SizedBox(height: AppSpacing.x6),
                    ],
                    ...children,
                  ],
                ),
              ),
            ),
            if (bottom != null) Padding(padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.x2, AppSpacing.page, AppSpacing.x4), child: bottom),
          ],
        ),
      ),
    );
  }
}

/// A label above a field, and the field's problem under it in plain words.
class LabeledField extends StatelessWidget {
  const LabeledField({super.key, required this.label, required this.child, this.error});

  final String label;
  final Widget child;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.x5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(
            child: Text(label, style: AppType.footnote.copyWith(color: c.textSecondary)),
          ),
          const SizedBox(height: AppSpacing.x2),
          child,
          if (error != null) ...[const SizedBox(height: AppSpacing.x2), ErrorLine(error!)],
        ],
      ),
    );
  }
}

/// A problem, said in plain words, with the warning icon of the designs.
class ErrorLine extends StatelessWidget {
  const ErrorLine(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Semantics(
      liveRegion: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(
            child: Icon(Icons.error_outline, color: c.danger, size: AppSpacing.x5),
          ),
          const SizedBox(width: AppSpacing.x2),
          Expanded(
            child: Text(message, style: AppType.footnote.copyWith(color: c.danger)),
          ),
        ],
      ),
    );
  }
}

/// A text field in the app's shape.
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    required this.controller,
    required this.label,
    this.hasError = false,
    this.keyboardType,
    this.textInputAction,
    this.inputFormatters,
    this.autofillHints,
    this.obscureText = false,
    this.suffix,
    this.onChanged,
    this.onSubmitted,
    this.textCapitalization = TextCapitalization.none,
  });

  final TextEditingController controller;

  /// Read to screen readers; the visible label sits above the field.
  final String label;
  final bool hasError;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final List<TextInputFormatter>? inputFormatters;
  final Iterable<String>? autofillHints;
  final bool obscureText;
  final Widget? suffix;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final TextCapitalization textCapitalization;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    return Semantics(
      label: label,
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        textInputAction: textInputAction,
        inputFormatters: inputFormatters,
        autofillHints: autofillHints,
        obscureText: obscureText,
        onChanged: onChanged,
        onSubmitted: onSubmitted,
        textCapitalization: textCapitalization,
        style: AppType.body.copyWith(color: c.text),
        decoration: InputDecoration(
          // The red outline of the designs; the words are shown under the field.
          errorText: hasError ? '' : null,
          suffixIcon: suffix,
        ),
      ),
    );
  }
}

/// A phone number behind the +998 mask.
class PhoneField extends StatelessWidget {
  const PhoneField({super.key, required this.controller, this.hasError = false, this.onChanged, this.textInputAction});

  final TextEditingController controller;
  final bool hasError;
  final ValueChanged<String>? onChanged;
  final TextInputAction? textInputAction;

  @override
  Widget build(BuildContext context) => AppTextField(
    controller: controller,
    label: AppLocalizations.of(context).phone,
    hasError: hasError,
    keyboardType: TextInputType.phone,
    textInputAction: textInputAction ?? TextInputAction.next,
    inputFormatters: const [PhoneInputFormatter()],
    autofillHints: const [AutofillHints.telephoneNumber],
    onChanged: onChanged,
  );
}

/// A password, hidden until the eye is tapped.
class PasswordField extends StatefulWidget {
  const PasswordField({
    super.key,
    required this.controller,
    required this.label,
    this.hasError = false,
    this.onChanged,
    this.newPassword = false,
    this.textInputAction,
  });

  final TextEditingController controller;
  final String label;
  final bool hasError;
  final ValueChanged<String>? onChanged;

  /// Tells the phone's password manager to offer a new password.
  final bool newPassword;
  final TextInputAction? textInputAction;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _shown = false;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    return AppTextField(
      controller: widget.controller,
      label: widget.label,
      hasError: widget.hasError,
      obscureText: !_shown,
      keyboardType: TextInputType.visiblePassword,
      textInputAction: widget.textInputAction ?? TextInputAction.done,
      autofillHints: [widget.newPassword ? AutofillHints.newPassword : AutofillHints.password],
      onChanged: widget.onChanged,
      suffix: Semantics(
        button: true,
        label: _shown ? l.hidePassword : l.showPassword,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => setState(() => _shown = !_shown),
          child: SizedBox(
            width: AppSizes.tapTarget + AppSpacing.x2,
            height: AppSizes.tapTarget,
            child: ExcludeSemantics(
              child: Icon(_shown ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: c.textSecondary, size: AppSizes.icon),
            ),
          ),
        ),
      ),
    );
  }
}

/// The centre's mark.
class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.size = AppSizes.logo});

  final double size;

  @override
  Widget build(BuildContext context) => Center(
    child: Image.asset('assets/images/logo.png', height: size, semanticLabel: AppLocalizations.of(context).appName),
  );
}

/// A failure, in plain words in the interface language. `triesLeft` is for a
/// wrong code.
String authFailureText(AppLocalizations l, AuthFailure failure, {int triesLeft = 0}) => switch (failure) {
  AuthFailure.wrongCode => l.errorWrongCode(triesLeft),
  AuthFailure.tooManySms => l.errorTooManySms(smsLimitMinutes),
  AuthFailure.alreadyRegistered => l.errorAlreadyRegistered,
  AuthFailure.invalidCredentials || AuthFailure.notConfirmed => l.errorInvalidCredentials,
  AuthFailure.noAccount => l.errorNoAccount,
  AuthFailure.weakPassword => l.errorPasswordShort,
  AuthFailure.phoneNotSupported => l.errorPhoneNotSupported,
  AuthFailure.network => l.errorNetwork,
  AuthFailure.unknown => l.errorGeneric,
};
