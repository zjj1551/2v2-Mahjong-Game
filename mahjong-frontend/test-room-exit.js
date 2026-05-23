const puppeteer = require('puppeteer');

(async () => {
    console.log("Starting Puppeteer test for room creation and exit...");
    const browser = await puppeteer.launch({
        headless: "new"
    });
    const page = await browser.newPage();
    
    try {
        await page.goto('http://127.0.0.1:8080/index.html');
        console.log("Navigated to app.");
        
        // Wait for lobby to load (auto-login should happen)
        await page.waitForSelector('#view-lobby:not(.hidden)', { timeout: 5000 });
        console.log("Lobby loaded.");
        
        // Check initial room list
        let initialRooms = await page.$eval('#room-list', el => el.children.length);
        console.log(`Initial room count in lobby: ${initialRooms}`);

        // Click create room
        await page.click('#btn-create-room');
        console.log("Clicked Create Room.");
        
        // Wait for room prep view to become visible
        await page.waitForSelector('#view-room-prep:not(.hidden)', { timeout: 5000 });
        console.log("Entered Room Prep view.");
        
        // Give socket time to sync
        await new Promise(r => setTimeout(r, 1000));
        
        // Click return to lobby
        await page.evaluate(() => {
            const btn = document.querySelector('#view-room-prep .lobby-header button');
            if(btn) btn.click();
        });
        console.log("Clicked Return to Lobby.");
        
        // Wait for lobby view again
        await page.waitForSelector('#view-lobby:not(.hidden)', { timeout: 5000 });
        console.log("Returned to lobby.");
        
        // Give socket time to broadcast room destruction
        await new Promise(r => setTimeout(r, 1000));
        
        // Check final room list
        let finalRooms = await page.$eval('#room-list', el => el.children.length);
        console.log(`Final room count in lobby: ${finalRooms}`);
        
        if (finalRooms === initialRooms) {
            console.log("TEST PASSED: Room was successfully deleted upon exit.");
        } else {
            console.log("TEST FAILED: Room count changed, room might not have been deleted.");
        }

    } catch (err) {
        console.error("Test encountered an error:", err);
    } finally {
        await browser.close();
    }
})();
