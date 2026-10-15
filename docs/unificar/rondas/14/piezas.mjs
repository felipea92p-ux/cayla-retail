// Ronda 14 de /unificar: la línea, las barras por hora, día o mes, la barra que compara a escala y la dona de lo cobrado.
// Las demos usan las clases reales del ERP (`card-cayla`, `barra-avance`, `barra-apilada`, los tokens) y las propuestas, en demo14.css.
// Nada guarda: al pasar el mouse por una línea o una barra sale su cifra.
export const una = (titulo, html, nota) =>
  `<div class="dz"><div class="dz-barra"><span class="dz-et">${titulo}</span><button type="button" class="dz-repetir">↻ Repetir la entrada</button></div><div class="dz-repite">${html}</div>${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;
const tarjeta = (html, et = "") => `<div class="r14-tarjeta">${et ? `<span class="dz-et2">${et}</span>` : ""}${html}</div>`;
const celda = (et, html) => `<div class="r14-hoy-celda"><span class="dz-et2">${et}</span><div class="r14-hoy-cont">${html}</div></div>`;
const soles = (n) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const corto = (n) => (n >= 1000 ? `${(n / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })} mil` : String(Math.round(n)));

// ---------------- Los datos de ejemplo (inventados, del tamaño de una tienda) ----------------
const HORAS = ["9", "10", "11", "12", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const HORAS_LARGAS = ["9 a. m.", "10 a. m.", "11 a. m.", "12 m.", "1 p. m.", "2 p. m.", "3 p. m.", "4 p. m.", "5 p. m.", "6 p. m.", "7 p. m.", "8 p. m.", "9 p. m."];
const acum = (xs) => xs.reduce((a, x) => [...a, (a.at(-1) ?? 0) + x], []);
const AYER_HORA = [0, 60, 140, 210, 90, 70, 160, 240, 190, 280, 230, 150, 60];
const HOY_HORA = [0, 90, 120, 260, 160, 110, 220, 180];
const AYER = acum(AYER_HORA);
const HOY = acum(HOY_HORA);
const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);
const VENTA_DIA = [420, 380, 510, 290, 640, 820, 760, 300, 450, 520, 480, 610, 930, 870, 410];
const MES = acum(VENTA_DIA);
const META_MES = 15500;
const META = DIAS.map((d) => (META_MES / 31) * d);

// ---------------- 1 · LA LÍNEA ----------------
// Una línea con su referencia punteada. `xs` son los puntos en x (0–1); `ys` en la escala de `max`.
function linea({ serie, ref = null, max, etiquetasX, tips, cifra, conArea = true, conEjes = true, conGuia = true, ancho = 640, alto = 200, estilo = "p1" }) {
  const izq = conEjes ? 44 : 6, der = 64, arr = 14, aba = conEjes ? 26 : 8;
  const W = ancho - izq - der, H = alto - arr - aba;
  const nTotal = (ref ?? serie).length;
  const x = (i) => izq + (W * i) / (nTotal - 1);
  const y = (v) => arr + H - (H * v) / max;
  const camino = (vs) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${camino(serie)} L${x(serie.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ejeY = conEjes
    ? [0, max / 2, max].map((v) => `<line x1="${izq}" x2="${izq + W}" y1="${y(v)}" y2="${y(v)}" class="r14-rejilla"/><text x="${izq - 8}" y="${y(v) + 4}" text-anchor="end" class="r14-eje">${corto(v)}</text>`).join("")
    : "";
  const ejeX = conEjes
    ? etiquetasX.map(([i, t]) => `<text x="${x(i)}" y="${alto - 6}" text-anchor="middle" class="r14-eje">${t}</text>`).join("")
    : "";
  const ultimo = serie.length - 1;
  const fin = `<circle cx="${x(ultimo)}" cy="${y(serie[ultimo])}" r="4.5" class="r14-punto-fin"/><text x="${x(ultimo) + 10}" y="${y(serie[ultimo]) + 5}" class="r14-cifra-fin">${cifra}</text>`;
  const datos = conGuia
    ? `data-r14-linea data-xs="${serie.map((_, i) => x(i).toFixed(1)).join(",")}" data-ya="${serie.map((v) => y(v).toFixed(1)).join(",")}" data-yb="${ref ? ref.slice(0, serie.length).map((v) => y(v).toFixed(1)).join(",") : ""}" data-tips="${tips.join("|")}" data-alto="${arr + H}" data-arr="${arr}"`
    : "";
  return `<div class="r14-linea" data-estilo="${estilo}" ${datos}><svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Gráfico de ejemplo">
    ${ejeY}${ejeX}
    ${conArea ? `<path d="${area}" class="r14-area"/>` : ""}
    ${ref ? `<path d="${camino(ref)}" class="r14-ref"/>` : ""}
    <path d="${camino(serie)}" class="r14-trazo" pathLength="1"/>
    ${fin}
    ${conGuia ? `<line class="r14-guia" x1="0" x2="0" y1="${arr}" y2="${arr + H}" hidden/><circle class="r14-gpa" r="4" hidden/><circle class="r14-gpb" r="3.5" hidden/>` : ""}
  </svg>${conGuia ? `<div class="r14-globo" hidden></div>` : ""}</div>`;
}
const leyenda = (items) => `<ul class="r14-leyenda">${items.map(([cls, t]) => `<li><i class="${cls}"></i>${t}</li>`).join("")}</ul>`;
const tipsCaja = HOY.map((v, i) => `${HORAS_LARGAS[i]} · hoy ${soles(v)} · ayer ${soles(AYER[i])}`);
const tipsMes = MES.map((v, i) => `Día ${i + 1} · vendido ${soles(v)} · meta ${soles(META[i])}`);
const MINI = [[3, 5, 4, 7, 6, 9, 8, 11, 10, 12, 14, 13], [9, 8, 9, 7, 6, 6, 5, 6, 4, 5, 3, 4], [0, 0, 0, 0, 0, 0, 0, 0, 2, 6, 9, 12]];
const mini = (s, cls = "r14-mini") => {
  const max = Math.max(...s);
  const d = s.map((v, i) => `${i ? "L" : "M"}${((46 * i) / (s.length - 1)).toFixed(1)},${(16 - (14 * v) / max + 1).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 46 18" width="46" height="18" class="${cls}" aria-hidden="true"><path d="${d}" pathLength="1"/></svg>`;
};
const filasMini = (cls) =>
  `<div class="r14-tabla">${[["Confecciones del Sur", "S/ 12,840", MINI[0]], ["Textil Andina", "S/ 6,210", MINI[1]], ["Hilos del Norte", "S/ 3,480", MINI[2]]].map(([n, m, s]) => `<div class="r14-tfila"><span>${n}</span>${mini(s, cls)}<b>${m}</b></div>`).join("")}</div>`;

const lineaP1 = (conArea, conEjes, conGuia, estilo) =>
  `<div class="r14-grid2">
    ${tarjeta(`<p class="r14-tit">Hoy contra ayer</p>${leyenda([["r14-ley-trazo", "Hoy"], ["r14-ley-ref", "Ayer, el día completo"]])}${linea({ serie: HOY, ref: AYER, max: 2000, etiquetasX: [[0, "9 a. m."], [3, "12 m."], [6, "3 p. m."], [9, "6 p. m."], [12, "9 p. m."]], tips: tipsCaja, cifra: soles(HOY.at(-1)), conArea, conEjes, conGuia, estilo })}`, "Caja: lo vendido hoy contra el día completo de ayer")}
    ${tarjeta(`<p class="r14-tit">Ventas contra la meta del mes</p>${leyenda([["r14-ley-trazo", "Vendido"], ["r14-ley-ref", "La meta, día a día"]])}${linea({ serie: MES, ref: META, max: 16000, etiquetasX: [[0, "1"], [7, "8"], [14, "15"], [21, "22"], [30, "31"]], tips: tipsMes, cifra: soles(MES.at(-1)), conArea, conEjes, conGuia, estilo })}`, "Rendimiento y el plan de campaña: lo acumulado contra la meta o el plan")}
  </div>`;
export const lineaDemos = {
  P1: () => lineaP1(true, true, true, "p1") + `<div class="h-4"></div>` + tarjeta(filasMini("r14-mini"), "En una fila de una lista: la mini, sin ejes (Proveedores, lo facturado en 12 meses)"),
  P2: () => lineaP1(false, false, false, "p2") + `<div class="h-4"></div>` + tarjeta(filasMini("r14-mini"), "En una fila: la misma mini"),
  A: () => {
    const v = (cfg) => linea({ ...cfg, conGuia: false, ancho: 420, alto: 150 });
    return `<div class="r14-hoy">${[
      ["Caja: hoy 3,2 px en tinta, ayer punteado 6 5, la brecha sombreada; se revela en 1,1 s; ejes y su globito", v({ serie: HOY, ref: AYER, max: 2000, etiquetasX: [[0, "9"], [6, "3"], [12, "9"]], tips: [], cifra: "", estilo: "a-caja" })],
      ["Rendimiento: 2 px con área al 7 %, la meta punteada 5 4; quieta; «Ver como tabla»", v({ serie: MES, ref: META, max: 16000, etiquetasX: [[0, "1"], [14, "15"], [30, "31"]], tips: [], cifra: "", estilo: "a-rend" })],
      ["El plan de campaña: rojo 3 px, el plan en rojo 40 % punteado, «si sigue así» en pizarra; quieta", v({ serie: MES, ref: META, max: 16000, etiquetasX: [[0, "1"], [30, "31"]], tips: [], cifra: "", conEjes: false, conArea: false, estilo: "a-plan" })],
      ["La ficha de un proveedor: 2,5 px verde o ámbar, cada compra con su punto, una guía roja que salta", v({ serie: [38, 36, 39, 35, 34, 33], max: 45, etiquetasX: [[0, "may"], [5, "oct"]], tips: [], cifra: "", conEjes: false, conArea: false, estilo: "a-prov" })],
    ]
      .map(([et, h]) => celda(et, h))
      .join("")}</div>`;
  },
};

// ---------------- 2 · LAS BARRAS POR HORA, DÍA O MES ----------------
// `vs` los valores; `destacada` el índice que se pinta en tinta (la hora de ahora, el mes en curso, el mejor día); `metas` una raya por barra.
function barras({ vs, etiquetas, destacada = -1, metas = null, tonos = null, cifras = "destacada", tips, alto = 150, estilo = "p1", cada = 1 }) {
  const max = Math.max(...vs, ...(metas ?? [0]));
  const col = vs
    .map((v, i) => {
      const tono = tonos?.[i] ?? (i === destacada ? "tinta" : "");
      const cifra = cifras === "todas" || (cifras === "destacada" && i === destacada) ? `<span class="r14-b-v">${corto(v)}</span>` : "";
      const meta = metas ? `<span class="r14-b-m" style="--m:${metas[i] / max}"></span>` : "";
      return `<div class="r14-b" ${tono ? `data-tono="${tono}"` : ""} data-tip="${tips[i]}" style="--h:${v / max};--i:${i}">${cifra}<i></i>${meta}</div>`;
    })
    .join("");
  const ejes = etiquetas.map((e, i) => `<span ${i === destacada ? 'class="r14-bx-d"' : ""}>${i % cada === 0 || i === destacada ? e : ""}</span>`).join("");
  return `<div class="r14-barras-caja" data-estilo="${estilo}" data-r14-barras><div class="r14-barras" style="--alto:${alto}px">${col}</div><div class="r14-bx">${ejes}</div><div class="r14-globo" hidden></div></div>`;
}
const VENTA_HORA = [80, 120, 260, 210, 150, 90, 230, 310, 270, 340, 220, 140, 60];
const MESES = ["N", "D", "E", "F", "M", "A", "M", "J", "J", "A", "S", "O"];
const FACTURADO = [0, 0, 1200, 900, 0, 1500, 2100, 800, 0, 4200, 5600, 3100];
const SEMANAS = ["Vencido", "15–21 oct", "22–28 oct", "29 oct–4 nov", "5–11 nov", "Después"];
const PAGOS = [5133, 0, 37453, 1200, 860, 0];
const barrasEscena = (estilo) =>
  `<div class="r14-grid3">
    ${tarjeta(`<p class="r14-tit">Ventas por hora (hoy)</p>${barras({ vs: VENTA_HORA, etiquetas: HORAS, destacada: 9, tips: VENTA_HORA.map((v, i) => `${HORAS_LARGAS[i]} · ${soles(v)}`), estilo, cada: 3 })}<p class="r14-pie">La mejor hora: 6 p. m., ${soles(340)}.</p>`, "Por hora: Rendimiento, el cierre de una caja, Comercial")}
    ${tarjeta(`<p class="r14-tit">Ventas por día, con la meta de cada día</p>${barras({ vs: VENTA_DIA, etiquetas: VENTA_DIA.map((_, i) => String(i + 1)), destacada: 14, metas: VENTA_DIA.map(() => 500), tips: VENTA_DIA.map((v, i) => `Día ${i + 1} · ${soles(v)} · meta ${soles(500)}`), estilo, cada: 7 })}<p class="r14-pie">La rayita: la meta de cada día.</p>`, "Por día: Rendimiento, el historial de una campaña")}
    ${tarjeta(`<p class="r14-tit">Lo facturado por mes</p>${barras({ vs: FACTURADO, etiquetas: MESES, destacada: 11, tips: FACTURADO.map((v, i) => `${MESES[i]} · ${soles(v)}`), estilo, alto: 90 })}`, "Por mes: la vista rápida de un proveedor")}
  </div><div class="h-4"></div>
  ${tarjeta(`<p class="r14-tit">Salidas de caja · próximos 30 días</p>${barras({ vs: PAGOS, etiquetas: SEMANAS, tonos: ["rojo", "", "", "", "", ""], cifras: "todas", tips: PAGOS.map((v, i) => `${SEMANAS[i]} · ${soles(v)}`), estilo, alto: 120 })}<p class="r14-pie">Con la cifra de cada barra: cuando se lee el monto de cada semana. El rojo lo pone la pantalla (lo vencido).</p>`, "Con la cifra en cada barra: Por pagar, los pagos que vencen")}`;
export const barrasDemos = {
  P1: () => barrasEscena("p1"),
  P2: () => barrasEscena("p2"),
  A: () => {
    const vh = (estilo, nota) => barras({ vs: VENTA_HORA, etiquetas: HORAS, destacada: 9, tips: VENTA_HORA.map((v) => soles(v)), estilo, cada: 4, alto: 90, cifras: nota });
    return `<div class="r14-hoy">${[
      ["Rendimiento, por hora: la mejor en taupe, las demás en arena, quietas", vh("a-rend", "ninguna")],
      ["El cierre de una caja, por hora: el pico en tinta con su monto, las demás en taupe al 35 %", vh("a-cierre", "destacada")],
      ["Comercial, por hora: tinta al 30 %, la hora de ahora en rojo", vh("a-comercial", "ninguna")],
      ["Por pagar: 58 px de ancho, el monto sobre cada una; crecen y se ensanchan al pasar el mouse", barras({ vs: PAGOS, etiquetas: SEMANAS.map((s) => s.split(" ")[0]), tonos: ["rojo", "ambar", "", "", "", ""], cifras: "todas", tips: PAGOS.map((v) => soles(v)), estilo: "a-pagar", alto: 90 })],
      ["La vista rápida de un proveedor: el mes en curso en tinta, los demás al 15 %", barras({ vs: FACTURADO, etiquetas: MESES, destacada: 11, tips: FACTURADO.map((v) => soles(v)), estilo: "a-prov", alto: 74, cifras: "ninguna" })],
      ["Historial: «hilos» finos con la curva de la tendencia y el nudo del mejor día", barras({ vs: VENTA_DIA, etiquetas: VENTA_DIA.map((_, i) => String(i + 1)), destacada: 12, tips: VENTA_DIA.map((v) => soles(v)), estilo: "p2", alto: 90, cada: 14, cifras: "ninguna" })],
    ]
      .map(([et, h]) => celda(et, h))
      .join("")}</div>`;
  },
};

// ---------------- 3 · LA BARRA QUE COMPARA A ESCALA ----------------
const filaEscala = (nombre, v, max, cifra, estilo, i) => {
  const p = (v / max) * 100;
  const barra =
    estilo === "p1"
      ? `<span data-alto="normal" data-tono="tinta" class="barra-avance" style="--p:${p}%;--i:${i}" aria-hidden="true"><span class="barra-avance-lleno"></span></span>`
      : `<span class="r14-esc-p2 ${i === 0 ? "r14-esc-mayor" : ""}" style="--p:${p}%;--i:${i}"><i></i></span>`;
  return `<div class="r14-esc-fila" data-estilo="${estilo}"><span class="r14-esc-n">${nombre}</span>${barra}<b class="r14-esc-v">${cifra}</b></div>`;
};
const escalaEscena = (estilo) => {
  const prov = [["Confecciones del Sur", 37453], ["Textiles Andina", 5133], ["Hilos del Norte", 2840], ["Botones Lima", 960]];
  const tallas = [["S", 18], ["M", 31], ["L", 24], ["XL", 9]];
  const tiendas = [["Tienda Lima", 142], ["Tienda Arequipa", 98], ["Tienda Trujillo", 61]];
  const bloque = (filas, cifra) => {
    const max = Math.max(...filas.map((f) => f[1]));
    return filas.map(([n, v], i) => filaEscala(n, v, max, cifra(v), estilo, i)).join("");
  };
  return `<div class="r14-grid3">
    ${tarjeta(`<p class="r14-tit">A quién le debemos</p>${bloque(prov, soles)}`, "Proveedores: la deuda de cada uno, a escala de la mayor")}
    ${tarjeta(`<p class="r14-tit">Unidades por talla</p>${bloque(tallas.slice().sort((a, b) => b[1] - a[1]), (v) => `${v} u.`)}`, "La ficha del Taller: las unidades de cada talla")}
    ${tarjeta(`<p class="r14-tit">Prendas por tienda</p>${bloque(tiendas, (v) => `${v} u.`)}`, "El plan de compra: por tienda, por prenda, por color")}
  </div>`;
};
export const escalaDemos = {
  P1: () => escalaEscena("p1"),
  P2: () => escalaEscena("p2"),
  A: () =>
    `<div class="r14-hoy">${[
      ["Proveedores: 3 px bajo el saldo, lo vencido en rojo y el resto en tinta al 45 %", `<div class="r14-hoy-esc"><span style="height:3px;width:88px;background:var(--color-sand)"><i style="width:30%;background:var(--color-rojo)"></i><i style="left:30%;width:45%;background:color-mix(in srgb,var(--color-tinta) 45%,transparent)"></i></span></div>`],
      ["La ficha del Taller: 8 px, verde, ámbar si es poco, tinta 15 % en cero", `<div class="r14-hoy-esc"><span style="height:8px;width:160px;background:color-mix(in srgb,var(--color-tinta) 15%,transparent)"><i style="width:70%;background:var(--color-verde)"></i></span></div>`],
      ["El plan de compra: 8 px en tinta al 60 %, la primera en rojo, sobre arena", `<div class="r14-hoy-esc"><span style="height:8px;width:160px;background:var(--color-sand)"><i style="width:80%;background:var(--color-rojo)"></i></span><span style="height:8px;width:160px;background:var(--color-sand)"><i style="width:45%;background:color-mix(in srgb,var(--color-tinta) 60%,transparent)"></i></span></div>`],
      ["El plan del piso: 6 px en tinta al 60 % sobre tinta al 12 % (ADR-0352)", `<div class="r14-hoy-esc"><span style="height:6px;width:160px;background:color-mix(in srgb,var(--color-tinta) 12%,transparent)"><i style="width:55%;background:color-mix(in srgb,var(--color-tinta) 60%,transparent)"></i></span></div>`],
    ]
      .map(([et, h]) => celda(et, h))
      .join("")}</div>`,
};

// ---------------- 4 · LA DONA DE LO COBRADO ----------------
const MEDIOS = [["Efectivo", "var(--color-metodo-efectivo)", 944.3], ["Yape", "var(--color-metodo-yape)", 264.5], ["Tarjeta", "var(--color-metodo-tarjeta)", 129.9]];
const TOTAL = MEDIOS.reduce((a, m) => a + m[2], 0);
const dos = (n) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const listaMedios = `<ul class="r14-medios">${MEDIOS.map(([n, c, v]) => `<li><i style="background:${c}"></i><span>${n}</span><span class="r14-pc">${Math.round((v / TOTAL) * 100)} %</span><b>S/ ${dos(v)}</b></li>`).join("")}</ul>`;
export const donaDemos = {
  P1: () =>
    tarjeta(
      `<div class="r14-dona-cab"><span class="r14-tit">Lo cobrado en el turno</span><b class="r14-serif">S/ ${dos(TOTAL)}</b></div><span class="barra-apilada" data-alto="12" role="img" aria-label="Lo cobrado por medio">${MEDIOS.map(([, c, v], i) => `<span class="barra-tramo anim-crece-x" style="flex-grow:${(v / TOTAL) * 100};--i:${i}"><i class="barra-tramo-color" style="background:${c}"></i></span>`).join("")}</span>${listaMedios}`,
      "El cierre de una caja: la barra apilada del sistema (la de «Cómo se pagó» del Historial) con su leyenda",
    ),
  A: () => {
    let a = 0;
    const r = 56, C = 2 * Math.PI * r;
    const arcos = MEDIOS.map(([, c, v]) => {
      const l = (v / TOTAL) * C - 3;
      const s = `<circle cx="75" cy="75" r="${r}" fill="none" stroke="${c}" stroke-width="16" stroke-dasharray="${l.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-a).toFixed(1)}" transform="rotate(-90 75 75)"/>`;
      a += (v / TOTAL) * C;
      return s;
    }).join("");
    return tarjeta(
      `<div class="r14-dona"><svg viewBox="0 0 150 150" width="150" height="150" aria-hidden="true"><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--color-sand)" stroke-width="16"/>${arcos}<text x="75" y="80" text-anchor="middle" class="r14-dona-t">S/ ${Math.round(TOTAL).toLocaleString("es-PE")}</text></svg>${listaMedios}</div>`,
      "Hoy: la dona de 150 px, con separaciones de 3 px y el total al centro (la única dona del ERP)",
    );
  },
};
