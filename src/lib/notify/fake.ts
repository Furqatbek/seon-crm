import type { Channel, MessageProvider, SendResult, SmsProvider } from "./types";

/**
 * A provider for tests: remembers what it was asked to send and sends nothing.
 * `failFor` makes chosen recipients fail.
 */
export class FakeProvider implements MessageProvider {
  readonly sent: Array<{ recipient: string; body: string }> = [];
  readonly failFor = new Map<string, SendResult>();

  constructor(readonly channel: Channel) {}

  async send(recipient: string, body: string): Promise<SendResult> {
    const failure = this.failFor.get(recipient);
    if (failure) return failure;
    this.sent.push({ recipient, body });
    return { ok: true };
  }
}

export class FakeSmsProvider extends FakeProvider implements SmsProvider {
  declare readonly channel: "sms";
  constructor() {
    super("sms");
  }
}

export function fakeProviders() {
  return { telegram: new FakeProvider("telegram"), sms: new FakeSmsProvider() };
}
