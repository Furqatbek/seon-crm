/// The only two settings the app is built with, through
/// `--dart-define-from-file=env/dev.json`. Never a service or secret key.
const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabasePublishableKey = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');

bool get isConfigured => supabaseUrl.isNotEmpty && supabasePublishableKey.isNotEmpty;
