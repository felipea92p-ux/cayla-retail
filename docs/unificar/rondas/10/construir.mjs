// Arma spec.json de la ronda 10 (descargar, filtros, ver en otra pantalla) y llama a elegir.mjs. Usa el CSS real bajado en la ronda 9.
//   node construir.mjs   (desde esta carpeta)
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "./piezas.mjs";

const foto = (archivo, pie) => (existsSync(`img/${archivo}`) ? [{ src: `img/${archivo}`, pie }] : []);
// elegir.mjs carga un solo guion: el de la ronda 9 (Repetir, listas) y el de esta, juntos.
writeFileSync("guion.js", readFileSync("../elegir-ronda9/demo9.js", "utf8") + "\n" + readFileSync("demo10.js", "utf8"));

const descargar = {
  id: "descargar",
  nombre: "1 · Bajar un archivo (Exportar / Descargar)",
  pregunta: "Cuando la pantalla te da la lista en un archivo para abrir en Excel, ¿cómo se ve el botón y qué dice?",
  ayuda: "Hoy hay cuatro caras y dos verbos para lo mismo: «DESCARGAR EXCEL» en Finanzas (sin ícono), «EXPORTAR MES» en Compras (con ícono), «Exportar CSV» en Existencias, un «EXPORTAR» hecho a mano en Historial de ventas y «Descargar reporte de este ajuste» en versalitas grises. Toca los botones de cada demo (no se descarga nada).",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · «Descargar» + qué, con su flecha que baja (mi recomendación)",
      detalle: "Un solo verbo, el de la tienda: «Descargar Excel», «Descargar CSV», «Descargar reporte del ajuste» (quien no usa computadora entiende «descargar» antes que «exportar»). La cara es la del botón secundario del sistema con el ícono de descarga a la izquierda; en la cabecera de una pantalla habla en versalitas, en una hoja en letra normal (las dos voces de la ronda 4). Nunca solo un ícono.",
      movimiento: "El de todo botón (sube, la luz cruza, se encoge al presionar, la onda) y, propio de descargar, la flecha BAJA 2 px al pasar el mouse. Mientras se arma el archivo, el hilo barre en el borde de abajo (como «Guardando…»).",
      demo: m.una("Toca «Descargar …»", m.descargar.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · La misma cara, cada pantalla con su palabra",
      detalle: "La cara y el movimiento de P1, pero cada pantalla conserva su texto («Exportar mes», «Exportar CSV», «Descargar Excel»). Unifica cómo se ve, no cómo se dice.",
      movimiento: "El de P1.",
      demo: m.una("Toca los botones", m.descargar.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: cuatro caras, dos verbos",
      detalle: "Con y sin ícono, en versalitas o en letra normal, uno hecho a mano y otro como enlace gris.",
      movimiento: "Los de botón del sistema tienen el movimiento de todo botón; el de Historial y el del ajuste solo cambian de color.",
      donde: "Finanzas (reportes, balance, campañas), Compras, Existencias, Historial de ventas, Clientes, Movimientos, el ajuste de inventario y el plan de campaña (solo ícono).",
      demo: m.una("Así se ven hoy", m.descargar.A()),
      imagenes: [...foto("exp-A.png", "Finanzas"), ...foto("exp-D.png", "Compras"), ...foto("exp-B.png", "Existencias"), ...foto("exp-C.png", "Historial de ventas")],
    },
  ],
};

const filtros = {
  id: "filtros",
  nombre: "2 · El botón que abre los filtros",
  pregunta: "Junto al buscador de una lista, el botón «Filtros» abre el panel con las píldoras. ¿Cómo se ve, y cómo dice cuántos filtros hay puestos?",
  ayuda: "Es una sola pieza (BotonFiltros) con dos caras: «FILTROS · 1» en versalitas (Productos, Compras, Por pagar, Historial) y un cuadrado solo ícono con un globito negro (Existencias). Desde la ronda 6, las píldoras que abre hablan en letra normal: el botón quedó en otra voz. Tócalo en cada demo.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Una píldora más, con su número en el globito (mi recomendación)",
      detalle: "«Filtros» con la cara de las píldoras que abre: borde arena, su ícono y su nombre en letra normal; abierto, borde tinta y la flecha roja. Cuántos filtros hay puestos va en el globito de los títulos y las pestañas (ronda 9). Existencias usa la misma pieza; en el celular queda solo el ícono con su punto, como las demás píldoras.",
      movimiento: "El de toda píldora: el borde se calienta al pasar el mouse; abierta, borde tinta y la flecha gira y se pone roja; el panel cae. El globito entra subiendo cuando se pone el primer filtro.",
      demo: m.una("Toca «Filtros»", m.filtros.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Las versalitas de hoy, con el globito",
      detalle: "«FILTROS» se queda en versalitas; el «· 1» pasa al globito. Existencias conserva su cuadrado solo ícono.",
      movimiento: "Cambia de color al pasar el mouse; abierto se rellena apenas.",
      demo: m.una("Toca «Filtros»", m.filtros.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: versalitas con «· 1» y el cuadrado de Existencias",
      detalle: "Dos caras de la misma pieza, y el número de dos maneras («· 1» escrito o un globito negro arriba a la derecha).",
      movimiento: "Cambia de color al pasar el mouse; ninguno se mueve.",
      donde: "Productos, Compras, Por pagar, Historial de ventas (versalitas) · Existencias (cuadrado).",
      demo: m.una("Así se ven hoy", m.filtros.A()),
      imagenes: [...foto("fil-A.png", "Productos (puesto)"), ...foto("fil-B.png", "Compras"), ...foto("fil-C.png", "Existencias"), ...foto("fil-E.png", "Existencias con un filtro")],
    },
  ],
};

