const PRESETS = Object.freeze({
  demo_mapping: Object.freeze({
    label: 'Demo aerial mapping', max_wind_kmh: 28, max_gust_kmh: 40,
    max_precip_mm: 0, max_precip_probability_pct: 20,
    min_temperature_c: 0, max_temperature_c: 38,
    min_visibility_m: 3000, daylight_required: true, min_consecutive_hours: 2
  }),
  demo_scouting: Object.freeze({
    label: 'Demo field scouting', max_wind_kmh: 35, max_gust_kmh: 50,
    max_precip_mm: 0.5, max_precip_probability_pct: 40,
    min_temperature_c: -5, max_temperature_c: 40,
    min_visibility_m: 2000, daylight_required: true, min_consecutive_hours: 1
  }),
  demo_spraying: Object.freeze({
    label: 'Demo field spraying', max_wind_kmh: 15, max_gust_kmh: 25,
    max_precip_mm: 0, max_precip_probability_pct: 10,
    min_temperature_c: 5, max_temperature_c: 30,
    min_visibility_m: 3000, daylight_required: true, min_consecutive_hours: 2
  })
});

const CONSTRAINT_KEYS = new Set([
  'max_wind_kmh', 'max_gust_kmh', 'max_precip_mm',
  'max_precip_probability_pct', 'min_temperature_c', 'max_temperature_c',
  'min_visibility_m', 'daylight_required', 'min_consecutive_hours'
]);
const SUPPORTED_PROTOCOL = '2025-11-25';

function finiteNumber(value, name, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return n;
}

function normalize(input = {}) {
  const preset = input.preset || 'demo_mapping';
  if (!PRESETS[preset]) throw new Error(`unknown preset: ${preset}`);
  const overrides = input.constraints || {};
  for (const key of Object.keys(overrides)) {
    if (!CONSTRAINT_KEYS.has(key)) throw new Error(`unknown constraint: ${key}`);
  }
  const c = { ...PRESETS[preset], ...overrides };
  delete c.label;
  c.max_wind_kmh = finiteNumber(c.max_wind_kmh, 'max_wind_kmh', 0, 200);
  c.max_gust_kmh = finiteNumber(c.max_gust_kmh, 'max_gust_kmh', 0, 250);
  c.max_precip_mm = finiteNumber(c.max_precip_mm, 'max_precip_mm', 0, 100);
  c.max_precip_probability_pct = finiteNumber(c.max_precip_probability_pct, 'max_precip_probability_pct', 0, 100);
  c.min_temperature_c = finiteNumber(c.min_temperature_c, 'min_temperature_c', -80, 70);
  c.max_temperature_c = finiteNumber(c.max_temperature_c, 'max_temperature_c', -80, 70);
  c.min_visibility_m = finiteNumber(c.min_visibility_m, 'min_visibility_m', 0, 100000);
  c.min_consecutive_hours = Math.trunc(finiteNumber(c.min_consecutive_hours, 'min_consecutive_hours', 1, 24));
  c.daylight_required = Boolean(c.daylight_required);
  if (c.min_temperature_c > c.max_temperature_c) throw new Error('min_temperature_c cannot exceed max_temperature_c');
  if (c.max_gust_kmh < c.max_wind_kmh) throw new Error('max_gust_kmh cannot be lower than max_wind_kmh');
  return {
    preset,
    forecast_days: Math.trunc(finiteNumber(input.forecast_days ?? 3, 'forecast_days', 1, 7)),
    constraints: c
  };
}

