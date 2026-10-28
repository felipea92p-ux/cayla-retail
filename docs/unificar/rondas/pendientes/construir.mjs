// Pendientes de /unificar (2026-10-14): la cabecera de las pantallas sin decidir, el ícono de «Etiquetas» y el «Ver» de una fila.
//   node construir.mjs   (desde esta carpeta; antes, cabeceras.mjs [oscuro] desde apps/web)
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "./piezas.mjs";

const NOMBRE = { compras: "Compras ▸ Facturas", "por-pagar": "Compras ▸ Por pagar", recibir: "Recibir mercadería", produccion: "Producción ▸ Resumen", categorias: "Catálogo ▸ Categorías", atributos: "Catálogo ▸ Atributos", configuracion: "Configuración", rendimiento: "Rendimiento", etiquetas: "Etiquetas de precio" };
const OPERATIVAS = ["compras", "por-pagar", "recibir", "produccion", "categorias", "atributos"];
const GESTION = ["configuracion", "rendimiento", "etiquetas"];
const foto = (id, cual) => (existsSync(`img/${id}-${cual}-claro.png`) ? [{ src: `img/${id}-${cual}-claro.png`, pie: NOMBRE[id] }] : []);
writeFileSync("guion.js", readFileSync("../elegir-ronda9/demo9.js", "utf8"));

const cabecera = {
  id: "cabecera",
  nombre: "1 · La cabecera de cada pantalla",
  pregunta: "Inventario, Productos, Vender, Caja, Clientes y Colaboradores ya tienen la misma cabecera. ¿Cuál llevan las que todavía no?",
  ayuda:
    "Hoy hay cuatro: la de Inventario y Vender (sede y fecha con el hilo, el título de 46 px con el nombre del menú, la frase y a la derecha sus botones), la de Finanzas (sobretítulo rojo y título de 30 px; también la usan Configuración, Rendimiento, Etiquetas de precio y Actividad), una propia de Compras y Recibir (versalitas grises y título de 24 px) y otras de Producción, Categorías y Atributos. Las fotos de «Propuesta» son las pantallas de hoy con la cabecera cambiada en el navegador: mismos botones y misma frase. Finanzas conserva la suya (es su spike, ADR-0195).",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · La de Inventario en todas (menos Finanzas) (mi recomendación)",
      detalle: "Compras, Recibir, Producción, Categorías, Atributos y también Configuración, Rendimiento, Etiquetas de precio y Actividad llevan la cabecera de Inventario: arriba la sede y la fecha con su hilo, el nombre del menú en grande, la frase y los botones a la derecha. Una sola cabecera en todo el ERP; Finanzas sigue con la de su spike. En Producción el título pasa a «Resumen» y la pregunta, a la frase.",
      movimiento: "La de hoy de Inventario: el título y la frase suben al entrar; los botones, un paso después.",
      imagenes: [...OPERATIVAS, ...GESTION].flatMap((id) => foto(id, "propuesta")),
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · La de Inventario en la tienda y el taller; la de Finanzas en lo de gestión",
      detalle: "Compras, Recibir, Producción, Categorías y Atributos llevan la de Inventario. Configuración, Rendimiento, Etiquetas de precio y Actividad se quedan con la de Finanzas (sobretítulo rojo, título de 30 px): se lee «esto es de administrar», como Finanzas.",
      movimiento: "El de cada una.",
      imagenes: [...OPERATIVAS.flatMap((id) => foto(id, "propuesta")), ...GESTION.flatMap((id) => foto(id, "hoy"))],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: cuatro cabeceras",
      detalle: "Cada módulo con la suya.",
      movimiento: "Suben al entrar.",
      donde: "Compras (Facturas, Por pagar, Proveedores, Notas de crédito, Órdenes), Recibir, Producción, Categorías, Atributos, Configuración, Rendimiento, Etiquetas de precio, Actividad.",
      imagenes: [...OPERATIVAS, ...GESTION].flatMap((id) => foto(id, "hoy")),
    },
  ],
};

