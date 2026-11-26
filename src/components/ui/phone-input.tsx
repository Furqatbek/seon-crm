"use client";

import * as React from "react";

import {
  formatNationalPhone,
  nationalPhoneDigits,
  PHONE_COUNTRY_CODE,
} from "@/lib/format";
import { cn } from "@/lib/utils";

import { Input } from "./input";

/**
 * A phone field for Uzbekistan: the country code +998 is always there and
 * cannot be removed; the person types the nine digits after it. A pasted
 * full number loses its own +998. `onChange` gets the whole number
 * ("+998901234567"), or "" while nothing is typed.
 */
function PhoneInput({
  value,
  onChange,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div data-slot="phone-input" className={cn("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-text-secondary numeric">
        {PHONE_COUNTRY_CODE}
      </span>
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="90 123 45 67"
        className="numeric pl-14"
        {...props}
        value={formatNationalPhone(nationalPhoneDigits(value))}
        onChange={(event) => {
          const digits = nationalPhoneDigits(event.target.value);
          onChange(digits ? `${PHONE_COUNTRY_CODE}${digits}` : "");
        }}
      />
    </div>
  );
}

export { PhoneInput };
