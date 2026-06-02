import test from "node:test";
import assert from "node:assert/strict";
import {
  externalUserIdsForContactIdentityMatch,
  flattenContactIdentityFields,
  participantExternalUserIdsFromChannelThread,
  pickHttpsProfileImageUrl,
  resolveParticipantProfileImageUrl
} from "./contactIdentityFlatten.js";

test("flattenContactIdentityFields matches Instagram identity via provider_external_user_id", () => {
  const row: Record<string, unknown> = {
    channel_type: "INSTAGRAM",
    provider_external_user_id: "17409356",
    leads: { external_user_id: "111" },
    contacts: {
      contact_identities: [
        {
          channel_type: "INSTAGRAM",
          external_user_id: "17409356",
          profile_image_url: "https://cdn.example/ig-avatar.jpg"
        }
      ]
    }
  };
  flattenContactIdentityFields(row);
  assert.equal(row.contactIdentityProfileImageUrl, "https://cdn.example/ig-avatar.jpg");
});

test("flattenContactIdentityFields still matches LINE by lead external_user_id", () => {
  const row: Record<string, unknown> = {
    channel_type: "LINE",
    leads: { external_user_id: "U-line-1" },
    contacts: {
      contact_identities: [
        {
          channel_type: "LINE",
          external_user_id: "U-line-1",
          profile_image_url: "https://cdn.example/line.jpg"
        }
      ]
    }
  };
  flattenContactIdentityFields(row);
  assert.equal(row.contactIdentityProfileImageUrl, "https://cdn.example/line.jpg");
});

test("flattenContactIdentityFields matches Facebook identity via provider id", () => {
  const row: Record<string, unknown> = {
    channel_type: "FACEBOOK",
    provider_external_user_id: "psid-99",
    leads: { external_user_id: "other" },
    contacts: {
      contact_identities: [
        {
          channel_type: "FACEBOOK",
          external_user_id: "psid-99",
          profile_image_url: "https://cdn.example/fb.jpg"
        }
      ]
    }
  };
  flattenContactIdentityFields(row);
  assert.equal(row.contactIdentityProfileImageUrl, "https://cdn.example/fb.jpg");
});

test("resolveParticipantProfileImageUrl prefers participant snapshot", () => {
  assert.equal(
    resolveParticipantProfileImageUrl({
      channel_type: "INSTAGRAM",
      participant_profile_image_url: "https://snap.example/a.jpg",
      leads: { external_user_id: "1" },
      contacts: {
        profile_image_url: "https://contact.example/c.jpg",
        contact_identities: [
          { channel_type: "INSTAGRAM", external_user_id: "1", profile_image_url: "https://id.example/i.jpg" }
        ]
      }
    }),
    "https://snap.example/a.jpg"
  );
});

test("resolveParticipantProfileImageUrl returns null when only http URLs exist", () => {
  assert.equal(
    resolveParticipantProfileImageUrl({
      channel_type: "LINE",
      participant_profile_image_url: "http://insecure.example/x.jpg",
      leads: { external_user_id: "u1" }
    }),
    null
  );
});

test("pickHttpsProfileImageUrl ignores non-https", () => {
  assert.equal(pickHttpsProfileImageUrl("http://x.example/a.jpg", "https://y.example/b.jpg"), "https://y.example/b.jpg");
});

test("pickHttpsProfileImageUrl accepts protocol-relative CDN URLs", () => {
  assert.equal(
    pickHttpsProfileImageUrl("//cdn.example/avatar.jpg"),
    "https://cdn.example/avatar.jpg"
  );
});

test("participantExternalUserIdsFromChannelThread extracts Instagram IGSID", () => {
  assert.deepEqual(
    participantExternalUserIdsFromChannelThread("INSTAGRAM", "ig:user:959986016929726"),
    ["959986016929726"]
  );
});

