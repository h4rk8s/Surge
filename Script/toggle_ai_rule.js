(async () => {
  const aiListRule =
    'RULE-SET,https://raw.githubusercontent.com/h4rk8s/Surge/refs/heads/main/Custom/AI.list,';
  const defaultProxyGroup = "🤖 AI专线";
  const iosProxyGroup = "🇺🇸 AI专线2";
  const persistentKey = "ai_list_proxy_group";

  try {
    let currentProxyGroup = await $persistentStore.read(persistentKey);

    if (!currentProxyGroup) {
      currentProxyGroup = defaultProxyGroup;
        await $persistentStore.write(defaultProxyGroup, persistentKey);
    }
    const targetProxyGroup =
      currentProxyGroup === defaultProxyGroup ? iosProxyGroup : defaultProxyGroup;

    const config = await $httpAPI("get", "/v1/profiles/current");
    if (!config || !config.rules) {
      $notification.post("iOS配置切换", "错误", "无法获取规则配置");
      $done();
      return;
    }

    let found = false;
    let modifiedRules = config.rules.map((rule) => {
      if (rule.startsWith(aiListRule)) {
        found = true;
         return `${aiListRule}${targetProxyGroup}`;
      }
      return rule;
    });

    if (!found) {
        modifiedRules.push(`${aiListRule}${targetProxyGroup}`);
    }

    await $httpAPI("post", "/v1/profiles/modify", {
      rules: modifiedRules,
    });

      await $persistentStore.write(targetProxyGroup, persistentKey);
      $notification.post(
        "iOS配置切换",
        "成功",
        `配置已经切换到: ${targetProxyGroup}`
      );

  } catch (error) {
    console.log(`切换规则错误: ${error}`);
    $notification.post("iOS配置切换", "失败", `切换规则失败: ${error}`);
  }

  $done();
})();
