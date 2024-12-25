(async () => {
  const aiListRulePrefix = 'RULE-SET,https://raw.githubusercontent.com/h4rk8s/Surge/refs/heads/main/Custom/AI.list,';
  const defaultProxyGroup = "🤖 AI专线";
  const iosProxyGroup = "🇺🇸 AI专线2";
  const persistentKey = "ai_list_proxy_group";
  let content = "";

  try {
    console.log("Script started: toggle_ai_rule.js");
    let currentProxyGroup = await $persistentStore.read(persistentKey);
    console.log("Persistent read - Proxy Group:", currentProxyGroup);

    if (!currentProxyGroup) {
      console.log("Persistent read - NOT found: Default set");
      currentProxyGroup = defaultProxyGroup;
      await $persistentStore.write(defaultProxyGroup, persistentKey);
    }

    const targetProxyGroup = currentProxyGroup === defaultProxyGroup ? iosProxyGroup : defaultProxyGroup;
    console.log("Target Proxy Group:", targetProxyGroup);

    // 获取当前配置文件的内容
    const profileResponse = await httpAPI("/v1/profiles/current", "GET");
    if (!profileResponse || !profileResponse.content) {
      console.log("HTTP API Get - Error: Could not retrieve profile content");
      $notification.post("iOS配置切换", "错误 (CFG-01)", "无法获取 Surge 配置内容");
      content = `AI 代理: 错误 (CFG-01)`;
      $done({ title: "切换AI代理", content: content, style: "info" });
      return;
    }

    let profileContent = profileResponse.content;
    const regex = new RegExp(`${aiListRulePrefix}(.*)`);
    const match = profileContent.match(regex);

    if (match) {
      const oldRule = `${aiListRulePrefix}${match[1]}`;
      const newRule = `${aiListRulePrefix}${targetProxyGroup}`;
      profileContent = profileContent.replace(oldRule, newRule);
      console.log("Rule replaced:", oldRule, "->", newRule);
    } else {
      // 如果没有找到规则，则添加规则到 [Rule] 部分的末尾
      const ruleSectionStart = profileContent.indexOf("[Rule]");
      if (ruleSectionStart !== -1) {
        let insertionIndex = profileContent.indexOf("\n", ruleSectionStart);
        if (insertionIndex === -1) {
          insertionIndex = profileContent.length;
        }
        profileContent = profileContent.slice(0, insertionIndex) + `\n${aiListRulePrefix}${targetProxyGroup}` + profileContent.slice(insertionIndex);
        console.log("Rule added:", `${aiListRulePrefix}${targetProxyGroup}`);
      } else {
        console.log("Error: [Rule] section not found in profile.");
        $notification.post("iOS配置切换", "错误", "未在配置中找到 [Rule] 部分");
        content = `AI 代理: 错误 (规则未找到)`;
        $done({ title: "切换AI代理", content: content, style: "info" });
        return;
      }
    }

    // 更新配置文件
    const modifyConfig = await httpAPI("/v1/profiles/modify", "POST", { content: profileContent });
    if (!modifyConfig) {
      console.log("HTTP API POST - Error: Failed to modify profile");
      $notification.post("iOS配置切换", "错误 (POST-01)", "无法修改 Surge 配置");
      content = `AI 代理: 错误 (POST-01)`;
      $done({ title: "切换AI代理", content: content, style: "info" });
      return;
    }
    console.log("HTTP API POST - Profile modified successfully");

    await $persistentStore.write(targetProxyGroup, persistentKey);
    $notification.post(
      "iOS配置切换",
      "成功",
      `配置已经切换到: ${targetProxyGroup}`
    );
    content = `AI 代理: ${targetProxyGroup}`;
    console.log("Final Content:", content);

  } catch (error) {
    console.log(`切换规则错误 (ERR-01):`, error);
    $notification.post("iOS配置切换", "失败 (ERR-01)", `切换规则失败: ${error}`);
    content = `AI 代理: 错误 (ERR-01)`;
  }
  $done({ title: "切换AI代理", content: content, style: "info" });

  // prettier-ignore
  function httpAPI(path = "", method = "GET", body = null) {
    return new Promise((resolve) => {
      $httpClient[method.toLowerCase()](path, body, (error, response, data) => {
        if (error) {
          console.error(`HTTP API Error: ${error}`);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }
})();
