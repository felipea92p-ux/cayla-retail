// Arma spec.json de la ronda 8 (enlaces de texto, paginación, avatares) y llama a elegir.mjs. Comparte CSS y guion con la ronda 6.
//   node construir.mjs   (desde esta carpeta)
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "./piezas.mjs";

const fotos = existsSync("fotos.json") ? JSON.parse(readFileSync("fotos.json", "utf8")) : {};
const img = (clave) => fotos[clave] ?? [];
const una = (titulo, html, nota) => `<div class="dz"><div class="dz-barra"><span class="dz-et">${titulo}</span><button type="button" class="dz-repetir">↻ Repetir la entrada</button></div>${html}${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;

// ================= ENLACES =================
const frase = {
  id: "frase",
  nombre: "1 · Un enlace dentro de una frase",
  pregunta: "Cuando una frase lleva a otra pantalla («Regístrala en Proveedores», «Configuración ▸ Presupuesto»), ¿cómo se ve el enlace?",
  ayuda: "Hoy: btn-enlace (tinta subrayada que al pasar el mouse se pone taupe: 136 usos), el subrayado tenue que se pone rojo (unos 24) y el rojo que se subraya (unos 15). Pasa el mouse por los enlaces de cada demo.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · El hilo que se llena (mi recomendación)",
      detalle: "En reposo, la palabra en tinta con un subrayado tenue (se lee como enlace sin gritar). Al pasar el mouse, un hilo rojo de 1,5 px corre de izquierda a derecha sobre el subrayado y la palabra se pone rojo profundo: es el mismo hilo de los campos y las listas, ahora diciendo «esto te lleva».",
      movimiento: "Al pasar el mouse: el hilo rojo se dibuja de izquierda a derecha (300 ms) y el texto pasa a rojo profundo (200 ms). Al salir, el hilo se recoge. Al presionar, rojo. Foco con teclado: el anillo del sistema.",
      demo: una("Pasa el mouse por los enlaces", m.enlaceFrase.P1()),
      imagenes: img("frase.P1"),
    },
    {
      id: "P2", tipo: "propuesta", ancha: true,
      nombre: "P2 · btn-enlace, con rojo al pasar el mouse",
      detalle: "El de hoy (tinta con su subrayado entero), con un solo cambio: al pasar el mouse se pone rojo profundo en vez de taupe (taupe parece apagado, como si no se pudiera tocar).",
      movimiento: "El color pasa a rojo profundo (180 ms). Nada más.",
      demo: una("Pasa el mouse por los enlaces", m.enlaceFrase.P2()),
      imagenes: img("frase.P2"),
    },
    { id: "A", tipo: "hoy", ancha: true, nombre: "A · Hoy: btn-enlace", detalle: "Tinta subrayada; al pasar el mouse, taupe.", movimiento: "Cambia de color de golpe.", donde: "136 usos: Finanzas, Configuración, Caja, Compras, hojas de todo el ERP.", demo: una("Pasa el mouse", m.enlaceFrase.A()), imagenes: img("frase.A") },
    { id: "B", tipo: "hoy", ancha: true, nombre: "B · Hoy: el subrayado tenue", detalle: "Subrayado al 30 % que se pone rojo; en Cambios y Devoluciones, más grande, como salida de un paso («¿Nada de su agrado? Pasar a devolución»).", movimiento: "El color pasa a rojo (150 ms).", donde: "Compras, Catálogo, Cambios, Devoluciones, Movimientos.", demo: una("Pasa el mouse", m.enlaceFrase.B()), imagenes: img("frase.B") },
    { id: "C", tipo: "hoy", nombre: "C · Hoy: el rojo que se subraya", detalle: "Rojo sin subrayado; el subrayado aparece al pasar el mouse. Gasta el rojo, que es el acento de la pantalla (máximo 2, ADR-0169).", movimiento: "El subrayado aparece de golpe.", donde: "Unos 15 enlaces sueltos.", demo: una("Pasa el mouse", m.enlaceFrase.C()), imagenes: img("frase.C") },
  ],
};
const ver = {
  id: "ver",
  nombre: "2 · El enlace suelto que lleva a ver más",
  pregunta: "Al lado de un resumen («3 facturas vencen esta semana»), ¿cómo se ve lo que lleva a verlas («Pagar vencido →», «Ver las 9 →»)?",
  ayuda: "Hoy: versalitas rojas o en tinta con «→» escrito, btn-enlace con «→», y una píldora con punto en Facturación. La flecha escrita no se mueve.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · «Ver las 9 →» con la flecha que avanza (mi recomendación)",
      detalle: "Tinta de 13 px en letra normal, con la flecha de lucide a la derecha. Es la misma acción que la ronda 7 pone junto a un título de bloque: una sola pieza para «lleva a ver más». Sin subrayado: la flecha ya dice que lleva.",
      movimiento: "Al pasar el mouse, todo pasa a rojo (200 ms) y la flecha avanza 3 px (220 ms); al presionar, 5 px. Foco: el anillo del sistema.",
      demo: una("Pasa el mouse por las acciones", m.enlaceVer.P1()),
      imagenes: img("ver.P1"),
    },
    {
      id: "P2", tipo: "propuesta", ancha: true,
      nombre: "P2 · Versalitas rojas con la flecha que avanza",
      detalle: "VERSALITAS de 11 px en rojo con su flecha: se ve más, pero gasta el rojo (el acento de la pantalla) en cada tarjeta.",
      movimiento: "La flecha avanza 3 px al pasar el mouse (220 ms).",
      demo: una("Pasa el mouse por las acciones", m.enlaceVer.P2()),
      imagenes: img("ver.P2"),
    },
    { id: "A", tipo: "hoy", ancha: true, nombre: "A · Hoy: versalitas con «→» escrito", detalle: "VERSALITAS de 11 px (rojas o en tinta) que se subrayan al pasar el mouse; la flecha es un carácter y no se mueve.", movimiento: "El subrayado aparece de golpe.", donde: "«PAGAR VENCIDO →» (Proveedores), «VER TODAS» (unos 15).", demo: una("Pasa el mouse", m.enlaceVer.A()), imagenes: img("ver.A") },
    { id: "B", tipo: "hoy", ancha: true, nombre: "B · Hoy: btn-enlace o subrayado con «→»", detalle: "La frase subrayada con su «→» escrito; en Facturación, una píldora con punto («En cola: se reintenta solo →»).", movimiento: "Cambia de color de golpe.", donde: "Comercial, Facturación, Historial de ventas.", demo: una("Pasa el mouse", m.enlaceVer.B()), imagenes: img("ver.B") },
  ],
};

// ================= PAGINACIÓN =================
const pag = {
  id: "pagina",
  nombre: "3 · El pie de una lista larga",
  pregunta: "Cuando una lista tiene más de lo que cabe (Existencias, Movimientos, Marcas, Análisis), ¿cómo se pasa a lo que sigue?",
  ayuda: "Hoy: los números en versalitas de PaginacionLocal (11 px, la actual rellena de tinta), su versión grande de 36 px en Marcas, y en Movimientos un «SIGUIENTE PÁGINA →». Toca los números, las flechas y «Ver más». En toda forma, al cambiar de página la vista vuelve al inicio de la tabla (ADR-0185).",
  opciones: [
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · Las páginas, con la píldora que se desliza (mi recomendación)",
      detalle: "A la izquierda, qué se está viendo («1–8 de 64»); a la derecha, los números en letra normal de 13 px y 32 px de lado (se tocan bien con el mouse), las flechas a los costados. La página actual es una píldora de tinta que SE DESLIZA de un número al otro, como la pestaña de modo de la ronda 1. Sirve para recorrer y para volver a un punto.",
      movimiento: "La píldora se desliza al número nuevo (320 ms, sin rebote); las filas de la página nueva entran en cascada (28 ms entre cada una). Las flechas se corren 2 px hacia donde llevan al pasar el mouse; un número se tiñe. Foco: el anillo del sistema.",
      demo: una("Una lista de 64 prendas", m.paginacion.P1()),
      imagenes: img("pag.P1"),
    },
    {
      id: "P2", tipo: "propuesta", ancha: true,
      nombre: "P2 · «Ver 8 más»",
      detalle: "Un botón al pie que suma lo que sigue debajo, con una línea que se llena con lo ya visto («Ves 16 de 64»). Más simple para leer de corrido; para volver a un punto exacto hay que bajar.",
      movimiento: "Las filas nuevas entran en cascada debajo de las que ya estaban (la vista no salta); la línea se llena (420 ms). El botón tiene el movimiento de todo botón.",
      demo: una("Una lista de 64 prendas", m.paginacion.P2()),
      imagenes: img("pag.P2"),
    },
    { id: "A", tipo: "hoy", ancha: true, nombre: "A · Hoy: PaginacionLocal", detalle: "Números en VERSALITAS de 11 px, la actual rellena de tinta, «‹ ›». En Marcas, la versión grande de 36 px.", movimiento: "El color cambia al pasar el mouse; la actual cambia de golpe.", donde: "Existencias, Análisis, Marcas y las listas paginadas por URL (PaginacionPaginas).", demo: una("Una lista de 64 prendas", m.paginacion.A()), imagenes: img("pag.A") },
    { id: "C", tipo: "hoy", ancha: true, nombre: "C · Hoy: «Siguiente página →»", detalle: "Un enlace en versalitas que trae la página siguiente (Movimientos). No dice cuántas hay ni deja volver.", movimiento: "El color cambia al pasar el mouse.", donde: "Movimientos.", demo: una("Una lista de 64 prendas", m.paginacion.C()), imagenes: img("pag.C") },
  ],
};

// ================= AVATARES =================
const avatar = {
  id: "avatar",
  nombre: "4 · La cara de una persona",
  pregunta: "Donde el ERP nombra a alguien (Actividad, Equipo, Roles, el combo Responsable, Apartados), ¿cómo se ve su círculo?",
  ayuda: "La foto viene de Dynamic; sin foto, las iniciales. Hoy AvatarPersona deja el tamaño a cada pantalla (28, 32, 36, 80…) y hay unos doce círculos de iniciales hechos a mano (Roles, Apartados, el ticket, Proveedores). La vista rápida de la prenda pinta a cada persona con su tono (ADR-0354).",
  opciones: [
    {
      id: "P1", tipo: "propuesta", ancha: true,
      nombre: "P1 · AvatarPersona en cuatro tamaños (mi recomendación)",
      detalle: "La de hoy —iniciales en serif sobre arena— en cuatro tamaños fijos: 24 (dentro de una línea), 32 (listas), 40 (fichas y combos) y 80 (Mi perfil). Varias personas juntas, en pila con un borde de papel y «+2». Quien está de turno lleva un punto verde. Las iniciales a mano pasan a esta pieza.",
      movimiento: "La foto (cuando la hay, de Dynamic) aparece con un fundido de 420 ms en vez de saltar sobre las iniciales. La pila se abre un poco al pasar el mouse (240 ms) para ver a cada uno. Nada más: una cara no se mueve sola.",
      demo: una("Las personas", m.avatar.P1()),
      imagenes: img("av.P1"),
    },
    {
      id: "P2", tipo: "propuesta", ancha: true,
      nombre: "P2 · Con el tono de cada persona",
      detalle: "Lo mismo, con el color de la vista rápida de la prenda (ADR-0354) para todos: cada persona tiene su tono fijo (taupe, pizarra, verde o ámbar, sacado de su id) y sus iniciales en sans sobre ese tinte. En una lista larga se distingue a quién es quién de un vistazo; pero el verde y el ámbar ya dicen «bien» y «al filo» en el ERP.",
      movimiento: "El mismo de P1.",
      demo: una("Las personas", m.avatar.P2()),
      imagenes: img("av.P2"),
    },
    { id: "A", tipo: "hoy", ancha: true, nombre: "A · Hoy: AvatarPersona y los hechos a mano", detalle: "Serif sobre arena; el tamaño lo pone cada pantalla. A mano: arena al 70 % en Apartados, sans seminegrita de 10 px en la pila de Roles, el monograma de Proveedores que se vuelve negro al pasar el mouse.", movimiento: "Ninguno (el de Proveedores se oscurece en 300 ms).", donde: "Actividad (120 caras en un día), Colaboradores, Roles, Apartados, el ticket de Vender, Proveedores.", demo: una("Las personas", m.avatar.A()), imagenes: img("av.A") },
    { id: "D", tipo: "hoy", nombre: "D · La vista rápida de la prenda (decidida a propósito)", detalle: "El tono por persona de «Historial» (ADR-0354); sin persona, un anillo punteado con «?».", movimiento: "El de la vista rápida (ADR-0136, act. 2026-10-05).", decidida: "ADR-0354 / ADR-0136: la vista rápida tiene movimiento rico por decisión de Felipe. Felipe dice si su avatar se une.", imagenes: img("av.D") },
  ],
};

const spec = {
  titulo: "Unificar · ronda 8 · enlaces, páginas y caras",
  clave: "unificar-ronda8",
  css: "../elegir-ronda6/app.css",
  fotosAlFinal: true,
  estilos: ["../elegir-ronda6/demo.css"],
  guion: "../elegir-ronda6/demo.js",
  claseHtml: readFileSync("../elegir-ronda6/clase.txt", "utf8").trim(),
  nota: "Tres familias cortas que aparecen en casi toda pantalla: los enlaces de texto, el pie de una lista larga y la cara de una persona. Todo lo de «Pruébalo» está VIVO con el CSS real del ERP: pasa el mouse por los enlaces, cambia de página, toca «Ver más», abre la pila de caras, y «Ver en oscuro» (abajo). Las fotos son de los censos del 6 y 7 de octubre. Elige una tarjeta por pregunta; si quieres mezclar, escríbelo en el comentario.",
  familias: [
    { id: "enlace", nombre: "Enlaces de texto", pregunta: "Lo que se toca dentro de un texto para ir a otro lugar.", ayuda: "Un enlace no es un botón: no guarda nada, lleva. Los botones ya están decididos (ronda 4).", grupos: [frase, ver] },
    { id: "paginacion", nombre: "Paginación", pregunta: "Pasar a lo que sigue de una lista larga.", grupos: [pag] },
    { id: "avatar", nombre: "Avatares", pregunta: "La cara de una persona.", grupos: [avatar] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });

// ---------- fragmentos de propuesta para el repo ----------
const DOCS = "../../../../../docs/unificar/propuestas";
const estilo = readFileSync("../elegir-ronda6/demo.css", "utf8");
const guion = readFileSync("../elegir-ronda6/demo.js", "utf8");
const cabecera = (familia, texto) => `<!-- Propuesta de /unificar · familia «${familia}» (ADR-0358) · ronda 8, 2026-10-12. Esperando la elección de Felipe.
     Fragmento: la lámina lo envuelve con el CSS real del ERP, en claro y en oscuro. Solo tokens (var(--color-…)); lo propio va con
     prefijo (pe-/pv- enlace, pg2-/vermas paginación, av-/pila avatar). Lleva su guion para que se pueda tocar. La página de elegir
     (apps/web/unificar/.salida/elegir-ronda8/, fuera de git) tiene además las formas de hoy vivas y las fotos reales.
