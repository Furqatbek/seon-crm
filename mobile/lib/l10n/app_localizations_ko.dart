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
  String get gameStudentSoon => '1대1 게임과 모의고사. 이기면 코인을 받습니다.';

  @override
  String get gameAppUserSoon => '1대1 게임과 모의고사. 코인은 센터에 등록한 후에 받을 수 있습니다.';

  @override
  String get notifications => '알림';

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

  @override
  String greeting(String name) {
    return '안녕하세요, $name 님';
  }

  @override
  String unreadCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '읽지 않은 알림 $count개', zero: '읽지 않은 알림 없음');
    return '$_temp0';
  }

  @override
  String get chooseGroup => '그룹 선택';

  @override
  String get offlineBanner => '인터넷에 연결되어 있지 않습니다. 최신 정보가 아닐 수 있습니다.';

  @override
  String get loadFailedBanner => '정보를 새로 고치지 못했습니다. 아래로 당겨 다시 시도하세요.';

  @override
  String get retry => '다시 시도';

  @override
  String get nextLesson => '다음 수업';

  @override
  String get exam => '시험';

  @override
  String get nothingScheduled => '예정된 수업이 없습니다';

  @override
  String get today => '오늘';

  @override
  String get tomorrow => '내일';

  @override
  String get yesterday => '어제';

  @override
  String get earlier => '이전';

  @override
  String dayAtTime(String day, String time) {
    return '$day $time';
  }

  @override
  String roomNumber(String room) {
    return '$room호';
  }

  @override
  String get weekdays => '월요일,화요일,수요일,목요일,금요일,토요일,일요일';

  @override
  String get months => '1월,2월,3월,4월,5월,6월,7월,8월,9월,10월,11월,12월';

  @override
  String dayMonth(int day, String month) {
    return '$month $day일';
  }

  @override
  String inDays(int count) {
    return '$count일 후';
  }

  @override
  String inHoursMinutes(int hours, int minutes) {
    return '$hours시간 $minutes분 후';
  }

  @override
  String inHours(int hours) {
    return '$hours시간 후';
  }

  @override
  String inMinutes(int minutes) {
    return '$minutes분 후';
  }

  @override
  String get startingNow => '곧 시작합니다';

  @override
  String get rankInGroup => '그룹 내 순위';

  @override
  String rankPlace(int rank) {
    return '$rank위';
  }

  @override
  String rankOf(int count) {
    return '$count명 중, 이번 달';
  }

  @override
  String get rankNone => '이번 달 순위가 아직 없습니다';

  @override
  String get coins => '코인';

  @override
  String coinsThisWeek(String count) {
    return '이번 주 +$count';
  }

  @override
  String get balance => '잔액';

  @override
  String get balancePaid => '납부 완료';

  @override
  String nextPaymentOn(String date) {
    return '다음 납부 $date';
  }

  @override
  String balanceDueBy(String date) {
    return '$date까지 납부';
  }

  @override
  String balanceDebtSince(String date) {
    return '연체, 납부 기한 $date';
  }

  @override
  String get attendance => '출석';

  @override
  String get thisMonth => '이번 달';

  @override
  String get noLessonsYet => '이번 달에는 아직 수업이 없습니다';

  @override
  String levelPill(String level) {
    return '$level 수준';
  }

  @override
  String get mockExamTitle => '모의고사';

  @override
  String get mockExamSoon => 'TOPIK 형식의 연습 시험이 곧 여기에 준비됩니다.';

  @override
  String get lockedCoins => '잠긴 코인';

  @override
  String get lockedCoinsHint => '센터에 등록하면 사용할 수 있습니다';

  @override
  String get openLessonTitle => '무료 공개 수업';

  @override
  String get openLessonSoon => '공개 수업 예약이 곧 여기에 준비됩니다.';

  @override
  String get bookOpenLesson => '무료 공개 수업 예약';

  @override
  String get voucherTitle => '선물이 도착했습니다!';

  @override
  String voucherPercent(int percent) {
    return '첫 달 $percent% 할인';
  }

  @override
  String voucherFixed(String amount) {
    return '첫 달 $amount 할인';
  }

  @override
  String get voucherTrialWeek => '1주 무료 체험';

  @override
  String validUntil(String date) {
    return '$date까지';
  }

  @override
  String get markAllRead => '모두 읽음으로 표시';

  @override
  String get notificationsEmpty => '아직 알림이 없습니다';

  @override
  String get unread => '읽지 않음';

  @override
  String get editProfile => '프로필 수정';

  @override
  String get leaderboard => '순위표';

  @override
  String get schedule => '시간표';

  @override
  String get payments => '결제';

  @override
  String get coinHistory => '코인 내역';

  @override
  String get myVoucher => '내 바우처';

  @override
  String get openLessons => '공개 수업';

  @override
  String get language => '언어';

  @override
  String get appearance => '화면 모드';

  @override
  String get themeSystem => '시스템';

  @override
  String get themeLight => '라이트';

  @override
  String get themeDark => '다크';

  @override
  String get aboutCentre => '센터 소개';

  @override
  String get aboutEmpty => '센터 소개가 아직 등록되지 않았습니다.';

  @override
  String get deleteAccount => '계정 삭제';

  @override
  String get deleteWillBeDeleted => '삭제되는 항목';

  @override
  String get deleteLogin => '로그인 정보';

  @override
  String get deleteCoins => '코인';

  @override
  String get deleteResults => '결과';

  @override
  String get deleteBookings => '공개 수업 예약';

  @override
  String get deleteKept => '센터에 보관되는 항목';

  @override
  String get deletePaymentRecords => '결제 기록';

  @override
  String get deleteAction => '삭제';

  @override
  String get cancel => '취소';

  @override
  String get deleteFailed => '계정을 삭제하지 못했습니다. 다시 시도하세요';

  @override
  String you(String name) {
    return '$name (나)';
  }

  @override
  String get scopeGroup => '내 그룹';

  @override
  String get scopeCentre => '센터';

  @override
  String get periodMonth => '이번 달';

  @override
  String get periodAll => '전체';

  @override
  String ofPeople(int count) {
    return '$count명 중';
  }

  @override
  String get leaderboardEmpty => '아직 순위가 없습니다';

  @override
  String get noGroupYet => '아직 그룹에 속해 있지 않습니다';

  @override
  String get weekdaysShort => '월,화,수,목,금,토,일';

  @override
  String weekRange(String from, String to) {
    return '$from – $to';
  }

  @override
  String get previousWeek => '이전 주';

  @override
  String get nextWeek => '다음 주';

  @override
  String dayWithDate(String weekday, String date) {
    return '$date $weekday';
  }

  @override
  String get cancelled => '취소됨';

  @override
  String get noLessonsThisWeek => '이번 주에는 수업이 없습니다';

  @override
  String timeRange(String from, String to) {
    return '$from–$to';
  }

  @override
  String nextPaymentBy(String date) {
    return '다음 납부 기한 $date';
  }

  @override
  String get balanceDue => '납부 예정';

  @override
  String get balanceDebt => '연체';

  @override
  String get payByCard => '카드로 납부';

  @override
  String get myReceipts => '내 영수증';

  @override
  String get comingSoon => '곧 제공됩니다';

  @override
  String get paymentReceived => '납부 확인';

  @override
  String receiptLine(String date, String number) {
    return '$date · 영수증 $number번';
  }

  @override
  String monthFee(String month) {
    return '$month 수강료';
  }

  @override
  String chargedLine(String date) {
    return '$date · 청구';
  }

  @override
  String get adjustment => '조정';

  @override
  String get monthsNominative => '1월,2월,3월,4월,5월,6월,7월,8월,9월,10월,11월,12월';

  @override
  String get paymentsEmpty => '아직 결제 내역이 없습니다';

  @override
  String get payAtReception => '안내 데스크에서 납부하세요';

  @override
  String get payAtReceptionHint => '현금 또는 카드';

  @override
  String get coinHistoryEmpty => '아직 코인이 없습니다';

  @override
  String get sourceAttendance => '수업 출석';

  @override
  String get sourcePerfectMonth => '개근 보너스';

  @override
  String get sourceOnTime => '기한 내 납부';

  @override
  String get sourceReferral => '친구 등록';

  @override
  String get sourceTeacherAward => '선생님 지급';

  @override
  String get sourceTeacherDeduction => '선생님 차감';

  @override
  String get sourceAdjustment => '센터 조정';

  @override
  String get sourceRewardHold => '주문';

  @override
  String get sourceRewardReturn => '주문 환불';

  @override
  String get sourceGameWin => '게임 승리';

  @override
  String get sourceExam => '모의고사';

  @override
  String get voucherEmpty => '아직 바우처가 없습니다. 첫 모의고사를 마치면 받을 수 있습니다.';

  @override
  String get photo => '사진';

  @override
  String get changePhoto => '사진 변경';

  @override
  String get takePhoto => '카메라';

  @override
  String get chooseFromGallery => '갤러리';

  @override
  String get removePhoto => '사진 삭제';

  @override
  String get cropTitle => '사진 자르기';

  @override
  String get cropHint => '사진을 이동하고 확대하세요';

  @override
  String get done => '완료';

  @override
  String get photoFailed => '사진을 저장하지 못했습니다. 다시 시도하세요';

  @override
  String get photoSaved => '사진을 저장했습니다';

  @override
  String get changePhone => '전화번호 변경';

  @override
  String get newPhone => '새 전화번호';

  @override
  String get phoneChangeHint => '새 번호로 SMS 코드를 보내 드립니다. 코드를 확인하면 번호가 변경됩니다.';

  @override
  String get phoneSame => '현재 사용 중인 번호입니다';

  @override
  String get phoneChanged => '전화번호를 변경했습니다';

  @override
  String get changePassword => '비밀번호 변경';

  @override
  String get staffOnlyHint => '이름, 생년월일, 학부모 정보는 센터 직원만 변경할 수 있습니다.';

  @override
  String get birthDate => '생년월일';

  @override
  String get parentName => '학부모';

  @override
  String get parentPhone => '학부모 전화번호';

  @override
  String fullDate(String day, int year) {
    return '$year년 $day';
  }

  @override
  String weekInMonth(int from, int to, String month) {
    return '$month $from–$to일';
  }

  @override
  String get myOrders => '내 주문';

  @override
  String get shopEmpty => '아직 상품이 없습니다';

  @override
  String get soldOut => '품절';

  @override
  String moreCoinsNeeded(String coins) {
    return '$coins 더 필요';
  }

  @override
  String get shopJoinBanner => '코인을 쓰려면 센터에 등록하세요';

  @override
  String get freeLesson => '무료 수업';

  @override
  String get shopVariant => '옵션';

  @override
  String get chooseVariant => '옵션을 선택하세요';

  @override
  String unitsLeft(int count) {
    return '$count개 남음';
  }

  @override
  String get orderAction => '주문하기';

  @override
  String get confirmOrderTitle => '주문 확인';

  @override
  String get balanceNow => '현재 잔액';

  @override
  String get balanceAfter => '주문 후';

  @override
  String get pickupNote => '상품은 안내 데스크에서 받습니다';

  @override
  String get orderPlaced => '주문이 접수되었습니다';

  @override
  String get orderRequested => '요청됨';

  @override
  String get orderReady => '수령 준비 완료';

  @override
  String get orderGiven => '수령 완료';

  @override
  String get orderRejected => '거절됨';

  @override
  String get orderCancelled => '취소됨';

  @override
  String get pickupNow => '안내 데스크에서 받아 가세요';

  @override
  String givenOn(String date) {
    return '수령 완료, $date';
  }

  @override
  String get coinsReturned => '코인이 반환되었습니다';

  @override
  String get orderCancelDone => '주문이 취소되고 코인이 반환되었습니다';

  @override
  String get cancelOrder => '주문 취소';

  @override
  String get ordersEmpty => '아직 주문이 없습니다';

  @override
  String get shopErrorCoins => '코인이 부족합니다';

  @override
  String get shopErrorSoldOut => '죄송합니다, 품절되었습니다';

  @override
  String get shopErrorNotOnOffer => '더 이상 제공되지 않는 상품입니다';

  @override
  String get shopErrorTooLate => '이 주문은 더 이상 취소할 수 없습니다';

  @override
  String get productGone => '상품을 찾을 수 없습니다';

  @override
  String get qrRotates => '코드는 30초마다 바뀝니다';

  @override
  String get qrShowAtReception => '안내 데스크에서 보여 주세요';

  @override
  String get qrWorksOffline => '인터넷 없이도 작동합니다';

  @override
  String qrTodayArrived(String time) {
    return '오늘: $time 등원';
  }

  @override
  String qrTodayLeft(String time) {
    return '오늘: $time 하원';
  }

  @override
  String get qrTodayNone => '오늘 아직 등원하지 않음';

  @override
  String get qrLockedTitle => 'QR 코드는 센터 학생용입니다';

  @override
  String get qrLockedHint => '센터에 등록하면 사용할 수 있습니다';

  @override
  String get qrBookFreeLesson => '무료 공개 수업 신청';

  @override
  String get qrNeedsInternet => '코드를 처음 받으려면 인터넷에 연결하세요';

  @override
  String get qrCodeLabel => '센터 출입용 QR 코드';
}
