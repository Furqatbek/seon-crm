import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/more_state.dart';
import '../../core/phone.dart';
import '../../core/state.dart';
import '../../core/time.dart';
import '../../data/auth_failure.dart';
import '../../data/models.dart';
import '../../data/more.dart';
import '../../l10n/app_localizations.dart';
import '../../push/notification_routes.dart';
import '../../ui/tokens.dart';
import '../../ui/widgets.dart';
import '../auth/auth_widgets.dart';
import '../auth/code_screen.dart';
import '../auth/sign_in_screens.dart' show validateNewPassword;
import 'crop.dart';
import 'more_tab.dart' show ProfileAvatar;
import 'sub_page.dart';

/// Edit profile: the photo and the phone are the person's own to change; the
/// name, birthday and parent details are shown, and changed only by staff.
class EditProfilePage extends ConsumerStatefulWidget {
  const EditProfilePage({super.key});

  @override
  ConsumerState<EditProfilePage> createState() => _EditProfilePageState();
}

class _EditProfilePageState extends ConsumerState<EditProfilePage> {
  bool _busy = false;

  Future<void> _photoMenu() async {
    final hasPhoto = ref.read(authProvider).profile?.avatarPath != null;
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (sheet) {
        final l = AppLocalizations.of(sheet);
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.x2),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListRow(icon: Icons.photo_camera_outlined, label: l.takePhoto, selected: false, onTap: () => Navigator.of(sheet).pop('camera')),
                ListRow(icon: Icons.photo_library_outlined, label: l.chooseFromGallery, selected: false, onTap: () => Navigator.of(sheet).pop('gallery')),
                if (hasPhoto) ListRow(icon: Icons.delete_outline, label: l.removePhoto, danger: true, onTap: () => Navigator.of(sheet).pop('remove')),
              ],
            ),
          ),
        );
      },
    );
    if (choice == null || !mounted) return;
    if (choice == 'remove') return _save(null);
    final picked = await ref.read(photoPickerProvider)(choice == 'camera' ? PhotoSource.camera : PhotoSource.gallery);
    if (picked == null || !mounted) return;
    final square = await Navigator.of(context).push<Uint8List>(MaterialPageRoute(builder: (_) => CropPage(bytes: picked), fullscreenDialog: true));
    if (square != null && mounted) await _save(square);
  }

  /// Saves the cropped photo, or removes the photo when `png` is null.
  Future<void> _save(Uint8List? png) async {
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final repository = ref.read(moreRepositoryProvider);
    final current = ref.read(authProvider).profile?.avatarPath;
    setState(() => _busy = true);
    try {
      if (png != null) {
        await repository.saveAvatar(png, replacing: current);
      } else if (current != null) {
        await repository.removeAvatar(current);
      }
      await ref.read(authProvider.notifier).refreshProfile();
      if (png != null) messenger.showSnackBar(SnackBar(content: Text(l.photoSaved)));
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(l.photoFailed)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final l = AppLocalizations.of(context);
    final profile = ref.watch(authProvider).profile;
    final student = profile?.role == AccountRole.student;
    final details = student ? ref.watch(studentDetailsProvider).value : null;

    return SubPage(
      title: l.editProfile,
      grouped: true,
      child: ListView(
        padding: const EdgeInsets.only(bottom: AppSpacing.x8),
        children: [
          Center(
            child: Semantics(
              button: true,
              label: l.changePhoto,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _busy ? null : _photoMenu,
                child: Column(
                  children: [
                    Opacity(
                      opacity: _busy ? AppSizes.disabledOpacity : 1,
                      child: const ProfileAvatar(size: AppSizes.avatarLarge),
                    ),
                    ExcludeSemantics(
                      child: LinkButton(label: l.changePhoto, onPressed: _busy ? null : _photoMenu),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.x2),
          RowGroup(
            children: [
              ListRow(
                icon: Icons.phone_outlined,
                label: l.phone,
                value: profile?.phone == null ? null : formatPhone(profile!.phone!),
                keepValueTogether: true,
                onTap: () => context.push(Routes.changePhone),
              ),
              ListRow(icon: Icons.lock_outline, label: l.changePassword, onTap: () => context.push(Routes.changePassword)),
            ],
          ),
          RowGroup(
            children: [
              ListRow(icon: Icons.badge_outlined, label: l.fullName, value: details?.fullName ?? profile?.fullName),
              if (details?.birthDate != null)
                ListRow(icon: Icons.cake_outlined, label: l.birthDate, value: l.fullDate(dayMonth(details!.birthDate!, l), details.birthDate!.year)),
              if (details?.parentName != null) ListRow(icon: Icons.family_restroom_outlined, label: l.parentName, value: details!.parentName),
              if (details?.parentPhone != null)
                ListRow(icon: Icons.phone_outlined, label: l.parentPhone, value: formatPhone(details!.parentPhone!), keepValueTogether: true),
            ],
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x4),
            child: Text(l.staffOnlyHint, style: AppType.footnote.copyWith(color: c.textSecondary)),
          ),
        ],
      ),
    );
  }
}

/// Change phone: the new number, then the code sent to it. The phone changes
/// only when the code is confirmed.
class ChangePhonePage extends ConsumerStatefulWidget {
  const ChangePhonePage({super.key});

  @override
  ConsumerState<ChangePhonePage> createState() => _ChangePhonePageState();
}

class _ChangePhonePageState extends ConsumerState<ChangePhonePage> {
  final _phone = TextEditingController(text: phonePrefix);
  String? _problem;
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
    final problem = phone == null ? l.errorPhoneInvalid : (phone == ref.read(authProvider).profile?.phone ? l.phoneSame : null);
    setState(() {
      _problem = problem;
      _failure = null;
    });
    if (problem != null) return;
    setState(() => _busy = true);
    try {
      await ref.read(authRepositoryProvider).startPhoneChange(phone!);
      if (mounted) {
        context.push(
          Routes.code,
          extra: CodeRequest(phone: phone, purpose: CodePurpose.phoneChange),
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
    return SubPage(
      title: l.changePhone,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.phoneChangeHint, style: AppType.body.copyWith(color: c.textSecondary)),
          const SizedBox(height: AppSpacing.x5),
          LabeledField(
            label: l.newPhone,
            error: _problem,
            child: PhoneField(
              controller: _phone,
              hasError: _problem != null,
              textInputAction: TextInputAction.done,
              onChanged: (_) {
                if (_problem != null || _failure != null) {
                  setState(() {
                    _problem = null;
                    _failure = null;
                  });
                }
              },
            ),
          ),
          if (_failure != null) ErrorLine(authFailureText(l, _failure!)),
          const Spacer(),
          PrimaryButton(label: l.continueAction, onPressed: _submit, busy: _busy),
          const SizedBox(height: AppSpacing.x4),
        ],
      ),
    );
  }
}

/// Change password: the new one, twice.
class ChangePasswordPage extends ConsumerStatefulWidget {
  const ChangePasswordPage({super.key});

  @override
  ConsumerState<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends ConsumerState<ChangePasswordPage> {
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
      context.pop();
    } on AuthFailureException catch (error) {
      if (mounted) setState(() => _failure = error.failure);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SubPage(
      title: l.changePassword,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
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
          const Spacer(),
          PrimaryButton(label: l.save, onPressed: _submit, busy: _busy),
          const SizedBox(height: AppSpacing.x4),
        ],
      ),
    );
  }
}
