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
    if
