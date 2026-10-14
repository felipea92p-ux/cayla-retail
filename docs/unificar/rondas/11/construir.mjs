// Arma spec.json de la ronda 11 (cancelar, limpiar, imprimir) y llama a elegir.mjs. Usa el CSS real bajado hoy (bajar-css.mjs).
//   node construir.mjs   (desde esta carpeta)
import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "./piezas.mjs";

// Las fotos del censo de hoy (img/<prefijo>-*.png), en el orden en que las copió fotos.mjs.
const fotos = (prefijo) =>
  existsSync("img")
    ? readdirSync("img")
        .filter((f) => f.startsWith(`${prefijo}-`))
        .sort()
        .map((f) => ({ src: `img/${f}`, pie: f.replace(/^[a-z]+-\d+-/, "").replace(/\.png$/, "").replace(/_/g, " ") }))
    : [];
// elegir.mjs carga un solo guion: el de la ronda 9 (Repetir, listas) y el de esta, juntos.
writeFileSync("guion.js", readFileSync("../elegir-ronda9/demo9.js", "utf8") + "\n" + readFileSync("demo11.js", "utf8"));

const cancelar = {
  id: "cancelar",
  nombre: "1 · Cancelar: salir de una hoja sin guardar",
  pregunta: "En el pie de una hoja, ¿cómo se ve «Cancelar» y dónde va respecto del botón que guarda?",
  ayuda:
    "Hoy hay cinco caras: dos mitades iguales (Caja, Vender, Colaboradores y casi todas las hojas angostas), cada botón a su medida a la derecha (Categorías, Colores, Configuración, la ficha del producto), un «Cancelar» sutil sin borde (Nueva compra, Roles), versalitas sueltas DESPUÉS de «Guardar» (Editar marca) y el del flujo del mostrador en versalitas de 48 px. Toca los botones: ninguno guarda.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · A su medida, a la derecha, «Cancelar» antes de «Guardar» (mi recomendación)",
      detalle:
        "«Cancelar» es el botón secundario del sistema, del ancho de su palabra, y va a la IZQUIERDA del que guarda; los dos juntos a la derecha del pie. Lo que borra o desactiva va solo a la izquierda (como Categorías hoy). En el celular (menos de 640 px) los dos se reparten la fila en mitades, que se tocan mejor con el dedo. El flujo del mostrador (Cambios, Devoluciones) conserva su alto de 48 px.",
      movimiento: "El de todo botón: sube con sombra y cruza la luz al pasar el mouse, se encoge al presionar, la onda donde tocaste.",
      demo: m.una("Pie de una hoja angosta, de una ancha y a 375 px", m.cancelarDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Siempre dos mitades iguales",
      detalle:
        "«Cancelar» y el botón que guarda se reparten la fila en mitades iguales en toda hoja, como hoy en Caja y Vender. Lo que borra o desactiva queda a la izquierda y las mitades ocupan el resto. Pesa más «Cancelar» (es tan ancho como «Guardar»), y en una hoja ancha los botones quedan largos.",
      movimiento: "El de P1.",
      demo: m.una("Pie de una hoja angosta, de una ancha y a 375 px", m.cancelarDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: cinco caras",
      detalle: "Mitades, a su medida, sutil sin borde, versalitas sueltas después de «Guardar» y el del flujo del mostrador.",
      movimiento: "Los del sistema tienen el movimiento de todo botón; las versalitas sueltas solo cambian de color.",
      donde: "Mitades: ~50 hojas · a su medida: ~25 · sutil: Nueva compra, Roles, Nuevo producto · versalitas: Editar marca, la decisión de un faltante · flujo: Cambios, Devoluciones.",
      demo: m.una("Así se ven hoy", m.cancelarDemos.A()),
      imagenes: fotos("can"),
    },
  ],
};

const limpiar = {
  id: "limpiar",
  nombre: "2 · Limpiar los filtros puestos",
  pregunta: "Bajo el buscador de una lista, los filtros que pusiste se ven en una fila y al final se limpian todos de una vez. ¿Cómo se ve esa fila?",
  ayuda:
    "Hoy cada filtro puesto es una pastilla en versalitas de 10 px con su ×, y «LIMPIAR TODO» unas versalitas grises que se ponen rojas (Compras, Historial de ventas, Productos, Existencias, Recibidas). En los vacíos ya decidiste otra cara para lo mismo (ronda 5): la píldora de tinta con su ✕. En la hoja de filtros del celular, «Limpiar» es sutil en un lado y secundario en otro; Frescura dice «Quitar filtros»; y en el calendario de una fecha y en «Pagar juntos» de Por pagar (quita lo marcado), «LIMPIAR» va en versalitas. Toca un filtro o «Limpiar todo».",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · La píldora de los vacíos y «Limpiar todo» como enlace (mi recomendación)",
      detalle:
        "Cada filtro puesto es la píldora que ya está en los vacíos (tinta, con su ✕, pasa a rojo profundo al apuntarla). Al final, «Limpiar todo» es el enlace del sistema, en letra normal: se lee como una acción chica que no compite con los filtros. El verbo es siempre «Limpiar» + qué («Limpiar todo» si también borra la búsqueda, «Limpiar filtros» si no); nunca «Quitar filtros». En la hoja del celular, «Limpiar» es el secundario, como «Cancelar». En el calendario de una fecha y en «Pagar juntos», «Limpiar» es el mismo enlace (y «Hoy», su vecino del calendario, también).",
      movimiento: "La píldora se encoge al presionarla y se va; «Limpiar todo» las quita en cascada (55 ms). El enlace corre su hilo rojo al pasar el mouse.",
      demo: m.una("Toca un filtro o «Limpiar todo»", m.limpiarDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · La misma píldora y «Limpiar todo» como una píldora punteada",
      detalle:
        "Los filtros puestos, igual que P1. «Limpiar todo» es una píldora más, punteada y con el embudo tachado, como «+ Atajo» de Historial: se ve como parte de la fila. Pesa un poco más que el enlace.",
      movimiento: "El de P1; la píldora punteada calienta su borde al pasar el mouse.",
      demo: m.una("Toca un filtro o «Limpiar todo»", m.limpiarDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: pastillas en versalitas y «LIMPIAR TODO» gris",
      detalle: "Una cara distinta de la que ya está en los vacíos; en el celular, «Limpiar» sutil o secundario; en Frescura, «Quitar filtros» como enlace; en el calendario y en «Pagar juntos», versalitas.",
      movimiento: "Cambian de color al pasar el mouse (a rojo); no se mueven.",
      donde: "Compras, Por pagar, Historial de ventas, Productos, Existencias, Recibidas · Frescura y Movimientos (enlace) · el calendario de toda fecha · «Pagar juntos».",
      demo: m.una("Así se ven hoy", m.limpiarDemos.A()),
      imagenes: fotos("lim"),
    },
  ],
};

const imprimir = {
  id: "imprimir",
  nombre: "3 · Imprimir",
  pregunta: "El botón que abre el cuadro de impresión (el ticket, las etiquetas, la orden). ¿Cómo se ve y qué dice?",
  ayuda:
    "Hoy hay cuatro caras y varios textos: negro con la impresora (después de vender, apartados, rótulos, la guía del traslado), secundario con la impresora (las órdenes de compra e insumos, el plan), sin la impresora (las etiquetas de un producto recién creado, la orden recibida) y el del ticket de un cambio, hecho a mano; dice «Imprimir o guardar PDF», «Imprimir o guardar en PDF», «Guía» o «Imprimir y nueva venta». Toca los botones: no se imprime nada.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Siempre con la impresora, «Imprimir» + qué; negro solo si imprimir ES el paso (mi recomendación)",
      detalle:
        "Una pieza, <BotonImprimir>: la impresora a la izquierda y el texto «Imprimir» + qué («Imprimir ticket», «Imprimir etiquetas», «Imprimir la orden»). Es negro cuando imprimir es lo que toca hacer ahí (el ticket después de vender, las etiquetas de un producto recién creado); en el resto, secundario. Que también sirve para guardar en PDF se dice en la frase de al lado, no en el botón.",
      movimiento: "El de todo botón y, propio de imprimir, la hoja SALE de la impresora (baja 2 px) al pasar el mouse, como la flecha de descargar baja.",
      demo: m.una("Pasa el mouse por los botones", m.imprimirDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · La misma pieza, siempre secundaria",
      detalle: "La cara y el texto de P1, pero nunca negro: el negro queda para lo que guarda o cobra. Después de vender, «Imprimir ticket» pesa lo mismo que «Nueva venta».",
      movimiento: "El de P1.",
      demo: m.una("Pasa el mouse por los botones", m.imprimirDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: cuatro caras y varios textos",
      detalle: "Con y sin impresora, negro o secundario según la pantalla, uno hecho a mano y el texto cambia en cada lado.",
      movimiento: "Los del sistema tienen el movimiento de todo botón; el del ticket de cambio solo cambia el borde.",
      donde: "Vender (después de cobrar, el detalle de una venta), Apartados, Cambios, Rótulos, Traslados, Órdenes de compra e insumos, el plan de campaña, Producto creado, Etiquetas.",
      demo: m.una("Así se ven hoy", m.imprimirDemos.A()),
      imagenes: fotos("imp"),
    },
  ],
};

const spec = {
  titulo: "Unificar · ronda 11 · cancelar, limpiar e imprimir",
  clave: "unificar-ronda11",
  css: "app.css",
  fotosAlFinal: true,
  estilos: ["../elegir-ronda9/demo9.css", "demo11.css"],
  guion: "guion.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "Los tres botones de una sola función que quedaban con caras distintas. Todo lo de «Pruébalo» está VIVO con el CSS real del ERP de hoy (nada se guarda ni se imprime). Las fotos son del censo de hoy. Elige una tarjeta por pregunta; si quieres mezclar, escríbelo en el comentario.",
  familias: [
    { id: "accion.cancelar", nombre: "Cancelar", pregunta: "Salir de una hoja sin guardar.", grupos: [cancelar] },
    { id: "accion.limpiar", nombre: "Limpiar los filtros", pregunta: "Quitar todos los filtros puestos de una vez.", grupos: [limpiar] },
    { id: "accion.imprimir", nombre: "Imprimir", pregunta: "Abrir el cuadro de impresión.", grupos: [imprimir] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });
