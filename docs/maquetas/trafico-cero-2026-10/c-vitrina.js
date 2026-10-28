/* =====================================================================
   C · «La vitrina» — las prendas son la pantalla.

   Un mosaico de las 21 prendas reales: cada baldosa ocupa lo que la miraron (área = personas) y va pintada con los colores que
   eligieron, en franjas (el color de una prenda es dato: no cambia con el tema). Una etiqueta de papel cuelga de cada una con su
   nombre y su cifra; la más mirada es la baldosa grande. Arriba, el recorrido en una tira; al costado, de dónde vienen y a qué hora.
   Tocar un camino o una ciudad reacomoda la vitrina (una sola transición, FLIP).
   ===================================================================== */
(function () {
  "use strict";
  const T = window.TRAFICO;
  const P = window.TRAFICO_UI;

  const D = {
    clave: "c",
    nombre: "C · La vitrina",
    prefijo: "vt",
    frase: "Qué prendas mira la gente, de dónde viene y dónde se va.",
    ordenTabla: ["prendas", "recorrido", "caminos", "ciudades", "horas"],
  };

  /* ---------- Mosaico (squarified): áreas proporcionales, baldosas lo más cuadradas posible ---------- */
  function squarify(valores, x, y, w, h) {
    const total = valores.reduce((a, b) => a + b, 0);
    const areas = valores.map((v) => (v / total) * w * h);
    const rects = [];
    let rx = x;
    let ry = y;
    let rw = w;
    let rh = h;
    const suma = (f) => f.reduce((a, b) => a + b, 0);
    const peor = (f, lado) => {
      const s = suma(f);
      return Math.max((lado * lado * Math.max(...f)) / (s * s), (s * s) / (lado * lado * Math.min(...f)));
    };
    const colocar = (f) => {
      const s = suma(f);
      if (rw >= rh) {
        const ancho = s / rh;
        let yy = ry;
        for (const a of f) {
          rects.push({ x: rx, y: yy, w: ancho, h: a / ancho });
          yy += a / ancho;
        }
        rx += ancho;
        rw -= ancho;
      } else {
        const alto = s / rw;
        let xx = rx;
        for (const a of f) {
          rects.push({ x: xx, y: ry, w: a / alto, h: alto });
          xx += a / alto;
        }
        ry += alto;
        rh -= alto;
      }
    };
    let fila = [];
    let i = 0;
    while (i < areas.length) {
      const lado = Math.min(rw, rh);
      if (!fila.length || peor([...fila, areas[i]], lado) <= peor(fila, lado)) {
        fila.push(areas[i]);
        i++;
      } else {
        colocar(fila);
        fila = [];
      }
    }
    if (fila.length) colocar(fila);
    return rects;
  }

  function pieza(p, rc, k) {
    const hueco = 3;
    const x = rc.x + hueco / 2;
    const y = rc.y + hueco / 2;
    const w = Math.max(0, rc.w - hueco);
    const h = Math.max(0, rc.h - hueco);
    const colores = [...p.colores].sort((a, b) => b.n - a.n);
    const totalC = colores.reduce((a, c) => a + c.n, 0) || 1;
    const franjas = colores.map((c) => `<i class="vt-franja" data-color-dato style="flex-grow:${Math.max(c.n, totalC * 0.04)};background-color:${c.hex}"></i>`).join("");
    const principal = colores[0].hex;
    const filo = colores.some((c) => P.luminancia(c.hex) > 0.4);
    const grande = w >= 150 && h >= 96;
    const media = !grande && w >= 92 && h >= 58;
    const chica = !grande && !media && w >= 40 && h >= 30;
    let etiqueta = "";
    if (grande || media)
      etiqueta = `<span class="vt-etiqueta papel-fijo" aria-hidden="true">
          ${k === 0 ? `<span class="vt-etiqueta__mas">La más mirada</span>` : ""}
          <span class="vt-etiqueta__nombre">${P.esc(p.nombre)}</span>
          <span class="vt-etiqueta__n">${P.personas(p.miraron)}</span>
        </span>`;
    else if (chica) etiqueta = `<span class="vt-etiqueta vt-etiqueta--chica papel-fijo" aria-hidden="true"><span class="vt-etiqueta__n num">${P.fmt(p.miraron)}</span></span>`;
    const icono = Math.min(w, h) >= 64 ? `<svg class="vt-icono" viewBox="0 0 24 24" aria-hidden="true" style="color:${P.trazoSobre(colores[colores.length - 1].hex)}">${P.iconoCategoria(p.prefijo).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>` : "";
    return `<button type="button" class="vt-pieza${k === 0 ? " vt-pieza--1" : ""}${filo ? " vt-pieza--filo" : ""}" data-prenda="${p.codigo}" data-foco="c-prenda-${p.codigo}"
        data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" data-w="${w.toFixed(1)}" data-h="${h.toFixed(1)}" data-rango="${k}"
        style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;color:${P.trazoSobre(principal)}"
        aria-label="${P.esc(p.nombre)}, ${P.esc(p.categoria)}: ${P.personas(p.miraron)} la miraron, ${p.puesto === 1 ? "la más mirada" : `la ${p.puesto}.ª más mirada`}. Ver el detalle"
        ${grande || media ? "" : `data-globito="${P.esc(p.nombre)}: ${P.personas(p.miraron)}"`}>${franjas}${icono}${etiqueta}</button>`;
  }

  /* ---------- Pintar ---------- */
  D.antes = function (main) {
    const m = new Map();
    main.querySelectorAll(".vt-pieza").forEach((el) => m.set(el.dataset.prenda, { x: +el.dataset.x, y: +el.dataset.y, w: +el.dataset.w, h: +el.dataset.h }));
    return m;
  };

  D.render = function (cuerpo, r, { modo, prev, antes }) {
    if (!r.total) {
      cuerpo.innerHTML = `<section class="tr-tarjeta" style="margin-top:16px;padding:40px;text-align:center"><h2 class="tr-titulo" style="justify-content:center">Nadie entró ${P.esc(P.nombreFiltro(r))} en estos días</h2><p class="tr-veredicto">Quita un filtro para ver a más gente.</p><p><button type="button" class="tr-limpiar" data-limpiar data-foco="limpiar-vacio">${P.icono("embudoX")}Limpiar filtros</button></p></section>`;
      return;
    }
    const pasos = r.pasos
      .map((s) => {
        const esAtora = r.atora && r.atora.i === s.i;
        return `<div class="vt-paso" data-paso="${s.i}">
          <span class="vt-paso__nombre" title="${s.nombre}">${s.corto}</span>
          <span class="vt-paso__fila"><b data-cuenta-paso="${s.i}">${P.fmt(s.n)}</b><span>${s.i === 0 ? "personas" : `${s.de100} de cada 100`}</span></span>
          <span class="vt-paso__barra" aria-hidden="true"><i style="width:${s.i === 0 ? 100 : s.de100}%"></i></span>
          ${esAtora ? `<span class="vt-paso__atora">Aquí se atora</span>` : ""}
        </div>`;
      })
      .join("");
    const filas = (items, tipo) => {
      const max = Math.max(1, ...items.map((x) => x.n));
      return items
        .map(
          (x) => `<li><button type="button" class="vt-fila" data-filtro-${tipo}="${x.clave}" data-foco="c-${tipo}-${x.clave}" aria-pressed="${x.elegido}" ${x.n ? "" : "disabled"}
              aria-label="${P.esc(x.nombre)}: ${P.personas(x.n)}, ${x.de100} de cada 100${x.tienda ? ", hay tienda CAYLA" : ""}. ${x.elegido ? "Quitar el filtro" : "Ver solo a esta gente"}"
              ${x.ayuda ? `data-globito="${P.esc(x.ayuda)}"` : ""}>
              <span class="vt-fila__nombre">${x.elegido ? P.icono("x") : ""}${P.esc(x.nombre)}</span>
              <span class="vt-fila__pista" aria-hidden="true"><i style="width:${((x.n / max) * 100).toFixed(1)}%"></i></span>
              <span class="vt-fila__n">${P.fmt(x.n)}</span>
            </button></li>`,
        )
        .join("");
    };
    const cTop = [...r.caminos].sort((a, b) => b.n - a.n)[0];
    const uTop = [...r.ciudades].sort((a, b) => b.n - a.n)[0];
    const maxH = Math.max(1, ...r.horas);
    const horas = r.horas
      .map((n, h) => `<span class="vt-hora-col" data-globito="${T.horaCorta(h)}: ${P.personas(n)}"><i class="vt-hora"${h >= r.pico.desde && h < r.pico.hasta ? " data-pico" : ""} style="height:${Math.max(2, (n / maxH) * 48).toFixed(1)}px"></i></span>`)
      .join("");
    const ejes = [0, 6, 12, 18].map((h) => `<span style="left:${h === 0 ? 0 : (((h + 0.5) / 24) * 100).toFixed(2)}%">${T.horaCorta(h)}</span>`).join("");
    const mas = r.masMirada;

    cuerpo.innerHTML = `
      <section class="tr-tarjeta vt-recorrido" aria-labelledby="vt-t-rec">
        <div class="vt-cab">
          <h2 class="tr-titulo" id="vt-t-rec">El recorrido</h2>
          <p class="tr-veredicto"><b>${P.titularAtora(r)}:</b> ${P.fraseAtora(r)}${r.atora ? ` <button type="button" class="btn-enlace tr-porque" data-porque aria-expanded="false" aria-controls="vt-porque" data-foco="c-porque">¿Por qué?</button>` : ""}</p>
        </div>
        <p class="tr-explica" id="vt-porque" hidden>${P.explicaAtora(r)}</p>
        <div class="vt-pasos">${pasos}</div>
      </section>
      <div class="vt-cuerpo">
        <section class="tr-tarjeta vt-vitrina" aria-labelledby="vt-t-vit">
          <div class="vt-cab">
            <h2 class="tr-titulo" id="vt-t-vit">La vitrina, por miradas</h2>
            <p class="tr-veredicto"><b>La más mirada: ${P.esc(mas.nombre)}</b>, ${P.personas(mas.miraron)} (${mas.de100Vieron} de cada 100 que vieron una prenda).</p>
            <p class="vt-leyenda">Tamaño: cuántos la miraron · franjas: los colores que eligieron</p>
          </div>
          <div class="vt-mosaico" data-mosaico><div data-medir style="height:1px"></div></div>
          <p class="vt-sin" data-sin hidden></p>
        </section>
        <aside class="vt-lado" aria-label="De dónde vienen y a qué hora">
          <section class="tr-tarjeta vt-bloque" aria-labelledby="vt-t-donde">
            <h2 class="tr-titulo" id="vt-t-donde">De dónde vienen</h2>
            <p class="tr-veredicto">La mayoría llega por <b>${P.esc(cTop.nombre)}</b> y mira desde <b>${P.esc(uTop.nombre)}</b>.</p>
            <div class="vt-dos">
              <div><h3>Por dónde llegan</h3><ul class="vt-lista">${filas(r.caminos, "camino")}</ul></div>
              <div><h3>Desde qué ciudad</h3><ul class="vt-lista">${filas(r.ciudades, "ciudad")}</ul></div>
            </div>
          </section>
          <section class="tr-tarjeta vt-bloque" aria-labelledby="vt-t-hora">
            <h2 class="tr-titulo" id="vt-t-hora">A qué hora entran</h2>
            <p class="tr-veredicto">Más gente <b>${T.tramoTxt(r.pico.desde, r.pico.hasta)}</b>: ${r.pico.de100} de cada 100.</p>
            <div class="vt-horas" role="img" aria-label="Personas por hora; la mayoría entra ${T.tramoTxt(r.pico.desde, r.pico.hasta)}">${horas}</div>
            <div class="vt-ejes" aria-hidden="true">${ejes}</div>
          </section>
        </aside>
      </div>`;

    // El mosaico se arma con el ancho real de su tarjeta y el alto que queda en la pantalla (sin bajar a 1440×900).
    const mosaico = cuerpo.querySelector("[data-mosaico]");
    const ancho = mosaico.clientWidth;
    const lado = cuerpo.querySelector(".vt-lado");
    const enUnaColumna = getComputedStyle(cuerpo.querySelector(".vt-cuerpo")).gridTemplateColumns.split(" ").length === 1;
    // Sin bajar: la vitrina termina donde termina la columna de al lado (se descuenta su cabecera, medida una vez).
    const cab = cuerpo.querySelector(".vt-vitrina .vt-cab").offsetHeight;
    const alto = enUnaColumna ? Math.round(ancho * 0.62) : Math.max(280, lado.offsetHeight - cab - 10 - 28);
    mosaico.style.height = alto + "px";
    const visibles = r.prendas.filter((p) => p.miraron > 0);
    const rects = squarify(
      visibles.map((p) => p.miraron),
      0,
      0,
      ancho,
      alto,
    );
    mosaico.innerHTML = visibles.map((p, k) => pieza(p, rects[k], k)).join("") + `<div class="vt-barrido" aria-hidden="true"></div>`;
    const sinMirar = r.prendas.filter((p) => !p.miraron);
    if (sinMirar.length) {
      const sin = cuerpo.querySelector("[data-sin]");
      sin.hidden = false;
      sin.textContent = `Nadie miró: ${sinMirar.map((p) => p.nombre).join(", ")}.`;
    }

    if (modo === "entrada") entradaC(cuerpo);
    else if (modo === "cambio" && prev && prev.total) cambioC(cuerpo, r, prev, antes);
  };

  /* ---------- La entrada: las prendas entran en cascada, sus etiquetas se cuelgan y una luz cruza la vitrina, una vez ---------- */
  function entradaC(cuerpo) {
    P.anim(cuerpo.querySelector(".vt-recorrido"), [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 460, delay: 160 });
    cuerpo.querySelectorAll(".vt-paso").forEach((el, k) => {
      P.anim(el, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 240 + k * 70 });
      P.anim(el.querySelector(".vt-paso__barra i"), [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 640, delay: 340 + k * 70 });
      const b = el.querySelector("[data-cuenta-paso]");
      P.contar(b, 0, +b.textContent.replace(/\D/g, ""), { ms: 700, retraso: 300 + k * 70 });
    });
    P.anim(cuerpo.querySelector(".vt-vitrina"), [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 460, delay: 300 });
    const piezas = cuerpo.querySelectorAll(".vt-pieza");
    piezas.forEach((el) => {
      const k = +el.dataset.rango;
      const t = 460 + k * 45;
      P.anim(el, [{ opacity: 0, transform: "scale(0.94)" }, { opacity: 1, transform: "none" }], { duration: 520, delay: t });
      P.anim(el.querySelector(".vt-etiqueta"), [{ opacity: 0, transform: "translateY(-8px) rotate(-7deg)" }, { opacity: 1, transform: "none" }], { duration: 520, delay: t + 200 });
    });
    P.anim(cuerpo.querySelector(".vt-barrido"), [{ opacity: 1, transform: "translateX(-110%)" }, { opacity: 1, transform: "translateX(110%)" }], { duration: 1300, delay: 460 + piezas.length * 45 + 260, easing: "cubic-bezier(0.45, 0.05, 0.25, 1)" });
    cuerpo.querySelectorAll(".vt-bloque").forEach((el, k) => P.anim(el, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 460, delay: 620 + k * 100 }));
    cuerpo.querySelectorAll(".vt-fila__pista i").forEach((el, k) => P.anim(el, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 620, delay: 820 + (k % 7) * 50 }));
    cuerpo.querySelectorAll(".vt-hora").forEach((el, h) => P.anim(el, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 560, delay: 980 + h * 20 }));
  }

  /* ---------- Un cambio: la vitrina se reacomoda (cada baldosa viaja de su lugar viejo al nuevo) ---------- */
  function cambioC(cuerpo, r, prev, antes) {
    cuerpo.querySelectorAll(".vt-pieza").forEach((el) => {
      const a = antes && antes.get(el.dataset.prenda);
      const b = { x: +el.dataset.x, y: +el.dataset.y, w: +el.dataset.w, h: +el.dataset.h };
      if (a && b.w && b.h) {
        const sx = a.w / b.w;
        const sy = a.h / b.h;
        P.anim(el, [{ transform: `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(${sx}, ${sy})` }, { transform: "none" }], { duration: 560 });
      } else P.anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
      P.anim(el.querySelector(".vt-etiqueta"), [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 420 });
      P.anim(el.querySelector(".vt-icono"), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 260, delay: 420 });
    });
    cuerpo.querySelectorAll(".vt-paso").forEach((el, k) => {
      const b = el.querySelector("[data-cuenta-paso]");
      P.contar(b, prev.pasos[k].n, r.pasos[k].n, { ms: 560 });
      const de = k === 0 ? 1 : prev.pasos[k].de100 / Math.max(1, r.pasos[k].de100);
      P.anim(el.querySelector(".vt-paso__barra i"), [{ transform: `scaleX(${Math.min(3, de)})` }, { transform: "scaleX(1)" }], { duration: 520 });
    });
    cuerpo.querySelectorAll(".vt-fila__pista i, .vt-hora").forEach((el) => P.anim(el, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 360 }));
  }

  P.direcciones.c = D;
})();
