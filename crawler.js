  const noticeHtml = await page.evaluate(() => {
      // 1. 精确寻找包含“团队公告”字样的标题元素
      const titleEl = Array.from(document.querySelectorAll('*'))
          .find(el => el.textContent.trim() === '团队公告' && el.children.length === 0);
      
      let resultHtml = "";
      
      if (titleEl) {
          // 往上找它的父级面板
          let parentPanel = titleEl.closest('.am-panel, .card, [class*="panel"], [class*="notice"]');
          if (parentPanel) {
              // 提取面板里的内容区域
              const content = parentPanel.querySelector('.am-panel-bd, .card-body, .markdown-body');
              if (content) resultHtml = content.innerHTML;
          }
          
          // 如果上面的没找到，就找它的下一个兄弟节点
          if (!resultHtml) {
              let target = titleEl.nextElementSibling || titleEl.parentElement.nextElementSibling;
              if (target && !target.innerHTML.includes('最新讨论')) {
                  resultHtml = target.innerHTML;
              }
          }
      }

      // 2. 如果没找到标题，或者抓出来的是空的，尝试直接抓特定位置的折叠块
      if (!resultHtml || resultHtml.length < 10) {
          // 团队公告通常在左侧主要区域，不在右侧讨论区
          const leftCol = document.querySelector('.lg-left, .am-u-md-9, [class*="left"]');
          const blocks = leftCol ? leftCol.querySelectorAll('details, blockquote') : [];
          
          if (blocks.length > 0) {
              resultHtml = Array.from(blocks).slice(0, 10).map(b => b.outerHTML).join('');
          }
      }

      // 3. 终极防御：如果抓出来的东西包含了“回复”、“最新讨论”等字眼，说明抓串了，直接清空！
      if (resultHtml.includes('回复') || resultHtml.includes('最新讨论') || resultHtml.includes('发表讨论')) {
          return "";
      }

      return resultHtml;
  });
