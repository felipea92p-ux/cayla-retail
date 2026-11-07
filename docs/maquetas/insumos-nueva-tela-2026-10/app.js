/* Maqueta «Insumos · Nueva tela y Llegó tela» (ADR-0554, 2026-10-28). DATOS DE EJEMPLO; nada se guarda. Sin dependencias. */
"use strict";
const root = document.getElementById("app");
const $ = (s, r = document) => r.querySelector(s);
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const num = (s) => { const n = parseFloat(String(s).replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const fmt = (n, d = 1) => n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: d });
const soles = (n) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- datos de ejemplo ---------- */
const FAMILIAS = ["Neutros", "Tierras", "Amarillos", "Rojos y rosas", "Morados", "Azules", "Verdes"];
const COLORES = [
  { c: "BLA", n: "Blanco", h: "#f4f1ea", f: "Neutros" }, { c: "CRU", n: "Crudo", h: "#e8dfcc", f: "Neutros" }, { c: "GRM", n: "Gris melange", h: "#b5b4b0", f: "Neutros" },
  { c: "GRI", n: "Gris", h: "#8d8d8a", f: "Neutros" }, { c: "NEG", n: "Negro", h: "#1d1d1b", f: "Neutros" },
  { c: "ARN", n: "Arena", h: "#d8c3a5", f: "Tierras" }, { c: "BEI", n: "Beige", h: "#cdb89a", f: "Tierras" }, { c: "CAM", n: "Camel", h: "#b98a53", f: "Tierras" },
  { c: "CHO", n: "Chocolate", h: "#4a3426", f: "Tierras" }, { c: "TER", n: "Terracota", h: "#b5573b", f: "Tierras" },
  { c: "MOS", n: "Mostaza", h: "#c9972b", f: "Amarillos" },
  { c: "ROJ", n: "Rojo", h: "#b8412d", f: "Rojos y rosas" }, { c: "VIN", n: "Vino", h: "#6e1f2e", f: "Rojos y rosas" }, { c: "ROS", n: "Rosa", h: "#d99aa6", f: "Rojos y rosas" },
  { c: "LIL", n: "Lila", h: "#a58bb8", f: "Morados" },
  { c: "MAR", n: "Marino", h: "#1f2a44", f: "Azules" }, { c: "AZU", n: "Azul", h: "#2f5d9a", f: "Azules" }, { c: "PET", n: "Petróleo", h: "#1f5c63", f: "Azules" },
  { c: "VEB", n: "Verde botella", h: "#1f4d3a", f: "Verdes" }, { c: "OLI", n: "Oliva", h: "#6b6b3a", f: "Verdes" },
];
const col = (c) => COLORES.find((x) => x.c === c) || { c, n: c, h: "#999999", f: "" };
const TEJIDOS = ["Algodón pima", "Franela", "Gabardina", "Jersey", "Lino", "Popelina", "Rib", "Satín", "Suplex"]; // a propósito sin «Milano»: se crea al vuelo
const EXISTENTES = [{ nombre: "Milano Melange", cod: "MIL-01", colores: ["ARN"] }];
const UNI = { kilo: "kg", metro: "m", rollo: "rollos" };

/* ---------- estado ---------- */
let vista = "a";
const T = {
  nombre: "Jersey Pima", tejido: "Jersey", tejidoBusca: "", tejidoNuevo: "", comp: "100 % algodón pima", compra: "kilo", ancho: "160", gramaje: "180", mrollo: "80", merma: "5",
  rows: [{ c: "ARN", ya: "48,2", costo: "25", min: "" }, { c: "NEG", ya: "", costo: "25", min: "" }],
  paso: 1, buscar: "", carta: false, llenar: "", creado: false,
};
const L = {
  modo: "kilo", rinde: 3.47, doc: "F001-1234",
  datos: {
    kilo: [{ c: "ARN", rollos: "2", cant: "48,2", m: "", costo: "25" }, { c: "NEG", rollos: "1", cant: "24", m: "82", costo: "25" }, { c: "BLA", rollos: "1", cant: "30", m: "96", costo: "25" }],
    metro: [{ c: "CRU", rollos: "", cant: "120", m: "", costo: "8,50" }, { c: "OLI", rollos: "", cant: "62", m: "", costo: "8,50" }],
    rollo: [{ c: "BLA", rollos: "3", cant: "80", m: "", costo: "6,20" }, { c: "ROS", rollos: "2", cant: "80", m: "", costo: "6,20" }],
  },
};
const LISTA = [
  { nombre: "Milano Melange", cod: "MIL-01", tej: "Milano", comp: "60 % algodón · 40 % poliéster", compra: "Se compra por kilo · rinde ≈ 3,47 m/kg", colores: [{ c: "ARN", saldo: 9, min: 30 }, { c: "NEG", saldo: 0, min: 30 }] },
  { nombre: "Lino lavado", cod: "LIN-01", tej: "Lino", comp: "100 % lino", compra: "Se compra por metro", colores: [{ c: "CRU", saldo: 120, min: 40 }, { c: "NEG", saldo: 14, min: 30 }, { c: "OLI", saldo: 62, min: 30 }] },
  { nombre: "Popelina", cod: "POP-01", tej: "Popelina", comp: "100 % algodón", compra: "Se compra por rollo · ≈ 80 m cada uno", colores: [{ c: "BLA", saldo: 240, min: 80 }] },
];

