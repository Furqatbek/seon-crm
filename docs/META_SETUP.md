# Connecting Facebook and Instagram lead ads

When someone fills in a lead form in a Facebook or Instagram ad, the CRM can receive that lead within moments: it lands in the shared inbox on the Leads page and staff get the usual Telegram alert.

Setting this up takes two things: a **Meta app** that belongs to your centre (made once, by whoever looks after the CRM), and the **owner connecting the centre's Page** in Settings → Integrations.

Meta's part is the slow one. Reading real leads needs Meta's approval (App Review) and a verified business, which can take from a few days to a few weeks. Start it early. Until it is approved, use the [fallback through Make or Zapier](#until-app-review-passes-make-or-zapier).

Meta changes the names and places of things in its dashboards from time to time. If a button is not where this page says, look for the same idea nearby; Meta's own documentation ("Webhooks for Leadgen", "Retrieving Leads") is the last word.

## What you need before you start

- The CRM deployed on its public address with HTTPS, and the forms address working (`FORMS_HOST`, see the main setup notes).
- A Facebook account that is an **admin of the centre's Facebook Page**. An Instagram account that runs lead ads must be linked to that Page.
- A **Meta Business portfolio** (Business Manager) that owns the Page. Business Verification is done on this.

## 1. Create the Meta app

1. Open [developers.facebook.com](https://developers.facebook.com), sign in, and choose **My Apps → Create App**.
2. Pick a use case that offers leads or "Other", and the app type **Business**. Attach it to your Business portfolio.
3. In **App settings → Basic**, note the **App ID** and the **App secret**. Fill in the privacy policy address, the app icon and the category: App Review asks for them.
4. Add the product **Facebook Login for Business** (or Facebook Login). In its settings, under **Valid OAuth Redirect URIs**, add the return address shown in the CRM at Settings → Integrations → Setup. It looks like:

   ```text
   https://<your CRM address>/auth/meta/callback
   ```

## 2. Add the three settings to the CRM

Add these environment variables where the CRM is hosted (Vercel → Project → Settings → Environment Variables), then redeploy:

| Variable | Value |
| --- | --- |
| `META_APP_ID` | The App ID from step 1. |
| `META_APP_SECRET` | The App secret from step 1. Keep it secret. |
| `META_VERIFY_TOKEN` | A long random string you make up, for example the output of `openssl rand -hex 24`. |

Optional: `META_GRAPH_VERSION` (for example `v23.0`). Meta retires each Graph API version about two years after it comes out; if Meta's dashboard warns that the app calls a version that is going away, set this to a current one.

The Page's access token is **not** an environment variable. It is stored encrypted in Supabase Vault when the owner connects the Page.

## 3. Point Meta's webhook at the CRM

1. In the app's dashboard, add the product **Webhooks**.
2. Choose the object **Page** and press **Subscribe to this object** (or Edit subscription).
3. **Callback URL:** the webhook address shown in the CRM at Settings → Integrations → Setup. It is on the forms address:

   ```text
   https://<your forms address>/api/meta/webhook
   ```

4. **Verify token:** the same string you put in `META_VERIFY_TOKEN`.
5. Press **Verify and save**. Meta calls the address at once; it is accepted only if the token matches. If it fails, check that the CRM was redeployed after step 2 and that the address is the forms address, not the staff one.
6. In the list of Page fields, subscribe to **leadgen**.

You can check the address yourself. This should print `12345`:

```bash
curl "https://<your forms address>/api/meta/webhook?hub.mode=subscribe&hub.verify_token=<your verify token>&hub.challenge=12345"
```

## 4. Permissions, App Review and Business Verification

The CRM asks for these permissions when the owner connects a Page:

| Permission | What it is for |
| --- | --- |
| `leads_retrieval` | Reading the leads people submit. |
| `pages_manage_ads` | Reading the Page's lead forms. |
| `pages_show_list` | Listing the Pages the owner manages, to choose from. |
| `pages_read_engagement` | Reading the Page's basic details; the two above depend on it. |
| `pages_manage_metadata` | Subscribing the Page to "a lead was submitted" notifications. |

While the app is in **Development mode**, these work only for people who have a role on the app (admins, developers, testers) and only the made-up leads of Meta's testing tool arrive. To read real leads:

1. **Business Verification.** In Business settings → Security Centre (or Business info), start verification and upload what Meta asks for (registration documents, a phone number or domain it can check). This can take several days.
2. **App Review.** In the app's dashboard under **App Review → Permissions and Features**, request **Advanced Access** for each permission in the table. For each one Meta asks for:
   - a short description of how the app uses it — for example: "Our education centre runs lead ads. This app is our internal CRM. It reads leads submitted to our own Page's forms so that staff can call the person back.";
   - a screen recording showing the flow: the owner pressing Connect with Facebook in the CRM, choosing the Page, a lead being submitted (the testing tool is fine), and the lead appearing in the CRM;
   - sometimes a test login for the CRM. Give Meta a manager login made for this purpose and remove it afterwards.
3. When the permissions are approved, switch the app to **Live** mode (the toggle at the top of the app's dashboard).

If a request is refused, Meta says why; the usual reasons are a recording that does not show the permission in use, or a missing privacy policy.

## 5. Connect the Page in the CRM

The owner does this (it is not available to managers):

1. Open **Settings → Integrations** and press **Connect with Facebook**.
2. In Facebook's window, choose the centre's Page(s) and allow every permission it lists. Leaving one out makes the connection fail later.
3. Back in the CRM, tick the Page(s) and press **Connect**.

The CRM then stores the Page's long-lived token in Vault, subscribes the Page to lead notifications, and lists the Page's lead forms. For each form you can choose a **funnel**: one of the CRM's forms whose numbers these leads should count in (Leads → Forms and the "Leads by form" report). Leaving it at "No funnel" is fine; the lead still arrives.

If you make a new lead form in Ads Manager later, press **Refresh forms** to see it. Leads from a form that is not listed yet still arrive.

## 6. Send a test lead

1. Open Meta's **Lead Ads Testing Tool** (search for it on developers.facebook.com; it is under Marketing API → Tools).
2. Choose your Page and one of its forms, and press **Create lead**. If it says a test lead already exists, press **Delete lead** first.
3. Within a few seconds the tool's status should show the webhook was delivered.
4. In the CRM, open **Settings → Integrations**. Under **Recent requests from Meta** there should be a row **Test lead**.

The testing tool fills the form with placeholders ("<test lead: dummy data for phone_number>") instead of a real phone, so its lead is recorded as a test and does **not** appear on the Leads page. To see a real lead arrive, use **Preview form** on the form in Ads Manager (or the Instant Forms preview link), fill it in with a real name and phone, and submit it: that lead appears in the inbox on the Leads page like any other. Delete it afterwards.

## How it keeps working

- **Nothing is taken twice.** Meta sometimes delivers the same notification more than once. Each lead has Meta's own id, and a lead with an id the CRM has already seen is skipped.
- **Nothing is lost for long.** Once an hour the CRM reads the last 48 hours of leads from every listed form and takes any that a notification missed. This needs the scheduled job described in the main setup notes (`app_url` and `cron_secret` in Supabase Vault).
- **The same rules as every other lead.** A phone that already has an open lead is not duplicated: the existing lead goes back to the inbox with a note. A lead without a usable phone is refused and shown under Recent requests.
- **Needs reconnect.** If Meta stops accepting the Page's token (the owner changed their Facebook password, lost their role on the Page, or removed the app), the connection shows **Needs reconnect** and the owner gets a Telegram message (if their Telegram is linked in Profile). Press **Reconnect** and go through Facebook's window again; leads from the last 48 hours are then picked up by the hourly read.

## Until App Review passes: Make or Zapier

You do not have to wait for Meta's approval to get ad leads into the CRM. Automation services such as Make and Zapier already have approved Meta apps:

1. In the CRM, the owner opens **Settings → Lead sources**, adds a source called for example "Facebook via Make", and copies its key.
2. In Make or Zapier, create a scenario that starts with **Facebook Lead Ads → New Lead** for your Page and form.
3. Add an **HTTP → Make a request** step (in Zapier: Webhooks → POST):
   - URL: `https://<your forms address>/api/v1/leads?key=<the key>`
   - Method: POST, body type JSON or form data
   - Fields: map the lead's full name to `name` and its phone to `phone`; add anything else you want to keep under any name.
4. Turn the scenario on and submit a test lead.

Leads sent this way arrive with the source "Website" rather than "Facebook". The details of the address, the field names and the answers are in [INTAKE.md](INTAKE.md). When your own Meta app is approved and the Page is connected, switch the scenario off so that leads do not arrive twice.

## If something does not work

| What you see | What to check |
| --- | --- |
| "Verify and save" fails in Meta's Webhooks settings | `META_VERIFY_TOKEN` is set and the CRM was redeployed; the Callback URL is on the forms address and ends in `/api/meta/webhook`. |
| Facebook says the redirect address is not allowed | The return address from Settings → Integrations is listed exactly under Valid OAuth Redirect URIs. |
| "Connect" fails with a message about a permission | The owner unticked a permission in Facebook's window, or the app does not have that permission yet. Connect again and allow everything. |
| No Pages are listed after connecting | The Facebook account is not an admin of the Page, or the Page was not ticked in Facebook's window. |
| The testing tool shows the webhook as failed | `META_APP_SECRET` is wrong (the signature does not match), or the Page is not connected in the CRM. |
| Test leads arrive but real ones do not | The app is still in Development mode, or `leads_retrieval` does not have Advanced Access yet. |
| The Page shows Needs reconnect | Press Reconnect. The message under the status is what Meta said. |
