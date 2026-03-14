const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
        
        await page.goto('file:///c:/Users/23223/Desktop/%E9%BA%BB%E5%B0%86/mahjong-frontend/index.html');
        console.log('Page loaded');
        
        await page.type('#login-username', 'testuser');
        await page.type('#login-password', 'testpass');
        console.log('Clicking login...');
        await page.click('#btn-login');
        
        await new Promise(r => setTimeout(r, 2000));
        await browser.close();
    } catch (e) {
        console.error("Test script failed", e);
    }
})();
