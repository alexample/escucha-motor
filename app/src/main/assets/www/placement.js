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

  function carTop() {
    return `<svg viewBox="0 0 340 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Coche visto desde arriba con el móvil junto a la rueda delantera izquierda">${defs}
      ${T(170, 16, 'VISTA DESDE ARRIBA', { fill: C.muted, size: 11, weight: 700 })}
      ${T(300, 46, '▲ delante', { fill: C.muted, size: 11 })}
      <rect x="125" y="34" width="120" height="236" rx="34" fill="${C.body}" stroke="${C.bodyLine}" stroke-width="1.5"/>
      <rect x="137" y="112" width="96" height="34" rx="9" fill="${C.glass}"/>
      <rect x="140" y="214" width="90" height="24" rx="8" fill="${C.glass}"/>
      <rect x="148" y="46" width="74" height="50" rx="6" fill="${C.engine}" stroke="${C.accent}" stroke-dasharray="4 3"/>
      ${T(185, 76, 'MOTOR', { fill: C.accent, size: 11, weight: 800 })}
      <rect x="111" y="56" width="18" height="44" rx="5" fill="${C.wheel}" stroke="${C.rim}"/>
      <rect x="241" y="56" width="18" height="44" rx="5" fill="${C.wheel}" stroke="${C.rim}"/>
      <rect x="111" y="200" width="18" height="44" rx="5" fill="${C.wheel}" stroke="${C.rim}"/>
      <rect x="241" y="200" width="18" height="44" rx="5" fill="${C.wheel}" stroke="${C.rim}"/>
      <line x1="40" y1="78" x2="111" y2="78" stroke="${C.muted}" stroke-dasharray="3 3"/>
      ${phoneTop(44, 68, 30, 20, 'right')}
      ${dimH(77, 111, 110, '20 cm')}
      <path d="M76,60 Q92,46 108,58" fill="none" stroke="${C.accent}" stroke-width="1.5" marker-end="url(#ar)"/>
      ${T(60, 52, 'micrófono', { fill: C.accent, size: 11, weight: 700 })}
      ${T(66, 140, 'centrado con', { fill: C.muted, size: 11 })}${T(66, 154, 'el eje de la rueda', { fill: C.muted, size: 11 })}
      ${T(40, 196, 'lado', { fill: C.muted, size: 11, anchor: 'start' })}${T(40, 210, 'izquierdo', { fill: C.muted, size: 11, anchor: 'start' })}
    </svg>`;
  }

  function carFront() {
    return `<svg viewBox="0 0 340 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Coche visto de frente con el móvil en el suelo junto a la rueda">${defs}
      ${T(170, 16, 'VISTA DE FRENTE', { fill: C.muted, size: 11, weight: 700 })}
      <path d="M62,168 L66,118 Q70,100 92,96 L118,62 Q124,54 136,54 L204,54 Q216,54 222,62 L248,96 Q270,100 274,118 L278,168 Z" fill="${C.body}" stroke="${C.bodyLine}" stroke-width="1.5"/>
      <path d="M126,66 L214,66 L238,96 L102,96 Z" fill="${C.glass}"/>
      <rect x="128" y="124" width="84" height="22" rx="5" fill="${C.glass}"/>
      <rect x="76" y="108" width="34" height="12" rx="4" fill="#d9dde3" opacity=".75"/>
      <rect x="230" y="108" width="34" height="12" rx="4" fill="#d9dde3" opacity=".75"/>
      <rect x="66" y="150" width="30" height="50" rx="7" fill="${C.wheel}" stroke="${C.rim}"/>
      <rect x="244" y="150" width="30" height="50" rx="7" fill="${C.wheel}" stroke="${C.rim}"/>
      <line x1="10" y1="200" x2="330" y2="200" stroke="${C.ground}" stroke-width="3"/>
      <rect x="292" y="194" width="34" height="5" rx="2" fill="${C.cloth}"/>
      <rect x="295" y="190" width="28" height="4" rx="1.5" fill="${C.accent}"/>
      ${dimH(274, 293, 178, '20 cm')}
      ${T(336, 216, 'paño doblado', { fill: C.cloth, size: 10, weight: 700, anchor: 'end' })}
      ${T(334, 64, 'pantalla', { fill: C.muted, size: 11, anchor: 'end' })}${T(334, 77, 'hacia arriba', { fill: C.muted, size: 11, anchor: 'end' })}<line x1="312" y1="84" x2="309" y2="184" stroke="${C.muted}" stroke-dasharray="2 3"/>
      ${T(30, 216, 'rueda derecha', { fill: C.muted, size: 10, anchor: 'start' })}
    </svg>`;
  }

  function motoTop() {
    return `<svg viewBox="0 0 340 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Moto vista desde arriba con el móvil delante de la rueda delantera">${defs}
      ${T(170, 16, 'VISTA DESDE ARRIBA', { fill: C.muted, size: 11, weight: 700 })}
      ${T(300, 46, '▲ delante', { fill: C.muted, size: 11 })}
      <line x1="170" y1="30" x2="170" y2="290" stroke="${C.muted}" stroke-dasharray="3 3"/>
      ${phoneTop(158, 34, 24, 38, 'down')}
      ${dimV(200, 75, 108, '30 cm')}
      <path d="M150,72 Q138,90 156,104" fill="none" stroke="${C.accent}" stroke-width="1.5" marker-end="url(#ar)"/>
      ${T(112, 72, 'micrófono', { fill: C.accent, size: 11, weight: 700 })}
      <rect x="160" y="108" width="20" height="62" rx="8" fill="${C.wheel}" stroke="${C.rim}"/>
      <line x1="112" y1="158" x2="228" y2="158" stroke="${C.bodyLine}" stroke-width="5" stroke-linecap="round"/>
      <rect x="148" y="166" width="44" height="86" rx="18" fill="${C.body}" stroke="${C.bodyLine}" stroke-width="1.5"/>
      <rect x="146" y="196" width="48" height="34" rx="6" fill="${C.engine}" stroke="${C.accent}" stroke-dasharray="4 3"/>
      ${T(240, 218, 'MOTOR', { fill: C.accent, size: 11, weight: 800, anchor: 'start' })}
      <line x1="196" y1="213" x2="236" y2="213" stroke="${C.accent}" stroke-width="1" stroke-dasharray="2 2"/>
      <rect x="160" y="246" width="20" height="50" rx="8" fill="${C.wheel}" stroke="${C.rim}"/>
      ${T(66, 140, 'centrado con', { fill: C.muted, size: 11 })}${T(66, 154, 'la rueda', { fill: C.muted, size: 11 })}
    </svg>`;
  }

  function motoSide() {
    return `<svg viewBox="0 0 340 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Moto vista de lado con el móvil en el suelo delante de la rueda delantera">${defs}
      ${T(170, 16, 'VISTA DE LADO', { fill: C.muted, size: 11, weight: 700 })}
      ${T(326, 34, 'delante ▶', { fill: C.muted, size: 11, anchor: 'end' })}
      <line x1="10" y1="190" x2="330" y2="190" stroke="${C.ground}" stroke-width="3"/>
      <circle cx="74" cy="152" r="37" fill="${C.wheel}" stroke="${C.rim}" stroke-width="2"/><circle cx="74" cy="152" r="8" fill="${C.rim}"/>
      <circle cx="232" cy="152" r="37" fill="${C.wheel}" stroke="${C.rim}" stroke-width="2"/><circle cx="232" cy="152" r="8" fill="${C.rim}"/>
      <line x1="232" y1="152" x2="206" y2="66" stroke="${C.bodyLine}" stroke-width="6" stroke-linecap="round"/>
      <line x1="200" y1="62" x2="186" y2="52" stroke="${C.bodyLine}" stroke-width="5" stroke-linecap="round"/>
      <path d="M74,152 L118,104 L196,98" fill="none" stroke="${C.bodyLine}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M128,84 Q150,64 196,72 L200,92 L128,98 Z" fill="${C.body}" stroke="${C.bodyLine}"/>
      <path d="M78,90 L130,84 L128,98 L84,100 Z" fill="${C.body}" stroke="${C.bodyLine}"/>
      <rect x="128" y="104" width="52" height="46" rx="8" fill="${C.engine}" stroke="${C.accent}" stroke-dasharray="4 3"/>
      ${T(154, 132, 'MOTOR', { fill: C.accent, size: 11, weight: 800 })}
      <path d="M128,148 Q96,170 40,166" fill="none" stroke="${C.bodyLine}" stroke-width="4" stroke-linecap="round"/>
      <rect x="290" y="184" width="34" height="5" rx="2" fill="${C.cloth}"/>
      <rect x="293" y="180" width="28" height="4" rx="1.5" fill="${C.accent}"/>
      ${dimH(269, 291, 166, '30 cm')}
      ${T(336, 205, 'paño doblado', { fill: C.cloth, size: 10, weight: 700, anchor: 'end' })}
      ${T(300, 128, 'micrófono', { fill: C.accent, size: 11, weight: 700 })}${T(300, 141, 'hacia la rueda', { fill: C.accent, size: 11, weight: 700 })}
    </svg>`;
  }

  const STEPS = {
    coche: [
      'Coche en llano, freno de mano y punto muerto (P en automático). Capó cerrado.',
      'Móvil en el suelo, en el lado izquierdo, a 20 cm del neumático delantero y centrado con el eje de la rueda.',
      'Pantalla hacia arriba y el borde del micrófono apuntando a la rueda.',
      'Debajo, siempre el mismo paño doblado: aísla de las vibraciones del suelo.',
      'Marca el sitio con cinta en el suelo y las ruedas rectas, para repetirlo igual cada vez.'
    ],
    moto: [
      'Moto en llano, sobre el caballete central (o siempre el mismo), en punto muerto.',
      'Móvil en el suelo, delante de la rueda delantera, a 30 cm del neumático y centrado con ella.',
      'Pantalla hacia arriba y el borde del micrófono apuntando a la rueda.',
      'Debajo, siempre el mismo paño doblado: aísla de las vibraciones del suelo.',
      'Manillar recto. Marca el sitio con cinta en el suelo para repetirlo igual cada vez.'
    ]
  };
  const CHECK = {
    coche: 'Móvil en la marca: 20 cm de la rueda delantera izquierda, micro hacia la rueda',
    moto: 'Móvil en la marca: 30 cm delante de la rueda delantera, micro hacia la rueda'
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
