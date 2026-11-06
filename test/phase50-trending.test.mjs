import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TrendingService, TRENDING_ITEM_SCHEMA, validateTrendingItems } from '../lib/trending/service.js';
import { registerTrendingRoutes } from '../lib/api/routes-trending.js';
import { sendJson, readJsonBody } from '../lib/api/route-helpers.js';
import { createTrendingTool } from '../lib/tools/trending.js';
import { applyTier } from '../lib/tool-tiers.js';

const row = { name: 'owner/repo', url: 'https://github.com/owner/repo', description: 'A | useful\nproject', language: 'TypeScript', stars: 12345, starsToday: 321 };
const reply = (rows = [row]) => new Response(JSON.stringify({ success: true, data: { json: { repositories: rows } } }));
const keys = ['name', 'url', 'description', 'language', 'stars', 'starsToday'];
assert.deepEqual(Object.keys(TRENDING_ITEM_SCHEMA.properties), keys);
assert.deepEqual(Object.keys(validateTrendingItems([{ ...row, extra: true }])[0]), keys);
assert.equal(validateTrendingItems([{ ...row, language: null, stars: null, starsToday: null }])[0].stars, null);
for (const rows of [[], [row, row], [{ ...row, stars: '12,345' }], [{ ...row, starsToday: -1 }], [{ ...row, stars: undefined }], [{ ...row, url: 'javascript:alert(1)' }], [{ ...row, url: 'https://github.com/other/repo' }]]) {
  assert.throws(() => validateTrendingItems(rows));
}
let time = 1700000000000;
const calls = [];
let fail = false;
const service = new TrendingService({ apiKey: 'test-secret', cacheTtlMs: 1000 }, async (url, options) => {
  calls.push({ url, ...options, body: JSON.parse(options.body) });
  if (fail) return new Response('test-secret provider body', { status: 429 });
  await new Promise(resolve => setTimeout(resolve, 10));
  return reply();
}, () => time);
assert.equal(service.status().configured, true);
assert.ok(!JSON.stringify(service.status()).includes('test-secret'));
const [first, duplicate] = await Promise.all([service.get('daily'), service.get('daily')]);
assert.deepEqual(first, duplicate);
assert.equal(calls.length, 1, 'coalesces concurrent scrapes');
assert.equal(calls[0].url, 'https://api.firecrawl.dev/v2/scrape');
assert.equal(calls[0].body.url, 'https://github.com/trending?since=daily');
assert.deepEqual(calls[0].body.formats[0].schema.properties.repositories.items, TRENDING_ITEM_SCHEMA);
await service.get('daily');
assert.equal(calls.length, 1, 'cache hit does not consume credits');
await service.get('daily', true);
assert.equal(calls[1].body.maxAge, 0);
for (const period of ['weekly', 'monthly']) {
  await service.get(period);
  assert.equal(calls.at(-1).body.url, `https://github.com/trending?since=${period}`);
  assert.ok(calls.at(-1).body.formats[0].prompt.includes(period === 'weekly' ? 'this week' : 'this month'));
}
time += 2000;
fail = true;
const stale = await service.get('daily');
assert.equal(stale.stale, true);
assert.equal(stale.fetchedAt, first.fetchedAt);
assert.match(stale.warning, /429/);
assert.ok(!JSON.stringify(stale).includes('test-secret'));
fail = false;
assert.equal((await service.get('daily', true)).stale, false);
await assert.rejects(service.get('yearly'), /period/);
await assert.rejects(new TrendingService().get('daily'), /FIRECRAWL_API_KEY/);
const selfHosted = new TrendingService({ baseUrl: 'http://localhost:3002/' }, async (_url, options) => {
  assert.equal(options.headers.Authorization, undefined);
  return reply();
});
assert.equal((await selfHosted.get('daily')).items.length, 1);
const invalid = new TrendingService({ apiKey: 'test-secret' }, async () => reply([]));
await assert.rejects(invalid.get('daily'), /有效榜单/);
const broken = new TrendingService({ apiKey: 'test-secret' }, async () => new Response('broken'));
await assert.rejects(broken.get('daily'), /JSON/);
let aborted = false;
const cancelled = new TrendingService({ apiKey: 'test-secret' }, async (_url, opts) => new Promise((_resolve, reject) => {
  opts.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
}));
const pending = cancelled.get('daily');
cancelled.dispose();
await assert.rejects(pending);
assert.equal(aborted, true);
await assert.rejects(cancelled.get('daily'), /停止/);

// Real route handlers: validate the boundary before the paid fetch.
let handler;
let gets = 0;
registerTrendingRoutes({ bindRoute: route => { handler = route.handler; }, sendJson, readJsonBody }, {
  status: () => ({ configured: true }), get: async () => { gets++; return first; },
});
async function route(method, body, headers = {}) {
  const req = new EventEmitter();
  Object.assign(req, { method, headers: { host: 'localhost:3000', ...headers }, resume() {}, destroy() {} });
  let data;
  const res = { statusCode: 0, setHeader() {}, end(text) { data = JSON.parse(text); } };
  const task = handler(req, res);
  if (body !== undefined) { req.emit('data', JSON.stringify(body)); req.emit('end'); }
  await task;
  return { code: res.statusCode, data };
}
assert.equal((await route('GET')).code, 200);
assert.equal(gets, 0);
assert.equal((await route('POST', { period: 'daily' }, { origin: 'https://evil.example', 'content-type': 'application/json' })).code, 403);
assert.equal((await route('POST', { period: 'daily' }, { 'content-type': 'text/plain' })).code, 415);
assert.equal((await route('POST', { period: 'yearly' }, { 'content-type': 'application/json' })).code, 400);
assert.equal(gets, 0);
assert.equal((await route('POST', { period: 'weekly' }, { 'content-type': 'application/json' })).code, 200);
assert.equal(gets, 1);
assert.equal((await route('DELETE')).code, 405);

const tool = createTrendingTool({ get: async p => {
  if (p === 'weekly') throw new Error('weekly unavailable');
  return { ...first, period: p };
} });
assert.equal(applyTier([tool], { read_only: true }).kept.length, 1);
const all = await tool.execute({ period: 'all' });
assert.equal(all.items.length, 2);
assert.equal(all.errors[0].period, 'weekly');
const markdown = tool.output.render({}, all)[0].text;
assert.match(markdown, /本月新增 starsToday/);
assert.ok(markdown.includes('A \\| useful project'));
await assert.rejects(tool.execute({ period: 'yearly' }), /period/);
await assert.rejects(tool.execute({ refresh: 'yes' }), /refresh/);
service.dispose();
selfHosted.dispose();
console.log('Trending service, six-field contract, routes, caching, cancellation and Agent tool tests passed.');
