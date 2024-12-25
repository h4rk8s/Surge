(async () => {
    const aiListRule =
        'RULE-SET,https://raw.githubusercontent.com/h4rk8s/Surge/refs/heads/main/Custom/AI.list,';
    const defaultProxyGroup = "🤖 AI专线";
    const iosProxyGroup = "🇺🇸 AI专线2";
    const persistentKey = "ai_list_proxy_group";
    let content = "";
    let targetProxyGroup;

    try {
        console.log("Script started: toggle_ai_rule.js");
         let currentProxyGroup = await $persistentStore.read(persistentKey);
         console.log("Persistent read - Proxy Group:", currentProxyGroup)
         if (!currentProxyGroup) {
             console.log("Persistent read - NOT found: Default set");
            currentProxyGroup = defaultProxyGroup;
             await $persistentStore.write(defaultProxyGroup, persistentKey);
        }

         targetProxyGroup =
            currentProxyGroup === defaultProxyGroup ? iosProxyGroup : defaultProxyGroup;
         console.log("Proxy selection:", targetProxyGroup);
        const config = await $httpAPI("get", "/v1/profiles/current");
        if (!config) {
             console.log("HTTP API Get - Error: Config is null or undefined");
            $notification.post("iOS配置切换", "错误 (CFG-01)", "无法获取 Surge 配置");
               content = `AI 代理: 错误 (CFG-01)`;
                $done({title: "切换AI代理", content: content, style: "info"});
            return;
        }

       if(!config.rules)
        {
           console.log("HTTP API Get - Error: No rules found")
          $notification.post("iOS配置切换", "错误 (CFG-02)", "无法获取规则配置");
               content = `AI 代理: 错误 (CFG-02)`;
                $done({title: "切换AI代理", content: content, style: "info"});
             return;
        }
         console.log("HTTP API Get - Rules: ", config.rules);
        let found = false;
        let modifiedRules = config.rules.map((rule) => {
            if (rule.startsWith(aiListRule)) {
                console.log("Found matching rule:", rule);
                found = true;
                return `${aiListRule}${targetProxyGroup}`;
            }
            return rule;
        });

       if (!found) {
           console.log("No existing rule found, adding one.");
           modifiedRules.push(`${aiListRule}${targetProxyGroup}`);
         }
        console.log("Modified Rule:", modifiedRules);
       const modifyConfig = await $httpAPI("post", "/v1/profiles/modify", {
            rules: modifiedRules,
        });
         if(!modifyConfig)
         {
           console.log("HTTP API POST - Error: response is null or undefined");
           $notification.post("iOS配置切换", "错误 (POST-01)", "无法修改 Surge 配置");
                 content = `AI 代理: 错误 (POST-01)`;
                 $done({title: "切换AI代理", content: content, style: "info"});
            return
         }

         console.log("HTTP API POST - Modified rules");
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

    $done({title: "切换AI代理", content: content, style: "info"});
})();
