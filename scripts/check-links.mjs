// Checks every web address in src/data/places.json (each place's site and its sources) and
// reports which are gone, which have moved and which couldn't be checked. Ported from watchPocket.
//
//   npm run check:links
//   npm run check:links -- --report report.md
//
// Exits with an error when a link is gone (404, 410, the site no longer exists, or the page now
// sends you to a home page), so the weekly run can flag it. Sites that turn away scripts
// (403, 429, timeouts) are listed as unchecked, not broken.
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const reportAt = args.indexOf('--report');
const reportPath = reportAt === -1 ? undefined : args[reportAt + 1];

// Each address, with every place it's used.
const places = JSON.parse(readFileSync(new URL('../src/data/places.json', import.meta.url), 'utf8'));
const uses = new Map();
const add = (url, where) => {
  if (!uses.has(url)) uses.set(url, []);
  uses.get(url).push(where);
};
for (const p of places) {
  if (p.url) add(p.url, `${p.id} (url)`);
  (p.sources ?? []).forEach((url, i) => add(url, `${p.id} (sources[${i}])`));
}
const urls = [...uses.keys()];
console.error(`Checking ${urls.length} addresses…`);

// Many sites turn away requests that don't look like a browser.
const headers = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};
const timeout = 25_000;

// The same page, give or take a trailing slash, a www, http or a language prefix such as /en-us/.
const samePage = (from, to) => {
  const a = new URL(from);
  const b = new URL(to);
  const host = (u) => u.hostname.replace(/^www\./, '');
  const path = (u) => decodeURIComponent(u.pathname).replace(/\/$/, '').toLowerCase();
  return host(a) === host(b) && (path(a) === path(b) || path(b).endsWith(path(a)));
};
const isRoot = (url) => new URL(url).pathname.replace(/\/[a-z]{2}(-[a-z]{2})?\/?$/i, '/') === '/';

async function check(url) {
  let current = url;
  for (let hop = 0; hop < 8; hop++) {
    let response;
    try {
      response = await fetch(current, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
    } catch (error) {
      const code = error.cause?.code ?? error.name;
      // A site that no longer exists, against one that's slow or refusing scripts today.
      if (['ENOTFOUND', 'ECONNREFUSED'].includes(code)) return { state: 'broken', detail: code };
      // A lapsed certificate makes browsers warn, but the site is usually still there.
      if (/CERT|SSL|TLS/.test(code)) return { state: 'unchecked', detail: `security certificate problem (${code})` };
      return { state: 'unchecked', detail: code === 'TimeoutError' ? 'timed out' : code };
    }
    // Only the status is needed, not the page.
    response.body?.cancel().catch(() => {});
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    if (response.status === 404 || response.status === 410) return { state: 'broken', detail: `${response.status}` };
    if (response.status >= 400) return { state: 'unchecked', detail: `${response.status}` };
    // Sent to a different site altogether: often a lapsed domain someone else now owns.
    const site = (u) => new URL(u).hostname.replace(/^www\./, '');
    if (site(current) !== site(url)) return { state: 'broken', detail: `now goes to a different site: ${current}` };
    // A page that now sends you to a home page is how most sites retire a page.
    if (current !== url && !samePage(url, current)) {
      return { state: isRoot(current) && !isRoot(url) ? 'broken' : 'moved', detail: `now ${current}` };
    }
    return { state: 'ok' };
  }
  return { state: 'unchecked', detail: 'too many redirects' };
}

// At most 8 at once, and 2 at once against any one site.
const results = new Map();
const running = new Map();
const queue = [...urls];
await new Promise((resolve) => {
  let active = 0;
  const next = () => {
    if (!queue.length && !active) return resolve();
    while (active < 8) {
      const i = queue.findIndex((u) => (running.get(new URL(u).hostname) ?? 0) < 2);
      if (i === -1) break;
      const [url] = queue.splice(i, 1);
      const host = new URL(url).hostname;
      running.set(host, (running.get(host) ?? 0) + 1);
      active++;
      check(url)
        .then((r) => results.set(url, r))
        .finally(() => {
          running.set(host, running.get(host) - 1);
          active--;
          next();
        });
    }
  };
  next();
});

const by = (state) => urls.filter((url) => results.get(url)?.state === state);
const broken = by('broken');
const moved = by('moved');
const unchecked = by('unchecked');
const section = (title, list, note) =>
  list.length === 0
    ? ''
    : `## ${title} (${list.length})\n\n${note}\n\n` +
      list.map((url) => `- ${url} — ${results.get(url).detail}\n${uses.get(url).map((w) => `  - ${w}`).join('\n')}`).join('\n') +
      '\n\n';
const report =
  `# External links\n\n${urls.length} checked: ${by('ok').length} fine, ${broken.length} gone, ${moved.length} moved, ${unchecked.length} couldn't be checked.\n\n` +
  section('Gone', broken, 'Not found, now sent to a home page, or now sent to a different site (often a lapsed domain). Replace or remove these, and re-check the facts they supported.') +
  section('Moved', moved, 'Now redirect to another page. Check it is the same thing and update the address.') +
  section("Couldn't be checked", unchecked, 'The site refused a script, was slow or had an error. Usually fine; check by hand if one stays here.');

console.log(report);
if (reportPath) writeFileSync(reportPath, report);
process.exit(broken.length > 0 ? 1 : 0);
