/**
 * 多主题 Panel 脚本（Surge）—— 1 script 通过 argument.panel 切换主题
 * 作者：h4rk8s
 *
 * 支持 4 个 panel 类型：sub / node / net / sync
 * 共享一次 airport-info HEAD，cherry-pick header 字段渲染
 *
 * 设计原则：
 *   - 用 Surge 原生 style 表达状态色（good/info/alert/error），不堆 emoji
 *   - 每 panel ≤ 2 行：第 1 行核心数字，第 2 行补充信息
 *   - 行内对齐用全角空格"　"作为视觉分隔
 *
 * 参数：
 *   panel=sub|node|net|sync   面板主题
 *   url_b64=...               airport-info endpoint（base64）
 *   title=...                 面板标题（覆盖默认）
 *   reset_day=...             重置日（sub 用，1-31）
 *   ua=...                    UA（默认 Shadowrocket/2.2.0）
 */

;(async () => {
  let args = {};
  try {
    args = parseArgs($argument || "");
    const panel = (args.panel || "sub").toLowerCase();
    const ua = args.ua || "Shadowrocket/2.2.0";
    const subUrl = resolveUrl(args);

    const headers = subUrl && panel !== "net" ? await fetchHeaders(subUrl, ua) : null;

    let result;
    switch (panel) {
      case "sub":  result = renderSub(headers, args);  break;
      case "node": result = renderNode(headers);       break;
      case "net":  result = renderNet();               break;
      case "sync": result = renderSync(headers);       break;
      default:     result = { title: "Panel", content: `未知 panel: ${panel}`, style: "alert" };
    }

    if (!result.style) result.style = "info";
    return $done(result);
  } catch (e) {
    return $done({ title: args.title || "面板异常", content: String(e), style: "error" });
  }
})();

/* ---------- 渲染：流量 ---------- */
function renderSub(headers, args) {
  const title = args.title || "流量";
  if (!headers) return { title, content: "暂时获取不到", style: "alert" };
  const uiKey = findKey(headers, "subscription-userinfo");
  if (!uiKey) return { title, content: "数据源异常", style: "alert" };
  const info = parseUserinfo(headers[uiKey]);
  if (!info) return { title, content: "解析失败", style: "alert" };

  const used = (info.upload || 0) + (info.download || 0);
  const total = info.total || 0;
  const pct = total > 0 ? (used / total) * 100 : 0;

  // 第 1 行：核心 — 已用 X% · 剩余 Y
  // 第 2 行：补充 — 重置 N 天 · 到期 M 天
  const line1 = total > 0
    ? `已用 ${pct.toFixed(0)}%　剩余 ${bytesShort(total - used)}`
    : `已用 ${bytesShort(used)}`;

  const expDays = getExpireDaysLeft(info.expire);
  const resetDays = args.reset_day ? getResetRemainingDays(parseInt(args.reset_day, 10)) : null;
  const parts = [];
  if (resetDays != null) parts.push(`重置 ${resetDays} 天`);
  if (expDays != null)   parts.push(`到期 ${expDays} 天`);
  const line2 = parts.join("　");

  // Surge 原生 style：流量越多越警示
  const style = pct > 90 ? "error" : pct > 70 ? "alert" : "good";
  return { title, content: [line1, line2].filter(Boolean).join("\n"), style };
}

/* ---------- 渲染：节点 ---------- */
function renderNode(headers) {
  const title = "节点";
  if (!headers) return { title, content: "暂时获取不到", style: "alert" };
  const active = headers[findKey(headers, "x-active-nodes")] || "";

  // 汇总：vless=33/39 + trojan=13/13 + hy2=5/5 → 在线 51 / 57
  let okSum = 0, totalSum = 0;
  const re = /(\w+)=(\d+)\/(\d+)/g;
  let m;
  while ((m = re.exec(active)) !== null) {
    okSum += parseInt(m[2]);
    totalSum += parseInt(m[3]);
  }

  const line1 = totalSum > 0 ? `在线 ${okSum} / ${totalSum}` : "暂时获取不到";
  const line2 = "自家专线 sfo2 全协议在线";

  const ratio = totalSum > 0 ? okSum / totalSum : 0;
  const style = ratio < 0.5 ? "error" : ratio < 0.85 ? "alert" : "good";
  return { title, content: `${line1}\n${line2}`, style };
}

/* ---------- 渲染：网络 ---------- */
function renderNet() {
  const title = "网络";
  let line1 = "", line2 = "";
  let style = "info";
  try {
    if (typeof $network !== "undefined" && $network) {
      if ($network.wifi && $network.wifi.ssid) {
        line1 = `WiFi　${$network.wifi.ssid}`;
        line2 = ($network.v4 && $network.v4.primaryAddress) || "";
        style = "good";
      } else if ($network.cellular && $network.cellular.carrier) {
        line1 = `蜂窝　${$network.cellular.carrier}`;
        line2 = $network.cellular.radio || "";
        style = "good";
      } else {
        line1 = "未连接";
        style = "alert";
      }
    } else {
      line1 = "信息不可用";
      style = "alert";
    }
  } catch (_) {
    line1 = "读取失败";
    style = "error";
  }
  return { title, content: [line1, line2].filter(Boolean).join("\n"), style };
}

/* ---------- 渲染：同步 ---------- */
function renderSync(headers) {
  const title = "同步";
  if (!headers) return { title, content: "暂时获取不到", style: "alert" };
  const lastSync = headers[findKey(headers, "x-last-sync")] || "";
  const mirrors = headers[findKey(headers, "x-panel-mirrors")] || "?";
  const err = headers[findKey(headers, "x-err-status")] || "?";

  const line1 = `${formatLastSync(lastSync)}　已完成`;
  const errOk = err.startsWith("0");
  const line2 = errOk
    ? `机场后端　${mirrors} 个面板在线`
    : `异常　日志 ${err}`;

  const style = errOk ? "good" : "alert";
  return { title, content: `${line1}\n${line2}`, style };
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
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
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

function atobCompat(b64) {
  if (typeof atob === "function") return atob(b64);
  return Buffer.from(b64, "base64").toString("utf-8");
}
