/* כניסה עם Google בהפניה (אייפון): כפתור → דף של Google → חזרה עם #id_token → מחובר.
   מריצים מול השרת המדומה (כמו suite.js). */
const puppeteer = require('puppeteer-core');
const APP = 'http://localhost:8765/';
const FB = 'http://localhost:8766';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
let fails = 0;
const check = (name, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? '✅' : '❌'} ${name}${d ? ' — ' + d : ''}`); };
const srv = () => fetch(FB + '/state', { method: 'POST' }).then(r => r.json());

(async () => {
  await fetch(FB + '/ctl', { method: 'POST', body: JSON.stringify({ reset: true }) });
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: 'C:/Users/tomer/AppData/Local/Temp/claude/rd' + (Date.now() % 100000) });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setUserAgent(IOS_UA);
  await page.goto(APP, { waitUntil: 'load' });
  await sleep(1500);

  const btn = await page.$('.welcome .g-redirect');
  check('אייפון: מסך הפתיחה מציג כפתור כניסה בהפניה', !!btn);
  check('אייפון: לא מוצג "להמשיך בינתיים"', await page.evaluate(() => document.querySelector('[data-wlater]').classList.contains('hidden')));

  // לחיצה → מעבר לדף של Google (עוצרים את הבקשה ובודקים את הפרמטרים)
  await page.setRequestInterception(true);
  let authUrl = null;
  page.on('request', r => { if (r.url().startsWith('https://accounts.google.com/o/oauth2/v2/auth')) { authUrl = new URL(r.url()); r.abort(); } else if (r.isInterceptResolutionHandled && !r.isInterceptResolutionHandled()) r.continue().catch(() => {}); });
  await btn.click();
  for (let i = 0; i < 30 && !authUrl; i++) await sleep(100);
  check('לחיצה עוברת לדף ההתחברות של Google', !!authUrl);
  const P = authUrl ? Object.fromEntries(authUrl.searchParams) : {};
  check('redirect_uri = כתובת האתר', P.redirect_uri === APP, P.redirect_uri);
  check('response_type=id_token, scope openid', P.response_type === 'id_token' && /openid/.test(P.scope));
  page.removeAllListeners('request'); await page.setRequestInterception(false);
  await page.goto(APP, { waitUntil: 'load' }); await sleep(1200); // הבקשה ל-Google נעצרה – חוזרים לאתר
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('indienegev-gsignin')));
  const hashed = await page.evaluate(async n => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(n)))].map(x => x.toString(16).padStart(2, '0')).join(''), saved.nonce);
  check('ל-Google נשלח ה-nonce המגובב, וה-state נשמר', P.nonce === hashed && P.state === saved.state);

  // נתונים שנוצרו לפני ההתחברות לא הולכים לאיבוד
  await page.evaluate(() => { S.picks = { 'thu-kof-2200': 2 }; save(); });

  // state שגוי → לא מתחבר
  await page.goto('about:blank'); await page.goto(APP + '#id_token=user:evil&state=wrong', { waitUntil: 'load' }); await sleep(1500);
  check('state שגוי נדחה', await page.evaluate(() => !cloudAuth));
  check('הכתובת נוקתה מהטוקן', await page.evaluate(() => location.hash === ''));

  // חזרה תקינה
  await page.evaluate(s => localStorage.setItem('indienegev-gsignin', JSON.stringify(s)), saved);
  await page.goto('about:blank'); await page.goto(APP + `#id_token=user:iosuser&state=${saved.state}&authuser=0&prompt=consent`, { waitUntil: 'load' });
  await sleep(3000);
  const st = await page.evaluate(() => ({ auth: cloudAuth && cloudAuth.uid, hash: location.hash, welcome: !!document.querySelector('.welcome'), picks: S.picks, key: localStorage.getItem('indienegev-gsignin') }));
  check('חזרה מ-Google → מחובר', !!st.auth, st.auth);
  check('מסך הפתיחה נסגר והכתובת נקייה', !st.welcome && st.hash === '');
  check('המפתח החד-פעמי נמחק', st.key === null);
  check('הלוז שנבחר לפני ההתחברות נשמר', st.picks['thu-kof-2200'] === 2);
  const s = await srv();
  check('הנתונים עלו לענן של המשתמש', s.docs[st.auth] && JSON.stringify(s.docs[st.auth]).includes('thu-kof-2200'));
  check('אין שגיאות JS', errors.length === 0, errors.join(' | '));

  // אנדרואיד/מחשב: הכפתור הרגיל + קישור חלופי
  const p2 = await (await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: 'C:/Users/tomer/AppData/Local/Temp/claude/rd2' + (Date.now() % 100000) })).newPage();
  await p2.goto(APP, { waitUntil: 'load' }); await sleep(2500);
  check('אנדרואיד/מחשב: יש קישור כניסה חלופי', !!(await p2.$('.welcome .g-alt, .welcome .g-redirect')));

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(0);
})();
