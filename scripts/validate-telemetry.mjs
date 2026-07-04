#!/usr/bin/env node
/** Validate telemetry payload against docs/telemetry-schema.md required fields */
import { missingRequiredFields, TELEMETRY_REQUIRED_FIELDS } from "./lib/telemetry-artifact.mjs";

const raw = process.argv[2] || "{}";
const parsed = JSON.parse(raw);
const payload = parsed.payload ?? parsed;

const missing = missingRequiredFields(payload);
if (missing.length) {
  console.error("Missing telemetry fields:", missing.join(", "));
  process.exit(1);
}

if (process.env.HARNESS_STRICT_TELEMETRY === "1" && parsed.placeholders?.length) {
  console.error("Strict telemetry: unresolved placeholders:", parsed.placeholders.join(", "));
  process.exit(1);
}

console.log("Telemetry payload valid");
console.log(`Required field count: ${TELEMETRY_REQUIRED_FIELDS.length}`);
