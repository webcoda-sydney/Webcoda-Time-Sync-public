import "dotenv/config";

function readEnv(name) {
  const value = process.env[name];
  if (!value) {
    return null;
  }
  return value;
}

export function getEnv() {
  const supabaseKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  const env = {
    PORT: Number(process.env.PORT ?? 3000),
    ASANA_CLIENT_ID: readEnv("ASANA_CLIENT_ID"),
    ASANA_CLIENT_SECRET: readEnv("ASANA_CLIENT_SECRET"),
    ASANA_REDIRECT_URI: readEnv("ASANA_REDIRECT_URI"),
    SUPABASE_URL: readEnv("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: supabaseKey,
    SUPABASE_KEY_ROLE: getJwtRole(supabaseKey)
  };

  const missing = Object.entries(env)
    .filter(([key, value]) => key !== "PORT" && !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return env;
}

function getJwtRole(token) {
  if (!token || typeof token !== "string") {
    return "unknown";
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    // New Supabase secret formats may not be JWT; treat as unknown.
    return "unknown";
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return payload?.role ?? "unknown";
  } catch (_error) {
    return "unknown";
  }
}
