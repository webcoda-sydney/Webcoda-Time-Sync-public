import { getSupabaseClient } from "./supabase.js";
import { getEnv } from "./env.js";

const ASANA_TOKEN_URL = "https://app.asana.com/-/oauth_token";

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
  accessToken,
  refreshToken,
  expiresIn
}) {
  const supabase = getSupabaseClient();
  const expiresAt = new Date(Date.now() + Number(expiresIn) * 1000).toISOString();

  const { error } = await supabase.from("asana_tokens").upsert({
    everhour_user_id: everhourUserId,
    asana_user_gid: asanaUserGid,
    asana_email: asanaEmail,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt
  });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
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

  const refreshWindowMs = 5 * 60 * 1000;
  const expiresAt = new Date(data.expires_at).getTime();

  if (Number.isNaN(expiresAt) || expiresAt < Date.now() + refreshWindowMs) {
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
        access_token: refreshed.access_token,
        expires_at: newExpiry,
        refresh_token: refreshed.refresh_token ?? data.refresh_token
      })
      .eq("everhour_user_id", everhourUserId);

    if (updateError) {
      throw new Error(`Supabase token update failed: ${updateError.message}`);
    }

    return refreshed.access_token;
  }

  return data.access_token;
}
