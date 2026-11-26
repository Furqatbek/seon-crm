// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Russian (`ru`).
class AppLocalizationsRu extends AppLocalizations {
  AppLocalizationsRu([String locale = 'ru']) : super(locale);

  @override
  String get appName => 'Seon Topik Student';

  @override
  String get welcomeHeadline => 'Практикуйте корейский и готовьтесь к TOPIK';

  @override
  String get createAccount => 'Регистрация';

  @override
  String get signIn => 'Войти';

  @override
  String get chooseLanguage => 'Выберите язык';

  @override
  String get languageUz => 'Oʻzbekcha';

  @override
  String get languageRu => 'Русский';

  @override
  String get languageEn => 'English';

  @override
  String get languageKo => '한국어';

  @override
  String get back => 'Назад';

  @override
  String get fullName => 'Имя и фамилия';

  @override
  String get phone => 'Номер телефона';

  @override
  String get password => 'Пароль';

  @override
  String get showPassword => 'Показать пароль';

  @override
  String get hidePassword => 'Скрыть пароль';

  @override
  String get koreanLevel => 'Ваш уровень корейского';

  @override
  String get levelBeginner => 'Начинающий';

  @override
  String get levelTopik1 => 'TOPIK I';

  @override
  String get levelTopik2 => 'TOPIK II';

  @override
  String get continueAction => 'Продолжить';

  @override
  String get consentBefore => 'Продолжая, вы соглашаетесь с ';

  @override
  String get consentLink => 'политикой конфиденциальности';

  @override
  String get consentAfter => '';

  @override
  String get privacyPolicy => 'Политика конфиденциальности';

  @override
  String get privacyEmpty => 'Политика конфиденциальности ещё не добавлена.';

  @override
  String get errorNameRequired => 'Введите имя и фамилию';

  @override
  String get errorPhoneInvalid => 'Введите номер телефона полностью';

  @override
  String get errorPasswordShort => 'В пароле должно быть не меньше 8 символов';

  @override
  String get errorPasswordRequired => 'Введите пароль';

  @override
  String get errorLevelRequired => 'Выберите свой уровень';

  @override
  String get errorPasswordsDiffer => 'Пароли не совпадают';

  @override
  String get smsCodeTitle => 'Код из SMS';

  @override
  String get smsCodeSentBefore => 'Мы отправили 6-значный код на ';

  @override
  String get smsCodeSentAfter => '';

  @override
  String get smsCodeField => '6-значный код';

  @override
  String resendIn(String time) {
    return 'Отправить код ещё раз ($time)';
  }

  @override
  String get resend => 'Отправить код ещё раз';

  @override
  String get codeResent => 'Код отправлен ещё раз';

  @override
  String get confirm => 'Подтвердить';

  @override
  String errorWrongCode(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Неверный код. Осталось $count попытки',
      many: 'Неверный код. Осталось $count попыток',
      few: 'Неверный код. Осталось $count попытки',
      one: 'Неверный код. Осталась $count попытка',
      zero: 'Неверный код. Запросите новый',
    );
    return '$_temp0';
  }

  @override
  String errorTooManySms(int minutes) {
    return 'Слишком много SMS. Попробуйте через $minutes мин.';
  }

  @override
  String get errorAlreadyRegistered => 'Этот номер уже зарегистрирован';

  @override
  String get errorInvalidCredentials => 'Неверный номер или пароль';

  @override
  String get errorNoAccount => 'Аккаунт с этим номером не найден';

  @override
  String get errorPhoneNotSupported => 'Принимаются только номера Узбекистана';

  @override
  String get errorNetwork => 'Нет подключения к интернету. Попробуйте ещё раз';

  @override
  String get errorGeneric => 'Что-то пошло не так. Попробуйте ещё раз';

  @override
  String get linkedTitle => 'Ваш аккаунт привязан к центру';

  @override
  String get start => 'Начать';

  @override
  String get forgotPassword => 'Забыли пароль?';

  @override
  String get resetPassword => 'Сброс пароля';

  @override
  String get resetHint => 'Введите номер телефона — мы отправим код по SMS';

  @override
  String get sendCode => 'Отправить код';

  @override
  String get newPassword => 'Новый пароль';

  @override
  String get repeatPassword => 'Повторите пароль';

  @override
  String get save => 'Сохранить';

  @override
  String get passwordSaved => 'Пароль сохранён';

  @override
  String get tabHome => 'Главная';

  @override
  String get tabGame => 'Игра';

  @override
  String get tabQr => 'QR-код';

  @override
  String get tabShop => 'Магазин';

  @override
  String get tabMore => 'Ещё';

  @override
  String get soonTitle => 'Скоро';

  @override
  String get notifications => 'Уведомления';

  @override
  String get logOut => 'Выйти';

  @override
  String money(String amount) {
    return '$amount сум';
  }

  @override
  String coinsCount(int count, String formatted) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$formatted монеты',
      many: '$formatted монет',
      few: '$formatted монеты',
      one: '$formatted монета',
    );
    return '$_temp0';
  }

  @override
  String greeting(String name) {
    return 'Привет, $name';
  }

  @override
  String unreadCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count непрочитанного уведомления',
      many: '$count непрочитанных уведомлений',
      few: '$count непрочитанных уведомления',
      one: '$count непрочитанное уведомление',
      zero: 'Нет непрочитанных уведомлений',
    );
    return '$_temp0';
  }

  @override
  String get chooseGroup => 'Выберите группу';

  @override
  String get offlineBanner => 'Нет подключения к интернету. Данные могут быть устаревшими.';

  @override
  String get loadFailedBanner => 'Не удалось обновить данные. Потяните вниз, чтобы попробовать ещё раз.';

  @override
  String get retry => 'Повторить';

  @override
  String get nextLesson => 'Следующий урок';

  @override
  String get exam => 'Экзамен';

  @override
  String get nothingScheduled => 'Ближайших уроков нет';

  @override
  String get today => 'Сегодня';

  @override
  String get tomorrow => 'Завтра';

  @override
  String get yesterday => 'Вчера';

  @override
  String get earlier => 'Ранее';

  @override
  String dayAtTime(String day, String time) {
    return '$day, $time';
  }

  @override
  String roomNumber(String room) {
    return 'каб. $room';
  }

  @override
  String get weekdays => 'Понедельник,Вторник,Среда,Четверг,Пятница,Суббота,Воскресенье';

  @override
  String get months => 'января,февраля,марта,апреля,мая,июня,июля,августа,сентября,октября,ноября,декабря';

  @override
  String dayMonth(int day, String month) {
    return '$day $month';
  }

  @override
  String inDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'через $count дня',
      many: 'через $count дней',
      few: 'через $count дня',
      one: 'через $count день',
    );
    return '$_temp0';
  }

  @override
  String inHoursMinutes(int hours, int minutes) {
    return 'через $hours ч $minutes мин';
  }

  @override
  String inHours(int hours) {
    return 'через $hours ч';
  }

  @override
  String inMinutes(int minutes) {
    return 'через $minutes мин';
  }

  @override
  String get startingNow => 'Начинается сейчас';

  @override
  String get rankInGroup => 'Место в группе';

  @override
  String rankPlace(int rank) {
    return '$rank-е место';
  }

  @override
  String rankOf(int count) {
    return 'из $count, в этом месяце';
  }

  @override
  String get rankNone => 'В этом месяце рейтинга пока нет';

  @override
  String get coins => 'Монеты';

  @override
  String coinsThisWeek(String count) {
    return '+$count за неделю';
  }

  @override
  String get balance => 'Баланс';

  @override
  String get balancePaid => 'Оплачено';

  @override
  String nextPaymentOn(String date) {
    return 'следующая оплата $date';
  }

  @override
  String balanceDueBy(String date) {
    return 'оплатите до $date';
  }

  @override
  String balanceDebtSince(String date) {
    return 'долг, срок был $date';
  }

  @override
  String get attendance => 'Посещаемость';

  @override
  String get thisMonth => 'в этом месяце';

  @override
  String get noLessonsYet => 'В этом месяце уроков ещё не было';

  @override
  String levelPill(String level) {
    return 'Уровень: $level';
  }

  @override
  String get mockExamTitle => 'Пробный экзамен';

  @override
  String get mockExamSoon => 'Скоро здесь появятся тренировочные экзамены в формате TOPIK.';

  @override
  String get lockedCoins => 'Заблокированные монеты';

  @override
  String get lockedCoinsHint => 'Откроются, когда вы присоединитесь к центру';

  @override
  String get openLessonTitle => 'Бесплатный открытый урок';

  @override
  String get openLessonSoon => 'Запись на открытые уроки скоро появится здесь.';

  @override
  String get bookOpenLesson => 'Записаться на бесплатный урок';

  @override
  String get voucherTitle => 'Вам подарок!';

  @override
  String voucherPercent(int percent) {
    return 'Скидка $percent% на первый месяц';
  }

  @override
  String voucherFixed(String amount) {
    return 'Скидка $amount на первый месяц';
  }

  @override
  String get voucherTrialWeek => 'Бесплатная пробная неделя';

  @override
  String validUntil(String date) {
    return 'до $date';
  }

  @override
  String get markAllRead => 'Отметить все как прочитанные';

  @override
  String get notificationsEmpty => 'Уведомлений пока нет';

  @override
  String get unread => 'Не прочитано';

  @override
  String get editProfile => 'Редактировать профиль';

  @override
  String get leaderboard => 'Рейтинг';

  @override
  String get schedule => 'Расписание';

  @override
  String get payments => 'Оплаты';

  @override
  String get coinHistory => 'История монет';

  @override
  String get myVoucher => 'Мой ваучер';

  @override
  String get openLessons => 'Открытые уроки';

  @override
  String get language => 'Язык';

  @override
  String get appearance => 'Оформление';

  @override
  String get themeSystem => 'Системная';

  @override
  String get themeLight => 'Светлая';

  @override
  String get themeDark => 'Тёмная';

  @override
  String get aboutCentre => 'О центре';

  @override
  String get aboutEmpty => 'Информация о центре ещё не добавлена.';

  @override
  String get deleteAccount => 'Удалить аккаунт';

  @override
  String get deleteWillBeDeleted => 'Будет удалено';

  @override
  String get deleteLogin => 'Вход в аккаунт';

  @override
  String get deleteCoins => 'Монеты';

  @override
  String get deleteResults => 'Результаты';

  @override
  String get deleteBookings => 'Записи на открытые уроки';

  @override
  String get deleteKept => 'Останется в центре';

  @override
  String get deletePaymentRecords => 'Записи об оплатах';

  @override
  String get deleteAction => 'Удалить';

  @override
  String get cancel => 'Отмена';

  @override
  String get deleteFailed => 'Не удалось удалить аккаунт. Попробуйте ещё раз';

  @override
  String you(String name) {
    return '$name (вы)';
  }

  @override
  String get scopeGroup => 'Моя группа';

  @override
  String get scopeCentre => 'Центр';

  @override
  String get periodMonth => 'Этот месяц';

  @override
  String get periodAll => 'За всё время';

  @override
  String ofPeople(int count) {
    return 'из $count';
  }

  @override
  String get leaderboardEmpty => 'Рейтинг пока пуст';

  @override
  String get noGroupYet => 'Вы пока не в группе';

  @override
  String get weekdaysShort => 'Пн,Вт,Ср,Чт,Пт,Сб,Вс';

  @override
  String weekRange(String from, String to) {
    return '$from – $to';
  }

  @override
  String get previousWeek => 'Предыдущая неделя';

  @override
  String get nextWeek => 'Следующая неделя';

  @override
  String dayWithDate(String weekday, String date) {
    return '$weekday, $date';
  }

  @override
  String get cancelled => 'Отменён';

  @override
  String get noLessonsThisWeek => 'На этой неделе уроков нет';

  @override
  String timeRange(String from, String to) {
    return '$from–$to';
  }

  @override
  String nextPaymentBy(String date) {
    return 'Следующая оплата до $date';
  }

  @override
  String get balanceDue => 'Ожидается оплата';

  @override
  String get balanceDebt => 'Долг';

  @override
  String get payByCard => 'Оплатить картой';

  @override
  String get myReceipts => 'Мои чеки';

  @override
  String get comingSoon => 'Скоро появится';

  @override
  String get paymentReceived => 'Оплата принята';

  @override
  String receiptLine(String date, String number) {
    return '$date · квитанция №$number';
  }

  @override
  String monthFee(String month) {
    return 'Оплата за $month';
  }

  @override
  String chargedLine(String date) {
    return '$date · начислено';
  }

  @override
  String get adjustment => 'Корректировка';

  @override
  String get monthsNominative => 'Январь,Февраль,Март,Апрель,Май,Июнь,Июль,Август,Сентябрь,Октябрь,Ноябрь,Декабрь';

  @override
  String get paymentsEmpty => 'Оплат пока нет';

  @override
  String get payAtReception => 'Оплатите на ресепшене';

  @override
  String get payAtReceptionHint => 'Наличными или картой';

  @override
  String get coinHistoryEmpty => 'Монет пока нет';

  @override
  String get sourceAttendance => 'Пришёл на урок';

  @override
  String get sourcePerfectMonth => 'Месяц без пропусков';

  @override
  String get sourceOnTime => 'Оплата вовремя';

  @override
  String get sourceReferral => 'Друг записался';

  @override
  String get sourceTeacherAward => 'От учителя';

  @override
  String get sourceTeacherDeduction => 'Снято учителем';

  @override
  String get sourceAdjustment => 'Корректировка центра';

  @override
  String get sourceRewardHold => 'Заказ';

  @override
  String get sourceRewardReturn => 'Заказ возвращён';

  @override
  String get sourceGameWin => 'Победа в игре';

  @override
  String get sourceExam => 'Пробный экзамен';

  @override
  String get voucherEmpty => 'У вас пока нет ваучера. Он появится после первого пробного экзамена.';

  @override
  String get photo => 'Фото';

  @override
  String get changePhoto => 'Изменить фото';

  @override
  String get takePhoto => 'Камера';

  @override
  String get chooseFromGallery => 'Галерея';

  @override
  String get removePhoto => 'Удалить фото';

  @override
  String get cropTitle => 'Обрезать фото';

  @override
  String get cropHint => 'Двигайте и увеличивайте фото';

  @override
  String get done => 'Готово';

  @override
  String get photoFailed => 'Не удалось сохранить фото. Попробуйте ещё раз';

  @override
  String get photoSaved => 'Фото сохранено';

  @override
  String get changePhone => 'Изменить номер телефона';

  @override
  String get newPhone => 'Новый номер телефона';

  @override
  String get phoneChangeHint => 'Мы отправим код на новый номер. Номер изменится после подтверждения кода.';

  @override
  String get phoneSame => 'Это ваш текущий номер';

  @override
  String get phoneChanged => 'Номер телефона изменён';

  @override
  String get changePassword => 'Изменить пароль';

  @override
  String get staffOnlyHint => 'Имя, дату рождения и данные родителей меняют только сотрудники центра.';

  @override
  String get birthDate => 'Дата рождения';

  @override
  String get parentName => 'Родитель';

  @override
  String get parentPhone => 'Телефон родителя';

  @override
  String fullDate(String day, int year) {
    return '$day $year';
  }

  @override
  String weekInMonth(int from, int to, String month) {
    return '$from–$to $month';
  }

  @override
  String get myOrders => 'Мои заказы';

  @override
  String get shopEmpty => 'Пока подарков нет';

  @override
  String get soldOut => 'Закончилось';

  @override
  String moreCoinsNeeded(String coins) {
    return 'Нужно ещё $coins';
  }

  @override
  String get shopJoinBanner => 'Чтобы тратить монеты, запишитесь в центр';

  @override
  String get freeLesson => 'Бесплатный урок';

  @override
  String get shopVariant => 'Вариант';

  @override
  String get chooseVariant => 'Выберите вариант';

  @override
  String unitsLeft(int count) {
    return 'Осталось: $count шт.';
  }

  @override
  String get orderAction => 'Заказать';

  @override
  String get confirmOrderTitle => 'Подтвердите заказ';

  @override
  String get balanceNow => 'Сейчас на балансе';

  @override
  String get balanceAfter => 'После заказа';

  @override
  String get pickupNote => 'Заказ вы заберёте на ресепшене';

  @override
  String get orderPlaced => 'Заказ принят';

  @override
  String get orderRequested => 'Запрошен';

  @override
  String get orderReady => 'Готов к выдаче';

  @override
  String get orderGiven => 'Выдан';

  @override
  String get orderRejected => 'Отклонён';

  @override
  String get orderCancelled => 'Отменён';

  @override
  String get pickupNow => 'Заберите на ресепшене';

  @override
  String givenOn(String date) {
    return 'Выдан, $date';
  }

  @override
  String get coinsReturned => 'Монеты возвращены';

  @override
  String get orderCancelDone => 'Заказ отменён, монеты возвращены';

  @override
  String get cancelOrder => 'Отменить заказ';

  @override
  String get ordersEmpty => 'Заказов пока нет';

  @override
  String get shopErrorCoins => 'Не хватает монет';

  @override
  String get shopErrorSoldOut => 'К сожалению, это закончилось';

  @override
  String get shopErrorNotOnOffer => 'Этого подарка больше нет';

  @override
  String get shopErrorTooLate => 'Этот заказ уже нельзя отменить';

  @override
  String get productGone => 'Подарок не найден';

  @override
  String get qrRotates => 'Код обновляется каждые 30 секунд';

  @override
  String get qrShowAtReception => 'Покажите это на ресепшене';

  @override
  String get qrWorksOffline => 'Работает и без интернета';

  @override
  String qrTodayArrived(String time) {
    return 'Сегодня: пришёл(ла) в $time';
  }

  @override
  String qrTodayLeft(String time) {
    return 'Сегодня: ушёл(ла) в $time';
  }

  @override
  String get qrTodayNone => 'Сегодня ещё не приходил(а)';

  @override
  String get qrLockedTitle => 'QR-код — для учеников центра';

  @override
  String get qrLockedHint => 'Заработает, когда вы запишетесь в центр';

  @override
  String get qrBookFreeLesson => 'Записаться на бесплатный открытый урок';

  @override
  String get qrNeedsInternet => 'Чтобы получить код в первый раз, подключитесь к интернету';

  @override
  String get qrCodeLabel => 'QR-код для входа в центр';

  @override
  String get gameZone => 'Игровая зона';

  @override
  String get gameDuel => '1 на 1';

  @override
  String get gameExams => 'Пробные экзамены';

  @override
  String get gameExamsSoon => 'Пробные экзамены скоро появятся здесь.';

  @override
  String gamePitch(String coins) {
    return 'Дуэль 1 на 1. Победитель получает $coins.';
  }

  @override
  String get gamePitchNoCoins => 'Дуэль 1 на 1: 10 вопросов, перетяните канат на свою сторону.';

  @override
  String get gameNoCoinsAppUser => 'Монеты не начисляются, пока вы не запишетесь в центр';

  @override
  String get gamePlayNow => 'Играть сейчас';

  @override
  String get gameChallenge => 'Вызвать одноклассника';

  @override
  String get gameBankNotReady => 'В этом предмете пока мало вопросов';

  @override
  String gameRewardedWins(int done, int of) {
    return 'Побед с наградой сегодня: $done/$of';
  }

  @override
  String get gameRecent => 'Последние игры';

  @override
  String get gameRecentEmpty => 'Игр пока не было';

  @override
  String get gameWin => 'Победа';

  @override
  String get gameLoss => 'Поражение';

  @override
  String get gameDraw => 'Ничья';

  @override
  String get gameComputer => 'Компьютер';

  @override
  String get gameSearching => 'Ищем соперника…';

  @override
  String get gameNobodyFree => 'Сейчас нет свободного соперника';

  @override
  String get gamePractice => 'Тренировка с компьютером';

  @override
  String get gamePracticeNoCoins => 'За тренировку монеты не даются';

  @override
  String get gameWaitMore => 'Подождать ещё';

  @override
  String get gameInvite => 'Вызвать';

  @override
  String get gameInviteWaiting => 'Ждём ответа…';

  @override
  String gameInviteDeclined(String name) {
    return '$name отклонил(а) вызов';
  }

  @override
  String gameInviteExpired(String name) {
    return '$name не ответил(а)';
  }

  @override
  String get gameClassmatesEmpty => 'В этой группе пока нет одноклассников с приложением';

  @override
  String get gameSearchHint => 'Поиск';

  @override
  String gameInvitedYou(String name) {
    return '$name вызывает вас на игру';
  }

  @override
  String get gameAccept => 'Принять';

  @override
  String get gameDecline => 'Отклонить';

  @override
  String get gameInviteGone => 'Вызов больше не действует';

  @override
  String get gameInMatch => 'Вы сейчас в игре';

  @override
  String get gameGetReady => 'Приготовьтесь';

  @override
  String gameQuestionOf(int n, int of) {
    return '$n/$of';
  }

  @override
  String get gameCorrect => 'Верно!';

  @override
  String get gameCorrectFaster => 'Верно! Вы были быстрее';

  @override
  String get gameCorrectSlower => 'Верно, но соперник был быстрее';

  @override
  String get gameWrong => 'Неверно';

  @override
  String get gameTimeUp => 'Время вышло';

  @override
  String get gameOpponentAnswered => 'Соперник ответил';

  @override
  String get gameWaitingOpponent => 'Ждём ответа соперника…';

  @override
  String get gameReconnecting => 'Связь потеряна. Переподключаемся…';

  @override
  String get gameMatchGone => 'Эта игра не найдена';

  @override
  String get gameCancelled => 'Игра отменена';

  @override
  String get gameBackToLobby => 'Назад в игровую зону';

  @override
  String get gameWinTitle => 'Победа!';

  @override
  String get gameLossTitle => 'Поражение';

  @override
  String get gameDrawTitle => 'Ничья';

  @override
  String get gameForfeitWin => 'Соперник покинул игру';

  @override
  String get gameForfeitLoss => 'Игра завершена из-за потери связи';

  @override
  String gameCorrectAnswers(int you, int opponent) {
    return 'Верных ответов: $you – $opponent';
  }

  @override
  String get gameLimitReached => 'Дневной лимит исчерпан — монеты не начислены';

  @override
  String get gameOpponentNotStudent => 'Соперник не ученик центра — монеты не начислены';

  @override
  String get gamePlayAgain => 'Играть ещё';

  @override
  String get gameSeeQuestions => 'Посмотреть вопросы';

  @override
  String get gameQuestions => 'Вопросы';

  @override
  String get gameRightAnswer => 'Верный ответ:';

  @override
  String gameYourAnswer(String answer) {
    return 'Ваш ответ: $answer';
  }

  @override
  String get gameNoAnswer => 'Без ответа';

  @override
  String get gameYou => 'Вы';

  @override
  String gameRopeLabel(int position) {
    return 'Канат: $position';
  }

  @override
  String gameSecondsLeft(int seconds) {
    return 'Осталось секунд: $seconds';
  }
}
