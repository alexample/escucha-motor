/* Escucha Motor — aislar el sonido anómalo.
 *  - subtractReference: resta la «huella» espectral de una ficha de referencia (lo nuevo).
 *  - syncResidual: resta la explosión típica del motor (lo que no es igual en todos los cilindros).
 *  - band: deja solo una banda de frecuencias.
 */
(function (root) {
  'use strict';
  const EM = root.EM;
  const N = 2048, HOP = 512;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); // raíz de Hann periódica

  function meanPower(x) {
    const P = new Float64Array(N / 2 + 1), re = new Float64Array(N), im = new Float64Array(N);
    let frames = 0;
    for (let s = 0; s + N <= x.length; s += HOP * 2) {
      for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
      EM.fft(re, im);
      for (let k = 0; k <= N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
      frames++;
    }
    for (let k = 0; k <= N / 2; k++) P[k] /= Math.max(frames, 1);
    return P;
  }
  const median = a => { const b = Array.from(a).sort((p, q) => p - q); return b[b.length >> 1]; };

  // Filtro de Wiener «decision-directed» frente a la huella de una ficha de referencia (motor sano).
  // Menos «ruido musical» que la resta espectral simple.
  function subtractReference(x, sr, ref, refSr, opts) {
    const alpha = (opts && opts.alpha) || 2, floor = 0.04, a = 0.96;
    const Pr0 = meanPower(ref), Px = meanPower(x);
    const Pr = new Float64Array(N / 2 + 1);
    for (let k = 0; k <= N / 2; k++) {
      const kr = k * sr / N * N / refSr, k0 = Math.floor(kr), t = kr - k0;
      Pr[k] = k0 + 1 <= N / 2 ? Pr0[k0] * (1 - t) + Pr0[k0 + 1] * t : 1e-20;
    }
    // igualar niveles (la posición del móvil cambia el volumen): mediana de la relación en 200–4000 Hz
    const ratios = [];
    for (let k = Math.ceil(200 * N / sr); k <= Math.floor(4000 * N / sr) && k <= N / 2; k++) ratios.push(Px[k] / Math.max(Pr[k], 1e-20));
    const g = median(ratios) * alpha;
    // huella suavizada en frecuencia (±2 bandas) para no depender de picos sueltos
    const Ps = new Float64Array(N / 2 + 1);
    for (let k = 0; k <= N / 2; k++) { let s = 0, c = 0; for (let j = Math.max(0, k - 2); j <= Math.min(N / 2, k + 2); j++) { s += Pr[j]; c++; } Ps[k] = s / c * g; }

    const out = new Float32Array(x.length), re = new Float64Array(N), im = new Float64Array(N);
    const Gp = new Float64Array(N / 2 + 1).fill(1), gp = new Float64Array(N / 2 + 1).fill(1);
    for (let s0 = 0; s0 + N <= x.length; s0 += HOP) {
      for (let i = 0; i < N; i++) { re[i] = x[s0 + i] * win[i]; im[i] = 0; }
      EM.fft(re, im);
      for (let k = 0; k <= N / 2; k++) {
        const p = re[k] * re[k] + im[k] * im[k];
        const gam = p / Math.max(Ps[k], 1e-20);                      // SNR a posteriori
        const xi = a * Gp[k] * Gp[k] * gp[k] + (1 - a) * Math.max(gam - 1, 0); // SNR a priori
        const G = Math.max(floor, xi / (1 + xi));
        Gp[k] = G; gp[k] = gam;
        re[k] *= G; im[k] *= G;
        if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
      }
      for (let i = 0; i < N; i++) im[i] = -im[i];
      EM.fft(re, im);
      for (let i = 0; i < N; i++) out[s0 + i] += re[i] / N * win[i] / 2;
    }
    return out;
  }

  // Localiza cada explosión siguiendo las pequeñas variaciones de régimen (dos pasadas de alineación).
  function trackEvents(x, sr, firingHz) {
    const P = sr / firingHz, L = Math.floor(P), srch = Math.max(2, Math.round(P * 0.08)), n = x.length;
    const T = new Float64Array(L);
    let cnt = 0;
    for (let s = 0; s + L <= n && cnt < 30; s = Math.round((cnt + 1) * P)) { for (let i = 0; i < L; i++) T[i] += x[s + i]; cnt++; }
    for (let i = 0; i < L; i++) T[i] /= Math.max(cnt, 1);
    const align = tpl => {
      const st = []; let s = 0;
      while (s + L + srch <= n) {
        let best = -Infinity, bo = 0;
        for (let o = -srch; o <= srch; o++) {
          const a = s + o; if (a < 0 || a + L > n) continue;
          let acc = 0; for (let i = 0; i < L; i += 3) acc += x[a + i] * tpl[i];
          if (acc > best) { best = acc; bo = o; }
        }
        const a = Math.max(0, s + bo); st.push(a); s = Math.round(a + P);
      }
      return st;
    };
    let starts = align(T);
    const T2 = new Float64Array(L);
    starts.forEach(a => { for (let i = 0; i < L; i++) T2[i] += x[a + i]; });
    for (let i = 0; i < L; i++) T2[i] /= Math.max(starts.length, 1);
    starts = align(T2);
    return { starts, P, L };
  }

  // Promedio síncrono con seguimiento de orden: cada explosión se «estira» a la misma longitud
  // (dominio de ángulo del cigüeñal) antes de promediar, así las variaciones de rpm no dejan restos.
  //  mode 'cyl'     → lo que distingue a cada cilindro (tics, golpes, cilindro débil)
  //  mode 'nonsync' → todo lo que NO va al ritmo del motor (accesorios, turbo, siseos, traqueteos)
  // Graves (<1 kHz): se promedia la forma de onda. Agudos (>1 kHz): se promedia la ENERGÍA y se usa
  // como máscara sobre el sonido real, porque un desfase mínimo cancelaría un tic agudo al promediar.
  function syncResidual(x, sr, firingHz, cylinders, mode) {
    cylinders = Math.max(1, cylinders || 4);
    if (mode === 'irregular') mode = 'nonsync';
    const { starts, P } = trackEvents(x, sr, firingHz);
    const L = Math.round(P), n = x.length, K = starts.length - 1;
    const out = new Float32Array(n);
    if (K < cylinders * 2) return { pcm: out, hfShare: null, lfShare: null };
    const lo = EM.bandpass(x, sr, 20, 1000);
    const hi = EM.bandpass(x, sr, 1000, Math.min(14000, sr * 0.45));
    // energía de los agudos suavizada (~1 ms)
    const w = Math.max(8, Math.round(sr / 1000)), en = new Float64Array(n);
    { let acc = 0; for (let i = 0; i < n; i++) { acc += hi[i] * hi[i]; if (i >= w) acc -= hi[i - w] * hi[i - w]; en[Math.max(0, i - (w >> 1))] = acc / w; } }
    const resample = (sig, k) => {
      const a = starts[k], len = starts[k + 1] - a, r = new Float64Array(L);
      for (let i = 0; i < L; i++) { const pos = a + i * len / L, p0 = Math.floor(pos), t = pos - p0; r[i] = sig[p0] * (1 - t) + (sig[p0 + 1] || 0) * t; }
      return r;
    };
    const mk = () => { const a = []; for (let c = 0; c < cylinders; c++) a.push(new Float64Array(L)); return a; };
    const Gl = new Float64Array(L), Cl = mk(), Ge = new Float64Array(L), Ce = mk(), cnt = new Array(cylinders).fill(0);
    const segL = [], segE = [];
    for (let k = 0; k < K; k++) {
      const rl = resample(lo, k), re_ = resample(en, k), c = k % cylinders;
      segL.push(rl); segE.push(re_); cnt[c]++;
      for (let i = 0; i < L; i++) { Gl[i] += rl[i]; Cl[c][i] += rl[i]; Ge[i] += re_[i]; Ce[c][i] += re_[i]; }
    }
    for (let i = 0; i < L; i++) { Gl[i] /= K; Ge[i] /= K; }
    for (let c = 0; c < cylinders; c++) for (let i = 0; i < L; i++) { Cl[c][i] /= Math.max(cnt[c], 1); Ce[c][i] /= Math.max(cnt[c], 1); }
    // cuánto de lo «propio» se concentra en un único cilindro (en agudos y en graves)
    const share = arr => { const T = arr.reduce((p, q) => p + q, 0); return T > 0 ? Math.round(Math.max(...arr) / T * 100) / 100 : null; };
    const hfShare = share(Ce.map(t => { let v = 0; for (let i = 0; i < L; i++) v += Math.max(0, t[i] - Ge[i]); return v; }));
    const lfShare = share(Cl.map(t => { let v = 0; for (let i = 0; i < L; i++) v += (t[i] - Gl[i]) ** 2; return v; }));
    for (let k = 0; k < K; k++) {
      const a = starts[k], len = starts[k + 1] - a, c = k % cylinders, rl = segL[k], reE = segE[k];
      for (let j = 0; j < len; j++) {
        const pos = j * L / len, p0 = Math.min(L - 1, Math.floor(pos)), t = pos - p0, p1 = Math.min(L - 1, p0 + 1);
        const I = (A, B) => (A[p0] - B[p0]) * (1 - t) + (A[p1] - B[p1]) * t;
        const iv = A => A[p0] * (1 - t) + A[p1] * t;
        let vLow, gain;
        if (mode === 'cyl') {
          vLow = I(Cl[c], Gl);                                            // forma media propia del cilindro
          const ec = iv(Ce[c]), eg = iv(Ge);
          gain = ec > 0 ? Math.max(0, 1 - eg / ec) : 0;                    // agudos que este cilindro tiene de más
        } else {
          vLow = I(rl, Cl[c]);                                            // lo que se sale de la media
          const eNow = iv(reE), ec = iv(Ce[c]);
          gain = eNow > 0 ? Math.max(0, 1 - 1.5 * ec / eNow) : 0;          // agudos por encima de lo habitual en ese punto del ciclo
        }
        out[a + j] = vLow + hi[a + j] * Math.sqrt(gain);
      }
    }
    return { pcm: out, hfShare, lfShare };
  }

  function band(x, sr, lo, hi) { return EM.bandpass(x, sr, lo, Math.min(hi, sr * 0.45)); }
  function narrow(x, sr, hz) { let y = EM.bandpass(x, sr, hz * 0.97, hz * 1.03); return EM.bandpass(y, sr, hz * 0.97, hz * 1.03); }

  function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(x.length, 1)); }
  // normaliza para escuchar (pico 0,9) y devuelve cuánto se ha quitado
  function finish(orig, y) {
    const keptDb = 20 * Math.log10(Math.max(rms(y), 1e-12) / Math.max(rms(orig), 1e-12));
    let pk = 0; for (let i = 0; i < y.length; i++) pk = Math.max(pk, Math.abs(y[i]));
    const g = pk > 0 ? 0.9 / pk : 1;
    const z = new Float32Array(y.length); for (let i = 0; i < y.length; i++) z[i] = y[i] * g;
    return { pcm: z, keptDb: Math.round(keptDb * 10) / 10, gainDb: Math.round(20 * Math.log10(g) * 10) / 10 };
  }

  root.Isolate = { subtractReference, syncResidual, trackEvents, band, narrow, finish };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.Isolate;
