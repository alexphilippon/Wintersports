/* Ski game – stockage partagé.
   Deux implémentations derrière la même interface :
   - « firebase » : comptes e-mail/mot de passe + Firestore (temps réel), si js/config.js contient la configuration Firebase ;
   - « local »    : tout dans le navigateur (essais, tests, mode sans connexion).
   Données : players (joueurs), picks (choix par joueur), results (classements d'arrivée), overrides (annulations, reports, heures),
   athletes (skieurs ajoutés ; « pending » = nom libre saisi par un joueur), aliases (nom libre -> vrai skieur après régularisation). */
(function (root) {
  'use strict';
  const FB_VERSION = '10.14.1';
  const FB_FILES = ['app', 'auth', 'firestore'];

  /* ======================= Local ======================= */
  function localStore(opts) {
    const KEY = (opts && opts.key) || 'skigame.local.v2';
    let db = { users: [], players: {}, picks: {}, results: {}, overrides: {}, athletes: {}, aliases: {} };
    try { const raw = localStorage.getItem(KEY); if (raw) db = Object.assign(db, JSON.parse(raw)); } catch (e) { /* stockage indisponible */ }
    let uid = db.session || null; const authCbs = [], handlers = {};
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignoré */ } };
    const userObj = () => { const u = db.users.find((x) => x.uid === uid); return u ? { uid: u.uid, email: u.email, name: (db.players[u.uid] || {}).name || u.email } : null; };
    const emitAuth = () => authCbs.forEach((cb) => cb(userObj()));
    const emit = (k) => { if (!handlers[k]) return; const d = db[k];
      handlers[k](k === 'players' ? Object.keys(d).map((id) => Object.assign({ id }, d[id])) : k === 'athletes' ? Object.keys(d).map((id) => Object.assign({ id }, d[id])) : JSON.parse(JSON.stringify(d))); };
    const emitAll = () => Object.keys(handlers).forEach(emit);
    let ideasCb = null;
    const api = {
      mode: 'local', ready: Promise.resolve(),
      onAuth(cb) { authCbs.push(cb); cb(userObj()); },
      async signUp(email, pw, name) {
        email = email.trim().toLowerCase();
        if (db.users.some((u) => u.email === email)) throw new Error('Cette adresse a déjà un compte.');
        const id = 'u' + (db.users.length + 1) + Math.random().toString(36).slice(2, 6);
        db.users.push({ uid: id, email, pw }); db.players[id] = { name: name || email, email }; uid = id; db.session = id; persist(); emitAuth(); emitAll();
      },
      async signIn(email, pw) {
        const u = db.users.find((x) => x.email === email.trim().toLowerCase() && x.pw === pw);
        if (!u) throw new Error('Adresse ou mot de passe incorrect.');
        uid = u.uid; db.session = uid; persist(); emitAuth();
      },
      async signOut() { uid = null; db.session = null; persist(); emitAuth(); },
      async resetPassword() { throw new Error('Non disponible en mode local.'); },
      listen(h) { Object.assign(handlers, h); Object.keys(h).forEach(emit); },
      async setPick(u, raceId, pick) { const p = db.picks[u] || (db.picks[u] = {}); if (pick) p[raceId] = Object.assign({}, pick, { ts: Date.now() }); else delete p[raceId]; persist(); emit('picks'); },
      async setResult(raceId, entries) { if (entries && entries.length) db.results[raceId] = entries; else delete db.results[raceId]; persist(); emit('results'); },
      async setOverride(raceId, o) { if (o) db.overrides[raceId] = o; else delete db.overrides[raceId]; persist(); emit('overrides'); },
      async addAthlete(a) { db.athletes[a.id] = Object.assign({}, a); delete db.athletes[a.id].id; persist(); emit('athletes'); },
      async updateAthlete(id, patch) { db.athletes[id] = Object.assign({}, db.athletes[id], patch); persist(); emit('athletes'); },
      async setAlias(from, to) { if (to) db.aliases[from] = to; else delete db.aliases[from]; persist(); emit('aliases'); },
      async setPlayerName(u, name) { db.players[u] = Object.assign({}, db.players[u], { name }); persist(); emit('players'); emitAuth(); },
      async setPlayerPhoto(u, photo) { db.players[u] = Object.assign({}, db.players[u], { photo }); persist(); emit('players'); },
      async setPhotoBlock(u, blocked) { db.players[u] = Object.assign({}, db.players[u], { photo: '', photoBlocked: !!blocked }); persist(); emit('players'); },
      async addIdea(i) { (db.ideas || (db.ideas = [])).push(Object.assign({ id: 'i' + Date.now(), ts: Date.now() }, i)); persist(); if (ideasCb) ideasCb(db.ideas.slice().reverse()); },
      listenContacts(cb) { const o = {}; db.users.forEach((u) => { o[u.uid] = u.email; }); cb(o); },
      listenIdeas(cb) { ideasCb = cb; cb((db.ideas || []).slice().reverse()); },
    };
    return api;
  }

  /* ======================= Firebase ======================= */
  function loadScript(src) {
    return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Chargement impossible : ' + src)); document.head.appendChild(s); });
  }
  function firebaseStore(cfg) {
    let fb, auth, db, FV;
    const authCbs = []; let current = null, resolved = false;
    const ready = (async () => {
      if (!root.firebase) for (const f of FB_FILES) await loadScript(`https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-${f}-compat.js`);
      fb = root.firebase; fb.initializeApp(cfg); auth = fb.auth(); db = fb.firestore(); FV = fb.firestore.FieldValue;
      auth.onAuthStateChanged(async (u) => {
        if (!u) { current = null; resolved = true; authCbs.forEach((cb) => cb(null)); return; }
        let name = u.email;
        try { const d = await db.doc('players/' + u.uid).get(); if (d.exists) name = d.data().name || name; } catch (e) { /* pas encore créé */ }
        try { await db.doc('contacts/' + u.uid).set({ email: u.email, name }, { merge: true }); await db.doc('players/' + u.uid).update({ email: FV.delete() }); } catch (e) { /* ignoré */ }
        current = { uid: u.uid, email: u.email, name }; resolved = true; authCbs.forEach((cb) => cb(current));
      });
    })();
    ready.catch(() => { resolved = true; authCbs.forEach((cb) => cb(null)); });
    const msg = (e) => {
      const c = e && e.code || '';
      if (/email-already/.test(c)) return new Error('Cette adresse a déjà un compte.');
      if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return new Error('Adresse ou mot de passe incorrect.');
      if (/weak-password/.test(c)) return new Error('Mot de passe trop court (6 caractères minimum).');
      if (/invalid-email/.test(c)) return new Error('Adresse e-mail invalide.');
      if (/too-many/.test(c)) return new Error('Trop d’essais, réessaie dans quelques minutes.');
      return e instanceof Error ? e : new Error(String(e));
    };
    const ms = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v);
    /** Remplace un champ entier d'un document (pas de fusion profonde) ; crée le document s'il n'existe pas. */
    async function setField(path, field, value) {
      const ref = db.doc(path), v = value === null || value === undefined ? FV.delete() : value;
      try { await ref.update({ [field]: v }); } catch (e) { if (e.code === 'not-found') await ref.set(v === FV.delete() ? {} : { [field]: v }); else throw e; }
    }
    return {
      mode: 'firebase', ready,
      onAuth(cb) { authCbs.push(cb); if (resolved) cb(current); },
      async signUp(email, pw, name) {
        await ready;
        try { const c = await auth.createUserWithEmailAndPassword(email.trim(), pw); await db.doc('players/' + c.user.uid).set({ name: name || email }); await db.doc('contacts/' + c.user.uid).set({ email: email.trim(), name: name || email }); current = { uid: c.user.uid, email: c.user.email, name: name || email }; authCbs.forEach((cb) => cb(current)); } catch (e) { throw msg(e); }
      },
      async signIn(email, pw) { await ready; try { await auth.signInWithEmailAndPassword(email.trim(), pw); } catch (e) { throw msg(e); } },
      async signOut() { await ready; await auth.signOut(); },
      async resetPassword(email) { await ready; try { await auth.sendPasswordResetEmail(email.trim()); } catch (e) { throw msg(e); } },
      listen(h) {
        ready.then(() => {
          const fail = (e) => console.error('Firestore :', e);
          if (h.players) db.collection('players').onSnapshot((s) => h.players(s.docs.map((d) => Object.assign({ id: d.id }, d.data()))), fail);
          if (h.picks) db.collection('picks').onSnapshot((s) => { const o = {}; s.docs.forEach((d) => { const m = d.data(); Object.keys(m).forEach((k) => { if (m[k] && m[k].ts) m[k] = Object.assign({}, m[k], { ts: ms(m[k].ts) }); }); o[d.id] = m; }); h.picks(o); }, fail);
          if (h.results) db.collection('results').onSnapshot((s) => { const o = {}; s.docs.forEach((d) => { o[d.id] = d.data().entries || []; }); h.results(o); }, fail);
          if (h.overrides) db.doc('config/overrides').onSnapshot((d) => h.overrides(d.exists ? d.data() : {}), fail);
          if (h.aliases) db.doc('config/aliases').onSnapshot((d) => h.aliases(d.exists ? d.data() : {}), fail);
          if (h.athletes) db.collection('athletes').onSnapshot((s) => h.athletes(s.docs.map((d) => Object.assign({ id: d.id }, d.data()))), fail);
        });
      },
      async setPick(uid, raceId, pick) { await ready; await setField('picks/' + uid, raceId, pick ? Object.assign({}, pick, { ts: FV.serverTimestamp() }) : null); },
      async setResult(raceId, entries) { await ready; if (entries && entries.length) await db.doc('results/' + raceId).set({ entries }); else await db.doc('results/' + raceId).delete(); },
      async setOverride(raceId, o) { await ready; await setField('config/overrides', raceId, o); },
      async addAthlete(a) { await ready; const d = Object.assign({}, a); delete d.id; await db.doc('athletes/' + a.id).set(d); },
      async updateAthlete(id, patch) { await ready; await db.doc('athletes/' + id).set(patch, { merge: true }); },
      async setAlias(from, to) { await ready; await setField('config/aliases', from, to || null); },
      async addIdea(i) { await ready; await db.collection('ideas').add(Object.assign({}, i, { ts: FV.serverTimestamp() })); },
      listenContacts(cb) { ready.then(() => db.collection('contacts').onSnapshot((s) => { const o = {}; s.docs.forEach((d) => { o[d.id] = d.data().email || ''; }); cb(o); }, (e) => console.error('Contacts :', e))); },
      listenIdeas(cb) { ready.then(() => db.collection('ideas').orderBy('ts', 'desc').onSnapshot((s) => cb(s.docs.map((d) => { const m = d.data(); return Object.assign({ id: d.id }, m, { ts: m.ts ? ms(m.ts) : Date.now() }); })), (e) => console.error('Idées :', e))); },
      async setPlayerName(uid, name) { await ready; await db.doc('players/' + uid).set({ name }, { merge: true }); if (current && current.uid === uid) { current.name = name; authCbs.forEach((cb) => cb(current)); } },
      async setPlayerPhoto(uid, photo) { await ready; await db.doc('players/' + uid).set({ photo }, { merge: true }); },
      async setPhotoBlock(uid, blocked) { await ready; await db.doc('players/' + uid).set({ photo: '', photoBlocked: !!blocked }, { merge: true }); },
    };
  }

  function create(config, opts) {
    return config && config.firebase && config.firebase.apiKey ? firebaseStore(config.firebase) : localStore(opts);
  }
  const api = { create, localStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKI_STORE = api;
})(typeof window !== 'undefined' ? window : globalThis);
