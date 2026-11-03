/* Escucha Motor — interfaz */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const Bridge = window.AndroidBridge || null;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtKm = n => Number(n).toLocaleString('es-ES') + ' km';
  const fmtDate = t => new Date(t).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };

  // ---------- base de datos (IndexedDB) ----------
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('escucha-motor', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('vehicles', { keyPath: 'id' });
        const s = d.createObjectStore('recordings', { keyPath: 'id' });
        s.createIndex('vehicleId', 'vehicleId');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      const r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
    });
  }
  const DB = {
    vehicles: () => tx('vehicles', 'readonly', s => s.getAll()),
    putVehicle: v => tx('vehicles', 'readwrite', s => s.put(v)),
    delVehicle: id => tx('vehicles', 'readwrite', s => s.delete(id)),
    recordings: vid => tx('recordings', 'readonly', s => s.index('vehicleId').getAll(vid)),
    allRecordings: () => tx('recordings', 'readonly', s => s.getAll()),
    getRec: id => tx('recordings', 'readonly', s => s.get(id)),
    putRec: r => tx('recordings', 'readwrite', s => s.put(r)),
    delRec: id => tx('recordings', 'readwrite', s => s.delete(id))
  };

  // ---------- estado ----------
  const S = { vehicles: [], vehicle: null, recs: [], selected: new Set(), pending: null, view: 'grabar', report: null };

  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms || 2600);
  }
  function modal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.remove('hidden'); }
  function closeModal() { $('#modal').classList.add('hidden'); }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  function confirmBox(text, okText) {
    return new Promise(res => {
      modal(`<p>${esc(text)}</p><div class="actions"><button class="btn ghost" id="cNo">Cancelar</button><button class="btn primary" id="cYes">${esc(okText || 'Aceptar')}</button></div>`);
      $('#cNo').onclick = () => { closeModal(); res(false); };
      $('#cYes').onclick = () => { closeModal(); res(true); };
    });
  }

  // ---------- navegación ----------
  function go(view) {
    S.view = view;
    $$('.view').forEach(v => v.classList.add('hidden'));
    $('#v-' + view).classList.remove('hidden');
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === view || (view === 'detalle' || view === 'informe') && b.dataset.go === 'fichas'));
    if (view === 'fichas') renderFichas();
    if (view === 'ajustes') renderAjustes();
    if (view === 'guia') { renderPlacement(S.vehicle && S.vehicle.type === 'moto' ? 'moto' : 'coche'); renderCatalog(); }
    if (view === 'grabar') renderChecklist();
    window.scrollTo(0, 0);
    if (Bridge && Bridge.setCanGoBack) Bridge.setCanGoBack(view !== 'grabar');
  }
  window.__back = function () {
    if (!$('#modal').classList.contains('hidden')) { closeModal(); return true; }
    if (S.view === 'detalle' || S.view === 'informe') { go('fichas'); return true; }
    if (S.view !== 'grabar') { go('grabar'); return true; }
    return false;
  };
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go);
    const a = e.target.closest('[data-act="newVehicle"]'); if (a) vehicleForm();
  });
  $('#btnSettings').onclick = () => go('ajustes');
  document.addEventListener('click', e => {
    const b = e.target.closest('.ib'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.fault) {
      const F = Faults.FAULTS.find(x => x.id === b.dataset.fault); if (!F) return;
      modal(`<h2>${esc(F.name)}</h2><div class="prose infotext">${Faults.detailHtml(F.id, esc)}</div><button class="btn primary" id="infoOk">Entendido</button>`);
      $('#infoOk').onclick = closeModal; return;
    }
    const it = Info.INFO[b.dataset.info]; if (!it) return;
    modal(`<h2>${esc(it.t)}</h2><div class="prose infotext">${it.b}</div><button class="btn primary" id="infoOk">Entendido</button>`);
    $('#infoOk').onclick = closeModal;
  }, true);

  // ---------- vehículos ----------
  async function loadVehicles() {
    S.vehicles = (await DB.vehicles()).sort((a, b) => a.created - b.created);
    const cur = LS.get('vehicle', null);
    S.vehicle = S.vehicles.find(v => v.id === cur) || S.vehicles[0] || null;
    const sel = $('#vehicleSel');
    sel.innerHTML = S.vehicles.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('') + '<option value="__new">+ Nuevo vehículo…</option>';
    if (S.vehicle) sel.value = S.vehicle.id; else sel.value = '';
    sel.classList.toggle('hidden', !S.vehicles.length);
    renderChecklist();
    $('#noVehicle').classList.toggle('hidden', !!S.vehicle);
    $('#recSetup').classList.toggle('hidden', !S.vehicle);
    await loadRecs();
  }
  function wavToPcm(buf) {
    const v = new DataView(buf);
    let sr = v.getUint32(24, true), off = 12, dataOff = 44, len = (buf.byteLength - 44) >> 1;
    while (off + 8 <= buf.byteLength) { // buscar el bloque 'data'
      const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
      const sz = v.getUint32(off + 4, true);
      if (id === 'data') { dataOff = off + 8; len = Math.min(sz, buf.byteLength - dataOff) >> 1; break; }
      off += 8 + sz + (sz & 1);
    }
    const pcm = new Float32Array(len);
    for (let i = 0; i < len; i++) pcm[i] = v.getInt16(dataOff + 2 * i, true) / 32768;
    return { pcm, sr };
  }
  async function reanalyzeOld(recs) {
    const old = recs.filter(r => !r.features || (r.features.version || 1) < 4);
    if (!old.length) return;
    toast(`Actualizando el análisis de ${old.length} ficha(s)…`, 4000);
    for (const r of old) {
      try {
        const { pcm, sr } = wavToPcm(r.audio);
        r.features = EM.analyze(pcm, sr, S.vehicle.cylinders);
        await DB.putRec(r);
      } catch (e) { /* ficha dañada: se deja como está */ }
    }
  }
  async function loadRecs() {
    S.recs = S.vehicle ? (await DB.recordings(S.vehicle.id)).sort((a, b) => b.km - a.km || b.date - a.date) : [];
    await reanalyzeOld(S.recs);
    S.selected = new Set([...S.selected].filter(id => S.recs.some(r => r.id === id)));
  }
  $('#vehicleSel').onchange = async e => {
    if (e.target.value === '__new') { e.target.value = S.vehicle ? S.vehicle.id : ''; vehicleForm(); return; }
    LS.set('vehicle', e.target.value); S.selected.clear(); await loadVehicles();
    if (S.view === 'fichas' || S.view === 'detalle' || S.view === 'informe') go('fichas');
  };

  function vehicleForm(v) {
    const isNew = !v;
    v = v || { id: uid(), name: '', type: 'coche', cylinders: 4, fuel: 'Gasolina', created: Date.now() };
    modal(`<h2>${isNew ? 'Nuevo vehículo' : 'Editar vehículo'}</h2>
      <form id="vf">
        <label>Tipo<select id="vType"><option value="coche" ${v.type !== 'moto' ? 'selected' : ''}>Coche</option><option value="moto" ${v.type === 'moto' ? 'selected' : ''}>Moto</option></select></label>
        <label>Nombre o matrícula<input id="vName" required value="${esc(v.name)}" placeholder="Ej. Golf 1.6 TDI · 1234 ABC"></label>
        <div class="grid2">
          <label>Cilindros<select id="vCyl">${[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => `<option ${n == v.cylinders ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Combustible<select id="vFuel">${['Gasolina', 'Diésel', 'Híbrido', 'GLP / GNC'].map(n => `<option ${n === v.fuel ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <p class="muted small">Motor de 4 tiempos. Si no sabes los cilindros: la mayoría de turismos tienen 4 (3 en muchos pequeños y modernos); en motos, 1 (monocilíndricas), 2 o 4.</p>
        <div class="actions">${isNew ? '' : '<button type="button" class="btn ghost" id="vDel">Eliminar</button>'}<button class="btn primary">Guardar</button></div>
      </form>`);
    $('#vName').focus();
    $('#vf').onsubmit = async e => {
      e.preventDefault();
      v.name = $('#vName').value.trim(); v.type = $('#vType').value; v.cylinders = +$('#vCyl').value; v.fuel = $('#vFuel').value;
      await DB.putVehicle(v); LS.set('vehicle', v.id); closeModal(); await loadVehicles();
      if (S.view === 'ajustes') renderAjustes();
      toast('Vehículo guardado');
    };
    if (!isNew) $('#vDel').onclick = async () => {
      const recs = await DB.recordings(v.id);
      if (!await confirmBox(`¿Eliminar «${v.name}» y sus ${recs.length} fichas? No se puede deshacer.`, 'Eliminar')) return;
      for (const r of recs) await DB.delRec(r.id);
      await DB.delVehicle(v.id); await loadVehicles(); renderAjustes(); toast('Vehículo eliminado');
    };
  }

  // ---------- guía: colocación ----------
  function renderPlacement(type) {
    $('#placement').innerHTML = Placement.infographic(type);
    $$('#placeSeg button').forEach(b => b.classList.toggle('on', b.dataset.pt === type));
  }
  $$('#placeSeg button').forEach(b => b.onclick = () => renderPlacement(b.dataset.pt));

  // ---------- grabar ----------
  const CHECKS = {
    'Ralentí en caliente': ['Motor a temperatura de servicio y 1 min al ralentí', 'Móvil en el punto marcado, misma orientación', 'A/C, ventilador, radio y luces apagados', 'Puertas cerradas, nadie hablando cerca', 'Sin viento; electroventilador parado'],
    'Arranque en frío': ['Motor parado al menos 6 horas', 'Móvil en el punto marcado, misma orientación', 'A/C, ventilador, radio y luces apagados', 'Alguien listo para arrancar durante la cuenta atrás', 'Sin viento ni ruidos ajenos'],
    'Régimen sostenido 2.500 rpm': ['Motor a temperatura de servicio', 'Móvil en el punto marcado, misma orientación', 'Ayudante manteniendo 2.500 rpm fijas', 'A/C, ventilador, radio y luces apagados', 'Sin viento ni ruidos ajenos']
  };
  const HINTS = {
    'Ralentí en caliente': 'La prueba principal: es la más fácil de repetir y la que mejor compara la salud del motor.',
    'Arranque en frío': 'Pulsa grabar y arranca el motor cuando la cuenta llegue a 0. Delata taqués y cadena de distribución.',
    'Régimen sostenido 2.500 rpm': 'Necesitas un ayudante. Útil para silbidos de turbo y rodamientos.'
  };
  function renderChecklist() {
    const t = $('#testType').value;
    $('#testHint').textContent = HINTS[t];
    const vt = S.vehicle && S.vehicle.type === 'moto' ? 'moto' : 'coche';
    const MOTO = { 'A/C, ventilador, radio y luces apagados': 'Luces y accesorios apagados', 'Puertas cerradas, nadie hablando cerca': 'Nadie hablando cerca' };
    const items = CHECKS[t].map(c => c === 'Móvil en el punto marcado, misma orientación' ? Placement.CHECK[vt] : (vt === 'moto' && MOTO[c]) || c);
    const was = new Set($$('#checklist li').filter(li => li.querySelector('input').checked).map(li => li.textContent));
    $('#placeMini').innerHTML = Placement.mini(vt);
    $('#checklist').innerHTML = items.map((c, i) => `<li><input type="checkbox" id="ck${i}" ${was.has(c) ? 'checked' : ''}><label for="ck${i}" style="margin:0;color:var(--text)">${esc(c)}</label></li>`).join('');
  }
  $('#testType').value = LS.get('testType', 'Ralentí en caliente');
  $('#duration').value = String(LS.get('duration', 20));
  $('#countdown').value = String(LS.get('countdown', 10));
  $('#countdown').onchange = () => LS.set('countdown', +$('#countdown').value);
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };
  $('#testType').onchange = () => { LS.set('testType', $('#testType').value); renderChecklist(); };
  $('#duration').onchange = () => LS.set('duration', +$('#duration').value);
  renderChecklist();

  let rec = null;
  $('#btnRec').onclick = async () => {
    const unchecked = $$('#checklist input').filter(c => !c.checked).length;
    if (unchecked && !await confirmBox(`Quedan ${unchecked} puntos del protocolo sin marcar. Si no se cumplen, la comparación con otras fichas puede no ser fiable.`, 'Grabar igualmente')) return;
    startRecording();
  };
  $('#btnStop').onclick = () => stopRecording(true);

  const NATIVE = !!(Bridge && Bridge.hasNativeRecorder);
  function micDenied(msg) {
    modal(`<h2>Sin acceso al micrófono</h2><p>Concede el permiso de micrófono a Escucha Motor en los ajustes del teléfono y vuelve a intentarlo.</p>${msg ? `<p class="muted small">${esc(msg)}</p>` : ''}<button class="btn primary" onclick="document.getElementById('modal').classList.add('hidden')">Entendido</button>`);
  }
  function askMic() {
    return new Promise(res => {
      if (Bridge.micGranted()) return res(true);
      window.__micResult = ok => { window.__micResult = null; res(!!ok); };
      Bridge.requestMic();
    });
  }
  function b64ToPcm(b64) {
    const bin = atob(b64), n = bin.length >> 1, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      out[i] = v / 32768;
    }
    return out;
  }

  async function startRecording() {
    const dur = +$('#duration').value;
    if (NATIVE) {
      if (!await askMic()) { micDenied(); return; }
      const st = JSON.parse(Bridge.recStart());
      if (!st.ok) { micDenied(st.error); return; }
      rec = { native: true, chunks: [], recording: false, clip: false, level: -90, dur, t0: 0, wave: [], sr: st.sampleRate, source: st.source };
      rec.poll = setInterval(() => {
        try {
          const l = JSON.parse(Bridge.recLevel());
          rec.level = 20 * Math.log10((l.rms || 0) + 1e-6);
          if (rec.recording && l.clip) rec.clip = true;
          rec.wave.push(l.peak || 0); if (rec.wave.length > 150) rec.wave.shift();
        } catch (e) { }
      }, 100);
    } else {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      } catch (e) { micDenied(e.message || e.name); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      if (ctx.state === 'suspended') await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const mute = ctx.createGain(); mute.gain.value = 0;
      src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      rec = { stream, ctx, proc, chunks: [], recording: false, clip: false, level: -90, dur, t0: 0, wave: [], sr: ctx.sampleRate, source: 'navegador' };
      proc.onaudioprocess = ev => {
        const d = ev.inputBuffer.getChannelData(0);
        let s2 = 0, pk = 0;
        for (let i = 0; i < d.length; i++) { s2 += d[i] * d[i]; const a = Math.abs(d[i]); if (a > pk) pk = a; }
        rec.level = 10 * Math.log10(s2 / d.length + 1e-12);
        if (pk >= 0.99) rec.clip = true;
        rec.wave.push(pk); if (rec.wave.length > 150) rec.wave.shift();
        if (rec.recording) rec.chunks.push(new Float32Array(d));
      };
    }
    if (Bridge && Bridge.keepScreenOn) Bridge.keepScreenOn(true);
    $('#recSetup').classList.add('hidden'); $('#recLive').classList.remove('hidden');
    let n = +$('#countdown').value || 3;
    $('#recCount').textContent = n; $('#recMsg').textContent = $('#testType').value === 'Arranque en frío' ? 'Coloca el móvil debajo del motor y arranca al llegar a 0' : 'Coloca el móvil debajo del motor';
    drawMeter();
    rec.timer = setInterval(() => {
      n--;
      if (n > 0) { $('#recCount').textContent = n; return; }
      clearInterval(rec.timer);
      if (rec.native) Bridge.recReset();
      rec.recording = true; rec.clip = false; rec.t0 = performance.now(); buzz(300);
      $('#recMsg').textContent = 'Grabando…';
      rec.timer = setInterval(() => {
        const left = Math.max(0, rec.dur - (performance.now() - rec.t0) / 1000);
        $('#recCount').textContent = Math.ceil(left);
        if (left <= 0) stopRecording(false);
      }, 200);
    }, 1000);
  }
  function drawMeter() {
    if (!rec) return;
    const c = $('#meter'), g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const bw = W / 150;
    rec.wave.forEach((p, i) => {
      const h = Math.max(2, p * H);
      g.fillStyle = p >= 0.99 ? '#e5484d' : rec.recording ? '#f5a524' : '#555c66';
      g.fillRect(i * bw, (H - h) / 2, bw - 1, h);
    });
    $('#lvlTxt').textContent = rec.level.toFixed(0) + ' dBFS';
    $('#clipTxt').classList.toggle('hidden', !rec.clip);
    rec.raf = requestAnimationFrame(drawMeter);
  }
  function teardown(r) {
    clearInterval(r.timer); clearInterval(r.poll); cancelAnimationFrame(r.raf);
    if (!r.native) {
      try { r.proc.disconnect(); } catch (e) { }
      r.stream.getTracks().forEach(t => t.stop());
      try { r.ctx.close(); } catch (e) { }
    }
    if (Bridge && Bridge.keepScreenOn) Bridge.keepScreenOn(false);
  }
  async function stopRecording(cancel) {
    if (!rec) return;
    const r = rec; rec = null; teardown(r);
    $('#recLive').classList.add('hidden');
    let pcm = null, sr = r.sr;
    if (r.native) {
      if (cancel || !r.recording) { Bridge.recCancel(); $('#recSetup').classList.remove('hidden'); return; }
      const out = JSON.parse(Bridge.recStop());
      pcm = b64ToPcm(out.pcm || ''); sr = out.sampleRate || sr;
    } else {
      if (cancel || !r.chunks.length) { $('#recSetup').classList.remove('hidden'); return; }
      const total = r.chunks.reduce((a, c) => a + c.length, 0);
      pcm = new Float32Array(total); let o = 0;
      r.chunks.forEach(c => { pcm.set(c, o); o += c.length; });
    }
    buzz([250, 150, 250]);
    if (!pcm.length) { toast('No se grabó audio'); $('#recSetup').classList.remove('hidden'); return; }
    await processAudio(pcm, sr, r.native ? 'micrófono ' + r.source : 'micrófono (navegador)');
  }

  $('#btnImport').onclick = () => $('#fileAudio').click();
  $('#fileAudio').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    toast('Leyendo audio…');
    try {
      const buf = await f.arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const ab = await ctx.decodeAudioData(buf);
      const ch = ab.numberOfChannels, n = ab.length, pcm = new Float32Array(n);
      for (let c = 0; c < ch; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) pcm[i] += d[i] / ch; }
      ctx.close();
      $('#recSetup').classList.add('hidden');
      await processAudio(pcm, ab.sampleRate, 'archivo: ' + f.name);
    } catch (err) { toast('No se pudo leer ese audio (' + (err.message || err.name) + ')', 4000); }
  };

  function encodeWav(pcm, sr) {
    const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return buf;
  }

  async function processAudio(pcm, sr, source) {
    $('#recSave').classList.remove('hidden');
    $('#saveQuality').innerHTML = '<p class="muted">Analizando…</p>'; $('#saveKpis').innerHTML = '';
    await new Promise(r => setTimeout(r, 50));
    const features = EM.analyze(pcm, sr, S.vehicle.cylinders);
    const wav = encodeWav(pcm, sr);
    S.pending = { features, wav, sr, source };
    const qual = features.quality.length ? features.quality.map(q => `<div class="finding"><span class="pill ${q.level}">${q.level === 'alerta' ? 'Calidad' : 'Aviso'}</span><span>${esc(q.text)} ${Info.btn('reliable')}</span></div>`).join('')
      : '<div class="finding"><span class="pill ok">Bien</span><span>Grabación válida para comparar.</span></div>';
    const abs = EM.absoluteFindings(features).map(f => `<div class="finding"><span class="pill ${f.level}">${esc(f.area)}</span><span>${esc(f.text)} ${Info.area(f.area)}</span></div>`).join('');
    $('#saveQuality').innerHTML = qual + abs;
    $('#saveKpis').innerHTML = kpis(features);
    setPlayer($('#savePlayer'), wav);
    const last = S.recs[0];
    $('#fKm').value = ''; $('#fKm').placeholder = last ? `Última ficha: ${last.km}` : 'Ej. 85400';
    $('#fReason').value = S.recs.length ? '' : 'Grabación de referencia (motor sano)';
    $('#fReasonText').value = ''; $('#fNotes').value = ''; $('#fAmbient').value = ''; $('#fWarm').value = '';
    $('#recSave').scrollIntoView({ behavior: 'smooth' });
  }
  function kpis(f) {
    const k = (v, l, key) => `<div class="kpi"><b>${v ?? '—'}</b><span>${l} ${Info.btn(key)}</span></div>`;
    return k(f.rpm ? f.rpm : '—', 'rpm estimadas', 'rpm') + k(f.periodicity != null ? Math.round(f.periodicity * 100) + '%' : '—', 'regularidad', 'periodicity') +
      k(f.imbalance ?? '—', 'desequilibrio cil.', 'imbalance') + k(f.weakPct != null ? f.weakPct + '%' : '—', 'explosiones débiles', 'weakPct') +
      k(f.hfKurtosis ?? '—', 'impulsividad agudos', 'hfKurtosis') + k(f.levelDb, 'nivel dBFS', 'levelDb') +
      k(f.cycleCv != null ? Math.round(f.cycleCv * 100) + '%' : '—', 'irregularidad', 'cycleCv') + k(f.centroidHz + ' Hz', 'centro tonal', 'centroid') +
      k(f.hfImbalance ?? '—', 'ruido 1 cilindro', 'hfImbalance') + k(f.rotKnock ?? '—', 'golpe por vuelta', 'rotKnock') +
      k(f.lfKurtosis ?? '—', 'impulsividad graves', 'lfKurtosis') + k(f.rpmHuntPct != null ? '±' + f.rpmHuntPct + '%' : '—', 'oscilación ralentí', 'rpmHuntPct') +
      k(f.bandwidthHz ? (f.bandwidthHz / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' kHz' : '—', 'ancho de banda', 'bandwidth');
  }
  let playerUrl = new Map();
  function setPlayer(el, wav) {
    if (playerUrl.get(el)) URL.revokeObjectURL(playerUrl.get(el));
    const u = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    playerUrl.set(el, u); el.src = u;
  }
  $('#btnDiscard').onclick = async () => {
    if (!await confirmBox('¿Descartar esta grabación?', 'Descartar')) return;
    S.pending = null; $('#recSave').classList.add('hidden'); $('#recSetup').classList.remove('hidden'); window.scrollTo(0, 0);
  };
  $('#saveForm').onsubmit = async e => {
    e.preventDefault();
    const p = S.pending; if (!p) return;
    const km = +$('#fKm').value;
    const last = S.recs[0];
    if (last && km < last.km && !await confirmBox(`El kilometraje (${fmtKm(km)}) es menor que el de la última ficha (${fmtKm(last.km)}). ¿Es correcto?`, 'Sí, guardar')) return;
    const reason = $('#fReason').value, rt = $('#fReasonText').value.trim();
    const r = {
      id: uid(), vehicleId: S.vehicle.id, date: Date.now(), km,
      reason: reason + (rt ? ' — ' + rt : ''), reasonCat: reason, reasonText: rt,
      testType: $('#testType').value, ambientC: $('#fAmbient').value === '' ? null : +$('#fAmbient').value,
      warmMin: $('#fWarm').value === '' ? null : +$('#fWarm').value, notes: $('#fNotes').value.trim(),
      device: deviceName(), source: p.source, bandwidthHz: p.features.bandwidthHz, sampleRate: p.sr, audio: p.wav, features: p.features
    };
    await DB.putRec(r); S.pending = null;
    await loadRecs();
    $('#recSave').classList.add('hidden'); $('#recSetup').classList.remove('hidden');
    $$('#checklist input').forEach(c => c.checked = false);
    toast('Ficha guardada');
    showDetail(r.id);
  };
  function deviceName() {
    const m = navigator.userAgent.match(/Android [\d.]+; ([^;)]+)/);
    return m ? m[1].replace(/ Build.*/, '').trim() : 'navegador';
  }

  // ---------- fichas ----------
  function statusOf(f) {
    const a = EM.absoluteFindings(f).concat(f.quality || []);
    if (a.some(x => x.level === 'alerta')) return 'alerta';
    if (a.some(x => x.level === 'aviso')) return 'aviso';
    return 'ok';
  }
  const STATUS_TXT = { ok: 'Normal', aviso: 'Vigilar', alerta: 'Anomalía' };
  function renderFichas() {
    $('#fichasCount').textContent = S.vehicle ? `${S.recs.length} ficha(s) · ${S.vehicle.name}` : 'Sin vehículo';
    const list = $('#fichasList');
    if (!S.recs.length) { list.innerHTML = '<div class="card muted">Aún no hay grabaciones. Empieza con una de referencia en la pestaña Grabar.</div>'; updateCompareBtn(); return; }
    list.innerHTML = S.recs.map(r => {
      const st = statusOf(r.features);
      return `<div class="card ficha" data-id="${r.id}">
        <input type="checkbox" class="sel" ${S.selected.has(r.id) ? 'checked' : ''} aria-label="Seleccionar para comparar">
        <div class="body open">
          <div class="bar"><span class="km">${fmtKm(r.km)}</span><span class="pill ${st}">${STATUS_TXT[st]}</span></div>
          <div class="meta">${fmtDate(r.date)} · ${esc(r.testType)}${r.features.rpm ? ' · ≈' + r.features.rpm + ' rpm' : ''}</div>
          <div class="reason">${esc(r.reason)}</div>
        </div></div>`;
    }).join('');
    updateCompareBtn();
  }
  $('#fichasList').addEventListener('click', e => {
    const card = e.target.closest('.ficha'); if (!card) return;
    if (e.target.classList.contains('sel')) {
      if (e.target.checked) S.selected.add(card.dataset.id); else S.selected.delete(card.dataset.id);
      updateCompareBtn(); return;
    }
    showDetail(card.dataset.id);
  });
  function updateCompareBtn() {
    const b = $('#btnCompareSel'); const n = S.selected.size;
    b.textContent = `Comparar (${n})`; b.disabled = n < 2;
  }
  $('#btnCompareSel').onclick = () => showReport([...S.selected]);

  async function showDetail(id) {
    const r = await DB.getRec(id); if (!r) return;
    const f = r.features;
    const abs = EM.absoluteFindings(f).concat(f.quality || []);
    const prev = S.recs.filter(x => x.id !== r.id && x.testType === r.testType && (x.km < r.km || (x.km === r.km && x.date < r.date)))[0];
    const v = $('#v-detalle');
    v.innerHTML = `
      <button class="link" data-go="fichas">‹ Fichas</button>
      <div class="card">
        <div class="bar"><h2 style="margin:0">${fmtKm(r.km)}</h2><span class="pill ${statusOf(f)}">${STATUS_TXT[statusOf(f)]}</span></div>
        <div class="meta muted small">${new Date(r.date).toLocaleString('es-ES')} · ${esc(r.testType)}</div>
        <p><b>Motivo:</b> ${esc(r.reason)}</p>
        ${r.notes ? `<p class="small"><b>Observaciones:</b> ${esc(r.notes)}</p>` : ''}
        <p class="muted small">${[r.ambientC != null ? r.ambientC + ' °C ambiente' : '', r.warmMin != null ? r.warmMin + ' min en marcha' : '', esc(r.device), esc(r.source || ''), Math.round(r.sampleRate / 100) / 10 + ' kHz', f.duration + ' s'].filter(Boolean).join(' · ')}</p>
        <audio id="detPlayer" controls></audio>
      </div>
      <div class="card"><h2>Indicadores</h2><p class="muted small" style="margin-top:-4px">Pulsa «i» para ver qué significa cada dato.</p><div class="kpis">${kpis(f)}</div></div>
      <div class="card"><h2>Lo que se oye</h2>${abs.length ? abs.map(x => `<div class="finding"><span class="pill ${x.level}">${esc(x.area || 'Calidad')}</span><span>${esc(x.text)} ${Info.area(x.area || 'Calidad')}</span></div>`).join('') : '<div class="finding"><span class="pill ok">Bien</span><span>Sin rasgos anómalos en esta grabación.</span></div>'}
      ${f.tones.length ? `<p class="muted small">Tonos destacados: ${f.tones.map(t => t.hz + ' Hz').join(', ')} ${Info.btn('tones')}</p>` : ''}</div>
      ${causesHtml(Faults.diagnose(f, prev ? prev.features : null, { fuel: S.vehicle && S.vehicle.fuel, testType: r.testType }), f)}
      ${isolateCard(r)}
      <div class="card"><h2>Espectro ${Info.btn('spectrum')}</h2><canvas class="chart" id="detChart"></canvas></div>
      ${prev ? `<button class="btn primary" id="detCmp">Comparar con la anterior (${fmtKm(prev.km)})</button>` : ''}
      <button class="btn ghost" id="detWav">Exportar audio (WAV)</button>
      <button class="btn ghost" id="detEdit">Editar datos</button>
      <button class="btn ghost" id="detDel" style="color:var(--alert)">Eliminar ficha</button>`;
    go('detalle');
    setPlayer($('#detPlayer'), r.audio);
    drawSpectra($('#detChart'), [{ label: fmtKm(r.km), spec: f.spectrum }]);
    if (prev) $('#detCmp').onclick = () => showReport([prev.id, r.id]);
    bindIsolate(r);
    $('#detWav').onclick = () => {
      const name = `motor-${(S.vehicle ? S.vehicle.name : 'vehiculo').replace(/[^\w-]+/g, '_')}-${r.km}km-${new Date(r.date).toISOString().slice(0, 10)}.wav`;
      if (Bridge && Bridge.saveBase64) { Bridge.saveBase64(name, 'audio/wav', abToB64(r.audio)); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.audio], { type: 'audio/wav' })); a.download = name; a.click();
    };
    $('#detDel').onclick = async () => {
      if (!await confirmBox('¿Eliminar esta ficha y su audio?', 'Eliminar')) return;
      await DB.delRec(r.id); S.selected.delete(r.id); await loadRecs(); go('fichas'); toast('Ficha eliminada');
    };
    $('#detEdit').onclick = () => {
      modal(`<h2>Editar ficha</h2><form id="ef">
        <label>Kilometraje<input type="number" id="eKm" value="${r.km}" required></label>
        <label>Motivo<textarea id="eReason" rows="3">${esc(r.reason)}</textarea></label>
        <label>Observaciones<textarea id="eNotes" rows="2">${esc(r.notes)}</textarea></label>
        <div class="actions"><button type="button" class="btn ghost" id="eNo">Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
      $('#eNo').onclick = closeModal;
      $('#ef').onsubmit = async e => {
        e.preventDefault();
        r.km = +$('#eKm').value; r.reason = $('#eReason').value.trim(); r.notes = $('#eNotes').value.trim();
        await DB.putRec(r); closeModal(); await loadRecs(); showDetail(r.id);
      };
    };
  }

  // ---------- posibles averías ----------
  function causesHtml(list, f) {
    if (f && f.reliable === false) return `<div class="card"><h2>Posibles averías ${Info.btn('causes')}</h2><p class="muted">No se evalúan porque la grabación no tiene calidad suficiente.</p></div>`;
    const cls = sc => sc >= 0.6 ? 'alerta' : sc >= 0.45 ? 'aviso' : 'info';
    return `<div class="card"><h2>Posibles averías ${Info.btn('causes')}</h2>
      ${list.length ? list.map(c => `<div class="finding"><span class="pill ${cls(c.score)}">${Faults.likelihood(c.score)}</span>
        <span><b>${esc(c.name)}</b> <button type="button" class="ib" data-fault="${c.id}" aria-label="Ver avería">i</button><br>
        <span class="muted small">${esc(c.sys)} · urgencia ${c.urg}</span><br><span class="small">Indicios: ${esc(c.ev.join('; '))}.</span></span></div>`).join('')
        : '<p class="muted">Ninguna avería del catálogo encaja con este sonido.</p>'}
      <p class="muted small">Orientativo: varias averías suenan parecido. Confírmalo en el taller.</p></div>`;
  }
  function renderCatalog() {
    const box = $('#faultCatalog'); if (!box || box.dataset.done) return;
    const det = { 'sí': 'ok', 'parcial': 'aviso', 'no': 'info' };
    box.innerHTML = Object.entries(Faults.SYS).map(([k, name]) => `<h3>${esc(name)}</h3>` +
      Faults.FAULTS.filter(F => F.sys === k).map(F => `<details class="fault"><summary><span>${esc(F.name)}</span><span class="pill ${det[F.det]}">${F.det === 'sí' ? 'Detecta' : F.det === 'parcial' ? 'Parcial' : 'No detecta'}</span></summary>${Faults.detailHtml(F.id, esc)}</details>`).join('')).join('');
    box.dataset.done = '1';
  }

  // ---------- aislar el sonido anómalo ----------
  function isolateCard(r) {
    const f = r.features;
    const others = S.recs.filter(x => x.id !== r.id);
    const ref = others.filter(x => x.testType === r.testType && x.features.reliable !== false)
      .sort((a, b) => (/referencia/i.test(b.reason) - /referencia/i.test(a.reason)) || a.km - b.km)[0];
    const rec = [];
    if (f.hfImbalance >= 0.08 || f.rotKnock >= 0.3 || f.imbalance >= 0.2) rec.push('cyl');
    if (f.hfRatio >= 1.6 && !(f.hfImbalance >= 0.08)) rec.push('irregular');
    if (f.tones && f.tones.length) rec.push('tone');
    if (ref && !rec.length) rec.push('new');
    const opt = (v, label, dis) => `<option value="${v}" ${dis ? 'disabled' : ''}>${label}${rec[0] === v ? ' (recomendado)' : ''}</option>`;
    return `<div class="card"><h2>Aislar el sonido anómalo ${Info.btn('isolate')}</h2>
      <p class="muted small">Quita el sonido normal del motor y deja lo que destaca, amplificado para escucharlo.</p>
      <label>Qué dejar
        <select id="isoMode">
          ${opt('new', 'Lo nuevo respecto a otra ficha', !others.length)}
          ${opt('cyl', 'Lo que distingue a un cilindro (tics, golpes, fallos)', !f.firingHz)}
          ${opt('irregular', 'Golpes y ruidos sin ritmo (traqueteos)', !f.firingHz)}
          ${opt('low', 'Solo graves 100–1.000 Hz (biela, volante, soportes)')}
          ${opt('high', 'Solo agudos 2–8 kHz (taqués, silbidos, siseos)')}
          ${opt('tone', 'Solo el tono destacado' + (f.tones && f.tones.length ? ` (${f.tones[0].hz} Hz)` : ''), !(f.tones && f.tones.length))}
        </select></label>
      <label id="isoRefRow">Ficha de referencia (motor sano)
        <select id="isoRef">${others.map(x => `<option value="${x.id}" ${ref && x.id === ref.id ? 'selected' : ''}>${fmtKm(x.km)} · ${esc(x.testType)} · ${esc(x.reasonCat || x.reason).slice(0, 40)}</option>`).join('')}</select></label>
      <button class="btn primary" id="isoGo">Aislar y escuchar</button>
      <div id="isoOut" class="hidden"><p class="small" id="isoTxt"></p><audio id="isoPlayer" controls></audio>
        <button class="btn ghost" id="isoWav">Exportar este audio (WAV)</button></div></div>`;
  }
  function bindIsolate(r) {
    const mode = $('#isoMode'); if (!mode) return;
    const rec = Array.from(mode.options).find(o => /recomendado/.test(o.textContent) && !o.disabled) || Array.from(mode.options).find(o => !o.disabled);
    if (rec) mode.value = rec.value;
    const sync = () => $('#isoRefRow').classList.toggle('hidden', mode.value !== 'new');
    mode.onchange = sync; sync();
    let lastWav = null;
    $('#isoGo').onclick = async () => {
      const btn = $('#isoGo'); btn.disabled = true; btn.textContent = 'Procesando…';
      await new Promise(res => setTimeout(res, 30));
      try {
        const { pcm, sr } = wavToPcm(r.audio), f = r.features;
        let y, what;
        if (mode.value === 'new') {
          const ref = await DB.getRec($('#isoRef').value);
          const R = wavToPcm(ref.audio);
          y = Isolate.subtractReference(pcm, sr, R.pcm, R.sr);
          what = `lo que no estaba en la ficha de ${fmtKm(ref.km)}`;
          if (ref.testType !== r.testType) what += ' (ojo: es de otro tipo de prueba)';
        } else if (mode.value === 'cyl') { y = Isolate.syncResidual(pcm, sr, f.firingHz, S.vehicle.cylinders, 'cyl'); what = 'lo que distingue a cada cilindro de los demás'; }
        else if (mode.value === 'irregular') { y = Isolate.syncResidual(pcm, sr, f.firingHz, S.vehicle.cylinders, 'irregular'); what = 'los ruidos que no se repiten en cada ciclo'; }
        else if (mode.value === 'low') { y = Isolate.band(pcm, sr, 100, 1000); what = 'solo los graves (100–1.000 Hz)'; }
        else if (mode.value === 'high') { y = Isolate.band(pcm, sr, 2000, 8000); what = 'solo los agudos (2–8 kHz)'; }
        else { const hz = f.tones[0].hz; y = Isolate.band(pcm, sr, hz * 0.96, hz * 1.04); what = `solo el tono de ${hz} Hz`; }
        const out = Isolate.finish(pcm, y);
        lastWav = encodeWav(out.pcm, sr);
        setPlayer($('#isoPlayer'), lastWav);
        const removed = Math.max(0, Math.min(99.9, 100 * (1 - Math.pow(10, out.keptDb / 10))));
        $('#isoTxt').innerHTML = `Resultado: ${esc(what)}. Se ha quitado el ${removed.toLocaleString('es-ES', { maximumFractionDigits: 1 })}% de la energía del sonido (queda ${out.keptDb} dB) y se ha amplificado para escucharlo.` +
          (out.keptDb < -30 && (mode.value === 'cyl' || mode.value === 'new') ? ' <b>Apenas queda nada: no hay un sonido anómalo destacable con este método.</b>' : '');
        $('#isoOut').classList.remove('hidden');
        $('#isoPlayer').play().catch(() => { });
      } catch (e) { toast('No se pudo procesar: ' + (e.message || e), 4000); }
      btn.disabled = false; btn.textContent = 'Aislar y escuchar';
    };
    $('#isoWav').onclick = () => {
      if (!lastWav) return;
      const name = `aislado-${mode.value}-${r.km}km.wav`;
      if (Bridge && Bridge.saveBase64) { Bridge.saveBase64(name, 'audio/wav', abToB64(lastWav)); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lastWav], { type: 'audio/wav' })); a.download = name; a.click();
    };
  }

  // ---------- gráficas ----------
  const COLORS = ['#5b9bd5', '#f5a524', '#e5484d', '#46a758', '#b07fe0', '#e86fb0', '#4fd1c5', '#c9c9c9'];
  function drawSpectra(canvas, series) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext('2d'); g.scale(dpr, dpr);
    const padL = 34, padB = 22, padT = 8, padR = 8;
    const fmin = 30, fmax = 16000;
    let ymax = -Infinity, ymin = Infinity;
    series.forEach(s => s.spec.forEach(p => { ymax = Math.max(ymax, p[1]); ymin = Math.min(ymin, p[1]); }));
    ymax = Math.ceil(ymax / 10) * 10; ymin = Math.max(ymax - 70, Math.floor(ymin / 10) * 10);
    const X = f => padL + (Math.log(f / fmin) / Math.log(fmax / fmin)) * (W - padL - padR);
    const Y = v => padT + (ymax - v) / (ymax - ymin) * (H - padT - padB);
    g.font = '11px system-ui'; g.fillStyle = '#9aa1ab'; g.strokeStyle = '#2c3038'; g.lineWidth = 1;
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(f => {
      g.beginPath(); g.moveTo(X(f), padT); g.lineTo(X(f), H - padB); g.stroke();
      g.textAlign = 'center'; g.fillText(f >= 1000 ? f / 1000 + 'k' : f, X(f), H - 6);
    });
    for (let v = ymin; v <= ymax; v += 10) {
      g.beginPath(); g.moveTo(padL, Y(v)); g.lineTo(W - padR, Y(v)); g.stroke();
      g.textAlign = 'right'; g.fillText(v, padL - 4, Y(v) + 4);
    }
    series.forEach((s, i) => {
      g.strokeStyle = COLORS[i % COLORS.length]; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
      s.spec.forEach((p, k) => { const y = Y(Math.max(p[1], ymin)); if (k) g.lineTo(X(p[0]), y); else g.moveTo(X(p[0]), y); });
      g.stroke();
    });
    g.fillStyle = '#9aa1ab'; g.textAlign = 'left'; g.fillText('dB', 2, padT + 8);
  }

  // ---------- diferencias de frecuencia ----------
  const sgn = v => (v > 0 ? '+' : '') + String(v).replace('.', ',');
  function freqHtml(p, pi) {
    const fd = p.freq; if (!fd) return '';
    const cls = d => Math.abs(d) >= 7 ? 'alerta' : Math.abs(d) >= 4 ? 'aviso' : 'ok';
    return `<h3>Diferencias de frecuencia ${Info.btn('diff')}</h3>
      <canvas class="chart" id="fd${pi}" style="height:170px"></canvas>
      <p class="muted small">Diferencia del espectro (${fmtKm(p.b.km)} menos ${fmtKm(p.a.km)}). Por encima de 0: esa frecuencia suena más fuerte ahora.</p>
      <div class="tblwrap"><table class="tbl">
        <tr><th>Frecuencia ${Info.btn('bands')}</th><th>${(p.a.km / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k</th><th>${(p.b.km / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k</th><th>Cambio</th></tr>
        ${fd.firing ? `<tr><td>Encendido ${Info.btn('firing')}</td><td>${String(fd.firing.a).replace('.', ',')} Hz<br><span class="muted">${fd.firing.rpmA} rpm</span></td><td>${String(fd.firing.b).replace('.', ',')} Hz<br><span class="muted">${fd.firing.rpmB} rpm</span></td><td>${sgn(fd.firing.pct)}%</td></tr>` : ''}
        <tr><td>Centro tonal ${Info.btn('centroid')}</td><td>${fd.centroid.a} Hz</td><td>${fd.centroid.b} Hz</td><td>${sgn(fd.centroid.pct)}%</td></tr>
        ${fd.bands.map(b => `<tr><td>${b.lo >= 1000 ? b.lo / 1000 + 'k' : b.lo}–${b.hi >= 1000 ? b.hi / 1000 + 'k' : b.hi} Hz</td><td>${String(b.a).replace('.', ',')}</td><td>${String(b.b).replace('.', ',')}</td><td><span class="pill ${cls(b.d)}">${sgn(b.d)} dB</span></td></tr>`).join('')}
      </table></div>
      ${fd.zones.length ? `<p class="small" style="margin:10px 0 4px"><b>Zonas que más cambian</b> ${Info.btn('diff')}</p>${fd.zones.map(z => `<div class="finding"><span class="pill ${z.max > 0 ? (Math.abs(z.max) >= 7 ? 'alerta' : 'aviso') : 'info'}">${z.max > 0 ? 'Sube' : 'Baja'}</span><span>${esc(z.text)}</span></div>`).join('')}` : '<p class="muted small">Ninguna zona del espectro cambia 3 dB o más.</p>'}
      ${fd.tones.length ? `<p class="small" style="margin:10px 0 4px"><b>Tonos</b> ${Info.btn('tones')}</p>${fd.tones.map(t => `<div class="finding"><span class="pill ${t.kind === 'nuevo' ? 'alerta' : t.kind === 'desplazado' ? 'aviso' : 'info'}">${t.kind === 'igual' ? 'Igual' : t.kind[0].toUpperCase() + t.kind.slice(1)}</span><span>${esc(t.text)}</span></div>`).join('')}` : ''}`;
  }
  function drawDiff(canvas, diff) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext('2d'); g.scale(dpr, dpr);
    const padL = 34, padB = 22, padT = 8, padR = 8, fmin = 30, fmax = 16000;
    let m = 6; diff.forEach(p => { m = Math.max(m, Math.abs(p[1])); }); m = Math.ceil(m / 3) * 3;
    const X = f => padL + (Math.log(f / fmin) / Math.log(fmax / fmin)) * (W - padL - padR);
    const Y = v => padT + (m - v) / (2 * m) * (H - padT - padB);
    g.font = '11px system-ui'; g.fillStyle = '#9aa1ab'; g.strokeStyle = '#2c3038'; g.lineWidth = 1;
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(f => {
      g.beginPath(); g.moveTo(X(f), padT); g.lineTo(X(f), H - padB); g.stroke();
      g.textAlign = 'center'; g.fillText(f >= 1000 ? f / 1000 + 'k' : f, X(f), H - 6);
    });
    const step = m <= 9 ? 3 : 6;
    for (let v = -m; v <= m; v += step) { g.textAlign = 'right'; g.fillText((v > 0 ? '+' : '') + v, padL - 4, Y(v) + 4); }
    // banda de ±3 dB (cambio no significativo)
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(padL, Y(3), W - padL - padR, Y(-3) - Y(3));
    g.strokeStyle = '#555c66'; g.beginPath(); g.moveTo(padL, Y(0)); g.lineTo(W - padR, Y(0)); g.stroke();
    // barras por punto
    for (let i = 0; i < diff.length; i++) {
      const [f, d] = diff[i];
      const fNext = i + 1 < diff.length ? diff[i + 1][0] : f * 1.07;
      const x0 = X(f), x1 = X(fNext);
      g.fillStyle = Math.abs(d) < 3 ? '#555c66' : d > 0 ? (d >= 7 ? '#e5484d' : '#f5a524') : '#5b9bd5';
      g.fillRect(x0, Math.min(Y(0), Y(d)), Math.max(1, x1 - x0 - 0.5), Math.abs(Y(d) - Y(0)));
    }
    g.fillStyle = '#9aa1ab'; g.textAlign = 'left'; g.fillText('dB', 2, padT + 8);
  }

  // ---------- informe ----------
  async function showReport(ids) {
    const recs = [];
    for (const id of ids) { const r = await DB.getRec(id); if (r) recs.push(r); }
    if (recs.length < 2) return;
    const rep = EM.buildReport(recs, S.vehicle);
    S.report = rep;
    const sorted = rep.records;
    const tag = { alerta: 'Anomalía', aviso: 'Vigilar', info: 'Info' };
    const fl = list => list.length ? list.map(f => `<div class="finding"><span class="pill ${f.level}">${tag[f.level]}</span><span><b>${esc(f.area)}.</b> ${esc(f.text)} ${Info.area(f.area)}</span></div>`).join('') : '<div class="finding"><span class="pill ok">OK</span><span>Sin diferencias relevantes.</span></div>';
    const row = (label, fn, key) => `<tr><td>${label} ${key ? Info.btn(key) : ''}</td>${sorted.map(r => `<td>${fn(r.features) ?? '—'}</td>`).join('')}</tr>`;
    const statusTxt = { ok: 'Sin anomalías', aviso: 'Aspectos a vigilar', alerta: 'Anomalías detectadas' };
    $('#reportBody').innerHTML = `
      <button class="link" data-go="fichas">‹ Fichas</button>
      <div class="status ${rep.status}">${statusTxt[rep.status]}<div style="font-weight:400;margin-top:6px">${rep.summary.map(esc).join('<br>')}</div></div>
      ${rep.causes ? causesHtml(rep.causes, sorted[sorted.length - 1].features).replace('<h2>Posibles averías', `<h2>Posibles averías · ${fmtKm(sorted[sorted.length - 1].km)}`) : ''}
      <div class="card"><h2>Espectros superpuestos ${Info.btn('spectrum')}</h2><canvas class="chart" id="repChart"></canvas>
        <div class="legend">${sorted.map((r, i) => `<span><i style="background:${COLORS[i % COLORS.length]}"></i>${fmtKm(r.km)}</span>`).join('')}</div>
        <p class="muted small">Curvas normalizadas: se compara la forma del sonido, no el volumen.</p></div>
      <div class="card"><h2>Evolución</h2><div class="tblwrap"><table class="tbl">
        <tr><th></th>${sorted.map(r => `<th>${(r.km / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k km</th>`).join('')}</tr>
        <tr><td>Fecha</td>${sorted.map(r => `<td>${new Date(r.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>`).join('')}</tr>
        ${row('rpm', f => f.rpm, 'rpm')}
        ${row('Regularidad', f => f.periodicity != null ? Math.round(f.periodicity * 100) + '%' : null, 'periodicity')}
        ${row('Desequilibrio', f => f.imbalance, 'imbalance')}
        ${row('Irregularidad', f => f.cycleCv != null ? Math.round(f.cycleCv * 100) + '%' : null, 'cycleCv')}
        ${row('Expl. débiles', f => f.weakPct != null ? f.weakPct + '%' : null, 'weakPct')}
        ${row('Impulsividad', f => f.hfKurtosis, 'hfKurtosis')}
        ${row('Ruido 1 cilindro', f => f.hfImbalance, 'hfImbalance')}
        ${row('Golpe por vuelta', f => f.rotKnock, 'rotKnock')}
        ${row('Imp. graves', f => f.lfKurtosis, 'lfKurtosis')}
        ${row('Oscil. ralentí', f => f.rpmHuntPct != null ? '±' + f.rpmHuntPct + '%' : null, 'rpmHuntPct')}
        ${row('Centro tonal', f => f.centroidHz + ' Hz', 'centroid')}
        ${row('Nivel', f => f.levelDb + ' dB', 'levelDb')}
      </table></div></div>
      ${rep.pairs.map((p, pi) => `<div class="card"><h2>${p.global ? 'Evolución total' : 'Cambios'} ${fmtKm(p.a.km)} → ${fmtKm(p.b.km)}</h2>
        <p class="muted small">${esc(p.b.reason)}</p>${fl(p.findings)}${freqHtml(p, pi)}</div>`).join('')}
      ${rep.trends.length ? `<div class="card"><h2>Tendencias</h2>${rep.trends.map(t => `<div class="finding"><span class="pill ${t.worse ? 'aviso' : 'info'}">${t.worse ? 'Empeora' : 'Cambio'}</span><span>${esc(t.text)} ${Info.btn(t.key)}</span></div>`).join('')}</div>` : ''}
      <div class="card"><h2>Rasgos anómalos por grabación</h2>${rep.absolute.length ? rep.absolute.map(f => `<div class="finding"><span class="pill ${f.level}">${fmtKm(f.rec.km)}</span><span><b>${esc(f.area)}.</b> ${esc(f.text)} ${Info.area(f.area)}</span></div>`).join('') : '<p class="muted">Ninguno.</p>'}
      ${rep.quality.length ? '<h3>Calidad de grabación</h3>' + rep.quality.map(q => `<div class="finding"><span class="pill ${q.level}">${fmtKm(q.rec.km)}</span><span>${esc(q.text)} ${Info.btn('reliable')}</span></div>`).join('') : ''}</div>
      <div class="card" id="aiCard"><h2>Interpretación de Claude</h2><div id="aiOut" class="ai muted small">${LS.get('apiKey', '') ? 'Pide una interpretación redactada a partir de estos datos.' : 'Añade tu clave API en Ajustes para obtener una interpretación redactada por Claude.'}</div>
        ${LS.get('apiKey', '') ? '<button class="btn ghost" id="btnAI">Generar interpretación</button>' : '<button class="btn ghost" data-go="ajustes">Ir a Ajustes</button>'}</div>
      <p class="muted small">Informe orientativo basado solo en el sonido; no sustituye el diagnóstico de un mecánico.</p>
      <div class="actions"><button class="btn ghost" id="btnCopy">Copiar</button><button class="btn primary" id="btnShare">Compartir informe</button></div>`;
    go('informe');
    drawSpectra($('#repChart'), sorted.map(r => ({ label: fmtKm(r.km), spec: r.features.spectrum })));
    rep.pairs.forEach((p, pi) => { const c = document.getElementById('fd' + pi); if (c && p.freq) drawDiff(c, p.freq.diff); });
    const text = () => EM.reportToText(rep, fmtDate) + (S.aiText ? '\n\nINTERPRETACIÓN (Claude)\n' + S.aiText : '');
    S.aiText = '';
    $('#btnShare').onclick = () => shareText('Informe motor ' + (S.vehicle ? S.vehicle.name : ''), text());
    $('#btnCopy').onclick = () => copyText(text());
    const bai = $('#btnAI'); if (bai) bai.onclick = () => askClaude(rep);
  }

  function shareText(title, text) {
    if (Bridge && Bridge.shareText) { Bridge.shareText(title, text); return; }
    if (navigator.share) navigator.share({ title, text }).catch(() => { }); else copyText(text);
  }
  function copyText(text) {
    if (Bridge && Bridge.copyText) { Bridge.copyText(text); toast('Informe copiado'); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Informe copiado'), () => toast('No se pudo copiar'));
  }

  async function askClaude(rep) {
    const key = LS.get('apiKey', ''); if (!key) return;
    const out = $('#aiOut'), btn = $('#btnAI');
    btn.disabled = true; out.classList.remove('muted'); out.textContent = 'Consultando a Claude…';
    const data = rep.records.map(r => {
      const f = Object.assign({}, r.features); delete f.spectrum;
      f.spectrumCoarse = r.features.spectrum.filter((_, i) => i % 6 === 0);
      return { km: r.km, fecha: new Date(r.date).toISOString().slice(0, 10), prueba: r.testType, motivo: r.reason, observaciones: r.notes, temperaturaAmbiente: r.ambientC, minutosEnMarcha: r.warmMin, dispositivo: r.device, analisis: f };
    });
    const prompt = `Eres un mecánico experto en diagnóstico por sonido. Un usuario graba el sonido de su motor siempre en el mismo sitio y con el móvil en la misma posición, a lo largo de la vida del vehículo. Abajo tienes los indicadores acústicos calculados de varias grabaciones y el informe automático.

Vehículo: ${rep.vehicle.name}, ${rep.vehicle.cylinders} cilindros, ${rep.vehicle.fuel}, 4 tiempos.

Significado de los indicadores: rpm = estimadas por el ritmo de explosiones; periodicity (0-1) = regularidad del ritmo; imbalance = energía en subarmónicos del ciclo frente a la frecuencia de encendido (sube si un cilindro quema distinto; sano < 0,2); cycleCv = variación de energía entre explosiones; weakPct = % de explosiones débiles; hfKurtosis = impulsividad por encima de 2 kHz (golpes metálicos; compárese entre grabaciones); hfImbalance = ruido agudo que sale de un solo cilindro (normal < 0,08); rotKnock = golpe grave una vez por vuelta (normal < 0,3); lfKurtosis = impulsividad 100–1000 Hz (normal < 11); rpmHuntPct = oscilación del ralentí en %; reliable = si la grabación es fiable; bands = nivel relativo por bandas en dB; tones = tonos prominentes (Hz, dB sobre el fondo); levelDb = nivel global (depende de la posición).

Datos:
${JSON.stringify(data)}

Informe automático:
${EM.reportToText(rep)}

Escribe en español, en texto plano sin markdown, un informe breve (máx. 250 palabras): 1) qué ha cambiado entre grabaciones y qué es anómalo, 2) causas mecánicas probables ordenadas por probabilidad, teniendo en cuenta los motivos de cada grabación, 3) qué revisar y con qué urgencia. Sé prudente: señala qué diferencias pueden deberse a la forma de grabar.`;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: LS.get('model', 'claude-sonnet-5-5'), max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
      });
      const j = await res.json();
      if (!res.ok) throw new Error((j.error && j.error.message) || res.status);
      S.aiText = j.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
      out.textContent = S.aiText;
    } catch (e) {
      out.textContent = 'No se pudo obtener la interpretación: ' + (e.message || e) + '. Revisa la clave API y la conexión.';
    }
    btn.disabled = false;
  }

  // ---------- ajustes ----------
  async function renderAjustes() {
    const all = await DB.allRecordings();
    $('#vehList').innerHTML = S.vehicles.length ? S.vehicles.map(v => `<div class="finding" style="align-items:center"><span style="flex:1"><b>${esc(v.name)}</b><br><span class="muted small">${v.type === 'moto' ? 'Moto' : 'Coche'} · ${v.cylinders} cil. · ${esc(v.fuel)} · ${all.filter(r => r.vehicleId === v.id).length} fichas</span></span><button class="btn ghost small" data-edit="${v.id}">Editar</button></div>`).join('') : '<p class="muted">Ninguno todavía.</p>';
    $$('[data-edit]').forEach(b => b.onclick = () => vehicleForm(S.vehicles.find(v => v.id === b.dataset.edit)));
    $('#apiKey').value = LS.get('apiKey', '');
  }
  $('#btnSaveKey').onclick = () => { LS.set('apiKey', $('#apiKey').value.trim()); toast($('#apiKey').value.trim() ? 'Clave guardada' : 'Clave eliminada'); };

  function abToB64(buf) {
    const b = new Uint8Array(buf); let s = ''; const CH = 0x8000;
    for (let i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH));
    return btoa(s);
  }
  function b64ToAb(s) { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; }

  $('#btnExport').onclick = async () => {
    toast('Preparando copia…');
    const vehicles = await DB.vehicles();
    const recordings = (await DB.allRecordings()).map(r => Object.assign({}, r, { audio: abToB64(r.audio) }));
    const json = JSON.stringify({ app: 'escucha-motor', version: 1, exported: Date.now(), vehicles, recordings });
    const name = 'escucha-motor-' + new Date().toISOString().slice(0, 10) + '.json';
    if (Bridge && Bridge.saveFile) { Bridge.saveFile(name, 'application/json', json); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = name; a.click();
  };
  window.__saved = ok => toast(ok ? 'Archivo guardado' : 'No se guardó el archivo');
  $('#btnImportBk').onclick = () => $('#fileBackup').click();
  $('#fileBackup').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (j.app !== 'escucha-motor') throw new Error('no es una copia de Escucha Motor');
      if (!await confirmBox(`Importar ${j.vehicles.length} vehículo(s) y ${j.recordings.length} ficha(s)? Las fichas con el mismo identificador se sustituyen.`, 'Importar')) return;
      for (const v of j.vehicles) await DB.putVehicle(v);
      for (const r of j.recordings) { r.audio = b64ToAb(r.audio); await DB.putRec(r); }
      await loadVehicles(); renderAjustes(); toast('Copia importada');
    } catch (err) { toast('Error al importar: ' + err.message, 4000); }
  };

  // ---------- inicio ----------
  loadVehicles().then(() => { go('grabar'); if (!S.vehicles.length) setTimeout(vehicleForm, 300); })
    .catch(e => { document.body.insertAdjacentHTML('afterbegin', `<div class="card warn">Error de almacenamiento: ${esc(e.message)}</div>`); });
})();
