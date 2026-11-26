import '../l10n/app_localizations.dart';

// Money is whole soʻm as an int and coins are an int. Screens show them only
// through these two functions, which write them as the CRM does:
//   uz "1 250 000 soʻm" · ru "1 250 000 сум" · en "UZS 1,250,000" · ko "1,250,000숨"

const _minus = '−';

String _group(int value, String separator) {
  final digits = value.abs().toString();
  final out = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(separator);
    out.write(digits[i]);
  }
  return out.toString();
}

/// Thousands are split by a space in Uzbek and Russian, a comma in English and Korean.
String _separator(AppLocalizations l) => switch (l.localeName) {
  'en' || 'ko' => ',',
  _ => ' ',
};

/// Whole soʻm in the interface language. A debt is written with a real minus sign.
String formatMoney(int amount, AppLocalizations l) {
  final text = l.money(_group(amount, _separator(l)));
  return amount < 0 ? '$_minus$text' : text;
}

/// A number of coins with its word: "128 tanga", "128 монет", "128 coins", "128코인".
String formatCoins(int coins, AppLocalizations l) {
  final text = l.coinsCount(coins.abs(), _group(coins, _separator(l)));
  return coins < 0 ? '$_minus$text' : text;
}
