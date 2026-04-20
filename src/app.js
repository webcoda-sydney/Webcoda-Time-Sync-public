import express from "express";
import { getEnv } from "./env.js";
import {
  exchangeCodeForToken,
  fetchAsanaUserProfile,
  upsertAsanaToken
} from "./asanaAuth.js";

const app = express();

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
    return res.status(500).send(error.message);
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

    const token = await exchangeCodeForToken(String(code));
    const me = await fetchAsanaUserProfile(token.access_token);

    await upsertAsanaToken({
      everhourUserId: Number(everhourId),
      asanaUserGid: me.gid,
      asanaEmail: me.email,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in
    });

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

    const own = {};
    if (error && typeof error === "object") {
      for (const key of Object.getOwnPropertyNames(error)) {
        own[key] = error[key];
      }
    }

    console.error("OAuth callback error", own);

    const fallback = error?.message || JSON.stringify(own) || String(error);

    return res.status(500).send(`OAuth callback failed: ${fallback}`);
  }
});

export default app;
