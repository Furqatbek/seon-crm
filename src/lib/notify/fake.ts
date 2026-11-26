import type { Channel, MessageProvider, SendResult, SmsProvider } from "./types.ts";

/**
 * A provider for tests: remembers what it was asked to send and sends nothing.
 * `failFor` makes chosen recipients fail.
 */
export class FakeProvider implements MessageProvider {
  readonly sent: Array<{ recipient: string; body: string; buttons?: Array<Array<{ text: string; data?: string; url?: string }>> }> = [];
  readonly failFor = new Map<string, SendResult>();

  constructor(readonly channel: Channel) {}

  send(recipient: string, body: string): Promise<SendResult> {
    return this.sendWithButtons(recipient, body);
  }

  /** As the Telegram provider: a message that may carry buttons. */
  async sendWithButtons(recipient: string, body: string, buttons?: Array<Array<{ text: string; data?: string; url?: string }>>): Promise<SendResult> {
    const failure = this.failFor.get(recipient);
    if (failure) return failure;
    this.sent.push(buttons ? { recipient, body, buttons } : { recipient, body });
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
