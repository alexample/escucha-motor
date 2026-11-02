/* Escucha Motor — análisis acústico y comparativa.
 * Funciona en el navegador (window.EM) y en Node (module.exports) para pruebas.
 */
(function (root) {
  'use strict';

  // ---------- utilidades numéricas ----------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const xr = re[b] * cr - im[b] * ci;
          const xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  const mean = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
  const median = a => { const b = Array.from(a).sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const std = a => { const m = mean(a); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2; return Math.sqrt(s / a.length); };
  const db = x => 10 * Math.log10(Math.max(x, 1e-20));
  const r1 = x => Math.round(x * 10) / 10;
  const r2 = x => Math.round(x * 100) / 100;

  function biquadHighpass(x, sr, fc) {
    const w0 = 2 * Math.PI * fc / sr, q = Math.SQRT1_2;
    const alpha = Math.sin(w0) / (2 * q), cw = Math.cos(w0);
    const a0 = 1 + alpha;
    const b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, b2 = b0;
    const a1 = -2 * cw / a0, a2 = (1 - alpha) / a0;
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }

  const BANDS = [
    { id: 'b1', name: 'Graves profundos', lo: 20, hi: 100, desc: 'pulsos de combustión, escape, soportes' },
    { id: 'b2', name: 'Graves', lo: 100, hi: 300, desc: 'escape, cuerpo del motor' },
    { id: 'b3', name: 'Medios', lo: 300, hi: 1000, desc: 'admisión, mecánica general' },
    { id: 'b4', name: 'Medios-agudos', lo: 1000, hi: 3000, desc: 'distribución, taqués, inyectores' },
    { id: 'b5', name: 'Agudos', lo: 3000, hi: 8000, desc: 'silbidos, rodamientos, turbo, correas' },
    { id: 'b6', name: 'Muy agudos', lo: 8000, hi: 16000, desc: 'roces metálicos, fugas de aire' }
  ];

  // ---------- análisis de una grabación ----------
  function analyze(input, sr, cylinders) {
    cylinders = cylinders || 4;
    // recorte de bordes (arranque del micro y final)
    const start = Math.min(Math.floor(sr * 0.5), Math.floor(input.length * 0.1));
    const end = input.length - Math.min(Math.floor(sr * 0.25), Math.floor(input.length * 0.05));
    const x0 = input.subarray ? input.subarray(start, end) : input.slice(start, end);
    const N = x0.length;
    const dur = N / sr;
    const res = { version: 1, sampleRate: sr, duration: r1(dur), cylinders: cylinders, quality: [] };
    if (dur < 4) { res.quality.push({ level: 'alerta', text: 'Grabación demasiado corta (mínimo 5 s).' }); }

    // DC y nivel
    const m = mean(x0);
    const x = new Float32Array(N);
    let peak = 0, clip = 0, sq = 0;
    for (let i = 0; i < N; i++) {
      const raw = x0[i];
      if (Math.abs(raw) >= 0.99) clip++;
      const v = raw - m; x[i] = v;
      const a = Math.abs(v); if (a > peak) peak = a;
      sq += v * v;
    }
    const rms = Math.sqrt(sq / N);
    res.levelDb = r1(20 * Math.log10(Math.max(rms, 1e-9)));
    res.peakDb = r1(20 * Math.log10(Math.max(peak, 1e-9)));
    res.crest = r1(peak / Math.max(rms, 1e-9));
    res.clipPct = r2(100 * clip / N);
    if (res.clipPct > 0.1) res.quality.push({ level: 'alerta', text: `Saturación en el ${res.clipPct}% de las muestras: aleja el móvil o protege el micrófono.` });
    if (res.levelDb < -55) res.quality.push({ level: 'aviso', text: 'Nivel muy bajo: el micrófono está lejos, tapado o el motor no se oye bien.' });

    // estabilidad del nivel en tramos de 500 ms
    const fl = Math.floor(sr * 0.5);
    const frameDb = [];
    for (let i = 0; i + fl <= N; i += fl) {
      let s = 0; for (let k = i; k < i + fl; k++) s += x[k] * x[k];
      frameDb.push(db(s / fl));
    }
    res.levelStdDb = r2(std(frameDb));

    // espectro promedio (Welch)
    const nfft = 8192, hop = 4096;
    const win = new Float32Array(nfft);
    let wsum = 0;
    for (let i = 0; i < nfft; i++) { win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (nfft - 1)); wsum += win[i] * win[i]; }
    const psd = new Float64Array(nfft / 2);
    let segs = 0;
    const re = new Float64Array(nfft), im = new Float64Array(nfft);
    for (let s = 0; s + nfft <= N; s += hop) {
      for (let i = 0; i < nfft; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k < nfft / 2; k++) psd[k] += (re[k] * re[k] + im[k] * im[k]) / wsum;
      segs++;
    }
    if (segs === 0) segs = 1;
    for (let k = 0; k < psd.length; k++) psd[k] /= segs;
    const df = sr / nfft;
    const nyq = sr / 2;

    // bandas (relativas al total 20 Hz–16 kHz para que no dependan del volumen)
    let total = 0;
    for (let k = 0; k < psd.length; k++) { const f = k * df; if (f >= 20 && f <= Math.min(16000, nyq)) total += psd[k]; }
    res.bands = {};
    BANDS.forEach(b => {
      let e = 0;
      for (let k = Math.ceil(b.lo / df); k <= Math.floor(Math.min(b.hi, nyq - df) / df); k++) e += psd[k];
      res.bands[b.id] = r1(db(e) - db(total));
    });

    // centroide y planitud
    let cn = 0, cd = 0, lg = 0, ar = 0, cnt = 0;
    for (let k = Math.ceil(50 / df); k < psd.length && k * df <= 16000; k++) {
      const f = k * df, p = psd[k];
      cn += f * p; cd += p; lg += Math.log(p + 1e-20); ar += p; cnt++;
    }
    res.centroidHz = Math.round(cn / Math.max(cd, 1e-20));
    res.flatness = r2(Math.exp(lg / cnt) / (ar / cnt));

    // espectro reducido para gráficas (puntos logarítmicos 30 Hz – 16 kHz)
    const pts = 96, fmin = 30, fmax = Math.min(16000, nyq * 0.98);
    res.spectrum = [];
    for (let i = 0; i < pts; i++) {
      const fa = fmin * Math.pow(fmax / fmin, i / pts), fb = fmin * Math.pow(fmax / fmin, (i + 1) / pts);
      let e = 0, c = 0;
      for (let k = Math.floor(fa / df); k <= Math.ceil(fb / df) && k < psd.length; k++) { e += psd[k]; c++; }
      res.spectrum.push([Math.round(Math.sqrt(fa * fb)), r1(db(e / Math.max(c, 1)) - db(total / psd.length))]);
    }

    // tonos destacados (silbidos, zumbidos) 300 Hz – 12 kHz
    const psdDb = Array.from(psd, p => db(p));
    const tones = [];
    const kLo = Math.ceil(300 / df), kHi = Math.min(Math.floor(12000 / df), psd.length - 60);
    for (let k = kLo; k <= kHi; k++) {
      if (psdDb[k] <= psdDb[k - 1] || psdDb[k] < psdDb[k + 1]) continue;
      const neigh = [];
      for (let j = k - 50; j <= k + 50; j++) if (Math.abs(j - k) > 3) neigh.push(psdDb[j]);
      const prom = psdDb[k] - median(neigh);
      if (prom >= 12) tones.push({ hz: Math.round(k * df), prom: r1(prom) });
    }
    tones.sort((a, b) => b.prom - a.prom);
    res.tones = [];
    tones.forEach(t => { if (res.tones.length < 8 && !res.tones.some(u => Math.abs(u.hz - t.hz) / t.hz < 0.03)) res.tones.push(t); });

    // envolvente a 1 kHz para el ritmo de combustión
    const ehop = Math.round(sr / 1000), es = sr / ehop, ewin = ehop * 2;
    const env = [];
    for (let i = 0; i + ewin <= N; i += ehop) {
      let s = 0; for (let k = i; k < i + ewin; k++) s += x[k] * x[k];
      env.push(Math.sqrt(s / ewin));
    }
    const em = mean(env);
    const e = env.map(v => v - em);
    // autocorrelación normalizada 6–120 ms (8–166 Hz)
    const lagMin = Math.round(0.006 * es), lagMax = Math.min(Math.round(0.12 * es), Math.floor(e.length / 3));
    let e0 = 0; for (let i = 0; i < e.length; i++) e0 += e[i] * e[i];
    const ac = [];
    for (let L = 0; L <= lagMax; L++) {
      let s = 0; for (let i = 0; i + L < e.length; i++) s += e[i] * e[i + L];
      ac.push(s / Math.max(e0, 1e-20) * e.length / (e.length - L));
    }
    let best = -1, bestL = 0;
    for (let L = lagMin; L < lagMax; L++) if (ac[L] > ac[L - 1] && ac[L] >= ac[L + 1] && ac[L] > best) { best = ac[L]; bestL = L; }
    // preferir el periodo más corto con un pico casi igual de fuerte (evita submúltiplos)
    for (let L = lagMin; L < bestL; L++) {
      if (ac[L] > ac[L - 1] && ac[L] >= ac[L + 1] && ac[L] >= 0.8 * best && Math.abs(bestL / L - Math.round(bestL / L)) < 0.12) { bestL = L; best = ac[L]; break; }
    }
    res.periodicity = r2(Math.max(0, best));
    if (bestL > 0 && best > 0.15) {
      // refinamiento parabólico
      const a = ac[bestL - 1], b = ac[bestL], c = ac[bestL + 1];
      const d = (a - 2 * b + c) !== 0 ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
      const period = (bestL + d) / es;
      res.firingHz = r1(1 / period);
      res.rpm = Math.round(res.firingHz * 120 / cylinders);

      // espectro de la envolvente: firma de cada cilindro
      const L2 = 1 << Math.ceil(Math.log2(Math.max(e.length, 2048)));
      const er = new Float64Array(L2), ei = new Float64Array(L2);
      for (let i = 0; i < e.length; i++) er[i] = e[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (e.length - 1)));
      fft(er, ei);
      const mag = k => Math.sqrt(er[k] * er[k] + ei[k] * ei[k]);
      const peakNear = f => { const k = Math.round(f * L2 / es); let mx = 0; for (let j = k - 2; j <= k + 2; j++) if (j > 0 && j < L2 / 2) mx = Math.max(mx, mag(j)); return mx; };
      const aF = peakNear(res.firingHz);
      const fCycle = res.firingHz / cylinders;
      let sub = 0;
      for (let h = 1; h < cylinders; h++) sub += peakNear(fCycle * h);
      res.imbalance = r2(cylinders > 1 ? sub / (cylinders - 1) / Math.max(aF, 1e-12) : 0);

      // variación ciclo a ciclo
      const pS = period * es;
      const cyc = [];
      for (let t = 0; t + pS <= env.length; t += pS) {
        let s = 0; const a0 = Math.floor(t), a1 = Math.floor(t + pS);
        for (let i = a0; i < a1; i++) s += env[i] * env[i];
        cyc.push(s / (a1 - a0));
      }
      const md = median(cyc);
      res.cycleCv = r2(std(cyc) / Math.max(mean(cyc), 1e-20));
      const weak = cyc.filter(v => v < 0.45 * md).length;
      res.weakEventsPerMin = r1(weak / dur * 60);
      res.weakPct = r1(100 * weak / Math.max(cyc.length, 1));
    } else {
      res.firingHz = null; res.rpm = null; res.imbalance = null; res.cycleCv = null; res.weakEventsPerMin = null; res.weakPct = null;
      res.quality.push({ level: 'aviso', text: 'No se detecta un ritmo de combustión claro (ruido ambiente, viento o micrófono mal orientado).' });
    }

    // impulsividad en agudos (golpeteos, taqués, picado)
    const hp = biquadHighpass(x, sr, 2000);
    let m2 = 0, m4 = 0, hpk = 0;
    for (let i = 0; i < N; i++) { const v = hp[i]; m2 += v * v; m4 += v * v * v * v; if (Math.abs(v) > hpk) hpk = Math.abs(v); }
    m2 /= N; m4 /= N;
    res.hfKurtosis = r1(m4 / Math.max(m2 * m2, 1e-30));
    res.hfCrest = r1(hpk / Math.sqrt(Math.max(m2, 1e-30)));
    return res;
  }

  // ---------- criterios ----------
  const LIM = {
    periodicityLow: 0.35,
    imbalanceWarn: 0.2, imbalanceAlert: 0.35,
    cycleCvWarn: 0.3, cycleCvAlert: 0.45,
    weakWarn: 6, weakAlert: 20,
    kurtWarn: 25, kurtAlert: 45,
    levelStdWarn: 1.5,
    rpmChange: 0.1,
    bandChange: 4, bandChangeAlert: 7,
    levelChange: 4,
    centroidChange: 0.2,
    newTone: 15
  };

  function absoluteFindings(f) {
    const out = [];
    if (f.periodicity != null && f.periodicity < LIM.periodicityLow && f.rpm)
      out.push({ level: 'aviso', area: 'Ritmo', text: `Ritmo de combustión poco definido (regularidad ${f.periodicity}). Puede indicar ralentí inestable o una grabación con mucho ruido ajeno.` });
    if (f.imbalance != null) {
      if (f.imbalance >= LIM.imbalanceAlert) out.push({ level: 'alerta', area: 'Cilindros', text: `Fuerte desequilibrio entre cilindros (índice ${f.imbalance}). Es la firma típica de un cilindro que no quema igual: bujía, bobina, inyector o compresión.` });
      else if (f.imbalance >= LIM.imbalanceWarn) out.push({ level: 'aviso', area: 'Cilindros', text: `Desequilibrio moderado entre cilindros (índice ${f.imbalance}).` });
    }
    if (f.cycleCv != null) {
      if (f.cycleCv >= LIM.cycleCvAlert) out.push({ level: 'alerta', area: 'Ralentí', text: `Explosiones muy irregulares de un ciclo a otro (variación ${Math.round(f.cycleCv * 100)}%).` });
      else if (f.cycleCv >= LIM.cycleCvWarn) out.push({ level: 'aviso', area: 'Ralentí', text: `Cierta irregularidad entre explosiones (variación ${Math.round(f.cycleCv * 100)}%).` });
    }
    if (f.weakEventsPerMin != null) {
      const oneCyl = f.weakPct != null && f.cylinders > 1 && Math.abs(f.weakPct - 100 / f.cylinders) < 100 / f.cylinders * 0.3;
      const extra = oneCyl ? ` Aproximadamente 1 de cada ${f.cylinders} explosiones es débil: apunta a un cilindro concreto.` : '';
      if (f.weakEventsPerMin >= LIM.weakAlert) out.push({ level: 'alerta', area: 'Fallos', text: `${f.weakEventsPerMin} explosiones débiles por minuto (${f.weakPct}%): compatible con fallos de encendido o de inyección.${extra}` });
      else if (f.weakEventsPerMin >= LIM.weakWarn) out.push({ level: 'aviso', area: 'Fallos', text: `${f.weakEventsPerMin} explosiones débiles por minuto (${f.weakPct}%).` });
    }
    if (f.hfKurtosis >= LIM.kurtAlert) out.push({ level: 'alerta', area: 'Golpeteo', text: `Golpes metálicos muy marcados en agudos (impulsividad ${f.hfKurtosis}): taqués, empujadores, cadena de distribución o picado de biela.` });
    else if (f.hfKurtosis >= LIM.kurtWarn) out.push({ level: 'aviso', area: 'Golpeteo', text: `Golpeteo apreciable en agudos (impulsividad ${f.hfKurtosis}). En diésel o con inyectores ruidosos puede ser normal: lo importante es si crece entre grabaciones.` });
    if (f.levelStdDb >= LIM.levelStdWarn) out.push({ level: 'aviso', area: 'Estabilidad', text: `El volumen oscila (±${f.levelStdDb} dB): régimen que sube y baja o ruidos ajenos durante la grabación.` });
    return out;
  }

  function nearTone(list, hz) { return (list || []).find(t => Math.abs(t.hz - hz) / hz < 0.03); }

  function compareTwo(A, B) {
    const fa = A.features, fb = B.features;
    const out = [];
    if (A.testType !== B.testType) out.push({ level: 'aviso', area: 'Método', text: `Las fichas son de pruebas distintas (${A.testType} / ${B.testType}); la comparación es solo orientativa.` });
    if (A.device && B.device && A.device !== B.device) out.push({ level: 'aviso', area: 'Método', text: 'Grabadas con dispositivos distintos: las diferencias de timbre pueden deberse al micrófono.' });

    const dl = fb.levelDb - fa.levelDb;
    if (Math.abs(dl) >= LIM.levelChange) out.push({ level: 'info', area: 'Volumen', text: `El volumen general ${dl > 0 ? 'sube' : 'baja'} ${r1(Math.abs(dl))} dB. Si la posición del móvil fue la misma, el motor ${dl > 0 ? 'suena más fuerte' : 'suena más bajo'} (escape, aislamiento, régimen).` });

    if (fa.rpm && fb.rpm) {
      const ch = (fb.rpm - fa.rpm) / fa.rpm;
      if (Math.abs(ch) >= LIM.rpmChange && A.testType === B.testType) out.push({ level: 'aviso', area: 'Régimen', text: `El régimen estimado pasa de ${fa.rpm} a ${fb.rpm} rpm (${ch > 0 ? '+' : ''}${Math.round(ch * 100)}%). En ralentí caliente debería mantenerse: revisar temperatura del motor, válvula de ralentí/mariposa o tomas de aire.` });
    } else if (fa.rpm && !fb.rpm) out.push({ level: 'aviso', area: 'Ritmo', text: 'En la ficha nueva ya no se distingue el ritmo de combustión que sí se veía antes.' });

    const deltaMetric = (name, va, vb, warn, alert, unit, fmt, explain) => {
      if (va == null || vb == null) return;
      const d = vb - va;
      if (d >= alert) out.push({ level: 'alerta', area: name, text: `${explain} (${fmt(va)} → ${fmt(vb)}${unit}).` });
      else if (d >= warn) out.push({ level: 'aviso', area: name, text: `${explain} (${fmt(va)} → ${fmt(vb)}${unit}).` });
    };
    deltaMetric('Cilindros', fa.imbalance, fb.imbalance, 0.15, 0.3, '', v => v, 'Aumenta el desequilibrio entre cilindros');
    deltaMetric('Ralentí', fa.cycleCv, fb.cycleCv, 0.08, 0.15, '%', v => Math.round(v * 100), 'Aumenta la irregularidad entre explosiones');
    deltaMetric('Fallos', fa.weakEventsPerMin, fb.weakEventsPerMin, 5, 15, '/min', v => v, 'Aumentan las explosiones débiles');
    if (fa.hfKurtosis > 0 && fb.hfKurtosis > 0) {
      const ratio = fb.hfKurtosis / fa.hfKurtosis;
      if (ratio >= 1.8) out.push({ level: 'alerta', area: 'Golpeteo', text: `Los golpes metálicos en agudos aumentan claramente (impulsividad ${fa.hfKurtosis} → ${fb.hfKurtosis}): taqués, distribución, inyectores o picado.` });
      else if (ratio >= 1.3) out.push({ level: 'aviso', area: 'Golpeteo', text: `Aumentan algo los golpes metálicos en agudos (impulsividad ${fa.hfKurtosis} → ${fb.hfKurtosis}).` });
    }
    if (fa.periodicity != null && fb.periodicity != null && fa.periodicity - fb.periodicity >= 0.2)
      out.push({ level: 'aviso', area: 'Ritmo', text: `El ritmo del motor es menos regular (${fa.periodicity} → ${fb.periodicity}).` });

    BANDS.forEach(b => {
      const d = fb.bands[b.id] - fa.bands[b.id];
      if (Math.abs(d) >= LIM.bandChange) {
        const lvl = Math.abs(d) >= LIM.bandChangeAlert && d > 0 ? 'alerta' : (d > 0 ? 'aviso' : 'info');
        out.push({ level: lvl, area: 'Timbre', text: `${b.name} (${b.lo}–${b.hi} Hz) ${d > 0 ? 'ganan' : 'pierden'} ${r1(Math.abs(d))} dB respecto al resto del sonido. Zona asociada a: ${b.desc}.` });
      }
    });

    const cc = (fb.centroidHz - fa.centroidHz) / fa.centroidHz;
    if (Math.abs(cc) >= LIM.centroidChange) out.push({ level: 'info', area: 'Timbre', text: `El sonido es más ${cc > 0 ? 'agudo/metálico' : 'grave/apagado'} (centro tonal ${fa.centroidHz} → ${fb.centroidHz} Hz).` });

    (fb.tones || []).forEach(t => {
      if (t.prom >= LIM.newTone && !nearTone(fa.tones, t.hz))
        out.push({ level: t.hz > 1500 ? 'alerta' : 'aviso', area: 'Tono nuevo', text: `Aparece un tono de ${t.hz} Hz (${t.prom} dB sobre el fondo) que no estaba antes: típico de silbido de correa, rodamiento (alternador, tensor, bomba de agua) o turbo.` });
    });
    (fa.tones || []).forEach(t => {
      if (t.prom >= LIM.newTone && !nearTone(fb.tones, t.hz))
        out.push({ level: 'info', area: 'Tono', text: `Desaparece el tono de ${t.hz} Hz que había en la ficha anterior.` });
    });
    return out;
  }

  function trend(records, key) {
    const pts = records.filter(r => r.features[key] != null).map(r => [r.km, r.features[key]]);
    if (pts.length < 3) return null;
    const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
    let sxy = 0, sxx = 0;
    pts.forEach(p => { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) ** 2; });
    if (sxx === 0) return null;
    return sxy / sxx * 10000; // cambio por cada 10.000 km
  }

  const LEVEL_ORDER = { alerta: 0, aviso: 1, info: 2 };

  function buildReport(records, vehicle) {
    const recs = records.slice().sort((a, b) => (a.km - b.km) || (a.date - b.date));
    const ref = recs[0];
    const rep = { vehicle, records: recs, generated: Date.now(), quality: [], absolute: [], pairs: [], trends: [], summary: [] };
    recs.forEach(r => {
      (r.features.quality || []).forEach(q => rep.quality.push(Object.assign({ rec: r }, q)));
      absoluteFindings(r.features).forEach(f => rep.absolute.push(Object.assign({ rec: r }, f)));
    });
    for (let i = 1; i < recs.length; i++) {
      const prev = recs[i - 1];
      rep.pairs.push({ a: prev, b: recs[i], findings: compareTwo(prev, recs[i]).sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]) });
    }
    if (recs.length > 2) {
      rep.pairs.push({ a: ref, b: recs[recs.length - 1], global: true, findings: compareTwo(ref, recs[recs.length - 1]).sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]) });
      const T = [
        ['imbalance', 'Desequilibrio de cilindros', 0.1, v => r2(v)],
        ['cycleCv', 'Irregularidad entre explosiones', 0.05, v => Math.round(v * 100) + ' pts %'],
        ['hfKurtosis', 'Impulsividad (golpeteo) en agudos', 3, v => r1(v)],
        ['rpm', 'Régimen estimado', 50, v => Math.round(v) + ' rpm']
      ];
      T.forEach(([k, name, thr, fmt]) => {
        const t = trend(recs, k);
        if (t != null && Math.abs(t) >= thr) rep.trends.push({ key: k, text: `${name}: ${t > 0 ? 'sube' : 'baja'} ${fmt(Math.abs(t))} cada 10.000 km.`, worse: t > 0 && k !== 'rpm' });
      });
    }
    // resumen
    const last = recs[recs.length - 1];
    const lastAbs = rep.absolute.filter(f => f.rec === last);
    const lastPair = rep.pairs.filter(p => !p.global).slice(-1)[0];
    const alerts = lastAbs.filter(f => f.level === 'alerta').length + (lastPair ? lastPair.findings.filter(f => f.level === 'alerta').length : 0);
    const warns = lastAbs.filter(f => f.level === 'aviso').length + (lastPair ? lastPair.findings.filter(f => f.level === 'aviso').length : 0);
    if (alerts) rep.status = 'alerta';
    else if (warns) rep.status = 'aviso';
    else rep.status = 'ok';
    rep.summary.push(
      rep.status === 'ok' ? 'No se aprecian cambios relevantes ni rasgos anómalos en la última grabación respecto a las anteriores.'
        : rep.status === 'aviso' ? `Hay ${warns} aspecto(s) a vigilar en la última grabación. Conviene repetir la grabación siguiendo el protocolo para confirmar.`
          : `Se detectan ${alerts} anomalía(s) importante(s) en la última grabación. Si se confirman al repetir la grabación, conviene revisión en taller.`
    );
    if (rep.quality.some(q => q.level === 'alerta')) rep.summary.push('Atención: alguna grabación tiene problemas de calidad que pueden falsear la comparación.');
    return rep;
  }

  function reportToText(rep, fmtDate) {
    fmtDate = fmtDate || (t => new Date(t).toLocaleDateString('es-ES'));
    const L = [];
    const tag = l => l === 'alerta' ? '[ANOMALÍA]' : l === 'aviso' ? '[VIGILAR]' : '[INFO]';
    L.push('INFORME ACÚSTICO DEL MOTOR');
    if (rep.vehicle) L.push(`Vehículo: ${rep.vehicle.name} (${rep.vehicle.cylinders} cil., ${rep.vehicle.fuel})`);
    L.push(`Generado: ${new Date(rep.generated).toLocaleString('es-ES')}`);
    L.push('');
    L.push('RESUMEN'); rep.summary.forEach(s => L.push('• ' + s)); L.push('');
    L.push('FICHAS COMPARADAS');
    rep.records.forEach(r => {
      const f = r.features;
      L.push(`• ${fmtDate(r.date)} · ${r.km.toLocaleString('es-ES')} km · ${r.testType} · Motivo: ${r.reason}`);
      L.push(`   rpm≈${f.rpm ?? '—'} · nivel ${f.levelDb} dBFS · regularidad ${f.periodicity ?? '—'} · desequilibrio ${f.imbalance ?? '—'} · impulsividad ${f.hfKurtosis}`);
    });
    L.push('');
    rep.pairs.forEach(p => {
      L.push(p.global ? `EVOLUCIÓN TOTAL ${p.a.km.toLocaleString('es-ES')} km → ${p.b.km.toLocaleString('es-ES')} km` : `DIFERENCIAS ${p.a.km.toLocaleString('es-ES')} km → ${p.b.km.toLocaleString('es-ES')} km`);
      if (!p.findings.length) L.push('• Sin diferencias relevantes.');
      p.findings.forEach(f => L.push(`• ${tag(f.level)} ${f.area}: ${f.text}`));
      L.push('');
    });
    if (rep.trends.length) { L.push('TENDENCIAS'); rep.trends.forEach(t => L.push('• ' + t.text)); L.push(''); }
    L.push('RASGOS ANÓMALOS EN CADA GRABACIÓN');
    if (!rep.absolute.length) L.push('• Ninguno.');
    rep.absolute.forEach(f => L.push(`• ${tag(f.level)} ${f.rec.km.toLocaleString('es-ES')} km · ${f.area}: ${f.text}`));
    if (rep.quality.length) { L.push(''); L.push('CALIDAD DE GRABACIÓN'); rep.quality.forEach(q => L.push(`• ${q.rec.km.toLocaleString('es-ES')} km: ${q.text}`)); }
    L.push('');
    L.push('Este informe es orientativo y se basa solo en el sonido; no sustituye el diagnóstico de un mecánico.');
    return L.join('\n');
  }

  const EM = { analyze, absoluteFindings, compareTwo, buildReport, reportToText, BANDS, LIM };
  if (typeof module !== 'undefined' && module.exports) module.exports = EM;
  else root.EM = EM;
})(typeof window !== 'undefined' ? window : globalThis);
