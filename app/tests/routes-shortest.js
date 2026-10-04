const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: 'C:/Users/tomer/AppData/Local/Temp/claude/Q' + (Date.now() % 100000), protocolTimeout: 900000 });
  const p = await b.newPage();
  await p.goto('http://localhost:8765/', { waitUntil: 'load' });
  const r = await p.evaluate(() => {
    S.prefs.tent = { x: 22.5, y: 64 }; syncTent();
    const ids = PLACES.map(x => x.id);
    const cellLen = path => { let L = 0; for (let i = 1; i < path.length; i++) { const a = path[i - 1], c = path[i]; L += Math.hypot(a % WALK.GW - c % WALK.GW, ((a / WALK.GW) | 0) - ((c / WALK.GW) | 0)); } return L * WALK.cell; };
    const ptsLen = pts => pts.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - pts[i].x, q.y - pts[i].y), 0);
    const rows = [];
    for (const a of ids) for (const c of ids) {
      if (a === c) continue;
      const pa = placeXY(PLACE[a]), pc = placeXY(PLACE[c]);
      const s = snapCell(pa), g = snapCell(pc);
      const best = astar(s, g, true);
      const route = findRoute(a, c);
      if (!best || !route) { rows.push({ a, c, bad: 'unreachable' }); continue; }
      // אותם קטעי חיבור מהנקודה לשביל בשני המקרים
      const conn = Math.hypot(pa.x - (s % WALK.GW + .5) * WALK.cell, pa.y - (((s / WALK.GW) | 0) + .5) * WALK.cell) + Math.hypot(pc.x - (g % WALK.GW + .5) * WALK.cell, pc.y - (((g / WALK.GW) | 0) + .5) * WALK.cell);
      const bestLen = cellLen(best) + conn, routeLen = ptsLen(route.pts);
      rows.push({ a, c, ratio: routeLen / bestLen, extra: routeLen - bestLen });
    }
    const ok = rows.filter(r => r.ratio);
    ok.sort((x, y) => y.ratio - x.ratio);
    const q = f => ok[Math.floor(ok.length * f)].ratio;
    return { n: rows.length, bad: rows.filter(r => r.bad).length, max: ok[0], p50: q(0.5), p90: q(0.1), p99: q(0.01), worst: ok.slice(0, 12).map(r => `${r.a}>${r.c} x${r.ratio.toFixed(3)} (+${Math.round(r.extra)}px)`), over10: ok.filter(r => r.ratio > 1.10).length, over5: ok.filter(r => r.ratio > 1.05).length };
  });
  console.log(`pairs ${r.n}, unreachable ${r.bad}`);
  console.log(`route/shortest: median ${r.p50.toFixed(3)}, 90% ${r.p90.toFixed(3)}, 99% ${r.p99.toFixed(3)}, max ${r.max.ratio.toFixed(3)}`);
  console.log(`>5% longer: ${r.over5}, >10% longer: ${r.over10}`);
  console.log('worst:\n ' + r.worst.join('\n '));
  await b.close();
})();
