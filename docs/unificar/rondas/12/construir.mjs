// Arma spec.json de la ronda 12 (guardar, editar y las hojas) y llama a elegir.mjs. Usa el CSS real bajado hoy (bajar-css.mjs).
//   node construir.mjs   (desde esta carpeta)
import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "./piezas.mjs";

// Las fotos del censo de hoy (img/<prefijo>-*.png).
const fotos = (prefijo) =>
  existsSync("img")
    ? readdirSync("img")
        .filter((f) => f.startsWith(`${prefijo}-`))
        .sort()
        .map((f) => ({ src: `img/${f}`, pie: f.replace(/^[a-z]+-\d+-/, "").replace(/\.png$/, "").replace(/_/g, " ") }))
    : [];
// elegir.mjs carga un solo guion: el de la ronda 9 (Repetir) y el de esta, juntos.
writeFileSync("guion.js", readFileSync("../elegir-ronda9/demo9.js", "utf8") + "\n" + readFileSync("demo12.js", "utf8"));

const guardar = {
  id: "guardar",
  nombre: "1 · Mientras guarda",
  pregunta: "Tocaste «Guardar». Mientras la base responde, ¿qué hace el botón?",
  ayuda:
    "Hoy hay cuatro maneras, repartidas casi en partes iguales entre 106 botones que guardan: no cambia nada (21), dice «Guardando…» sin moverse (35), corre el hilo de abajo y la palabra se queda (35) o las dos cosas (15). Si la espera pasa de 200 ms, además sale el loader de pantalla completa; lo que se ve en el botón es lo de antes y lo de un guardado rápido. En todos, el botón se apaga para que un doble clic no guarde dos veces. Toca «Guardar»: espera 2 s y vuelve.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · «Guardando…» y el hilo, sin que el botón cambie de ancho (mi recomendación)",
      detalle:
        "La palabra pasa a «Guardando…» y corre el hilo de abajo; el botón guarda su ancho (las dos palabras ocupan el mismo lugar), así nada se corre. Es lo que ya pide la regla del loader (ADR-0149: «los botones conservan su “Guardando…”») más el movimiento de la pieza. La pieza lo hace sola.",
      movimiento: "El hilo que barre abajo mientras espera (1,1 s, en bucle solo mientras guarda: es una señal, como el giro de antes).",
      demo: m.una("Toca «Guardar gasto» y «Guardar cambios»", m.guardarDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Solo el hilo: la palabra se queda",
      detalle: "La palabra no cambia; solo corre el hilo de abajo y el botón se apaga. Más quieto, pero quien no ve el hilo no sabe si apretó.",
      movimiento: "El hilo que barre abajo.",
      demo: m.una("Toca «Guardar gasto»", m.guardarDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: cuatro maneras",
      detalle: "Cada pantalla la suya.",
      movimiento: "Según la pantalla: nada, la palabra, el hilo o las dos.",
      donde: "Toda hoja o pantalla que guarda (106 botones).",
      demo: m.una("Toca cada uno", m.guardarDemos.A()),
      imagenes: fotos("guardar"),
    },
  ],
};

