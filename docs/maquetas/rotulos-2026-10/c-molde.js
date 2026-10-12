'use strict';
/* =====================================================================
   C · Molde — como en la mesa de corte del taller: el rótulo en grande sobre el tapete
   cuadriculado, con su cinta métrica y sus cotas; la ficha dice qué tan grande salió la
   letra y desde dónde se lee; abajo, la tira de contacto con todos y sus copias.
   ===================================================================== */
MAQ.C = {
  nombre: 'C · Molde',
  idea: 'Como un molde sobre la mesa de corte del taller: el rótulo en grande sobre el tapete cuadriculado, con su cinta métrica y sus cotas, y al lado una ficha que dice qué tan grande salió la letra y desde dónde se lee. Las prendas se escriben en una sola caja, como fichas; abajo, la tira de contacto con todos los rótulos y sus copias.',
  mov: [
    'Al entrar, la cinta métrica se desliza con sus centímetros, las cotas de 62 mm y 40,1 mm se trazan desde su cifra hacia afuera y el rótulo se asienta sobre el tapete, calzado con la cuadrícula.',
    'El nombre <b>se prueba</b>: crece hasta su tamaño justo mientras la cota de la letra (a la izquierda) se abre con él y su cifra cuenta de 0 a 11 mm.',
    'Las prendas se escriben en la misma caja, como fichas: Enter suma, ⌫ con la caja vacía quita la última. La ficha nueva entra y la tira de contacto suma su rótulo.',
    'Tocar otro rótulo de la tira (o ‹ ›) lo sube al tapete: el anterior sale hacia un lado, el nuevo entra del otro y la raya negra de la tira se desliza hasta él.',
    '«Todas en uno» funde los rótulos en uno y <b>la letra se encoge a la vista</b>: la ficha cuenta hacia abajo (11 → 6,3 mm) y la distancia a la que se lee también. Así se ve lo que cuesta juntarlas, antes de decidir.',
    'Al imprimir, el cabezal recorre cada rótulo de la tira en orden y el botón cuenta las copias.',
  ],
  bucle: 'ninguno.',

  montar(pag) {
    this.pag = pag; pag.classList.add('C'); this.activo = null; this.antes = null;
    pag.append(cabecera());
    const g = el(`<div class="c-col">
      <section class="tarjeta c-barra sube" style="--i:3" aria-labelledby="c-tit">
        <div class="c-pregunta"><h2 class="c-tit" id="c-tit">¿Qué prendas van en este anaquel?</h2><span class="c-tambien">También puedes marcarlas en <b>Productos</b> o en <b>Existencias</b> y tocar «Rótulo».</span></div>
        <div class="c-busca" data-busca></div>
        <div class="pliega cerrada" data-como><div><div class="c-como"><span class="et">Cómo salen</span><div data-modo></div><span class="c-tope" data-tope></span></div></div></div>
      </section>
      <section class="c-mesa" aria-label="El rótulo en grande">
        <div class="c-tapete sube" style="--i:4" data-tapete>
          <div class="c-cinta" data-cinta aria-hidden="true"><span class="c-cinta-et">cm</span></div>
          <div class="c-campo" data-campo></div>
        </div>
        <aside class="c-ficha sube" style="--i:5" data-ficha aria-live="polite"></aside>
      </section>
      <section class="pliega cerrada" data-contacto><div><div class="c-contacto">
        <div class="c-contacto-cab"><span class="et">Los rótulos, en el orden en que salen</span><span class="c-contacto-n" data-cn></span></div>
        <div class="c-tiras" data-tiras></div><span class="c-ind" data-ind aria-hidden="true"></span></div></div></section>
    </div>`);
    pag.append(g, nota(7));
    $('[data-busca]', g).append(crearBuscador({ grande: true, fichas: true, alElegir: agregar }));
    g.addEventListener('click', (e) => {
      const v = e.target.closest('[data-c-ver]'); if (v) return this.ver(v.dataset.cVer);
      const m = e.target.closest('[data-c-mover]'); if (m) { const rs = rotulos(); const i = rs.findIndex((r) => r.clave === this.activo); const j = Math.max(0, Math.min(rs.length - 1, i + Number(m.dataset.cMover))); if (j !== i) this.ver(rs[j].clave); }
    });
    const tap = $('[data-tapete]', g);
    const medir = () => {
      const w = tap.clientWidth; const z = Math.max(0.9, Math.min(2.4, (w - (w > 520 ? 190 : 112)) / 234));
      const cambio = Math.abs(z - (this.z || 0)) > 0.01; this.z = z; tap.style.setProperty('--z', z.toFixed(3));
      if (cambio && this.listo) { this.cuadricula(); this.cotaLetra(false); this.indicador(); }
    };
    medir();
    this.ro = new ResizeObserver(medir); this.ro.observe(tap);
    this.listo = true;
    this.render('entrada');
  },
  desmontar() { this.ro?.disconnect(); this.listo = false; },

  render(motivo, d) {
    const pag = this.pag; const vacio = !S.ids.length; const rs = rotulos();
    pag.classList.toggle('vacio', vacio);
    if (motivo === 'copias') {
      actualizarPasos(d.clave);
      $$('.c-mini[data-k]', pag).forEach((t) => { const n = copiasDe(t.dataset.k); t.classList.toggle('cero', n === 0); const c = $('.c-mini-n', t); c.innerHTML = n === 0 ? 'No sale' : `× ${n}`; });
      $('.c-muestra[data-k]', pag)?.classList.toggle('cero', copiasDe(this.activo) === 0);
      this.contacto('copias');
      return;
    }
    const chips = $('[data-chips]', pag);
    if (motivo !== 'juntar') rehacer(chips, modelos().map(chipHTML).join(''), { entra: (n) => n.classList.add('entra'), sale: (g, fin) => { g.classList.add('sale'); setTimeout(fin, T(260)); } });
    $('[data-como]', pag).classList.toggle('cerrada', S.ids.length < 2);
    pintarModo($('[data-modo]', pag));
    $('[data-tope]', pag).textContent = S.ids.length > MAX_JUNTOS ? `Juntas se leen hasta ${MAX_JUNTOS}.` : '';

    // qué rótulo va al tapete
    const anterior = this.activo; const idxAnt = this.orden?.indexOf(anterior) ?? -1;
    if (!rs.length) this.activo = null;
    else if (motivo === 'agregar' || motivo === 'juntar') this.activo = rs[rs.length - 1].clave;
    else if (!rs.some((r) => r.clave === this.activo)) this.activo = rs[Math.max(0, Math.min(idxAnt, rs.length - 1))].clave;
    this.orden = rs.map((r) => r.clave);
    this.mesa(motivo, anterior);
    this.contacto(motivo);
  },

  ver(clave) {
    if (clave === this.activo) return;
    const anterior = this.activo; this.activo = clave; this.mesa('ver', anterior); this.contacto('ver');
  },

  muestraHTML(r, fantasma) {
    return `<div class="c-muestra ${fantasma ? 'vacia' : ''} ${!fantasma && copiasDe(r.clave) === 0 ? 'cero' : ''}" data-k="${fantasma ? 'ejemplo' : esc(r.clave)}">
      <div class="c-cota c-cota-h" aria-hidden="true"><i></i><span>62 mm</span><i></i></div>
      <div class="c-cota c-cota-v" aria-hidden="true"><i></i><span>40,1 mm</span><i></i></div>
      <div class="c-cota-letra" aria-hidden="true"><span><b data-mm>0</b> mm</span></div>
      <div class="c-hoja"><div class="papel z">${rotuloHTML(r, { fantasma })}</div><span class="c-no-sale">No sale</span><span class="cubre"></span><span class="cabezal"></span></div>
    </div>`;
  },
  mesa(motivo, anterior) {
    const rs = rotulos(); const r = rs.find((x) => x.clave === this.activo);
    const campo = $('[data-campo]', this.pag);
    const iA = this.orden.indexOf(anterior), iN = this.orden.indexOf(this.activo);
    campo.style.setProperty('--dir', iA >= 0 && iN >= 0 && iN < iA ? -1 : 1);
    const mmAntes = this.antes?.mm ?? null;
    // al juntar o separar, el rótulo no se va de lado: se queda y la letra se encoge (o crece) en su sitio
    const enSitio = motivo === 'juntar';
    const nuevos = rehacer(campo, this.muestraHTML(r || EJEMPLO, !r), {
      sale: enSitio ? undefined : (g, fin) => { g.classList.add('sale'); setTimeout(fin, T(320)); },
    });
    if (enSitio) nuevos.length = 0;
    const m = $('.c-muestra', campo);
    m.classList.add(motivo === 'entrada' ? 'llega' : 'entra');
    if (motivo !== 'entrada' && !nuevos.length) m.classList.remove('entra');
    this.cuadricula();
    const mm = r ? medidaNombre(r.modelos).mm : medidaNombre(EJEMPLO.modelos).mm;
    this.cotaLetra(true);
    const espera = motivo === 'entrada' ? 900 : nuevos.length ? 160 : 0;
    const span = $('.rot-nombre>span', m);
    const k = mmAntes ? mmAntes / mm : 0.45;
    if (!S.rm) span.animate([{ transform: `scale(${k})`, opacity: mmAntes ? 1 : 0, filter: mmAntes ? 'none' : 'blur(3px)' }, { transform: 'none', opacity: 1, filter: 'none' }], { duration: mmAntes ? 620 : 760, delay: espera, easing: EASE, fill: 'backwards' });
    const b = $('[data-mm]', m);
    b.textContent = coma(String(mmAntes ?? 0));
    luego(() => contar(b, mmAntes ?? 0, mm, mmAntes ? 620 : 760, 1), espera);
    m.style.setProperty('--espera', `${espera}ms`);
    this.ficha(r, rs, motivo);
    this.antes = r ? { mm, m: seLeeHasta(mm) } : null;
  },
  /* el rótulo calza con la cuadrícula del tapete y con el 0 de la cinta */
  cuadricula() {
    const tap = $('[data-tapete]', this.pag), hoja = $('.c-hoja', this.pag); if (!hoja) return;
    const t = tap.getBoundingClientRect(), h = hoja.getBoundingClientRect();
    const x = h.left - t.left, y = h.top - t.top;
    tap.style.setProperty('--gx', `${x}px`); tap.style.setProperty('--gy', `${y}px`);
    const cinta = $('[data-cinta]', this.pag); const cm = 3.7795 * 10 * this.z;
    $$('.c-num', cinta).forEach((n) => n.remove());
    for (let k = 0; x + k * cm < t.width - 10; k++) {
      cinta.insertAdjacentHTML('beforeend', `<span class="c-num" style="left:${x + k * cm}px;--k:${k}">${k}</span>`);
    }
  },
  /* la cota de la letra: del alto de la primera línea del nombre */
  cotaLetra(desdeCero) {
    const m = $('.c-muestra', this.pag); if (!m) return;
    const span = $('.rot-nombre>span', m), hoja = $('.c-hoja', m);
    const rg = document.createRange(); rg.selectNodeContents(span);
    const l = rg.getClientRects()[0]; if (!l) return;
    const h = hoja.getBoundingClientRect();
    const fs = parseFloat(span.parentNode.style.fontSize) * 3.7795 * this.z;
    const cota = $('.c-cota-letra', m);
    const top = l.top - h.top + (l.height - fs) / 2;
    if (desdeCero) { cota.style.setProperty('--t', `${top + fs / 2}px`); cota.style.setProperty('--h', '0px'); void cota.offsetWidth; }
    cota.style.setProperty('--t', `${top}px`); cota.style.setProperty('--h', `${fs}px`);
  },
  ficha(r, rs, motivo) {
    const f = $('[data-ficha]', this.pag);
    if (!r) {
      f.innerHTML = `<div class="c-ficha-in vacia">${ic('regla')}<h3 class="c-nombre">El rótulo, en grande</h3><p>Elige una prenda y aquí la ves con sus medidas: qué tan grande sale la letra y desde dónde se lee en el almacén.</p><p class="c-ficha-pie">Rótulo de 62 × 40,1 mm, en el papel de las etiquetas.</p></div>`;
      return;
    }
    const i = rs.findIndex((x) => x.clave === r.clave); const { mm, lineas } = medidaNombre(r.modelos); const lee = seLeeHasta(mm);
    let pista = '';
    if (!juntas() && puedeJuntar()) { const j = medidaNombre(modelos().map((x) => x.ref)).mm; pista = `<p class="c-pista">${ic('ojo')}<span>Juntas en un rótulo, la letra bajaría a <b>${coma(j)} mm</b> y se leería desde ${distancia(seLeeHasta(j))}.</span></p>`; }
    f.innerHTML = `<div class="c-ficha-in">
      <div class="c-nav">${rs.length > 1 ? `<span class="et">Rótulo ${i + 1} de ${rs.length}</span><span class="c-nav-b"><button type="button" data-c-mover="-1" aria-label="Rótulo anterior" ${i === 0 ? 'disabled' : ''}>${ic('izq')}</button><button type="button" data-c-mover="1" aria-label="Rótulo siguiente" ${i === rs.length - 1 ? 'disabled' : ''}>${ic('der')}</button></span>` : `<span class="et">${r.prendas.length > 1 ? `Un rótulo para ${r.prendas.length} prendas` : 'El rótulo'}</span>`}</div>
      <h3 class="c-nombre">${esc(r.modelos.join(' · '))}</h3>
      <dl class="c-datos">
        <div style="--i:0"><dt>Letra del nombre</dt><dd><b data-f-mm>${coma(mm)}</b> mm · ${plural(lineas, 'línea', 'líneas')}</dd></div>
        <div style="--i:1"><dt>Se lee desde</dt><dd>${lee > 1 ? `unos <b data-f-m>${coma(lee)}</b> m` : `<b>${distancia(lee)}</b>`}</dd></div>
        <div style="--i:2"><dt>Marca</dt><dd>${r.marcas.length ? esc(r.marcas.join(' / ')) : '—'}</dd></div>
        <div style="--i:3"><dt>Tallas</dt><dd>${esc(tallasTexto(r.tallas))}</dd></div>
      </dl>
      <div class="c-copias"><span class="et">Copias</span>${pasoHTML(r.clave, { etiqueta: false })}</div>${pista}</div>`;
    const a = this.antes;
    if (a) { contar($('[data-f-mm]', f), a.mm, mm, 620, 1); if (a.m > 1) contar($('[data-f-m]', f), a.m, lee, 620, 1); }
    if (motivo === 'entrada') $('.c-ficha-in', f).classList.add('cascada');
  },
  contacto(motivo) {
    const rs = rotulos(); const ve = rs.length >= 2;
    const sec = $('[data-contacto]', this.pag); sec.classList.toggle('cerrada', !ve);
    $('[data-cn]', this.pag).textContent = ve ? `${plural(rs.length, 'rótulo', 'rótulos')} · ${plural(totalCopias(), 'copia', 'copias')} en total` : '';
    if (motivo === 'copias') return;
    const tiras = $('[data-tiras]', this.pag);
    const html = ve ? rs.map((r, i) => { const n = copiasDe(r.clave); return `<button type="button" class="c-mini ${r.clave === this.activo ? 'activo' : ''} ${n === 0 ? 'cero' : ''}" data-k="${esc(r.clave)}" data-c-ver="${esc(r.clave)}" aria-pressed="${r.clave === this.activo}" aria-label="Ver el rótulo de ${esc(r.modelos.join(', '))}" style="--i:${i}"><span class="c-mini-hoja"><span class="papel z">${rotuloHTML(r)}</span><span class="cubre"></span><span class="cabezal"></span></span><span class="c-mini-n">${n === 0 ? 'No sale' : `× ${n}`}</span></button>`; }).join('') : '';
    if (motivo === 'ver') { $$('.c-mini', tiras).forEach((t) => { const on = t.dataset.k === this.activo; t.classList.toggle('activo', on); t.setAttribute('aria-pressed', String(on)); }); }
    else rehacer(tiras, html, { entra: (n, i) => { n.classList.add('entra'); if (motivo === 'entrada') n.style.animationDelay = `${1000 + i * 70}ms`; }, sale: (g, fin) => { g.classList.add('sale'); setTimeout(fin, T(300)); } });
    requestAnimationFrame(() => this.indicador());
  },
  indicador() {
    const ind = $('[data-ind]', this.pag), t = $('.c-mini.activo', this.pag);
    if (!ind) return; if (!t) { ind.style.opacity = '0'; return; }
    const box = ind.parentNode.getBoundingClientRect(), r = t.getBoundingClientRect();
    ind.style.opacity = '1'; ind.style.left = `${r.left - box.left + 14}px`; ind.style.width = `${r.width - 28}px`;
    t.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: S.rm ? 'auto' : 'smooth' });
  },

  imprimir(total, avance) {
    return new Promise((fin) => {
      const minis = $$('.c-mini[data-k]', this.pag).filter((t) => copiasDe(t.dataset.k) > 0);
      const hoja = $('.c-hoja', this.pag);
      const pasos = minis.length ? minis.map((t) => ({ el: $('.c-mini-hoja', t), k: t.dataset.k })) : [{ el: hoja, k: this.activo }];
      const per = Math.max(320, Math.min(600, 1800 / pasos.length));
      let t = 160, cum = 0;
      pasos.forEach((p) => {
        luego(() => {
          p.el.style.setProperty('--d', `${per}ms`); p.el.classList.remove('reimprime'); void p.el.offsetWidth; p.el.classList.add('reimprime');
          if (p.k === this.activo && p.el !== hoja) { hoja.style.setProperty('--d', `${per}ms`); hoja.classList.remove('reimprime'); void hoja.offsetWidth; hoja.classList.add('reimprime'); }
        }, t);
        luego(() => { cum += copiasDe(p.k); avance(cum); }, t + per * 0.85);
        t += per;
      });
      luego(() => { pasos.forEach((p) => p.el.classList.remove('reimprime')); hoja?.classList.remove('reimprime'); fin(); }, t + 380);
    });
  },
};
