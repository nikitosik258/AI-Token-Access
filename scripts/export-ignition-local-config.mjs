import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const addressesPath = resolve(
  "ignition",
  "deployments",
  "chain-31337",
  "deployed_addresses.json",
);
let addresses;
try {
  addresses = JSON.parse(readFileSync(addressesPath, "utf8"));
} catch {
  throw new Error(
    "Ignition deployment addresses are missing. Run npm run local:deploy while the local node is running.",
  );
}

const token = addresses["AIServiceAccessModule#AccessToken"];
const access = addresses["AIServiceAccessModule#AIServiceAccess"];
if (!token || !access) {
  throw new Error("Ignition deployment does not contain both required contract addresses.");
}

execFileSync(
  process.execPath,
  [resolve("scripts", "export-local-config.mjs"), "--token", token, "--access", access],
  { stdio: "inherit" },
);
