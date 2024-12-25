(async () => {
  let platform = '';
  if (typeof $environment !== 'undefined' && $environment.platform === 'ios') {
    platform = 'ios';
  } else if (typeof $environment !== 'undefined' && $environment.platform === 'macos') {
    platform = 'macos';
  }

  const iosProxy = '🇺🇸 V4-美国洛杉矶01|v2ray';
  const macProxy = '✈️ sfo3-01';
  const aiProxyName = '🤖 AI专线';

  let selectedProxy = 'DIRECT'; // 默认值
  if (platform === 'ios') {
    selectedProxy = iosProxy;
  } else if (platform === 'macos') {
    selectedProxy = macProxy;
  }

  const newProxyGroupDefinition = `select,${selectedProxy},DIRECT,url=https://chat.openai.com,interval=300`;

  try {
    const currentConfig = await $httpAPI('get', '/v1/profiles/current');
    if (currentConfig && currentConfig.proxies && currentConfig.proxies[aiProxyName]) {
      if (currentConfig.proxies[aiProxyName] !== newProxyGroupDefinition) {
        await $httpAPI('post', '/v1/profiles/modify', {
          proxies: {
            [aiProxyName]: newProxyGroupDefinition
          }
        });
        $notification.post("Surge 平台代理切换", "", `已为 ${platform} 设置代理: ${selectedProxy}`);
      }
    } else {
      await $httpAPI('post', '/v1/profiles/modify', {
        proxies: {
          [aiProxyName]: newProxyGroupDefinition
        }
      });
      $notification.post("Surge 平台代理创建", "", `已创建 ${platform} 代理: ${selectedProxy}`);
    }
  } catch (error) {
    console.log(`Surge Script Error: ${error}`);
    $notification.post("Surge Script 错误", "", `平台代理切换失败: ${error}`);
  }

  $done();
})();
