# Observability infrastructure

Scaffold only — no production wiring is included in the template. See [docs/telemetry-schema.md](../docs/telemetry-schema.md) for required span fields.

## Langfuse (self-hosted)

```bash
cd infra/langfuse
docker compose up -d
# UI: http://localhost:3000
```

Change `NEXTAUTH_SECRET` and `SALT` before production use.

## OpenTelemetry collector

```bash
docker run -p 4317:4317 -p 4318:4318 \
  -v "$(pwd)/otel/collector-config.yml:/etc/otelcol/config.yaml" \
  otel/opentelemetry-collector:latest
```

## Connect harness telemetry

1. Export spans with required fields per [docs/telemetry-schema.md](../docs/telemetry-schema.md), or consume inner-loop JSON artifacts from [docs/telemetry-artifacts.md](../docs/telemetry-artifacts.md).
2. Point exporters at collector `:4317` (gRPC) or `:4318` (HTTP).
3. Uncomment Langfuse OTLP exporter in `otel/collector-config.yml` when ready.
4. Validate payloads:

```bash
node scripts/validate-telemetry.mjs "$(cat infra/samples/telemetry-payload.json)"
node scripts/validate-telemetry.mjs "$(cat infra/samples/telemetry-artifact.json)"
```

## Environment variables (CI / local)

| Variable | Purpose |
|----------|---------|
| `LANGFUSE_HOST` | Base URL for trace deep links in PR comments. When unset, PR context shows a configure placeholder (see telemetry-schema.md) |
| `LANGFUSE_PUBLIC_KEY` | Optional export auth |
| `LANGFUSE_SECRET_KEY` | Optional export auth |

## PR context comment (informational fields)

| Display | Spec |
|---------|------|
| Trace | Langfuse search hint when `LANGFUSE_HOST` set; otherwise placeholder text |
| AI credits | Informational — org `max-ai-credits` not exposed to workflow |
| Threat detection | `n/a` until gh-aw outer loop is promoted beyond stub |
