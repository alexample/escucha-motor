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

  function biquadLowpass(x, sr, fc) {
    const w0 = 2 * Math.PI * fc / sr, q = Math.SQRT1_2;
    const alpha = Math.sin(w0) / (2 * q), cw = Math.cos(w0);
    const a0 = 1 + alpha;
    const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, b2 = b0;
    const a1 = -2 * cw / a0, a2 = (1 - alpha) / a0;
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  // filtro paso banda de 4º orden (dos pasadas de cada)
  function bandpass(x, sr, lo, hi) {
    let y = biquadHighpass(x, sr, lo); y = biquadHighpass(y, sr, lo);
    y = biquadLowpass(y, sr, hi); return biquadLowpass(y, sr, hi);
  }
  // envolvente RMS muestreada a ~1 kHz
  function envelope(x, sr) {
    const ehop = Math.round(sr / 1000), ewin = ehop * 2, env = [];
    for (let i = 0; i + ewin <= x.length; i += ehop) {
      let s = 0; for (let k = i; k < i + ewin; k++) s += x[k] * x[k];
      env.push(Math.sqrt(s / ewin));
    }
    return { env, es: sr / ehop };
  }
  // amplitud del espectro de la envolvente cerca de unas frecuencias
  function envPeaks(env, es) {
    const m = mean(env), n = env.length;
    const L2 = 1 << Math.ceil(Math.log2(Math.max(n, 2048)));
    const er = new Float64Array(L2), ei = new Float64Array(L2);
    for (let i = 0; i < n; i++) er[i] = (env[i] - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    fft(er, ei);
    return f => { const k = Math.round(f * L2 / es); let mx = 0; for (let j = k - 2; j <= k + 2; j++) if (j > 0 && j < L2 / 2) mx = Math.max(mx, Math.hypot(er[j], ei[j])); return mx; };
  }
  function windowKurtosis(y, sr) {
    const wl = sr, ks = [];
    for (let s0 = 0; s0 + wl <= y.length; s0 += wl) {
      let m2 = 0, m4 = 0;
      for (let i = s0; i < s0 + wl; i++) { const v2 = y[i] * y[i]; m2 += v2; m4 += v2 * v2; }
      m2 /= wl; m4 /= wl; ks.push(m4 / Math.max(m2 * m2, 1e-30));
    }
    return ks.length ? median(ks) : null;
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
    const res = { version: 4, sampleRate: sr, duration: r1(dur), cylinders: cylinders, quality: [] };
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
    { // planitud en 3–8 kHz: alta = siseo de ruido (aire, gases); baja = tonos o golpes
      let l2 = 0, a2 = 0, c2 = 0;
      for (let k = Math.ceil(3000 / df); k < psd.length && k * df <= Math.min(8000, nyq * 0.9); k++) { l2 += Math.log(psd[k] + 1e-20); a2 += psd[k]; c2++; }
      res.hissFlatness = c2 ? r2(Math.exp(l2 / c2) / (a2 / c2)) : null;
    }

    // espectro reducido para gráficas (puntos logarítmicos 30 Hz – 16 kHz)
    const pts = 96, fmin = 30, fmax = Math.min(16000, nyq * 0.98);
    res.spectrum = [];
    for (let i = 0; i < pts; i++) {
      const fa = fmin * Math.pow(fmax / fmin, i / pts), fb = fmin * Math.pow(fmax / fmin, (i + 1) / pts);
      let e = 0, c = 0;
      for (let k = Math.floor(fa / df); k <= Math.ceil(fb / df) && k < psd.length; k++) { e += psd[k]; c++; }
      res.spectrum.push([Math.round(Math.sqrt(fa * fb)), r1(db(e / Math.max(c, 1)) - db(total / psd.length))]);
    }

    // ancho de banda útil: un corte brusco indica grabación procesada (modo llamada) o de baja calidad
    let cliff = null;
    for (let i = 0; i + 3 < res.spectrum.length; i++) {
      if (res.spectrum[i][1] - res.spectrum[i + 3][1] >= 25 && res.spectrum[i][0] < 0.8 * nyq) { cliff = res.spectrum[i][0]; break; }
    }
    res.bandwidthHz = Math.round(cliff || Math.min(16000, nyq));
    if (res.bandwidthHz < 7000) res.quality.push({ level: 'alerta', text: `Sonido recortado por encima de ${res.bandwidthHz} Hz: el móvil ha grabado en modo llamada o con filtros. Los agudos (golpeteos, silbidos) no se pueden analizar.` });

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
      if (ac[L] > ac[L - 1] && ac[L] >= ac[L + 1] && ac[L] >= 0.5 * best && Math.abs(bestL / L - Math.round(bestL / L)) < 0.12) { bestL = L; best = ac[L]; break; }
    }
    // un golpe una vez por vuelta puede dominar el ritmo: un ralentí por debajo de 550 rpm es improbable
    if (bestL > 0 && es / bestL * 120 / cylinders < 550) {
      const h = bestL / 2;
      let hb = -1, hl = 0;
      for (let L = Math.max(lagMin, Math.floor(h * 0.85)); L <= Math.ceil(h * 1.15); L++) if (ac[L] > ac[L - 1] && ac[L] >= ac[L + 1] && ac[L] > hb) { hb = ac[L]; hl = L; }
      if (hl && hb >= 0.2) { bestL = hl; best = Math.max(hb, best * 0.8); }
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
      res.cycleCv = r2(1.4826 * median(cyc.map(v => Math.abs(v - md))) / Math.max(md, 1e-20));
      const weak = cyc.filter(v => v < 0.45 * md).length;
      res.weakEventsPerMin = r1(weak / dur * 60);
      res.weakPct = r1(100 * weak / Math.max(cyc.length, 1));
    } else {
      res.firingHz = null; res.rpm = null; res.imbalance = null; res.cycleCv = null; res.weakEventsPerMin = null; res.weakPct = null;
      res.quality.push({ level: 'aviso', text: 'No se detecta un ritmo de combustión claro (ruido ambiente, viento o micrófono mal orientado).' });
    }

    // impulsividad en agudos (golpeteos, taqués, picado)
    const hp = biquadHighpass(x, sr, Math.min(2000, nyq * 0.4));
    const wl = sr, ks = [], cs = [];
    for (let s0 = 0; s0 + wl <= N; s0 += wl) {
      let m2 = 0, m4 = 0, pk = 0;
      for (let i = s0; i < s0 + wl; i++) { const v = hp[i]; const v2 = v * v; m2 += v2; m4 += v2 * v2; if (Math.abs(v) > pk) pk = Math.abs(v); }
      m2 /= wl; m4 /= wl;
      ks.push(m4 / Math.max(m2 * m2, 1e-30)); cs.push(pk / Math.sqrt(Math.max(m2, 1e-30)));
    }
    res.hfKurtosis = ks.length ? r1(median(ks)) : null;
    res.hfCrest = cs.length ? r1(median(cs)) : null;
    const HF_REF = { 1: 36, 2: 22, 3: 22, 4: 15.6, 5: 12.5, 6: 12, 8: 9.8 };
    res.hfRef = HF_REF[cylinders] || (cylinders > 8 ? 9 : 15.6);
    res.hfRatio = res.hfKurtosis != null ? r2(res.hfKurtosis / res.hfRef) : null;

    // ---- detectores específicos de averías ----
    res.hfImbalance = null; res.rotKnock = null; res.lfKurtosis = null; res.rpmHuntPct = null;
    const lf = bandpass(x, sr, 100, 1000);
    res.lfKurtosis = r1(windowKurtosis(lf, sr));
    // con pocos cilindros los graves son golpes por naturaleza: valor de referencia de un motor sano
    const LF_REF = { 1: 21, 2: 12.5, 3: 12.5, 4: 8.8, 5: 7, 6: 6.6, 8: 5.4 };
    res.lfRef = LF_REF[cylinders] || (cylinders > 8 ? 5 : 8.8);
    res.lfRatio = res.lfKurtosis != null ? r2(res.lfKurtosis / res.lfRef) : null;
    if (res.firingHz) {
      const fF = res.firingHz, fCyc = fF / cylinders;
      // ruido agudo que se repite una vez por ciclo: viene de un solo cilindro (taqué, válvula, inyector, junta de inyector)
      if (cylinders > 1 && nyq > 4000) {
        const hb = envelope(bandpass(x, sr, 2000, Math.min(8000, nyq * 0.8)), sr);
        const pk = envPeaks(hb.env, hb.es);
        let sub = 0; for (let h = 1; h < cylinders; h++) sub += pk(fCyc * h);
        res.hfImbalance = r2(sub / (cylinders - 1) / Math.max(pk(fF), 1e-12));
      }
      // golpe grave una vez por vuelta del cigüeñal (bielas, bancada, polea)
      if (cylinders >= 3) {
        const lb = envelope(lf, sr);
        const pk = envPeaks(lb.env, lb.es);
        res.rotKnock = r2(pk(fF * 2 / cylinders) / Math.max(pk(fF), 1e-12));
      }
      // oscilación del ralentí: rpm en ventanas de 2 s
      const win = Math.round(2 * es), hopw = Math.round(es), P = es / fF, rpms = [];
      for (let s0 = 0; s0 + win <= env.length; s0 += hopw) {
        const seg = env.slice(s0, s0 + win), sm = mean(seg), sg = seg.map(v => v - sm);
        let b0 = 0; for (const v of sg) b0 += v * v;
        const acw = L => { let acc = 0; for (let i = 0; i + L < sg.length; i++) acc += sg[i] * sg[i + L]; return acc / Math.max(b0, 1e-20); };
        let bv = -1, bl = 0;
        for (let L = Math.floor(P * 0.8); L <= Math.ceil(P * 1.25); L++) { const a = acw(L); if (a > bv) { bv = a; bl = L; } }
        if (bv > 0.2 && bl > 1) {
          const a = acw(bl - 1), c = acw(bl + 1), den = a - 2 * bv + c;
          const lag = bl + (den !== 0 ? 0.5 * (a - c) / den : 0);
          rpms.push(es / lag * 120 / cylinders);
        }
      }
      if (rpms.length >= 4) res.rpmHuntPct = r1(100 * std(rpms) / mean(rpms));
    }

    // ¿se puede diagnosticar con esta grabación?
    res.reliable = !(res.levelDb < -55 || res.clipPct > 0.5 || res.bandwidthHz < 7000 || dur < 4);
    if (res.levelDb < -55) res.quality = res.quality.map(q => q.text.startsWith('Nivel muy bajo') ? Object.assign(q, { level: 'alerta' }) : q);
    return res;
  }

  // ---------- criterios ----------
  const LIM = {
    periodicityLow: 0.35,
    imbalanceWarn: 0.2, imbalanceAlert: 0.35,
    cycleCvWarn: 0.28, cycleCvAlert: 0.35,
    weakWarn: 6, weakAlert: 20,
    kurtWarn: 25, kurtAlert: 45,
    levelStdWarn: 1.5,
    rpmChange: 0.1,
    bandChange: 4, bandChangeAlert: 7,
    levelChange: 4,
    centroidChange: 0.2,
    newTone: 15
  };

  const UNRELIABLE = { level: 'aviso', area: 'Fiabilidad', text: 'Esta grabación no tiene calidad suficiente: los indicadores no son fiables y no se emite diagnóstico. Repite la grabación siguiendo la guía.' };

  function absoluteFindings(f) {
    if (f.reliable === false) return [Object.assign({}, UNRELIABLE)];
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
    if (f.hfRatio != null && f.hfRatio >= LIM.kurtAlert / 15.6) out.push({ level: 'alerta', area: 'Golpeteo', text: `Golpes metálicos muy marcados en agudos (impulsividad ${f.hfKurtosis}): taqués, empujadores, cadena de distribución o picado de biela.` });
    else if (f.hfRatio != null && f.hfRatio >= LIM.kurtWarn / 15.6) out.push({ level: 'aviso', area: 'Golpeteo', text: `Golpeteo apreciable en agudos (impulsividad ${f.hfKurtosis}). En diésel o con inyectores ruidosos puede ser normal: lo importante es si crece entre grabaciones.` });
    if (f.hfImbalance != null && f.hfImbalance >= 0.08 && (f.imbalance == null || f.imbalance < 0.2))
      out.push({ level: f.hfImbalance >= 0.15 ? 'alerta' : 'aviso', area: 'Un cilindro', text: `Ruido agudo que se repite una vez por ciclo (índice ${f.hfImbalance}): sale de un solo cilindro. Típico de un taqué o una válvula, un inyector o su junta, o una fuga en el colector de escape.` });
    const rodLike = f.rotKnock != null && f.rotKnock >= 0.3 && f.rotKnock >= 2 * (f.imbalance || 0) && f.lfRatio >= 1.4;
    if (rodLike) out.push({ level: 'alerta', area: 'Golpe grave', text: `Golpe grave que se repite una vez por vuelta del cigüeñal (índice ${f.rotKnock}) con graves impulsivos: compatible con biela o bancada. Comprueba el nivel de aceite y evita forzar el motor hasta revisarlo.` });
    else if (f.lfRatio != null && f.lfRatio >= 1.4 && (f.imbalance == null || f.imbalance < 0.2)) out.push({ level: 'aviso', area: 'Golpes graves', text: `Golpes en graves (impulsividad ${f.lfKurtosis}, normal ≈ ${f.lfRef} con ${f.cylinders} cilindros): volante bimasa, soportes, polea del cigüeñal o, en frío, cacheteo de pistón.` });
    if (f.rpmHuntPct != null && f.rpmHuntPct >= 1.5) out.push({ level: f.rpmHuntPct >= 3 ? 'alerta' : 'aviso', area: 'Ralentí oscila', text: `El ralentí sube y baja ±${f.rpmHuntPct}%: toma de aire, mariposa o válvula de ralentí sucia, o sensor de temperatura.` });
    if (f.levelStdDb >= LIM.levelStdWarn) out.push({ level: 'aviso', area: 'Estabilidad', text: `El volumen oscila (±${f.levelStdDb} dB): régimen que sube y baja o ruidos ajenos durante la grabación.` });
    return out;
  }

  function nearTone(list, hz) { return (list || []).find(t => Math.abs(t.hz - hz) / hz < 0.03); }

  function compareTwo(A, B) {
    const fa = A.features, fb = B.features;
    const out = [];
    if (fa.reliable === false || fb.reliable === false) {
      out.push({ level: 'aviso', area: 'Fiabilidad', text: `La ficha de ${(fa.reliable === false ? A : B).km.toLocaleString('es-ES')} km no tiene calidad suficiente, así que no se sacan conclusiones de esta comparación. Las diferencias de frecuencia se muestran solo como referencia.` });
      return out;
    }
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
    deltaMetric('Un cilindro', fa.hfImbalance, fb.hfImbalance, 0.06, 0.12, '', v => v, 'Aumenta el ruido agudo de un solo cilindro (taqué, válvula, inyector)');
    deltaMetric('Golpe grave', fa.rotKnock, fb.rotKnock, 0.15, 0.3, '', v => v, 'Aumenta el golpe grave una vez por vuelta (biela, bancada, polea)');
    deltaMetric('Ralentí oscila', fa.rpmHuntPct, fb.rpmHuntPct, 1.5, 3, '%', v => v, 'El ralentí oscila más');
    if (fa.lfKurtosis > 0 && fb.lfKurtosis > 0 && fb.lfKurtosis / fa.lfKurtosis >= 1.4)
      out.push({ level: fb.lfKurtosis / fa.lfKurtosis >= 2 ? 'alerta' : 'aviso', area: 'Golpes graves', text: `Aumentan los golpes en graves (impulsividad ${fa.lfKurtosis} → ${fb.lfKurtosis}).` });
    if (fa.hissFlatness != null && fb.hissFlatness != null && fb.hissFlatness - fa.hissFlatness >= 0.04 && (fb.bands.b5 - fa.bands.b5 >= 3 || fb.bands.b6 - fa.bands.b6 >= 3))
      out.push({ level: 'aviso', area: 'Siseo', text: 'Aparece más siseo de aire o gases en agudos: toma de aire, fuga de escape o manguito del turbo.' });
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

    const within = (list, hz, tol) => (list || []).find(u => Math.abs(u.hz - hz) / hz <= tol);
    (fb.tones || []).forEach(t => {
      if (nearTone(fa.tones, t.hz)) return;
      const moved = within(fa.tones, t.hz, 0.1);
      if (moved) out.push({ level: 'aviso', area: 'Tono desplazado', text: `El tono de ${moved.hz} Hz pasa a ${t.hz} Hz (${t.hz > moved.hz ? '+' : ''}${Math.round(1000 * (t.hz - moved.hz) / moved.hz) / 10}%). Si no se explica por un cambio de rpm, puede ser una correa o un rodamiento que cambia.` });
      else if (t.prom >= LIM.newTone) out.push({ level: t.hz > 1500 ? 'alerta' : 'aviso', area: 'Tono nuevo', text: `Aparece un tono de ${t.hz} Hz (${t.prom} dB sobre el fondo) que no estaba antes: típico de silbido de correa, rodamiento (alternador, tensor, bomba de agua) o turbo.` });
    });
    (fa.tones || []).forEach(t => {
      if (t.prom >= LIM.newTone && !nearTone(fb.tones, t.hz) && !within(fb.tones, t.hz, 0.1))
        out.push({ level: 'info', area: 'Tono', text: `Desaparece el tono de ${t.hz} Hz que había en la ficha anterior.` });
    });
    return out;
  }

  // ---------- diferencias de frecuencia entre dos fichas ----------
  function interpSpec(spec, f) {
    if (f <= spec[0][0]) return spec[0][1];
    for (let i = 1; i < spec.length; i++) {
      if (spec[i][0] >= f) {
        const a = spec[i - 1], b = spec[i];
        const t = Math.log(f / a[0]) / Math.log(b[0] / a[0]);
        return a[1] + t * (b[1] - a[1]);
      }
    }
    return null; // fuera de rango
  }
  const fmtHz = f => f >= 10000 ? String(r1(f / 1000)).replace('.', ',') + ' kHz' : Math.round(f).toLocaleString('es-ES') + ' Hz';
  const cm = v => String(v).replace('.', ',');

  function freqDiff(fa, fb) {
    const out = { bands: [], diff: [], zones: [], tones: [] };
    // ritmo de combustión (frecuencia fundamental del motor)
    if (fa.firingHz && fb.firingHz) {
      out.firing = { a: fa.firingHz, b: fb.firingHz, rpmA: fa.rpm, rpmB: fb.rpm, d: r1(fb.firingHz - fa.firingHz), pct: r1(100 * (fb.firingHz - fa.firingHz) / fa.firingHz) };
    }
    out.centroid = { a: fa.centroidHz, b: fb.centroidHz, d: fb.centroidHz - fa.centroidHz, pct: r1(100 * (fb.centroidHz - fa.centroidHz) / fa.centroidHz) };
    BANDS.forEach(b => out.bands.push({ name: b.name, lo: b.lo, hi: b.hi, a: fa.bands[b.id], b: fb.bands[b.id], d: r1(fb.bands[b.id] - fa.bands[b.id]) }));
    // curva de diferencia (B − A) sobre la rejilla de A
    fa.spectrum.forEach(p => {
      const vb = interpSpec(fb.spectrum, p[0]);
      if (vb != null) out.diff.push([p[0], r1(vb - p[1])]);
    });
    // zonas con cambios >= 3 dB
    let cur = null;
    const close = () => { if (cur && cur.n >= 2) out.zones.push(cur); cur = null; };
    out.diff.forEach(([f, d]) => {
      const sign = d >= 3 ? 1 : d <= -3 ? -1 : 0;
      if (!sign) { close(); return; }
      if (cur && cur.sign === sign) { cur.hi = f; cur.sum += d; cur.n++; if (Math.abs(d) > Math.abs(cur.max)) { cur.max = d; cur.at = f; } }
      else { close(); cur = { sign, lo: f, hi: f, sum: d, n: 1, max: d, at: f }; }
    });
    close();
    out.zones = out.zones.map(z => ({ lo: z.lo, hi: z.hi, avg: r1(z.sum / z.n), max: r1(z.max), at: z.at, text: `${fmtHz(z.lo)} – ${fmtHz(z.hi)}: ${z.sign > 0 ? 'sube' : 'baja'} de media ${cm(r1(Math.abs(z.sum / z.n)))} dB (máx. ${cm(r1(Math.abs(z.max)))} dB en ${fmtHz(z.at)})` }))
      .sort((x, y) => Math.abs(y.max) - Math.abs(x.max)).slice(0, 6);
    // tonos: se mantienen, se desplazan, aparecen o desaparecen
    const ta = fa.tones || [], tb = fb.tones || [];
    const used = new Set();
    tb.forEach(t => {
      let best = null, bd = Infinity;
      ta.forEach((u, i) => { const d = Math.abs(u.hz - t.hz) / t.hz; if (d < bd && !used.has(i)) { bd = d; best = i; } });
      if (best != null && bd <= 0.1) {
        used.add(best);
        const u = ta[best];
        const dHz = t.hz - u.hz, dp = r1(t.prom - u.prom);
        if (bd >= 0.015) out.tones.push({ kind: 'desplazado', a: u.hz, b: t.hz, text: `Tono desplazado: ${fmtHz(u.hz)} → ${fmtHz(t.hz)} (${dHz > 0 ? '+' : ''}${dHz} Hz, ${dHz > 0 ? '+' : ''}${cm(r1(100 * dHz / u.hz))}%). Si gira con el motor, sigue a las rpm; si no, puede ser un rodamiento o una correa que cambia de tensión.` });
        else out.tones.push({ kind: 'igual', a: u.hz, b: t.hz, text: `Tono de ${fmtHz(t.hz)} se mantiene (${dp >= 0 ? '+' : ''}${cm(dp)} dB de intensidad).` });
      } else out.tones.push({ kind: 'nuevo', b: t.hz, text: `Tono nuevo de ${fmtHz(t.hz)} (${cm(t.prom)} dB sobre el fondo).` });
    });
    ta.forEach((u, i) => { if (!used.has(i)) out.tones.push({ kind: 'desaparece', a: u.hz, text: `Desaparece el tono de ${fmtHz(u.hz)}.` }); });
    return out;
  }

  function freqDiffText(fd) {
    const L = [];
    if (fd.firing) L.push(`• Frecuencia de encendido: ${cm(fd.firing.a)} → ${cm(fd.firing.b)} Hz (${fd.firing.d >= 0 ? '+' : ''}${cm(fd.firing.d)} Hz, ${fd.firing.pct >= 0 ? '+' : ''}${cm(fd.firing.pct)}%; ≈${fd.firing.rpmA} → ${fd.firing.rpmB} rpm).`);
    L.push(`• Centro tonal: ${fd.centroid.a} → ${fd.centroid.b} Hz (${fd.centroid.d >= 0 ? '+' : ''}${fd.centroid.d} Hz).`);
    L.push('• Bandas (dB relativos, antes → después = cambio):');
    fd.bands.forEach(b => L.push(`   ${b.name} ${b.lo}–${b.hi} Hz: ${cm(b.a)} → ${cm(b.b)} = ${b.d >= 0 ? '+' : ''}${cm(b.d)} dB`));
    if (fd.zones.length) { L.push('• Zonas del espectro que más cambian:'); fd.zones.forEach(z => L.push('   ' + z.text)); }
    else L.push('• Ninguna zona del espectro cambia 3 dB o más.');
    if (fd.tones.length) { L.push('• Tonos:'); fd.tones.forEach(t => L.push('   ' + t.text)); }
    return L;
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
      rep.pairs.push({ a: prev, b: recs[i], freq: freqDiff(prev.features, recs[i].features), findings: compareTwo(prev, recs[i]).sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]) });
    }
    if (recs.length > 2) {
      rep.pairs.push({ a: ref, b: recs[recs.length - 1], global: true, freq: freqDiff(ref.features, recs[recs.length - 1].features), findings: compareTwo(ref, recs[recs.length - 1]).sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]) });
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
    if (root.Faults) {
      const prevSame = recs.slice(0, -1).reverse().find(r => r.testType === last.testType);
      rep.causes = root.Faults.diagnose(last.features, prevSame ? prevSame.features : null, { fuel: vehicle && vehicle.fuel, testType: last.testType });
    }
    const lastAbs = rep.absolute.filter(f => f.rec === last);
    const lastPair = rep.pairs.filter(p => !p.global).slice(-1)[0];
    const alerts = lastAbs.filter(f => f.level === 'alerta').length + (lastPair ? lastPair.findings.filter(f => f.level === 'alerta').length : 0);
    const warns = lastAbs.filter(f => f.level === 'aviso').length + (lastPair ? lastPair.findings.filter(f => f.level === 'aviso').length : 0);
    if (last.features.reliable === false) {
      rep.status = 'aviso';
      rep.summary.push('La última grabación no tiene calidad suficiente para emitir un diagnóstico. Repítela siguiendo la guía (móvil debajo del motor, sin funda).');
      return rep;
    }
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
      if (p.freq) { L.push('  Diferencias de frecuencia:'); freqDiffText(p.freq).forEach(x => L.push('  ' + x)); }
      L.push('');
    });
    if (rep.trends.length) { L.push('TENDENCIAS'); rep.trends.forEach(t => L.push('• ' + t.text)); L.push(''); }
    if (rep.causes) {
      L.push('POSIBLES AVERÍAS (última ficha, orientativo)');
      if (!rep.causes.length) L.push('• Ninguna avería del catálogo encaja con el sonido.');
      rep.causes.forEach(c => L.push(`• ${root.Faults.likelihood(c.score)}: ${c.name} (${c.sys}; urgencia ${c.urg}). Indicios: ${c.ev.join('; ')}.`));
      L.push('');
    }
    L.push('RASGOS ANÓMALOS EN CADA GRABACIÓN');
    if (!rep.absolute.length) L.push('• Ninguno.');
    rep.absolute.forEach(f => L.push(`• ${tag(f.level)} ${f.rec.km.toLocaleString('es-ES')} km · ${f.area}: ${f.text}`));
    if (rep.quality.length) { L.push(''); L.push('CALIDAD DE GRABACIÓN'); rep.quality.forEach(q => L.push(`• ${q.rec.km.toLocaleString('es-ES')} km: ${q.text}`)); }
    L.push('');
    L.push('Este informe es orientativo y se basa solo en el sonido; no sustituye el diagnóstico de un mecánico.');
    return L.join('\n');
  }

  const EM = { analyze, absoluteFindings, compareTwo, freqDiff, buildReport, reportToText, BANDS, LIM, fft, bandpass };
  if (typeof module !== 'undefined' && module.exports) module.exports = EM;
  else root.EM = EM;
})(typeof window !== 'undefined' ? window : globalThis);
