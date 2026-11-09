import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TrendingService, createFileCacheStore } from '../lib/trending/service.js';

/** Agent mode: one task scrapes, translates and summarises, and the board arrives complete. */
const row = {
  name: 'owner/repo', url: 'https://github.com/owner/repo', description: 'A useful project',
  language: 'TypeScript', stars: '12,345', starsToday: '321',
};
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const scraped = () => json({ success: true, data: { json: { repositories: [{ ...row, stars: 12345, starsToday: 321 }] } } });
const completed = (data = {}) => json({
  status: 'completed',
  data: {
    repositories: [row], summary: '中文总结', observations: ['要点一', '要点二'],
    descriptionsZh: { 'owner/repo': '一个有用的项目', 'ghost/repo': '不在榜单里的翻译' }, ...data,
  },
});

function stub(handler) {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
    return handler(url, options, calls);
  };
  return { calls, fetchMock };
}

// 1. A single task produces rows, translations and the summary together.
{
  const { calls, fetchMock } = stub(async (url, options) => {
    if (options.method === 'POST' && url.endsWith('/v2/agent')) return json({ success: true, id: 'job-1' });
    if (url.includes('/v2/agent/job-1')) return completed();
    throw new Error(`unexpected request ${url}`);
  });
  const service = new TrendingService({ apiKey: 'agent-secret', source: 'agent', agentPollMs: 10 }, fetchMock, () => 1_700_000_000_000);
  const board = await service.get('daily');

  assert.equal(calls.length, 2, 'one create plus one status poll');
  assert.equal(calls[0].url, 'https://api.firecrawl.dev/v2/agent');
  assert.deepEqual(calls[0].body.urls, ['https://github.com/trending?since=daily']);
  assert.equal(calls[0].body.strictConstrainToURLs, true);
  assert.ok(calls[0].body.maxCredits > 0, 'task carries a credit ceiling');
  for (const word of ['translate', 'summary', 'starsToday']) {
    assert.ok(calls[0].body.prompt.includes(word), `prompt covers ${word}`);
  }
  assert.deepEqual(Object.keys(calls[0].body.schema.properties).sort(),
    ['descriptionsZh', 'observations', 'repositories', 'summary']);

  assert.equal(board.items.length, 1);
  assert.equal(board.items[0].stars, 12345, 'thousands separators normalised');
  assert.equal(board.items[0].starsToday, 321);
  assert.equal(board.insight.summary, '中文总结');
  assert.deepEqual(board.insight.observations, ['要点一', '要点二']);
  assert.deepEqual(board.insight.descriptionsZh, { 'owner/repo': '一个有用的项目' },
    'translations only for repositories on this board');
  assert.equal(board.warning, undefined);
  assert.ok(!JSON.stringify(board).includes('agent-secret'));
}

// 2. The board is cached, so reopening the panel does not spend a second task.
{
  let creates = 0;
  const { calls, fetchMock } = stub(async (url, options) => {
    if (options.method === 'POST') { creates++; return json({ success: true, id: 'job-2' }); }
    return completed();
  });
  const service = new TrendingService({ apiKey: 'k', source: 'agent', agentPollMs: 10 }, fetchMock, () => 1_700_000_000_000);
  await service.get('daily');
  await service.get('daily');
  assert.equal(creates, 1, 'second read is served from cache');
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
}

// 3. agentStart must not start a second task once the board already carries its summary.
{
  let posts = 0;
  const { fetchMock } = stub(async (url, options) => {
    if (options.method === 'POST') { posts++; return json({ success: true, id: 'job-3' }); }
    return completed();
  });
  const service = new TrendingService({ apiKey: 'k', source: 'agent', agentPollMs: 10 }, fetchMock, () => 1_700_000_000_000);
  await service.get('daily');
  const state = await service.agentStart('daily');
  assert.equal(state.status, 'completed');
  assert.equal(state.insight.summary, '中文总结');
  assert.equal(posts, 1, 'no extra agent task');
}

