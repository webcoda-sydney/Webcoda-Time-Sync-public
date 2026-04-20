import { getSupabaseClient } from "./supabase.js";
import { getEnv } from "./env.js";

const ASANA_TOKEN_URL = "https://app.asana.com/-/oauth_token";

function formatSupabaseError(operation, error, context = {}) {
  let rawError = "";
  try {
    rawError = JSON.stringify(error);
  } catch (_e) {
    rawError = String(error);
  }

  const parts = [
    `Supabase ${operation} failed`,
    error?.code ? `code=${error.code}` : null,
    error?.message ? `message=${error.message}` : null,
    error?.details ? `details=${error.details}` : null,
    error?.hint ? `hint=${error.hint}` : null,
    Object.keys(context).length > 0 ? `context=${JSON.stringify(context)}` : null,
    rawError ? `raw=${rawError}` : null
  ].filter(Boolean);

  return parts.join(" | ");
}

export async function exchangeCodeForToken(code) {
  const env = getEnv();
  const res = await fetch(ASANA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.ASANA_CLIENT_ID,
      client_secret: env.ASANA_CLIENT_SECRET,
      redirect_uri: env.ASANA_REDIRECT_URI,
      code
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Asana token exchange failed: ${res.status} ${body}`);
  }

  return res.json();
}

export async function fetchAsanaUserProfile(accessToken) {
  const res = await fetch("https://app.asana.com/api/1.0/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Asana profile fetch failed: ${res.status} ${body}`);
  }

  const json = await res.json();
  return json.data;
}

export async function upsertAsanaToken({
  everhourUserId,
  asanaUserGid,
  asanaEmail,
  refreshToken,
  expiresIn
}) {
  const supabase = getSupabaseClient();
  const expiresAt = new Date(Date.now() + Number(expiresIn) * 1000).toISOString();

  const { error } = await supabase.from("asana_tokens").upsert({
    everhour_user_id: everhourUserId,
    asana_user_gid: asanaUserGid,
    asana_email: asanaEmail,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    updated_at: new Date().toISOString()
  });

  if (error) {
    throw new Error(
      formatSupabaseError("upsert", error, {
        table: "asana_tokens",
        everhour_user_id: everhourUserId
      })
    );
  }
}

export async function getFreshToken(everhourUserId) {
  const env = getEnv();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("asana_tokens")
    .select("*")
    .eq("everhour_user_id", everhourUserId)
    .single();

  if (error || !data) {
    return null;
  }

  if (!data.refresh_token) {
    return null;
  }

  const res = await fetch(ASANA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.ASANA_CLIENT_ID,
      client_secret: env.ASANA_CLIENT_SECRET,
      refresh_token: data.refresh_token
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Asana token refresh failed: ${res.status} ${body}`);
  }

  const refreshed = await res.json();
  const newExpiry = new Date(
    Date.now() + Number(refreshed.expires_in) * 1000
  ).toISOString();

  const { error: updateError } = await supabase
    .from("asana_tokens")
    .update({
      refresh_token: refreshed.refresh_token ?? data.refresh_token,
      expires_at: newExpiry,
      updated_at: new Date().toISOString()
    })
    .eq("everhour_user_id", everhourUserId);

  if (updateError) {
    throw new Error(
      formatSupabaseError("update", updateError, {
        table: "asana_tokens",
        everhour_user_id: everhourUserId
      })
    );
  }

  return refreshed.access_token ?? null;
}
