import "dotenv/config";

function readEnv(name) {
  const value = process.env[name];
  if (!value) {
    return null;
  }
  return value;
}

export function getEnv() {
  const env = {
    PORT: Number(process.env.PORT ?? 3000),
    ASANA_CLIENT_ID: readEnv("ASANA_CLIENT_ID"),
    ASANA_CLIENT_SECRET: readEnv("ASANA_CLIENT_SECRET"),
    ASANA_REDIRECT_URI: readEnv("ASANA_REDIRECT_URI"),
    SUPABASE_URL: readEnv("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: readEnv("SUPABASE_SERVICE_ROLE_KEY")
  };

  const missing = Object.entries(env)
    .filter(([key, value]) => key !== "PORT" && !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return env;
}
