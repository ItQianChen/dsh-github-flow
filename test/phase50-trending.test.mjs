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
const items = calls[0].body.formats[0].schema.properties.repositories.items;
assert.deepEqual(items.properties.name, TRENDING_ITEM_SCHEMA.properties.name);
assert.deepEqual(Object.keys(items.properties).sort(),
  [...Object.keys(TRENDING_ITEM_SCHEMA.properties), 'descriptionZh'].sort(),
  'scrape also asks for the translation so one pass covers rows + translations + summary');
assert.deepEqual(calls[0].body.formats[0].schema.required, ['repositories', 'summary', 'observations']);
await service.get('daily');
assert.equal(calls.length, 1, 'cache hit does not consume credits');
const reused = await service.get('daily', true);
assert.equal(calls.length, 2, 'an explicit refresh bypasses the cache');
assert.equal(calls[1].body.maxAge, 0, 'refresh asks Firecrawl for content it has not cached');
assert.equal(reused.stale, false);
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
// Firecrawl Agent is opt-in, caches one job per snapshot and never changes the six-field rows.
const agentRequests = [];
let agentState = 'processing';
const agentService = new TrendingService({ apiKey: 'agent-secret' }, async (url, options) => {
  agentRequests.push({ url, options });
  if (url.endsWith('/v2/scrape')) return reply();
  if (url.endsWith('/v2/agent')) return new Response(JSON.stringify({ success: true, id: '12345678-1234-1234-1234-123456789abc' }));
  return new Response(JSON.stringify({ success: true, status: agentState,
    data: { summary: 'AI 项目受关注', observations: ['项目 owner/repo 上榜'],
      descriptionsZh: { 'owner/repo': '一个有用的项目', 'unknown/repo': '此项不应显示' } } }));
});
await assert.rejects(agentService.agentStart('weekly'), /先加载/);
await agentService.get('daily');
assert.equal((await agentService.agentStatus('daily')).status, 'idle');
assert.equal((await agentService.agentStart('daily')).status, 'processing');
assert.equal((await agentService.agentStart('daily')).status, 'processing');
assert.equal(agentRequests.filter(v => v.url.endsWith('/v2/agent')).length, 1, 'do not create duplicate paid jobs');
assert.equal((await agentService.agentStatus('daily')).status, 'processing');
agentState = 'completed';
const insight = await agentService.agentStatus('daily');
assert.equal(insight.insight.summary, 'AI 项目受关注');
assert.equal(insight.insight.observations.length, 1);
assert.deepEqual(insight.insight.descriptionsZh, { 'owner/repo': '一个有用的项目' });
assert.equal((await agentService.get('daily')).items[0].description, row.description, 'original English text is unchanged');
assert.deepEqual(Object.keys((await agentService.get('daily')).items[0]), keys);
const startBody = JSON.parse(agentRequests.find(v => v.url.endsWith('/v2/agent')).options.body);
assert.deepEqual(startBody.urls, ['https://github.com/trending?since=daily']);
assert.ok(startBody.prompt.includes(JSON.stringify(row.description)), 'snapshot carries the original description, JSON-escaped');
assert.deepEqual(startBody.schema.required, ['summary', 'observations', 'descriptionsZh']);
assert.equal(startBody.schema.properties.descriptionsZh.type, 'object');
assert.ok(!JSON.stringify(insight).includes('agent-secret'));
agentService.dispose();

service.dispose();
selfHosted.dispose();
console.log('Trending service, six-field contract, routes, caching, cancellation and Agent tool tests passed.');

// Settings persist server-side only, support replacement/removal and hot service updates.
const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const { FirecrawlSettings } = await import('../lib/trending/settings.js');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'firecrawl-settings-test-'));
try {
  const file = path.join(folder, 'settings.json');
  const settings = new FirecrawlSettings(file, 'env-secret');
  assert.equal(settings.snapshot().source, 'environment');
  settings.save({ apiKey: 'saved-secret' });
  assert.equal(settings.key(), 'saved-secret');
  assert.equal(new FirecrawlSettings(file, 'env-secret').key(), 'saved-secret');
  assert.ok(!JSON.stringify(settings.snapshot()).includes('saved-secret'));
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.throws(() => settings.save({ apiKey: '' }));
  assert.throws(() => settings.save({ apiKey: 'a\nb' }));
  assert.equal(settings.key(), 'saved-secret');
  settings.save({ clear: true });
  assert.equal(settings.key(), 'env-secret');
  assert.ok(!fs.readFileSync(file, 'utf8').includes('saved-secret'));


  let requestCount = 0;
  const hot = new TrendingService({ apiKey: settings.key() }, async (_url, options) => {
    requestCount++;
    assert.equal(options.headers.Authorization, 'Bearer new-secret');
    return reply();
  });
  const registered = new Map();
  registerTrendingRoutes({ bindRoute: r => registered.set(r.path, r.handler), sendJson, readJsonBody }, hot, settings);
  handler = registered.get('/api/github/firecrawl-settings');
  assert.equal((await route('GET')).data.data.source, 'environment');
  assert.equal((await route('POST', { apiKey: 'blocked' }, { origin: 'https://evil.example', 'content-type': 'application/json' })).code, 403);
  assert.equal(settings.key(), 'env-secret');
  const saved = await route('POST', { apiKey: 'new-secret' }, { 'content-type': 'application/json' });
  assert.equal(saved.code, 200);
  assert.ok(!JSON.stringify(saved).includes('new-secret'));
  await hot.get('daily');
  assert.equal(requestCount, 1);
  hot.setApiKey(undefined);
  await assert.rejects(hot.get('daily'), /API Key/);
  hot.dispose();

  // 抓取模式由设置面板决定，独立于 Key 持久化
  assert.equal(settings.source(), undefined);
  const keyBeforeMode = settings.key();
  settings.save({ source: 'agent' });
  assert.equal(settings.source(), 'agent');
  assert.equal(new FirecrawlSettings(file, 'env-secret').source(), 'agent');
  assert.equal(settings.key(), keyBeforeMode, '保存模式不会清掉已保存的 Key');
  assert.throws(() => settings.save({ source: 'bogus' }));
  assert.throws(() => settings.save({}));

  let resolveOld;
  const changing = new TrendingService({ apiKey: 'old' }, async () => new Promise(resolve => { resolveOld = resolve; }));
  const oldRequest = changing.get('daily');
  changing.setApiKey('replacement');
  resolveOld(reply());
  await assert.rejects(oldRequest, /更改/);
  changing.dispose();
} finally { fs.rmSync(folder, { recursive: true, force: true }); }
console.log('Firecrawl settings persistence, redaction, CSRF and hot-reload tests passed.');
