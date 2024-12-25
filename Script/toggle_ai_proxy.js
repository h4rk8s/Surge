(async () => {
  const aiProxyName = "🤖 AI专线";
  const iosProxy = "🇺🇸 V4-美国洛杉矶01|v2ray";
  const macProxy = "✈️ sfo3-01";

  try {
    const currentConfig = await $httpAPI("get", "/v1/profiles/current");
    if (!currentConfig || !currentConfig.proxies || !currentConfig.proxies[aiProxyName]) {
      $notification.post("iOS配置切换", "错误", `找不到代理组: ${aiProxyName}`);
      $done();
      return;
    }

    const currentProxyGroup = currentConfig.proxies[aiProxyName];
    let targetProxy;

    if (currentProxyGroup.includes(iosProxy)) {
      targetProxy = macProxy;
    } else {
      targetProxy = iosProxy;
    }

    const newProxyGroupDefinition = `select,${targetProxy},url=https://chat.openai.com,interval=300`;

    await $httpAPI("post", "/v1/profiles/modify", {
      proxies: {
        [aiProxyName]: newProxyGroupDefinition,
      },
    });

    $notification.post(
      "iOS配置切换",
      "成功",
      `已切换 ${aiProxyName} 到: ${targetProxy}`
    );
  } catch (error) {
    console.log(`切换脚本错误: ${error}`);
    $notification.post("iOS配置切换", "失败", `切换 ${aiProxyName} 失败: ${error}`);
  }

  $done();
})();
