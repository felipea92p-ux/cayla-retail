'use strict';
/* =====================================================================
   B · Anaquel — el rótulo ya pegado en el canto, bajo su pila de prendas, como lo verá
   quien busca en el almacén; «Mirar desde» aleja el anaquel para probar si se lee de lejos.
   ===================================================================== */
const DISTANCIAS = [{ m: 0.5, txt: 'Cerca' }, { m: 1.5, txt: '1,5 m' }, { m: 3, txt: '3 m' }];

MAQ.B = {
  nombre: 'B · Anaquel',
  idea: 'Se ve el anaquel del almacén con cada rótulo pegado en su canto, bajo su pila de prendas, como lo verá quien viene a buscar. «Mirar desde» te aleja a 1,5 y a 3 metros para saber, antes de imprimir, si el nombre se lee de lejos.',
  mov: [
    'Al entrar se arma el anaquel: los parantes suben del piso, las repisas se deslizan, cada pila se dobla prenda por prenda y su rótulo se pega en el canto (baja, se asienta y un brillo lo cruza una sola vez).',
    'Vacío, el anaquel espera con el lugar de cada rótulo marcado en punteado: «Aquí va el rótulo».',
    'Sumar una prenda arma su pila y pega su rótulo en el siguiente lugar libre; quitarla despega el rótulo (se levanta de una esquina) y las demás se corren a llenar el hueco.',
    '«Todas en uno» corre las pilas juntas a la primera repisa y pega un solo rótulo debajo de todas.',
    '«Mirar desde» aleja el anaquel con un zoom suave (a 1,5 m se ve a un tercio, a 3 m a un sexto, como lo vería tu ojo) y bajo cada rótulo que ya no se lee aparece «De aquí cuesta leerlo».',
    'Al imprimir, el botón se llena de verde de izquierda a derecha mientras cuenta, y cada rótulo del anaquel recibe su visto, en orden.',
  ],
  bucle: 'ninguno: todo responde a lo que tocas.',
  lejos: 0,

  montar(pag) {
    this.pag = pag; pag.classList.add('B'); this.lejos = 0; this.repisasAntes = 0;
    pag.append(cabecera());
    const g = el(`<div class="b-grid">
      <section class="tarjeta b-lista sube" style="--i:3" aria-labelledby="b-tit">
        <h2 class="b-tit" id="b-tit">¿Qué prendas van en este anaquel?</h2>
        <div class="pliega" data-solo-vacio><div><p class="b-bajada">Búscalas por nombre o código. Cada una se pega en el anaquel de la derecha, en el orden en que las eliges: de izquierda a derecha y de arriba abajo.</p></div></div>
        <div class="b-busca" data-busca></div>
        <ol class="b-filas" data-filas aria-label="Prendas elegidas"></ol>
        <div class="pliega cerrada" data-como><div><div class="b-como"><div class="b-como-fila"><span class="et">Cómo salen</span><div data-modo></div></div><p class="b-tope" data-tope></p><div class="b-junto" data-junto></div></div></div></div>
        <p class="b-tambien">También puedes marcarlas en <b>Productos</b> o en <b>Existencias</b> y tocar «Rótulo».</p>
      </section>
      <section class="b-escena sube" style="--i:4" aria-label="Así queda en el anaquel">
        <div class="b-barra">
          <span class="et">Así queda en el anaquel</span>
          <div class="b-dist" role="group" aria-label="Mirar desde">${ic('ojo')}<span class="b-dist-et">Mirar desde</span>${DISTANCIAS.map((d, i) => `<button type="button" class="pildora" data-lejos="${i}" aria-pressed="${i === 0}">${d.txt}</button>`).join('')}</div>
        </div>
        <div class="b-pared" data-pared>
          <div class="b-mueble arma" data-mueble>
            <span class="b-poste izq" aria-hidden="true"></span><span class="b-poste der" aria-hidden="true"></span>
            <div class="b-repisas" data-repisas></div>
            <span class="b-zocalo" aria-hidden="true"></span>
          </div>
        </div>
        <p class="b-veredicto" data-veredicto aria-live="polite"></p>
      </section>
    </div>`);
    pag.append(g, nota(6));
    $('[data-busca]', g).append(crearBuscador({ grande: true, alElegir: agregar }));
    g.addEventListener('click', (e) => { const b = e.target.closest('[data-lejos]'); if (b) this.mirar(Number(b.dataset.lejos)); });
    const esc = $('.b-escena', g);
    const medir = () => {
      const w = $('[data-pared]', g).clientWidth;
      const porRepisa = w >= 640 ? 2 : 1;
      const z = porRepisa === 2 ? Math.min(1, (w - 120) / (2 * 258)) : Math.min(1, (w - 70) / 258);
      const cambio = porRepisa !== this.porRepisa;
      this.porRepisa = porRepisa; esc.style.setProperty('--z', Math.max(0.6, z).toFixed(3));
      if (cambio && this.listo) this.render('medida');
    };
    medir();
    this.ro = new ResizeObserver(medir); this.ro.observe($('[data-pared]', g));
    this.listo = true;
    this.render('entrada');
    luego(() => $('[data-mueble]', g)?.classList.remove('arma'), 2600);
  },
  desmontar() { this.ro?.disconnect(); this.listo = false; },

  render(motivo, d) {
    const pag = this.pag; const vacio = !S.ids.length;
    pag.classList.toggle('vacio', vacio);
    $('[data-solo-vacio]', pag).classList.toggle('cerrada', !vacio);
    if (motivo === 'copias') {
      actualizarPasos(d.clave);
      $$('.b-puesto[data-k]', pag).forEach((p) => p.classList.toggle('cero', copiasDe(p.dataset.k) === 0));
      $$('.b-fila[data-k]', pag).forEach((f) => f.classList.toggle('cero', !juntas() && copiasDe(f.dataset.k) === 0));
      return;
    }
    if (motivo !== 'medida') this.filas(motivo);
    $('[data-como]', pag).classList.toggle('cerrada', S.ids.length < 2);
    pintarModo($('[data-modo]', pag));
    $('[data-tope]', pag).textContent = S.ids.length > MAX_JUNTOS ? `Juntas se leen hasta ${MAX_JUNTOS} prendas: con más, va uno por prenda.` : '';
    const junto = $('[data-junto]', pag); const rs = rotulos();
    junto.innerHTML = juntas() ? `<span class="b-junto-t">Un solo rótulo para las ${S.ids.length}</span>${pasoHTML(rs[0].clave)}` : '';
    this.mueble(motivo);
    this.veredicto();
  },

  filas(motivo) {
    const ms = modelos(); const conPaso = !juntas();
    rehacer($('[data-filas]', this.pag), ms.map((m, i) => {
      const r = unRotulo([m]); const { mm } = medidaNombre(r.modelos);
      return `<li class="b-fila ${conPaso && copiasDe(m.id) === 0 ? 'cero' : ''}" data-k="${m.id}">
        <span class="b-n" aria-hidden="true">${i + 1}</span>${mini(m)}
        <div class="b-txt"><b>${esc(m.ref)}</b><span>${esc(m.marca)} · ${esc(tallasTexto(r.tallas))}</span></div>
        ${conPaso ? pasoHTML(m.id, { etiqueta: false }) : '<span></span>'}
        <button type="button" class="x" data-quitar="${m.id}" aria-label="Quitar ${esc(m.ref)}">${ic('x')}</button></li>`;
    }).join(''), {
      entra: (n, i) => { n.classList.add('entra'); if (motivo === 'entrada') n.style.animationDelay = `${380 + i * 60}ms`; },
      sale: (g, fin) => { g.classList.add('sale'); setTimeout(fin, T(300)); },
    });
  },

  /* ---------- el anaquel ---------- */
  pila(m, ancho) {
    let capas = '';
    for (let k = 0; k < 8; k++) capas += `<i style="--k:${k};--x:${(hash(m.id + k) % 9) - 4}px;--w:${86 + (hash(m.id + 'w' + k) % 12)}%"></i>`;
    return `<div class="b-pila" data-color-dato style="--c:${m.color};--ancho:${ancho}">${capas}</div>`;
  },
  puesto(r) {
    const n = r.prendas.length; const ancho = n === 1 ? 1 : n === 2 ? 0.62 : n === 3 ? 0.46 : 0.36;
    const { mm } = medidaNombre(r.modelos);
    return `<div class="b-puesto ${copiasDe(r.clave) === 0 ? 'cero' : ''} ${n > 1 ? 'junto' : ''}" data-k="${esc(r.clave)}" data-mm="${mm}" style="--n:${n}">
      <div class="b-pilas">${r.prendas.map((m) => this.pila(m, ancho)).join('')}</div>
      <div class="b-pegado"><div class="papel z">${rotuloHTML(r)}</div><span class="b-brillo" aria-hidden="true"></span>
        <span class="b-visto" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>
        <span class="b-no-sale" aria-hidden="true">No sale</span></div>
      <span class="b-cuesta">De aquí cuesta leerlo</span></div>`;
  },
  hueco(i) { return `<div class="b-puesto hueco" data-k="hueco-${i}"><div class="b-pilas"></div><div class="b-pegado"><span>Aquí va el rótulo</span></div></div>`; },
  mueble(motivo) {
    const rs = rotulos(); const por = juntas() ? 1 : this.porRepisa;
    const items = rs.map((r) => this.puesto(r));
    // la última repisa se completa con lugares libres; vacío, el anaquel muestra dos repisas por llenar
    const lugares = rs.length ? Math.ceil(rs.length / por) * por : 2 * por;
    for (let i = rs.length; i < lugares; i++) items.push(this.hueco(i));
    const repisas = [];
    for (let i = 0; i < items.length; i += por) repisas.push(items.slice(i, i + por));
    const antes = this.repisasAntes;
    const html = repisas.map((p, i) => `<div class="b-repisa ${i >= antes && motivo !== 'entrada' ? 'nueva' : ''}" style="--r:${i};--por:${por}"><div class="b-puestos">${p.join('')}</div><span class="b-canto" aria-hidden="true"></span></div>`).join('');
    this.repisasAntes = repisas.length;
    const cont = $('[data-repisas]', this.pag);
    const escala = DISTANCIAS[this.lejos].m === 0.5 ? 1 : 0.5 / DISTANCIAS[this.lejos].m;
    const nuevos = rehacer(cont, html, {
      escala, dur: 560,
      sale: (g, fin) => { if (g.classList.contains('hueco')) return fin(); g.classList.remove('arma', 'visto', 'cuesta'); g.classList.add('despega'); setTimeout(fin, T(420)); },
    });
    let orden = 0;
    nuevos.forEach((n) => {
      if (n.classList.contains('hueco')) { n.classList.add('aparece'); n.style.setProperty('--dl', `${motivo === 'entrada' ? 1100 : 200}ms`); return; }
      const base = motivo === 'entrada' ? 900 : motivo === 'juntar' ? 300 : 120;
      n.style.setProperty('--dl', `${base + orden * 220}ms`); n.classList.add('arma'); orden++;
      luego(() => n.classList.remove('arma'), base + orden * 220 + 1500);
    });
    this.alto();
  },
  /* el alto de la pared es el del anaquel visto de cerca: al alejarse, queda pared alrededor */
  alto() {
    const m = $('[data-mueble]', this.pag), p = $('[data-pared]', this.pag);
    const H = m.offsetHeight, d = DISTANCIAS[this.lejos], s = d.m === 0.5 ? 1 : 0.5 / d.m;
    if (s === 1) { p.style.setProperty('--alto', `${H + 28 + 40}px`); m.style.setProperty('--ty', '0px'); return; }
    // de lejos: la pared se acorta y el anaquel, ya chico, queda al centro, con pared alrededor
    const alto = Math.max(380, H * s + 260);
    p.style.setProperty('--alto', `${alto}px`); m.style.setProperty('--ty', `${(alto - 28 - H * s) / 2}px`);
  },
  mirar(i) {
    this.lejos = i;
    const d = DISTANCIAS[i]; const s = d.m === 0.5 ? 1 : 0.5 / d.m;
    $$('[data-lejos]', this.pag).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.lejos) === i)));
    const m = $('[data-mueble]', this.pag); m.style.setProperty('--lejos', s);
    this.pag.querySelector('.b-escena').dataset.lejos = i;
    this.alto();
    this.veredicto();
  },
  veredicto() {
    const v = $('[data-veredicto]', this.pag); const d = DISTANCIAS[this.lejos];
    const puestos = $$('.b-puesto[data-k]:not(.hueco)', this.pag);
    puestos.forEach((p) => p.classList.toggle('cuesta', this.lejos > 0 && seLeeHasta(Number(p.dataset.mm)) < d.m));
    if (!puestos.length) { v.innerHTML = 'Elige una prenda y su rótulo aparece pegado en el anaquel, a su tamaño real.'; return; }
    if (this.lejos === 0) { v.innerHTML = `${ic('regla')}<span>Los rótulos están a su <b>tamaño real</b>. Usa «Mirar desde» para alejarte.</span>`; return; }
    const bien = puestos.filter((p) => seLeeHasta(Number(p.dataset.mm)) >= d.m).length;
    const mejor = Math.max(...puestos.map((p) => seLeeHasta(Number(p.dataset.mm))));
    const uno = puestos.length === 1;
    v.innerHTML = bien === puestos.length
      ? `${ic('check')}<span>Desde ${d.txt} <b>se ${uno ? 'lee bien' : 'leen todos'}</b>.</span>`
      : bien === 0
        ? `${ic('ojo')}<span>Desde ${d.txt} <b>cuesta leer${uno ? 'lo' : 'los'}</b>: ${uno ? 'se lee' : 'el más grande se lee'} desde ${distancia(mejor)}${juntas() ? '. Juntas, la letra sale más chica' : ''}.</span>`
        : `${ic('ojo')}<span>Desde ${d.txt} se ${bien === 1 ? 'lee' : 'leen'} <b>${bien} de ${puestos.length}</b>; los marcados, desde más cerca.</span>`;
  },

  imprimir(total, avance) {
    return new Promise((fin) => {
      const b = $('[data-imprimir]'); b.classList.add('llena'); b.style.setProperty('--p', '0%');
      const pegs = $$('.b-puesto[data-k]:not(.hueco):not(.cero)', this.pag);
      const per = Math.max(320, Math.min(620, 1800 / Math.max(1, pegs.length)));
      let t = 160, cum = 0;
      pegs.forEach((p) => {
        luego(() => { p.classList.remove('visto'); void p.offsetWidth; p.classList.add('visto'); cum += copiasDe(p.dataset.k); avance(cum); b.style.setProperty('--p', `${Math.round((cum / total) * 100)}%`); }, t);
        t += per;
      });
      luego(() => { b.style.setProperty('--p', '100%'); }, t);
      luego(() => { b.classList.remove('llena'); b.style.removeProperty('--p'); fin(); }, t + 520);
      luego(() => pegs.forEach((p) => p.classList.remove('visto')), t + 2200);
    });
  },
};
