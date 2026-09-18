# FieldWindow

**Explainable weather-window planning for drone and outdoor field operations.**

FieldWindow is a self-hosted MCP server that converts public hourly weather forecasts into explicit, machine-readable work windows. It is being built for the **Alexa+ track of the Build, Ship, Shape: Amazon Developer Hackathon 2026**.

An agent can provide a place or coordinates, a forecast horizon, and explicit operating thresholds. FieldWindow returns continuous time windows that satisfy those constraints and explains why excluded hours failed.

## Why this exists

Weather APIs return forecasts. Field operators still have to translate wind, gusts, precipitation, visibility, temperature, daylight, and task duration into an actual plan.

FieldWindow performs that translation deterministically. AI handles the conversation; explicit rules handle the filtering. Thresholds stay visible and auditable instead of being invented by a language model.

Initial use cases include drone survey planning, agricultural field work, outdoor inspections, mapping, and monitoring.

> **FieldWindow is decision-support software.** It does not replace legal, aviation, safety, manufacturer, pesticide-label, airspace/NOTAM, terrain/obstacle, or on-site requirements.

## Alexa+ / MCP runtime

FieldWindow exposes a Streamable HTTP MCP endpoint at:

```text
POST /mcp
```

The server implements the **MCP 2025-11-25 protocol** in stateless JSON response mode and supports:

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`

It exposes three tools:

- `fieldwindow_plan_by_place`
- `fieldwindow_compile_coordinates`
- `fieldwindow_list_presets`

## Example MCP call

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"demo","version":"1.0"}}}
```

Then call `tools/list` and `tools/call` against the same `/mcp` endpoint.

## Demo presets

Presets are deliberately named `demo_*` because they are heuristics, not authoritative operating limits:

- `demo_mapping`
- `demo_scouting`
- `demo_spraying`

Real users should supply limits appropriate to their equipment, task, law, site, and operating procedures.

## Health check

```text
GET /health
```

Returns service status, MCP protocol version, and the deployed Git commit when the host provides it.

## Local verification

Requirements: Node.js 20+.

```bash
npm test
npm run check
```

The MVP has no runtime npm dependencies; Node.js provides `fetch`.

## Deployment

`vercel.json` maps `/mcp` and `/health` to serverless functions for a no-cost hackathon prototype on Vercel.

## Data source and rights

The prototype uses Open-Meteo public forecast and geocoding APIs for hackathon evaluation and non-commercial prototyping. Open-Meteo requires attribution and its free API usage terms must be respected.

- https://open-meteo.com/en/terms
- https://open-meteo.com/en/docs
- https://open-meteo.com/en/docs/geocoding-api

A commercial deployment should use an appropriate commercial weather-data arrangement or another suitably licensed provider.

## License

MIT. See `LICENSE`.