const etiquetas = {
  id: "etiquetas",
  nombre: "2 · El ícono de «Etiquetas»",
  pregunta: "«Etiquetas» lleva a la pantalla de etiquetas de precio. En Productos tiene la impresora y en Existencias, la etiqueta. ¿Cuál lleva?",
  ayuda: "Desde la ronda 11, la impresora dice «esto imprime ahora» (el botón «Imprimir» de todo el ERP). «Etiquetas» no imprime ahí: lleva a la pantalla donde se elige cuántas y se imprime.",
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · La etiqueta en los dos (mi recomendación)", detalle: "El ícono de la etiqueta en Productos y en Existencias; la impresora queda solo para lo que imprime en ese momento.", movimiento: "El de todo botón.", demo: m.una("Así se verían", m.etiquetasDemos.P1()), imagenes: [] },
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · La impresora en los dos", detalle: "La impresora en Productos y en Existencias: se lee «aquí empieza a imprimirse».", movimiento: "El de todo botón y la hoja que sale de la impresora.", demo: m.una("Así se verían", m.etiquetasDemos.P2()), imagenes: [] },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy: uno distinto en cada lado", detalle: "La impresora en Productos (tabla y vista rápida) y la etiqueta en Existencias.", movimiento: "El de todo botón.", donde: "Catálogo ▸ Productos, Inventario ▸ Existencias.", demo: m.una("Así se ven hoy", m.etiquetasDemos.A()), imagenes: [] },
  ],
};

const ver = {
  id: "ver-fila",
  nombre: "3 · «Ver» al lado de una fila",
  pregunta: "En Caja, cada pendiente del turno («2 ventas sin comprobante») tiene un «Ver» que lleva a resolverlo. ¿Cómo se ve?",
  ayuda: "Hoy es un botoncito de 24 px hecho a mano. El botón de «ver en otra pantalla» de la ronda 10 (secundario con la flecha) chico mide 44 px y agranda cada fila; el «Ver las 9 →» rojo gasta el rojo en cada fila.",
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · El enlace del sistema (mi recomendación)", detalle: "«Ver» como el enlace en letra normal (subrayado tenue; el hilo rojo corre al pasar el mouse). La fila no crece y se lee como una acción chica.", movimiento: "El hilo que se llena al pasar el mouse.", demo: m.una("Pasa el mouse por «Ver»", m.verDemos.P1()), imagenes: [] },
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · El botón de ver en otra pantalla, chico", detalle: "El secundario con la flecha que avanza (ronda 10), en su tamaño chico: igual que en el resto del ERP, pero cada fila crece a 44 px.", movimiento: "El de todo botón y la flecha que avanza.", demo: m.una("Pasa el mouse por «Ver»", m.verDemos.P2()), imagenes: [] },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy: un botoncito de 24 px", detalle: "Borde arena, 11 px en seminegrita.", movimiento: "El borde cambia al pasar el mouse.", donde: "Caja ▸ Pendientes del turno.", demo: m.una("Así se ve hoy", m.verDemos.A()), imagenes: [] },
  ],
};

const spec = {
  titulo: "Unificar · pendientes · cabeceras, «Etiquetas» y «Ver»",
  clave: "unificar-pendientes-cabeceras",
  css: "app.css",
  fotosAlFinal: false,
  estilos: ["../elegir-ronda9/demo9.css", "demo-pe.css"],
  guion: "guion.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "Tres pendientes antes de la ronda 12. La cabecera se elige con fotos de las pantallas de hoy (la propuesta está armada en el navegador, sin tocar el código). Las otras dos tienen demos vivas con el CSS real del ERP. Elige una tarjeta por pregunta; si quieres mezclar, escríbelo en el comentario.",
  familias: [
    { id: "titulo-pagina", nombre: "La cabecera de una pantalla", pregunta: "Lo primero que se ve de cada pantalla.", grupos: [cabecera] },
    { id: "icono.etiquetas", nombre: "El ícono de «Etiquetas»", pregunta: "Ir a imprimir etiquetas de precio.", grupos: [etiquetas] },
    { id: "accion.ver-fila", nombre: "«Ver» en una fila", pregunta: "Lo que lleva a resolver un pendiente.", grupos: [ver] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });
