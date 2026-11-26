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
  String get homeStudentSoon => 'Здесь будут следующий урок, ваше место, монеты и баланс.';

  @override
  String get homeAppUserSoon => 'Здесь будут пробные экзамены, открытые уроки и ваш ваучер.';

  @override
  String get gameStudentSoon => 'Игра 1 на 1 и пробные экзамены. За победу — монеты.';

  @override
  String get gameAppUserSoon => 'Игра 1 на 1 и пробные экзамены. Монеты — после того, как вы присоединитесь к центру.';

  @override
  String get qrStudentSoon => 'Здесь будет ваш QR-код для отметки на ресепшене.';

  @override
  String get qrAppUserSoon => 'Вход по QR — только для учеников центра.';

  @override
  String get shopStudentSoon => 'Здесь можно будет обменять монеты на призы.';

  @override
  String get shopAppUserSoon => 'Призы можно будет посмотреть. Чтобы тратить монеты, присоединитесь к центру.';

  @override
  String get moreStudentSoon => 'Здесь будут профиль, рейтинг, расписание и оплаты.';

  @override
  String get moreAppUserSoon => 'Здесь будут профиль, ваучер и открытые уроки.';

  @override
  String get notifications => 'Уведомления';

  @override
  String get notificationsSoon => 'Здесь будут ваши уведомления.';

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
}