const editar = {
  id: "editar",
  nombre: "2 · Editar algo",
  pregunta: "El botón que abre la edición de algo entero (un proveedor, una orden, una categoría, una prenda en la tabla). ¿Cómo se ve?",
  ayuda:
    "Hoy hay diez caras para lo mismo: el secundario con el lápiz (la ficha de un proveedor, las órdenes, la vista rápida), el secundario sin lápiz (cada marca de la lista), negro (la ficha de un cliente, el detalle de una categoría), versalitas de 10 px (Colores, Etiquetas), sutil chico (Familias, gastos fijos), secundario de 44 px («Corregir conteo»), y en una fila, un lápiz de 32 px sin borde (Productos), uno de 28 px con borde (la ficha de stock), el botón de fila (las metas de Rendimiento) o el enlace (las cuentas de un proveedor). Dentro de una frase o de una hoja, corregir UNA cosa ya es el enlace (ronda 9).",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · El secundario con el lápiz; en una fila, el lápiz solo (mi recomendación)",
      detalle:
        "«Editar» es el botón secundario con el lápiz a la izquierda —nunca negro: editar no es el paso principal de una ficha—. En la cabecera habla en versalitas (lo pone el lugar). En una fila o una tarjeta de una lista (muchas iguales: las marcas, los colores, las prendas de la tabla), es el lápiz solo de 32 px con «Editar …» al pasar el mouse y para el lector. Dentro de una frase, el enlace, como ya se decidió.",
      movimiento: "El de todo botón; el lápiz de la fila se rellena de hueso al pasar el mouse.",
      demo: m.una("La ficha de un proveedor, una tabla y una frase", m.editarDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · El lápiz solo, en todas partes",
      detalle: "Un lápiz de 32 px con borde fino, sin la palabra, en la cabecera, en la fila y en la frase; «Editar …» aparece al pasar el mouse. Más limpio, pero hay que adivinar qué hace el ícono antes de pasar el mouse.",
      movimiento: "El borde se oscurece al pasar el mouse.",
      demo: m.una("La ficha de un proveedor, una tabla y una frase", m.editarDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: diez caras",
      detalle: "Cada pantalla la suya.",
      movimiento: "Según la pieza.",
      donde: "Proveedores, Órdenes de compra e insumos, la vista rápida y la tabla de Productos, Marcas, Colores, Etiquetas, Familias, Categorías, Clientes, Gastos, Conteo, Rendimiento, la ficha de stock, las cuentas de un proveedor.",
      demo: m.una("Así se ven hoy", m.editarDemos.A()),
      imagenes: fotos("editar"),
    },
  ],
};

const cara = {
  id: "cara",
  nombre: "3 · La cara de una hoja",
  pregunta: "Todas las ventanas que se abren sobre la pantalla (las hojas) ¿se ven igual?",
  ayuda:
    "Hoy hay tres caras: crema con sombra y título de 18 px (167 hojas: Categorías, Colores, Roles, Proveedores, Compras, Caja…), papel sin sombra con título serif de 24 px y la frase en taupe (86: Finanzas, Gasto rápido, Nueva clienta, Nuevo producto, Plan de campaña…) y papel con la × (9: Por pagar, la nota de crédito). La entrada es la misma en todas (ADR-0136): el velo, la hoja que sube y crece, la cascada. Toca «Repetir la entrada».",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Papel, sin sombra, título de 24 px (mi recomendación)",
      detalle:
        "Todas como la hoja de Finanzas y de lo más nuevo (Gasto rápido, Nueva clienta, Nuevo producto): el panel en papel, sin sombra —la profundidad la da el velo—, el título serif de 24 px y la frase en taupe. Es la que ya eligió el spike de Finanzas y la que se lee mejor en oscuro.",
      movimiento: "El de toda hoja: velo, sube y crece, la cascada de título, frase y campos.",
      demo: m.una("Dos hojas", m.caraDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Crema con sombra, título de 18 px",
      detalle: "Todas como la de siempre (la de 167 hojas): el panel crema con sombra y el título de 18 px. Finanzas dejaría la cara de su spike.",
      movimiento: "El de P1.",
      demo: m.una("Dos hojas", m.caraDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: tres caras",
      detalle: "Cada módulo la suya.",
      movimiento: "El de toda hoja.",
      donde: "Las 268 hojas del ERP (sin contar la cámara ni el ticket de Vender, que tienen la suya).",
      demo: m.una("Así se ven hoy", m.caraDemos.A()),
      imagenes: fotos("cara"),
    },
  ],
};

