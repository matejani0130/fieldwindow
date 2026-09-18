const test = require('node:test');
const assert = require('node:assert/strict');
const mcp = require('../api/mcp');
const { SUPPORTED_PROTOCOL, normalize, compile, tools, validOrigin } = mcp._private;

test('protocol is Amazon Alexa+ minimum accepted version', () => {
  assert.equal(SUPPORTED_PROTOCOL, '2025-11-25');
});

test('three agent tools are exposed', () => {
  assert.deepEqual(tools().map(x => x.name), [
    'fieldwindow_plan_by_place',
    'fieldwindow_compile_coordinates',
    'fieldwindow_list_presets'
  ]);
});

test('demo mapping preset normalizes', () => {
  const x = normalize({ preset: 'demo_mapping', forecast_days: 3 });
  assert.equal(x.constraints.daylight_required, true);
  assert.equal(x.constraints.min_consecutive_hours, 2);
});

test('unknown constraints are rejected', () => {
  assert.throws(() => normalize({ constraints: { magic: 1 } }), /unknown constraint/);
});

test('continuous eligible hours are compiled', () => {
  const c = normalize({}).constraints;
  const hourly = {
    time: ['2026-09-18T08:00','2026-09-18T09:00','2026-09-18T10:00'],
    temperature_2m: [20,20,20],
    precipitation_probability: [0,0,0],
    precipitation: [0,0,0],
    wind_speed_10m: [10,10,50],
    wind_gusts_10m: [15,15,60],
    visibility: [10000,10000,10000],
    is_day: [1,1,1]
  };
  const out = compile(hourly, c);
  assert.equal(out.windows.length, 1);
  assert.equal(out.windows[0].hours, 2);
  assert.equal(out.summary.exclusion_counts.wind, 1);
});

test('origin validation accepts https and rejects malformed origin', () => {
  assert.equal(validOrigin({ headers: { origin: 'https://example.com' } }), true);
  assert.equal(validOrigin({ headers: { origin: 'wat' } }), false);
});
