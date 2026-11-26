// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Korean (`ko`).
class AppLocalizationsKo extends AppLocalizations {
  AppLocalizationsKo([String locale = 'ko']) : super(locale);

  @override
  String get appName => 'Seon Topik Student';

  @override
  String get welcomeHeadline => '한국어를 연습하고 TOPIK을 준비하세요';

  @override
  String get createAccount => '회원가입';

  @override
  String get signIn => '로그인';

  @override
  String get chooseLanguage => '언어 선택';

  @override
  String get languageUz => 'Oʻzbekcha';

  @override
  String get languageRu => 'Русский';

  @override
  String get languageEn => 'English';

  @override
  String get languageKo => '한국어';

  @override
  String get back => '뒤로';

  @override
  String get fullName => '이름';

  @override
  String get phone => '전화번호';

  @override
  String get password => '비밀번호';

  @override
  String get showPassword => '비밀번호 표시';

  @override
  String get hidePassword => '비밀번호 숨기기';

  @override
  String get koreanLevel => '한국어 수준';

  @override
  String get levelBeginner => '입문';

  @override
  String get levelTopik1 => 'TOPIK I';

  @override
  String get levelTopik2 => 'TOPIK II';

  @override
  String get continueAction => '계속';

  @override
  String get consentBefore => '계속하면 ';

  @override
  String get consentLink => '개인정보 처리방침';

  @override
  String get consentAfter => '에 동의하게 됩니다';

  @override
  String get privacyPolicy => '개인정보 처리방침';

  @override
  String get privacyEmpty => '개인정보 처리방침이 아직 등록되지 않았습니다.';

  @override
  String get errorNameRequired => '이름을 입력하세요';

  @override
  String get errorPhoneInvalid => '전화번호를 끝까지 입력하세요';

  @override
  String get errorPasswordShort => '비밀번호는 8자 이상이어야 합니다';

  @override
  String get errorPasswordRequired => '비밀번호를 입력하세요';

  @override
  String get errorLevelRequired => '수준을 선택하세요';

  @override
  String get errorPasswordsDiffer => '비밀번호가 일치하지 않습니다';

  @override
  String get smsCodeTitle => 'SMS 코드';

  @override
  String get smsCodeSentBefore => '';

  @override
  String get smsCodeSentAfter => ' 번호로 6자리 코드를 보냈습니다';

  @override
  String get smsCodeField => '6자리 코드';

  @override
  String resendIn(String time) {
    return '코드 다시 보내기 ($time)';
  }

  @override
  String get resend => '코드 다시 보내기';

  @override
  String get codeResent => '코드를 다시 보냈습니다';

  @override
  String get confirm => '확인';

  @override
  String errorWrongCode(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '코드가 맞지 않습니다. $count번 더 시도할 수 있습니다', zero: '코드가 맞지 않습니다. 새 코드를 요청하세요');
    return '$_temp0';
  }

  @override
  String errorTooManySms(int minutes) {
    return 'SMS 요청이 너무 많습니다. $minutes분 후에 다시 시도하세요';
  }

  @override
  String get errorAlreadyRegistered => '이미 가입된 번호입니다';

  @override
  String get errorInvalidCredentials => '전화번호 또는 비밀번호가 맞지 않습니다';

  @override
  String get errorNoAccount => '이 번호로 가입된 계정이 없습니다';

  @override
  String get errorPhoneNotSupported => '우즈베키스탄 전화번호만 사용할 수 있습니다';

  @override
  String get errorNetwork => '인터넷에 연결되어 있지 않습니다. 다시 시도하세요';

  @override
  String get errorGeneric => '문제가 발생했습니다. 다시 시도하세요';

  @override
  String get linkedTitle => '계정이 센터에 연결되었습니다';

  @override
  String get start => '시작하기';

  @override
  String get forgotPassword => '비밀번호를 잊으셨나요?';

  @override
  String get resetPassword => '비밀번호 재설정';

  @override
  String get resetHint => '전화번호를 입력하면 SMS로 코드를 보내 드립니다';

  @override
  String get sendCode => '코드 보내기';

  @override
  String get newPassword => '새 비밀번호';

  @override
  String get repeatPassword => '비밀번호 다시 입력';

  @override
  String get save => '저장';

  @override
  String get passwordSaved => '비밀번호를 저장했습니다';

  @override
  String get tabHome => '홈';

  @override
  String get tabGame => '게임';

  @override
  String get tabQr => 'QR 코드';

  @override
  String get tabShop => '상점';

  @override
  String get tabMore => '더보기';

  @override
  String get soonTitle => '준비 중';

  @override
  String get homeStudentSoon => '다음 수업, 순위, 코인, 잔액이 여기에 표시됩니다.';

  @override
  String get homeAppUserSoon => '모의고사, 공개 수업, 바우처가 여기에 표시됩니다.';

  @override
  String get gameStudentSoon => '1대1 게임과 모의고사. 이기면 코인을 받습니다.';

  @override
  String get gameAppUserSoon => '1대1 게임과 모의고사. 코인은 센터에 등록한 후에 받을 수 있습니다.';

  @override
  String get qrStudentSoon => '안내 데스크에서 보여 줄 QR 코드가 여기에 표시됩니다.';

  @override
  String get qrAppUserSoon => 'QR 체크인은 센터 수강생만 사용할 수 있습니다.';

  @override
  String get shopStudentSoon => '코인으로 리워드를 받을 수 있습니다.';

  @override
  String get shopAppUserSoon => '리워드를 둘러볼 수 있습니다. 코인을 쓰려면 센터에 등록하세요.';

  @override
  String get moreStudentSoon => '프로필, 순위표, 시간표, 결제 내역이 여기에 표시됩니다.';

  @override
  String get moreAppUserSoon => '프로필, 바우처, 공개 수업이 여기에 표시됩니다.';

  @override
  String get notifications => '알림';

  @override
  String get notificationsSoon => '알림이 여기에 표시됩니다.';

  @override
  String get logOut => '로그아웃';

  @override
  String money(String amount) {
    return '$amount숨';
  }

  @override
  String coinsCount(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$formatted코인');
    return '$_temp0';
  }
}
