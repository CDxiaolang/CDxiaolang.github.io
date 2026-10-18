const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const TID = 128840;
const COOKIE = process.env.LUOGU_COOKIE || '';

async function crawlAll() {
  console.log('启动浏览器进行抓取...');
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.goto('https://www.luogu.com.cn', { waitUntil: 'domcontentloaded' });

  if (COOKIE) {
    const cookieArray = COOKIE.split(';').map(c => c.trim()).filter(Boolean).map(c => {
      const [name, ...valueParts] = c.split('=');
      return { name, value: valueParts.join('='), domain: '.luogu.com.cn' };
    });
    await page.setCookie(...cookieArray);
  }

  const endpoints = [
    ['problem', 'problems'], ['homework', 'homework'],
    ['training', 'trainings'], ['contest', 'contests'],
    ['member', 'members'], ['file', 'files'], ['discuss', 'discussions'] 
  ];
  const D = {};

  async function fetchWithBrowser(pathStr) {
    return await page.evaluate(async (url) => {
      try {
        const res = await fetch(url, { 
          headers: { 'x-lentille-request': 'content-only' },
          credentials: 'include' 
        });
        if (res.status !== 200) return null;
        const text = await res.text();
        if (text.startsWith('<!DOCTYPE')) return null;
        return JSON.parse(text);
      } catch (e) { return null; }
    }, 'https://www.luogu.com.cn' + pathStr);
  }

  for (const [pathKey, key] of endpoints) {
    let all = [], pageNum = 1, lastData = null, prevFirstId = null;
    console.log(`开始抓取 ${pathKey}...`);
    
    while (pageNum <= 50) {
      let currentUrl = `/team/${TID}/${pathKey}`;
      if (pageNum > 1) currentUrl += `?page=${pageNum}`;
      
      const d = await fetchWithBrowser(currentUrl);
      if (!d) break;
      
      const jsonData = d.currentData || d;
      if (!lastData) lastData = jsonData;
      
      const dl = jsonData.data || jsonData;
      let container = dl[key] || dl[pathKey] || dl.result || dl;
      let list = null;
      if (container) {
          if (Array.isArray(container.result)) list = container.result;
          else if (Array.isArray(container)) list = container;
      }
      
      if (!list || !list.length) break;
      
      const firstId = list[0].pid || list[0].id || list[0].uid || list[0].name || '';
      if (prevFirstId !== null && firstId === prevFirstId) break;
      prevFirstId = firstId;
      
      all = all.concat(list);
      const count = Number(container.count) || 0;
      const perPage = Number(container.perPage) || 20;
      
      if ((count > 0 && all.length >= count) || list.length < perPage) break;
      
      pageNum++;
      await new Promise(r => setTimeout(r, 300));
    }
    
    if (lastData) {
      const dl = lastData.data || lastData;
      if (dl[key]) dl[key].result = all;
      else if (dl[pathKey]) dl[pathKey].result = all;
      D[pathKey] = lastData;
    }
    console.log(`✅ ${pathKey} 抓取完成，共 ${all.length} 条`);
  }
  
  console.log(`\n开始抓取团队主页及精确提取公告...`);
  await page.goto(`https://www.luogu.com.cn/team/${TID}`, { waitUntil: 'networkidle0' });
  
  // 🚀 精准提取公告代码（绝不会混入讨论区）
  const noticeHtml = await page.evaluate(() => {
      // 1. 找到包含“团队公告”文本的元素
      const titleEl = Array.from(document.querySelectorAll('*'))
          .find(el => el.textContent.trim() === '团队公告' && el.children.length === 0);
      
      if (titleEl) {
          // 向上找它的面板容器（洛谷通常用 .am-panel 或 .card）
          let panel = titleEl.closest('.am-panel, .card');
          if (panel) {
              // 提取面板里的内容区
              const content = panel.querySelector('.am-panel-bd, .card-body');
              if (content) return content.innerHTML;
          }
          
          // 如果找不到标准面板，尝试找父级的下一个兄弟节点
          let target = titleEl.nextElementSibling || titleEl.parentElement.nextElementSibling;
          if (target && !target.innerHTML.includes('最新讨论') && !target.innerHTML.includes('回复')) {
              return target.innerHTML;
          }
      }
      
      // 兜底：如果确实没找到，尝试在左侧区域找折叠块
      const leftPanel = document.querySelector('.am-u-md-9, .lg-left');
      if (leftPanel) {
          const blocks = leftPanel.querySelectorAll('details, blockquote');
          if (blocks.length > 0) {
              return Array.from(blocks).map(b => b.outerHTML).join('');
          }
      }
      return "";
  });
  
  const teamJson = await fetchWithBrowser(`/team/${TID}`);
  if (teamJson) D.team = teamJson.currentData || teamJson;
  
  D.noticeHtml = noticeHtml;
  D.updatedAt = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  
  fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(D, null, 2), 'utf-8');
  console.log('✅ 公告提取成功，内容长度:', noticeHtml.length);
  console.log('✅ 所有数据已保存到 data.json！');
  
  await browser.close();
}

crawlAll().catch(err => {
  console.error(err);
  process.exit(1);
});
