/* =====================================================================
   A · «El hilo» — el recorrido como una cinta.

   Los siete caminos nacen a la izquierda (lo ancho = la gente), se juntan en una sola cinta en «Entraron» y la cinta se adelgaza
   en cada paso; lo que se pierde se desprende hacia abajo. Donde menos gente pasa queda un nudo rojo: «aquí se atora».
   Abajo, tres tiras cortas: desde qué ciudad (hilos con su carrete), a qué hora (hilos colgando) y la más mirada (el tendedero).
   ===================================================================== */
(function () {
  "use strict";
  const T = window.TRAFICO;
  const P = window.TRAFICO_UI;

  const D = {
    clave: "a",
    nombre: "A · El hilo",
    prefijo: "hl",
    frase: "Cuánta gente entró a la tienda online, por dónde llegó y en qué paso se fue.",
    ordenTabla: ["recorrido", "caminos", "ciudades", "horas", "prendas"],
  };

  /* ---------- Medidas del lienzo (en px reales, medidas una vez por pintada) ---------- */
  function medidas(ancho) {
    const angosto = ancho < 820;
    const LC = angosto ? 112 : ancho > 1300 ? 176 : 150;
    const ancha = ancho > 1300; // 1920: hay alto de sobra, la cinta se luce más
    const H = ancha ? 330 : 258;
    const LZ = 88; // la franja de los rótulos
    const yT = 94; // borde de arriba de la cinta
    const TMAX = ancha ? 108 : 76; // la cinta más gruesa (todo el período, sin filtro)
    const sp = (ancho - LC - 6) / 6;
    const x = [];
    for (let i = 0; i <= 5; i++) x.push(LC + sp * (i + 1));
    const yCamino = (i) => yT + 6 + i * ((H - 14 - (yT + 6)) / 6);
    return { ancho, angosto, LC, H, LZ, yT, TMAX, sp, x, piso: H - 4, yCamino };
  }

  /* ---------- El modelo que se dibuja (y que se interpola en un cambio) ---------- */
  const totalPeriodo = {};
  function modelo(r) {
    const clave = r.periodo.clave;
    if (totalPeriodo[clave] == null) totalPeriodo[clave] = T.resumen(clave, {}).total;
    const elegido = r.caminos.findIndex((c) => c.elegido);
    return {
      caminos: r.caminos.map((c) => c.n),
      dentro: r.caminos.map((_, i) => (elegido < 0 || elegido === i ? 1 : 0)),
      pasos: r.pasos.map((p) => p.n),
      total: totalPeriodo[clave],
    };
  }
  const lerp = (a, b, p) => a + (b - a) * p;
  function mezclar(a, b, p) {
    return {
      caminos: a.caminos.map((v, i) => lerp(v, b.caminos[i], p)),
      dentro: a.dentro.map((v, i) => lerp(v, b.dentro[i], p)),
      pasos: a.pasos.map((v, i) => lerp(v, b.pasos[i], p)),
      total: lerp(a.total, b.total, p),
    };
  }
  const f1 = (n) => Math.round(n * 10) / 10;

  function trazar(g, M) {
    const k = M.TMAX / Math.max(1, g.total);
    const x0 = M.x[0];
    const mx = (M.LC + x0) / 2;
    let off = 0;
    const corrientes = g.caminos.map((n, i) => {
      const t = n * k;
      const w = g.dentro[i];
      const y1 = M.yCamino(i);
      // Entra a la cinta (w = 1) o se adelgaza hasta un punto a mitad de camino (w = 0, otro camino está elegido).
      const xe = lerp(M.LC + (x0 - M.LC) * 0.55, x0, w);
      const te = t * w;
      const ya = lerp(y1, M.yT + off, w);
      off += te;
      const xm = lerp(M.LC + (xe - M.LC) * 0.5, mx, w);
      return `M${f1(M.LC)},${f1(y1 - t / 2)} C${f1(xm)},${f1(y1 - t / 2)} ${f1(xm)},${f1(ya)} ${f1(xe)},${f1(ya)} L${f1(xe)},${f1(ya + te)} C${f1(xm)},${f1(ya + te)} ${f1(xm)},${f1(y1 + t / 2)} ${f1(M.LC)},${f1(y1 + t / 2)} Z`;
    });
    const b = g.pasos.map((n) => M.yT + n * k);
    let cinta = `M${f1(x0)},${M.yT} L${f1(M.x[5])},${M.yT} L${f1(M.x[5])},${f1(b[5])}`;
    for (let i = 5; i >= 1; i--) {
      const xa = M.x[i - 1];
      const s = M.sp;
      cinta += ` L${f1(xa + 0.36 * s)},${f1(b[i])} C${f1(xa + 0.2 * s)},${f1(b[i])} ${f1(xa + 0.16 * s)},${f1(b[i - 1])} ${f1(xa + 0.04 * s)},${f1(b[i - 1])} L${f1(xa)},${f1(b[i - 1])}`;
    }
    cinta += ` L${f1(x0)},${M.yT} Z`;
    const caidas = [];
    for (let i = 1; i <= 5; i++) {
      const w = Math.max(0, b[i - 1] - b[i]);
      const xs = M.x[i - 1] + 0.04 * M.sp;
      const ys = (b[i] + b[i - 1]) / 2;
      const xe = M.x[i - 1] + 0.42 * M.sp;
      const ye = M.piso - w / 2;
      caidas.push({ d: `M${f1(xs)},${f1(ys)} C${f1(xs + 0.24 * M.sp)},${f1(ys)} ${f1(xe - 0.05 * M.sp)},${f1(ys + (ye - ys) * 0.3)} ${f1(xe)},${f1(ye)}`, w });
    }
    return { corrientes, cinta, caidas, b, k };
  }

  function nudo(r, M, b) {
    if (!r.atora) return "";
    const i = r.atora.i;
    const kx = M.x[i - 1] + 0.64 * M.sp;
    const ky = M.yT + Math.max(2, (b[i] - M.yT) / 2);
    const d = `M${f1(kx - 18)},${f1(ky)} C${f1(kx - 9)},${f1(ky)} ${f1(kx - 7)},${f1(ky - 10)} ${f1(kx)},${f1(ky - 10)} C${f1(kx + 8)},${f1(ky - 10)} ${f1(kx + 9)},${f1(ky + 8)} ${f1(kx + 1)},${f1(ky + 8)} C${f1(kx - 7)},${f1(ky + 8)} ${f1(kx - 6)},${f1(ky - 3)} ${f1(kx + 3)},${f1(ky - 2)} C${f1(kx + 9)},${f1(ky - 1)} ${f1(kx + 12)},${f1(ky)} ${f1(kx + 18)},${f1(ky)}`;
    return `<g class="hl-nudo-g" data-nudo><path class="hl-nudo-fondo" d="${d}"/><path class="hl-nudo" d="${d}" pathLength="1"/></g>`;
  }

  function dibujar(svg, g, M) {
    const t = trazar(g, M);
    svg.querySelectorAll(".hl-corriente").forEach((el, i) => el.setAttribute("d", t.corrientes[i]));
    svg.querySelector(".hl-cinta").setAttribute("d", t.cinta);
    svg.querySelector(".hl-cinta-hebras").setAttribute("d", t.cinta);
    svg.querySelectorAll(".hl-caida").forEach((el, i) => {
      el.setAttribute("d", t.caidas[i].d);
      el.setAttribute("stroke-width", f1(Math.max(0.5, t.caidas[i].w)));
    });
    return t;
  }

  /* ---------- Pintar ---------- */
  D.render = function (cuerpo, r, { modo, prev }) {
    if (!r.total) {
      cuerpo.innerHTML = vacio(r);
      return;
    }
    // Se mide el ancho real de la tarjeta antes de dibujar (una lectura, no una por elemento).
    cuerpo.innerHTML = `<section class="tr-tarjeta hl-hilo" aria-labelledby="hl-titulo"><div data-medir style="height:1px"></div></section>`;
    const ancho = cuerpo.querySelector("[data-medir]").clientWidth;
    const M = medidas(ancho);
    const g1 = modelo(r);
    const t = trazar(g1, M);
    const pasosLabel = r.pasos
      .map((s) => {
        const izq = M.x[s.i] - M.sp + 8;
        const ancho = M.sp - 14;
        const esAtora = r.atora && r.atora.i === s.i;
        const nombre = M.angosto ? s.corto : s.nombre;
        return `<div class="hl-paso" data-paso="${s.i}" style="left:${f1(izq)}px;width:${f1(ancho)}px">
          <span class="hl-paso__nombre">${nombre}</span>
          <span class="hl-paso__n" data-cuenta-paso="${s.i}">${P.fmt(s.n)}</span>
          <span class="hl-paso__de">${s.i === 0 ? "personas" : `${s.de100} de cada 100`}</span>
          ${esAtora ? `<span class="hl-paso__atora">Aquí se atora</span>` : ""}
        </div>`;
      })
      .join("");
    const caminos = r.caminos
      .map(
        (c, i) => `<button type="button" class="hl-camino" data-filtro-camino="${c.clave}" data-camino-i="${i}" data-foco="a-camino-${c.clave}" aria-pressed="${c.elegido}" ${c.n ? "" : "disabled"}
            style="top:${f1(M.yCamino(i))}px;width:${M.LC - 8}px" aria-label="${P.esc(c.nombre)}: ${P.personas(c.n)}, ${c.de100} de cada 100. ${c.elegido ? "Quitar el filtro" : "Ver solo a esta gente"}"
            ${c.ayuda ? `data-globito="${P.esc(c.ayuda)}"` : ""}>
            <span class="hl-camino__nombre">${c.elegido ? P.icono("x") : ""}${P.esc(c.nombre)}</span><span class="hl-camino__n num">${P.fmt(c.n)}</span>
          </button>`,
      )
      .join("");
    const puertas = M.x.map((x) => `<line class="hl-puerta" x1="${f1(x)}" x2="${f1(x)}" y1="4" y2="${M.yT - 6}"/>`).join("");
    const resumenSvg = `El recorrido: ${r.pasos.map((s) => `${s.nombre.toLowerCase()}, ${P.personas(s.n)}`).join("; ")}. ${P.titularAtora(r)}.`;

    const svg = `
      <svg class="hl-svg" width="${M.ancho}" height="${M.H}" viewBox="0 0 ${M.ancho} ${M.H}" role="img" aria-label="${P.esc(resumenSvg)}">
        <defs>
          <pattern id="hl-hebras" patternUnits="userSpaceOnUse" width="10" height="4"><line class="hl-hebras-linea" x1="0" y1="2" x2="10" y2="2"/></pattern>
        </defs>
        <g data-revela>
          ${puertas}
          <g class="hl-caidas">${t.caidas
            .map((c, i) => `<path class="hl-caida" data-caida="${i + 1}" d="${c.d}" stroke-width="${f1(Math.max(0.5, c.w))}" data-globito="Se fueron ${P.esc(T.PASOS[i + 1] ? r.pasos[i + 1].seFueronTexto : "")}: ${P.personas(r.pasos[i + 1].seFueron)}"/>`)
            .join("")}</g>
          <g class="hl-corrientes">${t.corrientes
            .map((d, i) => `<path class="hl-corriente" data-corriente="${i}" d="${d}"${r.caminos[i].elegido ? " data-elegida" : ""}${g1.dentro[i] ? "" : " data-fuera"}/>`)
            .join("")}</g>
          <path class="hl-cinta" d="${t.cinta}"/>
          <path class="hl-cinta-hebras" d="${t.cinta}" fill="url(#hl-hebras)"/>
        </g>
        ${nudo(r, M, t.b)}
      </svg>`;

    // La fila de abajo.
    const maxU = Math.max(1, ...r.ciudades.map((c) => c.n));
    const ciudades = r.ciudades
      .map(
        (c) => `<li><button type="button" class="hl-ciudad" data-filtro-ciudad="${c.clave}" data-foco="a-ciudad-${c.clave}" aria-pressed="${c.elegido}" ${c.n ? "" : "disabled"}
            aria-label="${P.esc(c.nombre)}: ${P.personas(c.n)}, ${c.de100} de cada 100${c.tienda ? ", hay tienda CAYLA" : ""}. ${c.elegido ? "Quitar el filtro" : "Ver solo esta ciudad"}">
            <span class="hl-ciudad__nombre">${c.elegido ? P.icono("x") : ""}${P.esc(c.nombre)}${c.tienda ? `<span class="hl-tienda">${P.icono("vitrina")}</span>` : ""}</span>
            <span class="hl-ciudad__hilo"><i style="width:${f1((c.n / maxU) * 100)}%"></i></span>
            <span class="hl-ciudad__n">${P.fmt(c.n)}</span>
          </button></li>`,
      )
      .join("");
    const primera = [...r.ciudades].sort((a, b) => b.n - a.n)[0];
    const maxH = Math.max(1, ...r.horas);
    const horas = r.horas
      .map((n, h) => `<span class="hl-hora-col" data-globito="${T.horaCorta(h)}: ${P.personas(n)}"><i class="hl-hora"${h >= r.pico.desde && h < r.pico.hasta ? " data-pico" : ""} style="height:${f1(Math.max(2, (n / maxH) * 84))}px"></i></span>`)
      .join("");
    const ejes = [0, 6, 12, 18].map((h) => `<span style="left:${h === 0 ? 0 : f1(((h + 0.5) / 24) * 100)}%">${T.horaCorta(h)}</span>`).join("");
    const top = r.prendas.slice(0, 3);
    const colgadas = top
      .map(
        (p, k) => `<button type="button" class="hl-colgada hl-colgada--${k + 1}" data-prenda="${p.codigo}" data-foco="a-prenda-${p.codigo}"
            aria-label="${P.esc(p.nombre)}, ${p.puesto === 1 ? "la más mirada" : `la ${p.puesto}.ª más mirada`}: ${P.personas(p.miraron)} la miraron, ${p.de100Vieron} de cada 100 que vieron una prenda. Ver el detalle">
            <span class="hl-pinza" aria-hidden="true"></span>${P.mosaico(p, k ? 50 : 64)}
            <span class="hl-colgada__nombre">${P.esc(p.nombre)}</span>
            <span class="hl-colgada__n">${P.personas(p.miraron)}${k === 0 ? ` · ${p.de100Vieron} de cada 100` : ""}</span>
          </button>`,
      )
      .join("");

    cuerpo.innerHTML = `
      <section class="tr-tarjeta hl-hilo" aria-labelledby="hl-titulo">
        <div class="hl-cab">
          <h2 class="tr-titulo" id="hl-titulo">El recorrido</h2>
          <p class="tr-veredicto"><b>${P.titularAtora(r)}:</b> ${P.fraseAtora(r)}${r.atora ? ` <button type="button" class="btn-enlace tr-porque" data-porque aria-expanded="false" aria-controls="hl-porque" data-foco="a-porque">¿Por qué?</button>` : ""}</p>
          <div class="hl-leyenda" aria-hidden="true"><span><i class="l-corriente"></i>cada camino</span><span><i class="l-cinta"></i>los que siguen</span><span><i class="l-caida"></i>los que se van</span></div>
        </div>
        <p class="tr-explica" id="hl-porque" hidden>${P.explicaAtora(r)}</p>
        <div class="hl-lienzo${M.angosto ? " hl-chico" : ""}" data-lienzo style="height:${M.H}px">${svg}${caminos}${pasosLabel}</div>
      </section>
      <div class="hl-fila">
        <section class="tr-tarjeta hl-bloque" aria-labelledby="hl-t-ciudad">
          <h2 class="tr-titulo" id="hl-t-ciudad">Desde qué ciudad miran<span class="tr-titulo__dato"><span class="hl-tienda">${P.icono("vitrina")}</span> hay tienda</span></h2>
          <p class="tr-veredicto">Más gente desde <b>${P.esc(primera.nombre)}</b>: ${primera.de100} de cada 100.</p>
          <ul class="hl-ciudades">${ciudades}</ul>
        </section>
        <section class="tr-tarjeta hl-bloque" aria-labelledby="hl-t-hora">
          <h2 class="tr-titulo" id="hl-t-hora">A qué hora entran</h2>
          <p class="tr-veredicto">Más gente <b>${T.tramoTxt(r.pico.desde, r.pico.hasta)}</b>: ${r.pico.de100} de cada 100.</p>
          <div class="hl-horas" role="img" aria-label="Personas por hora; la mayoría entra ${T.tramoTxt(r.pico.desde, r.pico.hasta)}">${horas}</div>
          <div class="hl-ejes" aria-hidden="true">${ejes}</div>
        </section>
        <section class="tr-tarjeta hl-bloque hl-tendedero" aria-labelledby="hl-t-prenda">
          <h2 class="tr-titulo" id="hl-t-prenda">La más mirada<span class="tr-titulo__dato"><button type="button" class="tr-ver" data-vista="tabla" data-foco="a-ver-21">Ver las 21 ${P.icono("flecha")}</button></span></h2>
          <div class="hl-cordel"><span class="hl-cordel__linea" aria-hidden="true"></span>${colgadas}</div>
        </section>
      </div>`;

    const lienzo = cuerpo.querySelector("[data-lienzo]");
    const svgEl = lienzo.querySelector("svg");
    const g0 = prev && prev.total ? modelo(prev) : null;

    if (modo === "entrada") entrada(cuerpo, r, M);
    else if (modo === "cambio" && g0) {
      // Un filtro o un período: la cinta se reacomoda en una sola transición (las corrientes se apagan o se suman).
      dibujar(svgEl, g0, M);
      P.tween(620, (p) => dibujar(svgEl, mezclar(g0, g1, p), M));
      r.pasos.forEach((s) => P.contar(lienzo.querySelector(`[data-cuenta-paso="${s.i}"]`), prev.pasos[s.i].n, s.n, { ms: 620 }));
      P.anim(lienzo.querySelector("[data-nudo]"), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 520 });
      const prevU = new Map(prev.ciudades.map((c) => [c.clave, c.n]));
      const maxPrevU = Math.max(1, ...prev.ciudades.map((c) => c.n));
      cuerpo.querySelectorAll(".hl-ciudad__hilo i").forEach((el, k) => {
        const c = r.ciudades[k];
        const de = (prevU.get(c.clave) || 0) / maxPrevU / Math.max(0.0001, c.n / maxU);
        P.anim(el, [{ transform: `scaleX(${Math.min(4, de)})` }, { transform: "scaleX(1)" }], { duration: 520 });
      });
      const maxPrevH = Math.max(1, ...prev.horas);
      cuerpo.querySelectorAll(".hl-hora").forEach((el, h) => {
        const de = prev.horas[h] / maxPrevH / Math.max(0.0001, r.horas[h] / maxH);
        P.anim(el, [{ transform: `scaleY(${Math.min(4, de)})` }, { transform: "scaleY(1)" }], { duration: 520 });
      });
    }
  };

  /* ---------- La entrada: el hilo se desenrolla de izquierda a derecha, una sola vez ---------- */
  function entrada(cuerpo, r, M) {
    const lienzo = cuerpo.querySelector("[data-lienzo]");
    const svg = lienzo.querySelector("svg");
    const base = 320;
    const largo = 1250;
    P.anim(cuerpo.querySelector(".hl-hilo"), [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: 160 });
    P.anim(svg, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: largo, delay: base, easing: "cubic-bezier(0.45, 0.05, 0.25, 1)" });
    lienzo.querySelectorAll(".hl-camino").forEach((el, k) => P.anim(el, [{ opacity: 0, transform: "translate(-8px, -50%)" }, { opacity: 1, transform: "translate(0, -50%)" }], { duration: 420, delay: base - 120 + k * 45 }));
    // Cada rótulo aparece cuando el hilo pasa por su tramo; su cifra cuenta mientras.
    lienzo.querySelectorAll(".hl-paso").forEach((el) => {
      const i = +el.dataset.paso;
      const avance = (M.x[i] - M.sp * 0.6) / M.ancho;
      const retraso = base + largo * Math.max(0, avance) * 0.9;
      P.anim(el, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: retraso });
      P.contar(el.querySelector("[data-cuenta-paso]"), 0, r.pasos[i].n, { ms: 700, retraso });
    });
    // Lo que se pierde cae un poco después de que el hilo pasa.
    svg.querySelectorAll(".hl-caida").forEach((el) => {
      const i = +el.dataset.caida;
      const avance = M.x[i - 1] / M.ancho;
      P.anim(el, [{ opacity: 0, transform: "translateY(-10px)" }, { opacity: 1, transform: "none" }], { duration: 620, delay: base + largo * avance * 0.9 + 160 });
    });
    const nudoEl = svg.querySelector(".hl-nudo");
    if (nudoEl) {
      const t0 = base + largo + 120;
      P.anim(nudoEl, [{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: 650, delay: t0 });
      P.anim(svg.querySelector(".hl-nudo-fondo"), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: t0 });
      P.anim(lienzo.querySelector(".hl-paso__atora"), [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: t0 + 380 });
    }
    // La fila de abajo: las tarjetas suben, los hilos de las ciudades se estiran, los de las horas cuelgan y las prendas se cuelgan.
    cuerpo.querySelectorAll(".hl-bloque").forEach((el, k) => P.anim(el, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: 700 + k * 90 }));
    cuerpo.querySelectorAll(".hl-ciudad__hilo i").forEach((el, k) => P.anim(el, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 700, delay: 900 + k * 50 }));
    cuerpo.querySelectorAll(".hl-hora").forEach((el, h) => P.anim(el, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 640, delay: 1000 + h * 22 }));
    P.anim(cuerpo.querySelector(".hl-cordel__linea"), [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 640, delay: 1050 });
    cuerpo.querySelectorAll(".hl-colgada").forEach((el, k) => P.anim(el, [{ opacity: 0, transform: "translateY(-12px)" }, { opacity: 1, transform: "none" }], { duration: 560, delay: 1250 + k * 110 }));
  }

  function vacio(r) {
    return `<section class="tr-tarjeta" style="margin-top:16px;padding:40px;text-align:center">
      <h2 class="tr-titulo" style="justify-content:center">Nadie entró ${P.esc(P.nombreFiltro(r))} en estos días</h2>
      <p class="tr-veredicto">Quita un filtro para ver a más gente.</p>
      <p><button type="button" class="tr-limpiar" data-limpiar data-foco="limpiar-vacio">${P.icono("embudoX")}Limpiar filtros</button></p>
    </section>`;
  }

  /* ---------- Al pasar el mouse o con el foco en un camino, su corriente se enciende ---------- */
  D.montar = function (main) {
    const marcar = (boton, si) => {
      if (P.estado.dir !== "a") return;
      const lienzo = main.querySelector("[data-lienzo]");
      if (!lienzo) return;
      lienzo.querySelectorAll(".hl-corriente[data-resaltada]").forEach((el) => el.removeAttribute("data-resaltada"));
      if (si && boton && !boton.disabled) {
        lienzo.setAttribute("data-resalta", "");
        const c = lienzo.querySelector(`.hl-corriente[data-corriente="${boton.dataset.caminoI}"]`);
        if (c) c.setAttribute("data-resaltada", "");
      } else lienzo.removeAttribute("data-resalta");
    };
    main.addEventListener("mouseover", (e) => marcar(e.target.closest(".hl-camino"), !!e.target.closest(".hl-camino")));
    main.addEventListener("focusin", (e) => marcar(e.target.closest(".hl-camino"), !!e.target.closest(".hl-camino")));
    main.addEventListener("focusout", () => marcar(null, false));
  };

  P.direcciones.a = D;
})();
