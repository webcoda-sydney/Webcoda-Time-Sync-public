import { getEnv } from "./env.js";

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export async function fetchEverhourUserEmail(everhourUserId) {
  const env = getEnv();
  const baseUrl = (env.EVERHOUR_API_BASE_URL || "https://api.everhour.com").replace(/\/+$/, "");

  if (!env.EVERHOUR_API_KEY) {
    throw new Error("Missing EVERHOUR_API_KEY for Everhour email validation.");
  }

  const res = await fetch(`${baseUrl}/users/${encodeURIComponent(String(everhourUserId))}`, {
    headers: {
      Authorization: `Bearer ${env.EVERHOUR_API_KEY}`,
      "X-Api-Key": env.EVERHOUR_API_KEY
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Everhour user lookup failed: ${res.status} ${body}`);
  }

  const data = await res.json();

  const email =
    normalizeEmail(data?.email) ||
    normalizeEmail(data?.user?.email) ||
    normalizeEmail(data?.data?.email);

  if (!email) {
    throw new Error(`Everhour user ${everhourUserId} has no email in API response.`);
  }

  return email;
}

export function assertEmailsMatch({ everhourUserId, everhourEmail, asanaEmail }) {
  const normalizedEverhour = normalizeEmail(everhourEmail);
  const normalizedAsana = normalizeEmail(asanaEmail);

  if (!normalizedAsana) {
    throw new Error("Asana profile did not include an email address.");
  }

  if (!normalizedEverhour) {
    throw new Error(`Everhour user ${everhourUserId} did not return an email address.`);
  }

  if (normalizedEverhour !== normalizedAsana) {
    throw new Error(
      `Email mismatch for everhour_id=${everhourUserId}. Everhour=${normalizedEverhour}, Asana=${normalizedAsana}`
    );
  }
}
