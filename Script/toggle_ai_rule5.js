(async () => {
  const defaultProxyGroup = "🤖 AI专线";
  const iosProxyGroup = "🇺🇸 AI专线2";
  const persistentKey = "ai_proxy_group";
  let content = "";
  let targetProxyGroup;

  try {
    console.log("Script started: toggle_ai_proxy.js");

    // 读取持久化存储中的当前代理组
    let currentProxyGroup = await $persistentStore.read(persistentKey);
    console.log("Persistent read - Proxy Group:", currentProxyGroup);
    
    if (!currentProxyGroup) {
      console.log("Persistent read - NOT found: Default set");
      currentProxyGroup = defaultProxyGroup;
      await $persistentStore.write(defaultProxyGroup, persistentKey);
    }

    // 根据当前代理组状态，选择目标代理组
    targetProxyGroup = currentProxyGroup === defaultProxyGroup ? iosProxyGroup : defaultProxyGroup;
    console.log("Proxy selection:", targetProxyGroup);

    // 获取 Surge 当前配置
    const config = await httpAPI("/v1/profiles/current", "GET", { sensitive: 0 });
    console.log("Retrieved config:", config);

    if (!config || !config.proxies) {
      console.log("HTTP API Get - Error: Config or Proxies are null/undefined");
      $notification.post("iOS配置切换", "错误 (CFG-02)", "无法获取代理配置");
      content = `AI 代理: 错误 (CFG-02)`;
      $done({ title: "切换AI代理", content: content, style: "info" });
      return;
    }

    // 修改 Proxy Group 的目标代理
    const modifiedProxies = config.proxies.map(proxy => {
      if (proxy.name === "AI 专线") {
        // 切换代理组中的激活代理
        return { ...proxy, type: "select", proxies: [targetProxyGroup] };
      }
      return proxy;
    });

    const modifyConfig = await httpAPI("/v1/profiles/modify", "POST", { proxies: modifiedProxies });
    if (!modifyConfig) {
      console.log("HTTP API POST - Error: response is null or undefined");
      $notification.post("iOS配置切换", "错误 (POST-01)", "无法修改 Surge 配置");
      content = `AI 代理: 错误 (POST-01)`;
      $done({ title: "切换AI代理", content: content, style: "info" });
      return;
    }

    console.log("HTTP API POST - Modified Proxy Group");

    // 保存目标代理组到持久化存储
    await $persistentStore.write(targetProxyGroup, persistentKey);

    $notification.post("iOS配置切换", "成功", `配置已经切换到: ${targetProxyGroup}`);
    content = `AI 代理: ${targetProxyGroup}`;
    console.log("Final Content:", content);

  } catch (error) {
    console.log(`切换代理错误 (ERR-01):`, error);
    $notification.post("iOS配置切换", "失败 (ERR-01)", `切换代理失败: ${error}`);
    content = `AI 代理: 错误 (ERR-01)`;
  }

  $done({ title: "切换AI代理", content: content, style: "info" });

  // prettier-ignore
  function httpAPI(path = "", method = "GET", body = null) {
    return new Promise((resolve) => {
      $httpAPI(method, path, body, (result) => { resolve(result); });
    });
  }
})();