const ancho = {
  id: "ancho",
  nombre: "4 · Cuánto mide una hoja",
  pregunta: "Hoy las hojas tienen 22 anchos distintos. ¿Cuántos debería haber?",
  ayuda:
    "Una hoja angosta para lo corto y una ancha para lo que se lee: casi siempre basta. Hoy la de fábrica mide 384 px (110 hojas) y hay más de veinte medidas sueltas entre 448 y 1 080 px. Las que tienen un diseño propio (la vista rápida de un producto, la ficha de un cliente, Nueva orden de producción) conservarían el suyo.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Tres anchos: angosta, mediana y ancha (mi recomendación)",
      detalle: "448 px para un formulario corto (la mayoría), 576 px para uno con una lista o una tabla chica, 768 px para una ficha que se lee. La hoja recibe un nombre (angosta, mediana, ancha), no una medida: así nadie inventa otra.",
      movimiento: "No cambia.",
      demo: m.una("Los tres anchos", m.anchoDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Dos anchos: angosta y ancha",
      detalle: "448 px para todo formulario y 720 px para todo lo que se lee o lleva una tabla. Más simple; algunas hojas medianas de hoy quedarían o apretadas o con aire.",
      movimiento: "No cambia.",
      demo: m.una("Los dos anchos", m.anchoDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: 22 anchos",
      detalle: "Cada hoja elige su medida.",
      movimiento: "No cambia.",
      donde: "Las 268 hojas.",
      demo: m.una("Los anchos de hoy, con cuántas hojas lo usan", m.anchoDemos.A()),
      imagenes: [],
    },
  ],
};

const salida = {
  id: "salida",
  nombre: "5 · Cómo se sale de una hoja",
  pregunta: "¿Toda hoja tiene una salida a la vista?",
  ayuda:
    "En la ronda 4 se decidió que una hoja que no guarda nada se cierra con la × de arriba, nunca con un «Cerrar» al pie. Pero hoy hay hojas que solo se leen y no tienen ninguna salida a la vista —Movimientos de la caja, Ventas de hoy, Actividad del equipo, Campañas archivadas—: se sale con Escape o tocando afuera, que en el celular no siempre se alcanza. Las que guardan salen con «Cancelar» (ronda 11).",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Una salida, siempre a la vista: la × si solo se lee, «Cancelar» si guarda (mi recomendación)",
      detalle:
        "Toda hoja que no guarda lleva la × arriba a la derecha; toda hoja que guarda sale con «Cancelar» en su pie, sin la × (dos salidas para lo mismo sobran). Escape y tocar afuera siguen funcionando en todas. Es la regla de las rondas 4 y 11, completada.",
      movimiento: "La × se tiñe de rojo al pasar el mouse.",
      demo: m.una("Una hoja que se lee y una que guarda", m.salidaDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · La × en todas, también en las que guardan",
      detalle: "Toda hoja lleva la × arriba; las que guardan, además, «Cancelar» al pie. Siempre se sale en el mismo lugar, pero un formulario tiene dos botones para lo mismo.",
      movimiento: "El de P1.",
      demo: m.una("Una hoja que se lee y una que guarda", m.salidaDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: depende de la hoja",
      detalle: "42 hojas con la ×; una veintena que solo se leen no tienen ninguna salida a la vista.",
      movimiento: "La × se tiñe de rojo.",
      donde: "Movimientos de la caja, Ventas de hoy, Actividad del equipo, Campañas archivadas, Recepciones recientes, la lista de opciones de un comprobante…",
      demo: m.una("Así se ven hoy", m.salidaDemos.A()),
      imagenes: fotos("salida"),
    },
  ],
};

const spec = {
  titulo: "Unificar · ronda 12 · guardar, editar y las hojas",
  clave: "unificar-ronda12",
  css: "app.css",
  fotosAlFinal: true,
  estilos: ["../elegir-ronda9/demo9.css", "demo12.css"],
  guion: "guion.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "Lo que queda de los botones de una sola función (guardar y editar) y las hojas que se abren sobre la pantalla. Todo lo de «Pruébalo» está VIVO con el CSS real del ERP de hoy: nada se guarda. Elige una tarjeta por pregunta; si quieres mezclar, escríbelo en el comentario.",
  familias: [
    { id: "accion.guardar", nombre: "Guardar", pregunta: "El botón que guarda, mientras espera a la base.", grupos: [guardar] },
    { id: "accion.editar", nombre: "Editar", pregunta: "Abrir la edición de algo entero.", grupos: [editar] },
    { id: "modal", nombre: "Las hojas", pregunta: "Las ventanas que se abren sobre la pantalla: su cara, su ancho y su salida.", grupos: [cara, ancho, salida] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });
