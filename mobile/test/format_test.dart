import 'package:flutter_test/flutter_test.dart';
import 'package:student/core/format.dart';
import 'package:student/core/phone.dart';

import 'support/harness.dart';

void main() {
  group('formatMoney', () {
    test('writes whole soʻm as the CRM does, in each language', () {
      expect(formatMoney(1250000, l10n('uz')), '1 250 000 soʻm');
      expect(formatMoney(1250000, l10n('ru')), '1 250 000 сум');
      expect(formatMoney(1250000, l10n('en')), 'UZS 1,250,000');
      expect(formatMoney(1250000, l10n('ko')), '1,250,000숨');
    });

    test('groups by three from the right, whatever the length', () {
      final uz = l10n('uz');
      expect(formatMoney(0, uz), '0 soʻm');
      expect(formatMoney(999, uz), '999 soʻm');
      expect(formatMoney(1000, uz), '1 000 soʻm');
      expect(formatMoney(100000, uz), '100 000 soʻm');
      expect(formatMoney(12345678901, uz), '12 345 678 901 soʻm');
    });

    test('a debt has a real minus sign in front', () {
      expect(formatMoney(-450000, l10n('uz')), '−450 000 soʻm');
      expect(formatMoney(-450000, l10n('en')), '−UZS 450,000');
    });

    test('Uzbek uses ʻ (U+02BB), never a straight apostrophe', () {
      expect(formatMoney(1, l10n('uz')), contains('ʻ'));
      expect(formatMoney(1, l10n('uz')), isNot(contains("'")));
    });
  });

  group('formatCoins', () {
    test('tanga, монеты, coins and 코인', () {
      expect(formatCoins(128, l10n('uz')), '128 tanga');
      expect(formatCoins(128, l10n('ru')), '128 монет');
      expect(formatCoins(128, l10n('en')), '128 coins');
      expect(formatCoins(128, l10n('ko')), '128코인');
    });

    test('Russian and English agree with the number', () {
      final ru = l10n('ru');
      expect(formatCoins(1, ru), '1 монета');
      expect(formatCoins(2, ru), '2 монеты');
      expect(formatCoins(5, ru), '5 монет');
      expect(formatCoins(11, ru), '11 монет');
      expect(formatCoins(21, ru), '21 монета');
      expect(formatCoins(104, ru), '104 монеты');
      expect(formatCoins(1, l10n('en')), '1 coin');
      expect(formatCoins(0, l10n('en')), '0 coins');
    });

    test('large and negative numbers', () {
      expect(formatCoins(12500, l10n('uz')), '12 500 tanga');
      expect(formatCoins(12500, l10n('en')), '12,500 coins');
      expect(formatCoins(-5, l10n('uz')), '−5 tanga');
      expect(formatCoins(-1, l10n('en')), '−1 coin');
    });
  });

  group('phone', () {
    test('is shown behind the +998 mask as it is typed', () {
      expect(formatPhone(''), '+998');
      expect(formatPhone('9'), '+998 9');
      expect(formatPhone('93555'), '+998 93 555');
      expect(formatPhone('935551234'), '+998 93 555 12 34');
      expect(formatPhone('+998935551234'), '+998 93 555 12 34');
      expect(formatPhone('93555123499'), '+998 93 555 12 34');
    });

    test('is whole only with nine digits after +998', () {
      expect(fullPhone('+998 93 555 12 34'), '+998935551234');
      expect(fullPhone('+998 93 555 12 3'), isNull);
      expect(fullPhone('+998'), isNull);
    });
  });
}
