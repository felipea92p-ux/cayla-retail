// Arma spec.json de la ronda 17 (elegir el mes, el cajón lateral, el paso de cantidad y el anterior/siguiente de un paso a paso)
// y llama a elegir.mjs.   node construir.mjs   (desde esta carpeta, después de fotos.mjs)
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "./piezas.mjs";

const foto = (archivo, pie) => (existsSync(`img/${archivo}`) ? [{ src: `img/${archivo}`, pie }] : []);
writeFileSync("guion.js", readFileSync("../elegir-ronda9/demo9.js", "utf8"));

const mes = {
  id: "mes",
  nombre: "1 · Elegir el mes",
  pregunta: "Dos pantallas eligen el mes de dos formas. ¿Cuál queda para todo el ERP?",
  ayuda: "El Historial de cierres de Caja usa «‹ Octubre 2026 ›», la que elegiste el 12: las flechas pasan al mes de al lado y, al tocar el nombre, se abren los doce meses (los que todavía no llegan, con su candado). Comprobantes (Emitidos y Proformas) usa «← SEPTIEMBRE · Octubre 2026 · NOVIEMBRE →»: los vecinos con su nombre, en versalitas hechas a mano y con las flechas escritas. Finanzas elige el mes con su combo y queda aparte (ADR-0195).",
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · «‹ Octubre 2026 ›» en todas (mi recomendación)", detalle: "La del Historial de cierres, tal cual, también en Comprobantes: un mes con las flechas y cualquier mes del año en dos toques. Desde el mes de hoy la flecha de la derecha se apaga.", movimiento: "La píldora de cada flecha se tiñe al pasar el mouse; la lista de meses entra con el revelar de los combos (240 ms).", demo: m.una("Pásale el mouse", m.demoMes("P1")), imagenes: [...foto("mes-A-01-caja.png", "Historial de cierres (hoy)"), ...foto("mes-P1-04-vender_comprobantes_emitidos.png", "Comprobantes, con P1 aplicada")] },
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · Los vecinos con su nombre, en todas", detalle: "La de Comprobantes, pero con las piezas del sistema: dos botones secundarios chicos «‹ Septiembre» y «Noviembre ›» y el mes en serif al medio. Se lee adónde se va, pero un mes lejano se alcanza mes a mes.", movimiento: "El de todo botón: sube 2 px y la flecha avanza al pasar el mouse.", demo: m.una("Pásale el mouse", m.demoMes("P2")), imagenes: [...foto("mes-P2-05-caja.png", "Historial de cierres, con P2 aplicada"), ...foto("mes-P2-06-vender_comprobantes_emitidos.png", "Comprobantes, con P2 aplicada")] },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy: dos formas", detalle: "La píldora en Caja y los vecinos en versalitas a mano (con «←» y «→» escritos) en Comprobantes.", movimiento: "—", demo: m.una("Como están", m.demoMes("A")), imagenes: [...foto("mes-A-01-caja.png", "Historial de cierres"), ...foto("mes-A-02-vender_comprobantes_emitidos.png", "Comprobantes ▸ Emitidos"), ...foto("mes-A-03-finanzas_reportes_presupuest.png", "Finanzas (queda aparte)")] },
  ],
};

const cajon = {
  id: "cajon",
  nombre: "2 · El cajón lateral",
  pregunta: "Siete cajones entran por la derecha con el detalle de algo, con tres caras. ¿Cuál queda?",
  ayuda: "Todos comparten el marco y el movimiento (entran 28 px desde la derecha, 380 ms) y su Escape. Cambian el ancho (432, 456, 472 y 544 px), el título (23, 24 y 26 px), la × (tres dibujos) y la cabecera: los cuatro de Compras (Por pagar, Recepciones, Proveedores, Notas de crédito) llevan una banda con el círculo de iniciales, el nombre en versalitas y el título, y un pie con sus acciones y «1 de 2» con flechas; Movimientos y Colaboradores no tienen banda (el título va adentro, con su sello o su foto grande) ni pie; la orden de Producción tiene banda, otra × y otro pie. La vista rápida de Productos es una hoja al centro (ADR-0136) y queda aparte.",
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · La banda de Compras en todos (mi recomendación)", detalle: "Una pieza <Cajon>: banda arriba con el avatar (o el sello de Movimientos, o el ícono del aparato), el nombre en versalitas y el título serif de 24; la × del sistema (la de las hojas); el pie con las acciones y, si la lista lo permite, «3 de 12» con ↑ ↓. Dos anchos con nombre: 456 y 544 (la orden). Movimientos y Colaboradores ganan su banda y su pie; el círculo de iniciales a mano pasa a <AvatarPersona>.", movimiento: "El de hoy: entra desde la derecha y, al pasar de un registro a otro con ↑ ↓, el contenido se reacomoda sin cerrar el cajón.", demo: m.una("Un comprobante por pagar, de ejemplo", m.cajon("P1")), imagenes: foto("cajon-A-07-compras_por_pagar.png", "Así es hoy en Por pagar") },
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · La cara de las hojas, de costado", detalle: "Sin banda: el título serif de 24 con su frase en taupe y la × arriba a la derecha, como una hoja al centro (<Modal conCerrar>); el mismo pie con acciones y flechas. Los mismos dos anchos. Los cuatro de Compras pierden la banda y el círculo; Movimientos y Colaboradores quedan casi como hoy.", movimiento: "El mismo.", demo: m.una("El mismo comprobante", m.cajon("P2")), imagenes: [...foto("cajon-A-08-inventario_movimientos.png", "Así es hoy en Movimientos"), ...foto("cajon-A-09-colaboradores.png", "Así es hoy en Colaboradores")] },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy: tres caras", detalle: "Con banda (Compras), sin banda (Movimientos, Colaboradores) y la de la orden de Producción (sin foto: la base local no tiene órdenes).", movimiento: "—", demo: null, imagenes: [...foto("cajon-A-07-compras_por_pagar.png", "Por pagar"), ...foto("cajon-A-08-inventario_movimientos.png", "Movimientos"), ...foto("cajon-A-09-colaboradores.png", "Colaboradores")] },
  ],
};

const paso = {
  id: "paso",
  nombre: "3 · El paso de cantidad («− 1 +»)",
  pregunta: "Hay 23 controles para subir o bajar una cantidad, con siete caras y ninguna pieza. ¿Cuál queda?",
  ayuda: "La más usada (8 pantallas) es una caja que lleva el − el número y el + adentro, pero cada una con su alto (de 32 a 56 px), su fondo y, en el ticket de Vender, los signos escritos. Bajar al piso, Cuadrar, Llegó mercadería y Pedir a otra sede usan botones sueltos; las matrices de tallas, una celda hueso (la misma clase copiada tres veces). Las teclas grandes de contar (el escáner y Contar el envío, de 56 px con el número enorme) son un teclado de contar y quedan aparte en las dos propuestas.",
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · La caja con el número adentro (mi recomendación)", detalle: "Una pieza <PasoCantidad>: la caja de los campos (la que se enciende con su hilo rojo cuando escribes el número) con − y + adentro, íconos de lucide. Dos tamaños: «celda» (26 px, en una matriz) y «fila» (36 px con mouse, que crece sola a 44 en una pantalla táctil, el celular del mostrador). El número se puede escribir.", movimiento: "El botón se tiñe al pasar el mouse y se encoge un poco al presionar; con el cursor en el número, la caja se enciende como un campo.", demo: m.una("Pásale el mouse, presiona y escribe", m.demoPaso("P1")), imagenes: [...foto("paso-P1-11-vender.png", "Vender, el ticket, con P1"), ...foto("paso-P1-14-inventario_bajar.png", "Bajar al piso, con P1")] },
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · Los botones sueltos", detalle: "La de Bajar al piso: dos botones secundarios cuadrados y la caja del número en medio. Los mismos dos tamaños. Se ve más «botón» y ocupa más ancho; en el ticket y en una matriz pesa más.", movimiento: "El de todo botón: sube 2 px con su luz al pasar el mouse (en un control que se toca muchas veces seguidas, se mueve bastante).", demo: m.una("Pásale el mouse y presiona", m.demoPaso("P2")), imagenes: [...foto("paso-P2-12-vender.png", "Vender, el ticket, con P2"), ...foto("paso-P2-15-inventario_bajar.png", "Bajar al piso, con P2")] },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy: siete caras", detalle: "Cada pantalla la suya: con glifos o con íconos, con borde o sin él, de 24 a 56 px.", movimiento: "—", demo: m.una("Algunas de hoy, copiadas de su pantalla", m.pasosHoy()), imagenes: [...foto("paso-A-10-vender.png", "Vender, el ticket"), ...foto("paso-A-13-inventario_bajar.png", "Bajar al piso")] },
  ],
};

