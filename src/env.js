import "dotenv/config";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  ASANA_CLIENT_ID: requireEnv("ASANA_CLIENT_ID"),
  ASANA_CLIENT_SECRET: requireEnv("ASANA_CLIENT_SECRET"),
  ASANA_REDIRECT_URI: requireEnv("ASANA_REDIRECT_URI"),
  SUPABASE_URL: requireEnv("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY")
};
