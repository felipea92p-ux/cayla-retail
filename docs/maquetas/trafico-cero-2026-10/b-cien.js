/* =====================================================================
   B · «De cada 100» — las personas se cuentan.

   Seis grillas de 100 figuritas, una por paso del recorrido: en cada una, las que siguieron están llenas, las que se fueron en ese
   paso quedan en contorno y las que se fueron antes, tenues. Se lee contando («de 21 que la pusieron en la bolsa, solo 9
   separaron»). Abajo, cuatro tarjetas que hablan igual: por dónde llegan, desde dónde, a qué hora y qué prenda, de cada 100.

   Las 100 figuritas NO son 100 clientes reales: son el recorrido repartido en 100 (resto mayor, con las filas y las columnas
   cuadradas a la vez: lo que dice cada pie de grilla y cada fila de camino es exactamente lo que se ve encendido).
   ===================================================================== */
(function () {
  "use strict";
  const T = window.TRAFICO;
  const P = window.TRAFICO_UI;

  const D = {
    clave: "b",
    nombre: "B · De cada 100",
    prefijo: "cc",
    frase: "De cada 100 que entran: por dónde llegan, qué miran y dónde se van.",
    ordenTabla: ["recorrido", "caminos", "ciudades", "horas", "prendas"],
  };

  /* ---------- Repartir en 100 cuadrando filas y columnas a la vez ---------- */
  function redondearMatriz(v, filas, cols) {
    const R = v.length;
    const C = cols.length;
    const m = v.map((f) => f.map((x) => Math.floor(x + 1e-9)));
    const fr = filas.map((t, i) => t - m[i].reduce((a, b) => a + b, 0));
    const fc = cols.map((t, j) => t - m.reduce((a, f) => a + f[j], 0));
    const cand = [];
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) cand.push([v[i][j] - Math.floor(v[i][j] + 1e-9), i, j]);
    cand.sort((a, b) => b[0] - a[0]);
    for (const [, i, j] of cand) {
      if (fr[i] > 0 && fc[j] > 0) {
        m[i][j]++;
        fr[i]--;
        fc[j]--;
      }
    }
    for (let i = 0; i < R; i++)
      for (let j = 0; j < C; j++)
        while (fr[i] > 0 && fc[j] > 0) {
          m[i][j]++;
          fr[i]--;
          fc[j]--;
        }
    return m;
  }
  D.redondearMatriz = redondearMatriz;

  /** Las 100: de la que llegó más lejos a la que menos; cada una con un camino y una ciudad (repartidos aparte). */
  function cien(r) {
    const per = r.periodo.clave;
    const f = r.filtro;
    const lit = r.pasos.map((p) => p.de100);
    lit[0] = 100;
    const hondo = lit.map((v, d) => v - (d < 5 ? lit[d + 1] : 0));
    const porDondeSale = (pasos) => pasos.map((n, d) => n - (d < 5 ? pasos[d + 1] : 0));
    const vC = T.CAMINOS.map((c) => (f.camino && f.camino !== c.clave ? [0, 0, 0, 0, 0, 0] : porDondeSale(T.resumen(per, { camino: c.clave, ciudad: f.ciudad }).pasos.map((p) => p.n))));
    const vU = T.CIUDADES.map((u) => (f.ciudad && f.ciudad !== u.clave ? [0, 0, 0, 0, 0, 0] : porDondeSale(T.resumen(per, { camino: f.camino, ciudad: u.clave }).pasos.map((p) => p.n))));
    const aMatriz = (v) => hondo.map((_, d) => v.map((x) => (x[d] / r.total) * 100));
    const colC = f.camino ? T.CAMINOS.map((c) => (c.clave === f.camino ? 100 : 0)) : r.caminos.map((c) => c.de100);
    const colU = f.ciudad ? T.CIUDADES.map((u) => (u.clave === f.ciudad ? 100 : 0)) : r.ciudades.map((u) => u.de100);
    const mC = redondearMatriz(aMatriz(vC), hondo, colC);
    const mU = redondearMatriz(aMatriz(vU), hondo, colU);
    const lista = [];
    for (let d = 5; d >= 0; d--) {
      const cs = [];
      const us = [];
      mC[d].forEach((n, c) => {
        for (let k = 0; k < n; k++) cs.push(c);
      });
      mU[d].forEach((n, u) => {
        for (let k = 0; k < n; k++) us.push(u);
      });
      cs.forEach((c, k) => lista.push({ d, c, u: us[k] ?? 0 }));
    }
    return { lista, lit, colC, colU };
  }
  D.cien = cien;

  const estado = (p, s) => (p.d >= s ? "sigue" : p.d === s - 1 ? "sale" : "fuera");
  const pos = (i) => ({ x: (i % 10) * 10 + 0.8, y: Math.floor(i / 10) * 11.2 + 0.6 });

  function grilla(lista, s, r, conVelo) {
    let h = "";
    lista.forEach((p, i) => {
      const e = estado(p, s);
      const { x, y } = pos(i);
      h += `<use href="#cc-p" class="cc-f" data-e="${e}" data-c="${p.c}" data-u="${p.u}" data-i="${i}" x="${x}" y="${y.toFixed(1)}" width="8.4" height="10"/>`;
      if (conVelo && e === "sale") h += `<use href="#cc-p" class="cc-velo-lleno" data-i="${i}" x="${x}" y="${y.toFixed(1)}" width="8.4" height="10"/>`;
    });
    const paso = r.pasos[s];
    return `<svg class="cc-grilla" viewBox="0 0 100 112" role="img" aria-label="${paso.nombre}: ${paso.de100} de cada 100 (${P.personas(paso.n)})">${h}</svg>`;
  }

  function frase(r, lit) {
    const a = r.atora;
    if (!a) return "Todavía hay muy poca gente para saber dónde se atora.";
    const antes = lit[a.i - 1];
    const ahora = lit[a.i];
    return `de ${antes} que ${a.anteriorNombre}, <b>solo ${ahora} ${a.frase}</b>.`;
  }

  /* ---------- Pintar ---------- */
  D.render = function (cuerpo, r, { modo, prev }) {
    if (!r.total) {
      cuerpo.innerHTML = `<section class="tr-tarjeta" style="margin-top:16px;padding:40px;text-align:center"><h2 class="tr-titulo" style="justify-content:center">Nadie entró ${P.esc(P.nombreFiltro(r))} en estos días</h2><p class="tr-veredicto">Quita un filtro para ver a más gente.</p><p><button type="button" class="tr-limpiar" data-limpiar data-foco="limpiar-vacio">${P.icono("embudoX")}Limpiar filtros</button></p></section>`;
      return;
    }
    const entrada = modo === "entrada";
    const { lista, lit } = cien(r);
    const pasos = r.pasos
      .map((s) => {
        const esAtora = r.atora && r.atora.i === s.i;
        const fig = `<figure class="cc-paso" data-paso="${s.i}">
            ${grilla(lista, s.i, r, entrada && s.i > 0)}
            <figcaption class="cc-pie">
              <span class="cc-pie__nombre">${s.nombre}</span>
              <span class="cc-pie__cifra"><b data-cuenta-de100="${s.i}">${s.i === 0 ? 100 : s.de100}</b><span>de cada 100</span></span>
              <span class="cc-pie__personas">${P.personas(s.n)}</span>
              ${esAtora ? `<span class="cc-pie__atora">Aquí se atora</span>` : ""}
            </figcaption>
          </figure>`;
        if (s.i === 0) return fig;
        const salto = lit[s.i - 1] - lit[s.i];
        return `<div class="cc-salto" aria-hidden="true"${esAtora ? " data-atora" : ""}>${P.icono("flecha")}<span>−${salto}</span></div>${fig}`;
      })
      .join("");
    const glifo = (e) => `<svg viewBox="0 0 10 12" aria-hidden="true"><use href="#cc-p" class="cc-f" data-e="${e}" width="10" height="12"/></svg>`;

    // La lista muestra siempre el reparto (con el filtro de la otra lista): así la fila elegida dice cuántos son de cada 100 y las
    // demás siguen a la vista para cambiar. Las grillas, en cambio, solo tienen a la gente del filtro.
    const filas = (items, tipo) =>
      items
        .map((x, k) => {
          const n100 = x.de100;
          const txt = n100 === 0 && x.n > 0 ? "<1" : String(n100);
          const puntos = Array.from({ length: n100 }, () => "<i></i>").join("");
          return `<li><button type="button" class="cc-fila-btn" data-filtro-${tipo}="${x.clave}" data-resalta="${tipo === "camino" ? "c" : "u"}${k}" data-foco="b-${tipo}-${x.clave}" aria-pressed="${x.elegido}" ${x.n ? "" : "disabled"}
              aria-label="${P.esc(x.nombre)}: ${n100 === 0 && x.n > 0 ? "menos de 1" : n100} de cada 100 (${P.personas(x.n)})${x.tienda ? ", hay tienda CAYLA" : ""}. ${x.elegido ? "Quitar el filtro" : "Ver solo a esta gente"}"
              ${x.ayuda ? `data-globito="${P.esc(x.ayuda)}"` : ""}>
              <span class="cc-fila-btn__nombre">${x.elegido ? P.icono("x") : ""}${P.esc(x.nombre)}</span>
              <span class="cc-puntos" aria-hidden="true">${puntos}</span>
              <span class="cc-fila-btn__n num" aria-hidden="true">${txt}</span>
            </button></li>`;
        })
        .join("");
    const cTop = r.caminos.reduce((m, c, k) => (c.de100 > r.caminos[m].de100 ? k : m), 0);
    const uTop = r.ciudades.reduce((m, c, k) => (c.de100 > r.ciudades[m].de100 ? k : m), 0);
    const maxT = Math.max(1, ...r.tramos.map((t) => t.de100));
    const horas = r.tramos
      .map((t) => `<div class="cc-hora"${t.desde === r.pico.desde ? " data-pico" : ""} data-globito="${T.tramoTxt(t.desde, t.hasta)}: ${t.de100} de cada 100 (${P.personas(t.n)})">${Array.from({ length: t.de100 }, () => "<i></i>").join("")}</div>`)
      .join("");
    const ejes = [0, 6, 12, 18].map((h) => `<span style="left:${h === 0 ? 0 : (((h / 2 + 0.5) / 12) * 100).toFixed(2)}%">${T.horaCorta(h)}</span>`).join("");
    const top = r.prendas.slice(0, 3);
    const prendas = top
      .map(
        (p, k) => `<li><button type="button" class="cc-prenda${k === 0 ? " cc-prenda--1" : ""}" data-prenda="${p.codigo}" data-foco="b-prenda-${p.codigo}"
            aria-label="${P.esc(p.nombre)}: la miraron ${p.de100Vieron} de cada 100 que vieron una prenda (${P.personas(p.miraron)}). Ver el detalle">
            ${P.mosaico(p, k === 0 ? 40 : 26)}
            <span class="cc-prenda__nombre">${P.esc(p.nombre)}${k === 0 ? `<span class="cc-prenda__sub">${P.personas(p.miraron)}</span>` : ""}</span>
            <span class="cc-prenda__n num">${p.de100Vieron}</span>
          </button></li>`,
      )
      .join("");

    cuerpo.innerHTML = `
      <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><symbol id="cc-p" viewBox="0 0 10 12"><circle cx="5" cy="2.7" r="2.2"/><path d="M1.2 11.4V9.6a3.8 3.8 0 0 1 7.6 0v1.8z"/></symbol></defs></svg>
      <section class="tr-tarjeta cc-recorrido" aria-labelledby="cc-titulo">
        <div class="cc-cab">
          <h2 class="tr-titulo" id="cc-titulo">El recorrido, de cada 100 que entran</h2>
          <p class="tr-veredicto"><b>${P.titularAtora(r)}:</b> ${frase(r, lit)}${r.atora ? ` <button type="button" class="btn-enlace tr-porque" data-porque aria-expanded="false" aria-controls="cc-porque" data-foco="b-porque">¿Por qué?</button>` : ""}</p>
          <div class="cc-leyenda"><span>${glifo("sigue")}siguió</span><span>${glifo("sale")}se fue en ese paso</span><span>${glifo("fuera")}se fue antes</span><span>· ${r.total >= 150 ? `cada figura, unas ${P.fmt(Math.round(r.total / 100))} personas` : "cada figura es 1 de cada 100"}</span></div>
        </div>
        <p class="tr-explica" id="cc-porque" hidden>${P.explicaAtora(r)} En las grillas, de cada 100 personas que entraron.</p>
        <div class="cc-grillas" data-grillas>${pasos}</div>
      </section>
      <div class="cc-fila">
        <section class="tr-tarjeta cc-bloque" aria-labelledby="cc-t-camino">
          <h2 class="tr-titulo" id="cc-t-camino">Por dónde llegan</h2>
          <p class="tr-veredicto">De cada 100, <b>${r.caminos[cTop].de100} por ${P.esc(r.caminos[cTop].nombre)}</b>.</p>
          <ul class="cc-filas">${filas(r.caminos, "camino")}</ul>
        </section>
        <section class="tr-tarjeta cc-bloque" aria-labelledby="cc-t-ciudad">
          <h2 class="tr-titulo" id="cc-t-ciudad">Desde qué ciudad</h2>
          <p class="tr-veredicto">De cada 100, <b>${r.ciudades[uTop].de100} desde ${P.esc(r.ciudades[uTop].nombre)}</b>.</p>
          <ul class="cc-filas">${filas(r.ciudades, "ciudad")}</ul>
        </section>
        <section class="tr-tarjeta cc-bloque" aria-labelledby="cc-t-hora">
          <h2 class="tr-titulo" id="cc-t-hora">A qué hora entran</h2>
          <p class="tr-veredicto">De cada 100, <b>${r.pico.de100} entran ${T.tramoTxt(r.pico.desde, r.pico.hasta)}</b>.</p>
          <div class="cc-horas" role="img" aria-label="Personas por tramo de 2 horas, de cada 100; la mayoría ${T.tramoTxt(r.pico.desde, r.pico.hasta)}">${horas}</div>
          <div class="cc-ejes" aria-hidden="true">${ejes}</div>
        </section>
        <section class="tr-tarjeta cc-bloque" aria-labelledby="cc-t-prenda">
          <h2 class="tr-titulo" id="cc-t-prenda">La más mirada</h2>
          <p class="tr-veredicto" data-globito="Una persona puede mirar varias prendas: por eso no suman 100.">De cada 100 que vieron una prenda:</p>
          <ul class="cc-prendas">${prendas}</ul>
          <button type="button" class="tr-ver" data-vista="tabla" data-foco="b-ver-21" style="margin-top:4px">Ver las 21 ${P.icono("flecha")}</button>
        </section>
      </div>`;

    if (entrada) entradaB(cuerpo, r, lit);
    else if (modo === "cambio" && prev && prev.total) cambioB(cuerpo, r, prev, lista);
  };

  /* ---------- La entrada: las 100 aparecen en ola y, paso a paso, las que se van se apagan ---------- */
  function entradaB(cuerpo, r, lit) {
    P.anim(cuerpo.querySelector(".cc-recorrido"), [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: 160 });
    const figuras = cuerpo.querySelectorAll(".cc-paso");
    figuras.forEach((fig, s) => {
      const base = 320 + s * 240;
      if (s === 0) {
        fig.querySelectorAll(".cc-f").forEach((u) => {
          const i = +u.dataset.i;
          P.anim(u, [{ opacity: 0, transform: "scale(0.4)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: base + ((i % 10) + Math.floor(i / 10)) * 16 });
        });
      } else {
        P.anim(fig.querySelector(".cc-grilla"), [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: base });
        // Las que se fueron en este paso llegan llenas y se apagan a contorno.
        fig.querySelectorAll(".cc-velo-lleno").forEach((u) => {
          const i = +u.dataset.i;
          P.anim(u, [{ opacity: 1 }, { opacity: 0 }], { duration: 520, delay: base + 420 + (i % 10) * 12 });
        });
      }
      const b = fig.querySelector("[data-cuenta-de100]");
      P.contar(b, s === 0 ? 0 : lit[s - 1], s === 0 ? 100 : lit[s], { ms: 600, retraso: base + 300 });
      P.anim(fig.querySelector(".cc-pie"), [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: base + 200 });
    });
    cuerpo.querySelectorAll(".cc-salto").forEach((el, k) => P.anim(el, [{ opacity: 0, transform: "translateX(-6px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: 320 + (k + 1) * 240 + 260 }));
    const atora = cuerpo.querySelector(".cc-pie__atora");
    P.anim(atora, [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 400, delay: 320 + 6 * 240 + 400 });
    P.anim(cuerpo.querySelector(".cc-leyenda"), [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 1700 });
    cuerpo.querySelectorAll(".cc-bloque").forEach((el, k) => P.anim(el, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: 760 + k * 90 }));
    // Los puntos se cuentan de izquierda a derecha (una sola animación por fila, no una por punto).
    cuerpo.querySelectorAll(".cc-puntos").forEach((el, k) => P.anim(el, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: 760, delay: 980 + (k % 7) * 60 }));
    cuerpo.querySelectorAll(".cc-hora").forEach((el, k) => P.anim(el, [{ clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)" }], { duration: 640, delay: 1080 + k * 40 }));
    cuerpo.querySelectorAll(".cc-prenda").forEach((el, k) => P.anim(el, [{ opacity: 0, transform: "translateX(-8px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 1150 + k * 70 }));
  }

  /* ---------- Un cambio: solo se mueven las figuritas que cambiaron de estado ---------- */
  function cambioB(cuerpo, r, prev, lista) {
    const antes = cien(prev);
    cuerpo.querySelectorAll(".cc-paso").forEach((fig, s) => {
      fig.querySelectorAll(".cc-f").forEach((u) => {
        const i = +u.dataset.i;
        const a = antes.lista[i];
        const b = lista[i];
        if (!a || estado(a, s) !== estado(b, s)) P.anim(u, [{ opacity: 0.15, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: (i % 10) * 8 + Math.floor(i / 10) * 10 });
      });
      P.contar(fig.querySelector("[data-cuenta-de100]"), s === 0 ? 100 : antes.lit[s], s === 0 ? 100 : r.pasos[s].de100, { ms: 520 });
    });
    cuerpo.querySelectorAll(".cc-puntos, .cc-hora").forEach((el) => P.anim(el, [{ opacity: 0.35 }, { opacity: 1 }], { duration: 360 }));
  }

  /* ---------- Al pasar por un camino o una ciudad, se encienden sus personas en las seis grillas ---------- */
  D.montar = function (main) {
    const marcar = (boton) => {
      if (P.estado.dir !== "b") return;
      const g = main.querySelector("[data-grillas]");
      if (!g) return;
      const clave = boton && boton.dataset.resalta;
      const atr = clave && (clave[0] === "c" ? "data-c" : "data-u");
      // Solo se resalta si en las grillas hay gente de ese camino o esa ciudad (con un filtro puesto, las demás no están).
      if (clave && !boton.disabled && P.estado.vista === "grafico" && g.querySelector(`.cc-f[${atr}="${clave.slice(1)}"]`)) g.setAttribute("data-resalta", clave);
      else g.removeAttribute("data-resalta");
    };
    main.addEventListener("mouseover", (e) => marcar(e.target.closest(".cc-fila-btn")));
    main.addEventListener("focusin", (e) => marcar(e.target.closest(".cc-fila-btn")));
    main.addEventListener("focusout", () => marcar(null));
  };

  P.direcciones.b = D;
})();
