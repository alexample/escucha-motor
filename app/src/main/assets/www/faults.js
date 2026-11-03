/* Escucha Motor — catálogo de averías que producen ruido y su relación con los indicadores.
 * Cada avería: sistema, cómo suena, cuándo se oye, si la app la detecta, qué mira la app,
 * cómo confirmarla y urgencia. match(f, prev, ctx) devuelve {score 0–1, ev: [pruebas]} o null.
 */
(function (root) {
  'use strict';
  const SYS = {
    enc: 'Combustión y encendido', iny: 'Inyección y combustible', dist: 'Distribución y válvulas',
    baja: 'Parte baja del motor', acc: 'Correas y accesorios', adm: 'Admisión y escape',
    turbo: 'Turbo', sop: 'Soportes, volante y transmisión'
  };
  const pct = v => Math.round(v * 100) + '%';
  const delta = (f, p, k) => (p && f[k] != null && p[k] != null) ? f[k] - p[k] : null;
  const dBand = (f, p, id) => (p && f.bands && p.bands) ? f.bands[id] - p.bands[id] : null;
  const newTone = (f, p, lo, hi, prom) => (f.tones || []).filter(t => t.hz >= lo && t.hz <= hi && t.prom >= prom && (!p || !(p.tones || []).some(u => Math.abs(u.hz - t.hz) / t.hz < 0.1)));
  const tonesIn = (f, lo, hi, prom) => (f.tones || []).filter(t => t.hz >= lo && t.hz <= hi && t.prom >= prom);
  const oneCyl = f => f.weakPct != null && f.cylinders > 1 && Math.abs(f.weakPct - 100 / f.cylinders) < 100 / f.cylinders * 0.3 && f.weakPct >= 8;
  const cold = c => c.testType === 'Arranque en frío';
  const revs = c => c.testType === 'Régimen sostenido 2.500 rpm';
  const diesel = c => c.fuel === 'Diésel';
  const hfCyc = f => f.hfImbalance != null && f.hfImbalance >= 0.08 && (f.imbalance == null || f.imbalance < 0.2);
  const rattle = f => f.hfKurtosis != null && f.hfKurtosis >= 25 && (f.hfImbalance == null || f.hfImbalance < 0.06);
  const misfirePattern = f => oneCyl(f) || (f.imbalance != null && f.imbalance >= 0.2);
  const rod = f => f.rotKnock != null && f.rotKnock >= 0.3 && f.rotKnock >= 2 * (f.imbalance || 0) && f.lfKurtosis >= 12 && !oneCyl(f);

  const FAULTS = [
    // ---------- combustión y encendido ----------
    {
      id: 'misfire', sys: 'enc', name: 'Fallo de encendido en un cilindro', urg: 'alta', det: 'sí',
      sound: 'Motor que «cojea»: un petardeo o hueco rítmico, vibración al ralentí, a veces petardeo en el escape.',
      when: 'Al ralentí y al acelerar; suele empeorar en frío o con humedad.',
      app: 'Explosiones débiles en torno a 1 de cada N (N = cilindros), desequilibrio entre cilindros alto y regularidad baja.',
      confirm: 'Lectura de fallos con OBD (códigos P0300–P0308), cambiar la bobina o bujía de cilindro para ver si el fallo se mueve.',
      cause: 'Bujía gastada, bobina o cable de encendido, conector, o inyector del mismo cilindro.',
      match(f) {
        const ev = []; let s = 0;
        if (oneCyl(f)) { s = 0.9; ev.push(`${f.weakPct}% de explosiones débiles (≈ 1 de cada ${f.cylinders})`); }
        else if (f.weakEventsPerMin >= 20 && !rod(f)) { s = 0.7; ev.push(`${f.weakEventsPerMin} explosiones débiles por minuto`); }
        if (f.imbalance >= 0.35) { s = Math.max(s, 0.75); ev.push(`desequilibrio entre cilindros ${f.imbalance}`); }
        else if (f.imbalance >= 0.2 && s) ev.push(`desequilibrio entre cilindros ${f.imbalance}`);
        return s ? { score: s, ev } : null;
      }
    },
    {
      id: 'compression', sys: 'enc', name: 'Compresión baja en un cilindro', urg: 'alta', det: 'parcial',
      sound: 'Ralentí irregular parecido a un fallo de encendido, a veces con un «soplido» rítmico.',
      when: 'Siempre, más notable al ralentí.',
      app: 'Desequilibrio entre cilindros sin que las explosiones lleguen a fallar del todo. No se distingue por sonido de un inyector que pulveriza mal.',
      confirm: 'Prueba de compresión o de estanqueidad (fuga de cilindros) en taller.',
      cause: 'Segmentos gastados, válvula quemada o mal asentada, junta de culata entre cilindros.',
      match(f) {
        if (f.imbalance >= 0.2) return { score: f.imbalance >= 0.35 ? 0.5 : 0.35, ev: [`desequilibrio entre cilindros ${f.imbalance}`] };
        return null;
      }
    },
    {
      id: 'headgasket', sys: 'enc', name: 'Junta de culata dañada', urg: 'alta', det: 'parcial',
      sound: 'Puede no hacer ruido propio; si une dos cilindros, ralentí irregular. A veces burbujeo en el depósito de refrigerante.',
      when: 'Ralentí; con el motor caliente.',
      app: 'Solo indirectamente, como desequilibrio fuerte entre cilindros.',
      confirm: 'Prueba de CO₂ en el refrigerante, prueba de compresión, pérdida de refrigerante o humo blanco.',
      cause: 'Sobrecalentamiento, culata deformada.',
      match(f) { return f.imbalance >= 0.35 ? { score: 0.25, ev: [`desequilibrio entre cilindros ${f.imbalance}`] } : null; }
    },
    {
      id: 'glow', sys: 'enc', name: 'Calentadores (bujías de precalentamiento) diésel', urg: 'media', det: 'parcial',
      sound: 'Arranque en frío difícil, motor que tiembla y «tose» los primeros segundos, humo blanco.',
      when: 'Solo en arranque en frío; desaparece al calentar.',
      app: 'En la prueba de arranque en frío: irregularidad o explosiones débiles que no aparecen en caliente.',
      confirm: 'Medir la resistencia de cada calentador o revisar el relé y la centralita de precalentamiento.',
      cause: 'Calentador fundido, relé o módulo de precalentamiento.',
      match(f, p, c) {
        if (!diesel(c) || !cold(c)) return null;
        const ev = [];
        if (f.cycleCv >= 0.28) ev.push(`irregularidad ${pct(f.cycleCv)} en arranque en frío`);
        if (f.weakEventsPerMin >= 6) ev.push(`${f.weakEventsPerMin} explosiones débiles/min en frío`);
        return ev.length ? { score: 0.6, ev } : null;
      }
    },
    {
      id: 'knock', sys: 'enc', name: 'Detonación o picado (gasolina)', urg: 'alta', det: 'no',
      sound: 'Cascabeleo metálico agudo, como canicas en una lata.',
      when: 'Al acelerar con carga, cuesta arriba o en marchas largas a bajas vueltas. No al ralentí.',
      app: 'No se puede detectar con el vehículo parado: hace falta carga. La app no lo diagnostica.',
      confirm: 'Lectura de retardo de encendido por sensor de picado (OBD), revisar combustible y carbonilla.',
      cause: 'Combustible de bajo octanaje, carbonilla, sobrecalentamiento, avance excesivo.',
      match() { return null; }
    },
    // ---------- inyección ----------
    {
      id: 'injector_drip', sys: 'iny', name: 'Inyector que gotea o pulveriza mal', urg: 'media', det: 'parcial',
      sound: 'Ralentí irregular, tirones; en diésel, más traqueteo y humo.',
      when: 'Al ralentí y en frío.',
      app: 'Desequilibrio entre cilindros o irregularidad entre explosiones, sin el patrón de fallo total de encendido.',
      confirm: 'Prueba de retorno de inyectores (diésel), correcciones de caudal por cilindro con diagnosis, banco de inyectores.',
      cause: 'Suciedad, desgaste de la tobera, combustible de mala calidad.',
      match(f, p, c) {
        const ev = []; let s = 0;
        if (f.imbalance >= 0.2 && !oneCyl(f)) { s = 0.5; ev.push(`desequilibrio entre cilindros ${f.imbalance}`); }
        else if (f.imbalance >= 0.2) { s = 0.35; ev.push(`desequilibrio entre cilindros ${f.imbalance}`); }
        if (f.cycleCv >= 0.28 && f.imbalance < 0.2 && !rod(f)) { s = Math.max(s, 0.35); ev.push(`irregularidad entre explosiones ${pct(f.cycleCv)}`); }
        if (s && diesel(c)) s += 0.1;
        return s ? { score: s, ev } : null;
      }
    },
    {
      id: 'injector_seal', sys: 'iny', name: 'Soplido por la junta (arandela) de un inyector', urg: 'media', det: 'parcial',
      sound: '«Chuf-chuf» o tic rítmico con siseo, como un pequeño escape de gas, más fuerte cerca de la tapa de balancines. Olor a gases.',
      when: 'Siempre; más claro en frío y al ralentí.',
      app: 'Ruido agudo que se repite una vez por ciclo (viene de un solo cilindro) sin que ese cilindro pierda fuerza.',
      confirm: 'Buscar carbonilla o hollín alrededor del inyector; prueba de estanqueidad del pozo del inyector.',
      cause: 'Arandela de cobre del inyector deteriorada o tornillo de la brida flojo.',
      match(f, p, c) {
        if (!hfCyc(f)) return null;
        const ev = [`ruido agudo de un solo cilindro (índice ${f.hfImbalance})`];
        let s = diesel(c) ? 0.6 : 0.35;
        const db4 = dBand(f, p, 'b4');
        if (db4 != null && db4 >= 3) { s += 0.1; ev.push(`la banda 1–3 kHz sube ${db4.toFixed(1)} dB`); }
        return { score: s, ev };
      }
    },
    {
      id: 'injector_noise', sys: 'iny', name: 'Inyectores ruidosos o desgastados', urg: 'baja', det: 'parcial',
      sound: 'Repiqueteo seco y rápido («tic-tic-tic») repartido en todo el motor; en diésel, traqueteo más fuerte de lo normal.',
      when: 'Ralentí, sobre todo en frío.',
      app: 'Aumento de la impulsividad en agudos entre fichas, sin patrón de un solo cilindro.',
      confirm: 'Escuchar cada inyector con un estetoscopio de mecánico; correcciones de caudal con diagnosis.',
      cause: 'Desgaste, suciedad, presión de combustible alta.',
      match(f, p) {
        const d = delta(f, p, 'hfKurtosis');
        if (d != null && p.hfKurtosis > 0 && f.hfKurtosis / p.hfKurtosis >= 1.3 && !hfCyc(f)) return { score: 0.4, ev: [`impulsividad en agudos ${p.hfKurtosis} → ${f.hfKurtosis}`] };
        return null;
      }
    },
    {
      id: 'hp_pump', sys: 'iny', name: 'Bomba de alta presión o de combustible', urg: 'media', det: 'parcial',
      sound: 'Zumbido o silbido continuo, a veces un tic mecánico propio.',
      when: 'Siempre que el motor está en marcha.',
      app: 'Un tono nuevo y estable en medios (500 Hz–3 kHz). No se distingue por sonido de otros accesorios.',
      confirm: 'Escuchar la bomba con estetoscopio; presión de rail con diagnosis.',
      cause: 'Desgaste interno, falta de lubricación por combustible, aire en el circuito.',
      match(f, p, c) {
        if (!diesel(c)) return null;
        const t = newTone(f, p, 500, 3000, 15);
        return t.length && p ? { score: 0.3, ev: [`tono nuevo de ${t[0].hz} Hz`] } : null;
      }
    },
    // ---------- distribución y válvulas ----------
    {
      id: 'lifter', sys: 'dist', name: 'Taqué hidráulico o holgura de válvula', urg: 'media', det: 'sí',
      sound: 'Tic-tic metálico y rítmico, a la mitad de velocidad que el motor, que se oye en la parte alta del motor.',
      when: 'Más fuerte en frío; si es un taqué que pierde aceite, puede desaparecer al calentar.',
      app: 'Ruido agudo que se repite una vez por ciclo (un solo taqué) y golpeteo en agudos.',
      confirm: 'Estetoscopio sobre la tapa de balancines; medir holgura de válvulas; revisar nivel y tipo de aceite.',
      cause: 'Taqué hidráulico que se vacía, aceite viejo o de viscosidad errónea, holgura excesiva.',
      match(f, p, c) {
        if (!hfCyc(f)) return null;
        const ev = [`ruido agudo de un solo cilindro (índice ${f.hfImbalance})`];
        let s = 0.45;
        if (f.hfKurtosis >= 18) { s += 0.15; ev.push(`golpes metálicos en agudos (${f.hfKurtosis})`); }
        if (cold(c)) s += 0.05;
        return { score: s, ev };
      }
    },
    {
      id: 'oil', sys: 'dist', name: 'Falta de aceite o presión baja (taqués en general)', urg: 'alta', det: 'parcial',
      sound: 'Repiqueteo metálico general en la parte alta, más rápido que un taqué suelto.',
      when: 'En frío o con el aceite bajo; puede no desaparecer al calentar.',
      app: 'Golpeteo fuerte en agudos sin ritmo de un cilindro concreto.',
      confirm: 'Comprobar el nivel de aceite ahora mismo. Medir la presión de aceite en taller.',
      cause: 'Nivel bajo, bomba de aceite, filtro o colador obstruido.',
      match(f) { return rattle(f) ? { score: 0.45, ev: [`golpeteo en agudos ${f.hfKurtosis} sin ritmo de cilindro`] } : null; }
    },
    {
      id: 'chain', sys: 'dist', name: 'Cadena de distribución destensada', urg: 'alta', det: 'parcial',
      sound: 'Traqueteo o «cascabeleo» metálico, como una cadena que roza, en el lado de la distribución.',
      when: 'Sobre todo los primeros 2–5 segundos tras un arranque en frío.',
      app: 'Golpeteo en agudos fuerte y sin ritmo, mayor en la prueba de arranque en frío.',
      confirm: 'Lectura de desfase árbol de levas/cigüeñal con diagnosis; inspección del tensor y las guías.',
      cause: 'Cadena estirada, tensor hidráulico gastado, guías rotas.',
      match(f, p, c) {
        if (!rattle(f)) return null;
        return { score: cold(c) ? 0.7 : 0.45, ev: [`golpeteo en agudos ${f.hfKurtosis} sin ritmo de cilindro`].concat(cold(c) ? ['aparece en el arranque en frío'] : []) };
      }
    },
    {
      id: 'belt_timing', sys: 'dist', name: 'Correa de distribución, tensor o rodillo', urg: 'alta', det: 'parcial',
      sound: 'Zumbido o silbido continuo, o un chirrido de rodamiento en el lado de la distribución.',
      when: 'Siempre; aumenta con las revoluciones.',
      app: 'Un tono nuevo y estable, o más energía en agudos (3–8 kHz).',
      confirm: 'Revisión visual y del rodamiento del tensor y rodillos (requiere desmontar tapa). Si el ruido es de la distribución, no aplazarlo: su rotura puede romper el motor.',
      cause: 'Rodamiento del tensor o del rodillo loco, correa desgastada.',
      match(f, p) {
        const t = newTone(f, p, 800, 8000, 15);
        return t.length && p ? { score: 0.3, ev: [`tono nuevo de ${t[0].hz} Hz`] } : null;
      }
    },
    // ---------- parte baja ----------
    {
      id: 'rod', sys: 'baja', name: 'Cojinete de biela (picado de biela)', urg: 'alta', det: 'sí',
      sound: 'Golpe grave y seco, «toc-toc», desde la parte baja del motor, una vez por vuelta. Sube al acelerar y bajar del gas.',
      when: 'En caliente y con el aceite fino; más fuerte al soltar el acelerador a 2.000–3.000 rpm.',
      app: 'Golpe grave (100–1.000 Hz) que se repite una vez por vuelta del cigüeñal, con impulsividad en graves alta.',
      confirm: 'Presión de aceite, análisis de limaduras en el aceite, anular cilindros uno a uno: el golpe baja al anular el de la biela dañada.',
      cause: 'Falta de aceite, desgaste, uso prolongado a alta temperatura.',
      match(f) {
        if (rod(f)) return { score: 0.75, ev: [`golpe una vez por vuelta (índice ${f.rotKnock})`, `impulsividad en graves ${f.lfKurtosis}`] };
        if (f.rotKnock >= 0.3 && f.lfKurtosis >= 11 && f.rotKnock >= 1.5 * (f.imbalance || 0) && !oneCyl(f)) return { score: 0.4, ev: [`golpe una vez por vuelta (índice ${f.rotKnock})`] };
        return null;
      }
    },
    {
      id: 'main_bearing', sys: 'baja', name: 'Cojinetes de bancada', urg: 'alta', det: 'parcial',
      sound: 'Golpe o retumbo grave y sordo, más profundo que el de biela.',
      when: 'Al acelerar con carga y en caliente.',
      app: 'Golpe grave una vez por vuelta y graves más impulsivos; no se distingue con seguridad de una biela.',
      confirm: 'Presión de aceite en caliente, inspección en taller.',
      cause: 'Desgaste, falta de lubricación.',
      match(f) { return f.rotKnock >= 0.3 && f.lfKurtosis >= 11 && !misfirePattern(f) ? { score: 0.35, ev: [`golpe una vez por vuelta (índice ${f.rotKnock})`, `impulsividad en graves ${f.lfKurtosis}`] } : null; }
    },
    {
      id: 'piston_slap', sys: 'baja', name: 'Cacheteo de pistón', urg: 'baja', det: 'parcial',
      sound: 'Golpeteo hueco, como golpear una campana amortiguada, en la zona del bloque.',
      when: 'En frío; disminuye o desaparece al calentar.',
      app: 'Golpes en graves en la prueba de arranque en frío que no aparecen en caliente.',
      confirm: 'Comparar fichas en frío y en caliente; inspección de holgura pistón-cilindro.',
      cause: 'Holgura excesiva por desgaste.',
      match(f, p, c) { return cold(c) && f.lfKurtosis >= 12 ? { score: 0.4, ev: [`impulsividad en graves ${f.lfKurtosis} en frío`] } : null; }
    },
    {
      id: 'damper', sys: 'baja', name: 'Polea amortiguadora del cigüeñal', urg: 'media', det: 'parcial',
      sound: 'Traqueteo o vibración en la parte delantera baja del motor; la polea puede verse tambalear.',
      when: 'Al ralentí; puede cambiar con los accesorios (A/C).',
      app: 'Componente una vez por vuelta sin golpes graves marcados.',
      confirm: 'Inspección visual de la goma de la polea y si oscila.',
      cause: 'Goma interior de la polea deteriorada.',
      match(f) { return f.rotKnock >= 0.3 && f.lfKurtosis < 11 && f.rotKnock > 1.5 * (f.imbalance || 0) ? { score: 0.35, ev: [`componente una vez por vuelta (índice ${f.rotKnock})`] } : null; }
    },
    // ---------- correas y accesorios ----------
    {
      id: 'belt_squeal', sys: 'acc', name: 'Correa de accesorios que patina', urg: 'baja', det: 'sí',
      sound: 'Chirrido agudo y fuerte, a veces intermitente.',
      when: 'Al arrancar, con humedad, al encender el A/C o al acelerar.',
      app: 'Tono agudo destacado entre 1,5 y 8 kHz.',
      confirm: 'Rociar un poco de agua en la correa: si el ruido cambia o desaparece un momento, es la correa. Revisar tensión y desgaste.',
      cause: 'Correa cristalizada o destensada, tensor automático débil.',
      match(f, p) {
        const t = tonesIn(f, 1500, 8000, 15);
        if (!t.length) return null;
        const n = newTone(f, p, 1500, 8000, 15);
        return { score: n.length && p ? 0.65 : 0.45, ev: [`tono de ${t[0].hz} Hz (${t[0].prom} dB sobre el fondo)`].concat(n.length && p ? ['no estaba en la ficha anterior'] : []) };
      }
    },
    {
      id: 'bearing', sys: 'acc', name: 'Rodamiento de accesorio (alternador, bomba de agua, tensor, poleas)', urg: 'media', det: 'sí',
      sound: 'Zumbido, silbido o ronroneo áspero continuo, que sube con las revoluciones.',
      when: 'Siempre; a veces más en frío.',
      app: 'Tono estable nuevo o más energía en agudos (3–8 kHz) respecto a fichas anteriores.',
      confirm: 'Con el motor parado, quitar la correa y girar cada polea a mano: la que raspa o tiene holgura es la culpable. Con estetoscopio en marcha.',
      cause: 'Desgaste de rodamientos, fuga en la bomba de agua.',
      match(f, p) {
        const ev = []; let s = 0;
        const t = tonesIn(f, 300, 6000, 12);
        if (t.length) { s = 0.35; ev.push(`tono de ${t[0].hz} Hz`); }
        const n = newTone(f, p, 300, 6000, 12);
        if (n.length && p) { s = 0.55; ev.push('tono nuevo respecto a la ficha anterior'); }
        const d5 = dBand(f, p, 'b5');
        if (d5 != null && d5 >= 4) { s = Math.max(s, 0.45); ev.push(`agudos 3–8 kHz +${d5.toFixed(1)} dB`); }
        return s ? { score: s, ev } : null;
      }
    },
    {
      id: 'ac', sys: 'acc', name: 'Compresor del aire acondicionado', urg: 'baja', det: 'no',
      sound: 'Zumbido, golpeteo o chirrido que aparece al encender el A/C.',
      when: 'Solo con el A/C en marcha.',
      app: 'El protocolo graba con el A/C apagado, así que no se analiza. Puedes hacer una grabación «libre» con A/C para compararla.',
      confirm: 'Encender y apagar el A/C: si el ruido sigue al embrague del compresor, es él.',
      cause: 'Embrague del compresor, rodamiento de su polea, falta de gas.',
      match() { return null; }
    },
    // ---------- admisión y escape ----------
    {
      id: 'vacuum', sys: 'adm', name: 'Toma de aire (fuga de vacío)', urg: 'media', det: 'parcial',
      sound: 'Siseo o silbido continuo de aire; ralentí que sube y baja.',
      when: 'Al ralentí, más claro en frío.',
      app: 'Ralentí que oscila, o más siseo en agudos respecto a fichas anteriores.',
      confirm: 'Buscar manguitos agrietados; prueba de humo en la admisión; correcciones de mezcla (LTFT altos) con OBD.',
      cause: 'Manguito de vacío roto, junta del colector de admisión, válvula PCV, servofreno.',
      match(f, p) {
        const ev = []; let s = 0;
        if (f.rpmHuntPct >= 1.5) { s = f.rpmHuntPct >= 3 ? 0.55 : 0.4; ev.push(`el ralentí oscila ±${f.rpmHuntPct}%`); }
        const d5 = dBand(f, p, 'b5'), d6 = dBand(f, p, 'b6'), dh = delta(f, p, 'hissFlatness');
        if (((d5 != null && d5 >= 4) || (d6 != null && d6 >= 4)) && dh != null && dh >= 0.02) { s = Math.max(s, 0.55); ev.push('más siseo de aire en agudos que en la ficha anterior'); }
        return s ? { score: s, ev } : null;
      }
    },
    {
      id: 'idle', sys: 'adm', name: 'Control de ralentí (mariposa sucia, válvula de ralentí, sensor)', urg: 'baja', det: 'sí',
      sound: 'El motor sube y baja de vueltas solo, o el ralentí es más alto o más bajo de lo habitual.',
      when: 'Al ralentí, en caliente.',
      app: 'Oscilación del ralentí o cambio de rpm respecto a fichas anteriores en las mismas condiciones.',
      confirm: 'Limpiar la mariposa; revisar el sensor de temperatura y la válvula de ralentí con diagnosis.',
      cause: 'Carbonilla en la mariposa, válvula IAC, sensor de temperatura, tomas de aire.',
      match(f, p, c) {
        const ev = []; let s = 0;
        if (f.rpmHuntPct >= 1.5) { s = f.rpmHuntPct >= 3 ? 0.65 : 0.45; ev.push(`el ralentí oscila ±${f.rpmHuntPct}%`); }
        const d = delta(f, p, 'rpm');
        if (d != null && p.rpm && Math.abs(d) / p.rpm >= 0.1 && c.testType === 'Ralentí en caliente') { s = Math.max(s, 0.5); ev.push(`ralentí ${p.rpm} → ${f.rpm} rpm`); }
        return s ? { score: s, ev } : null;
      }
    },
    {
      id: 'egr', sys: 'adm', name: 'Válvula EGR atascada abierta', urg: 'media', det: 'parcial',
      sound: 'Ralentí inestable, motor que parece que se va a calar, sin fallo de un cilindro concreto.',
      when: 'Al ralentí en caliente.',
      app: 'Irregularidad entre explosiones alta con cilindros equilibrados.',
      confirm: 'Diagnosis de la EGR; desconectarla y ver si el ralentí se estabiliza.',
      cause: 'Carbonilla en la válvula EGR.',
      match(f, p, c) {
        if (f.cycleCv >= 0.28 && (f.imbalance || 0) < 0.2 && !oneCyl(f) && !rod(f)) return { score: diesel(c) ? 0.5 : 0.35, ev: [`irregularidad ${pct(f.cycleCv)} con cilindros equilibrados`] };
        return null;
      }
    },
    {
      id: 'manifold_leak', sys: 'adm', name: 'Fuga de escape en el colector', urg: 'media', det: 'parcial',
      sound: 'Tic-tic o «pof-pof» rítmico, parecido a un taqué, en la zona del colector de escape.',
      when: 'Mucho más fuerte en frío; puede desaparecer al dilatarse el metal.',
      app: 'Ruido agudo de un solo cilindro, más marcado en el arranque en frío.',
      confirm: 'Buscar hollín junto a la junta del colector; espárragos rotos; escuchar en frío.',
      cause: 'Junta del colector, espárragos partidos, colector agrietado.',
      match(f, p, c) { return hfCyc(f) ? { score: cold(c) ? 0.55 : 0.35, ev: [`ruido agudo de un solo cilindro (índice ${f.hfImbalance})`].concat(cold(c) ? ['en arranque en frío'] : []) } : null; }
    },
    {
      id: 'exhaust_leak', sys: 'adm', name: 'Fuga o rotura en el escape (flexible, silencioso)', urg: 'media', det: 'sí',
      sound: 'El coche suena más fuerte y ronco, con retumbo grave.',
      when: 'Siempre; más al acelerar.',
      app: 'Suben el volumen general y los graves (20–300 Hz) respecto a fichas anteriores.',
      confirm: 'Revisar el escape con el coche elevado; con el motor en marcha, tapar con un trapo la salida un instante y escuchar dónde sopla.',
      cause: 'Flexible roto, junta, silencioso oxidado.',
      match(f, p) {
        if (!p) return null;
        const d1 = dBand(f, p, 'b1'), d2 = dBand(f, p, 'b2'), dl = delta(f, p, 'levelDb');
        if (((d1 != null && d1 >= 4) || (d2 != null && d2 >= 4)) && dl != null && dl >= 3) return { score: 0.55, ev: [`graves +${Math.max(d1, d2).toFixed(1)} dB`, `volumen +${dl.toFixed(1)} dB`] };
        return null;
      }
    },
    {
      id: 'heatshield', sys: 'adm', name: 'Protector térmico o catalizador con piezas sueltas', urg: 'baja', det: 'parcial',
      sound: 'Vibración metálica o «sonajero» bajo el coche.',
      when: 'A ciertas revoluciones o al ralentí, según resuene.',
      app: 'Golpeteo metálico sin ritmo de cilindro, parecido al de una cadena.',
      confirm: 'Golpear con la mano el escape y los protectores con el motor parado y frío.',
      cause: 'Abrazaderas oxidadas, panal del catalizador roto.',
      match(f) { return rattle(f) ? { score: 0.3, ev: [`golpeteo metálico sin ritmo (${f.hfKurtosis})`] } : null; }
    },
    // ---------- turbo ----------
    {
      id: 'turbo_whistle', sys: 'turbo', name: 'Silbido del turbo (desgaste o fuga de presión)', urg: 'media', det: 'parcial',
      sound: 'Silbido agudo tipo sirena que sube con las revoluciones; o soplido al soltar el gas.',
      when: 'Al subir de vueltas; poco o nada al ralentí.',
      app: 'Tono agudo nuevo en la prueba a 2.500 rpm.',
      confirm: 'Revisar holgura del eje del turbo, manguitos del intercooler y presión de soplado con diagnosis.',
      cause: 'Rodamientos del turbo, manguito suelto o roto, intercooler.',
      match(f, p, c) {
        if (!revs(c)) return null;
        const t = tonesIn(f, 2000, 12000, 15);
        if (!t.length) return null;
        const n = newTone(f, p, 2000, 12000, 15);
        return { score: n.length && p ? 0.6 : 0.4, ev: [`tono de ${t[0].hz} Hz a 2.500 rpm`] };
      }
    },
    {
      id: 'boost_leak', sys: 'turbo', name: 'Fuga en manguitos del turbo o intercooler', urg: 'media', det: 'parcial',
      sound: 'Soplido o siseo fuerte al acelerar, pérdida de potencia.',
      when: 'Con carga y a medias revoluciones.',
      app: 'Más siseo en agudos en la prueba a 2.500 rpm que en fichas anteriores.',
      confirm: 'Revisar abrazaderas y manguitos; prueba de presión del circuito.',
      cause: 'Manguito agrietado, abrazadera suelta.',
      match(f, p, c) {
        if (!revs(c) || !p) return null;
        const d5 = dBand(f, p, 'b5'), dh = delta(f, p, 'hissFlatness');
        return d5 != null && d5 >= 4 && dh != null && dh >= 0.02 ? { score: 0.5, ev: ['más siseo en agudos a 2.500 rpm'] } : null;
      }
    },
    // ---------- soportes, volante, transmisión ----------
    {
      id: 'mounts', sys: 'sop', name: 'Soportes del motor gastados', urg: 'baja', det: 'parcial',
      sound: 'Vibración y retumbo grave en el habitáculo, golpe al arrancar o al meter marcha.',
      when: 'Ralentí y al cambiar de marcha.',
      app: 'Más graves (20–100 Hz) y volumen inestable, sin fallos de cilindro.',
      confirm: 'Abrir el capó y acelerar en P/punto muerto: si el motor se mueve mucho, revisar soportes.',
      cause: 'Goma agrietada o soporte hidráulico vacío.',
      match(f, p) {
        const d1 = dBand(f, p, 'b1');
        if (d1 != null && d1 >= 4 && (f.imbalance || 0) < 0.2) return { score: 0.3, ev: [`graves 20–100 Hz +${d1.toFixed(1)} dB`] };
        return null;
      }
    },
    {
      id: 'dmf', sys: 'sop', name: 'Volante bimasa', urg: 'media', det: 'parcial',
      sound: 'Traqueteo grave metálico al ralentí que cambia o desaparece al pisar el embrague; golpe al apagar el motor.',
      when: 'Al ralentí en punto muerto, al arrancar y al parar.',
      app: 'Golpes en graves (100–1.000 Hz) sin ritmo de una vuelta.',
      confirm: 'Pisar y soltar el embrague al ralentí: si el ruido cambia, es transmisión. Medir el juego angular del volante.',
      cause: 'Muelles internos gastados.',
      match(f, p, c) {
        if (f.lfKurtosis >= 12 && !(f.rotKnock >= 0.3) && !misfirePattern(f)) return { score: diesel(c) ? 0.45 : 0.35, ev: [`impulsividad en graves ${f.lfKurtosis}`] };
        return null;
      }
    },
    {
      id: 'clutch', sys: 'sop', name: 'Cojinete de embrague o rodamiento de caja de cambios', urg: 'media', det: 'no',
      sound: 'Zumbido o ronroneo que cambia al pisar el embrague.',
      when: 'Al ralentí en punto muerto.',
      app: 'Por sonido no se separa del motor. Haz dos grabaciones seguidas (embrague suelto y pisado) y compáralas.',
      confirm: 'Si el ruido desaparece al pisar el embrague: rodamiento del primario de la caja. Si aparece al pisar: cojinete de empuje.',
      cause: 'Desgaste de rodamientos, falta de aceite en la caja.',
      match() { return null; }
    }
  ];

  const URG = { alta: 'Urgencia alta', media: 'Urgencia media', baja: 'Urgencia baja' };

  // posibles averías para una ficha (f) frente a la anterior del mismo tipo (p)
  function diagnose(f, p, ctx) {
    if (!f || f.reliable === false) return [];
    const out = [];
    FAULTS.forEach(F => {
      let m = null;
      try { m = F.match(f, p && p.reliable !== false ? p : null, ctx || {}); } catch (e) { m = null; }
      if (m && m.score >= 0.3) out.push({ id: F.id, name: F.name, sys: SYS[F.sys], urg: F.urg, score: Math.min(1, m.score), ev: m.ev });
    });
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 6);
  }
  const likelihood = s => s >= 0.6 ? 'Muy compatible' : s >= 0.45 ? 'Compatible' : 'Posible';

  function detailHtml(id, esc) {
    const F = FAULTS.find(x => x.id === id); if (!F) return '';
    return `<p class="muted small">${esc(SYS[F.sys])} · ${URG[F.urg]} · Detección por sonido: ${F.det}</p>
      <p><b>Cómo suena:</b> ${esc(F.sound)}</p><p><b>Cuándo se oye:</b> ${esc(F.when)}</p>
      <p><b>Causas habituales:</b> ${esc(F.cause)}</p><p><b>Qué mira la app:</b> ${esc(F.app)}</p>
      <p><b>Cómo confirmarlo:</b> ${esc(F.confirm)}</p>`;
  }

  root.Faults = { FAULTS, SYS, URG, diagnose, likelihood, detailHtml };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.Faults;
