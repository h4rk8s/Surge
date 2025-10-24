/**
 * 面板脚本：订阅用量/到期展示（Surge）
 * 作者：h4rk8s（基于社区通用做法重写）
 * 用途：从订阅链接（建议为 subconverter 输出链接）读取响应头 `Subscription-Userinfo`
 *       展示用量、重置日与到期日。仅读取响应头，若 HEAD 失败将回退到 GET。
 *
 * 参数（argument）：
 *   url=...           // 订阅完整链接（建议事先百分号编码）
 *   或 url_b64=...    // 订阅完整链接的 Base64（推荐以保护隐私）
 *   title=...         // 面板标题，默认：Sub Info
 *   reset_day=...     // 每月重置日（1-31），可选
 *   icon=...          // 面板图标，默认：tornado
 *   color=...         // 图标颜色 HEX，默认：#DF4688
 *   ua=...            // 请求 UA，默认：Shadowrocket/2.2.0
 *
 * 例：
 *   argument=url_b64=BASE64URL&title=MESL&reset_day=23&icon=tornado&color=#DF4688
 */

;(async () => {
  try {
    const args = parseArgs($argument || "");
    const panelTitle = args.title || "Sub Info";
    const ua = args.ua || "Shadowrocket/2.2.0";
    const icon = args.icon || "tornado";
    const color = args.color || "#DF4688";
    const subUrl = resolveUrl(args);

    if (!subUrl) {
      return $done({
        title: panelTitle,
        content: "未提供订阅链接（url 或 url_b64）",
        icon: "exclamationmark.triangle",
        "icon-color": "#CB1B45"
      });
    }

    // 先 HEAD，只取响应头；失败则回退 GET。
    let headers = await fetchHeaders(subUrl, ua);
    if (!headers) headers = await fetchHeaders(subUrl, ua, true);

    const uiHeaderKey = findUserinfoHeaderKey(headers);
    if (!uiHeaderKey) {
      return $done({
        title: panelTitle,
        content: "链接响应头不含 Subscription-Userinfo",
        icon: "exclamationmark.triangle",
        "icon-color": "#CB1B45"
      });
    }

    const info = parseUserinfo(headers[uiHeaderKey]);
    if (!info) {
      return $done({
        title: panelTitle,
        content: "无法解析用量信息",
        icon: "exclamationmark.triangle",
        "icon-color": "#CB1B45"
      });
    }

    const used = (info.upload || 0) + (info.download || 0);
    const total = info.total || 0;
    const pct = total > 0 ? (used / total) * 100 : NaN;

    const lines = [];
    if (total > 0) {
      lines.push(`用量：${bytesToSize(used)} / ${bytesToSize(total)}`);
    } else {
      lines.push(`用量：${bytesToSize(used)}`);
    }

    // 提醒与日期
    const expireDaysLeft = getExpireDaysLeft(info.expire);
    const resetDayLeft = args.reset_day ? getResetRemainingDays(parseInt(args.reset_day, 10)) : null;

    if (resetDayLeft != null && expireDaysLeft != null) {
      lines.push(`提醒：${resetDayLeft}天后重置，${expireDaysLeft}天后到期`);
    } else if (resetDayLeft != null) {
      lines.push(`提醒：${resetDayLeft}天后重置`);
    } else if (expireDaysLeft != null) {
      lines.push(`提醒：${expireDaysLeft}天后到期`);
    } else if (!isNaN(pct)) {
      lines.push(`提醒：已使用 ${pct.toFixed(1)}%`);
    }

    if (expireDaysLeft != null) {
      lines.push(`到期：${formatDateYMD(info.expire)}`);
    }

    return $done({
      title: panelTitle,
      content: lines.join("\n"),
      icon,
      "icon-color": color
    });

  } catch (e) {
    console.log(`Sub-Panel ERROR: ${e}`);
    return $done({
      title: "订阅信息获取失败",
      content: String(e),
      icon: "exclamationmark.triangle",
      "icon-color": "#CB1B45"
    });
  }
})();

/*** helpers ***/
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
  if (args.url) return args.url.trim();
  return null;
}

// HEAD 优先，仅取响应头；fallback=true 时改用 GET。
function fetchHeaders(url, ua, fallback = false) {
  return new Promise(resolve => {
    const req = { url, headers: { "User-Agent": ua } };
    if (!fallback) req.method = "HEAD";
    // GET 时尽量减少正文传输
    if (fallback) req.headers["Range"] = "bytes=0-0";

    $httpClient.get(req, (err, resp) => {
      if (err || !resp || !resp.headers) {
        console.log(`fetchHeaders error: ${err || "no resp"}`);
        return resolve(null);
      }
      resolve(resp.headers);
    });
  });
}

function findUserinfoHeaderKey(headers) {
  const keys = Object.keys(headers || {});
  return keys.find(k => k.toLowerCase() === "subscription-userinfo");
}

function parseUserinfo(val) {
  if (!val) return null;
  // 兼容 upload/download/total/expire=数字（整数或科学计数）
  const kvs = {};
  const re = /(\w+)=([\d.eE+-]+)/g;
  let m;
  while ((m = re.exec(val)) !== null) {
    const key = m[1].toLowerCase();
    const num = Number(m[2]);
    if (!Number.isNaN(num)) kvs[key] = num;
  }
  return Object.keys(kvs).length ? kvs : null;
}

function bytesToSize(b) {
  if (!b || b <= 0) return "0B";
  const units = ["B","KB","MB","GB","TB","PB"];
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
  const daysThisMonth = new Date(y, m + 1, 0).getDate();
  const rThis = Math.min(resetDay, daysThisMonth);

  if (rThis > today) return rThis - today;

  const daysNextMonth = new Date(y, m + 2, 0).getDate();
  const rNext = Math.min(resetDay, daysNextMonth);
  return (daysThisMonth - today) + rNext;
}

function getExpireDaysLeft(expire) {
  if (!expire) return null;
  let ts = Number(expire);
  if (!Number.isFinite(ts)) return null;
  if (ts < 1e12) ts *= 1000; // 秒 -> 毫秒
  const diff = Math.ceil((ts - Date.now()) / 86400000);
  return diff > 0 ? diff : null;
}

function formatDateYMD(expire) {
  let ts = Number(expire);
  if (!Number.isFinite(ts)) return "未知日期";
  if (ts < 1e12) ts *= 1000;
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}年${m}月${day}日`;
}

// 兼容 atob（Surge/JS 环境不保证全局存在）
function atobCompat(b64) {
  if (typeof atob === "function") return atob(b64);
  const buf = Buffer.from(b64, "base64");
  return buf.toString("utf-8");
}
