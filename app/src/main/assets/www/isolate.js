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

  // Resta espectral: x = grabación, ref = grabación de referencia (motor sano)
  function subtractReference(x, sr, ref, refSr, opts) {
    const alpha = (opts && opts.alpha) || 2.5, floor = 0.03;
    const Pr0 = meanPower(ref), Px = meanPower(x);
    // llevar la referencia a la rejilla de frecuencias de x
    const Pr = new Float64Array(N / 2 + 1);
    for (let k = 0; k <= N / 2; k++) {
      const f = k * sr / N, kr = f * N / refSr;
      const k0 = Math.floor(kr), t = kr - k0;
      Pr[k] = k0 + 1 <= N / 2 ? Pr0[k0] * (1 - t) + Pr0[k0 + 1] * t : 1e-20;
    }
    // igualar niveles con una mediana robusta en 200–4000 Hz (la posición del móvil cambia el volumen)
    const ratios = [];
    for (let k = Math.ceil(200 * N / sr); k <= Math.floor(4000 * N / sr) && k <= N / 2; k++) ratios.push(Px[k] / Math.max(Pr[k], 1e-20));
    const g = median(ratios);
    for (let k = 0; k <= N / 2; k++) Pr[k] *= g;

    const out = new Float32Array(x.length), re = new Float64Array(N), im = new Float64Array(N);
    let prevG = null;
    for (let s = 0; s + N <= x.length; s += HOP) {
      for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
      EM.fft(re, im);
      const G = new Float64Array(N / 2 + 1);
      for (let k = 0; k <= N / 2; k++) {
        const p = re[k] * re[k] + im[k] * im[k];
        G[k] = Math.max(floor, Math.sqrt(Math.max(0, p - alpha * Pr[k]) / Math.max(p, 1e-20)));
        if (prevG) G[k] = 0.5 * G[k] + 0.5 * prevG[k]; // suaviza el «ruido musical»
      }
      prevG = G;
      for (let k = 0; k <= N / 2; k++) {
        re[k] *= G[k]; im[k] *= G[k];
        if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
      }
      // IFFT por conjugación
      for (let i = 0; i < N; i++) im[i] = -im[i];
      EM.fft(re, im);
      for (let i = 0; i < N; i++) out[s + i] += re[i] / N * win[i] / 2; // OLA: suma de Hann con salto N/4 = 2
    }
    return out;
  }

  // Diferencias entre cilindros: promedia cada cilindro por separado (el ruido aleatorio se cancela)
  // y resta lo común a todos. Queda lo que un cilindro hace distinto: tic, golpe, explosión débil.
  function syncResidual(x, sr, firingHz, cylinders, mode) {
    cylinders = Math.max(1, cylinders || 4);
    const P = sr / firingHz, L = Math.floor(P), srch = Math.max(2, Math.round(P * 0.06));
    const n = x.length;
    const T = new Float64Array(L);
    let cnt = 0;
    for (let s = 0; s + L <= n && cnt < 30; s = Math.round((cnt + 1) * P)) { for (let i = 0; i < L; i++) T[i] += x[s + i]; cnt++; }
    for (let i = 0; i < L; i++) T[i] /= Math.max(cnt, 1);
    const starts = [];
    let s = 0;
    while (s + L + srch <= n) {
      let best = -Infinity, bo = 0;
      for (let o = -srch; o <= srch; o++) {
        const a = s + o; if (a < 0 || a + L > n) continue;
        let acc = 0; for (let i = 0; i < L; i += 4) acc += x[a + i] * T[i];
        if (acc > best) { best = acc; bo = o; }
      }
      const a = Math.max(0, s + bo);
      starts.push(a);
      s = Math.round(a + P);
    }
    // media de todas las explosiones y media de cada cilindro
    const all = new Float64Array(L), per = [], pc = new Array(cylinders).fill(0);
    for (let c = 0; c < cylinders; c++) per.push(new Float64Array(L));
    starts.forEach((a, j) => { const c = j % cylinders; pc[c]++; for (let i = 0; i < L; i++) { all[i] += x[a + i]; per[c][i] += x[a + i]; } });
    for (let i = 0; i < L; i++) all[i] /= Math.max(starts.length, 1);
    per.forEach((t, c) => { for (let i = 0; i < L; i++) t[i] = t[i] / Math.max(pc[c], 1) - all[i]; });
    const out = new Float32Array(n);
    const fade = Math.min(64, L >> 3);
    starts.forEach((a, j) => {
      const d = per[j % cylinders];
      for (let i = 0; i < L && a + i < n; i++) {
        const w = i < fade ? i / fade : i > L - fade ? (L - i) / fade : 1;
        // 'cyl': lo que distingue a cada cilindro; 'irregular': todo lo que no se repite ciclo a ciclo
        const v = mode === 'irregular' ? x[a + i] - all[i] - d[i] : d[i];
        out[a + i] = v * w + out[a + i] * (1 - w);
      }
    });
    return mode === 'irregular' ? EM.bandpass(out, sr, 1000, Math.min(12000, sr * 0.45)) : out;
  }

  function band(x, sr, lo, hi) { return EM.bandpass(x, sr, lo, Math.min(hi, sr * 0.45)); }

  function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(x.length, 1)); }
  // normaliza para escuchar (pico 0,9) y devuelve cuánto se ha quitado
  function finish(orig, y) {
    const keptDb = 20 * Math.log10(Math.max(rms(y), 1e-12) / Math.max(rms(orig), 1e-12));
    let pk = 0; for (let i = 0; i < y.length; i++) pk = Math.max(pk, Math.abs(y[i]));
    const g = pk > 0 ? 0.9 / pk : 1;
    const z = new Float32Array(y.length); for (let i = 0; i < y.length; i++) z[i] = y[i] * g;
    return { pcm: z, keptDb: Math.round(keptDb * 10) / 10, gainDb: Math.round(20 * Math.log10(g) * 10) / 10 };
  }

  root.Isolate = { subtractReference, syncResidual, band, finish };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.Isolate;
