// 刷新代理线路（从当前配置注释读取 SUB_URL）
// 读取优先级：配置注释 "# SUB_URL = ..." > $persistentStore("SUB_URL") > $argument.sub_url（可选）
// 记录：$persistentStore("proxies_last_update")

const START_FLAG = '# mark start of cloud Proxy';
const END_FLAG   = '# mark end of cloud Proxy';

function httpGet(url) {
  return new Promise(r => $httpClient.get(url, (e, resp, data) => r({e, resp, data})));
}
function httpAPI(method, path, body) {
  return new Promise(r => $httpAPI(method, path, body || {}, x => r(x || {})));
}
function notify(t, s, b) { $notification.post(t, s, b); }
function nowStr() {
  const d = new Date(); const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function readSubURLFromProfileOrKV() {
  // 先读当前 profile 文本
  const prof = await httpAPI("GET", "/v1/profiles/current");
  const text = typeof prof?.content === 'string' ? prof.content : '';
  let m = text.match(/^\s*#\s*SUB_URL\s*=\s*(\S+)\s*$/m);
  if (m && m[1]) return m[1];

  // 其次查 KV
  const kv = $persistentStore.read("SUB_URL");
  if (kv) return kv;

  // 再看 argument
  if (typeof $argument === 'string' && $argument.includes('sub_url=')) {
    const u = decodeURIComponent(($argument.match(/sub_url=([^&]+)/)||[])[1] || '');
    if (u) return u;
  }
  return null;
}

(async () => {
  const SUB_URL = await readSubURLFromProfileOrKV();

  if (!SUB_URL) {
    notify('刷新代理线路失败', '未找到订阅地址', '请在配置中加入一行 "# SUB_URL = http://..."');
    return $done({ title: '未配置 SUB_URL', content: '请在配置加入 # SUB_URL = ...', 'icon': 'exclamationmark.triangle', 'icon-color': '#FF9500' });
  }

  // 1) 拉取 proxies.list
  const r = await httpGet(SUB_URL);
  if (r.e || !r.data || !r.data.trim()) {
    notify('刷新代理线路失败', '获取 proxies.list 失败', String(r.e || r.resp?.status || 'empty'));
    return $done({ title: '获取失败', content: String(r.e || r.resp?.status || 'empty'), 'icon': 'xmark.seal', 'icon-color': '#FF3B30' });
  }
  const proxiesList = r.data.trim();
  const lines = proxiesList.split('\n').filter(Boolean).length;

  // 2) 先触发重载（模块/云端方案）
  await httpAPI("POST", "/v1/profiles/reload");

  // 3) 尝试 A 方案：就地替换
  const prof = await httpAPI("GET", "/v1/profiles/current");
  const text = typeof prof?.content === 'string' ? prof.content : '';
  if (text.includes(START_FLAG) && text.includes(END_FLAG)) {
    const newBlock = `${START_FLAG}\n${proxiesList}\n${END_FLAG}`;
    const replaced = text.replace(new RegExp(`${START_FLAG}[\\s\\S]*?${END_FLAG}`), newBlock);

    const write = await httpAPI("POST", "/v1/profiles", { content: replaced });
    if (write && write.status === 200) {
      await httpAPI("POST", "/v1/profiles/reload");
      $persistentStore.write(nowStr(), "proxies_last_update");
      notify('刷新代理线路成功', '', `共 ${lines} 条`);
      return $done({ title: '刷新成功', content: `已更新 ${lines} 条 · ${nowStr()}`, 'icon': 'arrow.triangle.2.circlepath', 'icon-color': '#34C759' });
    } else {
      // 不可写回（大多 iOS 如此）：退而复制到剪贴板，提示手工粘贴
      $clipboard.write(`[Proxy]\n${newBlock}`);
      $persistentStore.write(nowStr(), "proxies_last_update");
      notify('需要手动粘贴', '', '已复制新的 [Proxy] 片段到剪贴板，请粘贴回配置并保存。');
      return $done({ title: '需手动粘贴', content: `已复制片段 · ${lines} 条 · ${nowStr()}`, 'icon': 'doc.on.clipboard', 'icon-color': '#FF9500' });
    }
  } else {
    // 未放标记，视为模块/云端模式：仅重载即可
    $persistentStore.write(nowStr(), "proxies_last_update");
    notify('已触发重载', '', '模块/远端节点将自动刷新');
    return $done({ title: '已触发重载', content: `模块将更新 · ${lines} 条 · ${nowStr()}`, 'icon': 'arrow.clockwise', 'icon-color': '#34C759' });
  }
})().catch(e => {
  notify('刷新代理线路异常', '', String(e));
  $done({ title: '刷新异常', content: String(e), 'icon': 'xmark.seal', 'icon-color': '#FF3B30' });
});