const ver = {
  id: "ver",
  nombre: "3 · Llevar a ver algo en otra pantalla",
  pregunta: "Un botón que no guarda nada: te lleva a ver la prenda en Existencias, el impuesto en Facturación, la ficha del proveedor. ¿Cómo se ve?",
  ayuda: "Hoy pesa distinto en cada lado: negro con ícono («Ver en Existencias»), sutil («Ver en Facturación»), secundario («Ver qué falta») y negro con la flecha escrita («Abrir ficha completa →»). El negro dice «esto es lo principal de aquí», y llevar a otra pantalla casi nunca lo es. Lo que ya está decidido no cambia: dentro de una frase es el enlace (ronda 8) y junto a un resumen, «Ver las 9 →» en versalitas rojas.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Botón secundario con la flecha que avanza (mi recomendación)",
      detalle: "Siempre el botón secundario del sistema, con la flecha a la derecha: se ve que LLEVA, sin competir con el botón negro de la pantalla. Nunca negro, nunca con «→» escrito.",
      movimiento: "El de todo botón y la flecha que avanza 4 px al pasar el mouse (ya lo hace todo botón con flecha).",
      demo: m.una("Pasa el mouse por las acciones", m.ver.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Siempre «Ver …» en versalitas rojas (EnlaceVer)",
      detalle: "La misma pieza que «Ver las 9 →»: versalitas rojas con su flecha. Muy reconocible, pero gasta el rojo (el acento, máximo 2 por pantalla) en cada tarjeta.",
      movimiento: "La flecha avanza al pasar el mouse.",
      demo: m.una("Pasa el mouse por las acciones", m.ver.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: cuatro pesos",
      detalle: "Negro, sutil, secundario y negro con flecha escrita, según la pantalla.",
      movimiento: "El de todo botón (la flecha escrita no se mueve).",
      donde: "Catálogo ▸ Productos, Finanzas ▸ Impuestos, Análisis, Proveedores, Configuración.",
      demo: m.una("Así se ven hoy", m.ver.A()),
      imagenes: [...foto("ver-J.png", "Productos"), ...foto("ver-G.png", "Impuestos"), ...foto("ver-M.png", "Análisis"), ...foto("ver-O.png", "Proveedores")],
    },
  ],
};

const spec = {
  titulo: "Unificar · ronda 10 · descargar, filtros y ver",
  clave: "unificar-ronda10",
  css: "../elegir-ronda9/app.css",
  fotosAlFinal: true,
  estilos: ["../elegir-ronda9/demo9.css", "demo10.css"],
  guion: "guion.js",
  claseHtml: readFileSync("../elegir-ronda9/clase.txt", "utf8").trim(),
  nota: "Tres botones de una sola función que hoy se ven distinto según la pantalla. Todo lo de «Pruébalo» está VIVO con el CSS real del ERP (nada se guarda ni se descarga). Las fotos son del censo de hoy. Elige una tarjeta por pregunta; si quieres mezclar, escríbelo en el comentario.",
  familias: [
    { id: "accion.exportar", nombre: "Descargar un archivo", pregunta: "Bajar la lista o un reporte.", grupos: [descargar] },
    { id: "accion.filtrar", nombre: "Abrir los filtros", pregunta: "El botón que abre el panel de filtros de una lista.", grupos: [filtros] },
    { id: "accion.ver", nombre: "Ver en otra pantalla", pregunta: "Lo que lleva, sin guardar nada.", grupos: [ver] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });
