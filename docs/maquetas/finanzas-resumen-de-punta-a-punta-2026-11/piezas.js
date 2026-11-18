/* Finanzas ▸ Resumen · maqueta 2026-11-09 · LAS PIEZAS: íconos, cómo se escribe una cifra, los gráficos y la hoja.
   Los gráficos se dibujan midiendo su caja (no con preserveAspectRatio="none", que estira las letras) y se vuelven a dibujar al
   cambiar el ancho. Todo lo que se lee con el mouse también se lee con el dedo y con las flechas del teclado. */
(function () {
  "use strict";
  const C = window.CAYLA;

  /* ---------- íconos (trazos de lucide, 24 × 24) ---------- */
  const P = {
    izq: "M15 18l-6-6 6-6", der: "M9 18l6-6-6-6", abajo: "M6 9l6 6 6-6", flecha: "M5 12h14M13 6l6 6-6 6",
    sube: "M7 17L17 7M8 7h9v9", baja: "M7 7l10 10M17 8v9H8", igual: "M5 12h14",
    x: "M18 6L6 18M6 6l12 12", buscar: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
    chispa: "M12 3l1.9 5.6L19.5 10.5 13.9 12.4 12 18l-1.9-5.6L4.5 10.5l5.6-1.9zM19 3v4M21 5h-4",
    campana: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
    sol: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4",
    luna: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z", menu: "M4 6h16M4 12h16M4 18h16",
    ojo: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    ojoNo: "M9.9 4.2A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M14.1 14.1a3 3 0 0 1-4.2-4.2",
    tienda: "M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6",
    banco: "M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M12 3l9 5H3z",
    billetera: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3M21 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5M17 12h4v4h-4a2 2 0 0 1 0-4z",
    billete: "M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01",
    tarjeta: "M2 5h20v14H2zM2 10h20M6 15h4", camino: "M5 12h14M12 5l7 7-7 7",
    recibo: "M4 2v20l3-2 3 2 3-2 3 2 3-2 1 2V2l-1 2-3-2-3 2-3-2-3 2-3-2zM8 8h8M8 12h8M8 16h5",
    equipo: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
    casa: "M3 10l9-7 9 7v11H3zM9 21v-7h6v7", rayo: "M13 2L3 14h9l-1 8 10-12h-9z",
    calculo: "M4 2h16v20H4zM8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8",
    altavoz: "M3 11l15-6v14L3 13zM11.6 16.8a3 3 0 1 1-5.8-1.6", camion: "M1 4h14v12H1zM15 9h4l3 3v4h-7zM5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    caja: "M21 8l-9-5-9 5v8l9 5 9-5zM3.3 7L12 12l8.7-5M12 22V12", polo: "M20.4 6.6L16 4a4 4 0 0 1-8 0L3.6 6.6a2 2 0 0 0-.8 2.5L4 12h3v9h10v-9h3l1.2-2.9a2 2 0 0 0-.8-2.5z",
    calendario: "M3 5h18v16H3zM16 3v4M8 3v4M3 10h18", candado: "M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4",
    alerta: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    visto: "M20 6L9 17l-5-5", reloj: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2", mas: "M12 5v14M5 12h14",
    sunat: "M3 21h18M5 21V11M19 21V11M12 3l8 5H4zM9 21v-6h6v6", corazon: "M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z",
    inicio: "M3 10l9-7 9 7v11H3z", pulso: "M22 12h-4l-3 9L9 3l-3 9H2", produccion: "M12 3v18M3 12h18M5.6 5.6l12.8 12.8", gestion: "M3 3v18h18M7 14l4-4 4 4 5-5",
    venta: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0", web: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",
    inventario: "M21 8l-9-5-9 5v8l9 5 9-5zM12 22V12", catalogo: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", compras: "M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h9.2a2 2 0 0 0 2-1.6L22 7H6M9 21h.01M20 21h.01",
    finanzas: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", clientes: "M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z", colaboradores: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    colibri: "M3 13c4-1 7-4 9-9 1 4 0 7-2 9l11-1c-3 3-7 4-11 4l-3 5-1-5c-1-1-2-2-3-3z",
  };
  function ico(n, cls = "") { return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || ""}"/></svg>`; }

  /* ---------- cifras ---------- */
  const ESTADO = { ocultar: false };
  const S = (v, cent) => (ESTADO.ocultar ? "S/ •••" : C.soles(v, cent));
  const SC = (v) => (ESTADO.ocultar ? "S/ •••" : C.solesCorto(v));
  /* «6,9 mil» sin el S/: para celdas chicas (el calendario dice en su leyenda que son soles) */
  const K = (v) => (ESTADO.ocultar ? "•••" : C.solesCorto(v).replace("S/ ", ""));
  /* La cifra grande: «S/» chico, el signo menos de verdad y, si se pide, los céntimos chicos. data-contar la hace contar una vez. */
  function cifra(v, { cent = false, tam = "", contar = true, cls = "" } = {}) {
    if (ESTADO.ocultar) return `<span class="cifra ${cls}" style="${tam ? `font-size:${tam}` : ""}"><span class="mon">S/</span><span style="font-size:.55em;letter-spacing:.12em">•••••</span></span>`;
    const neg = v < 0, abs = Math.abs(v);
    const ent = Math.floor(cent ? abs : Math.round(abs));
    const c = cent ? `<span class="cent">.${String(Math.round((abs - Math.floor(abs)) * 100)).padStart(2, "0")}</span>` : "";
    return `<span class="cifra ${cls}" style="${tam ? `font-size:${tam}` : ""}">${neg ? '<span class="sig">−</span>' : ""}<span class="mon">S/</span><span ${contar ? `data-contar="${ent}"` : ""}>${ent.toLocaleString("es-PE")}</span>${c}</span>`;
  }
  /* Cuenta de lo que había a lo nuevo, 600 ms, una vez (ADR-0136: cifras que cuentan). */
  const ultimo = new Map();
  function contarCifras(raiz) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    raiz.querySelectorAll("[data-contar]").forEach((el, i) => {
      const fin = Number(el.dataset.contar);
      const clave = el.closest("[data-cifra]")?.dataset.cifra || `c${i}`;
      const desde = ultimo.has(clave) ? ultimo.get(clave) : Math.round(fin * 0.82);
      ultimo.set(clave, fin);
      if (reduce || desde === fin) { el.textContent = fin.toLocaleString("es-PE"); return; }
      const t0 = performance.now(), dur = 650;
      const paso = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(desde + (fin - desde) * e).toLocaleString("es-PE");
        if (k < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    });
  }
  function delta(x, { invertir = false, texto = "", dec = 0, contra = "" } = {}) {
    if (contra && !texto) texto = Math.abs(x) < 0.005 ? `que ${contra}` : `contra ${contra}`;
    const umbral = 0.005;
    const dir = Math.abs(x) < umbral ? "igual" : x > 0 ? "sube" : "baja";
    const bueno = invertir ? (dir === "baja" ? "sube" : dir === "sube" ? "baja" : "igual") : dir;
    const sig = dir === "igual" ? "" : x > 0 ? "+" : "−";
    if (dir === "igual") return `<span class="delta igual">${ico("igual")}igual${texto ? `<span class="texto-sec" style="font-weight:400;font-family:var(--cuerpo)">&nbsp;${texto}</span>` : ""}</span>`;
    return `<span class="delta ${bueno}">${ico(dir)}${sig}${C.pct(x, dec)}${texto ? `<span class="texto-sec" style="font-weight:400;font-family:var(--cuerpo)">&nbsp;${texto}</span>` : ""}</span>`;
  }

  /* ---------- gráfico de línea medido, con lectura por mouse, dedo y teclado ---------- */
  const graficos = new Map();
  let idG = 0;
  function linea(opts) {
    const id = `g${++idG}`;
    graficos.set(id, opts);
    return `<div class="graf" data-graf="${id}" style="height:${opts.alto || 220}px" tabindex="0" role="img" aria-label="${opts.aria || "Gráfico"}"><div class="globito"></div></div>`;
  }
  function dibujarLinea(el) {
    const o = graficos.get(el.dataset.graf);
    if (!o) return;
    const W = el.clientWidth, H = el.clientHeight;
    if (!W) return;
    const padL = o.padL ?? 8, padR = o.padR ?? 8, padT = o.padT ?? 18, padB = o.ejeX ? 26 : 8;
    const n = o.n;
    const todos = [];
    o.series.forEach((s) => s.vals.forEach((v) => v != null && todos.push(v)));
    (o.lineas || []).forEach((l) => todos.push(l.y));
    let yMin = o.yMin ?? Math.min(0, ...todos), yMax = o.yMax ?? Math.max(...todos);
    if (yMax === yMin) yMax = yMin + 1;
    yMax += (yMax - yMin) * 0.06;
    const X = (i) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
    const Y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
    const tramo = (vals, desde = 0) => {
      let d = "", dentro = false;
      vals.forEach((v, i) => {
        if (i < desde || v == null) { dentro = false; return; }
        d += `${dentro ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; dentro = true;
      });
      return d;
    };
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="area-${el.dataset.graf}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--tinta)" stop-opacity=".12"/><stop offset="1" stop-color="var(--tinta)" stop-opacity="0"/></linearGradient></defs>`;
    if (yMin < 0 && yMax > 0) svg += `<line class="guia" x1="${padL}" x2="${W - padR}" y1="${Y(0)}" y2="${Y(0)}" style="stroke:var(--taupe);opacity:.5"/>`;
    (o.lineas || []).forEach((l) => {
      svg += `<line x1="${padL}" x2="${W - padR}" y1="${Y(l.y)}" y2="${Y(l.y)}" style="stroke:${l.color || "var(--taupe)"};stroke-width:1.25;stroke-dasharray:${l.punteada === false ? "none" : "5 4"}"/>`;
      if (l.etiqueta) svg += `<text class="eje" x="${l.izq ? padL : W - padR}" y="${Y(l.y) - 7}" text-anchor="${l.izq ? "start" : "end"}" style="fill:${l.colorTexto || "var(--sec)"};font-weight:500">${l.etiqueta}</text>`;
    });
    if (o.franja) svg += `<rect x="${X(o.franja[0])}" y="${padT}" width="${Math.max(0, X(o.franja[1]) - X(o.franja[0]))}" height="${H - padT - padB}" style="fill:var(--pista)" rx="6"/>`;
    o.series.forEach((s) => {
      const d = tramo(s.vals, s.desde || 0);
      if (!d) return;
      if (s.area) {
        const idx = s.vals.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0);
        const a = `${d}L${X(idx[idx.length - 1])},${Y(Math.max(yMin, 0))}L${X(idx[0])},${Y(Math.max(yMin, 0))}Z`;
        svg += `<path d="${a}" fill="url(#area-${el.dataset.graf})" class="area-entra"/>`;
      }
      svg += `<path d="${d}" class="linea-${s.clase || "real"} ${o.dibujado || (s.clase && s.clase !== "real") ? "" : "dibuja"}" style="${s.color ? `stroke:${s.color};` : ""}--len:${W * 3}"/>`;
    });
    (o.marcas || []).forEach((mk) => {
      const x = X(mk.i), y = Y(mk.y);
      svg += `<circle cx="${x}" cy="${y}" r="${mk.r || 4.5}" style="fill:${mk.relleno || "var(--papel)"};stroke:${mk.color || "var(--tinta)"};stroke-width:2"/>`;
      if (mk.etiqueta) {
        const anchor = x < 70 ? "start" : x > W - 70 ? "end" : "middle";
        svg += `<text class="eje" x="${x}" y="${y + (mk.abajo ? 20 : -12)}" text-anchor="${anchor}" style="fill:var(--tinta);font-weight:600">${mk.etiqueta}</text>`;
      }
    });
    if (o.ejeX) {
      o.ejeX.forEach(([i, t]) => { svg += `<text class="eje" x="${X(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${t}</text>`; });
    }
    svg += `<line class="cursor" x1="0" x2="0" y1="${padT - 6}" y2="${H - padB}"/><circle class="punto" r="5" cx="0" cy="0"/></svg>`;
    const glob = el.querySelector(".globito");
    el.innerHTML = svg;
    el.appendChild(glob);
    o.dibujado = true;
    if (!o.leer) return;
    const cur = el.querySelector(".cursor"), pt = el.querySelector(".punto");
    let actual = o.inicio ?? null;
    const mostrar = (i) => {
      i = Math.max(0, Math.min(n - 1, i));
      actual = i;
      const r = o.leer(i);
      if (!r) return;
      const x = X(i), y = r.y != null ? Y(r.y) : padT;
      cur.setAttribute("x1", x); cur.setAttribute("x2", x);
      pt.setAttribute("cx", x); pt.setAttribute("cy", y);
      pt.style.display = r.y == null ? "none" : "";
      glob.innerHTML = r.html;
      const gw = glob.offsetWidth || 160;
      glob.style.left = `${Math.max(gw / 2 - 6, Math.min(W - gw / 2 + 6, x))}px`;
      glob.style.top = `${Math.max(glob.offsetHeight + 16, y)}px`;
      el.classList.add("leyendo");
      o.alLeer && o.alLeer(i, r);
    };
    const desdeX = (cx) => Math.round(((cx - el.getBoundingClientRect().left - padL) / (W - padL - padR)) * (n - 1));
    el.onpointermove = (e) => mostrar(desdeX(e.clientX));
    el.onpointerdown = (e) => mostrar(desdeX(e.clientX));
    el.onpointerleave = () => { el.classList.remove("leyendo"); o.alSoltar && o.alSoltar(); };
    el.onkeydown = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      mostrar((actual ?? o.inicio ?? n - 1) + (e.key === "ArrowRight" ? 1 : -1));
    };
    el.onfocus = () => mostrar(actual ?? o.inicio ?? n - 1);
    el.onblur = () => { el.classList.remove("leyendo"); o.alSoltar && o.alSoltar(); };
  }
  function montarGraficos(raiz) { raiz.querySelectorAll("[data-graf]").forEach(dibujarLinea); }
  let tRes;
  addEventListener("resize", () => { clearTimeout(tRes); tRes = setTimeout(() => montarGraficos(document), 120); });

  /* ---------- barras por día (CSS), con lectura ---------- */
  function barrasDia(m, { alto = 120, campo = "venta", leer = true, sede = null } = {}) {
    const vals = m.diario.map((d) => (sede ? d.porSede[sede] : d[campo]));
    const max = Math.max(...vals);
    const hoy = m.mes.diaHoy;
    const barras = m.diario.map((d, i) => {
      const fut = !d.real;
      const h = Math.max(4, (vals[i] / max) * 100);
      return `<i class="${fut ? "fut" : i + 1 === hoy && m.mes.enCurso ? "hoy" : ""}" style="height:${h}%;--k:${i}" data-i="${i}"></i>`;
    }).join("");
    return `<div class="barras-dia" style="position:relative;height:${alto}px" ${leer ? `data-barras-leer="${campo}"` : ""}><div class="barras">${barras}</div><div class="globito"></div></div>`;
  }
  function montarBarras(raiz, m) {
    raiz.querySelectorAll("[data-barras-leer]").forEach((el) => {
      const glob = el.querySelector(".globito");
      const barras = [...el.querySelectorAll(".barras > i")];
      const leer = (i) => {
        const d = m.diario[i];
        if (!d) return;
        barras.forEach((b, j) => b.classList.toggle("marcada", j === i && d.real));
        const b = barras[i];
        glob.innerHTML = d.real
          ? `<b>${S(d.venta)}</b>${C.NOMBRE_DIA[d.fecha.getDay()]} ${d.dia} · ${d.tickets} ventas`
          : `<b>Todavía no llega</b>${C.NOMBRE_DIA[d.fecha.getDay()]} ${d.dia}`;
        const x = b.offsetLeft + b.offsetWidth / 2;
        glob.style.left = `${Math.max(70, Math.min(el.clientWidth - 70, x))}px`;
        glob.style.top = `${b.offsetTop}px`;
        el.classList.add("leyendo");
        glob.style.opacity = 1;
      };
      el.onpointermove = (e) => {
        const r = el.getBoundingClientRect();
        leer(Math.floor(((e.clientX - r.left) / r.width) * barras.length));
      };
      el.onpointerleave = () => { glob.style.opacity = 0; barras.forEach((b) => b.classList.remove("marcada")); };
    });
  }

  function spark(vals, { alto = 36, color = "var(--tinta)" } = {}) {
    const v = vals.filter((x) => x != null);
    if (v.length < 2) return "";
    const w = 120, max = Math.max(...v), min = Math.min(...v);
    const d = v.map((x, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * w).toFixed(1)},${(alto - 3 - ((x - min) / (max - min || 1)) * (alto - 6)).toFixed(1)}`).join("");
    const ux = w, uy = alto - 3 - ((v[v.length - 1] - min) / (max - min || 1)) * (alto - 6);
    return `<svg class="spark" viewBox="-2 0 ${w + 4} ${alto}" style="height:${alto}px" aria-hidden="true"><path d="${d}" style="stroke:${color}"/><circle cx="${ux}" cy="${uy}" r="2.5" style="fill:${color}"/></svg>`;
  }
  function apilada(tramos, { cls = "", total = null } = {}) {
    const t = total ?? C.suma(tramos.map((x) => x.v));
    return `<div class="apilada ${cls}" role="img" aria-label="${tramos.map((x) => `${x.nombre}: ${C.pct(x.v / t)}`).join(", ")}">${tramos.map((x, k) => `<span style="flex-grow:${Math.max(0.0001, x.v / t)};--c:${x.c};--k:${k}" title="${x.nombre}: ${S(x.v)}"></span>`).join("")}${total && C.suma(tramos.map((x) => x.v)) < total ? `<span style="flex-grow:${(total - C.suma(tramos.map((x) => x.v))) / total};--c:transparent"></span>` : ""}</div>`;
  }

  /* ---------- la hoja: una por cifra, con «Anterior / Siguiente» para recorrer el mes ---------- */
  let hojaAbierta = null, focoPrevio = null;
  function abrirHoja(id) {
    const H = window.HOJAS;
    const m = window.APP.modeloActual();
    const def = H.def(id, m);
    if (!def) return;
    const yaAbierta = !!hojaAbierta;
    if (!yaAbierta) focoPrevio = document.activeElement;
    cerrarHoja(true);
    const capa = document.getElementById("capa-hoja");
    const orden = H.ORDEN;
    const k = orden.indexOf(id);
    const ant = k > 0 ? orden[k - 1] : null, sig = k >= 0 && k < orden.length - 1 ? orden[k + 1] : null;
    capa.innerHTML = `<div class="velo ${yaAbierta ? "abierto" : ""}" data-cerrar></div>
      <section class="hoja ${def.ancha ? "ancha" : ""}" role="dialog" aria-modal="true" aria-labelledby="hoja-t">
        <div class="asa" aria-hidden="true"></div>
        <header class="hoja-cab"><div class="t"><h2 id="hoja-t" tabindex="-1">${def.titulo}</h2>${def.bajada ? `<p>${def.bajada}</p>` : ""}</div>
        <button class="cerrar" data-cerrar aria-label="Cerrar">${ico("x")}</button></header>
        <div class="hoja-cuerpo">${def.cuerpo}</div>
        ${k >= 0 ? `<footer class="hoja-pie"><span>${k + 1} de ${orden.length} · ${def.pie || "Recorre el mes paso a paso"}</span><span class="der">
          ${ant ? `<button class="btn chico" data-hoja="${ant}" aria-label="Anterior: ${H.NOMBRE[ant]}">${ico("izq")}<span class="solo-ancho">${H.NOMBRE[ant]}</span></button>` : ""}
          ${sig ? `<button class="btn chico prim" data-hoja="${sig}">${H.NOMBRE[sig]}${ico("der", "ava")}</button>` : `<button class="btn chico" data-cerrar>Listo</button>`}</span></footer>` : ""}
      </section>`;
    const hoja = capa.querySelector(".hoja"), velo = capa.querySelector(".velo");
    [...hoja.querySelector(".hoja-cuerpo").children].forEach((c, i) => c.style.setProperty("--k", i));
    document.documentElement.classList.add("con-hoja");
    requestAnimationFrame(() => { velo.classList.add("abierto"); hoja.classList.add("abierta"); });
    hojaAbierta = { id, hoja, velo };
    window.APP.ponerHash({ hoja: id });
    montarGraficos(hoja); montarBarras(hoja, m); contarCifras(hoja);
    def.montar && def.montar(hoja, m);
    setTimeout(() => (hoja.querySelector(".hoja-cuerpo [data-foco]") || hoja.querySelector("#hoja-t")).focus({ preventScroll: true }), 60);
    arrastrable(hoja);
  }
  function cerrarHoja(inmediato) {
    if (!hojaAbierta) return;
    const { hoja, velo } = hojaAbierta;
    hojaAbierta = null;
    const capa = document.getElementById("capa-hoja");
    if (inmediato) { capa.innerHTML = ""; return; }
    hoja.classList.add("saliendo"); velo.classList.remove("abierto");
    document.documentElement.classList.remove("con-hoja");
    window.APP.ponerHash({ hoja: null });
    setTimeout(() => { if (!hojaAbierta) capa.innerHTML = ""; }, 280);
    focoPrevio && focoPrevio.focus && focoPrevio.focus({ preventScroll: true });
  }
  /* en el celular la hoja se baja con el dedo: pasado un tercio, o de un tirón, se va */
  function arrastrable(hoja) {
    if (!matchMedia("(max-width: 639.98px)").matches) return;
    const zona = hoja.querySelector(".asa"), cab = hoja.querySelector(".hoja-cab");
    let y0 = null, t0 = 0, dy = 0;
    const ini = (e) => { y0 = e.touches[0].clientY; t0 = Date.now(); hoja.classList.add("arrastrando"); };
    const mov = (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); hoja.style.setProperty("--arrastre", `${dy}px`); };
    const fin = () => {
      if (y0 == null) return;
      hoja.classList.remove("arrastrando");
      const v = dy / Math.max(1, Date.now() - t0);
      if (dy > hoja.offsetHeight / 3 || v > 0.8) cerrarHoja(); else hoja.style.setProperty("--arrastre", "0px");
      y0 = null; dy = 0;
    };
    [zona, cab].forEach((z) => { z.addEventListener("touchstart", ini, { passive: true }); z.addEventListener("touchmove", mov, { passive: true }); z.addEventListener("touchend", fin); });
  }
  document.addEventListener("keydown", (e) => {
    if (!hojaAbierta) return;
    if (e.key === "Escape") { e.preventDefault(); cerrarHoja(); return; }
    if (e.key === "Tab") {
      const f = [...hojaAbierta.hoja.querySelectorAll('button,[href],[tabindex="0"],summary,input')].filter((x) => x.offsetParent);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });

  /* ---------- un aviso corto arriba a la derecha (para lo que la maqueta no hace) ---------- */
  function avisar(texto) {
    let el = document.getElementById("aviso-maq");
    if (!el) { el = document.createElement("div"); el.id = "aviso-maq"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = texto;
    el.className = "aviso-maq visible";
    clearTimeout(el._t); el._t = setTimeout(() => (el.className = "aviso-maq"), 2600);
  }

  window.PZ = { ico, S, SC, K, cifra, delta, contarCifras, linea, montarGraficos, barrasDia, montarBarras, spark, apilada, abrirHoja, cerrarHoja, avisar, ESTADO, hojaAbierta: () => hojaAbierta };
})();
