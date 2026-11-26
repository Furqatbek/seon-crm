import 'package:flutter/services.dart';

// Uzbek phone numbers: +998 and nine digits, shown as "+998 93 555 12 34".

const phonePrefix = '+998';

/// The nine digits after +998, from whatever was typed.
String phoneDigits(String text) {
  var digits = text.replaceAll(RegExp(r'\D'), '');
  if (digits.startsWith('998')) digits = digits.substring(3);
  return digits.length > 9 ? digits.substring(0, 9) : digits;
}

/// "+998 93 555 12 34", as far as the digits go.
String formatPhone(String text) {
  final digits = phoneDigits(text);
  final out = StringBuffer(phonePrefix);
  for (var i = 0; i < digits.length; i++) {
    if (i == 0 || i == 2 || i == 5 || i == 7) out.write(' ');
    out.write(digits[i]);
  }
  return out.toString();
}

/// "+998935551234" when the number is whole, else null.
String? fullPhone(String text) {
  final digits = phoneDigits(text);
  return digits.length == 9 ? '$phonePrefix$digits' : null;
}

/// Keeps the +998 mask while the person types.
class PhoneInputFormatter extends TextInputFormatter {
  const PhoneInputFormatter();

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    // Deleting the space before a group also takes the digit before it.
    var digits = phoneDigits(newValue.text);
    if (newValue.text.length < oldValue.text.length && digits == phoneDigits(oldValue.text) && digits.isNotEmpty) {
      digits = digits.substring(0, digits.length - 1);
    }
    final text = formatPhone(digits);
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