${texto}
-->
<style>
${estilo}
</style>
`;
const pie = `\n<script>\n${guion}\n</script>\n`;
const opc = (g, id) => g.opciones.find((o) => o.id === id);
const fr = (titulo, o) => `<h3 style="font:500 20px/1.2 var(--font-serif);margin:24px 0 8px">${titulo}</h3>\n<p style="font-size:13px;color:var(--color-taupe);max-width:90ch">${o.movimiento}</p>\n${o.demo}\n`;
writeFileSync(`${DOCS}/enlace.html`, cabecera("enlace", `     La pieza (P1): en una frase, tinta con subrayado tenue; al pasar el mouse un hilo rojo de 1,5 px corre de izquierda a derecha y
     el texto pasa a rojo profundo. Suelto («Ver las 9 →»): tinta de 13 px con la flecha que avanza 3 px y todo en rojo al pasar el
     mouse (la misma acción del título de bloque, ronda 7). P2: btn-enlace con rojo al pasar el mouse / versalitas rojas.`) + fr("En una frase · P1", opc(frase, "P1")) + fr("En una frase · P2", opc(frase, "P2")) + fr("Suelto · P1", opc(ver, "P1")) + pie);
writeFileSync(`${DOCS}/paginacion.html`, cabecera("paginacion", `     La pieza (P1): «1–8 de 64» a la izquierda; números de 13 px en 32 px de lado y la página actual como una píldora de tinta que
     se desliza (320 ms); las filas nuevas entran en cascada; la vista vuelve al inicio de la tabla (ADR-0185). P2: «Ver 8 más» con la
     línea que se llena.`) + fr("P1 · las páginas", opc(pag, "P1")) + fr("P2 · ver más", opc(pag, "P2")) + pie);
writeFileSync(`${DOCS}/avatar.html`, cabecera("avatar", `     La pieza (P1): AvatarPersona en cuatro tamaños fijos (24 · 32 · 40 · 80), iniciales en serif sobre arena, la foto que aparece
     con un fundido, la pila con borde de papel que se abre al pasar el mouse, el punto verde de «de turno». P2: el tono de cada
     persona (ADR-0354) para todos.`) + fr("P1", opc(avatar, "P1")) + fr("P2 · con tono", opc(avatar, "P2")) + pie);
console.log("propuestas escritas en docs/unificar/propuestas/");
