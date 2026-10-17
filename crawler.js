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
  
  console.log(`\n开始抓取团队主页及公告渲染...`);
  await page.goto(`https://www.luogu.com.cn/team/${TID}`, { waitUntil: 'networkidle0' });
  
  // 🚀 暴力抠取页面上的公告 DOM（带蓝色边线的区域）
  const noticeHtml = await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('*'));
      const titleEl = allEls.find(el => el.textContent.trim() === '团队公告' && !el.querySelector('*'));
      
      if (titleEl) {
          let parent = titleEl.parentElement;
          let target = parent.nextElementSibling || parent.parentElement.nextElementSibling;
          if (target) return target.innerHTML;
      }
      
      // 兜底：直接把所有引用块和折叠块抓下来
      const blocks = document.querySelectorAll('blockquote, details, .lg-article');
      if (blocks.length > 0) {
          return Array.from(blocks).map(b => b.outerHTML).join('<br>');
      }
      return "";
  });
  
  // 获取基础 JSON 信息
  const teamJson = await fetchWithBrowser(`/team/${TID}`);
  if (teamJson) D.team = teamJson.currentData || teamJson;
  
  D.noticeHtml = noticeHtml;
  D.updatedAt = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(D, null, 2), 'utf-8');
  console.log('✅ 团队公告 HTML 抠取成功！');
  
  await browser.close();
}

crawlAll().catch(err => {
  console.error(err);
  process.exit(1);
});
