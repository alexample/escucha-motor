/* Escucha Motor — explicaciones de cada dato técnico (botón «i») */
(function (root) {
  'use strict';
  const INFO = {
    rpm: {
      t: 'Revoluciones estimadas (rpm)',
      b: `<p>Son las vueltas por minuto del cigüeñal, calculadas solo a partir del sonido.</p>
        <p><b>Cómo se calcula:</b> en un motor de 4 tiempos cada cilindro explota una vez cada dos vueltas. La app busca el ritmo con que se repiten las explosiones (la <i>frecuencia de encendido</i>) y aplica: rpm = frecuencia × 120 ÷ nº de cilindros. Por eso es importante indicar bien los cilindros del vehículo.</p>
        <p><b>Valores normales:</b> al ralentí en caliente, la mayoría de motores van entre 650 y 950 rpm; en frío, algo más altos (1.000–1.300) durante el primer minuto.</p>
        <p><b>Qué indica un cambio:</b> si con el motor caliente el ralentí sube o baja más de un 10% respecto a otras fichas, puede deberse a una toma de aire, la mariposa o válvula de ralentí sucias, un sensor de temperatura o simplemente a que el motor no estaba igual de caliente.</p>
        <p class="muted">Si la estimación sale disparatada (la mitad o el doble de lo que marca el cuentarrevoluciones), revisa el número de cilindros.</p>`
    },
    firing: {
      t: 'Frecuencia de encendido',
      b: `<p>Es el número de explosiones por segundo de todo el motor, en hercios (Hz). Es el «latido» básico del sonido y la nota grave que se oye al ralentí.</p>
        <p><b>Ejemplo:</b> un 4 cilindros a 800 rpm da 800 ÷ 60 × 4 ÷ 2 ≈ 26,7 explosiones por segundo (26,7 Hz).</p>
        <p>Comparar esta frecuencia entre fichas es lo mismo que comparar las rpm. Sirve también para saber si un tono o una zona del espectro sigue al motor: si las rpm suben un 5%, todo lo que gira con el motor sube un 5%.</p>`
    },
    periodicity: {
      t: 'Regularidad del ritmo',
      b: `<p>Mide lo parecido que es cada ciclo del motor al siguiente, de 0% (sin ritmo reconocible) a 100% (todos los ciclos idénticos).</p>
        <p><b>Cómo se calcula:</b> se extrae la envolvente del sonido (cómo sube y baja el volumen con cada explosión) y se compara consigo misma desplazada un periodo (autocorrelación). Cuanto más se parezca, más regular es el motor.</p>
        <p><b>Valores orientativos:</b> por encima del 70% es un ralentí regular; entre 35% y 70% hay cierta irregularidad o ruido ajeno; por debajo del 35% el ritmo apenas se distingue.</p>
        <p><b>Qué puede indicar:</b> un ralentí que «tiembla», fallos de encendido o una mezcla incorrecta. También baja si hay viento, gente hablando o el móvil está mal colocado.</p>`
    },
    imbalance: {
      t: 'Desequilibrio entre cilindros',
      b: `<p>Indica si algún cilindro trabaja distinto que los demás.</p>
        <p><b>Cómo se calcula:</b> si todos los cilindros queman igual, el sonido se repite a la frecuencia de encendido. Si uno quema menos (o más), el patrón solo se repite una vez por ciclo completo del motor (cada dos vueltas), y aparece energía en frecuencias más bajas: ½, ¼… de la de encendido. El índice compara esa energía «de ciclo» con la de encendido.</p>
        <p><b>Valores orientativos:</b> por debajo de 0,2 es normal; de 0,2 a 0,35 conviene vigilarlo; por encima de 0,35 es la firma típica de un cilindro que falla.</p>
        <p><b>Causas habituales:</b> bujía gastada, bobina o cable de encendido, inyector sucio o que gotea, compresión baja en un cilindro (segmentos, válvula), o una toma de aire cerca de un cilindro.</p>
        <p class="muted">Solo se calcula si el número de cilindros es correcto. En motores de 1 cilindro no aplica.</p>`
    },
    cycleCv: {
      t: 'Irregularidad entre explosiones',
      b: `<p>Mide cuánto varía la fuerza de una explosión a la siguiente.</p>
        <p><b>Cómo se calcula:</b> se divide la grabación en periodos de encendido y se mide la energía de cada uno. Se usa una medida robusta (la desviación mediana), para que un golpe suelto o un ruido puntual no la dispare.</p>
        <p><b>Valores orientativos:</b> hasta un 28% es normal en ralentí; entre 28% y 35% hay que vigilarlo; por encima de 35% las explosiones son claramente irregulares.</p>
        <p><b>Qué puede indicar:</b> combustión inestable (mezcla pobre, entrada de aire, EGR que no cierra), fallos de encendido intermitentes o soportes de motor gastados que dejan que el motor se mueva.</p>`
    },
    weakPct: {
      t: 'Explosiones débiles',
      b: `<p>Porcentaje de explosiones con menos de la mitad de energía que una explosión normal, y cuántas hay por minuto.</p>
        <p><b>Cómo leerlo:</b> si es aproximadamente 1 de cada N explosiones (N = nº de cilindros), por ejemplo un 25% en un 4 cilindros, apunta a <b>un cilindro concreto</b> que falla siempre. Si son pocas y repartidas, son fallos intermitentes.</p>
        <p><b>Valores orientativos:</b> menos de 6 por minuto es normal; más de 20 por minuto es compatible con fallos de encendido o de inyección.</p>
        <p class="muted">Un fallo de encendido continuado puede dañar el catalizador: si se confirma al repetir la grabación, conviene revisarlo pronto.</p>`
    },
    hfKurtosis: {
      t: 'Impulsividad en agudos (golpeteo)',
      b: `<p>Mide si en los agudos (por encima de 2 kHz) hay golpes secos y metálicos o un sonido continuo.</p>
        <p><b>Cómo se calcula:</b> se filtran los agudos y se calcula la <i>curtosis</i>, un indicador estadístico que vale 3 para un ruido uniforme y sube mucho cuando hay picos cortos y fuertes (clics, golpes). Se calcula por segundos y se toma el valor mediano, así que un golpe aislado (por ejemplo, al empujar la tabla) no lo altera.</p>
        <p><b>Valores orientativos:</b> en motores sanos suele estar entre 5 y 25; los diésel e inyectores directos dan valores más altos de forma normal. Lo importante es <b>si crece entre fichas</b> del mismo vehículo: un aumento del 30% merece atención y uno del 80% es claro.</p>
        <p><b>Causas habituales:</b> taqués o empujadores hidráulicos sin aceite, holgura de válvulas, cadena de distribución destensada, inyectores ruidosos o, en casos graves, picado de biela.</p>`
    },
    levelDb: {
      t: 'Nivel (dBFS)',
      b: `<p>Es el volumen medio de la grabación en decibelios respecto al máximo que admite el micrófono (0 dBFS). Siempre es negativo: −20 es fuerte, −50 es flojo.</p>
        <p><b>Para qué sirve:</b> sobre todo para comprobar la calidad. Con el móvil debajo del motor lo normal es entre −35 y −15 dBFS. Por debajo de −55 el motor apenas se oye y la grabación no es fiable; si llega a 0 dBFS, satura.</p>
        <p class="muted">Como depende mucho de la posición exacta del móvil, el análisis compara la forma del sonido y no su volumen absoluto.</p>`
    },
    levelStd: {
      t: 'Estabilidad del volumen',
      b: `<p>Cuánto sube y baja el volumen a lo largo de la grabación, medido en tramos de medio segundo.</p>
        <p>Si oscila más de ±1,5 dB, el régimen del motor no era estable (sube y baja) o hubo ruidos ajenos: un coche pasando, el electroventilador, alguien hablando.</p>`
    },
    centroid: {
      t: 'Centro tonal',
      b: `<p>Es la frecuencia «media» del sonido, ponderada por su energía: indica si el motor suena más grave o más agudo.</p>
        <p><b>Qué indica un cambio:</b> si sube mucho (más de un 20%), el sonido se ha vuelto más metálico o silbante (correas, rodamientos, golpeteos, fugas de escape cerca del colector). Si baja, suena más apagado o retumbante (escape, soportes del motor).</p>`
    },
    bands: {
      t: 'Bandas de frecuencia',
      b: `<p>El sonido se reparte en seis zonas de frecuencia y se mide qué parte de la energía total cae en cada una (en dB relativos, por eso son negativos). Al ser relativos, no dependen del volumen de la grabación.</p>
        <ul>
          <li><b>20–100 Hz:</b> pulsos de combustión, escape, soportes del motor.</li>
          <li><b>100–300 Hz:</b> escape y cuerpo del motor.</li>
          <li><b>300 Hz–1 kHz:</b> admisión y mecánica general.</li>
          <li><b>1–3 kHz:</b> distribución, taqués, inyectores.</li>
          <li><b>3–8 kHz:</b> silbidos de correas, rodamientos, turbo.</li>
          <li><b>8–16 kHz:</b> roces metálicos y fugas de aire.</li>
        </ul>
        <p>Un cambio de ±4 dB en una banda entre fichas es apreciable; de 7 dB o más, importante.</p>`
    },
    tones: {
      t: 'Tonos destacados',
      b: `<p>Son frecuencias concretas que sobresalen al menos 12 dB por encima del sonido de alrededor: un silbido o zumbido «afinado».</p>
        <p><b>Qué puede indicar:</b> silbido de correa (alternador, accesorios), rodamiento de alternador, tensor, polea o bomba de agua, o el turbo.</p>
        <p><b>Cómo leer la comparación:</b> un tono <b>nuevo</b> que antes no estaba es lo más relevante. Si un tono se <b>desplaza</b>, mira si las rpm también han cambiado en la misma proporción: si es así, gira con el motor; si no, puede ser una pieza que cambia de estado.</p>`
    },
    spectrum: {
      t: 'Espectro',
      b: `<p>Es la «huella» del sonido: cuánta energía hay en cada frecuencia, de graves (izquierda) a agudos (derecha). El eje horizontal es logarítmico, como un piano: cada marca duplica o multiplica la frecuencia.</p>
        <p>Las curvas están normalizadas, así que dos grabaciones con distinto volumen pero mismo motor deberían superponerse. Las diferencias de forma son las que interesan.</p>
        <p><b>Señal de alarma de calidad:</b> si la curva cae de golpe en una frecuencia (por ejemplo, a 4 kHz), el móvil ha grabado en modo llamada o con filtros.</p>`
    },
    diff: {
      t: 'Diferencia de espectro',
      b: `<p>Resta el espectro de la ficha anterior al de la nueva, frecuencia a frecuencia.</p>
        <ul>
          <li><b>Barras hacia arriba</b> (naranja; rojo si superan 7 dB): esas frecuencias suenan más fuerte ahora.</li>
          <li><b>Barras hacia abajo</b> (azul): suenan más bajo.</li>
          <li><b>Zona sombreada (±3 dB)</b> y barras grises: diferencias pequeñas, normales entre dos grabaciones del mismo motor.</li>
        </ul>
        <p>Las «zonas que más cambian» resumen los tramos seguidos que superan los 3 dB.</p>`
    },
    bandwidth: {
      t: 'Ancho de banda de la grabación',
      b: `<p>Es hasta qué frecuencia llega realmente el sonido grabado.</p>
        <p>Una buena grabación llega hasta 15–20 kHz. Si el sonido se corta de golpe por debajo de 7 kHz, el móvil ha aplicado su procesado de voz (el mismo de las llamadas), que además borra los ruidos continuos como el del motor. Con esas grabaciones no se emite diagnóstico.</p>
        <p class="muted">La app graba con el micrófono en modo «sin procesar» cuando el móvil lo permite. Si aun así aparece este aviso, quita la funda, desconecta auriculares Bluetooth y vuelve a grabar.</p>`
    },
    reliable: {
      t: 'Fiabilidad de la grabación',
      b: `<p>Antes de diagnosticar, la app comprueba que la grabación tenga calidad suficiente:</p>
        <ul>
          <li>Volumen por encima de −55 dBFS (que el motor se oiga).</li>
          <li>Sin saturación (menos del 0,5% de muestras al máximo).</li>
          <li>Sonido completo hasta al menos 7 kHz (sin filtros de voz).</li>
          <li>Al menos 5 segundos útiles.</li>
        </ul>
        <p>Si no se cumple, se muestran los datos pero no se emiten avisos de averías, porque serían falsos.</p>`
    }
  };
  // áreas de los avisos → explicación
  const AREA = {
    'Cilindros': 'imbalance', 'Ralentí': 'cycleCv', 'Fallos': 'weakPct', 'Golpeteo': 'hfKurtosis', 'Estabilidad': 'levelStd',
    'Ritmo': 'periodicity', 'Régimen': 'rpm', 'Timbre': 'bands', 'Volumen': 'levelDb', 'Tono nuevo': 'tones', 'Tono': 'tones',
    'Tono desplazado': 'tones', 'Fiabilidad': 'reliable', 'Calidad': 'reliable'
  };
  const btn = key => INFO[key] ? `<button type="button" class="ib" data-info="${key}" aria-label="Más información">i</button>` : '';
  root.Info = { INFO, AREA, btn, area: a => btn(AREA[a]) };
})(window);
