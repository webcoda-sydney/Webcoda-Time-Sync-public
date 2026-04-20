import { getSupabaseClient } from "./supabase.js";
import { getEnv } from "./env.js";

const ASANA_TOKEN_URL = "https://app.asana.com/-/oauth_token";

function asanaTokensTable(supabase) {
  return supabase.schema("public").from("asana_tokens");
}

function formatSupabaseError(operation, error, context = {}) {
  const own = {};
  if (error && typeof error === "object") {
    for (const key of Object.getOwnPropertyNames(error)) {
      own[key] = error[key];
    }
  }

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
    Object.keys(own).length > 0 ? `own=${JSON.stringify(own)}` : null,
    rawError ? `raw=${rawError}` : null
  ].filter(Boolean);

  const combined = parts.join(" | ");
  return combined || `Supabase ${operation} failed | no error details returned`;
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
  const env = getEnv();
  const supabase = getSupabaseClient();
  const expiresAt = new Date(Date.now() + Number(expiresIn) * 1000).toISOString();

  const { data, error, status, statusText } = await asanaTokensTable(supabase).upsert({
    everhour_user_id: everhourUserId,
    asana_user_gid: asanaUserGid,
    asana_email: asanaEmail,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    updated_at: new Date().toISOString()
  });

  if (error || (typeof status === "number" && status >= 400)) {
    if (status === 404) {
      throw new Error(
        `Supabase upsert failed: table public.asana_tokens not found via REST API (status=404). Check SUPABASE_URL points to the correct project and that table public.asana_tokens exists.`
      );
    }

    const fallbackError = error ?? new Error(`status=${status} statusText=${statusText}`);
    throw new Error(
      formatSupabaseError("upsert", fallbackError, {
        table: "asana_tokens",
        everhour_user_id: everhourUserId,
        supabase_key_role: env.SUPABASE_KEY_ROLE,
        status,
        statusText,
        hasData: Boolean(data)
      })
    );
  }
}

export async function getFreshToken(everhourUserId) {
  const env = getEnv();
  const supabase = getSupabaseClient();
  const { data, error, status } = await asanaTokensTable(supabase)
    .select("*")
    .eq("everhour_user_id", everhourUserId)
    .single();

  if (status === 404) {
    throw new Error(
      "Supabase select failed: table public.asana_tokens not found via REST API (status=404)."
    );
  }

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

  const {
    data: updateData,
    error: updateError,
    status: updateStatus,
    statusText: updateStatusText
  } = await asanaTokensTable(supabase)
    .update({
      refresh_token: refreshed.refresh_token ?? data.refresh_token,
      expires_at: newExpiry,
      updated_at: new Date().toISOString()
    })
    .eq("everhour_user_id", everhourUserId);

  if (updateError || (typeof updateStatus === "number" && updateStatus >= 400)) {
    if (updateStatus === 404) {
      throw new Error(
        "Supabase update failed: table public.asana_tokens not found via REST API (status=404)."
      );
    }

    const fallbackError =
      updateError ?? new Error(`status=${updateStatus} statusText=${updateStatusText}`);
    throw new Error(
      formatSupabaseError("update", fallbackError, {
        table: "asana_tokens",
        everhour_user_id: everhourUserId,
        supabase_key_role: env.SUPABASE_KEY_ROLE,
        status: updateStatus,
        statusText: updateStatusText,
        hasData: Boolean(updateData)
      })
    );
  }

  return refreshed.access_token ?? null;
}
