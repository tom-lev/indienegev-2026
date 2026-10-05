"""שרת מדומה שמתנהג כמו Firebase Auth + Firestore לצורך בדיקות.
- id_token של גוגל בצורה 'user:<name>' → uid קבוע לכל משתמש
- טוקנים עם תוקף, refresh שמסובב טוקן, אפשרות לבטל refresh token
- Firestore: אכיפת חוקי האבטחה (auth.uid == uid במסלול)
- מצבי תקלה: down (אין קליטה), slow (קליטה חלשה), err500, err403
"""
import json, time, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

lock = threading.Lock()
DOCS = {}          # uid -> {'body': str, 'updated': float}
SHARES = {}        # uid -> body (לוז חי: קריאה לכולם, כתיבה לבעלים)
STATS = {'a': {}, 'm': {}, 'u': 0}  # לוח הספירה (stats/popular)
TOKENS = {}        # idToken -> (uid, exp)
REFRESH = {}       # refreshToken -> uid
REVOKED = set()
LOG = []
MODE = {'down': False, 'slow': 0, 'err': 0, 'tokenTtl': 3600}
counter = [0]


def ts():
    t = time.time()
    return time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(t)) + '.%06dZ' % int((t % 1) * 1e6)


def new_tokens(uid):
    counter[0] += 1
    idt, rt = f'id-{uid}-{counter[0]}', f'rt-{uid}-{counter[0]}'
    TOKENS[idt] = (uid, time.time() + MODE['tokenTtl'])
    REFRESH[rt] = uid
    return idt, rt


