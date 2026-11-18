# Sending leads from a website

Your website, landing page or page builder can send its leads straight into the CRM. They arrive in the shared inbox on the Leads page, like leads from the CRM's own forms, and staff get the same Telegram alert.

This page is for whoever sets up the website. In the examples, replace `forms.yourcentre.uz` with your own forms address and `lk_…` with your key.

## Before you start

1. The owner opens **Settings → Lead sources** and presses **Add source**. Give it a name that says where the leads come from, for example "Main website".
2. The key is shown **once**. Copy it and keep it somewhere safe. If it is lost, add a new source and switch the old one off.
3. Use one source per website or landing page, so each can be switched off on its own and you can see which one a lead came from.

A key is a secret. Use it only on a server or inside a page builder's settings, never in code a visitor's browser can read. If your site can only run code in the browser, embed a CRM form instead (see [the last section](#if-your-website-cannot-keep-a-secret)).

## The request

```text
POST https://forms.yourcentre.uz/api/v1/leads
```

Send the key in one of two ways:

- a header: `Authorization: Bearer lk_…`
- or, for builders that cannot set headers, in the address: `…/api/v1/leads?key=lk_…`

The body can be JSON or an ordinary form post (`application/x-www-form-urlencoded` or `multipart/form-data`). A body larger than 64 KB is refused.

### JSON

```bash
curl -X POST https://forms.yourcentre.uz/api/v1/leads \
  -H "Authorization: Bearer lk_ab12cd34_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" \
  -H "Content-Type: application/json" \
  -d '{"name": "Aziza Karimova", "phone": "+998 90 123 45 67", "course": "TOPIK II", "message": "Evening group, please"}'
```

### Form post

```bash
curl -X POST "https://forms.yourcentre.uz/api/v1/leads?key=lk_ab12cd34_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" \
  --data-urlencode "ism=Aziza Karimova" \
  --data-urlencode "telefon=90 123 45 67" \
  --data-urlencode "utm_source=instagram"
```

## Fields

A lead needs a **name** and a **phone**. Everything else is optional.

| Goes to | Names recognised without any setup |
| --- | --- |
| Name | `name`, `full_name`, `fio`, `ism`, `ismi`, `ismingiz`, `имя`, `ваше имя`, `фио` |
| Name, in two parts | `first_name` and `last_name` (also `surname`, `familiya`, `фамилия`) are joined |
| Phone | `phone`, `phone_number`, `tel`, `telephone`, `telefon`, `telefon raqami`, `mobile`, `raqam`, `телефон`, `номер телефона`, `номер` |
| Subject | `subject`, `course`, `kurs`, `fan`, `курс`, `предмет` |
| Preferred time | `preferred_time`, `time`, `qulay vaqt`, `vaqt`, `удобное время`, `время` |
| Notes | `notes`, `message`, `comment`, `izoh`, `xabar`, `сообщение`, `комментарий` |
| Language of the visitor | `language`, `lang`, `til`, `язык` with a value starting with `uz`, `ru` or `en` |

Names are compared loosely: capital letters, spaces, dashes and underscores do not matter, so `Full Name`, `full_name` and `fullName` are the same.

**If your form names a field differently** (page builders often use names like `field-17`), the owner opens the source in Settings → Lead sources and adds a row to its **Field map**: the name your site sends, and where it should go. A row can also say **Ignore**, to drop a field, or **Answers**, to keep a field that would otherwise be recognised.

**Any other field** is kept with the lead under the name you sent it, and staff see it in the lead's answers. This is the place for things like `utm_source`, a branch, or an age.

**Phone numbers.** An Uzbek number in any spelling is accepted: `+998 90 123 45 67`, `998901234567`, `90 123-45-67`. A foreign number must be written in full with `+` and the country code.

## Answers

| Status | Body | Meaning |
| --- | --- | --- |
| `201` | `{"id": "…", "outcome": "created"}` | A new lead was made. |
| `201` | `{"id": "…", "outcome": "merged"}` | This phone already has an open lead. No second lead was made; the existing one went back to the inbox with a note on its timeline. |
| `200` | `{"ok": true, "test": true}` | A connection test (see below). Nothing was made. |
| `400` | `{"error": "invalid", "fields": {"phone": "phone"}}` | Something is wrong with the fields named. `required`: missing. `phone`: not a phone number. `too_long`: over 200 characters (2,000 for notes). |
| `400` | `{"error": "invalid_body"}` | The body is neither JSON nor a form post, or is larger than 64 KB. |
| `401` | `{"error": "unauthorized"}` | No key, a wrong key, or the source is switched off. |
| `429` | `{"error": "rate_limited"}` | Too many requests. A key may make 60 requests a minute, and one phone number may be sent 3 times a day. The `Retry-After` header says how many seconds to wait. |
| `500` | `{"error": "server_error"}` | Something failed on our side. Try again later. |

Treat `201` and `200` as success. On `429` or `500`, try again later; on `400` or `401`, fix the request first, because sending it again will give the same answer.

### Connection tests

Many page builders check a webhook with a made-up request before they save it. A request that has **no phone** and carries a field called `test` (with any value) gets `200` and makes nothing:

```bash
curl -X POST https://forms.yourcentre.uz/api/v1/leads \
  -H "Authorization: Bearer lk_ab12cd34_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" \
  -d "test=1"
```

The key must still be right, so this is also a quick way to check a key.

## Page builders

The steps differ a little from one builder to another; what they have in common is a "webhook" or "send data to a URL" setting.

- **Webhook address:** `https://forms.yourcentre.uz/api/v1/leads?key=lk_…` (the key in the address, since most builders cannot set a header).
- **Method:** POST. Either JSON or form data works.
- **Field names:** if you can choose them, call the two required fields `name` and `phone`. If you cannot, ask the owner to add your names to the source's Field map.
- **Test button:** if the builder sends its own sample without a phone, add a field called `test` to the sample, or just send a real test lead and delete it in the CRM afterwards.

Automation tools such as Make, Zapier or n8n work the same way: add an HTTP "POST" step with the address above and map your form's fields to `name`, `phone` and anything else you want to keep. This is also the way to bring in Facebook or Instagram lead-ad leads until the direct Meta connection is set up.

## Checking that it works

The owner opens **Settings → Lead sources → Requests** on the source. It lists the last 100 requests with the time and what became of each: a lead (with a link to it), a connection test, or a refusal with the reason, for example `phone:phone`. "Last used" on the source shows when a request with its key last arrived.

## If your website cannot keep a secret

A key in a page's own JavaScript can be copied by anyone who opens the page. For that reason the address does not answer browsers' cross-site requests (no CORS headers are sent), so `fetch()` from a visitor's browser will fail.

If your site has no server side and no builder integration, use a CRM form instead: the owner or a manager opens the form in **Leads → Forms**, goes to **Settings → Embed code**, and gives you the snippet. It is an `<iframe>` that resizes itself to the form; no key is involved.