const guia = {
  id: "guia",
  nombre: "4 · Anterior y siguiente de un paso a paso",
  pregunta: "La guía de impresión (Etiquetas y Rótulos) pasa de paso con «← Anterior» y «Siguiente →» escritos. ¿Cómo queda?",
  ayuda: "Desde el 7 de octubre, volver a un paso es la flecha redonda («volver solo es una flecha»), y Nuevo producto, Cambios, Devoluciones y Existencias ya avanzan así. La guía de impresión se escapó porque sus flechas iban escritas. La guía interactiva (la demo con velo) tiene su diseño y queda aparte (ADR-0389).",
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · Como todo paso a paso: la flecha y «Siguiente» (mi recomendación)", detalle: "A la izquierda, la flecha redonda de volver (<Volver>, «Volver al paso anterior» para el lector); al medio, «Paso 2 de 7»; a la derecha, «Siguiente» negro con su flecha que avanza. En el primer paso la flecha no aparece.", movimiento: "La flecha de volver retrocede 2 px y la de «Siguiente» avanza 4 px al pasar el mouse.", demo: m.una("Pásale el mouse", m.demoGuia("P1")), imagenes: foto("guia-P1-21-etiquetas_de_precio.png", "La guía de impresión, con P1") },
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · Dos botones con palabra", detalle: "«Anterior» secundario con su flecha a la izquierda y «Siguiente» negro con la suya: simétricos, como un libro que se hojea. Sería la única excepción a «volver es una flecha».", movimiento: "El de todo botón; las flechas avanzan hacia su lado.", demo: m.una("Pásale el mouse", m.demoGuia("P2")), imagenes: foto("guia-P2-22-etiquetas_de_precio.png", "La guía de impresión, con P2") },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy", detalle: "«← Anterior» y «Siguiente →» con las flechas escritas.", movimiento: "—", demo: m.una("Como está", m.demoGuia("A")), imagenes: foto("guia-A-20-etiquetas_de_precio.png", "La guía de impresión (hoy)") },
  ],
};

const spec = {
  titulo: "Unificar · ronda 17 · el mes, el cajón, la cantidad y el paso a paso",
  clave: "unificar-ronda17",
  css: "app.css",
  fotosAlFinal: true,
  estilos: ["../elegir-ronda9/demo9.css", "../elegir-ronda15/demo15.css", "demo17.css"],
  guion: "guion.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "Las cuatro familias que el censo de control del 16 encontró sin decidir. Las fotos son de las pantallas reales y, donde dice «con P1» o «con P2», con la propuesta aplicada en vivo (solo el dibujo; no se guardó nada). Las demos usan el CSS real del ERP: pásales el mouse, presiona y escribe. Elige una tarjeta por pregunta; si quieres mezclar, dilo en el comentario.",
  familias: [
    { id: "mes", nombre: "Elegir el mes", pregunta: "El paso de un mes a otro.", grupos: [mes] },
    { id: "cajon", nombre: "El cajón lateral", pregunta: "La hoja que entra por la derecha con el detalle de algo.", grupos: [cajon] },
    { id: "cantidad", nombre: "El paso de cantidad", pregunta: "Subir o bajar una cantidad de uno en uno.", grupos: [paso] },
    { id: "accion.anterior", nombre: "Anterior y siguiente", pregunta: "Los botones de un paso a paso.", grupos: [guia] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });
