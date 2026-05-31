/**
 * 多主题 Panel 脚本（Surge）—— cc63 放弃式美学，icon/color 由 panel.dconf 控制
 * 作者：h4rk8s
 *
 * 设计理论（6 方调研一致结论）:
 *   1. 不用 style，icon + icon-color hex 由 panel.dconf 段配
 *   2. 不强求列对齐（13pt 系统字非等宽，物理不可能）
 *   3. cc63 放弃式美学：用全角"｜"分两列，全角"："标签后接值
 *   4. 每 panel 2 行：第 1 行核心数据，第 2 行补充
 *   5. monochrome SF Symbol（Surge 唯一支持的 rendering mode）
 *
 * 参数：
 *   panel=sub|node|net|sync   面板主题
 *   url_b64=...               airport-info endpoint（base64）
 *   title=...                 面板标题
 *   reset_day=...             重置日（sub 用）
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
      default:     result = { title: "Panel", content: `未知 panel: ${panel}` };
    }

    return $done(result);
  } catch (e) {
    return $done({ title: args.title || "面板异常", content: String(e) });
  }
})();

/* ---------- 渲染:流量 ---------- */
function renderSub(headers, args) {
  const title = args.title || "流量";
  if (!headers) return { title, content: "数据暂时获取不到" };
  const uiKey = findKey(headers, "subscription-userinfo");
  if (!uiKey) return { title, content: "数据源异常" };
  const info = parseUserinfo(headers[uiKey]);
  if (!info) return { title, content: "解析失败" };

  const used = (info.upload || 0) + (info.download || 0);
  const total = info.total || 0;
  const pct = total > 0 ? (used / total) * 100 : 0;

  // 第 1 行：已用百分比 ｜ 剩余字节
  // 第 2 行：重置天数 ｜ 到期天数
  const line1 = total > 0
    ? `已用：${pct.toFixed(1)}%　｜　剩余：${bytesShort(total - used)}`
    : `已用：${bytesShort(used)}`;

  const expDays = getExpireDaysLeft(info.expire);
  const resetDays = args.reset_day ? getResetRemainingDays(parseInt(args.reset_day, 10)) : null;
  const parts = [];
  if (resetDays != null) parts.push(`重置：${resetDays} 天`);
  if (expDays != null)   parts.push(`到期：${expDays} 天`);
  const line2 = parts.join("　｜　");

  return { title, content: [line1, line2].filter(Boolean).join("\n") };
}

/* ---------- 渲染:节点 ---------- */
function renderNode(headers) {
  const title = "节点";
  if (!headers) return { title, content: "数据暂时获取不到" };
  const active = headers[findKey(headers, "x-active-nodes")] || "";

  let okSum = 0, totalSum = 0;
  const re = /(\w+)=(\d+)\/(\d+)/g;
  let m;
  while ((m = re.exec(active)) !== null) {
    okSum += parseInt(m[2]);
    totalSum += parseInt(m[3]);
  }

  // 第 1 行：在线节点数 ｜ 在线百分比
  // 第 2 行：自家专线说明
  const pct = totalSum > 0 ? Math.round((okSum / totalSum) * 100) : 0;
  const line1 = totalSum > 0
    ? `在线：${okSum} / ${totalSum}　｜　可用：${pct}%`
    : "数据暂时获取不到";
  const line2 = "自家专线：sfo2 全 8 协议";

  return { title, content: `${line1}\n${line2}` };
}

/* ---------- 渲染:网络 ---------- */
function renderNet() {
  const title = "网络";
  try {
    if (typeof $network !== "undefined" && $network) {
      if ($network.wifi && $network.wifi.ssid) {
        const ssid = $network.wifi.ssid;
        const ip = ($network.v4 && $network.v4.primaryAddress) || "";
        return {
          title,
          content: `WiFi：${ssid}\n地址：${ip}`,
        };
      } else if ($network.cellular && $network.cellular.carrier) {
        const carrier = $network.cellular.carrier;
        const radio = $network.cellular.radio || "";
        return {
          title,
          content: `蜂窝：${carrier}\n制式：${radio}`,
        };
      }
      return { title, content: "未连接到任何网络" };
    }
    return { title, content: "网络信息不可用" };
  } catch (_) {
    return { title, content: "读取失败" };
  }
}

/* ---------- 渲染:同步 ---------- */
function renderSync(headers) {
  const title = "同步";
  if (!headers) return { title, content: "数据暂时获取不到" };
  const lastSync = headers[findKey(headers, "x-last-sync")] || "";
  const mirrors = headers[findKey(headers, "x-panel-mirrors")] || "?";
  const err = headers[findKey(headers, "x-err-status")] || "?";

  // 第 1 行：上次同步时间 ｜ 健康状态
  // 第 2 行：后端面板数
  const errOk = err.startsWith("0");
  const line1 = `更新：${formatLastSync(lastSync)}　｜　${errOk ? "运行正常" : "有警告"}`;
  const line2 = `机场后端：${mirrors} 个面板存活`;

  return { title, content: `${line1}\n${line2}` };
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

// 数字统一 2 位小数（panel-精品 推荐）
function bytesShort(b) {
  if (!b || b <= 0) return "0 B";
  const units = ["B","KB","MB","GB","TB"];
  const k = 1024;
  const i = Math.floor(Math.log(b) / Math.log(k));
  const v = b / Math.pow(k, i);
  return `${v.toFixed(2)} ${units[i]}`;
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
