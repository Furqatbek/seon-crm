import 'package:supabase_flutter/supabase_flutter.dart';

/// The phone's push token, saved for the signed-in account and removed on log out.
abstract class DeviceTokenRepository {
  Future<void> save({required String token, required String platform, String? appVersion});

  Future<void> remove(String token);
}

class SupabaseDeviceTokenRepository implements DeviceTokenRepository {
  SupabaseDeviceTokenRepository(this._client);

  final SupabaseClient _client;

  @override
  Future<void> save({required String token, required String platform, String? appVersion}) =>
      _client.rpc('register_device_token', params: {'p_token': token, 'p_platform': platform, 'p_app_version': appVersion});

  @override
  Future<void> remove(String token) => _client.from('device_tokens').delete().eq('token', token);
}