async function geocode(place) {
  if (typeof place !== 'string' || place.trim().length < 2 || place.trim().length > 120) {
    throw new Error('place must be 2-120 characters');
  }
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', place.trim());
  url.searchParams.set('count', '3');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  const r = await fetch(url, { headers: { 'User-Agent': 'FieldWindow/0.2 Amazon-Hackathon' } });
  if (!r.ok) throw new Error(`geocoding upstream returned ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data.results) || !data.results.length) throw new Error(`no geocoding result for: ${place}`);
  const x = data.results[0];
  return {
    query: place.trim(), name: x.name, country: x.country, admin1: x.admin1,
    latitude: Number(x.latitude), longitude: Number(x.longitude), timezone: x.timezone
  };
}

function forecastUrl(latitude, longitude, days) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('hourly', [
    'temperature_2m', 'precipitation_probability', 'precipitation',
    'wind_speed_10m', 'wind_gusts_10m', 'visibility', 'is_day'
  ].join(','));
  url.searchParams.set('forecast_days', String(days));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('wind_speed_unit', 'kmh');
  return url;
}

function reasonCodes(row, c) {
  const out = [];
  if (row.wind_speed_10m > c.max_wind_kmh) out.push('wind');
  if (row.wind_gusts_10m > c.max_gust_kmh) out.push('gust');
  if (row.precipitation > c.max_precip_mm) out.push('precipitation');
  if (row.precipitation_probability > c.max_precip_probability_pct) out.push('precipitation_probability');
  if (row.temperature_2m < c.min_temperature_c) out.push('temperature_low');
  if (row.temperature_2m > c.max_temperature_c) out.push('temperature_high');
  if (row.visibility < c.min_visibility_m) out.push('visibility');
  if (c.daylight_required && row.is_day !== 1) out.push('daylight');
  return out;
}

function compile(hourly, constraints) {
  const keys = ['time','temperature_2m','precipitation_probability','precipitation','wind_speed_10m','wind_gusts_10m','visibility','is_day'];
  for (const key of keys) if (!Array.isArray(hourly?.[key])) throw new Error(`upstream missing hourly.${key}`);
  const rows = Array.from({ length: hourly.time.length }, (_, i) => ({
    time: hourly.time[i],
    temperature_2m: Number(hourly.temperature_2m[i]),
    precipitation_probability: Number(hourly.precipitation_probability[i] ?? 0),
    precipitation: Number(hourly.precipitation[i] ?? 0),
    wind_speed_10m: Number(hourly.wind_speed_10m[i]),
    wind_gusts_10m: Number(hourly.wind_gusts_10m[i]),
    visibility: Number(hourly.visibility[i]),
    is_day: Number(hourly.is_day[i])
  })).map(row => {
    const reasons = reasonCodes(row, constraints);
    return { ...row, eligible: reasons.length === 0, reasons };
  });

  const windows = [];
  let bucket = [];
  const flush = () => {
    if (bucket.length >= constraints.min_consecutive_hours) {
      windows.push({
        start: bucket[0].time,
        end: bucket[bucket.length - 1].time,
        hours: bucket.length,
        max_wind_kmh: Math.max(...bucket.map(x => x.wind_speed_10m)),
        max_gust_kmh: Math.max(...bucket.map(x => x.wind_gusts_10m)),
        max_precipitation_mm: Math.max(...bucket.map(x => x.precipitation)),
        max_precip_probability_pct: Math.max(...bucket.map(x => x.precipitation_probability)),
        min_visibility_m: Math.min(...bucket.map(x => x.visibility)),
        min_temperature_c: Math.min(...bucket.map(x => x.temperature_2m)),
        max_temperature_c: Math.max(...bucket.map(x => x.temperature_2m))
      });
    }
    bucket = [];
  };
  for (const row of rows) row.eligible ? bucket.push(row) : flush();
  flush();

  const exclusion_counts = {};
  for (const row of rows) {
    for (const reason of row.reasons) exclusion_counts[reason] = (exclusion_counts[reason] || 0) + 1;
  }
  return {
    windows,
    hours: rows,
    summary: {
      total_hours: rows.length,
      eligible_hours: rows.filter(x => x.eligible).length,
      qualifying_windows: windows.length,
      exclusion_counts
    }
  };
}

async function planCoordinates(args = {}) {
  const latitude = finiteNumber(args.latitude, 'latitude', -90, 90);
  const longitude = finiteNumber(args.longitude, 'longitude', -180, 180);
  const cfg = normalize(args);
  const r = await fetch(forecastUrl(latitude, longitude, cfg.forecast_days), {
    headers: { 'User-Agent': 'FieldWindow/0.2 Amazon-Hackathon' }
  });
  if (!r.ok) throw new Error(`weather upstream returned ${r.status}`);
  const weather = await r.json();
  const result = compile(weather.hourly, cfg.constraints);
  return {
    schemaVersion: 1,
    advisoryOnly: true,
    generatedAt: new Date().toISOString(),
    location: {
      latitude: weather.latitude,
      longitude: weather.longitude,
      elevation_m: weather.elevation,
      timezone: weather.timezone
    },
    request: cfg,
    summary: result.summary,
    windows: result.windows,
    hours: result.hours,
    source: {
      provider: 'Open-Meteo',
      attribution: 'Weather data via Open-Meteo; hackathon prototype uses the free non-commercial API tier.',
      terms: 'https://open-meteo.com/en/terms'
    },
    disclaimer: 'Decision support only. FieldWindow does not determine legal or safe authorization and does not replace operator judgment, equipment limits, local rules, product labels, airspace/NOTAM checks, terrain/obstacle checks, or on-site observations.'
  };
}

async function planByPlace(args = {}) {
  const place = await geocode(args.place);
  const plan = await planCoordinates({ ...args, latitude: place.latitude, longitude: place.longitude });
  return { ...plan, place };
}

function tools() {
  return [
    {
      name: 'fieldwindow_plan_by_place',
      title: 'Plan field-work windows by place',
      description: 'Resolve a place, fetch public forecast data, and return explainable continuous outdoor work windows using explicit thresholds. Decision support only.',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['place'],
        properties: {
          place: { type: 'string', minLength: 2, maxLength: 120 },
          forecast_days: { type: 'integer', minimum: 1, maximum: 7, default: 3 },
          preset: { type: 'string', enum: Object.keys(PRESETS), default: 'demo_mapping' },
          constraints: { type: 'object', description: 'Optional explicit threshold overrides.' }
        }
      }
    },
    {
      name: 'fieldwindow_compile_coordinates',
      title: 'Plan field-work windows by coordinates',
      description: 'Fetch public forecast data for exact coordinates and compile explainable continuous windows using explicit thresholds.',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['latitude','longitude'],
        properties: {
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          forecast_days: { type: 'integer', minimum: 1, maximum: 7, default: 3 },
          preset: { type: 'string', enum: Object.keys(PRESETS), default: 'demo_mapping' },
          constraints: { type: 'object', description: 'Optional explicit threshold overrides.' }
        }
      }
    },
    {
      name: 'fieldwindow_list_presets',
      title: 'List FieldWindow demo presets',
      description: 'List transparent demonstration presets. These are heuristics, not legal, manufacturer, or professional limits.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} }
    }
  ];
}

function rpc(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }
function toolResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: false
  };
}

function validOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function callTool(name, args) {
  if (name === 'fieldwindow_plan_by_place') return toolResult(await planByPlace(args));
  if (name === 'fieldwindow_compile_coordinates') return toolResult(await planCoordinates(args));
  if (name === 'fieldwindow_list_presets') return toolResult({ advisoryOnly: true, presets: PRESETS });
  throw new Error(`unknown tool: ${name}`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!validOrigin(req)) return res.status(403).json(rpcError(null, -32000, 'Forbidden origin'));
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json(rpcError(null, -32000, 'Method not allowed'));
  }

  let msg;
  try {
    msg = await readBody(req);
  } catch {
    return res.status(400).json(rpcError(null, -32700, 'Parse error'));
  }

  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return res.status(400).json(rpcError(msg?.id, -32600, 'Invalid Request'));
  }

  const id = msg.id;
  if (msg.method === 'initialize') {
    return res.status(200).json(rpc(id, {
      protocolVersion: SUPPORTED_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'FieldWindow', version: '0.2.0' },
      instructions: 'FieldWindow compiles explicit weather thresholds into explainable outdoor work windows. Decision support only.'
    }));
  }
  if (msg.method === 'notifications/initialized') return res.status(202).end();
  if (msg.method === 'ping') return res.status(200).json(rpc(id, {}));
  if (msg.method === 'tools/list') return res.status(200).json(rpc(id, { tools: tools() }));
  if (msg.method === 'tools/call') {
    try {
      return res.status(200).json(rpc(id, await callTool(msg.params?.name, msg.params?.arguments || {})));
    } catch (e) {
      return res.status(200).json(rpc(id, {
        content: [{ type: 'text', text: e.message || String(e) }],
        isError: true
      }));
    }
  }
  return res.status(200).json(rpcError(id, -32601, 'Method not found'));
};

module.exports._private = { PRESETS, SUPPORTED_PROTOCOL, normalize, compile, tools, validOrigin, planByPlace, planCoordinates };