class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')

    def reply(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.cors()
        self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b)))
        self.end_headers(); self.wfile.write(b)

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n).decode()

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.send_header('Content-Length', '0'); self.end_headers()

    def gate(self):
        """מדמה מצב רשת. מחזיר True אם הבקשה 'לא הגיעה'."""
        if MODE['down']:
            self.close_connection = True
            try: self.connection.shutdown(2)
            except Exception: pass
            return True
        if MODE['slow']:
            time.sleep(MODE['slow'])
        return False

    def who(self):
        a = self.headers.get('Authorization', '')
        if not a.startswith('Bearer '): return None, 'missing'
        t = TOKENS.get(a[7:])
        if not t: return None, 'invalid'
        if t[1] < time.time(): return None, 'expired'
        return t[0], None

    # ── control & auth ──
    def do_POST(self):
        path = urlparse(self.path).path
        b = self.body()
        if path == '/ctl':
            cmd = json.loads(b)
            with lock:
                if cmd.get('reset'):
                    DOCS.clear(); SHARES.clear(); STATS.update({'a': {}, 'm': {}, 'u': 0}); TOKENS.clear(); REFRESH.clear(); REVOKED.clear(); LOG.clear()
                    MODE.update({'down': False, 'slow': 0, 'err': 0, 'tokenTtl': 3600})
                for k in ('down', 'slow', 'err', 'tokenTtl'):
                    if k in cmd: MODE[k] = cmd[k]
                if 'revoke' in cmd:
                    for rt, u in list(REFRESH.items()):
                        if u == cmd['revoke']: REVOKED.add(rt)
                if 'expireAll' in cmd:
                    for k, (u, e) in list(TOKENS.items()): TOKENS[k] = (u, 0)
                if 'delShare' in cmd: SHARES.pop(cmd['delShare'], None)
                if 'setDoc' in cmd:
                    d = cmd['setDoc']; DOCS[d['uid']] = {'body': d['body'], 'updated': time.time(), 'ut': ts()}
            return self.reply(200, {'ok': True})
        if path == '/state':
            with lock:
                docs = {}
                stats = json.loads(json.dumps(STATS))
                for uid, d in DOCS.items():
                    f = json.loads(d['body'])['fields']
                    docs[uid] = {'fp': f['fp']['integerValue'], 'state': json.loads(f['data']['stringValue'])['state'], 'updated': d['updated']}
                return self.reply(200, {'log': LOG, 'docs': docs, 'stats': stats})
        if self.gate(): return
        if path == '/fs:commit':
            who, why = self.who()
            if who is None: return self.reply(403, {'error': {'status': 'PERMISSION_DENIED'}})
            w = json.loads(b)['writes'][0]
            with lock:
                for t in w.get('updateTransforms', []):
                    fp, d = t['fieldPath'], int(t['increment']['integerValue'])
                    if fp == 'u': STATS['u'] += d; continue
                    k, ev = fp.split('.', 1); ev = ev.strip('`')
                    STATS[k][ev] = STATS[k].get(ev, 0) + d
                LOG.append(f'stats commit {who}')
            return self.reply(200, {'writeResults': [{}]})
        if path == '/idp':
            j = json.loads(b)
            gid = parse_qs(j['postBody'])['id_token'][0]
            if not gid.startswith('user:'): return self.reply(400, {'error': {'message': 'INVALID_IDP_RESPONSE'}})
            name = gid[5:]
            uid = 'uid-' + name
            with lock:
                idt, rt = new_tokens(uid)
                LOG.append(f'signin {uid}')
            return self.reply(200, {'localId': uid, 'email': f'{name}@example.com', 'displayName': name.capitalize() + ' Test',
                                    'idToken': idt, 'refreshToken': rt, 'expiresIn': str(MODE['tokenTtl'])})
        if path == '/token':
            rt = parse_qs(b).get('refresh_token', [''])[0]
            with lock:
                if rt not in REFRESH or rt in REVOKED:
                    LOG.append('refresh DENIED')
                    return self.reply(400, {'error': {'message': 'TOKEN_EXPIRED'}})
                uid = REFRESH[rt]
                counter[0] += 1
                idt, nrt = f'id-{uid}-{counter[0]}', rt
                TOKENS[idt] = (uid, time.time() + MODE['tokenTtl'])
                LOG.append(f'refresh {uid}')
            return self.reply(200, {'id_token': idt, 'refresh_token': nrt, 'expires_in': str(MODE['tokenTtl']), 'user_id': uid})
        self.reply(404, {})

    # ── firestore ──
    def doc_uid(self):
        p = urlparse(self.path).path
        pre = '/fs/backups/'
        return p[len(pre):] if p.startswith(pre) else None

    def rules(self, uid):
        who, why = self.who()
        if who is None:
            return (401 if why in ('invalid', 'expired') else 403), why
        if who != uid:
            return 403, f'{who} -> {uid}'
        return None, None

    def share_uid(self):
        p = urlparse(self.path).path
        return p[len('/fs/shares/'):] if p.startswith('/fs/shares/') else None

    def do_PATCH(self):
        b = self.body()
        if self.gate(): return
        su = self.share_uid()
        if su is not None:
            code, why = self.rules(su)
            if code:
                LOG.append(f'share write DENIED {code} {why}')
                return self.reply(code, {'error': {'status': 'PERMISSION_DENIED'}})
            q = parse_qs(urlparse(self.path).query)
            with lock:
                if 'updateMask.fieldPaths' in q and su in SHARES:
                    doc = json.loads(SHARES[su]); new = json.loads(b)
                    for fp in q['updateMask.fieldPaths']:
                        if fp in new['fields']: doc['fields'][fp] = new['fields'][fp]
                    b = json.dumps(doc)
                SHARES[su] = b; LOG.append(f'share write {su}')
            return self.reply(200, json.loads(b))
        uid = self.doc_uid()
        code, why = self.rules(uid)
        if code:
            LOG.append(f'write DENIED {code} {why}')
            return self.reply(code, {'error': {'status': 'PERMISSION_DENIED'}})
        if MODE['err']:
            LOG.append(f'write ERR {MODE["err"]}')
            return self.reply(MODE['err'], {'error': {}})
        q = parse_qs(urlparse(self.path).query)
        with lock:
            cur = DOCS.get(uid)
            if 'currentDocument.exists' in q and q['currentDocument.exists'][0] == 'false' and cur:
                LOG.append(f'write CONFLICT exists {uid}')
                return self.reply(409, {'error': {'status': 'ALREADY_EXISTS'}})
            if 'currentDocument.updateTime' in q and (not cur or cur['ut'] != q['currentDocument.updateTime'][0]):
                LOG.append(f'write CONFLICT stale {uid}')
                return self.reply(400, {'error': {'status': 'FAILED_PRECONDITION'}})
            ut = ts()
            if 'updateMask.fieldPaths' in q and cur:
                doc = json.loads(cur['body']); new = json.loads(b)
                for fp in q['updateMask.fieldPaths']:
                    if fp in new['fields']: doc['fields'][fp] = new['fields'][fp]
                    else: doc['fields'].pop(fp, None)
                b = json.dumps(doc)
            DOCS[uid] = {'body': b, 'updated': time.time(), 'ut': ut}
            LOG.append(f'write {uid}')
        out = json.loads(b); out['updateTime'] = ut
        self.reply(200, out)

    def do_GET(self):
        if self.gate(): return
        if urlparse(self.path).path == '/fs/stats/popular':
            who, why = self.who()
            if who is None: return self.reply(403, {'error': {'status': 'PERMISSION_DENIED'}})
            with lock:
                if not STATS['a'] and not STATS['u']: return self.reply(404, {'error': {'status': 'NOT_FOUND'}})
                f = {k: {'mapValue': {'fields': {i: {'integerValue': str(n)} for i, n in STATS[k].items()}}} for k in ('a', 'm')}
                f['u'] = {'integerValue': str(STATS['u'])}
                LOG.append('stats read')
            return self.reply(200, {'name': 'stats/popular', 'fields': f})
        su = self.share_uid()
        if su is not None:
            with lock:
                d = SHARES.get(su); LOG.append(f'share read {su}' + ('' if d else ' (none)'))
            return self.reply(200, json.loads(d)) if d else self.reply(404, {'error': {'status': 'NOT_FOUND'}})
        uid = self.doc_uid()
        code, why = self.rules(uid)
        if code:
            LOG.append(f'read DENIED {code} {why}')
            return self.reply(code, {'error': {'status': 'PERMISSION_DENIED'}})
        with lock:
            d = DOCS.get(uid)
            LOG.append(f'read {uid}' + ('' if d else ' (none)'))
        if not d: return self.reply(404, {'error': {'status': 'NOT_FOUND'}})
        doc = json.loads(d['body'])
        doc['updateTime'] = d['ut']
        doc['fields']['updatedAt'] = {'timestampValue': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(d['updated']))}
        self.reply(200, doc)

    def log_message(self, *a): pass


ThreadingHTTPServer(('127.0.0.1', 8766), H).serve_forever()
