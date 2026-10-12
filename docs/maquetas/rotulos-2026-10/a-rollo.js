'use strict';
/* =====================================================================
   A · Rollo — la pantalla ES la Brother: a la izquierda qué prendas, a la derecha la
   impresora que suelta la tira con los rótulos, uno bajo otro, con sus copias al lado.
   ===================================================================== */
MAQ.A = {
  nombre: 'A · Rollo',
  idea: 'La pantalla es la Brother. A la izquierda eliges las prendas; a la derecha la impresora suelta la tira con los rótulos uno bajo otro, tal como van a salir, cada uno con sus copias al costado. Lo que ves es lo que sale.',
  mov: [
    'Al entrar, la Brother baja a su lugar y se le enciende la luz verde; la tira sale y cada rótulo se imprime en orden: el cabezal (una línea roja que brilla) baja y deja la tinta.',
    'Vacía, la Brother asoma un rótulo de ejemplo en gris con el sello «Así sale un rótulo». Al elegir la primera prenda, <b>ese mismo papel se imprime</b> con la prenda de verdad.',
    'Sumar una prenda alarga la tira: el rótulo nuevo sale impreso al final. Quitarla lo saca de la tira hacia la derecha y los de abajo suben a cerrar el hueco.',
    '«Todas en uno» recoge los rótulos y la Brother imprime uno solo; «Uno por prenda» los vuelve a separar.',
    'Las copias giran como un contador; en 0 el rótulo se apaga con rayas y dice «No sale». Al pie, la tira dice cuántos rótulos salen y cuánto papel usa (la cifra cuenta).',
    'Al imprimir, la luz pasa a ámbar, el cabezal recorre cada rótulo, el botón cuenta «Imprimiendo 3 de 5», una copia de la tira se suelta hacia abajo y sale el aviso «Listo».',
  ],
  bucle: 'la luz verde de la Brother respira despacio (2,6 s) mientras está lista. Apagado, queda fija.',

  montar(pag) {
    this.pag = pag; pag.classList.add('A');
    pag.append(cabecera());
    const g = el(`<div class="a-grid">
      <section class="tarjeta a-elegir sube" style="--i:3" aria-labelledby="a-tit">
        <h2 class="a-tit" id="a-tit">¿Qué prendas van en este anaquel?</h2>
        <div class="pliega" data-solo-vacio><div><p class="a-bajada">Búscalas por nombre o código y el rótulo sale en la Brother, listo para pegar.</p></div></div>
        <div class="chips" data-chips></div>
        <div class="a-busca" data-busca></div>
        <div class="pliega cerrada" data-como><div><div class="a-como"><span class="et">Cómo salen</span><div data-modo></div></div><p class="a-tope" data-tope></p></div></div>
        <p class="a-tambien">También puedes marcarlas en <b>Productos</b> o en <b>Existencias</b> y tocar «Rótulo».</p>
      </section>
      <section class="a-maquina" aria-label="Así salen">
        <div class="brother" data-brother aria-hidden="true">
          <div class="b-tapa"></div>
          <div class="b-frente"><span class="b-luz bucle"></span><span class="b-rotulo">QL · 62 mm</span><span class="b-perilla"></span></div>
        </div>
        <div class="tira" data-tira></div>
        <p class="a-pie" data-pie aria-live="polite"></p>
      </section>
    </div>`);
    pag.append(g, nota(6));
    $('[data-busca]', g).append(crearBuscador({ grande: true, alElegir: agregar }));
    const maq = $('.a-maquina', g);
    const medir = () => { const w = maq.clientWidth; const z = Math.max(0.8, Math.min(1.35, (w - (w > 560 ? 200 : 110)) / 234)); maq.style.setProperty('--z', z.toFixed(3)); };
    medir();
    this.ro = new ResizeObserver(medir); this.ro.observe(maq);
    const br = $('[data-brother]', g);
    luego(() => br.classList.add('encendida'), 820);
    this.render('entrada');
  },
  desmontar() { this.ro?.disconnect(); },

  render(motivo, d) {
    const pag = this.pag; const vacio = !S.ids.length;
    pag.classList.toggle('vacio', vacio);
    $('[data-solo-vacio]', pag).classList.toggle('cerrada', !vacio);
    if (motivo === 'copias') { actualizarPasos(d.clave); $$('.seg[data-k]', pag).forEach((s) => s.classList.toggle('cero', copiasDe(s.dataset.k) === 0)); this.pie(); return; }
    if (motivo !== 'juntar') {
      rehacer($('[data-chips]', pag), modelos().map(chipHTML).join(''), {
        entra: (n) => n.classList.add('entra'),
        sale: (g, fin) => { g.classList.add('sale'); setTimeout(fin, T(280)); },
      });
    }
    $('[data-como]', pag).classList.toggle('cerrada', S.ids.length < 2);
    pintarModo($('[data-modo]', pag));
    $('[data-tope]', pag).textContent = S.ids.length > MAX_JUNTOS ? `Juntas se leen hasta ${MAX_JUNTOS} prendas: con más, va uno por prenda.` : '';
    this.tira(motivo);
    this.pie();
  },

  seg(r, i) {
    const n = copiasDe(r.clave);
    return `<div class="seg ${n === 0 ? 'cero' : ''}" data-k="${esc(r.clave)}">
      <div class="in"><div class="papel z">${rotuloHTML(r)}</div><span class="no-sale" aria-hidden="true">No sale</span><span class="cubre"></span><span class="cabezal"></span></div>
      ${i > 0 ? `<span class="tijera" aria-hidden="true" title="Aquí corta la Brother">${ic('tijera')}</span>` : ''}
      <div class="copias"><span class="guia-l" aria-hidden="true"></span>${pasoHTML(r.clave)}</div></div>`;
  },
  tira(motivo) {
    const tira = $('[data-tira]', this.pag); const rs = rotulos();
    const primera = motivo === 'agregar' && S.ids.length === 1; // el papel de ejemplo se imprime en su sitio
    const html = rs.length ? rs.map((r, i) => this.seg(r, i)).join('')
      : `<div class="seg ejemplo" data-k="ejemplo"><div class="in"><div class="papel z">${rotuloHTML(EJEMPLO, { fantasma: true })}</div></div><div class="copias"><span class="guia-l" aria-hidden="true"></span><span class="sello">Así sale un rótulo</span></div></div>`;
    const salen = motivo === 'juntar' || motivo === 'quitar';
    const nuevos = rehacer(tira, html, {
      sale: (g, fin) => { if (primera || (g.classList.contains('ejemplo'))) { g.classList.add('se-va'); setTimeout(fin, T(240)); return; } g.classList.add('sale'); setTimeout(fin, T(340)); },
    });
    nuevos.forEach((n, i) => {
      if (n.classList.contains('ejemplo')) { n.classList.add('asoma'); return; }
      if (primera) { this.imprimirEnSitio(n, 0); return; }
      const base = motivo === 'entrada' ? 620 : salen ? 260 : 0;
      this.nace(n, base + i * (motivo === 'entrada' ? 380 : 140));
    });
  },
  /* el rótulo sale de la Brother: la tira se alarga y el cabezal deja la tinta mientras baja */
  nace(n, delay) {
    n.classList.add('nace');
    luego(() => { n.classList.add('crece'); n.classList.remove('nace'); luego(() => n.classList.remove('crece'), 760); }, delay + 30);
  },
  imprimirEnSitio(n, delay) {
    n.style.setProperty('--d', '560ms'); n.classList.add('cubierto');
    luego(() => { n.classList.remove('cubierto'); n.classList.add('reimprime'); luego(() => n.classList.remove('reimprime'), 640); }, delay + 60);
  },
  pie() {
    const p = $('[data-pie]', this.pag); const total = totalCopias();
    if (!S.ids.length) { p.innerHTML = ''; p.classList.remove('ve'); return; }
    const cm = Math.round(total * 4.01 * 10) / 10;
    if (!$('[data-cm]', p)) p.innerHTML = `${ic('tijera')}<span><span data-v>Salen</span> <b data-tot>0</b> <span data-u>rótulos</span> · unos <b data-cm>0</b> cm de papel</span>`;
    p.classList.add('ve');
    const tot = $('[data-tot]', p), c = $('[data-cm]', p);
    contar(tot, Number(tot.dataset.v || 0), total, 500); tot.dataset.v = total;
    contar(c, Number(c.dataset.v || 0), cm, 650, 1); c.dataset.v = cm;
    $('[data-u]', p).textContent = total === 1 ? 'rótulo' : 'rótulos'; $('[data-v]', p).textContent = total === 1 ? 'Sale' : 'Salen';
  },

  imprimir(total, avance) {
    return new Promise((fin) => {
      const br = $('[data-brother]', this.pag), tira = $('[data-tira]', this.pag);
      const segs = $$('.seg[data-k]', tira).filter((s) => copiasDe(s.dataset.k) > 0);
      br.classList.add('trabaja');
      const per = Math.max(300, Math.min(560, 1700 / Math.max(1, segs.length)));
      let t = 180, cum = 0;
      segs.forEach((s) => {
        luego(() => { s.style.setProperty('--d', `${per}ms`); s.classList.remove('reimprime'); void s.offsetWidth; s.classList.add('reimprime'); }, t);
        luego(() => { cum += copiasDe(s.dataset.k); avance(cum); }, t + per * 0.85);
        t += per;
      });
      luego(() => { // una copia de la tira se suelta: es lo que acaba de salir
        const c = tira.cloneNode(true); c.removeAttribute('data-tira'); c.classList.add('suelta'); c.setAttribute('aria-hidden', 'true'); c.inert = true;
        $$('.copias,.tijera,.cubre,.cabezal', c).forEach((x) => x.remove()); $$('[data-k]', c).forEach((x) => x.removeAttribute('data-k'));
        c.style.top = `${tira.offsetTop}px`; c.style.left = `${tira.offsetLeft}px`;
        tira.parentNode.append(c); setTimeout(() => c.remove(), T(1000));
      }, t + 60);
      luego(() => { br.classList.remove('trabaja'); segs.forEach((s) => s.classList.remove('reimprime')); fin(); }, t + 760);
    });
  },
};
