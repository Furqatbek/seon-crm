// Sample payloads in the shape Meta sends them, for the tests. The ids, names
// and numbers are made up; the structure is Meta's (Webhooks for Leadgen, the
// Lead object, and a form's /leads edge). Nothing here is ever sent to Meta.

/** A webhook delivery with one lead, exactly as the bytes arrive (the signature is over these bytes). */
export const WEBHOOK_BODY =
  '{"object":"page","entry":[{"id":"104857600000001","time":1795000000,"changes":[{"field":"leadgen","value":{"ad_id":"23850000000000001","form_id":"777000000000001","leadgen_id":"990000000000001","created_time":1795000000,"page_id":"104857600000001","adgroup_id":"23850000000000002"}}]}]}';

/** One delivery that names two leads of two forms, and carries a change that is not a lead. */
export const WEBHOOK_BODY_TWO =
  '{"object":"page","entry":[{"id":"104857600000001","time":1795000100,"changes":[{"field":"leadgen","value":{"form_id":"777000000000001","leadgen_id":"990000000000002","created_time":1795000100,"page_id":"104857600000001"}},{"field":"feed","value":{"item":"post","verb":"add"}}]},{"id":"104857600000001","time":1795000101,"changes":[{"field":"leadgen","value":{"form_id":"777000000000002","leadgen_id":"990000000000003","created_time":1795000101,"page_id":"104857600000001"}}]}]}';

/** GET /{leadgen-id}?fields=id,created_time,form_id,field_data */
export const LEAD = {
  id: "990000000000001",
  created_time: "2026-11-19T08:26:40+0000",
  form_id: "777000000000001",
  field_data: [
    { name: "full_name", values: ["Aziza Karimova"] },
    { name: "phone_number", values: ["+998901234567"] },
    { name: "email", values: ["aziza@example.com"] },
    { name: "qaysi_kursga_qiziqasiz?", values: ["TOPIK II"] },
    { name: "which_days_suit_you?", values: ["Monday", "Wednesday"] },
  ],
};

/** A lead whose form asks for the first and the last name apart, with a phone typed without a plus. */
export const LEAD_TWO_NAMES = {
  id: "990000000000002",
  created_time: "2026-11-19T08:28:20+0000",
  form_id: "777000000000001",
  field_data: [
    { name: "first_name", values: ["Bobur"] },
    { name: "last_name", values: ["Aliyev"] },
    { name: "phone_number", values: ["998 90 765 43 21"] },
  ],
};

export const LEAD_THREE = {
  id: "990000000000003",
  created_time: "2026-11-19T08:28:21+0000",
  form_id: "777000000000002",
  field_data: [
    { name: "full_name", values: ["Dilnoza Rahimova"] },
    { name: "phone_number", values: ["+998935550011"] },
  ],
};

/** What the Lead Ads Testing Tool creates: placeholders, not a person. */
export const TEST_LEAD = {
  id: "990000000000099",
  created_time: "2026-11-19T09:00:00+0000",
  form_id: "777000000000001",
  field_data: [
    { name: "full_name", values: ["<test lead: dummy data for full_name>"] },
    { name: "phone_number", values: ["<test lead: dummy data for phone_number>"] },
    { name: "email", values: ["test@fb.com"] },
  ],
};

/** What Meta answers when a token no longer works. */
export const TOKEN_ERROR = {
  error: {
    message: "Error validating access token: The session has been invalidated because the user changed their password or Facebook has changed the session for security reasons.",
    type: "OAuthException",
    code: 190,
    error_subcode: 460,
    fbtrace_id: "AbCdEfGhIjKlMnOp",
  },
};
