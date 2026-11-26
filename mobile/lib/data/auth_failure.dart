/// Why signing up or in did not work, in terms a person can be told.
enum AuthFailure {
  wrongCode,
  tooManySms,
  alreadyRegistered,
  invalidCredentials,

  /// The account exists but its phone was never confirmed.
  notConfirmed,
  noAccount,
  weakPassword,
  phoneNotSupported,
  network,
  unknown,
}

class AuthFailureException implements Exception {
  const AuthFailureException(this.failure);

  final AuthFailure failure;

  @override
  String toString() => 'AuthFailureException(${failure.name})';
}

/// Codes are sent at most 3 times an hour per phone, so "try again in" is an hour.
const smsLimitMinutes = 60;

/// A wrong code can be tried this many times before a new one must be asked for.
const codeAttempts = 5;

/// What an error from Supabase Auth means. `code` is its error code, `status`
/// the HTTP status and `message` its text; the CRM's Send SMS hook answers
/// with codes such as `sms_rate_limited` in the message.
AuthFailure authFailureOf({String? code, String? status, String message = ''}) {
  final text = message.toLowerCase();
  if (text.contains('sms_rate_limited') || code == 'over_sms_send_rate_limit' || code == 'over_request_rate_limit' || status == '429') {
    return AuthFailure.tooManySms;
  }
  if (text.contains('phone_not_supported')) return AuthFailure.phoneNotSupported;
  switch (code) {
    case 'otp_expired' || 'invalid_otp' || 'bad_code_verifier':
      return AuthFailure.wrongCode;
    case 'user_already_exists' || 'phone_exists':
      return AuthFailure.alreadyRegistered;
    case 'invalid_credentials':
      return AuthFailure.invalidCredentials;
    case 'phone_not_confirmed':
      return AuthFailure.notConfirmed;
    case 'weak_password':
      return AuthFailure.weakPassword;
    case 'user_not_found' || 'otp_disabled' || 'signup_disabled':
      return AuthFailure.noAccount;
  }
  if (text.contains('token has expired or is invalid')) return AuthFailure.wrongCode;
  if (text.contains('already registered')) return AuthFailure.alreadyRegistered;
  if (text.contains('invalid login credentials')) return AuthFailure.invalidCredentials;
  if (text.contains('signups not allowed')) return AuthFailure.noAccount;
  if (code == null && status == null) return AuthFailure.network;
  return AuthFailure.unknown;
}
