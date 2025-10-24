/**
 * RuleStatsLite.js
 * 规则统计（面板优化版）
 * - 仅调用 Surge HTTP API：/v1/features/*, /v1/profiles/current?sensitive=0, /v1/rules
 * - 默认三行展示；可用 detail=1|2 展开更多分布信息
 *
 * argument（按需传）：
 *   title=规则统计 | icon=doc.text.magnifyingglass | color=%23007AFF | detail=0|1|2
 *
 * 参考：
 *   $httpAPI 在脚本内可直接调用，无需鉴权；API 路径见官方文档。 
 */

;(async () => {
  const args = parseArgs($argument || "");
  const title = args.title || "规则统计";
  const icon  = args.icon  || "list.bullet.rectangle";
  const color = args.color;                 // 不传则使用系统主题色
  const detailLevel = toInt(args.detail, 0);// 0=最简, 1=常用项, 2=更细分

  try {
    // 1) 基础能力开关
    const [mitm, rewrite, scripting] = await Promise.all([
      apiGET("/v1/features/mitm"),
      apiGET("/v1/features/rewrite"),
      apiGET("/v1/features/scripting"),
    ]);

    // 2) 配置文本与脚本列表（用于 hostname 与 JS 数量）
    const [profile, scriptsObj] = await Promise.all([
      apiGET("/v1/profiles/current?sensitive=0"),
      apiGET("/v1/scripting")
    ]);

    const profileText = profile?.profile || "";
    const hostnameList = pickHostname(profileText);
    const hostnameNum  = hostnameList.length;
    const jsEnabledNum = Array.isArray(scriptsObj?.scripts)
      ? scriptsObj.scripts.filter(s => s.enabled).length
      : 0;

    // 3) 规则总表（已展开），直接计数 —— 比手工解析 [Rule] 块更稳、更全
    const rulesList = await apiGET("/v1/rules"); // 需 4.4+/4.0+，官方路径
    const totalRules = Array.isArray(rulesList) ? rulesList.length : 0;

    // 4) 类型分布（从规则文本粗分；若 /v1/rules 含类型字段，可替换本地解析）
    const ruleSection = pickRuleSection(profileText);
    const flatRules = ruleSection
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !/^\s*[#;\[]/.test(line)); // 去注释/空行

    const typeMap = countByType(flatRules);

    // 5) 面板输出（对齐 & 千分位）
    const L = [];
    // 行1：开关状态 + JS 数/Rewrite 总数（若能算）
    L.push(
      `MitM ${tick(mitm?.enabled)}  JS:${fmtK(jsEnabledNum)}  Rewrite${tick(rewrite?.enabled)}`
    );

    // 行2：主计数
    L.push(
      `Rules:${fmtK(totalRules)}  Hostname:${fmtK(hostnameNum)}`
    );

    // 行3+：类型分布（Top）
    const topLine = topTypesLine(typeMap, detailLevel);
    if (topLine) L.push(topLine);

    // 细分明细（detail=2 时补充一行次要类型）
    if (detailLevel >= 2) {
      const secondLine = secondTypesLine(typeMap);
      if (secondLine) L.push(secondLine);
    }

    const out = { title: `${title} | ${fmtK(totalRules)}`, content: L.join("\n"), icon };
    if (color) out["icon-color"] = color;
    $done(out);

  } catch (e) {
    const out = { title: "规则统计（异常）", content: String(e?.message || e), icon: "exclamationmark.triangle", "icon-color": "#CB1B45" };
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
function toInt(v, d=0) { const n = Number(v); return Number.isFinite(n) ? n|0 : d; }

// $httpAPI Promise 包装（脚本内可直接使用，无需额外鉴权）
function apiGET(path) {
  return new Promise((resolve) => {
    $httpAPI("GET", path, null, (r) => resolve(r));
  });
}

function tick(b) { return b ? "☑" : "☒"; }
function fmtK(n) {
  if (!Number.isFinite(n)) return "0";
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function pad(s, w) {
  s = String(s);
  const l = s.length;
  return l >= w ? s : (s + " ".repeat(w - l));
}

function pickHostname(profileText) {
  const m = profileText.match(/^\[Host\s*name\]([\s\S]+?)^\[/gmi) ||
            profileText.match(/^\[hostname\]([\s\S]+?)^\[/gmi);
  if (!m) return [];
  const block = m[0];
  return block.split("\n")
    .slice(1)
    .map(x => x.trim())
    .filter(x => x && !/^\s*[#;]/.test(x))
    .map(x => x.split("=")[0].trim());
}

function pickRuleSection(profileText) {
  const m = profileText.match(/^\[Rule\]([\s\S]+?)^\[/gmi);
  return m ? m[0] : "";
}

function countByType(lines) {
  const map = Object.create(null);
  for (const ln of lines) {
    const t = ln.split(",")[0].trim().toUpperCase();
    if (!t) continue;
    // 逻辑规则（AND/OR/NOT）作为类型统计
    const key = t;
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

function topTypesLine(map, detailLevel) {
  if (!map) return "";
  const order = [
    "DOMAIN-SUFFIX","DOMAIN-KEYWORD","DOMAIN","DOMAIN-SET",
    "RULE-SET","IP-CIDR","IP-CIDR6","SRC-IP","PROTOCOL",
    "USER-AGENT","URL-REGEX","PROCESS-NAME","DEST-PORT",
    "AND","OR","NOT"
  ];
  const items = [];
  for (const k of order) if (map[k]) items.push([k, map[k]]);
  // 依据 detailLevel 选取数量
  const pick = detailLevel >= 1 ? 6 : 3;
  const seg = items.slice(0, pick).map(([k, v]) => `${shortKey(k)}:${fmtK(v)}`);
  return seg.length ? seg.join("  ") : "";
}

function secondTypesLine(map) {
  const keys = Object.keys(map);
  if (!keys.length) return "";
  const sorted = keys
    .filter(k => !["DOMAIN-SUFFIX","DOMAIN-KEYWORD","DOMAIN","DOMAIN-SET","RULE-SET","IP-CIDR","IP-CIDR6"].includes(k))
    .sort((a,b) => map[b]-map[a]);
  const seg = sorted.slice(0, 6).map(k => `${shortKey(k)}:${fmtK(map[k])}`);
  return seg.length ? seg.join("  ") : "";
}

function shortKey(k) {
  const alias = {
    "DOMAIN-SUFFIX":"DS",
    "DOMAIN-KEYWORD":"DK",
    "DOMAIN":"DOM",
    "DOMAIN-SET":"DSET",
    "RULE-SET":"RSET",
    "IP-CIDR":"IP4",
    "IP-CIDR6":"IP6",
    "PROCESS-NAME":"PROC",
    "USER-AGENT":"UA",
    "URL-REGEX":"REG",
    "DEST-PORT":"DPORT",
  };
  return alias[k] || k;
}