/* ---------- reglas ---------- */
const prefijo = (n) => (norm(n).replace(/[^a-z ]/g, "").split(" ").filter(Boolean)[0] || "tel").slice(0, 3).toUpperCase();
const codigoTela = () => { const p = prefijo(T.nombre); return `${p}-${String(EXISTENTES.filter((e) => e.cod.startsWith(p + "-")).length + 1).padStart(2, "0")}`; };
const parecida = () => { const n = norm(T.nombre); return n.length < 4 ? null : EXISTENTES.find((e) => norm(e.nombre).includes(n) || n.includes(norm(e.nombre))) || null; };
const rinde = () => { const g = num(T.gramaje), a = num(T.ancho) / 100; return g > 0 && a > 0 ? 1000 / (g * a) : 0; };
const metrosFila = (r) => (T.compra === "kilo" ? num(r.ya) * rinde() : T.compra === "rollo" ? num(r.ya) * num(T.mrollo) : num(r.ya));
const faltan = () => {
  const f = [];
  if (!T.nombre.trim()) f.push("el nombre de la tela");
  if (T.compra === "kilo" && !(num(T.ancho) > 0 && num(T.gramaje) > 0)) f.push("ancho y gramaje (para pasar kilos a metros)");
  if (!T.rows.length) f.push("al menos un color");
  return f;
};
const sugeridos = () => [!T.tejido && "el tejido", !T.comp.trim() && "la composición"].filter(Boolean);

/* ---------- piezas ---------- */
function campoTejido() {
  if (T.tejido)
    return `<div class="chips" style="margin:0;height:44px;align-items:center"><span class="pill">${esc(T.tejido)}<button data-act="quitartejido" aria-label="Quitar el tejido">×</button></span>${T.tejidoNuevo === T.tejido ? '<span class="t60" style="font-size:12.5px">recién creado: ya está en la lista de Catálogo</span>' : ""}</div><div class="pie">&nbsp;</div>`;
  return `<div class="busca"><input data-k="tejidoBusca" value="${esc(T.tejidoBusca)}" placeholder="Busca o escribe: jersey, milano…" autocomplete="off" aria-label="Tejido"><div class="lista" data-d="sugTejido"></div></div><div class="pie">Si no está, lo creas ahí mismo.</div>`;
}
function bloqueQueEs() {
  return `<div class="grid2">
    <div class="campo"><label for="nombre">Nombre de la tela</label><input id="nombre" data-k="nombre" value="${esc(T.nombre)}" placeholder="Ej. Jersey pima" autocomplete="off"><div class="pie">Prueba escribir «Milano Melange»: avisa que ya existe.</div></div>
    <div class="campo"><label>Código <span class="op">· se arma solo</span></label><div class="codigo"><span data-d="codigo"></span><small>nadie lo escribe</small></div><div class="pie">&nbsp;</div></div>
  </div>
  <div data-d="parecida"></div>
  <div class="grid2">
    <div class="campo"><label>Tejido</label>${campoTejido()}</div>
    <div class="campo"><label for="comp">Composición <span class="op">· opcional</span></label><input id="comp" data-k="comp" value="${esc(T.comp)}" placeholder="Ej. 60 % algodón · 40 % poliéster"><div class="pie">Sale en la etiqueta de la prenda.</div></div>
  </div>`;
}
function bloqueCompra() {
  const btn = (v, t) => `<button data-act="compra" data-v="${v}" class="${T.compra === v ? "on" : ""}" aria-pressed="${T.compra === v}">${t}</button>`;
  const extra =
    T.compra === "kilo"
      ? `<div class="grid3" style="margin-top:14px"><div class="campo"><label for="ancho">Ancho (cm)</label><input id="ancho" data-k="ancho" inputmode="decimal" value="${esc(T.ancho)}"></div><div class="campo"><label for="gram">Gramaje (g/m²)</label><input id="gram" data-k="gramaje" inputmode="decimal" value="${esc(T.gramaje)}"></div><div class="campo"><label>Rinde</label><div class="codigo" style="font:500 14px var(--sans)"><span data-d="rinde"></span></div></div></div><div class="nota">El gramaje y el ancho vienen en la ficha del proveedor. Al recibir, pesas y mides: <b>el dato medido manda</b> y se guarda en cada lote.</div>`
      : T.compra === "rollo"
        ? `<div class="grid3" style="margin-top:14px"><div class="campo"><label for="mr">¿Cuántos metros trae un rollo?</label><input id="mr" data-k="mrollo" inputmode="decimal" value="${esc(T.mrollo)}"><div class="pie">Lo habitual; al recibir lo corriges si ese rollo trae otra medida.</div></div></div>`
        : "";
  return `<div class="seg" role="group" aria-label="Cómo se compra">${btn("metro", "Por metro")}${btn("kilo", "Por kilo")}${btn("rollo", "Por rollo")}</div>${extra}
  <div class="grid3" style="margin-top:14px"><div class="campo"><label for="merma">Merma al cortar (%) <span class="op">· opcional</span></label><input id="merma" data-k="merma" inputmode="decimal" value="${esc(T.merma)}" placeholder="0"></div></div>
  <div class="nota" style="margin-top:4px">El stock de la tela va <b>siempre en metros</b>: el kilo y el rollo son cómo la compras, y se convierten al recibirla.</div>`;
}
function carta() {
  return `<div class="carta">${FAMILIAS.map((f) => {
    const cs = COLORES.filter((x) => x.f === f);
    return cs.length ? `<div class="fam"><span>${f}</span><div class="fila">${cs.map((k) => `<button class="m ${T.rows.some((r) => r.c === k.c) ? "on" : ""}" style="background:${k.h}" data-act="elegir" data-c="${k.c}" title="${k.n}" aria-label="${k.n}"></button>`).join("")}</div></div>` : "";
  }).join("")}<div class="pie-c">Pasa el mouse por un círculo para ver su nombre. <i>Es la misma carta de Catálogo ▸ Nuevo producto.</i></div></div>`;
}
function bloqueColores() {
  return `<div class="busca"><input data-k="buscar" value="${esc(T.buscar)}" placeholder="Busca un color: arena, petróleo, coral…" autocomplete="off" aria-label="Buscar un color"><div class="lista" data-d="sugColor"></div></div>
  <div style="margin:8px 0"><button class="btn sutil" data-act="carta">${T.carta ? "Cerrar la carta de colores" : "Ver la carta de colores"}</button></div>${T.carta ? carta() : ""}
  <div class="chips">${T.rows.length ? T.rows.map((r) => `<span class="pill"><i class="sw" style="background:${col(r.c).h}"></i>${col(r.c).n}<button data-act="quitar" data-c="${r.c}" aria-label="Quitar ${col(r.c).n}">×</button></span>`).join("") : '<span class="t60">Todavía ninguno. Búscalo por su nombre o tócalo en la carta.</span>'}</div>`;
}
function tablaColores() {
  if (!T.rows.length) return "";
  const m = T.compra, der = m !== "metro";
  const g = der ? "minmax(120px,1.3fr) 1.3fr 1fr 1fr 1fr 0.8fr 28px" : "minmax(120px,1.3fr) 1.3fr 1fr 1fr 0.8fr 28px";
  const hC = { kilo: "¿Ya tienes? (kg)", rollo: "¿Ya tienes? (rollos)", metro: "¿Ya tienes? (m)" }[m];
  const hP = { kilo: "Costo por kg", rollo: "Costo por rollo", metro: "Costo por m" }[m];
  const filas = T.rows.map((r) => `<div class="fila" style="grid-template-columns:${g}"><span><i class="sw" style="background:${col(r.c).h}"></i> ${col(r.c).n}</span><span class="cod" data-d="cod:${r.c}"></span>
    <input data-f="ya" data-c="${r.c}" inputmode="decimal" value="${esc(r.ya)}" placeholder="0" aria-label="Cuánto hay de ${col(r.c).n}">${der ? `<span class="der" data-d="m:${r.c}"></span>` : ""}
    <input data-f="costo" data-c="${r.c}" inputmode="decimal" value="${esc(r.costo)}" placeholder="0,00" aria-label="Costo de ${col(r.c).n}"><input data-f="min" data-c="${r.c}" inputmode="decimal" value="${esc(r.min)}" placeholder="—" aria-label="Mínimo de ${col(r.c).n}"><button class="x" data-act="quitar" data-c="${r.c}" aria-label="Quitar ${col(r.c).n}">×</button></div>`).join("");
  return `<div class="tbl"><div class="fila cab-t" style="grid-template-columns:${g}"><span>Color</span><span>Código</span><span style="text-align:right">${hC}</span>${der ? '<span style="text-align:right">≈ metros</span>' : ""}<span style="text-align:right">${hP}</span><span style="text-align:right">Mínimo (m)</span><span></span></div>${filas}</div>
  <div class="llenar">Llenar el costo de todas con <input data-k="llenar" inputmode="decimal" value="${esc(T.llenar)}" placeholder="25"> <button class="btn sec" data-act="llenar" style="height:34px">Aplicar</button><span>· «¿Ya tienes?» déjalo vacío si todavía no llegó nada: la tela se crea en cero.</span></div>`;
}
function avisoParecida() {
  const p = parecida();
  return p ? `<div class="aviso"><span>¿Es la misma que <b>«${p.nombre}»</b> (${p.cod})? Ya tiene ${p.colores.length} color. Si es la misma, mejor agrégale los colores que faltan.</span><button class="btn sec" data-act="agregarAesa">Agregar colores a esa</button></div>` : "";
}
function pieHoja() {
  return `<div class="pie-hoja"><span class="guia" data-d="guia"></span><button class="btn sec" data-act="cancelar">Cancelar</button><button class="btn" id="crear" data-act="crear">Crear</button></div>`;
}
function exito() {
  const code = codigoTela();
  return `<div class="hoja"><h2>Listo: «${esc(T.nombre.trim())}» ya está en Insumos</h2><p class="sub">Se crearon ${T.rows.length} ${T.rows.length === 1 ? "color" : "colores"} de una sola vez, todo o nada.</p>
  <div class="tbl">${T.rows.map((r) => `<div class="fila" style="grid-template-columns:1.4fr 1.4fr 1fr"><span><i class="sw" style="background:${col(r.c).h}"></i> ${col(r.c).n}</span><span class="cod">${code}-${r.c}</span><span class="der">${num(r.ya) > 0 ? `lote de saldo inicial · ${fmt(metrosFila(r))} m` : "en cero, esperando su primera llegada"}</span></div>`).join("")}</div>
  <div class="pie-hoja"><button class="btn sec" data-act="otra">Crear otra tela</button><button class="btn" data-act="irLlego">Registrar que llegó tela</button></div></div>`;
}
function fichaPrevia() {
  const f = faltan(), s = sugeridos(), code = codigoTela();
  return `<h4>${esc(T.nombre.trim() || "Tela sin nombre")}</h4><div class="cod2">${code}${T.tejido ? " · " + esc(T.tejido) : ""}${T.comp.trim() ? " · " + esc(T.comp) : ""}</div>
  <ul><li>Se compra por <b>${T.compra}</b>${T.compra === "kilo" && rinde() ? ` · rinde ≈ ${fmt(rinde(), 2)} m/kg` : T.compra === "rollo" ? ` · ≈ ${esc(T.mrollo)} m por rollo` : ""}</li>${num(T.merma) > 0 ? `<li>Merma al cortar: ${esc(T.merma)} %</li>` : ""}<li>Se lleva en <b>metros</b></li></ul>
  <span class="etq">Van a nacer ${T.rows.length} ${T.rows.length === 1 ? "color" : "colores"}</span>
  <ul>${T.rows.map((r) => `<li><i class="sw" style="background:${col(r.c).h}"></i><span class="cod">${code}-${r.c}</span><span class="t60">${col(r.c).n}${num(r.ya) > 0 ? " · " + r.ya + " " + UNI[T.compra] : ""}</span></li>`).join("") || '<li class="t60">Aún no elegiste colores.</li>'}</ul>
  ${f.length ? `<div class="falta"><b>Falta</b>${f.map((x) => "· " + x).join("<br>")}</div>` : '<div class="falta"><b>Todo listo</b>Puedes crear la tela.</div>'}
  ${s.length ? `<div class="sig">Sugerido (no bloquea): ${s.join(" y ")}.</div>` : ""}`;
}

/* ---------- vistas ---------- */
function vistaA() {
  if (T.creado) return `<div class="fondo">${exito()}</div>`;
  return `<div class="fondo"><div class="hoja ancha"><h2>Nueva tela</h2><p class="sub">Una tela, todos sus colores, en un solo paso.</p>
  <div class="sec"><h3><span class="num">1</span>Qué tela es</h3>${bloqueQueEs()}</div>
  <div class="sec"><h3><span class="num">2</span>Cómo la compras</h3>${bloqueCompra()}</div>
  <div class="sec"><h3><span class="num">3</span>Colores</h3>${bloqueColores()}${tablaColores()}</div>${pieHoja()}</div></div>`;
}
function vistaB() {
  if (T.creado) return `<div class="fondo">${exito()}</div>`;
  const p = T.paso, hecho = [!!T.nombre.trim(), T.compra !== "kilo" || (num(T.ancho) > 0 && num(T.gramaje) > 0), T.rows.length > 0];
  const nombres = ["Qué tela es", "Cómo la compras", "Colores"];
  const paso = `<div class="pasos">${nombres.map((n, i) => `<button data-act="paso" data-n="${i + 1}" class="${p === i + 1 ? "on" : ""}"><span class="num ${hecho[i] && p !== i + 1 ? "ok" : ""}">${hecho[i] && p !== i + 1 ? "✓" : i + 1}</span><span>${n}<small>${["Nombre, tejido", "Metro, kilo o rollo", "Elige y anota"][i]}</small></span></button>`).join("")}</div>`;
  const cuerpo = p === 1 ? bloqueQueEs() : p === 2 ? bloqueCompra() : bloqueColores() + tablaColores();
  const nav = `<div class="pie-hoja">${p > 1 ? '<button class="btn sec" data-act="atras">Atrás</button>' : ""}${p < 3 ? '<button class="btn" data-act="siguiente">Siguiente</button>' : '<button class="btn" id="crear" data-act="crear">Crear</button>'}</div>`;
  return `<div class="fondo"><div class="hoja ancha"><h2>Nueva tela</h2><p class="sub">Paso a paso, con la ficha viva a la derecha (como Nuevo producto).</p><div class="dos"><div>${paso}${cuerpo}${nav}</div><aside class="ficha" data-d="ficha" aria-label="Lo que va a nacer"></aside></div></div></div>`;
}
function calc(l) {
  const q = num(l.cant), r = num(l.rollos);
  let m = 0, tot = 0;
  if (L.modo === "kilo") { m = l.m !== "" ? num(l.m) : q * L.rinde; tot = q * num(l.costo); }
  else if (L.modo === "metro") { m = q; tot = q * num(l.costo); }
  else { m = r * q; tot = m * num(l.costo); }
  const real = L.modo === "kilo" && q > 0 && m > 0 ? m / q : 0;
  return { m, tot, medido: L.modo === "kilo" && l.m !== "", dev: real ? real / L.rinde - 1 : 0, real, kg: L.modo === "kilo" ? q : 0 };
}
function vistaLlego() {
  const m = L.modo, lin = L.datos[m];
  const cab = { kilo: ["Color", "Rollos", "Kilos pesados", "Metros que rindió", "Costo por kg"], metro: ["Color", "Rollos (opc.)", "Metros", "", "Costo por m"], rollo: ["Color", "Rollos", "Metros por rollo", "Metros", "Costo por m"] }[m];
  const g = "minmax(130px,1.4fr) 0.8fr 1fr 1.1fr 1fr 28px";
  const btn = (v, t) => `<button data-act="modo" data-v="${v}" class="${m === v ? "on" : ""}" aria-pressed="${m === v}">${t}</button>`;
  const filas = lin.map((l, i) => `<div class="fila" style="grid-template-columns:${g}"><span><i class="sw" style="background:${col(l.c).h}"></i> ${col(l.c).n}</span>
    <input data-lf="rollos" data-i="${i}" inputmode="numeric" value="${esc(l.rollos)}" placeholder="${m === "metro" ? "—" : "0"}" aria-label="Rollos">
    <input data-lf="cant" data-i="${i}" inputmode="decimal" value="${esc(l.cant)}" placeholder="${m === "rollo" ? "80" : "0"}" aria-label="${cab[2]}">
    ${m === "metro" ? '<span class="der">—</span>' : m === "kilo" ? `<input data-lf="m" data-i="${i}" inputmode="decimal" value="${esc(l.m)}" data-ph="${i}" aria-label="Metros que rindió">` : `<span class="der" data-d="lm:${i}"></span>`}
    <input data-lf="costo" data-i="${i}" inputmode="decimal" value="${esc(l.costo)}" placeholder="0,00" aria-label="Costo"><button class="x" data-act="quitarlinea" data-i="${i}" aria-label="Quitar">×</button></div>`).join("");
  return `<div class="fondo"><div class="hoja ancha"><h2>Llegó tela</h2><p class="sub">Una factura, varias líneas. Lo que cambia según cómo se compra la tela:</p>
  <div class="seg" role="group" aria-label="Cómo se compra esta tela (en la app lo dice su ficha)">${btn("kilo", "Tela por kilo")}${btn("metro", "Tela por metro")}${btn("rollo", "Tela por rollo")}</div>
  <div class="grid3" style="margin:16px 0 4px"><div class="campo"><label>Tela</label><div class="codigo" style="font:500 14px var(--sans)">${m === "kilo" ? "Milano Melange · MIL-01" : m === "metro" ? "Lino lavado · LIN-01" : "Popelina · POP-01"}<small>rinde ≈ ${m === "kilo" ? fmt(L.rinde, 2) + " m/kg" : m === "rollo" ? "80 m por rollo" : "—"}</small></div></div>
  <div class="campo"><label for="doc">Documento</label><input id="doc" data-k2="doc" value="${esc(L.doc)}"></div><div class="campo"><label>Fecha</label><input value="28/10/2026" aria-label="Fecha"></div></div>
  <div class="tbl"><div class="fila cab-t" style="grid-template-columns:${g}">${cab.map((h, i) => `<span style="text-align:${i ? "right" : "left"}">${h}</span>`).join("")}<span></span></div>${filas}</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn sec" data-act="mas">+ Otro color de esta tela</button></div>
  <div data-d="avisosLlego"></div><div class="cifras" data-d="totLlego"></div>
  <div class="pie-hoja"><span class="guia">Se abre un lote por línea, con su propio rendimiento. Todo o nada.</span><button class="btn sec" data-act="cancelar">Cancelar</button><button class="btn" data-act="registrar">Registrar la llegada</button></div></div></div>`;
}
function vistaLista() {
  const bajos = LISTA.reduce((s, t) => s + t.colores.filter((c) => c.saldo < c.min).length, 0);
  const tarj = LISTA.map((t) => `<article class="tarj"><div class="cabt"><span><h3>${t.nombre}</h3><small><span class="cod">${t.cod}</span> · ${t.tej} · ${t.comp}</small><small>${t.compra}</small></span><span class="sp"></span>
    <button class="btn sec">Llegó tela</button><button class="btn sec">+ Agregar color</button><button class="btn sutil">Editar tela</button></div>
    <div class="cols">${t.colores.map((c) => { const k = col(c.c), tope = Math.max(c.min * 3, c.saldo, 1), est = c.saldo <= 0 ? "sin" : c.saldo < c.min ? "bajo" : "ok";
      return `<div class="col"><span><i class="sw g" style="background:${k.h}"></i> <b>${k.n}</b><br><span class="cod t60" style="font:12px ui-monospace,Menlo,monospace">${t.cod}-${c.c}</span></span><span style="font:600 22px var(--serif)">${fmt(c.saldo, 0)} <small style="font:12px var(--sans)" class="t60">m</small></span>
      <div><div class="bar ${est === "sin" ? "mal" : est === "bajo" ? "bajo" : ""}"><i style="width:${Math.min(100, (c.saldo / tope) * 100)}%"></i></div><small class="t60">mínimo ${c.min} m</small></div>
      <span><span class="chip ${est === "ok" ? "" : est}">${est === "sin" ? "Sin saldo" : est === "bajo" ? "Bajo mínimo" : "Bien"}</span></span><button class="btn sutil">Ver lotes</button></div>`; }).join("")}</div></article>`).join("");
  return `<div class="cifras"><div><span>Bajo el mínimo</span><b class="nm">${bajos}</b></div><div><span>Telas</span><b class="nm">${LISTA.length}</b></div><div><span>Colores</span><b class="nm">${LISTA.reduce((s, t) => s + t.colores.length, 0)}</b></div></div>
  <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap"><button class="btn">+ Nueva tela</button><button class="btn sec">Llegó tela</button></div>${tarj}`;
}

/* ---------- derivados (se recalculan sin volver a pintar, para no perder el cursor) ---------- */
const DER = {
  codigo: () => codigoTela(),
  rinde: () => (rinde() ? `≈ <b>${fmt(rinde(), 2)} m por kilo</b>` : "Pon ancho y gramaje"),
  parecida: avisoParecida,
  cod: (c) => `${codigoTela()}-${c}`,
  m: (c) => { const r = T.rows.find((x) => x.c === c); return r && num(r.ya) > 0 ? `≈ ${fmt(metrosFila(r))} m` : "—"; },
  ficha: fichaPrevia,
  guia: () => { const f = faltan(); return f.length ? `Falta: ${f.join(", ")}.` : `Todo listo: se crearán ${T.rows.length} ${T.rows.length === 1 ? "color" : "colores"} de «${esc(T.nombre.trim())}».`; },
  sugTejido: () => {
    const q = norm(T.tejidoBusca); if (!q) return "";
    const hay = TEJIDOS.filter((t) => norm(t).includes(q)), exacto = TEJIDOS.some((t) => norm(t) === q);
    return (exacto ? "" : `<button class="crear" data-act="creartejido">+ Crear el tejido «${esc(T.tejidoBusca.trim())}»</button>`) + hay.slice(0, 6).map((t) => `<button data-act="elegirtejido" data-v="${esc(t)}">${esc(t)}</button>`).join("");
  },
  sugColor: () => {
    const q = norm(T.buscar); if (!q) return "";
    const hay = COLORES.filter((k) => !T.rows.some((r) => r.c === k.c) && norm(k.n).includes(q)), exacto = COLORES.some((k) => norm(k.n) === q);
    return (exacto ? "" : `<button class="crear" data-act="crearcolor">+ Crear el color «${esc(T.buscar.trim())}»</button>`) + hay.slice(0, 6).map((k) => `<button data-act="elegir" data-c="${k.c}"><i class="sw" style="background:${k.h}"></i>${k.n}</button>`).join("");
  },
  lm: (i) => fmt(calc(L.datos[L.modo][i]).m),
  avisosLlego: () => L.datos[L.modo].map((l, i) => ({ l, k: calc(l), i })).filter((x) => L.modo === "kilo" && Math.abs(x.k.dev) > 0.05)
    .map((x) => `<div class="aviso"><span><b>${col(x.l.c).n}</b> rinde ${fmt(x.k.real, 2)} m/kg, ${fmt(Math.abs(x.k.dev) * 100)} % ${x.k.dev < 0 ? "menos" : "más"} de lo esperado (${fmt(L.rinde, 2)}). ¿Pesaste con el tubo de cartón? Puedes guardarlo igual: no bloquea.</span></div>`).join(""),
  totLlego: () => {
    const ks = L.datos[L.modo].map(calc), m = ks.reduce((s, k) => s + k.m, 0), tot = ks.reduce((s, k) => s + k.tot, 0), kg = ks.reduce((s, k) => s + k.kg, 0);
    return `${L.modo === "kilo" ? `<div><span>Kilos</span><b class="nm">${fmt(kg)}</b></div>` : ""}<div><span>Metros que entran</span><b class="nm">${fmt(m)}</b></div><div><span>Total de la factura</span><b class="nm">${soles(tot)}</b></div><div><span>Costo por metro</span><b class="nm">${m > 0 ? soles(tot / m) : "—"}</b></div>`;
  },
};
function derivados() {
  document.querySelectorAll("[data-d]").forEach((el) => { const [k, a] = el.dataset.d.split(":"); if (DER[k]) el.innerHTML = DER[k](a); });
  document.querySelectorAll("[data-ph]").forEach((el) => { el.placeholder = fmt(calc(L.datos[L.modo][+el.dataset.ph]).m); });
  const b = $("#crear"); if (b) { const f = faltan(); b.disabled = f.length > 0; b.textContent = `Crear ${T.rows.length || ""} ${T.rows.length === 1 ? "color" : "colores"} de ${T.nombre.trim() || "la tela"}`.replace("Crear  ", "Crear "); }
}

/* ---------- acciones ---------- */
const VISTAS = { a: vistaA, b: vistaB, l: vistaLlego, lista: vistaLista };
function pintar(foco) {
  root.innerHTML = VISTAS[vista]();
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.v === vista));
  derivados();
  if (foco) { const el = $(foco); if (el) { el.focus(); const v = el.value; el.value = ""; el.value = v; } }
}
const ACT = {
  compra: (b) => { T.compra = b.dataset.v; pintar(); },
  carta: () => { T.carta = !T.carta; pintar(); },
  elegir: (b) => { const c = b.dataset.c, i = T.rows.findIndex((r) => r.c === c); if (i >= 0) T.rows.splice(i, 1); else T.rows.push({ c, ya: "", costo: T.rows.length ? T.rows[T.rows.length - 1].costo : "", min: "" }); T.buscar = ""; pintar('[data-k="buscar"]'); },
  quitar: (b) => { T.rows = T.rows.filter((r) => r.c !== b.dataset.c); pintar(); },
  crearcolor: () => { const n = T.buscar.trim(), c = n.slice(0, 3).toUpperCase().padEnd(3, "X"); COLORES.push({ c, n: n[0].toUpperCase() + n.slice(1), h: "#a3796a", f: "Tierras", nuevo: true }); T.rows.push({ c, ya: "", costo: "", min: "" }); T.buscar = ""; pintar(); },
  elegirtejido: (b) => { T.tejido = b.dataset.v; T.tejidoBusca = ""; pintar(); },
  creartejido: () => { const n = T.tejidoBusca.trim(); TEJIDOS.push(n[0].toUpperCase() + n.slice(1)); T.tejido = TEJIDOS[TEJIDOS.length - 1]; T.tejidoNuevo = T.tejido; T.tejidoBusca = ""; pintar(); },
  quitartejido: () => { T.tejido = ""; pintar('[data-k="tejidoBusca"]'); },
  llenar: () => { T.rows.forEach((r) => (r.costo = T.llenar)); pintar(); },
  paso: (b) => { T.paso = +b.dataset.n; pintar(); },
  siguiente: () => { T.paso = Math.min(3, T.paso + 1); pintar(); },
  atras: () => { T.paso = Math.max(1, T.paso - 1); pintar(); },
  crear: () => { T.creado = true; pintar(); },
  otra: () => { Object.assign(T, { nombre: "", tejido: "", comp: "", rows: [], creado: false, paso: 1 }); pintar(); },
  irLlego: () => { vista = "l"; pintar(); },
  agregarAesa: () => { T.nombre = "Milano Melange"; pintar(); },
  cancelar: () => {},
  modo: (b) => { L.modo = b.dataset.v; pintar(); },
  mas: () => { const u = COLORES.find((k) => !L.datos[L.modo].some((l) => l.c === k.c)); const b = L.datos[L.modo][0] || {}; L.datos[L.modo].push({ c: u.c, rollos: "", cant: "", m: "", costo: b.costo || "" }); pintar(); },
  quitarlinea: (b) => { L.datos[L.modo].splice(+b.dataset.i, 1); pintar(); },
  registrar: () => alert("Maqueta: aquí se abrirían " + L.datos[L.modo].length + " lotes, uno por línea, con su rendimiento propio."),
};
root.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b && ACT[b.dataset.act]) ACT[b.dataset.act](b, e); });
root.addEventListener("input", (e) => {
  const t = e.target, d = t.dataset;
  if (d.k) T[d.k] = t.value;
  else if (d.k2) L[d.k2] = t.value;
  else if (d.f) T.rows.find((r) => r.c === d.c)[d.f] = t.value;
  else if (d.lf) L.datos[L.modo][+d.i][d.lf] = t.value;
  derivados();
});
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => { vista = t.dataset.v; pintar(); }));
$("#tema").addEventListener("click", (e) => { const o = document.documentElement.dataset.tema === "oscuro"; document.documentElement.dataset.tema = o ? "" : "oscuro"; e.target.textContent = o ? "Ver en oscuro" : "Ver en claro"; });
pintar();
