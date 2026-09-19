#!/usr/bin/env node
/**
 * El aviario — de qué pájaro es cada tabla del schema `retail`. LA ÚNICA LISTA.
 *
 * EL PROBLEMA QUE RESUELVE. Hasta el 2026-09-18 "¿de quién es esta tabla?" tenía dos
 * respuestas escritas a mano: la tabla de `docs/datos/07-GOBIERNO.md` §1 (escrita contra
 * V1 el 2026-09-12) y la lista de `generar.mjs` (puesta al día a V2 el 2026-09-15). No
 * coincidían entre sí ni con producción: 39 de las 60 tablas reales no tenían pájaro en
 * GOBIERNO, y 21 salían «sin módulo» en el diccionario. La regla «si nace una tabla nueva,
 * nace con dueño o no nace» existía, pero nada avisaba cuando se rompía (ADR-0104).
 *
 * QUÉ PROMETE. Cada tabla o vista de `retail` en producción tiene exactamente un pájaro.
 * `pnpm datos:aviario` lo comprueba contra el volcado de producción
 * (`docs/datos/generado/retail_columnas.json`) y contra los 14 pájaros de GOBIERNO §1,
 * y escribe `docs/datos/generado/AVIARIO.md`. Con `--verificar` —así corre en CI— no
 * escribe nada: falla si algo de eso no se cumple o si `AVIARIO.md` quedó viejo.
 *
 * QUÉ ASUME. Que el volcado describe producción: la alarma es tan fresca como ese volcado
 * (cómo refrescarlo: `docs/datos/generado/COMO-REFRESCAR.md`). Y que quién LLEVA cada
 * pájaro se escribe en GOBIERNO §1, no acá: el pájaro es el puesto; la persona se apunta
 * allá, editando una línea, sin correr nada.
 *
 * DARLE PÁJARO A UNA TABLA NUEVA: agregar su nombre a la lista del pájaro que corresponde,
 * correr `pnpm datos:aviario` y commitear el `AVIARIO.md` que resulta.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// El porqué de cada reparto que no es obvio está en GOBIERNO §1, «Repartos que no son
// obvios». Acá solo queda la lista.
export const AVIARIO = [
  { n: "01", pajaro: "Ganso", modulo: "Identidad y acceso",
    tablas: ["colaboradores", "ubicaciones"] },
  { n: "02", pajaro: "Loro", modulo: "Catálogo y vocabulario",
    tablas: [
      "productos", "variantes", "categorias", "familias", "producto_fotos", "historial_producto_cambios",
      // De quién es cada producto (ADR-0109): la marca y qué proveedores la traen. Sin proponer/aprobar, como familias.
      "marcas", "marca_proveedores",
      "codigos_barras", "codigos_correlativos",
      // El vocabulario cerrado: los cinco usan el mismo proponer/aprobar/rechazar (ADR-0070, ADR-0095).
      "colores", "tallas", "categoria_tallas", "tejidos", "categoria_tejidos",
      "patrones", "categoria_patrones", "etiquetas", "etiqueta_categorias", "variante_etiquetas",
    ] },
  // Tucán es la traducción al estándar de Shopify (ADR-0030); sus tablas no existen en V2.
  { n: "03", pajaro: "Tucán", modulo: "Taxonomía universal", tablas: [] },
  { n: "04", pajaro: "Golondrina", modulo: "Importación de catálogo", tablas: [] },
  { n: "05", pajaro: "Halcón", modulo: "Inventario y movimientos",
    tablas: [
      "movimientos", "stock", "lotes", "sububicaciones", "costo_historial", "prendas_danadas",
      "transferencias", "transferencia_items", "transferencia_recepciones",
      // ADR-0113: el envío es el padre de los lotes (`lotes.envio_id`); sus extras son movimientos y sus
      // traslados, transferencias — el mismo pájaro que las tablas que agrupa, no el de Compras.
      "envios", "envio_extras", "envio_traslados",
    ] },
  { n: "06", pajaro: "Lechuza", modulo: "Conteo y censo físico",
    tablas: ["conteos", "conteo_items"] },
  { n: "07", pajaro: "Colibrí", modulo: "Ventas y caja",
    tablas: [
      "ventas", "venta_items", "venta_pagos", "venta_anulacion_items", "cajas", "caja_movimientos",
      "clientes", "codigos_descuento", "cambios", "devoluciones", "devolucion_items",
    ] },
  { n: "08", pajaro: "Cuervo", modulo: "Facturación SUNAT",
    tablas: ["comprobantes", "series_comprobantes", "proformas", "configuracion_empresa", "ubicacion_datos_fiscales"] },
  { n: "09", pajaro: "Pelícano", modulo: "Compras y proveedores",
    tablas: ["proveedores", "compras", "compra_items", "compra_pagos", "compra_adjuntos", "compras_resumen", "compra_items_resumen",
      // ADR-0111 (Compras): cierres de línea por faltante, notas de crédito del proveedor y su saldo a favor.
      // Nacen con dueño: aún no están en producción (sin pegar), por eso el aviario avisa que no las ve en el volcado.
      "compra_item_cierres", "compra_notas_credito", "proveedor_creditos",
      // ADR-0138 (Compras): el reparto de un comprobante entre tiendas (`compra_item_destinos`: línea × tienda × cantidad),
      // su bitácora de reasignaciones y la vista que cruza el plan con lo recibido y cerrado por tienda. Nacen con dueño;
      // aún no están en producción (172000/173000 sin pegar), por eso el aviario avisa que no las ve en el volcado.
      "compra_item_destinos", "compra_reasignaciones", "compra_item_reparto_resumen"] },
  { n: "10", pajaro: "Gallito", modulo: "Producción del Taller",
    tablas: ["producciones", "produccion_lineas", "insumos", "insumo_lotes", "movimientos_insumo", "v_insumo_saldos"] },
  { n: "11", pajaro: "Garza", modulo: "Finanzas operativas", tablas: ["gastos"] },
  { n: "12", pajaro: "Urraca", modulo: "Contabilidad", tablas: ["activos_fijos"] },
  // Águila lee lo de los demás; el día que escriba sus propios resúmenes, nacen acá.
  { n: "13", pajaro: "Águila", modulo: "Inteligencia y reportes", tablas: [] },
  { n: "14", pajaro: "Gorrión", modulo: "Plataforma y esquema", tablas: [] },
];

/**
 * Cruza el aviario contra las tablas que existen de verdad.
 *   sinPajaro — existe y no tiene pájaro                  → rompe la regla
 *   dobles    — aparece más de una vez en el aviario       → rompe la regla
 *   ausentes  — está en el aviario y no en la base         → solo aviso: puede ser SQL que
 *               todavía no se pegó en producción, un volcado viejo que todavía no la
 *               conoce, o una tabla que ya no existe y sobra acá
 */
