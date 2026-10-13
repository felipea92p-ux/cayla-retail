// Arma spec.json de la ronda 7 (tablas y títulos de sección) y llama a elegir.mjs. Comparte el CSS y el guion de la ronda 6.
//   node construir.mjs   (desde esta carpeta)
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "./piezas.mjs";

const fotos = existsSync("fotos.json") ? JSON.parse(readFileSync("fotos.json", "utf8")) : {};
const img = (clave) => fotos[clave] ?? [];
function demo({ titulo = "", escenas, nota }) {
  const sel = escenas.length > 1
    ? `<span class="dz-et">Ver</span>${escenas.map((e, i) => `<button type="button" class="dz-sel" data-ver="${e.id}" aria-pressed="${i === 0}">${e.nombre}</button>`).join("")}`
    : `<span class="dz-et">${titulo}</span>`;
  const cuerpo = escenas.map((e, i) => `<div data-escena="${e.id}"${i ? " hidden" : ""}>${e.html}</div>`).join("");
  return `<div class="dz"><div class="dz-barra">${sel}<button type="button" class="dz-repetir">↻ Repetir la entrada</button></div>${cuerpo}${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;
}
const una = (titulo, html, nota) => demo({ titulo, escenas: [{ id: "u", nombre: "", html }], nota });
const NOTA_TABLA = "Pasa el mouse por las filas, toca un título para ordenar (vuelve a tocarlo para invertir) y toca una fila para «abrir su cajón». «Repetir la entrada» vuelve a cargar la lista.";

// ================= TABLA =================
const tabla = {
  id: "tabla",
  nombre: "1 · Una lista en filas y columnas",
  pregunta: "¿Cómo se ve, y cómo se mueve, una tabla del ERP (Compras, Clientes, Caja, Rendimiento, Notas de crédito)?",
  ayuda: "De 39 formas del censo quedan cuatro reales y la de Finanzas: las demás eran la misma <Tabla> con otro alto de fila, o cosas que no son tablas (la matriz de tallas de Existencias, el calendario). Hoy ninguna tabla dice con movimiento que una fila se puede abrir: la fila se tiñe y nada más.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · <Tabla> de hoy, con movimiento (mi recomendación)",
      detalle: "La <Tabla> de la guía oficial (ADR-0169) tal cual se ve —cabecera en banda arena con los títulos en taupe, zebra en hueso, cifras a la derecha con dígitos fijos— más lo que le falta para decir «esto se abre»: al pasar el mouse, el hilo rojo de canto a la izquierda y la flecha «›» que asoma a la derecha; la fila abierta (su cajón) se queda marcada; el título que ordena muestra su flecha y la gira al invertir.",
      movimiento: "Al cargar o filtrar: las filas entran en cascada (sube 6 px, 28 ms entre cada una, hasta 12; después, todas juntas). Al pasar el mouse: tinte crema (180 ms), el hilo crece de canto (220 ms) y la «›» asoma desde 4 px (200 ms). Al ordenar: la flecha gira media vuelta (300 ms) y las filas vuelven a entrar en el nuevo orden. La fila abierta: hueso firme + hilo quieto. Una fila recién guardada respira en verde una vez (1,4 s). Foco con teclado: el anillo hacia adentro (ADR-0351); Enter la abre.",
      donde: "<Tabla> hoy: 47 usos en 34 archivos (Compras, Clientes, Caja, Rendimiento, Notas de crédito, Plan de compra, Global, Etiquetas de precio…). Las 54 <table> hechas a mano se pasan a esta pieza.",
      demo: una("Comprobantes de compra · Tienda Lima", m.tablaP("zebra"), NOTA_TABLA),
      imagenes: img("tabla.P1"),
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Libro de cuentas",
      detalle: "Sin banda ni zebra: la cabecera en VERSALITAS sobre una raya, filas con más aire separadas por la raya sand. Es lo que hoy hacen Compras y Proveedores, con el mismo movimiento de P1. Más calma, pero en una tabla larga el ojo pierde la fila sin la zebra.",
      movimiento: "El mismo de P1: cascada al cargar, hilo de canto y «›» al pasar el mouse, flecha que gira al ordenar, fila abierta marcada.",
      demo: una("Comprobantes de compra · Tienda Lima", m.tablaP("libro"), NOTA_TABLA),
      imagenes: img("tabla.P2"),
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: <Tabla>",
      detalle: "Banda arena, títulos taupe de 12 a 13 px, zebra en hueso. Al pasar el mouse la fila se tiñe de crema y nada más: no se sabe si se abre. El ordenar existe (Rendimiento) pero casi ninguna lo usa.",
      movimiento: "Tinte crema al pasar el mouse (150 ms). Sin entrada, sin marca de la fila abierta. La flecha de ordenar gira en 300 ms donde existe.",
      donde: "Compras (Facturas), Clientes, Historial de cajas, Rendimiento, Notas de crédito, Plan de compra, Global, Etiquetas de precio.",
      demo: una("Comprobantes de compra · Tienda Lima", m.tablaHoyA()),
      imagenes: img("tabla.A"),
    },
    {
      id: "B", tipo: "hoy", entera: true,
      nombre: "B · Hoy: versalitas sin banda",
      detalle: "Los títulos en VERSALITAS de 11 px sin banda, sin zebra, la fila clicable se tiñe de hueso. Por pagar (agrupado por proveedor) y Proveedores.",
      movimiento: "Tinte hueso al pasar el mouse (150 ms). Nada más.",
      donde: "Compras ▸ Por pagar, Compras ▸ Proveedores (y su vista rápida).",
      demo: una("Comprobantes de compra · Tienda Lima", m.tablaHoyB()),
      imagenes: img("tabla.B"),
    },
    {
      id: "C", tipo: "hoy", nombre: "C · Hoy: la tabla de Productos",
      detalle: "Catálogo ▸ Productos en vista Tabla: títulos de 15 px en negrita mayúscula (PRENDA, COLORES, PRECIO…), filas de 82 px con la foto. Es de su rediseño (ADR-0254).",
      movimiento: "La fila se despliega con sus variantes; la vista rápida tiene su movimiento propio (ADR-0136).",
      decidida: "Catálogo ▸ Productos tiene su diseño aprobado (ADR-0254): Felipe dice si su tabla se une.",
      imagenes: img("tabla.C"),
    },
    {
      id: "D", tipo: "hoy", entera: true,
      nombre: "D · Hoy: la <table> hecha a mano",
      detalle: "Comercial y otras: cabecera en negrita con una raya negra, filas con raya tenue, sin tarjeta ni hover.",
      movimiento: "Ninguno.",
      donde: "Comercial (ventas por colaboradora, prendas dañadas) y las ~50 <table> a mano.",
      demo: una("Comprobantes de compra · Tienda Lima", m.tablaHoyC()),
      imagenes: img("tabla.D"),
    },
    {
      id: "F", tipo: "hoy", entera: true,
      nombre: "F · Finanzas (decidida a propósito, ADR-0195)",
      detalle: "fin-tabla del spike: títulos taupe sin banda, filas con raya, cifras a la derecha; en celular se apila.",
      movimiento: "Ninguno al pasar el mouse.",
      donde: "67 usos en 16 archivos: Impuestos, Reportes, Cuentas y dinero, Configuración.",
      decidida: "ADR-0195. Felipe dice si se une (con P1 se parecerían mucho: solo cambia la banda).",
      demo: una("En Finanzas", m.tablaHoyF()),
      imagenes: img("tabla.F"),
    },
  ],
};

// ================= TÍTULOS =================
const bloque = {
  id: "bloque",
  nombre: "2 · El título de un bloque en una pantalla",
  pregunta: "Sobre (o dentro de) cada tarjeta de una pantalla —«Ventas de esta semana», «Lo que falta reponer»—, ¿cómo se ve su título?",
  ayuda: "Hoy hay tres familias y casi veinte tamaños: serif de 18 a 24 px con peso 500 o 600 (Configuración, Caja, Frescura, Análisis, Colaboradores), versalitas de 10,5 a 12 px en taupe o tinta (Comercial, Rendimiento, Análisis) y sans seminegrita de 13 a 15 px (Cambios, Nuevo producto). Un título dice «esto es otra cosa»: si cambia de forma en cada pantalla, no se aprende.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · Serif de 21 px con su dato a la derecha (mi recomendación)",
      detalle: "Un solo tamaño (21 px, peso 400, la serif de la marca) para todo título de bloque, sobre la tarjeta o dentro de ella. A su derecha, en la misma línea, lo que resume el bloque (una cifra, «14 ventas») o su acción («Ver las 9 →»), en taupe de 13 px. Las versalitas quedan para lo chico: títulos de grupo y separadores (preguntas 3 y 4).",
      movimiento: "Entra con la cascada de la pantalla (sube 3 px, 55 ms entre bloques, como los modales). La flecha de la acción avanza 3 px y se pone roja al pasar el mouse. Nada más: un título no se mueve solo.",
      demo: una("Una pantalla de ejemplo", m.titulosP1()),
      imagenes: img("tit.P1"),
    },
    {
      id: "P2", tipo: "propuesta", ancha: true,
      nombre: "P2 · Todo en versalitas",
      detalle: "Todo título de bloque en VERSALITAS de 11 px en tinta al 65 %, con su dato o su acción a la derecha. Más callado y ordenado; la serif queda solo para la cabecera de la pantalla y las hojas. Con muchos bloques, todo se parece y cuesta encontrar uno.",
      movimiento: "El mismo de P1.",
      demo: una("Una pantalla de ejemplo", m.titulosP2()),
      imagenes: img("tit.P2"),
    },
    { id: "A", tipo: "hoy", ancha: true, nombre: "A · Hoy: serif en ocho tamaños", detalle: "font-display de 18 a 24 px, peso 500 o 600, a veces con el dato pegado («Camisas y Blusas 4 prendas»).", movimiento: "Ninguno; entra con la pantalla.", donde: "Configuración, Caja ▸ Historial, Global, Existencias, Frescura, Análisis, Colaboradores, Finanzas.", demo: una("Una pantalla de ejemplo", m.titulosHoy.A()), imagenes: img("tit.A") },
    { id: "B", tipo: "hoy", ancha: true, nombre: "B · Hoy: versalitas en seis variantes", detalle: "De 10,5 a 12 px, taupe o tinta al 65 %, peso 600 o 700, con más o menos espaciado.", movimiento: "Ninguno.", donde: "Comercial, Rendimiento, Colaboradores, Análisis, Historial de ventas, Proveedores.", demo: una("Una pantalla de ejemplo", m.titulosHoy.B()), imagenes: img("tit.B") },
    { id: "C", tipo: "hoy", nombre: "C · Hoy: sans seminegrita", detalle: "13 a 15 px, peso 600, tinta o taupe.", movimiento: "Ninguno.", donde: "Cambios, Devoluciones, Nuevo producto, Rendimiento, Análisis.", demo: una("Una pantalla de ejemplo", m.titulosHoy.C()), imagenes: img("tit.C") },
    { id: "F", tipo: "hoy", nombre: "F · Finanzas (decidida a propósito, ADR-0195)", detalle: "fin-etq: versalitas taupe de 11 px, más abiertas; y serif de 19 a 22 en sus tarjetas.", movimiento: "Ninguno.", decidida: "ADR-0195. Felipe dice si se une.", demo: una("En Finanzas", m.titulosHoy.F()), imagenes: img("tit.F") },
  ],
};
const grupo = {
  id: "grupo",
  nombre: "3 · El título de un grupo dentro de una hoja",
  pregunta: "Dentro de una hoja o un cajón que se lee de arriba abajo (el detalle de una venta, un paso de Cambios), ¿cómo se separa «Prendas», «Pago», «Comprobante»?",
  ayuda: "Hoy: versalitas grandes de 15 px en Vender (PAGO, COMPROBANTE), versalitas chicas en el Historial (RECORRIDO), sans seminegrita en Cambios y Devoluciones («Ruta», «Qué pasó», «Impacto en caja»).",
  opciones: [
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · Versalitas con una raya que se dibuja (mi recomendación)",
      detalle: "VERSALITAS de 11 px en tinta al 62 % con, si ayuda, su cuenta («· 2 prendas»), y una raya sand fina que corre hasta el borde: separa sin pesar y se lee como el índice de la hoja.",
      movimiento: "Al abrir la hoja, cada raya se dibuja de izquierda a derecha (520 ms), una después de otra (90 ms entre grupos), siguiendo la cascada del modal. Sin bucle.",
      demo: una("El detalle de una venta", m.gruposP1()),
      imagenes: img("grp.P1"),
    },
    { id: "A", tipo: "hoy", nombre: "A · Hoy: versalitas sueltas", detalle: "Versalitas de 10,5 a 15 px, sin raya; en Vender, grandes y en tinta.", movimiento: "Ninguno.", donde: "Vender (cobro), Historial (detalle de una venta), Análisis.", demo: una("El detalle de una venta", m.gruposHoy.A()), imagenes: img("grp.A") },
    { id: "B", tipo: "hoy", nombre: "B · Hoy: sans seminegrita", detalle: "13 a 15 px en tinta: «Ruta», «Qué pasó», «¿En qué estado vuelve cada prenda?».", movimiento: "Ninguno.", donde: "Cambios, Devoluciones, Inventario (cajones), Caja.", demo: una("El detalle de una venta", m.gruposHoy.B()), imagenes: img("grp.B") },
    { id: "C", tipo: "hoy", nombre: "C · Hoy: serif chica", detalle: "Serif de 17 a 19 px como subtítulo («Lo que tenía», «Día 1 · cada tienda»).", movimiento: "Ninguno.", donde: "Finanzas (Balance, Cierre), Análisis.", demo: una("El detalle de una venta", m.gruposHoy.C()), imagenes: img("grp.C") },
  ],
};
const dia = {
  id: "dia",
  nombre: "4 · El separador de día en una lista larga",
  pregunta: "En las listas que se ordenan por fecha (ventas del mostrador, Actividad, Conteos, Movimientos), ¿cómo se ve el «Hoy», «Ayer», «Sábado 10»?",
  ayuda: "Baja la lista de cada demo.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · El día que se queda arriba (mi recomendación)",
      detalle: "VERSALITAS de 11 px con el total del día a la derecha («S/ 514.50 · 7 ventas»); al bajar, el día se queda pegado arriba sobre un velo de papel mientras pasan sus filas, así nunca se pierde de qué día es lo que se mira. «Hoy» lleva un punto rojo.",
      movimiento: "Sin animación propia: el pegado lo hace el scroll. Al cambiar de día, el siguiente empuja al anterior hacia arriba.",
      demo: una("Ventas del mostrador", m.diasP1()),
      imagenes: img("dia.P1"),
    },
    { id: "A", tipo: "hoy", nombre: "A · Hoy: versalitas sueltas", detalle: "HOY, AYER, 5 DE OCTUBRE en taupe de 11 a 11,5 px, sin fondo; se van con el scroll.", movimiento: "Ninguno.", donde: "Cambios, Devoluciones, Historial de ventas, Actividad.", demo: una("Ventas del mostrador", m.diasHoy.A()), imagenes: img("dia.A") },
    { id: "B", tipo: "hoy", nombre: "B · Hoy: serif grande", detalle: "«Hoy miércoles 7 de octubre» en serif de 22 px.", movimiento: "Ninguno.", donde: "Movimientos, Frescura.", demo: una("Ventas del mostrador", m.diasHoy.B()), imagenes: img("dia.B") },
    { id: "C", tipo: "hoy", nombre: "C · Hoy: la banda con la cuenta", detalle: "Una banda con el día y su cuenta («MARTES, 29 DE SETIEMBRE · 3 CONTEOS»); en Conteo, sobre tinta.", movimiento: "Ninguno.", donde: "Conteo.", demo: una("Ventas del mostrador", m.diasHoy.C()), imagenes: img("dia.C") },
  ],
};

const spec = {
  titulo: "Unificar · ronda 7 · leer datos",
  clave: "unificar-ronda7",
  css: "../elegir-ronda6/app.css",
  fotosAlFinal: true,
  estilos: ["../elegir-ronda6/demo.css"],
  guion: "../elegir-ronda6/demo.js",
  claseHtml: readFileSync("../elegir-ronda6/clase.txt", "utf8").trim(),
  nota: "Lo que la colaboradora lee: las tablas y los títulos que ordenan cada pantalla. Todo lo de «Pruébalo» está VIVO con el CSS real del ERP: pasa el mouse por las filas, ordena tocando un título, abre una fila, baja las listas por día, «Repetir la entrada» y «Ver en oscuro» (abajo). Nada se guarda. Las fotos son de las pantallas reales (censo del 7 de octubre). Elige una tarjeta por pregunta; si quieres mezclar, escríbelo en el comentario.",
  familias: [
    { id: "tabla", nombre: "Tablas", pregunta: "Una lista de registros en filas y columnas.", ayuda: "La regla de columnas (una plantilla para el encabezado y las filas, cifras a la derecha, se apila en celular) no cambia: aquí se elige cómo se ve y cómo se mueve.", grupos: [tabla] },
    { id: "titulo-seccion", nombre: "Títulos de sección", pregunta: "Los títulos que ordenan una pantalla o una hoja (no la cabecera de la pantalla, que es de ADR-0220).", grupos: [bloque, grupo, dia] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });

// ---------- fragmentos de propuesta para el repo ----------
const DOCS = "../../../../../docs/unificar/propuestas";
const estilo = readFileSync("../elegir-ronda6/demo.css", "utf8");
const guion = readFileSync("../elegir-ronda6/demo.js", "utf8");
const cabecera = (familia, texto) => `<!-- Propuesta de /unificar · familia «${familia}» (ADR-0358) · ronda 7, 2026-10-12. Esperando la elección de Felipe.
     Fragmento: la lámina lo envuelve con el CSS real del ERP, en claro y en oscuro. Solo tokens (var(--color-…)); lo propio va con
     prefijo (dz- marco de la demo, pt- tabla, ps- título de bloque, pg- título de grupo, pd- separador de día). Lleva su guion para que
     se pueda tocar. La página de elegir (apps/web/unificar/.salida/elegir-ronda7/, fuera de git) tiene además las formas de hoy vivas
     y las fotos reales.
${texto}
-->
<style>
${estilo}
</style>
`;
const pie = `\n<script>\n${guion}\n</script>\n`;
const opc = (g, id) => g.opciones.find((o) => o.id === id);
const fr = (titulo, o) => `<h3 style="font:500 20px/1.2 var(--font-serif);margin:24px 0 8px">${titulo}</h3>\n<p style="font-size:13px;color:var(--color-taupe);max-width:90ch">${o.movimiento}</p>\n${o.demo}\n`;
writeFileSync(`${DOCS}/tabla.html`, cabecera("tabla", `     La pieza (P1): <Tabla> de la guía oficial tal cual (banda arena, títulos taupe, zebra hueso, cifras a la derecha) + su
     movimiento: filas en cascada al cargar (28 ms, hasta 12), al pasar el mouse el hilo rojo de canto y la «›» que asoma, el
     título que ordena con su flecha que gira, la fila abierta que se queda marcada, la recién guardada que respira en verde una vez.
     P2 = «libro de cuentas»: sin banda ni zebra, cabecera en versalitas sobre una raya, el mismo movimiento.`) + fr("P1", opc(tabla, "P1")) + fr("P2", opc(tabla, "P2")) + pie);
writeFileSync(`${DOCS}/titulo-seccion.html`, cabecera("titulo-seccion", `     La pieza (P1): título de bloque en serif de 21 px (peso 400) con su dato o su acción a la derecha en taupe 13 px; título de
     grupo dentro de una hoja en versalitas de 11 px con una raya sand que se dibuja hasta el borde; separador de día en versalitas
     con el total del día, pegado arriba al bajar, «Hoy» con su punto rojo. P2 (bloque) = todo en versalitas.`) + fr("Bloque · P1", opc(bloque, "P1")) + fr("Bloque · P2", opc(bloque, "P2")) + fr("Grupo · P1", opc(grupo, "P1")) + fr("Día · P1", opc(dia, "P1")) + pie);
console.log("propuestas escritas en docs/unificar/propuestas/");
