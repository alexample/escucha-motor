/* Escucha Motor — infografía de colocación del móvil */
(function (root) {
  'use strict';
  const C = {
    body: '#2c3038', bodyLine: '#6b7380', glass: '#1a1d22', wheel: '#0b0c0e', rim: '#4a505a',
    engine: 'rgba(245,165,36,.16)', accent: '#f5a524', dim: '#5b9bd5', text: '#e9ebee', muted: '#9aa1ab', ground: '#3a3f47', cloth: '#46a758'
  };
  const T = (x, y, s, o) => `<text x="${x}" y="${y}" fill="${(o && o.fill) || C.text}" font-size="${(o && o.size) || 12}" font-weight="${(o && o.weight) || 500}" text-anchor="${(o && o.anchor) || 'middle'}" font-family="system-ui,sans-serif">${s}</text>`;
  const badge = (x, y, n) => `<circle cx="${x}" cy="${y}" r="9" fill="${C.accent}"/>${T(x, y + 4, n, { fill: '#1a1200', size: 11, weight: 800 })}`;
  // cota horizontal
  const dimH = (x1, x2, y, label) => `<g stroke="${C.dim}" stroke-width="1.5"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}"/><line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}"/></g>${T((x1 + x2) / 2, y - 7, label, { fill: C.dim, size: 11, weight: 700 })}`;
  const dimV = (x, y1, y2, label) => `<g stroke="${C.dim}" stroke-width="1.5"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}"/><line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}"/></g>${T(x + 8, (y1 + y2) / 2 + 4, label, { fill: C.dim, size: 11, weight: 700, anchor: 'start' })}`;
  // móvil visto desde arriba; mic = lado donde está el micrófono
  function phoneTop(x, y, w, h, mic) {
    let m = '';
    if (mic === 'right') m = `<rect x="${x + w - 4}" y="${y + h / 2 - 3}" width="2" height="6" rx="1" fill="#1a1200"/>`;
    if (mic === 'down') m = `<rect x="${x + w / 2 - 3}" y="${y + h - 4}" width="6" height="2" rx="1" fill="#1a1200"/>`;
    return `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="4" fill="none" stroke="${C.cloth}" stroke-width="1.5" stroke-dasharray="3 2"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${C.accent}"/>${m}`;
  }
  const defs = `<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${C.accent}"/></marker></defs>`;

  const board = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#7a5a3a" opacity=".55" stroke="#a07850"/>`;
  // móvil visto desde arriba bajo el motor (trazo discontinuo = está debajo)
  const phoneUnder = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${C.accent}" fill-opacity=".85" stroke="#fff" stroke-width="1.2" stroke-dasharray="3 2"/>`;

  function carTop() {
    return `<svg viewBox="0 0 340 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Coche visto desde arriba con el móvil debajo del motor sobre una tabla">${defs}
      ${T(170, 16, 'VISTA DESDE ARRIBA', { fill: C.muted, size: 11, weight: 700 })}
      ${T(334, 16, '▲ delante', { fill: C.muted, size: 11, anchor: 'end' })}
      ${board(160, 24, 50, 62)}
      <line x1="156" y1="44" x2="214" y2="44" stroke="#fff" stroke-width="2"/>
      <rect x="125" y="44" width="120" height="236" rx="34" fill="${C.body}" stroke="${C.bodyLine}" stroke-width="1.5" fill-opacity=".92"/>
      <rect x="137" y="122" width="96" height="34" rx="9" fill="${C.glass}"/>
      <rect x="140" y="224" width="90" height="24" rx="8" fill="${C.glass}"/>
      <rect x="111" y="66" width="18" height="44" rx="5" fill="${C.wheel}" stroke="${C.rim}"/>
      <rect x="241" y="66" width="18" height="44" rx="5" fill="${C.wheel}" stroke="${C.rim}"/>
      <rect x="111" y="210" width="18" height="44" rx="5" fill="${C.wheel}" stroke="${C.rim}"/>
      <rect x="241" y="210" width="18" height="44" rx="5" fill="${C.wheel}" stroke="${C.rim}"/>
      <rect x="146" y="54" width="78" height="56" rx="6" fill="${C.engine}" stroke="${C.accent}" stroke-dasharray="4 3"/>
      ${board(160, 44, 50, 42)}
      ${phoneUnder(172, 58, 26, 22)}
      ${T(185, 104, 'MOTOR', { fill: C.accent, size: 11, weight: 800 })}
      <line x1="214" y1="44" x2="262" y2="44" stroke="#fff" stroke-dasharray="2 2"/>
      ${T(264, 45, 'marca de', { fill: C.text, size: 10, weight: 700, anchor: 'start' })}${T(264, 58, 'la tabla =', { fill: C.text, size: 10, weight: 700, anchor: 'start' })}${T(264, 71, 'borde del', { fill: C.muted, size: 10, anchor: 'start' })}${T(264, 84, 'paragolpes', { fill: C.muted, size: 10, anchor: 'start' })}
      <path d="M146,22 L146,66" stroke="${C.accent}" stroke-width="2" marker-end="url(#ar)"/>
      ${T(14, 36, 'empuja la tabla', { fill: C.accent, size: 11, weight: 700, anchor: 'start' })}${T(14, 50, 'desde delante', { fill: C.accent, size: 11, weight: 700, anchor: 'start' })}
      ${T(60, 140, 'móvil en el suelo,', { fill: C.text, size: 11, weight: 700 })}${T(60, 154, 'centrado debajo', { fill: C.text, size: 11 })}${T(60, 168, 'del motor', { fill: C.text, size: 11 })}
      <line x1="100" y1="146" x2="168" y2="76" stroke="${C.muted}" stroke-dasharray="2 3"/>
    </svg>`;
  }

  function carFront() {
    return `<svg viewBox="0 0 340 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Coche visto de frente con el móvil en el suelo debajo del motor">${defs}
      ${T(170, 16, 'VISTA DE FRENTE', { fill: C.muted, size: 11, weight: 700 })}
      <path d="M62,168 L66,118 Q70,100 92,96 L118,62 Q124,54 136,54 L204,54 Q216,54 222,62 L248,96 Q270,100 274,118 L278,168 Z" fill="${C.body}" stroke="${C.bodyLine}" stroke-width="1.5"/>
      <path d="M126,66 L214,66 L238,96 L102,96 Z" fill="${C.glass}"/>
      <rect x="76" y="108" width="34" height="12" rx="4" fill="#d9dde3" opacity=".75"/>
      <rect x="230" y="108" width="34" height="12" rx="4" fill="#d9dde3" opacity=".75"/>
      <rect x="122" y="112" width="96" height="62" rx="6" fill="${C.engine}" stroke="${C.accent}" stroke-dasharray="4 3"/>
      ${T(170, 140, 'MOTOR', { fill: C.accent, size: 11, weight: 800 })}
      ${T(170, 154, '(cárter)', { fill: C.accent, size: 10 })}
      <rect x="66" y="150" width="30" height="50" rx="7" fill="${C.wheel}" stroke="${C.rim}"/>
      <rect x="244" y="150" width="30" height="50" rx="7" fill="${C.wheel}" stroke="${C.rim}"/>
      <line x1="10" y1="200" x2="330" y2="200" stroke="${C.ground}" stroke-width="3"/>
      ${board(132, 194, 76, 5)}
      <rect x="155" y="189" width="30" height="5" rx="1.5" fill="${C.accent}"/>
      <line x1="170" y1="176" x2="170" y2="187" stroke="${C.accent}" stroke-width="1.5" marker-end="url(#ar)"/>
      ${T(170, 220, 'móvil sobre la tabla, pantalla arriba', { fill: C.text, size: 11, weight: 700 })}
      ${T(304, 150, 'el motor', { fill: C.muted, size: 11 })}${T(304, 163, 'queda justo', { fill: C.muted, size: 11 })}${T(304, 176, 'encima', { fill: C.muted, size: 11 })}
    </svg>`;
  }

  function motoTop() {
    return `<svg viewBox="0 0 340 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Moto vista desde arriba con el móvil debajo del motor sobre una tabla">${defs}
      ${T(170, 16, 'VISTA DESDE ARRIBA', { fill: C.muted, size: 11, weight: 700 })}
      ${T(326, 34, '▲ delante', { fill: C.muted, size: 11, anchor: 'end' })}
      ${board(64, 184, 126, 40)}
      <rect x="160" y="40" width="20" height="62" rx="8" fill="${C.wheel}" stroke="${C.rim}"/>
      <line x1="112" y1="96" x2="228" y2="96" stroke="${C.bodyLine}" stroke-width="5" stroke-linecap="round"/>
      <rect x="148" y="104" width="44" height="132" rx="18" fill="${C.body}" stroke="${C.bodyLine}" stroke-width="1.5" fill-opacity=".92"/>
      <rect x="126" y="226" width="20" height="5" rx="2" fill="${C.bodyLine}"/><rect x="194" y="226" width="20" height="5" rx="2" fill="${C.bodyLine}"/>
      <rect x="144" y="176" width="52" height="56" rx="6" fill="${C.engine}" stroke="${C.accent}" stroke-dasharray="4 3"/>
      ${board(146, 184, 44, 40)}
      ${phoneUnder(157, 192, 22, 26)}
      ${T(200, 172, 'MOTOR', { fill: C.accent, size: 11, weight: 800, anchor: 'start' })}
      <rect x="160" y="238" width="20" height="54" rx="8" fill="${C.wheel}" stroke="${C.rim}"/>
      <line x1="64" y1="176" x2="64" y2="232" stroke="#fff" stroke-width="2"/>
      <line x1="64" y1="231" x2="126" y2="231" stroke="#fff" stroke-dasharray="2 2"/>
      ${T(14, 256, 'marca de la tabla =', { fill: C.text, size: 10, weight: 700, anchor: 'start' })}${T(14, 269, 'borde de la estribera', { fill: C.muted, size: 10, anchor: 'start' })}
      <path d="M20,204 L60,204" stroke="${C.accent}" stroke-width="2" marker-end="url(#ar)"/>
      ${T(14, 160, 'empuja la tabla', { fill: C.accent, size: 11, weight: 700, anchor: 'start' })}${T(14, 174, 'desde el lateral', { fill: C.accent, size: 11, weight: 700, anchor: 'start' })}
      ${T(276, 214, 'móvil centrado', { fill: C.text, size: 11, weight: 700 })}${T(276, 228, 'debajo del motor', { fill: C.text, size: 11 })}
      <line x1="232" y1="218" x2="182" y2="206" stroke="${C.muted}" stroke-dasharray="2 3"/>
    </svg>`;
  }

  function motoSide() {
    return `<svg viewBox="0 0 340 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Moto vista de lado con el móvil en el suelo debajo del motor">${defs}
      ${T(170, 16, 'VISTA DE LADO', { fill: C.muted, size: 11, weight: 700 })}
      ${T(326, 34, 'delante ▶', { fill: C.muted, size: 11, anchor: 'end' })}
      <line x1="10" y1="190" x2="330" y2="190" stroke="${C.ground}" stroke-width="3"/>
      <circle cx="74" cy="152" r="37" fill="${C.wheel}" stroke="${C.rim}" stroke-width="2"/><circle cx="74" cy="152" r="8" fill="${C.rim}"/>
      <circle cx="252" cy="152" r="37" fill="${C.wheel}" stroke="${C.rim}" stroke-width="2"/><circle cx="252" cy="152" r="8" fill="${C.rim}"/>
      <line x1="252" y1="152" x2="226" y2="66" stroke="${C.bodyLine}" stroke-width="6" stroke-linecap="round"/>
      <line x1="220" y1="62" x2="206" y2="52" stroke="${C.bodyLine}" stroke-width="5" stroke-linecap="round"/>
      <path d="M74,152 L118,104 L216,98" fill="none" stroke="${C.bodyLine}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M138,84 Q162,64 214,72 L218,92 L138,98 Z" fill="${C.body}" stroke="${C.bodyLine}"/>
      <path d="M80,90 L140,84 L138,98 L86,100 Z" fill="${C.body}" stroke="${C.bodyLine}"/>
      <rect x="132" y="104" width="64" height="54" rx="8" fill="${C.engine}" stroke="${C.accent}" stroke-dasharray="4 3"/>
      ${T(164, 128, 'MOTOR', { fill: C.accent, size: 11, weight: 800 })}${T(164, 142, '(cárter)', { fill: C.accent, size: 10 })}
      <path d="M196,150 Q150,176 40,166" fill="none" stroke="${C.bodyLine}" stroke-width="4" stroke-linecap="round"/>
      ${board(124, 184, 80, 5)}
      <rect x="149" y="179" width="30" height="5" rx="1.5" fill="${C.accent}"/>
      <line x1="164" y1="159" x2="164" y2="176" stroke="${C.accent}" stroke-width="1.5" marker-end="url(#ar)"/>
      ${T(170, 210, 'móvil sobre la tabla, justo debajo del motor', { fill: C.text, size: 11, weight: 700 })}
    </svg>`;
  }

  const STEPS = {
    coche: [
      'Coche en llano, freno de mano y punto muerto (P en automático), ruedas rectas.',
      'Pon el móvil sobre una tabla o cartón rígido (siempre la misma), en un sitio marcado, con la pantalla hacia arriba y el micrófono hacia delante. Sin funda.',
      'Pulsa Grabar (cuenta atrás de 10 s) y empuja la tabla desde delante hasta que la marca coincida con el borde del paragolpes: el móvil queda centrado justo debajo del motor.',
      'No metas el cuerpo debajo del coche. Si el tubo de escape o el catalizador pasan por debajo del motor, desplaza la marca para que el móvil no quede bajo ellos.',
      'Cuando el móvil vibre dos veces, la grabación ha terminado: tira de la tabla para sacarlo.'
    ],
    moto: [
      'Moto en llano, siempre sobre el mismo caballete (el lateral si el central no deja hueco), en punto muerto.',
      'Pon el móvil sobre una tabla o cartón rígido (siempre la misma), en un sitio marcado, con la pantalla hacia arriba y el micrófono hacia delante. Sin funda.',
      'Pulsa Grabar (cuenta atrás de 10 s) y empuja la tabla desde el lateral hasta que la marca coincida con el borde de la estribera: el móvil queda centrado debajo del motor.',
      'Que el móvil no quede debajo del colector ni del tubo de escape: se calientan mucho.',
      'Cuando el móvil vibre dos veces, la grabación ha terminado: tira de la tabla para sacarlo.'
    ]
  };
  const CHECK = {
    coche: 'Móvil en la tabla, debajo del motor (marca en el borde del paragolpes)',
    moto: 'Móvil en la tabla, debajo del motor (marca en el borde de la estribera)'
  };

  function infographic(type) {
    type = type === 'moto' ? 'moto' : 'coche';
    const a = type === 'moto' ? motoTop() : carTop();
    const b = type === 'moto' ? motoSide() : carFront();
    return `<div class="infog">${a}${b}</div>
      <ol class="steps">${STEPS[type].map(s => `<li>${s}</li>`).join('')}</ol>`;
  }

  function mini(type) { return `<div class="infog">${type === 'moto' ? motoTop() : carTop()}</div>`; }

  root.Placement = { infographic, mini, CHECK };
})(window);