test("externalUserIdsForContactIdentityMatch includes IGSID from channel_thread_id", () => {
  const ids = externalUserIdsForContactIdentityMatch(
    {
      channel_type: "INSTAGRAM",
      channel_thread_id: "ig:user:959986016929726",
      leads: { external_user_id: "stale-lead-id" }
    },
    { external_user_id: "stale-lead-id" }
  );
  assert.equal(ids.includes("959986016929726"), true);
});

test("flattenContactIdentityFields matches Instagram identity via ig:user thread id only", () => {
  const row: Record<string, unknown> = {
    channel_type: "INSTAGRAM",
    channel_thread_id: "ig:user:959986016929726",
    leads: { external_user_id: "wrong-lead-id" },
    contacts: {
      contact_identities: [
        {
          channel_type: "INSTAGRAM",
          external_user_id: "959986016929726",
          profile_image_url: "https://cdn.example/ig-from-thread.jpg"
        }
      ]
    }
  };
  flattenContactIdentityFields(row);
  assert.equal(row.contactIdentityProfileImageUrl, "https://cdn.example/ig-from-thread.jpg");
});

test("resolveParticipantProfileImageUrl returns cached Supabase URL when cache ok", () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  const prevUrl = process.env.SUPABASE_URL;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  try {
    const resolved = resolveParticipantProfileImageUrl({
      channel_type: "INSTAGRAM",
      provider_external_user_id: "17409356",
      participant_profile_image_url: "https://scontent.cdninstagram.com/expired.jpg",
      leads: { external_user_id: "17409356" },
      contacts: {
        contact_identities: [
          {
            channel_type: "INSTAGRAM",
            external_user_id: "17409356",
            profile_image_url: "https://scontent.cdninstagram.com/expired.jpg",
            profile_image_cache_status: "ok",
            profile_image_cached_path: "tenant-1/avatars/id-1.jpg"
          }
        ]
      }
    });
    assert.match(resolved ?? "", /proj\.supabase\.co\/storage\/v1\/object\/public\/profile-avatars/);
    assert.equal(resolved?.includes("cdninstagram.com"), false);
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
    else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
    if (prevUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;
  }
});

test("resolveParticipantProfileImageUrl returns null when cache failed (not expired Meta URL)", () => {
  const prev = process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
  process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = "true";
  try {
    assert.equal(
      resolveParticipantProfileImageUrl({
        channel_type: "FACEBOOK",
        participant_profile_image_url: "https://platform-lookaside.fbsbx.com/expired",
        contacts: {
          contact_identities: [
            {
              channel_type: "FACEBOOK",
              external_user_id: "psid-1",
              profile_image_cache_status: "failed",
              profile_image_url: "https://platform-lookaside.fbsbx.com/expired"
            }
          ]
        },
        provider_external_user_id: "psid-1",
        leads: { external_user_id: "psid-1" }
      }),
      null
    );
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED;
    else process.env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED = prev;
  }
});

test("resolveParticipantProfileImageUrl legacy path when cache metadata absent", () => {
  assert.equal(
    resolveParticipantProfileImageUrl({
      channel_type: "LINE",
      participant_profile_image_url: "https://profile.line-scdn.net/0hZ",
      leads: { external_user_id: "u1" }
    }),
    "https://profile.line-scdn.net/0hZ"
  );
});

test("flattenContactIdentityFields uses sole channel identity when ids do not match", () => {
  const row: Record<string, unknown> = {
    channel_type: "INSTAGRAM",
    channel_thread_id: "ig:user:111",
    leads: { external_user_id: "unknown" },
    contacts: {
      contact_identities: [
        {
          channel_type: "INSTAGRAM",
          external_user_id: "222",
          profile_image_url: "https://cdn.example/only-ig.jpg"
        }
      ]
    }
  };
  flattenContactIdentityFields(row);
  assert.equal(row.contactIdentityProfileImageUrl, "https://cdn.example/only-ig.jpg");
});
