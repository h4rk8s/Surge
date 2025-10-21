/*
  节假提醒（稳健版）
  - 修复：当“今天之后”无节日时的越界错误
  - 扩充：加入 2025 Q4～2026 Q1 的常见阴/阳历节日
  - 兼容：永远能取到最近 3 个节日
  使用：保持你的 [Panel]/[Script] 配置不变即可
*/

// ===== 工具 =====
function toDate(s) { // "YYYY-M-D" -> Date(本地0点)
  const [y,m,d] = s.split('-').map(n => parseInt(n,10));
  return new Date(y, m - 1, d);
}
function daysBetween(fromStr, toStr) { // 不含今天的相差天数（向下取整）
  const ms = toDate(toStr) - toDate(fromStr);
  return Math.floor(ms / 86400000); // 1000*60*60*24
}
function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${t.getMonth()+1}-${t.getDate()}`;
}

// ===== 节日清单（按时间顺序）=====
// 结构：[ 名称, "YYYY-MM-DD" ]
const tlist = [
  // —— 2024 Q4
  ["重阳节", "2024-10-11"],
  ["万圣节", "2024-10-31"],
  ["平安夜", "2024-12-24"],
  ["圣诞节", "2024-12-25"],

  // —— 2025（保留你已有 + 补全）
  ["元旦",   "2025-01-01"],
  ["腊八",   "2025-01-07"],
  ["小年",   "2025-01-22"],       // 地区习俗不同，此处采用常见北方 12 月 23
  ["除夕",   "2025-01-28"],
  ["春节",   "2025-01-29"],       // 春节（公历）:contentReference[oaicite:5]{index=5}
  ["立春",   "2025-02-04"],
  ["元宵节", "2025-02-12"],       // 正月十五
  ["情人节", "2025-02-14"],
  ["妇女节", "2025-03-08"],
  ["清明节", "2025-04-04"],       // :contentReference[oaicite:6]{index=6}
  ["劳动节", "2025-05-01"],
  ["端午节", "2025-05-31"],       // :contentReference[oaicite:7]{index=7}
  ["父亲节", "2025-06-15"],
  ["七夕",   "2025-08-29"],       // 农历七月初七（2025）:contentReference[oaicite:8]{index=8}
  ["中秋节", "2025-10-06"],       // :contentReference[oaicite:9]{index=9}
  ["国庆节", "2025-10-01"],       // :contentReference[oaicite:10]{index=10}
  ["重阳节", "2025-10-29"],       // 农历九月初九（2025）:contentReference[oaicite:11]{index=11}
  ["万圣节", "2025-10-31"],
  ["光棍节", "2025-11-11"],
  ["感恩节", "2025-11-27"],       // US 第四个周四（有海外同事时挺实用）
  ["冬至",   "2025-12-21"],       // 冬至/十二月节气（北京）:contentReference[oaicite:12]{index=12}
  ["平安夜", "2025-12-24"],
  ["圣诞节", "2025-12-25"],

  // —— 2026 Q1（用于年末回卷后还能找得到）
  ["元旦",   "2026-01-01"],
  ["除夕",   "2026-02-16"],       // 春节前一日（2026）
  ["春节",   "2026-02-17"],       // 2026 春节:contentReference[oaicite:13]{index=13}
  ["元宵节", "2026-03-03"],       // 春节 + 15 天:contentReference[oaicite:14]{index=14}
];

// ===== 选择最近的 N 个节日（带回卷）=====
function nextIndices(n = 3) {
  const today = todayStr();
  const idx = [];
  for (let i = 0; i < tlist.length; i++) {
    if (daysBetween(today, tlist[i][1]) >= 0) idx.push(i);
    if (idx.length === n) break;
  }
  // 如果今年已到底，回卷到列表开头补足 n 个
  let j = 0;
  while (idx.length < n && j < tlist.length) {
    idx.push(j++);
  }
  return idx;
}

// ===== 推送 & 面板展示 =====
function sendIfToday(tuple) {
  const [name, date] = tuple;
  const now = new Date();
  const diff = daysBetween(todayStr(), date);
  if (diff === 0 && now.getHours() >= 6) {
    if ($persistentStore.read("timecardpushed") !== date) {
      $persistentStore.write(date, "timecardpushed");
      $notification.post("假日祝福", "", `今天是 ${date} ${name} 🎉`);
    }
  }
}

const picks = nextIndices(3); // 最近三个
const line = (idx) => {
  const [name, date] = tlist[idx];
  const d = daysBetween(todayStr(), date);
  if (d === 0) sendIfToday(tlist[idx]);
  return `${name}  :  ${d === 0 ? "🎉" : d + "天"}`;
};

$done({
  title: "节假提醒",
  icon: "list.dash.header.rectangle",
  "icon-color": "#5AC8FA",
  content: `${line(picks[0])}\n${line(picks[1])}\n${line(picks[2])}`
});
