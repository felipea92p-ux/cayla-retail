/* Camino C · «Camino» — de cada S/ 100 que vendes, a dónde va cada sol.
   Empieza por una frase que se lee como la diría el contador de confianza, con sus cifras tocables. Después, el mismo cuento en
   dos dibujos: el río de la plata (de cada tienda a lo vendido, y de ahí a SUNAT, la ropa, el equipo, el local… y lo que queda),
   como el Sankey de Monarch, y la cuadrícula de 100 soles, donde cada cuadrito es S/ 1 de cada 100. Después la boleta del mes y la
   pregunta que más confunde: «si gané, ¿por qué tengo menos plata?» (Xero lo deja sin responder; aquí se responde en una resta).
   Al final, lo que viene, SUNAT y la ropa. */
(function () {
  "use strict";
  const C = window.CAYLA, Z = window.PZ, H = window.HOJAS;
  const { ico, S, cifra, delta } = Z;
  let vista = "soles", tramo = "hoy";

  /* ---------- las partes de lo vendido ---------- */
  function partes(m) {
    const enMes = !m.mes.enCurso || tramo === "mes";
    const venta = enMes ? m.ventas.mes : m.ventas.hoy;
    const g = enMes ? m.gastos.mes : m.gastos.hoy;
    const igv = venta - venta / 1.18;
    const ropa = enMes ? m.costo.mes : m.costo.hoy;
    const otros = C.suma(["servicios", "contador", "comisiones", "publicidad", "envios", "empaque", "otros"].map((k) => g[k]));
    const queda = venta - igv - ropa - g.sueldos - g.alquiler - g.beneficios - otros;
    const p = [
      { id: "igv", nombre: "SUNAT (IGV)", corto: "SUNAT", v: igv, c: "var(--r-terracota)", hoja: "sunat", que: "El 18 % que va en el precio. Se lo entregas a SUNAT." },
      { id: "ropa", nombre: "Lo que costó la ropa", corto: "La ropa", v: ropa, c: "var(--r-ocre)", hoja: "inventario", que: "Lo que pagaste por las prendas que se vendieron." },
      { id: "sueldos", nombre: "Sueldos y EsSalud", corto: "Sueldos", v: g.sueldos, c: "var(--pizarra)", hoja: "gastos", que: "El equipo de las tiendas y del taller." },
      { id: "alquiler", nombre: "Alquiler", corto: "Alquiler", v: g.alquiler, c: "var(--sede-tru)", hoja: "gastos", que: "Los locales." },
      { id: "beneficios", nombre: "CTS y gratificación", corto: "CTS y grati", v: g.beneficios, c: "var(--r-pizarra)", hoja: "gastos", que: "La parte de este mes." },
      { id: "otros", nombre: "Otros gastos", corto: "Otros", v: otros, c: "var(--neutro)", hoja: "gastos", que: "Servicios, comisiones, publicidad, envíos y lo demás." },
      { id: "queda", nombre: queda >= 0 ? "Te queda" : "Te faltó", corto: queda >= 0 ? "Te queda" : "Te faltó", v: queda, c: queda >= 0 ? "var(--verde)" : "var(--rojo)", hoja: "deja", que: queda >= 0 ? "Lo que el negocio ganó." : "Lo que faltó para cubrir todo." },
    ];
    return { venta, partes: p, queda, enMes };
  }
  const de100 = (v, venta) => (v / venta) * 100;
  const fmt = (v, venta) => (vista === "cien" ? `S/ ${de100(v, venta).toFixed(1).replace(".", ",").replace(",0", "")}` : S(v));

  function frase(m) { return m.todas ? "De lo que vendes a lo que te queda, sol por sol." : `De lo que vende ${m.nombreSede} a lo que le queda, sol por sol. Sin los gastos generales.`; }

  /* ---------- la frase grande, con sus cifras tocables ---------- */
  function relato(m) {
    const P = partes(m), x = Object.fromEntries(P.partes.map((p) => [p.id, p]));
    const tok = (v, hoja, cls = "") => `<button class="c-tok ${cls}" data-hoja="${hoja}">${S(v)}</button>`;
    const gastos = x.sueldos.v + x.alquiler.v + x.beneficios.v + x.otros.v;
    const cuando = !m.mes.enCurso ? `En ${m.mes.nombre}` : P.enMes ? `Si noviembre sigue así,` : `En noviembre, hasta hoy,`;
    const verbo = !m.mes.enCurso ? "vendiste" : P.enMes ? "venderías" : "vendiste";
    const cierre = P.queda >= 0
      ? `${m.mes.enCurso && !P.enMes ? "Te queda" : !m.mes.enCurso ? "Te quedó" : "Te quedaría"} ${tok(P.queda, "deja", "verde")}${m.todas ? "" : " antes de los gastos generales"}.`
      : `Faltó ${tok(-P.queda, "deja", "rojo")} para cubrirlo todo.`;
    const extra = m.mes.enCurso && !P.enMes ? `<p class="c-relato-extra">${m.teDeja.mes >= 0 ? `Si el mes sigue así, cierra con unos <b class="num">${S(m.teDeja.mes)}</b>${m.teDeja.antMes != null ? `, ${m.teDeja.mes >= m.teDeja.antMes ? "más" : "menos"} que los ${S(m.teDeja.antMes)} de octubre` : ""}` : "Si el mes sigue así, no alcanza"}. Hoy queda poco porque los gastos fijos se cuentan desde el día 1 y las ventas llegan de a poco. <button class="enlace" data-tramo="mes">Ver el mes estimado</button></p>`
      : m.mes.enCurso ? `<p class="c-relato-extra">Es una estimación al ritmo de hoy. <button class="enlace" data-tramo="hoy">Volver a lo de hasta hoy</button></p>` : "";
    const plata = m.mes.enCurso && m.todas ? `<p class="c-relato-plata">${Z.ico("billetera")}<span>En bancos y cajas tienes <b class="num">${S(m.plata.tienes)}</b>; puedes usar <button class="c-tok verde" data-hoja="plata">${S(m.plata.libre)}</button> sin dejar de pagar nada. Lo próximo: la quincena y la CTS (${S(C.suma(m.pagos.filter((x) => x.tipo === "equipo" && x.fecha.getDate() === 15 && !x.lejos).map((x) => x.monto)))}) el domingo 15, y SUNAT (${S(m.sunat.pagar.total)}, lo de octubre) el miércoles 18.</span></p>` : "";
    return `<section class="c-relato entra" data-cifra="c-relato"><p class="c-frase">${cuando} ${verbo} ${tok(P.venta, "ventas")}. De eso, ${tok(x.igv.v, "sunat", "terracota")} es el IGV, que le toca a SUNAT${m.mes.enCurso ? " en diciembre" : ""}; ${tok(x.ropa.v, "inventario", "ocre")} fue lo que costó la ropa y ${tok(gastos, "gastos", "pizarra")} se fue en gastos. ${cierre}</p>${extra}${plata}</section>`;
  }

  /* ---------- el río (Sankey) ---------- */
  function rio(m) {
    const P = partes(m);
    return `<section class="vidrio pad entra c-rio-caja"><div class="cab-sec"><div><h2 class="titulo-sec">El camino de la plata</h2><p class="bajada">Pasa el mouse por un tramo para leerlo; tócalo para abrir su detalle.</p></div>
      ${controles(m)}</div><div class="c-rio" data-rio style="height:${m.todas ? 420 : 380}px"><div class="globito"></div></div></section>`;
  }
  function controles(m) {
    return `<div class="c-ctrl">${m.mes.enCurso ? `<div class="seg seg-chico" role="group" aria-label="Qué parte del mes"><button aria-pressed="${tramo === "hoy"}" data-tramo="hoy">Hasta hoy</button><button aria-pressed="${tramo === "mes"}" data-tramo="mes">El mes, estimado</button><span class="gota"></span></div>` : ""}
      <div class="seg seg-chico" role="group" aria-label="Cómo se cuenta"><button aria-pressed="${vista === "soles"}" data-vista="soles">En soles</button><button aria-pressed="${vista === "cien"}" data-vista="cien">De cada S/ 100</button><span class="gota"></span></div></div>`;
  }
  function dibujarRio(el, m) {
    const P = partes(m);
    const W = el.clientWidth, Hh = el.clientHeight;
    if (!W) return;
    const glob = el.querySelector(".globito");
    const izqs = m.todas ? C.CLAVES_SEDE.map((s) => {
      const v = P.enMes ? m.diario.reduce((a, d) => a + d.porSede[s], 0) : m.porSede[s].venta;
      return { id: s, nombre: C.SEDES[s].nombre, v, c: H.COLOR_SEDE[s], hoja: `sede-${s}` };
    }) : [];
    const der = P.partes.filter((p) => p.v > 0);
    const falta = P.queda < 0 ? -P.queda : 0;
    const total = P.venta + falta;
    const gap = 10, labIzq = m.todas ? 120 : 0, labDer = Math.min(220, W * 0.3);
    const xIzq = labIzq, xCen = m.todas ? W * 0.38 : labIzq + 20, xDer = W - labDer - 12, ancho = 12;
    const altoUtil = Hh - gap * (der.length - 1) - 44;
    const k = altoUtil / total;
    let svg = `<svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}">`;
    const banda = (x1, a1, b1, x2, a2, b2) => { const xm = (x1 + x2) / 2; return `M${x1},${a1}C${xm},${a1} ${xm},${a2} ${x2},${a2}L${x2},${b2}C${xm},${b2} ${xm},${b1} ${x1},${b1}Z`; };
    const yCen0 = 4 + (falta ? falta * k : 0) * 0;
    const altoCen = P.venta * k;
    const cenTop = (Hh - altoCen - (falta * k)) / 2 + 16;
    /* izquierda → centro */
    let yl = cenTop + (Hh - cenTop * 2 - altoCen - falta * k) / 2;
    let yi = (Hh - (C.suma(izqs.map((x) => x.v)) * k + gap * (izqs.length - 1))) / 2, yc = cenTop;
    izqs.forEach((n) => {
      const h = n.v * k;
      svg += `<path class="c-banda" data-n="${n.id}" d="${banda(xIzq + ancho, yi, yi + h, xCen, yc, yc + h)}" style="fill:${n.c}"/>`;
      svg += `<rect class="c-nodo" data-n="${n.id}" data-hoja="${n.hoja}" x="${xIzq}" y="${yi}" width="${ancho}" height="${Math.max(2, h)}" rx="4" style="fill:${n.c}"/>`;
      svg += `<text class="c-lab" x="${xIzq - 10}" y="${yi + h / 2 - 3}" text-anchor="end">${n.nombre}</text><text class="c-lab-v" x="${xIzq - 10}" y="${yi + h / 2 + 14}" text-anchor="end">${fmt(n.v, P.venta)}</text>`;
      n.y = yi; n.h = h;
      yi += h + gap; yc += h;
    });
    /* el nodo de lo vendido */
    svg += `<rect class="c-nodo cen" data-n="venta" data-hoja="ventas" x="${xCen}" y="${cenTop}" width="${ancho}" height="${altoCen}" rx="4" style="fill:var(--tinta)"/>`;
    const cenLabX = m.todas ? xCen + ancho / 2 : xCen - 8;
    svg += m.todas ? `<text class="c-lab cen" x="${xCen + ancho / 2}" y="${cenTop - 22}" text-anchor="middle">Vendiste</text><text class="c-lab-v" x="${xCen + ancho / 2}" y="${cenTop - 6}" text-anchor="middle">${vista === "cien" ? "S/ 100" : S(P.venta)}</text>`
      : `<text class="c-lab cen" x="${xCen}" y="${cenTop - 22}">Vendiste</text><text class="c-lab-v" x="${xCen}" y="${cenTop - 6}">${vista === "cien" ? "S/ 100" : S(P.venta)}</text>`;
    if (falta) {
      svg += `<rect class="c-nodo" data-n="falta" data-hoja="deja" x="${xCen}" y="${cenTop + altoCen + 4}" width="${ancho}" height="${falta * k}" rx="4" style="fill:var(--rojo)"/>`;
    }
    /* centro → derecha */
    let yd = (Hh - (C.suma(der.map((x) => x.v)) * k + gap * (der.length - 1))) / 2, yo = cenTop;
    der.forEach((n) => {
      const h = n.v * k;
      svg += `<path class="c-banda" data-n="${n.id}" d="${banda(xCen + ancho, yo, yo + h, xDer, yd, yd + h)}" style="fill:${n.c}"/>`;
      svg += `<rect class="c-nodo" data-n="${n.id}" data-hoja="${n.hoja}" x="${xDer}" y="${yd}" width="${ancho}" height="${Math.max(2, h)}" rx="4" style="fill:${n.c}"/>`;
      n.y = yd; n.h = h; n.ly = yd + h / 2;
      yd += h + gap; yo += h;
    });
    /* las etiquetas de la derecha se apartan para no pisarse (34 px entre una y otra), con una guía fina si se movieron */
    for (let i = 1; i < der.length; i++) der[i].ly = Math.max(der[i].ly, der[i - 1].ly + 40);
    const tope = Hh - 14;
    if (der.length && der[der.length - 1].ly > tope) { der[der.length - 1].ly = tope; for (let i = der.length - 2; i >= 0; i--) der[i].ly = Math.min(der[i].ly, der[i + 1].ly - 40); }
    der.forEach((n) => {
      const cy = n.y + n.h / 2, xl = xDer + ancho + 10;
      if (Math.abs(n.ly - cy) > 4) svg += `<path d="M${xDer + ancho + 2},${cy}L${xl - 4},${n.ly - 6}" style="stroke:var(--linea);stroke-width:1;fill:none"/>`;
      svg += `<text class="c-lab ${n.id === "queda" ? "fuerte" : ""}" x="${xl}" y="${n.ly - 3}">${n.nombre}</text><text class="c-lab-v" x="${xl}" y="${n.ly + 14}">${fmt(n.v, P.venta)}${vista === "soles" ? ` · ${Math.round(de100(n.v, P.venta))} de cada 100` : ""}</text>`;
    });
    svg += `</svg>`;
    el.innerHTML = svg; el.appendChild(glob);
    const todos = [...izqs, ...der];
    const marcar = (id) => {
      el.classList.toggle("marcando", !!id);
      el.querySelectorAll(".c-banda,.c-nodo").forEach((p) => p.classList.toggle("on", p.dataset.n === id));
      const n = todos.find((x) => x.id === id);
      if (!n) { glob.style.opacity = 0; return; }
      const esIzq = izqs.includes(n);
      glob.innerHTML = `<b>${S(n.v)}</b>${n.nombre}<small>${Math.round(de100(n.v, P.venta))} de cada S/ 100 vendidos${n.que ? ` · ${n.que}` : ""}</small>`;
      glob.style.whiteSpace = "normal"; glob.style.maxWidth = "260px";
      glob.style.left = `${esIzq ? (xIzq + xCen) / 2 : (xCen + xDer) / 2}px`;
      glob.style.top = `${n.y + n.h / 2}px`;
      glob.style.opacity = 1;
    };
    el.onpointermove = (e) => { const t = e.target.closest("[data-n]"); marcar(t ? t.dataset.n : null); };
    el.onpointerleave = () => marcar(null);
    el.onclick = (e) => { const t = e.target.closest("[data-n]"); if (!t) return; const n = todos.find((x) => x.id === t.dataset.n); Z.abrirHoja(n ? n.hoja : t.dataset.hoja || "ventas"); };
  }

  /* ---------- la cuadrícula de 100 soles ---------- */
  function cuadricula(m) {
    const P = partes(m);
    const ps = P.partes.filter((p) => p.v > 0);
    const base = P.venta;
    /* mayor resto: que sumen exactamente 100 */
    const crudo = ps.map((p) => (p.v / base) * 100);
    const ent = crudo.map(Math.floor);
    let falta = Math.min(100, Math.round(C.suma(crudo))) - C.suma(ent);
    crudo.map((x, i) => [x - ent[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (falta > 0) { ent[i]++; falta--; } });
    const cuadros = [];
    ps.forEach((p, i) => { for (let j = 0; j < ent[i]; j++) cuadros.push(p); });
    while (cuadros.length < 100) cuadros.push(null);
    const extra = P.queda < 0 ? Math.round((-P.queda / base) * 100) : 0;
    return `<section class="vidrio pad entra c-cien"><div class="cab-sec"><div><h2 class="titulo-sec">De cada S/ 100</h2><p class="bajada">Cada cuadrito es S/ 1 de cada 100 que ${P.enMes && m.mes.enCurso ? "venderías" : "vendiste"}.</p></div></div>
      <div class="c-grilla" role="img" aria-label="${ps.map((p, i) => `${p.corto}: ${ent[i]} de cada 100`).join(", ")}">${cuadros.map((p, i) => `<i data-p="${p ? p.id : ""}" style="--c:${p ? p.c : "var(--pista)"};--k:${i}"></i>`).join("")}</div>
      ${extra ? `<p class="bajada rojo-t" style="margin-top:8px">Y faltaron ${extra} soles más de cada 100 para cubrirlo todo.</p>` : ""}
      <ul class="c-ley">${ps.map((p, i) => `<li><button data-p-ley="${p.id}" data-hoja="${p.hoja}"><span class="muestra" style="--c:${p.c}"></span><span class="c-ley-n">${p.corto}</span><b class="num">${ent[i]}</b></button></li>`).join("")}</ul></section>`;
  }

  /* ---------- la boleta del mes ---------- */
  function boleta(m) {
    const P = partes(m), x = Object.fromEntries(P.partes.map((p) => [p.id, p]));
    const enMes = P.enMes;
    const ant = C.punto(m.sede, C.mesAnterior(m.mes.clave), enMes ? 31 : m.mes.diaHoy);
    const antV = ant.venta, antQueda = enMes ? ant.teDeja : ant.teDejaPunto;
    const fila = (signo, p, v, que, cls = "") => `<div class="c-bol-f ${cls}"><span class="signo">${signo}</span><div class="c-bol-n">${que ? `<details><summary><b>${p}</b><span class="q-mini">?</span></summary><small>${que}</small></details>` : `<b>${p}</b>`}</div><span class="num c-bol-m">${S(v)}</span><span class="num c-bol-c">${Math.round(de100(v, P.venta))}</span></div>`;
    const sin = P.venta - x.igv.v;
    return `<section class="vidrio pad entra c-boleta"><div class="cab-sec"><div><h2 class="titulo-sec">La boleta de ${m.mes.nombre}</h2><p class="bajada">${m.mes.enCurso ? (enMes ? "El mes completo, al ritmo de hoy." : `Del 1 al ${m.mes.diaHoy}.`) : "El mes completo."} Lo mismo que los estados financieros, en palabras de tienda.</p></div></div>
      <div class="c-bol-cab"><span></span><span></span><span class="der">Soles</span><span class="der">De cada 100</span></div>
      ${fila("", P.enMes && m.mes.enCurso ? "Lo que venderías" : "Vendiste", P.venta, "", "fuerte")}
      ${fila("−", "IGV", x.igv.v, x.igv.que)}
      ${fila("=", "Es tuyo", sin, "", "sub")}
      ${fila("−", "Lo que costó la ropa", x.ropa.v, x.ropa.que)}
      ${fila("=", "Lo que deja la ropa", sin - x.ropa.v, "Lo que queda de cada venta para pagar los gastos.", "sub")}
      ${fila("−", "Sueldos y EsSalud", x.sueldos.v, "El equipo y el 9 % de EsSalud.")}
      ${fila("−", "Alquiler", x.alquiler.v, "")}
      ${fila("−", "CTS y gratificación", x.beneficios.v, "Se pagan después, pero se ganan cada mes.")}
      ${fila("−", "Otros gastos", x.otros.v, x.otros.que)}
      ${fila("=", P.queda >= 0 ? "Te queda" : "Te faltó", P.queda, "", "res")}
      <p class="c-bol-comp">${delta(P.venta / antV - 1, { texto: `en ventas contra ${ant.nombre}${enMes ? "" : " a esta altura"}` })} · ${P.queda - antQueda >= 0 ? `te queda <b class="num">${S(P.queda - antQueda)}</b> más` : `te queda <b class="num">${S(antQueda - P.queda)}</b> menos`}</p></section>`;
  }

  /* ---------- «si gané, ¿por qué tengo menos plata?» ---------- */
  function puente(m) {
    if (!m.mes.enCurso || !m.todas) {
      const h = m.historia, max = Math.max(...h.map((x) => Math.abs(x.teDeja)));
      return `<section class="vidrio pad entra c-puente"><div class="cab-sec"><div><h2 class="titulo-sec">Mes a mes</h2><p class="bajada">Lo que te quedó cada mes, en miles de soles y con la misma escala.</p></div></div>
        <div class="hist">${h.map((x) => `<div class="hist-col ${x.clave === m.mes.clave ? "esta" : ""}"><span class="hist-v num">${Z.K(x.teDeja)}</span><div class="hist-pista"><i class="${x.teDeja < 0 ? "neg" : ""} ${x.proyectado ? "proy" : ""}" style="height:${(Math.abs(x.teDeja) / max) * 100}%"></i></div><span class="hist-m">${C.NOMBRE_MES[Number(x.clave.split("-")[1]) - 1].slice(0, 3)}</span></div>`).join("")}</div>
        ${!m.todas && m.mes.enCurso ? `<p class="nota" style="margin-top:14px">«Si gané, ¿por qué tengo menos plata?» se responde con «Todas»: el banco es de toda la empresa.</p>` : ""}</section>`;
    }
    const g = m.gastos.hoy;
    const pasos = [
      { t: "Te queda, hasta hoy", s: "Lo de la boleta", v: m.teDeja.hoy, base: true },
      { t: "IGV que cobraste y aún no pagas", s: "Se paga en diciembre", v: m.ventas.igvHoy },
      { t: "Sueldos y CTS que aún no pagas", s: "La quincena llega el 15", v: g.sueldos + g.beneficios },
      { t: "Alquiler de todo noviembre", s: "Se pagó entero el día 1", v: -(m.gastos.mes.alquiler - g.alquiler) },
      { t: "Ropa nueva para Black Friday", s: "Compraste más de lo que vendiste: no es gasto, es stock", v: -8400 },
      { t: "Pagos de octubre hechos ahora", s: "Claudia y el estudio contable", v: -3950 },
    ];
    const cambio = C.suma(pasos.map((p) => p.v));
    const inicio = m.plata.tienes - cambio;
    let acum = 0;
    const max = Math.max(...pasos.map((p) => { acum += p.v; return Math.max(Math.abs(acum), Math.abs(acum - p.v)); }), Math.abs(cambio)) * 1.05;
    acum = 0;
    const cero = 42; // % del ancho donde va el cero
    const pos = (v) => cero + (v / max) * (100 - cero) * 0.98;
    const filas = pasos.map((p, i) => {
      const a = acum, b = acum + p.v; acum = b;
      const l = Math.min(pos(a), pos(b)), w = Math.abs(pos(b) - pos(a));
      return `<div class="c-pf" style="--k:${i}"><div class="c-pf-t"><b>${p.t}</b><small>${p.s}</small></div><div class="c-pf-barra"><i class="${p.v >= 0 ? "mas" : "menos"} ${p.base ? "base" : ""}" style="left:${l}%;width:${Math.max(0.6, w)}%"></i></div><span class="num c-pf-v ${p.v >= 0 ? "mas" : "menos"}">${p.v >= 0 ? "+" : "−"}${S(Math.abs(p.v))}</span></div>`;
    }).join("");
    return `<section class="vidrio pad entra c-puente"><div class="cab-sec"><div><h2 class="titulo-sec">Si gané, ¿por qué tengo menos plata?</h2><p class="bajada">Ganancia y plata no son lo mismo. Esta resta explica la diferencia.</p></div></div>
      <div class="c-puente-lista" style="--cero:${cero}%">${filas}
        <div class="c-pf total"><div class="c-pf-t"><b>Tu plata ${cambio >= 0 ? "subió" : "bajó"}</b><small>Desde el 1 de noviembre</small></div><div class="c-pf-barra"><i class="${cambio >= 0 ? "mas" : "menos"} res" style="left:${Math.min(pos(0), pos(cambio))}%;width:${Math.abs(pos(cambio) - pos(0))}%"></i></div><span class="num c-pf-v">${cambio >= 0 ? "+" : "−"}${S(Math.abs(cambio))}</span></div></div>
      <p class="c-puente-fin">Empezaste noviembre con <b class="num">${S(inicio)}</b> y hoy tienes <b class="num">${S(m.plata.tienes)}</b>. ${cambio < 0 ? "No es que pierdas: la plata se fue adelantada al local y a la ropa de Black Friday." : ""}</p></section>`;
  }

  /* ---------- lo que viene, SUNAT y la ropa ---------- */
  function hilo(m) {
    if (!m.mes.enCurso) return "";
    /* los próximos 30 días como columnas: la altura es lo que sale ese día; se nombran solo los cuatro más grandes */
    const dias = [];
    for (let d = -3; d <= 30; d++) {
      const f = new Date(2026, 10, 9 + d);
      const xs = m.pagos.filter((x) => (d === -3 ? x.vencida : +x.fecha === +f && !x.vencida));
      dias.push({ d, f, xs, tot: C.suma(xs.map((x) => x.monto)) });
    }
    const max = Math.max(...dias.map((x) => x.tot));
    const grandes = [];
    [...dias].filter((x) => x.tot).sort((a, b) => b.tot - a.tot).forEach((x) => { if (grandes.length < 4 && grandes.every((g) => Math.abs(g - x.d) > 2)) grandes.push(x.d); });
    const tipoColor = (xs) => xs.some((x) => x.vencida) ? "var(--rojo)" : xs.some((x) => x.tipo === "sunat") ? "var(--r-terracota)" : xs.some((x) => x.tipo === "equipo") ? "var(--pizarra)" : xs.some((x) => x.tipo === "alquiler") ? "var(--sede-tru)" : xs.some((x) => x.tipo === "proveedor") ? "var(--r-ocre)" : "var(--neutro)";
    const nombre = (x) => x.xs.length > 1 ? `${x.xs.length} pagos` : x.xs[0].concepto.replace("Factura de ", "").replace("SUNAT · lo de octubre", "SUNAT");
    return `<section class="vidrio pad entra c-hilo-caja"><div class="cab-sec"><div><h2 class="titulo-sec">Lo que viene</h2><p class="bajada">Lo que sale cada día en los próximos 30. Pasa el mouse por una columna para leerla.</p></div><button class="ver" data-hoja="pagos">Ver la lista${ico("flecha")}</button></div>
      <div class="c-dias" role="list">${dias.map((x, k) => `<button class="c-dia ${x.d === 0 ? "hoy" : ""} ${x.d < 0 ? "antes" : ""} ${x.tot ? "" : "vacio"}" role="listitem" style="--k:${k}" ${x.tot ? `data-hoja="${x.xs.some((p) => p.tipo === "sunat") ? "sunat" : "pagos"}"` : "tabindex=\"-1\""}
          title="${x.tot ? x.xs.map((p) => `${p.concepto}: ${C.soles(p.monto)}`).join(" · ") : ""}" aria-label="${C.fecha(x.f, true)}${x.tot ? `: ${x.xs.map((p) => p.concepto).join(", ")}, ${C.soles(x.tot)}` : ", sin pagos"}">
          ${grandes.includes(x.d) ? `<span class="c-dia-et"><b class="num">${Z.SC(x.tot)}</b>${nombre(x)}</span>` : ""}
          <span class="c-dia-col">${x.tot ? `<i style="height:${Math.max(6, Math.sqrt(x.tot / max) * 100)}%;--c:${tipoColor(x.xs)}"></i>` : ""}</span>
          <span class="c-dia-n">${x.d === -3 ? "6" : x.f.getDate()}</span>${x.f.getDate() === 1 && x.d > 0 ? '<span class="c-dia-mes">dic</span>' : ""}</button>`).join("")}</div>
      <div class="leyenda" style="margin-top:12px"><span><i class="muestra" style="--c:var(--pizarra)"></i>El equipo</span><span><i class="muestra" style="--c:var(--r-terracota)"></i>SUNAT</span><span><i class="muestra" style="--c:var(--r-ocre)"></i>Proveedores</span><span><i class="muestra" style="--c:var(--sede-tru)"></i>Alquiler</span><span><i class="muestra" style="--c:var(--neutro)"></i>Recibos y otros</span><span><i class="muestra" style="--c:var(--rojo)"></i>Vencido</span></div></section>`;
  }
  function sunatMini(m) {
    const s = m.sunat;
    return `<section class="vidrio pad entra tocable" data-hoja="sunat" role="button" tabindex="0"><div class="cab-sec"><h2 class="titulo-sec">SUNAT, en una resta</h2>${ico("der", "abre")}</div>
      <div class="c-resta"><div><span>IGV que cobraste en ${s.nombrePeriodo}</span><b class="num">${S(s.igvVentas)}</b></div><div><span>− IGV que pagaste al comprar</span><b class="num">${S(s.igvCompras)}</b></div><div class="res"><span>= IGV para SUNAT</span><b class="num">${S(s.pagar.igv)}</b></div></div>
      <p class="bajada" style="margin-top:10px">Con la renta y el EsSalud, pagas <b class="num" style="color:var(--tinta)">${S(s.pagar.total)}</b>${m.mes.enCurso ? " el miércoles 18" : ""}.</p></section>`;
  }
  function ropaMini(m) {
    const inv = m.inventario;
    return `<section class="vidrio pad entra tocable" data-hoja="inventario" role="button" tabindex="0"><div class="cab-sec"><h2 class="titulo-sec">La ropa que tienes</h2>${ico("der", "abre")}</div>
      ${cifra(inv.total, { tam: "34px" })}<p class="bajada" style="margin-top:6px">A lo que te costó. Te alcanza para ${inv.cobertura.toFixed(1).replace(".", ",")} meses de venta.</p>
      <div style="margin-top:12px">${Z.apilada([{ nombre: "Se mueve", v: inv.total - inv.quieta, c: "var(--tinta)" }, { nombre: "Quieta +90 días", v: inv.quieta, c: "var(--naranja)" }])}</div>
      <div class="leyenda" style="margin-top:8px"><span><i class="muestra" style="--c:var(--tinta)"></i>Se mueve</span><span><i class="muestra" style="--c:var(--naranja)"></i>Quieta hace +90 días: <b>${S(inv.quieta)}</b></span></div></section>`;
  }

  function render(m) {
    return `${relato(m)}
      <div class="c-fila1"><div>${rio(m)}</div><div>${cuadricula(m)}</div></div>
      <div class="c-fila2"><div>${boleta(m)}</div><div>${puente(m)}</div></div>
      ${hilo(m)}
      <div class="c-fila3">${sunatMini(m)}${ropaMini(m)}${m.avisos.length ? `<section class="vidrio pad entra"><div class="cab-sec"><h2 class="titulo-sec">Hoy te toca<span class="globo">${m.avisos.length}</span></h2></div><div class="avisos">${m.avisos.map((a) => `<button class="aviso-fila ${a.tono}" data-hoja="${a.hoja}"><span class="punto-tono"></span><span class="aviso-txt"><b>${a.titulo}</b><small>${a.texto}</small></span>${ico("der", "abre")}</button>`).join("")}</div></section>` : ""}</div>`;
  }
  function montar(raiz, m) {
    const r = raiz.querySelector("[data-rio]");
    if (r) { dibujarRio(r, m); window.addEventListener("resize", () => r.isConnected && dibujarRio(r, m)); }
    /* la leyenda enciende sus cuadritos */
    raiz.querySelectorAll("[data-p-ley]").forEach((b) => {
      const on = (v) => { raiz.querySelector(".c-grilla").classList.toggle("marcando", v); raiz.querySelectorAll(`.c-grilla i[data-p="${b.dataset.pLey}"]`).forEach((i) => i.classList.toggle("on", v)); };
      b.addEventListener("pointerenter", () => on(true)); b.addEventListener("pointerleave", () => on(false));
      b.addEventListener("focus", () => on(true)); b.addEventListener("blur", () => on(false));
    });
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-vista],[data-tramo]");
    if (!t) return;
    if (t.dataset.vista) vista = t.dataset.vista;
    if (t.dataset.tramo) tramo = t.dataset.tramo;
    window.APP.pintar({ suave: true });
  });

  window.CAMINOS = window.CAMINOS || {};
  window.CAMINOS.c = { frase, render, montar };
})();