// 4. Polls until completion instead of assuming the first status is final.
{
  let polls = 0;
  const { fetchMock } = stub(async (url, options) => {
    if (options.method === 'POST') return json({ success: true, id: 'job-4' });
    polls++;
    return polls < 3 ? json({ status: 'processing' }) : completed();
  });
  const service = new TrendingService({ apiKey: 'k', source: 'agent', agentPollMs: 10 }, fetchMock, () => 1_700_000_000_000);
  const board = await service.get('weekly');
  assert.equal(polls, 3);
  assert.equal(board.period, 'weekly');
  assert.ok(board.items.length > 0);
}

// 5. A failed task falls back to the deterministic scrape and says so.
{
  const { calls, fetchMock } = stub(async (url, options) => {
    if (url.endsWith('/v2/agent')) return new Response('{}', { status: 402 });
    if (url.endsWith('/v2/scrape')) return scraped();
    throw new Error(`unexpected request ${url}`);
  });
  const service = new TrendingService({ apiKey: 'k', source: 'agent', agentPollMs: 10 }, fetchMock, () => 1_700_000_000_000);
  const board = await service.get('daily');
  assert.equal(calls[1].url, 'https://api.firecrawl.dev/v2/scrape', 'fell back to scrape');
  assert.equal(board.insight, undefined);
  assert.match(board.warning, /回退/);
  assert.equal(board.items[0].stars, 12345);
}

// 6. An unusable summary must not lose the rows the agent did return.
{
  const { fetchMock } = stub(async (url, options) => options.method === 'POST'
    ? json({ success: true, id: 'job-6' })
    : completed({ summary: '', observations: [] }));
  const service = new TrendingService({ apiKey: 'k', source: 'agent', agentPollMs: 10 }, fetchMock, () => 1_700_000_000_000);
  const board = await service.get('daily');
  assert.equal(board.items.length, 1);
  assert.match(board.warning, /没有可用的总结/);
}

// 7. The board survives a reload or restart through the file store.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trending-cache-'));
  const store = createFileCacheStore(dir);
  const time = 1_700_000_000_000;
  const { fetchMock } = stub(async (url, options) => (options.method === 'POST'
    ? json({ success: true, id: 'job-7' })
    : completed()));

  const first = new TrendingService({ apiKey: 'k', source: 'agent', agentPollMs: 10, store }, fetchMock, () => time);
  const board = await first.get('daily');
  first.dispose();

  // A fresh instance stands in for a hot reload or an app restart.
  const second = new TrendingService({ apiKey: 'k', source: 'agent', agentPollMs: 10, store },
    async () => { throw new Error('a persisted board must not hit the network'); }, () => time + 1_000);
  const reused = await second.get('daily');
  assert.equal(reused.fetchedAt, board.fetchedAt, 'reload reuses the persisted board');
  assert.equal(reused.items.length, board.items.length);
  assert.equal(reused.insight.summary, '中文总结');
  second.dispose();

  // Past the TTL the persisted entry must be ignored.
  let refetched = 0;
  const third = new TrendingService({ apiKey: 'k', source: 'agent', agentPollMs: 10, store, cacheTtlMs: 1_000 },
    async (url, options) => { refetched++; return options.method === 'POST' ? json({ success: true, id: 'job-8' }) : completed(); },
    () => time + 5_000);
  await third.get('daily');
  assert.ok(refetched > 0, 'an expired persisted board is refetched');
  third.dispose();

  // A corrupted file degrades to "no cache" instead of breaking the board.
  fs.writeFileSync(path.join(dir, 'daily.json'), '{not json');
  const fourth = new TrendingService({ apiKey: 'k', source: 'agent', agentPollMs: 10, store }, fetchMock, () => time);
  const recovered = await fourth.get('daily');
  assert.ok(recovered.items.length > 0, 'corrupted cache still yields a board');
  fourth.dispose();

  store.clear();
  assert.equal(store.read('daily'), null, 'clearing the store drops the entry');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('Agent board: single task, normalisation, cache, no double spend, fallback, persistence — all passed.');
