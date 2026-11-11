const baseUrl = process.env.HEALTH_URL ?? "http://127.0.0.1:3001";

for (const endpoint of ["/healthz", "/readyz"]) {
  const response = await fetch(new URL(endpoint, baseUrl), { cache: "no-store" });
  const body = await response.json();
  process.stdout.write(`${endpoint}: HTTP ${response.status} ${JSON.stringify(body)}\n`);
  if (!response.ok) process.exitCode = 1;
}
