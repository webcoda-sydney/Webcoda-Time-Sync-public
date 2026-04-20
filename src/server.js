import express from "express";
import { env } from "./env.js";
import {
  exchangeCodeForToken,
  fetchAsanaUserProfile,
  upsertAsanaToken
} from "./asanaAuth.js";

const app = express();

app.get("/", (_req, res) => {
  res.send("Asana OAuth service running.");
});

app.get("/auth/asana", (req, res) => {
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
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in
    });

    return res.send("Connected! You can close this tab.");
  } catch (error) {
    return res.status(500).send(`OAuth callback failed: ${error.message}`);
  }
});

app.listen(env.PORT, () => {
  console.log(`OAuth app listening on port ${env.PORT}`);
});
