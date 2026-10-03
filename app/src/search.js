/* מסך חיפוש: לפי שם אמן, תעתיק, משתתפים ותוכן אירועי אדמה */

const searchState = { q: '', kind: 'all' };
let searchRefresh = null; // רענון תוצאות בלבד, כדי לא לאבד פוקוס בשדה

function renderSearch(view) {
  view.innerHTML = `<div class="scroll" id="sscroll">
    <div class="search-box">
      <label class="field">${ICON.search}<span class="sr">חיפוש</span>
        <input id="q" type="search" placeholder="שם אמן, להקה או משתתף…" autocomplete="off" enterkeyhint="search" value="${esc(searchState.q)}">
      </label>
      <div class="chips" role="group" aria-label="סינון">
        ${[['all', 'הכל'], ['music', 'הופעות'], ['adama', 'מתחם אדמה']].map(([k, l]) =>
          `<button data-kind="${k}" aria-pressed="${searchState.kind === k}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="pad" id="results" style="padding-top:4px"></div>
  </div>`;
  const input = $('#q');
  const results = $('#results');
  const draw = () => {
    const res = search(searchState.q, searchState.kind);
    const head = searchState.q.trim()
      ? (res.length ? `${res.length} תוצאות` : '')
      : `כל האמנים והאירועים (${res.length}) · א–ת`;
    results.innerHTML = res.length
      ? `<div class="result-meta">${head}</div>` + res.map(r => eventRow(r.ev, { hl: r.hl, hint: r.hint, showDay: true })).join('')
      : `<div class="empty"><h2>לא מצאנו</h2><p>אין אמן או אירוע בשם "${esc(searchState.q)}".<br>אפשר לנסות חלק מהשם, בעברית או באנגלית.</p></div>`;
  };
  input.addEventListener('input', () => { searchState.q = input.value; draw(); });
  $('.chips', view).addEventListener('click', e => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    searchState.kind = b.dataset.kind;
    $$('.chips button', view).forEach(x => x.setAttribute('aria-pressed', x === b));
    draw();
  });
  bindRows(results);
  draw();
  searchRefresh = () => { const st = $('#sscroll').scrollTop; draw(); $('#sscroll').scrollTop = st; };
  if (!searchState.q) setTimeout(() => input.focus({ preventScroll: true }), 60);
}
