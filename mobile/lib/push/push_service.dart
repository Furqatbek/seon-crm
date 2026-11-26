import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// Push notifications, behind an interface so the app runs and is tested
/// without Firebase.
abstract class PushService {
  /// ios or android: what `device_tokens.platform` stores.
  String get platform;

  /// Asks for permission and returns this phone's token, or null when push is
  /// not available (no Firebase files yet, permission refused, a simulator).
  Future<String?> token();

  /// A new token for this phone: Firebase replaces them now and then.
  Stream<String> get tokenChanges;

  /// The data of a notification the person tapped while the app was running
  /// or in the background.
  Stream<Map<String, dynamic>> get opened;

  /// The data of the notification that opened the app, if one did.
  Future<Map<String, dynamic>?> launchedFrom();
}

/// No push: used until Firebase is set up, and in tests.
class NoPushService implements PushService {
  const NoPushService();

  @override
  String get platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  @override
  Future<String?> token() async => null;

  @override
  Stream<String> get tokenChanges => const Stream.empty();

  @override
  Stream<Map<String, dynamic>> get opened => const Stream.empty();

  @override
  Future<Map<String, dynamic>?> launchedFrom() async => null;
}

/// Firebase Cloud Messaging. The native Firebase files (google-services.json,
/// GoogleService-Info.plist) carry the project's settings.
class FirebasePushService implements PushService {
  FirebasePushService._();

  /// Starts Firebase. Without its native files the app still runs, without push.
  static Future<PushService> start() async {
    try {
      await Firebase.initializeApp();
      return FirebasePushService._();
    } catch (error) {
      debugPrint('Push is off: Firebase is not set up ($error)');
      return const NoPushService();
    }
  }

  FirebaseMessaging get _messaging => FirebaseMessaging.instance;

  @override
  String get platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  @override
  Future<String?> token() async {
    try {
      final settings = await _messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return null;
      // The CRM pushes to FCM registration tokens. The package now prefers
      // register() and installation ids; moving to those needs the CRM's
      // sender changed with it.
      // ignore: deprecated_member_use
      return await _messaging.getToken();
    } catch (error) {
      debugPrint('No push token: $error');
      return null;
    }
  }

  @override
  // ignore: deprecated_member_use
  Stream<String> get tokenChanges => _messaging.onTokenRefresh;

  @override
  Stream<Map<String, dynamic>> get opened => FirebaseMessaging.onMessageOpenedApp.map((message) => message.data);

  @override
  Future<Map<String, dynamic>?> launchedFrom() async => (await _messaging.getInitialMessage())?.data;
}
