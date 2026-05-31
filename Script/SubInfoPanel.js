/**
 * 面板脚本：订阅用量/到期 + 自家扩展信息（Surge）
 * 作者：h4rk8s
 * 用途：
 *   1) 拉 `url` 拿 `Subscription-Userinfo` header 展示流量/到期/重置
 *   2) parse 自家扩展 X-* header（X-Active-Nodes / X-Top-Nodes / X-Last-Sync / X-Panel-Mirrors / X-Err-Status）
 *   3) 并发拉 ip-api.com 拿出口公网 IP / ISP / 城市
 *   4) 读 Surge 内置 $network 拿 WiFi SSID 或 cellular operator
 *
 * 参数（argument）：
 *   url_b64=...         订阅链接 base64（推荐）
 *   url=...             订阅链接（明文）
 *   title=...           默认 "Sub Info"
 *   reset_day=...       每月重置日 1-31
 *   icon=...            默认 tornado
 *   color=...           默认 #DF4688
 *   ua=...              默认 Shadowrocket/2.2.0
 *   show_extra=1        是否显示自家扩展行（节点/同步/出口/WiFi），默认 1
 */

;(async () => {
  try {
    const args = parseArgs($argument || "");
    const panelTitle = args.title || "Sub Info";
    const ua = args.ua || "Shadowrocket/2.2.0";
    const icon = args.icon || "tornado";
    const color = args.color || "#DF4688";
    const showExtra = args.show_extra !== "0";
    const subUrl = resolveUrl(args);

    if (!subUrl) {
      return $done({
        title: panelTitle,
        content: "未提供订阅链接（url 或 url_b64）",
        icon: "exclamationmark.triangle",
        "icon-color": "#CB1B45"
      });
    }

    // 并发：sub headers + ip-api
    const [headers, ipInfo] = await Promise.all([
      fetchSubHeaders(subUrl, ua),
      showExtra ? fetchIpInfo() : Promise.resolve(null),
    ]);

    if (!headers) {
      return $done({
        title: panelTitle,
        content: "无法获取订阅响应头",
        icon: "exclamationmark.triangle",
        "icon-color": "#CB1B45"
      });
    }

    const uiHeaderKey = findHeaderKey(headers, "subscription-userinfo");
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

    // ---- 核心三行：流量 / 提醒 / 到期 ----
    if (total > 0) {
      lines.push(`流量：${bytesToSize(used)} / ${bytesToSize(total)} (${pct.toFixed(1)}%)`);
    } else {
      lines.push(`流量：${bytesToSize(used)}`);
    }

    const expireDaysLeft = getExpireDaysLeft(info.expire);
    const resetDayLeft = args.reset_day ? getResetRemainingDays(parseInt(args.reset_day, 10)) : null;

    if (resetDayLeft != null && expireDaysLeft != null) {
      lines.push(`提醒：${resetDayLeft}天重置 · ${expireDaysLeft}天到期`);
    } else if (resetDayLeft != null) {
      lines.push(`提醒：${resetDayLeft}天后重置`);
    } else if (expireDaysLeft != null) {
      lines.push(`提醒：${expireDaysLeft}天后到期`);
    }

    if (expireDaysLeft != null) {
      lines.push(`到期：${formatDateYMD(info.expire)}`);
    }

    // ---- 自家扩展：节点 / 同步 / 出口 / 网络 ----
    if (showExtra) {
      const activeNodes = headers[findHeaderKey(headers, "x-active-nodes")];
      if (activeNodes) {
        lines.push(`节点：${activeNodes}`);
      }

      const topNodes = headers[findHeaderKey(headers, "x-top-nodes")];
      if (topNodes) {
        lines.push(`专线：${topNodes}`);
      }

      const lastSync = headers[findHeaderKey(headers, "x-last-sync")];
      if (lastSync) {
        lines.push(`同步：${formatLastSync(lastSync)}`);
      }

      const panelMirrors = headers[findHeaderKey(headers, "x-panel-mirrors")];
      if (panelMirrors) {
        lines.push(`镜像：机场 ${panelMirrors} 个面板存活`);
      }

      const errStatus = headers[findHeaderKey(headers, "x-err-status")];
      if (errStatus) {
        const errIcon = errStatus.startsWith("0B") ? "✓" : "⚠️";
        lines.push(`日志：${errIcon} ${errStatus}`);
      }

      if (ipInfo) {
        lines.push(`出口：${ipInfo.country || ""} ${ipInfo.city || ""} · ${ipInfo.isp || "?"} · ${ipInfo.query || ""}`);
      }

      const network = describeNetwork();
      if (network) {
        lines.push(`网络：${network}`);
      }
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

// 拉订阅 URL 响应头：HEAD 优先，失败 fallback GET Range:0-0
function fetchSubHeaders(url, ua) {
  return new Promise(resolve => {
    const tryReq = (method) => {
      const req = { url, headers: { "User-Agent": ua } };
      if (method === "HEAD") req.method = "HEAD";
      if (method === "GET") req.headers["Range"] = "bytes=0-0";
      $httpClient.get(req, (err, resp) => {
        if (err || !resp || !resp.headers) {
          if (method === "HEAD") return tryReq("GET");
          console.log(`fetchSubHeaders error: ${err || "no resp"}`);
          return resolve(null);
        }
        resolve(resp.headers);
      });
    };
    tryReq("HEAD");
  });
}

// 拉 ip-api.com 拿出口公网 IP / 城市 / ISP
function fetchIpInfo() {
  return new Promise(resolve => {
    $httpClient.get({
      url: "http://ip-api.com/json?fields=status,country,city,isp,query&lang=zh-CN",
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

function findHeaderKey(headers, key) {
  const target = key.toLowerCase();
  return Object.keys(headers || {}).find(k => k.toLowerCase() === target);
}

function parseUserinfo(val) {
  if (!val) return null;
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
  if (ts < 1e12) ts *= 1000;
  const diff = Math.ceil((ts - Date.now()) / 86400000);
  return diff > 0 ? diff : null;
}

function formatDateYMD(expire) {
  let ts = Number(expire);
  if (!Number.isFinite(ts)) return "未知日期";
  if (ts < 1e12) ts *= 1000;
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

// 把 ISO 时间戳渲染成 "今天 03:30" / "昨天 15:30" / "3 天前"
function formatLastSync(iso) {
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return iso;
    const now = Date.now();
    const diff = now - t;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  } catch (_) {
    return iso;
  }
}

// 描述当前网络：WiFi SSID 或 cellular operator
function describeNetwork() {
  try {
    if (typeof $network === "undefined" || !$network) return null;
    if ($network.wifi && $network.wifi.ssid) {
      return `WiFi ${$network.wifi.ssid}`;
    }
    if ($network.cellular && $network.cellular.carrier) {
      return `蜂窝 ${$network.cellular.carrier}`;
    }
  } catch (_) {}
  return null;
}

// 兼容 atob
function atobCompat(b64) {
  if (typeof atob === "function") return atob(b64);
  const buf = Buffer.from(b64, "base64");
  return buf.toString("utf-8");
}
