const src = require('fs').readFileSync(__dirname + '/../src/cloud-core.js', 'utf8');
const M = new Function(src + '; return { lww, stampEdits, items };')();
// מצב מהגרסה הקודמת: בלי mt ובלי tomb
const legacy = { v: 1, picks: { a: 2, b: 1, c: 2 }, ratings: { a: { crowd: 3 } }, nope: { z: true }, notes: [{ id: 'n1', text: 'x', at: 5 }], friends: [{ name: 'נועה', picks: {} }], prefs: { tent: { x: 1, y: 2 } }, name: 'tomer' };
const out = [];
const k = st => Object.keys(M.items(st)).sort().join(',');
out.push(['legacy+legacy', k(M.lww(legacy, JSON.parse(JSON.stringify(legacy)))) === k(legacy)]);
const stamped = JSON.parse(JSON.stringify(legacy)); M.stampEdits(legacy, stamped, 100);
out.push(['new(no edits)+legacy', k(M.lww(stamped, legacy)) === k(legacy) && k(M.lww(legacy, stamped)) === k(legacy)]);
const del = JSON.parse(JSON.stringify(stamped)); delete del.picks.b; M.stampEdits(stamped, del, 200);
out.push(['explicit delete wins over legacy copy', !('p:b' in M.items(M.lww(legacy, del))) && !('p:b' in M.items(M.lww(del, legacy)))]);
out.push(['other legacy items kept', ['p:a', 'p:c', 'r:a', 'x:z', 'n:n1', 'f:נועה', 'tent', 'name'].every(x => x in M.items(M.lww(legacy, del)))]);
console.log(out.map(([n, ok]) => (ok ? '✅ ' : '❌ ') + n).join('\n'));