export function revisar(nombresReales, aviario = AVIARIO) {
  const reales = new Set(nombresReales);
  const vistas = new Map();
  for (const p of aviario) for (const t of p.tablas) vistas.set(t, [...(vistas.get(t) ?? []), p.pajaro]);
  return {
    sinPajaro: [...reales].filter(t => !vistas.has(t)).sort(),
    dobles: [...vistas].filter(([, ps]) => ps.length > 1).map(([t, ps]) => `${t} (${ps.join(", ")})`).sort(),
    ausentes: [...vistas.keys()].filter(t => !reales.has(t)).sort(),
  };
}

/**
 * Los pájaros tal como los escribe la tabla «| # | Pájaro | Módulo | Lo lleva |» de GOBIERNO
 * §1. Tolera negritas; no lee la columna «Lo lleva» a propósito: apuntarse a un pájaro no
 * tiene que obligar a nadie a correr un script.
 */
export function pajarosDeGobierno(texto) {
  const lineas = texto.split("\n");
  const inicio = lineas.findIndex(l => /^\|\s*#\s*\|\s*Pájaro\s*\|\s*Módulo\s*\|/.test(l));
  if (inicio < 0) return [];
  const pajaros = [];
  for (const l of lineas.slice(inicio + 2)) {
    if (!l.startsWith("|")) break;
    const [, n, pajaro, modulo] = l.split("|").map(c => c.replace(/\*/g, "").trim());
    pajaros.push({ n, pajaro: pajaro.normalize("NFC"), modulo: modulo.normalize("NFC") });
  }
  return pajaros;
}

/** Diferencias entre los 14 de acá y los 14 de GOBIERNO §1, en palabras. */
export function diferenciasConGobierno(deGobierno, aviario = AVIARIO) {
  const allá = new Map(deGobierno.map(p => [p.n, p]));
  const dif = [];
  for (const p of aviario) {
    const g = allá.get(p.n);
    if (!g) dif.push(`${p.n} · ${p.pajaro}: no está en GOBIERNO §1`);
    else if (g.pajaro !== p.pajaro.normalize("NFC") || g.modulo !== p.modulo.normalize("NFC")) {
      dif.push(`${p.n}: acá «${p.pajaro} — ${p.modulo}», en GOBIERNO «${g.pajaro} — ${g.modulo}»`);
    }
  }
  for (const g of deGobierno) if (!aviario.some(p => p.n === g.n)) dif.push(`${g.n} · ${g.pajaro}: está en GOBIERNO §1 y no acá`);
  return dif;
}

/** El índice de ruteo en Markdown. Sin fecha adentro, para que `--verificar` pueda comparar. */
export function aviarioMd(nombresReales, aviario = AVIARIO) {
  const reales = new Set(nombresReales);
  const { sinPajaro, ausentes } = revisar(nombresReales, aviario);
  const codigo = t => `\`${t}\``;
  const L = [
    "# Aviario — de qué pájaro es cada tabla",
    "",
    "> ⚠️ **ARCHIVO GENERADO. No lo edites a mano** — lo reescribe `pnpm datos:aviario`.",
    "> Para darle pájaro a una tabla se edita `scripts/datos/aviario.mjs`. Para apuntarte a un",
    "> pájaro, `docs/datos/07-GOBIERNO.md` §1: el pájaro es el puesto, quién lo lleva se dice allá.",
    ">",
    `> **Origen:** volcado de producción (\`retail_columnas.json\`) · **Tablas y vistas:** ${reales.size} · **Sin pájaro:** ${sinPajaro.length}`,
    "",
    "## Por pájaro",
    "",
    "| # | Pájaro | Módulo | Tablas |",
    "|---|---|---|---|",
  ];
  for (const p of aviario) {
    const suyas = p.tablas.filter(t => reales.has(t)).sort();
    L.push(`| ${p.n} | **${p.pajaro}** | ${p.modulo} | ${suyas.length ? suyas.map(codigo).join(" · ") : "*sin tablas hoy*"} |`);
  }
  L.push("", "## Por tabla", "", "Tienes un nombre de tabla, quieres el pájaro.", "", "| Tabla | Pájaro |", "|---|---|");
  for (const t of [...reales].sort()) {
    const p = aviario.find(x => x.tablas.includes(t));
    L.push(`| ${codigo(t)} | ${p ? `${p.n} · ${p.pajaro}` : "⚠️ **sin pájaro**"} |`);
  }
  if (sinPajaro.length) {
    L.push("", "## ⚠️ Sin pájaro", "", "Existen en producción y nadie responde por ellas. Se les da pájaro en `scripts/datos/aviario.mjs`.", "");
    for (const t of sinPajaro) L.push(`- ${codigo(t)}`);
  }
  if (ausentes.length) {
    L.push("", "## En el aviario, pero no en el volcado de producción", "",
      "Puede ser SQL que todavía no se pegó allá, o un volcado viejo que todavía no la conoce (cómo refrescarlo:",
      "`COMO-REFRESCAR.md`). Si la tabla ya no existe, sobra en `scripts/datos/aviario.mjs`.", "");
    for (const t of ausentes) L.push(`- ${codigo(t)}`);
  }
  return L.join("\n") + "\n";
}

// ── Ejecución ───────────────────────────────────────────────────────────────
// Solo cuando se corre directo; `generar.mjs` importa este archivo por la lista.

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const GENERADO = join(RAIZ, "docs", "datos", "generado");
  const verificar = process.argv.includes("--verificar");

  const reales = Object.keys(JSON.parse(readFileSync(join(GENERADO, "retail_columnas.json"), "utf8")));
  const deGobierno = pajarosDeGobierno(readFileSync(join(RAIZ, "docs", "datos", "07-GOBIERNO.md"), "utf8"));
  const { sinPajaro, dobles, ausentes } = revisar(reales);
  const difGobierno = deGobierno.length ? diferenciasConGobierno(deGobierno) : ["no encuentro la tabla «| # | Pájaro | Módulo | Lo lleva |» en 07-GOBIERNO.md §1"];

  const errores = [];
  if (sinPajaro.length) errores.push(`${sinPajaro.length} tabla(s) de producción sin pájaro: ${sinPajaro.join(", ")}\n    → Dales pájaro en scripts/datos/aviario.mjs. Si nace una tabla nueva, nace con dueño o no nace.`);
  if (dobles.length) errores.push(`${dobles.length} tabla(s) con más de un pájaro: ${dobles.join("; ")}\n    → Cada tabla tiene un solo dueño; deja una.`);
  if (difGobierno.length) errores.push(`Los pájaros de acá y los de 07-GOBIERNO.md §1 no coinciden:\n    - ${difGobierno.join("\n    - ")}`);

  const md = aviarioMd(reales);
  const ruta = join(GENERADO, "AVIARIO.md");
  if (verificar) {
    if (!existsSync(ruta) || readFileSync(ruta, "utf8") !== md) {
      errores.push("docs/datos/generado/AVIARIO.md quedó viejo.\n    → Corre `pnpm datos:aviario` y commitea el archivo que sale.");
    }
  } else {
    writeFileSync(ruta, md);
  }

  console.log(`\n  Aviario — ${reales.length} tablas y vistas de producción, ${AVIARIO.length} pájaros`);
  if (ausentes.length) console.log(`  · ${ausentes.length} en el aviario pero no en el volcado de producción (aviso, no error: SQL sin pegar o volcado viejo): ${ausentes.join(", ")}`);
  if (errores.length) {
    for (const e of errores) console.error(`  ✗ ${e}`);
    console.error("");
    process.exit(1);
  }
  console.log(`  ✓ Ninguna tabla sin pájaro, ninguna con dos, y los ${deGobierno.length} pájaros coinciden con 07-GOBIERNO.md §1`);
  console.log(verificar ? "  ✓ AVIARIO.md al día\n" : "  ✓ AVIARIO.md escrito — commitéalo junto con el cambio\n");
}
