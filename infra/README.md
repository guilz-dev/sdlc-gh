# Observability infrastructure

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

1. Export spans with required fields per [docs/telemetry-schema.md](../docs/telemetry-schema.md).
2. Point exporters at collector `:4317` (gRPC) or `:4318` (HTTP).
3. Uncomment Langfuse OTLP exporter in `otel/collector-config.yml` when ready.
4. Validate payloads: `node scripts/validate-telemetry.mjs '<json>'`

## Environment variables (CI / local)

| Variable | Purpose |
|----------|---------|
| `LANGFUSE_HOST` | Base URL for trace deep links in PR comments |
| `LANGFUSE_PUBLIC_KEY` | Optional export auth |
| `LANGFUSE_SECRET_KEY` | Optional export auth |
