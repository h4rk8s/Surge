/**
 * 多主题 Panel 脚本（Surge）—— 1 script 通过 argument.panel 切换主题
 * 作者：h4rk8s
 *
 * 支持 4 个 panel 类型：sub / node / net / sync
 * 共享一次 airport-info HEAD，cherry-pick header 字段渲染
 *
 * 参数：
 *   panel=sub|node|net|sync   面板主题
 *   url_b64=...               airport-info endpoint（base64）
 *   title=...                 面板标题（覆盖默认）
 *   reset_day=...             重置日（sub 用，1-31）
 *   ua=...                    UA（默认 Shadowrocket/2.2.0）
 */

;(async () => {
  try {
    const args = parseArgs($argument || "");
    const panel = (args.panel || "sub").toLowerCase();
    const ua = args.ua || "Shadowrocket/2.2.0";
    const subUrl = resolveUrl(args);

    // 并发：airport-info header + ip-api（仅 net 需要）
    const tasks = [];
    tasks.push(subUrl ? fetchHeaders(subUrl, ua) : Promise.resolve(null));
    tasks.push(panel === "net" ? fetchIpInfo() : Promise.resolve(null));
    const [headers, ipInfo] = await Promise.all(tasks);

    let result;
    switch (panel) {
      case "sub":  result = renderSub(headers, args);  break;
      case "node": result = renderNode(headers);       break;
      case "net":  result = renderNet(ipInfo);         break;
      case "sync": result = renderSync(headers);       break;
      default:     result = { title: "Panel", content: `未知 panel: ${panel}` };
    }

    // 注入 icon + color（每 panel 唯一色相，社区主流：省略 style 用 icon-color 接管视觉）
    const visualDefaults = {
      sub:  { icon: "paperplane.fill",      color: "#FF9500" },
      node: { icon: "network",              color: "#86ABEE" },
      net:  { icon: "globe.asia.australia", color: "#6699FF" },
      sync: { icon: "gauge",                color: "#AF52DE" },
    };
    const v = visualDefaults[panel] || {};
    result.icon = args.icon || v.icon;
    result["icon-color"] = args.color || v.color;

    return $done(result);
  } catch (e) {
    return $done({ title: args?.title || "面板异常", content: String(e) });
  }
})();

/* ---------- 渲染：流量 ---------- */
function renderSub(headers, args) {
  const title = args.title || "流量";
  if (!headers) return { title, content: "fetch failed" };
  const uiKey = findKey(headers, "subscription-userinfo");
  if (!uiKey) return { title, content: "header 缺失" };
  const info = parseUserinfo(headers[uiKey]);
  if (!info) return { title, content: "parse 失败" };

  const used = (info.upload || 0) + (info.download || 0);
  const total = info.total || 0;
  const pct = total > 0 ? (used / total) * 100 : NaN;
  const lines = [];

  if (total > 0) {
    lines.push(`已用 ${pct.toFixed(0)}% (${bytesShort(used)}) · 剩 ${bytesShort(total - used)}`);
  } else {
    lines.push(`已用 ${bytesShort(used)}`);
  }

  const expDays = getExpireDaysLeft(info.expire);
  const resetDays = args.reset_day ? getResetRemainingDays(parseInt(args.reset_day, 10)) : null;
  const parts2 = [];
  if (resetDays != null) parts2.push(`重置 ${resetDays} 天`);
  if (expDays != null)   parts2.push(`到期 ${expDays} 天`);
  if (parts2.length) lines.push(parts2.join(" · "));

  return { title, content: lines.join("\n") };
}

/* ---------- 渲染：节点 ---------- */
function renderNode(headers) {
  const title = "节点";
  if (!headers) return { title, content: "fetch failed" };
  const active = headers[findKey(headers, "x-active-nodes")] || "?";
  const top = headers[findKey(headers, "x-top-nodes")] || "?";
  return {
    title,
    content: `${active}\n专线 ${top}`,
  };
}

/* ---------- 渲染：网络 ---------- */
function renderNet(ipInfo) {
  const title = "网络";
  const lines = [];
  if (ipInfo) {
    const flag = countryFlag(ipInfo.countryCode || "");
    const loc = [flag, ipInfo.city, ipInfo.isp].filter(Boolean).join(" · ");
    lines.push(`${loc} · ${ipInfo.query || ""}`);
  } else {
    lines.push("IP 查询失败");
  }
  const network = describeNetwork();
  if (network) lines.push(network);
  return { title, content: lines.join("\n") };
}

/* ---------- 渲染：同步 ---------- */
function renderSync(headers) {
  const title = "同步";
  if (!headers) return { title, content: "fetch failed" };
  const lastSync = headers[findKey(headers, "x-last-sync")] || "";
  const mirrors = headers[findKey(headers, "x-panel-mirrors")] || "?";
  const err = headers[findKey(headers, "x-err-status")] || "?";
  const nodes = headers[findKey(headers, "x-active-nodes")] || "";
  const vlessMatch = nodes.match(/vless=(\S+?);/);
  const vless = vlessMatch ? vlessMatch[1] : "?";
  return {
    title,
    content: `✓ ${formatLastSync(lastSync)} · ${mirrors} 镜像存活\nerr ${err} · vless ${vless}`,
  };
}

/* ---------- 工具 ---------- */
function parseArgs(qs) {
  const obj = {};
  if (!qs) return obj;
  qs.split("&").forEach(kv => {
    const [k, v] = kv.split("=");
    if (!k) return;
    obj[k] = v ? decodeURIComponent(v) : "";
  });
  return obj;
}

function resolveUrl(args) {
  if (args.url_b64) {
    try { return atobCompat(args.url_b64.trim()); } catch (_) { return null; }
  }
  return args.url ? args.url.trim() : null;
}

function fetchHeaders(url, ua) {
  return new Promise(resolve => {
    const tryReq = (method) => {
      const req = { url, headers: { "User-Agent": ua } };
      if (method === "HEAD") req.method = "HEAD";
      if (method === "GET")  req.headers["Range"] = "bytes=0-0";
      $httpClient.get(req, (err, resp) => {
        if (err || !resp || !resp.headers) {
          if (method === "HEAD") return tryReq("GET");
          return resolve(null);
        }
        resolve(resp.headers);
      });
    };
    tryReq("HEAD");
  });
}

function fetchIpInfo() {
  return new Promise(resolve => {
    $httpClient.get({
      url: "http://ip-api.com/json?fields=status,countryCode,city,isp,query&lang=zh-CN",
      headers: { "User-Agent": "Surge-Panel" },
    }, (err, resp, data) => {
      if (err || !data) return resolve(null);
      try {
        const j = JSON.parse(data);
        if (j.status === "success") return resolve(j);
      } catch (_) {}
      resolve(null);
    });
  });
}

function findKey(headers, key) {
  const target = key.toLowerCase();
  return Object.keys(headers || {}).find(k => k.toLowerCase() === target);
}

function parseUserinfo(val) {
  if (!val) return null;
  const kvs = {};
  const re = /(\w+)=([\d.eE+-]+)/g;
  let m;
  while ((m = re.exec(val)) !== null) {
    const n = Number(m[2]);
    if (!Number.isNaN(n)) kvs[m[1].toLowerCase()] = n;
  }
  return Object.keys(kvs).length ? kvs : null;
}

function bytesShort(b) {
  if (!b || b <= 0) return "0B";
  const units = ["B","KB","MB","GB","TB"];
  const k = 1024;
  const i = Math.floor(Math.log(b) / Math.log(k));
  const v = b / Math.pow(k, i);
  return `${v.toFixed(v >= 100 ? 0 : 1)}${units[i]}`;
}

function getResetRemainingDays(resetDay) {
  if (!resetDay || resetDay < 1 || resetDay > 31) return null;
  const now = new Date();
  const today = now.getDate();
  const y = now.getFullYear();
  const m = now.getMonth();
  const dThis = new Date(y, m + 1, 0).getDate();
  const rThis = Math.min(resetDay, dThis);
  if (rThis > today) return rThis - today;
  const dNext = new Date(y, m + 2, 0).getDate();
  const rNext = Math.min(resetDay, dNext);
  return (dThis - today) + rNext;
}

function getExpireDaysLeft(expire) {
  if (!expire) return null;
  let ts = Number(expire);
  if (!Number.isFinite(ts)) return null;
  if (ts < 1e12) ts *= 1000;
  const diff = Math.ceil((ts - Date.now()) / 86400000);
  return diff > 0 ? diff : null;
}

function formatLastSync(iso) {
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return iso || "?";
    const diff = Date.now() - t;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h} 小时前`;
    return `${Math.floor(h / 24)} 天前`;
  } catch (_) {
    return iso || "?";
  }
}

function countryFlag(cc) {
  if (!cc || cc.length !== 2) return "🌐";
  const base = 0x1F1E6;
  return String.fromCodePoint(base + cc.charCodeAt(0) - 65, base + cc.charCodeAt(1) - 65);
}

function describeNetwork() {
  try {
    if (typeof $network === "undefined" || !$network) return null;
    if ($network.wifi && $network.wifi.ssid) return `WiFi ${$network.wifi.ssid}`;
    if ($network.cellular && $network.cellular.carrier) return `蜂窝 ${$network.cellular.carrier}`;
  } catch (_) {}
  return null;
}

function atobCompat(b64) {
  if (typeof atob === "function") return atob(b64);
  return Buffer.from(b64, "base64").toString("utf-8");
}
