// The few calls to Meta's Graph API this app makes. Behind an interface, so
// the tests never call Meta: they pass their own client.
// docs/META_SETUP.md lists the permissions each call needs.

/** The Graph API version used. Meta retires a version about two years after it comes out. */
export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";

/** The permissions asked for when the owner connects a Page. */
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_manage_ads", "leads_retrieval"] as const;

export type MetaLead = {
  id: string;
  /** ISO time the lead was submitted. */
  created_time?: string;
  form_id?: string;
  field_data?: Array<{ name: string; values: string[] }>;
};
export type MetaPage = { id: string; name: string; accessToken: string };
export type MetaForm = { id: string; name: string; status?: string };

/** Meta refused the call. `reconnect` is true when the token or its permissions are the reason. */
export class MetaError extends Error {
  constructor(
    message: string,
    readonly reconnect: boolean,
    readonly code?: number,
  ) {
    super(message);
    this.name = "MetaError";
  }
}

export interface MetaClient {
  /** One lead by its leadgen id, with a Page token. */
  lead(leadgenId: string, pageToken: string): Promise<MetaLead>;
  /** The leads a form received since a moment, newest first. */
  formLeads(formId: string, pageToken: string, since: Date): Promise<MetaLead[]>;
  /** A Page's lead forms. */
  forms(pageId: string, pageToken: string): Promise<MetaForm[]>;
  /** The Pages a person manages, each with its own token. */
  pages(userToken: string): Promise<MetaPage[]>;
  /** Subscribes the Page to "a lead was submitted" notifications for this app. */
  subscribe(pageId: string, pageToken: string): Promise<void>;
  /** The code from "Connect with Facebook" → a long-lived token of that person. */
  exchangeCode(code: string, redirectUri: string): Promise<string>;
}

// 190: the token is invalid or expired. 102: the session is. 10 and 200–299:
// a permission is missing. All mean: connect again.
const needsReconnect = (code: number | undefined) => code === 190 || code === 102 || code === 10 || (code !== undefined && code >= 200 && code <= 299);

export class GraphClient implements MetaClient {
  private readonly base: string;

  constructor(
    private readonly app: { id: string; secret: string },
    private readonly doFetch: typeof fetch = fetch,
    version: string = GRAPH_VERSION,
  ) {
    this.base = `https://graph.facebook.com/${version}`;
  }

  private async call<T>(method: "GET" | "POST", path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(path.startsWith("https://") ? path : `${this.base}${path}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    let response: Response;
    try {
      response = await this.doFetch(url, { method, cache: "no-store" });
    } catch (error) {
      throw new MetaError(`Meta could not be reached: ${error instanceof Error ? error.message : "request failed"}`, false);
    }
    const body = (await response.json().catch(() => null)) as { error?: { message?: string; code?: number; type?: string } } | null;
    if (!response.ok || body?.error) {
      const code = body?.error?.code;
      throw new MetaError(body?.error?.message ?? `Meta answered ${response.status}`, needsReconnect(code) || response.status === 401, code);
    }
    return body as T;
  }

  lead(leadgenId: string, pageToken: string) {
    return this.call<MetaLead>("GET", `/${leadgenId}`, { fields: "id,created_time,form_id,field_data", access_token: pageToken });
  }

  async formLeads(formId: string, pageToken: string, since: Date) {
    const leads: MetaLead[] = [];
    let page = await this.call<{ data?: MetaLead[]; paging?: { next?: string } }>("GET", `/${formId}/leads`, {
      fields: "id,created_time,form_id,field_data",
      filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(since.getTime() / 1000) }]),
      limit: "100",
      access_token: pageToken,
    });
    // At most five pages (500 leads) per run: the next run reads on.
    for (let read = 0; read < 5; read += 1) {
      leads.push(...(page.data ?? []));
      if (!page.paging?.next) break;
      page = await this.call("GET", page.paging.next, {});
    }
    return leads;
  }

  async forms(pageId: string, pageToken: string) {
    const result = await this.call<{ data?: MetaForm[] }>("GET", `/${pageId}/leadgen_forms`, { fields: "id,name,status", limit: "100", access_token: pageToken });
    return result.data ?? [];
  }

  async pages(userToken: string) {
    const result = await this.call<{ data?: Array<{ id: string; name: string; access_token?: string }> }>("GET", "/me/accounts", {
      fields: "id,name,access_token",
      limit: "100",
      access_token: userToken,
    });
    return (result.data ?? []).filter((page) => page.access_token).map((page) => ({ id: page.id, name: page.name, accessToken: page.access_token as string }));
  }

  async subscribe(pageId: string, pageToken: string) {
    await this.call("POST", `/${pageId}/subscribed_apps`, { subscribed_fields: "leadgen", access_token: pageToken });
  }

  async exchangeCode(code: string, redirectUri: string) {
    const short = await this.call<{ access_token: string }>("GET", "/oauth/access_token", {
      client_id: this.app.id,
      client_secret: this.app.secret,
      redirect_uri: redirectUri,
      code,
    });
    // A long-lived user token: the Page tokens made from it do not expire.
    const long = await this.call<{ access_token: string }>("GET", "/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: this.app.id,
      client_secret: this.app.secret,
      fb_exchange_token: short.access_token,
    });
    return long.access_token;
  }
}

/** Where "Connect with Facebook" sends the owner. */
export function loginUrl(appId: string, redirectUri: string, state: string, version: string = GRAPH_VERSION): string {
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}
