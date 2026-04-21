import express from "express";
import { getEnv } from "./env.js";
import {
  exchangeCodeForToken,
  fetchAsanaUserProfile,
  upsertAsanaToken
} from "./asanaAuth.js";
import { assertEmailsMatch, fetchEverhourUserEmail } from "./everhour.js";

const app = express();

function serializeError(error) {
  const type = Object.prototype.toString.call(error);
  const payload = {
    type,
    isErrorInstance: error instanceof Error
  };

  if (error && typeof error === "object") {
    for (const key of Object.getOwnPropertyNames(error)) {
      payload[key] = error[key];
    }
  } else {
    payload.value = error;
  }

  if (!payload.message || String(payload.message).trim() === "") {
    payload.message = "Unknown error (empty message)";
  }

  return payload;
}

app.get("/", (req, res) => {
  const everhourId = req.query.everhour_id;
  if (everhourId) {
    return res.redirect(`/auth/asana?everhour_id=${encodeURIComponent(String(everhourId))}`);
  }

  return res.status(400).send(
    "Missing everhour_id. Open /?everhour_id=YOUR_EVERHOUR_ID to begin Asana authorization."
  );
});

app.get("/auth/asana", (req, res) => {
  let env;
  try {
    env = getEnv();
  } catch (error) {
    return res.status(500).send(`Environment error: ${error?.message || "Unknown env error"}`);
  }

  const everhourId = req.query.everhour_id;

  if (!everhourId) {
    return res.status(400).send("Missing required query parameter: everhour_id");
  }

  const params = new URLSearchParams({
    client_id: env.ASANA_CLIENT_ID,
    redirect_uri: env.ASANA_REDIRECT_URI,
    response_type: "code",
    state: String(everhourId)
  });

  return res.redirect(`https://app.asana.com/-/oauth_authorize?${params}`);
});

app.get("/auth/asana/callback", async (req, res) => {
  try {
    getEnv();
    const asanaError = req.query.error;
    const asanaErrorDescription = req.query.error_description;
    if (asanaError) {
      return res.status(400).send(
        `Asana authorization was not completed (${asanaError}${
          asanaErrorDescription ? `: ${asanaErrorDescription}` : ""
        }). Please start again from the auth link.`
      );
    }

    const code = req.query.code;
    const everhourId = req.query.state;

    if (!code || !everhourId) {
      return res
        .status(400)
        .send("Missing code or state in OAuth callback parameters.");
    }

    let token;
    try {
      token = await exchangeCodeForToken(String(code));
    } catch (error) {
      throw new Error(`token_exchange_failed | ${JSON.stringify(serializeError(error))}`);
    }

    let me;
    try {
      me = await fetchAsanaUserProfile(token.access_token);
    } catch (error) {
      throw new Error(`profile_fetch_failed | ${JSON.stringify(serializeError(error))}`);
    }

    try {
      const everhourEmail = await fetchEverhourUserEmail(String(everhourId));
      assertEmailsMatch({
        everhourUserId: String(everhourId),
        everhourEmail,
        asanaEmail: me.email
      });
    } catch (error) {
      throw new Error(`email_match_validation_failed | ${JSON.stringify(serializeError(error))}`);
    }

    try {
      await upsertAsanaToken({
        everhourUserId: Number(everhourId),
        asanaUserGid: me.gid,
        asanaEmail: me.email,
        refreshToken: token.refresh_token,
        expiresIn: token.expires_in
      });
    } catch (error) {
      const wrapped = new Error(
        `supabase_upsert_failed | ${JSON.stringify(serializeError(error))}`
      );
      wrapped.cause = serializeError(error);
      throw wrapped;
    }

    return res.send("Connected! You can close this tab.");
  } catch (error) {
    if (
      typeof error?.message === "string" &&
      error.message.includes("invalid_grant") &&
      error.message.includes("previously deactivated")
    ) {
      return res.status(400).send(
        "This Asana authorization link/code has already been used. Please start again from your /auth/asana?everhour_id=... link to generate a fresh code."
      );
    }

    if (
      typeof error?.message === "string" &&
      error.message.includes("email_match_validation_failed") &&
      error.message.includes("Email mismatch for everhour_id=")
    ) {
      return res.status(400).send(
        "The Everhour user does not match this Asana account email. Please sign in to Asana with the correct account and try again."
      );
    }

    const serialized = serializeError(error);
    console.error("OAuth callback error", serialized);
    const fallback = serialized.message || "Unknown callback error";

    return res.status(500).json({
      error: "OAuth callback failed",
      message: fallback,
      details: serialized
    });
  }
});

export default app;
