// Ronda 13 de /unificar: la barra de avance, el anillo, copiar y el menú «Más».
// Las demos usan las clases reales del ERP (`btn-cayla`, `card-cayla`, `label-cayla`, los tokens) y las propuestas, en demo13.css.
// Nada guarda: los «−/+» mueven la demo, «Copiar» copia un texto de ejemplo y el menú no hace nada al elegir.
const svg = (d, cls = "", w = 16) => `<svg viewBox="0 0 24 24" class="${cls}" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  copy: `<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>`,
  check: `<path d="M20 6 9 17l-5-5"/>`,
  link: `<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>`,
  down: `<path d="m6 9 6 6 6-6"/>`,
  more: `<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>`,
  plus: `<path d="M5 12h14"/><path d="M12 5v14"/>`,
  printer: `<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>`,
};
const ic = (n, cls = "", w) => svg(I[n], `lucide lucide-${n} ${cls}`, w);
export const una = (titulo, html, nota) =>
  `<div class="dz"><div class="dz-barra"><span class="dz-et">${titulo}</span><button type="button" class="dz-repetir">↻ Repetir la entrada</button></div><div class="dz-repite">${html}</div>${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;
const btn = (peso, texto, { clase = "", extra = "", icono = "" } = {}) =>
  `<button type="button" class="btn-cayla btn-${peso} ${clase}" ${extra}><span class="relative flex items-center gap-2">${icono}${texto}</span></button>`;
const celda = (et, html) => `<div class="r13-hoy-celda"><span class="dz-et2">${et}</span><div class="r13-hoy-cont">${html}</div></div>`;
const tarjeta = (html, et = "") => `<div class="r13-tarjeta">${et ? `<span class="dz-et2">${et}</span>` : ""}${html}</div>`;
const soles = (n) => `S/ ${n.toLocaleString("es-PE")}`;

// ================= 1 · LA BARRA DE AVANCE =================
// P1: `<BarraAvance valor total alto tono marca>`. Pista arena, se llena de tinta y pasa a verde al completarse; tres altos con
// nombre (fina 3 · normal 6 · gruesa 12); se llena una vez al verse y, si la cifra cambia, se desliza.
// P2: la misma barra, quieta y siempre en tinta, de un solo alto (6).
const barra = ({ p, alto = "normal", tono = "", marca = null, quieta = false, etiqueta = "Avance" }) => {
  const pc = Math.max(0, Math.min(1, p));
  const completo = p >= 1 && !tono;
  return `<div class="r13-av" data-alto="${alto}" ${tono ? `data-tono="${tono}"` : ""} ${completo ? "data-completo" : ""} ${quieta ? "data-quieta" : ""} role="progressbar" aria-label="${etiqueta}" aria-valuenow="${Math.round(pc * 100)}" aria-valuemin="0" aria-valuemax="100" style="--p:${pc}">
    <span class="r13-av-lleno"></span>${marca != null ? `<span class="r13-av-marca" style="--m:${marca}" title="A esta hora tocaba"></span>` : ""}</div>`;
};
// Una barra con su cifra y su «−/+» para ver cómo se mueve (la demo cambia `--p`; la pieza la anima o no).
const conPasos = ({ titulo, cifra, de, valor, total, alto = "normal", quieta = false, marca = null }) =>
  `<div class="r13-av-bloque" data-r13-avance data-total="${total}" data-valor="${valor}" data-de="${de}" ${quieta ? "data-quieta" : ""}>
    <div class="r13-av-cab"><span class="r13-av-tit">${titulo}</span><span class="r13-av-cifra"><b data-r13-cifra>${cifra(valor)}</b> <span class="r13-av-de">${de}</span></span></div>
    ${barra({ p: valor / total, alto, marca, quieta, etiqueta: titulo })}
    <div class="r13-pasos"><button type="button" class="r13-paso" data-r13-menos aria-label="Uno menos">−</button><button type="button" class="r13-paso" data-r13-mas aria-label="Uno más">+</button><span class="r13-pasos-et">mueve la cifra</span></div>
  </div>`;
const filaPago = (nombre, monto, p, quieta, alto = "fina") =>
  `<div class="r13-tfila"><span class="r13-tnom">${nombre}</span><span class="r13-tmonto">${monto}</span><span class="r13-tbarra">${barra({ p, alto, quieta, etiqueta: `Pagado de ${nombre}` })}<span class="r13-tpc">${Math.round(p * 100)} %</span></span></div>`;
const avanceEscena = (quieta) => {
  const alto = (a) => (quieta ? "normal" : a);
  return `<div class="r13-grid2">
    ${tarjeta(`<div class="r13-cab-meta"><span class="label-cayla text-[11px] text-taupe-profundo">Lo que llevas hoy</span><span class="r13-meta-cifra">${soles(840)} <span class="r13-av-de">de ${soles(1200)}</span></span></div>${barra({ p: 0.7, alto: alto("gruesa"), marca: 0.62, quieta, etiqueta: "Lo que llevas hoy contra la meta" })}<p class="r13-pie">La rayita: a esta hora tocaba ${soles(744)}.</p>`, quieta ? "Caja: la meta de hoy" : "Caja: la meta de hoy · gruesa, con la rayita de «a esta hora tocaba»")}
    ${tarjeta(conPasos({ titulo: "Contaste", cifra: (v) => v, de: "de 24 que dijeron", valor: 18, total: 24, alto: "normal", quieta }), quieta ? "Recibir: lo contado" : "Recibir: lo contado · normal. Llévala a 24: pasa a verde")}
    ${tarjeta(`<div class="r13-tabla">${filaPago("Confecciones del Sur", soles(1524), 0.6, quieta, alto("fina"))}${filaPago("Textil Andina", soles(880), 1, quieta, alto("fina"))}${filaPago("Hilos del Norte", soles(312), 0.25, quieta, alto("fina"))}</div>`, quieta ? "Por pagar: lo pagado de cada factura" : "Por pagar: dentro de una fila · fina")}
    ${tarjeta(`<div class="r13-av-cab"><span class="r13-av-tit">Adelanto</span><span class="r13-av-cifra"><b>${soles(50)}</b> <span class="r13-av-de">de ${soles(120)}</span></span></div>${barra({ p: 50 / 120, alto: alto("normal"), quieta, etiqueta: "Adelanto del apartado" })}<div class="h-4"></div><div class="r13-av-cab"><span class="r13-av-tit">Pagar juntos</span><span class="r13-av-cifra r13-rojo"><b>${soles(2140)}</b> <span class="r13-av-de">te pasas por ${soles(140)}</span></span></div>${barra({ p: 1, alto: alto("normal"), tono: "rojo", quieta, etiqueta: "Lo que cubre el pago" })}`, quieta ? "Apartados y Pagar juntos" : "Apartados y Pagar juntos · el rojo lo pone la pantalla cuando algo está mal")}
  </div>`;
};
export const avanceDemos = {
  P1: () => avanceEscena(false),
  P2: () => avanceEscena(true),
  A: () =>
    `<div class="r13-hoy">` +
    [
      ["Rendimiento, Mi meta: 6 px tinta con marca, quieta (4)", `<div class="r13-hoy-av" style="height:6px;background:var(--color-sand)"><span style="width:62%;background:var(--color-tinta)"></span><i style="left:55%;height:12px;width:2px;background:var(--color-taupe)"></i></div>`],
      ["Inicio del líder, Vender: 6 px verde sobre tinta 10 %, quieta (3)", `<div class="r13-hoy-av" style="height:6px;background:color-mix(in srgb,var(--color-tinta) 10%,transparent)"><span style="width:58%;background:var(--color-verde)"></span></div>`],
      ["Una factura: 6 px que se llena de verde, ámbar o rojo (5)", `<div class="r13-hoy-av r13-hoy-llena" style="height:6px;background:var(--color-sand)"><span style="width:70%;background:var(--color-ambar)"></span></div>`],
      ["Por pagar y Notas de crédito: 3 px × 88 px (6)", `<div class="r13-hoy-av" style="height:3px;width:88px;background:var(--color-sand)"><span style="width:45%;background:var(--color-verde)"></span></div>`],
      ["Pagar juntos, saldo a favor: 4–5 px (4)", `<div class="r13-hoy-av" style="height:5px;background:var(--color-sand)"><span style="width:80%;background:var(--color-tinta)"></span></div>`],
      ["Insumos: 8 px con la marca del mínimo (2)", `<div class="r13-hoy-av" style="height:8px;background:var(--color-sand)"><span style="width:34%;background:var(--color-rojo)"></span><i style="left:40%;height:14px;width:2px;background:var(--color-tinta)"></i></div>`],
      ["Recibir contando: 10 px, máx. 520 (1)", `<div class="r13-hoy-av" style="height:10px;background:var(--color-sand)"><span style="width:75%;background:var(--color-taupe)"></span></div>`],
      ["Caja abierta: 12 px tinta, se llena en 1 s (1)", `<div class="r13-hoy-av r13-hoy-llena" style="height:12px;background:var(--color-sand)"><span style="width:70%;background:var(--color-tinta)"></span></div>`],
      ["Productos: margen mínimo, 4 × 44 px sobre hueso", `<div class="r13-hoy-av" style="height:4px;width:44px;background:var(--color-hueso)"><span style="width:80%;background:var(--color-verde)"></span></div>`],
      ["Roles: módulos del rol, 6 px sobre hueso", `<div class="r13-hoy-av r13-hoy-llena" style="height:6px;background:var(--color-hueso)"><span style="width:40%;background:var(--color-taupe)"></span></div>`],
    ]
      .map(([et, b]) => celda(et, b))
      .join("") +
    `</div>`,
};

// ================= 2 · EL ANILLO =================
// P1: `<Anillo valor total tamano>` en tres tamaños con nombre (chico 40 · mediano 72 · grande 160): pista hueso, arco de tinta que pasa
// a verde al completarse, puntas redondas, la cifra adentro; se llena una vez al verse y, si la cifra cambia, se desliza.
// P2: el arco siempre verde, quieto (como «Mi meta» del Inicio).
const R = { chico: { px: 40, r: 16, t: 4 }, mediano: { px: 72, r: 30, t: 6 }, grande: { px: 160, r: 66, t: 12 } };
const anillo = ({ p, tamano = "mediano", centro = "", sub = "", quieto = false, verde = false, tono = "" }) => {
  const { px, r, t } = R[tamano];
  const pc = Math.max(0, Math.min(1, p));
  const completo = p >= 1;
  return `<span class="r13-an" data-tamano="${tamano}" ${quieto ? "data-quieto" : ""} ${completo || verde ? "data-completo" : ""} ${tono ? `data-tono="${tono}"` : ""} role="img" aria-label="${Math.round(pc * 100)} %" style="--p:${pc * 100};width:${px}px;height:${px}px">
    <svg viewBox="0 0 ${px} ${px}" width="${px}" height="${px}" aria-hidden="true"><circle class="r13-an-pista" cx="${px / 2}" cy="${px / 2}" r="${r}" stroke-width="${t}" fill="none"/><circle class="r13-an-arco" cx="${px / 2}" cy="${px / 2}" r="${r}" stroke-width="${t}" fill="none" pathLength="100" transform="rotate(-90 ${px / 2} ${px / 2})"/></svg>
    <span class="r13-an-centro">${centro}${sub ? `<small>${sub}</small>` : ""}</span></span>`;
};
const anilloPasos = ({ valor, total, tamano, quieto, verde, centro, sub }) =>
  `<span class="r13-an-bloque" data-r13-anillo data-valor="${valor}" data-total="${total}" data-centro="${centro}">${anillo({ p: valor / total, tamano, quieto, verde, centro: centro === "pct" ? `${Math.round((valor / total) * 100)}%` : `${valor}`, sub })}
    <span class="r13-pasos"><button type="button" class="r13-paso" data-r13-menos aria-label="Uno menos">−</button><button type="button" class="r13-paso" data-r13-mas aria-label="Uno más">+</button></span></span>`;
const anilloEscena = (quieto) => {
  const v = quieto;
  return `<div class="r13-grid3">
    ${tarjeta(`<div class="r13-an-meta">${anillo({ p: 0.7, tamano: "grande", quieto, verde: v, centro: `<b class="r13-an-serif">${soles(840)}</b>`, sub: `de ${soles(1200)}` })}<p class="r13-pie">Tu venta de hoy contra tu meta.</p></div>`, quieto ? "Inicio: mi meta de hoy" : "Grande · 160 px: Inicio «Mi meta», Caja «hoy contra ayer»")}
    ${tarjeta(`<div class="r13-an-fila">${anilloPasos({ valor: 21, total: 28, tamano: "mediano", quieto, verde: v, centro: "pct" })}<div><p class="r13-an-tit">Contado del envío</p><p class="r13-pie">21 de 28 líneas. Llévalo a 28: pasa a verde.</p></div></div>`, quieto ? "Recibir, Cambios y Devoluciones" : "Mediano · 72 px: Recibir, las revisiones de Cambios y Devoluciones")}
    ${tarjeta(`<div class="r13-an-lista">${[["Blusa Emma · M", 3, 6], ["Vestido Lía · S", 6, 6], ["Casaca Río · L", 1, 6]].map(([n, a, b]) => `<div class="r13-an-fila">${anillo({ p: a / b, tamano: "chico", quieto, verde: v, centro: `${a}` })}<span class="r13-an-tit">${n}</span><span class="r13-pie">${a} de ${b} semanas</span></div>`).join("")}</div>`, quieto ? "Existencias y Conteo" : "Chico · 40 px: Existencias (semanas que alcanza, tallas resueltas) y Conteo")}
  </div>`;
};
export const anilloDemos = {
  P1: () => anilloEscena(false),
  P2: () => anilloEscena(true),
  A: () =>
    `<div class="r13-hoy">` +
    [
      ["Caja: 168 px, arco del color del efectivo sobre oscuro, se llena en 1,2 s", `<span class="r13-hoy-oscuro">${anillo({ p: 0.72, tamano: "grande", centro: `<b class="r13-an-serif">${soles(1720)}</b>`, tono: "efectivo" })}</span>`],
      ["Inicio, Mi meta: 150 px, verde sobre tinta 10 %, quieto", anillo({ p: 0.6, tamano: "grande", quieto: true, verde: true, centro: `<b class="r13-an-serif">${soles(540)}</b>` })],
      ["Recibir: 70 px, ámbar sobre arena; verde al 100 %", anillo({ p: 0.64, tamano: "mediano", tono: "ambar", centro: "64%" })],
      ["Cambios y Devoluciones: 68 px, del color del texto", anillo({ p: 0.5, tamano: "mediano", tono: "verde", centro: "2/4" })],
      ["Conteo: 40 px, rojo sobre arena, el % al lado", `<span class="r13-an-fila">${anillo({ p: 0.38, tamano: "chico", tono: "rojo", quieto: true })}<b class="r13-pie">38 %</b></span>`],
      ["Existencias: 32–34 px, verde o ámbar sobre hueso, cifra adentro", anillo({ p: 0.33, tamano: "chico", tono: "ambar", quieto: true, centro: "2" })],
    ]
      .map(([et, b]) => celda(et, b))
      .join("") +
    `</div>`,
};

// ================= 3 · COPIAR =================
// P1: `<BotonCopiar texto que forma>`. Junto a un dato, el ícono solo en 32 px (como el lápiz de la ronda 12) que al tocarlo se vuelve
// un ✓ verde que se dibuja y dice «Copiado»; suelto, el secundario «Copiar …» con su ícono, que pasa a «✓ Copiado» sin cambiar de ancho.
// P2: siempre con la palabra: la píldora «COPIAR» junto a un dato; suelto, el secundario.
const DATOS = [["CCI", "002-193-001234567890-12"], ["Cuenta", "193-1234567-0-12"], ["Yape", "987 654 321"]];
const copiarIcono = (que, valor, icono = "copy") =>
  `<button type="button" class="r13-cp-ic" data-r13-copiar="${valor}" aria-label="Copiar ${que}" title="Copiar ${que}"><span class="r13-cp-a">${ic(icono, "h-4 w-4")}</span><span class="r13-cp-b">${ic("check", "r13-cp-tilde h-4 w-4")}</span></button><span class="r13-cp-dicho" aria-live="polite"></span>`;
const copiarPildora = (que, valor) =>
  `<button type="button" class="r13-cp-pildora label-cayla" data-r13-copiar="${valor}" aria-label="Copiar ${que}"><span class="r13-cp-a">${ic("copy", "h-3 w-3")} Copiar</span><span class="r13-cp-b">${ic("check", "r13-cp-tilde h-3 w-3")} Copiado</span></button>`;
const copiarBoton = (texto, valor, icono = "copy") =>
  `<button type="button" class="btn-cayla btn-secundario r13-cp-btn" data-r13-copiar="${valor}"><span class="relative inline-grid"><span class="r13-cp-a flex items-center gap-2">${ic(icono, "h-4 w-4")}${texto}</span><span class="r13-cp-b flex items-center justify-center gap-2">${ic("check", "r13-cp-tilde h-4 w-4")}Copiado</span></span></button>`;
const datos = (copiar) =>
  `<dl class="r13-datos">${DATOS.map(([e, v]) => `<div class="r13-dato"><dt class="label-cayla">${e}</dt><dd>${v}</dd><dd class="r13-dato-acc">${copiar(e, v)}</dd></div>`).join("")}</dl>`;
const copiarEscena = (pildora) =>
  `<div class="r13-grid2">
    ${tarjeta(`<p class="r13-an-tit">Cuentas de Confecciones del Sur</p>${datos(pildora ? copiarPildora : copiarIcono)}`, pildora ? "Junto a un dato: la píldora con la palabra" : "Junto a un dato: el ícono solo, que se vuelve ✓ y dice «Copiado»")}
    ${tarjeta(`<div class="r13-col"><p class="r13-mensaje">Hola, somos CAYLA Tienda Lima. Les escribimos por la factura F001-2231: llegaron 2 blusas de menos. ¿Nos envían la nota de crédito? Gracias.</p><div class="r13-fila">${copiarBoton("Copiar mensaje", "Hola, somos CAYLA…")}${copiarBoton("Copiar CCI", "002-193-001234567890-12")}${copiarBoton("Copiar enlace", "https://cayla.pe/productos?talla=M", "link")}</div></div>`, "Suelto: el secundario «Copiar …», que pasa a «✓ Copiado» sin cambiar de ancho")}
  </div>`;
export const copiarDemos = {
  P1: () => copiarEscena(false),
  P2: () => copiarEscena(true),
  A: () =>
    `<div class="r13-hoy">` +
    [
      ["Pagar: un ícono de 14 px que se vuelve «✓ Copiado»", `<span class="r13-hoy-dato">002-193-0012…<button type="button" class="r13-hoy-cp1">${ic("copy", "h-3.5 w-3.5")}</button></span>`],
      ["Destino del medio de pago: círculo de 20 px", `<span class="r13-hoy-dato">987 654 321<button type="button" class="r13-hoy-cp2">${ic("copy", "h-3 w-3")}</button></span>`],
      ["Cuentas de un proveedor: la píldora «COPIAR»", copiarPildora("CCI", "x")],
      ["Existencias: el código de la talla es el botón", `<button type="button" class="r13-hoy-cp3">código <b>BLU-0012-M</b>${ic("copy", "h-3.5 w-3.5")}</button>`],
      ["Nota de crédito: «COPIAR MENSAJE» en versalitas", `<button type="button" class="r13-hoy-cp4 label-cayla">${ic("copy", "h-3.5 w-3.5")} Copiar mensaje</button>`],
      ["Proveedor y Traslados: el secundario, sin «Copiado»", btn("secundario", "Copiar CCI", { icono: ic("copy", "h-3.5 w-3.5") })],
      ["Una terminal nueva: «Copiar» sin ícono, a media fila", `<div style="display:flex;gap:8px;width:280px">${btn("secundario", "Copiar", { clase: "flex-1" })}${btn("primario", "Listo", { clase: "flex-1" })}</div>`],
      ["Productos: «COPIAR ENLACE» en versalitas con el eslabón", `<button type="button" class="r13-hoy-cp5 label-cayla">${ic("link", "h-3.5 w-3.5")} Copiar enlace</button>`],
      ["Existencias: el eslabón solo, 36 px", `<button type="button" class="r13-hoy-cp6">${ic("link", "h-4 w-4")}</button>`],
    ]
      .map(([et, b]) => celda(et, b))
      .join("") +
    `</div>`,
};

// ================= 4 · EL MENÚ «MÁS» =================
// P1: con la palabra donde cabe («Más ▾», el secundario, como Clientes y Marcas); en una fila de una lista, el «⋯» solo de 32 px
// (como el lápiz de la ronda 12). Los dos abren la misma lista.
// P2: el «⋯» en todas partes (como Roles y Movimientos).
const OPCIONES = [["Descargar Excel"], ["Copiar enlace de esta vista"], ["Imprimir el cartel del club"]];
const lista = `<div class="r13-menu card-cayla" role="menu" hidden>${OPCIONES.map(([t]) => `<button type="button" role="menuitem" class="r13-menu-op">${t}</button>`).join("")}</div>`;
const masPalabra = `<span class="r13-menu-ancla"><button type="button" class="btn-cayla btn-secundario" data-r13-menu aria-haspopup="menu" aria-expanded="false"><span class="relative flex items-center gap-2">Más ${ic("down", "r13-menu-flecha h-3.5 w-3.5")}</span></button>${lista}</span>`;
const masPuntos = (que, borde = false) =>
  `<span class="r13-menu-ancla"><button type="button" class="r13-puntos ${borde ? "r13-puntos-borde" : ""}" data-r13-menu aria-haspopup="menu" aria-expanded="false" aria-label="Más acciones de ${que}" title="Más acciones de ${que}">${ic("more", "h-4 w-4")}</button>${lista}</span>`;
const cabecera = (accion) =>
  `<header data-voz="cabecera" class="r13-cab"><div><p class="r13-cab-sede"><span class="r13-hilo-sede"></span>TIENDA LIMA · MIÉRCOLES, 14 DE OCTUBRE</p><h3 class="r13-cab-h">Clientes</h3></div><div class="r13-cab-acc">${accion}${btn("primario", "Nuevo cliente", { icono: ic("plus", "h-3.5 w-3.5") })}</div></header>`;
const filaRol = (n, k, accion) => `<div class="r13-tfila r13-tfila-rol"><span class="r13-tnom">${n}</span><span class="r13-pie">${k} módulos</span><span>${accion}</span></div>`;
const roles = (accion) => `<div class="r13-tabla">${filaRol("Vendedora", 6, accion("Vendedora"))}${filaRol("Encargada de sede", 14, accion("Encargada de sede"))}${filaRol("Almacén", 9, accion("Almacén"))}</div>`;
export const menuDemos = {
  P1: () =>
    `<div class="r13-col">${cabecera(masPalabra)}<div class="r13-bloque"><span class="dz-et2">En una fila de una lista: el «⋯» solo, con su nombre al pasar el mouse</span>${roles((q) => masPuntos(q))}</div></div>`,
  P2: () => `<div class="r13-col">${cabecera(masPuntos("Clientes", true))}<div class="r13-bloque"><span class="dz-et2">En una fila: el mismo «⋯»</span>${roles((q) => masPuntos(q, true))}</div></div>`,
  A: () =>
    `<div class="r13-hoy">` +
    [
      ["Clientes, Marcas, Por regularizar: «Más ▾», el secundario", masPalabra],
      ["Roles y Movimientos: «⋯» de 36 px con borde", masPuntos("Movimientos", true)],
      ["Facturación: «⋯ Opciones», el botón de fila (abre una hoja)", `<button type="button" class="r13-hoy-opciones">${ic("more", "h-[15px] w-[15px]")} Opciones</button>`],
      ["Existencias: «Más ▾» hecho a mano en el pie de cada tarjeta", `<button type="button" class="r13-hoy-mas-exist">Más ${ic("down", "h-3.5 w-3.5")}</button>`],
    ]
      .map(([et, b]) => celda(et, b))
      .join("") +
    `</div>`,
};
