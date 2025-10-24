/*
 * ConnectivityLite.js
 * 面板：百度 / ChatGPT / Google AI Studio 延迟
 * 参数（argument）示例：
 *   title=网络延迟&icon=airplane
 * 可选：
 *   color=%23007AFF           // 图标颜色（例如系统蓝 #007AFF；不传则用默认主题色）
 *   policy=Proxy              // 走指定策略/策略组，如 Proxy、DIRECT、Auto 等
 */

;(async () => {
  const args = parseArgs($argument || "");
  const title = args.title || "网络延迟";
  const icon  = args.icon  || "airplane";
  const color = args.color;           // 不传则使用 Surge 默认主题色
  const policy = args.policy;         // 可选：指定策略名

  const targets = [
    ["百度",      "https://www.baidu.com/"],
    ["ChatGPT",  "https://chat.openai.com/"],
    ["AI Studio","https://aistudio.google.com/"]
  ];

  try {
    const results = await Promise.all(targets.map(([name, url]) => ping(name, url, policy)));
    const out = { title, content: results.join("\n"), icon };
    if (color) out["icon-color"] = color;
    $done(out);
  } catch (e) {
    const out = { title, content: `脚本异常：${e}`, icon: "exclamationmark.triangle", "icon-color": "#CB1B45" };
    $done(out);
  }
})();

/*** helpers ***/
function parseArgs(qs) {
  const obj = {};
  if (!qs) return obj;
  qs.split("&").forEach(kv => {
    const [k, v] = kv.split("=");
    if (k) obj[k] = v ? decodeURIComponent(v) : "";
  });
  return obj;
}

function ping(name, url, policy) {
  return new Promise(resolve => {
