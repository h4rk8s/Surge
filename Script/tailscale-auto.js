// tailscale-auto.js
// 用法（Surge cron）：argument=test_url=http://100.91.231.16:11434/api/tags&candidates=utun5,utun6,utun7,utun8,utun9

const GROUP_NAME = 'Tailscale-Auto';
const STORE_KEY  = 'tailscale_auto_last'; // 存储上次结果，提供给面板

// 解析 $argument：支持 "k=v&k2=v2" 或 JSON
function parseArgument(input) {
  if (!input) return {};
  if (typeof input === 'object') return input;
  try {
    if (/^\s*{/.test(input)) return JSON.parse(input);
  } catch (_) {}
  const obj = {};
  String(input).split('&').forEach(kv => {
    const [k, ...rest] = kv.split('=');
    if (!k) return;
    obj[decodeURIComponent(k.trim())] = decodeURIComponent(rest.join('=').trim());
  });
  return obj;
}

const args = parseArgument($argument);
const TEST_URL = args.test_url || 'http://100.91.231.16:11434/api/tags';
const CANDIDATE_UTUN = (args.candidates || 'utun5,utun6,utun7,utun8,utun9')
  .split(',').map(s => s.trim()).filter(Boolean);

const CONNECT_TIMEOUT_SEC = Number(args.timeout || 3); // 可通过 argument=timeout=3 调整

function policyNameForUtun(u) { return `TS-${u}`; }

async function existingUtunList() {
  try {
    const { stdout, code, stderr } = await $system.exec('ifconfig', { timeout: 5 });
    if (code !== 0) throw new Error(stderr || 'ifconfig failed');
    const exist = [];
    for (const u of CANDIDATE_UTUN) {
      const re = new RegExp(`^${u}:`, 'm');
      if (re.test(stdout)) exist.push(u);
    }
    return exist;
  } catch (_) {
    // ifconfig 失败则保守返回候选全量
    return CANDIDATE_UTUN.slice();
  }
}

function checkOnce(url, policy) {
  return new Promise(resolve => {
    $httpClient.request(
      {
        method: 'GET',
        url,
        timeout: CONNECT_TIMEOUT_SEC,
        policy,
        headers: { 'User-Agent': 'Surge-Tailscale-Auto/1.0' }
      },
      (err, resp, data) => {
        if (err) return resolve({ ok: false, status: 0, err: String(err) });
        const ok = resp && resp.status === 200;
        resolve({ ok, status: resp && resp.status, err: '' });
      }
    );
  });
}

async function switchGroup(targetPolicy) {
  const ok = await $surge.setSelectGroupPolicy(GROUP_NAME, targetPolicy);
  if (!ok) throw new Error(`setSelectGroupPolicy(${GROUP_NAME}, ${targetPolicy}) failed`);
  return ok;
}

function saveLast(obj) {
  try {
    $persistentStore.write(JSON.stringify(obj), STORE_KEY);
  } catch (_) {}
}

async function main() {
  const start = Date.now();
  let chosen = 'TS-default';
  const tried = [];

  try {
    const utuns = await existingUtunList();
    for (const u of utuns) {
      const policy = policyNameForUtun(u);
      const res = await checkOnce(TEST_URL, policy);
      tried.push({ utun: u, policy, status: res.status, ok: res.ok });
      if (res.ok) {
        await switchGroup(policy);
        chosen = policy;
        saveLast({ ts: Date.now(), ok: true, chosen, test_url: TEST_URL, tried });
        $notification.post('Tailscale Interface Updated', '', `Switched to ${policy} (HTTP 200)`);
        return $done();
      }
    }
    // 全部失败：回退
    await switchGroup('TS-default');
    saveLast({ ts: Date.now(), ok: false, chosen: 'TS-default', test_url: TEST_URL, tried });
    $notification.post('Tailscale Interface Fallback', '', 'All candidates failed, fallback to TS-default');
    return $done();
  } catch (e) {
    await switchGroup('TS-default');
    saveLast({ ts: Date.now(), ok: false, chosen: 'TS-default', test_url: TEST_URL, tried, error: String(e) });
    $notification.post('Tailscale Interface Error', '', String(e));
    return $done();
  } finally {
    // 可按需记录耗时
    void start;
  }
}

main();
