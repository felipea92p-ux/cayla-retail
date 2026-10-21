// Arma spec.json de la ronda 15 (los íconos, el globito con número, «Ver más» y los dos botones que quedan) y llama a elegir.mjs.
//   node construir.mjs   (desde esta carpeta)
import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "./piezas.mjs";

const fotos = (prefijo) =>
  existsSync("img")
    ? readdirSync("img").filter((f) => f.startsWith(prefijo)).sort()
        .map((f) => ({ src: `img/${f}`, pie: f.replace(/^[a-z]+-[A-Z0-9]+-\d+-|^globo-\d+-/, "").replace(/\.png$/, "").replace(/_/g, " ") }))
    : [];
writeFileSync("guion.js", readFileSync("../elegir-ronda9/demo9.js", "utf8") + "\n" + readFileSync("demo15.js", "utf8"));

const LO_QUE_NO = "Las piezas grandes que ya tienen su dibujo (el ícono de un vacío, de un aviso, los sellos de Movimientos, el Observatorio, Análisis) y las marcas de una casilla (✓ y −, más gruesas a propósito) no cambian.";
const trazo = {
  id: "trazo",
  nombre: "1 · El grosor de la línea",
  pregunta: "Todos los íconos son de lucide. ¿Con qué grosor se dibujan en todo el ERP?",
  ayuda: `Hoy el 84 % usa el grosor de fábrica de lucide (2) y el resto va de 1,4 a 2,8 según quién lo dibujó: en Proformas y las opciones de un comprobante, 1,75; en los conteos, 1,5; en Existencias, 1,7 y 2,2; en los pases de Traslados, 1,8 y 2,6. En la pantalla la diferencia es chica —por eso va también de cerca—, pero suma: dos íconos iguales lado a lado se ven de distinto peso. ${LO_QUE_NO}`,
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · El de fábrica, 2, en todos (mi recomendación)", detalle: "El grosor con que lucide dibujó sus íconos y el que ya usa casi todo el ERP: a 16 px la línea mide 1,3 px y a 14 px, 1,2 px, que en el monitor del Mac mini se lee bien. Se corrigen los que van más finos o más gruesos.", movimiento: "No cambia: los íconos que se mueven (el «+» que gira, la flecha que avanza, la descarga que baja) siguen igual.", demo: m.una("Una tarjeta con sus cinco lugares", m.iconoDemos.trazo2() + m.lupa(2)), imagenes: fotos("trazo-P1-") },
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · Un poco más fino, 1,75", detalle: "Un 12 % más delgado, más cerca de la letra serif de CAYLA y de las pantallas que ya lo usan (Proformas, las opciones de un comprobante). A 14 px la línea queda en 1 px: se ve más fina y algo más gris.", movimiento: "Igual que hoy.", demo: m.una("La misma tarjeta", m.iconoDemos.trazo175() + m.lupa(1.75)), imagenes: fotos("trazo-P2-") },
    { id: "P3", tipo: "propuesta", entera: true, nombre: "P3 · La misma línea a cualquier tamaño (1,5 px)", detalle: "La línea mide 1,5 px en el ícono de 12 y en el de 20: el chico se ve un poco más firme y el grande, más liviano. Es lo que hacen algunos sistemas para que nada se vea «gordo».", movimiento: "Igual que hoy.", demo: m.una("La misma tarjeta", m.iconoDemos.trazoFijo() + m.lupa(1.5, true)), imagenes: fotos("trazo-P3-") },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy: cada pantalla con el suyo", detalle: "De 1,4 a 2,8, y entre 10 y 26 px.", movimiento: "—", donde: "320 archivos dibujan íconos; 83 con un tamaño o un grosor propio.", demo: m.una("La misma tarjeta, con los tamaños y grosores de hoy", m.iconoDemos.hoy() + m.lupa(2, false, true)), imagenes: fotos("trazo-A-") },
  ],
};
const tam = {
  id: "tamano",
  nombre: "2 · El tamaño",
  pregunta: "¿De qué tamaño es un ícono según dónde está?",
  ayuda: `Hoy hay 25 tamaños: casi todos usan 12, 14, 16 o 20 px, pero unos 80 archivos usan 13, 15, 17, 18 o 19 (el «Cerrar caja», las tarjetas de Proformas, los filtros, los accesos de Caja). ${LO_QUE_NO}`,
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · Cuatro tamaños según el lugar (mi recomendación)", detalle: "12 px dentro de una insignia o una etiqueta chica · 14 px junto a un texto (una fila, una nota, un menú) · 16 px en un botón o un campo · 20 px junto al título de un bloque o en una tecla grande (los accesos de Caja, la bolsa de Vender). Es lo que ya usa la mayoría: cambia poco a la vista y nadie tiene que adivinar.", movimiento: "No cambia.", demo: m.una("La regla", m.escala(2)) + m.una("La misma tarjeta", m.iconoDemos.tamP1(2)), imagenes: fotos("tam-P1-") },
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · El ícono crece con la letra", detalle: "Sin lista de tamaños: cada ícono mide 1,15 veces la letra que tiene al lado (16 px junto a una letra de 14). Se ajusta solo, pero salen medidas como 15,5 px y los íconos de una misma fila pueden quedar de tamaños distintos si la letra cambia.", movimiento: "No cambia.", demo: m.una("La misma tarjeta", m.iconoDemos.tamEm(2)), imagenes: [] },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy: 25 tamaños", detalle: "Los mismos lugares con 13, 15, 17 y 18 px mezclados.", movimiento: "—", demo: m.una("La tarjeta de hoy", m.iconoDemos.hoy()), imagenes: fotos("trazo-A-") },
  ],
};
const globo = {
  id: "globo",
  nombre: "3 · El globito con número",
  pregunta: "El número chico que dice cuántos hay, o cuántos te piden algo. ¿Cómo se ve en todo el ERP?",
  ayuda: "Hoy tiene seis caras: en las pestañas y los títulos, gris suave (la que elegiste en la ronda 9); en el menú, ámbar lleno; en una pestaña con pendientes, ámbar suave; en la bolsa de Vender, los apartados y los avisos del plan de compra, rojo con su anillo; en los accesos de Caja, ámbar lleno en la esquina; en «Apartar», crema sobre negro; en «Pendientes» de Existencias, ámbar suave y más chico. El rojo es el acento de la marca (máximo dos por pantalla) y la bolsa con 3 prendas no es un error.",
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · El globito de las pestañas en todas partes; lleno solo en la esquina (mi recomendación)", detalle: "Una sola pieza de 20 px. Junto a un nombre, gris suave (cuántos hay). Si te pide algo, ámbar suave. En la esquina de un ícono o de un botón, donde un tinte no se vería, lleno y con su anillo de 2 px: tinta si cuenta, ámbar si te pide algo. Dentro de un botón negro, crema suave. Rojo solo si dice un error (lo que no llegó a SUNAT, en Comprobantes), nunca para contar. Con 0, «te pide algo» no se dibuja.", movimiento: "Al cambiar el número, el globito late una vez (el «pop» de la bolsa de Vender y de Por pagar).", demo: m.una("Los cuatro lugares", m.globitos("P1")), imagenes: [] },
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · Lo que te pide algo, siempre lleno", detalle: "Igual que P1, pero «te pide algo» es ámbar lleno en todas partes (también en las pestañas y en Existencias), como el menú de hoy. Se ve más, y una pantalla con varios pendientes se llena de ámbar.", movimiento: "El mismo latido al cambiar.", demo: m.una("Los cuatro lugares", m.globitos("P2")), imagenes: [] },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy: seis caras", detalle: "Gris, ámbar suave, ámbar lleno, rojo con anillo, crema sobre negro.", movimiento: "La bolsa de Vender y la barra de Por pagar laten al cambiar; las demás, quietas.", donde: "Pestañas y títulos (ronda 9), el menú, Vender, Apartados, el plan de compra, Caja, Existencias, la matriz de Nuevo producto.", demo: m.una("Recreadas con los mismos números", m.globitos("hoy")), imagenes: fotos("globo-") },
  ],
};
const vm = {
  id: "ver-mas",
  nombre: "4 · «Ver más» y «Ver menos»",
  pregunta: "Una lista muestra las primeras filas y guarda las demás. ¿Cómo se abre?",
  ayuda: "Hoy hay cinco caras: la franja al pie de la lista con la flecha que gira (Inicio de Almacén), un texto taupe sobre una raya (Existencias ▸ Para hoy), un botón sutil (la ficha de un cliente), un enlace (Finanzas ▸ Resumen) y una tecla con ícono (las categorías de Nuevo producto). Toca «Ver 3 más» en las propuestas.",
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · La franja al pie de la lista (mi recomendación)", detalle: "La de Inicio de Almacén: a todo el ancho, al pie de la tarjeta, «Ver 3 más» en taupe con la flecha hacia abajo. Al tocarla, las filas se despliegan en su lugar (sin saltos) y dice «Ver menos». En una lista suelta, fuera de una tarjeta, el enlace con la misma flecha.", movimiento: "Las filas bajan en 400 ms; la flecha da media vuelta; al pasar el mouse la franja se oscurece apenas.", demo: m.una("Toca «Ver 3 más»", m.verMas("P1")), imagenes: [] },
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · Siempre el enlace", detalle: "«Ver 3 más» como enlace bajo la última fila, con la flecha. Más discreto, también dentro de una tarjeta.", movimiento: "Las mismas filas que bajan y la flecha que gira; el subrayado corre al pasar el mouse.", demo: m.una("Toca «Ver 3 más»", m.verMas("P2")), imagenes: [] },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy: cinco caras", detalle: "Una por pantalla.", movimiento: "Solo la de Inicio de Almacén despliega las filas y gira la flecha.", demo: m.una("Cuatro de las cinco", m.verMas("hoy")), imagenes: [] },
  ],
};
const db = {
  id: "deshacer-buscar",
  nombre: "5 · «Deshacer» y «Buscar»",
  pregunta: "Los dos botones que quedan con más de una cara. ¿Quedan así?",
  ayuda: "«Deshacer» vuelve atrás un cambio que todavía no se guarda (un precio, una talla, una lectura de más): hoy es un enlace en cuatro lugares y versalitas en dos (Editar producto, Editar marca). «Buscar» al apretar (el padrón de SUNAT, unir dos clientes) es el secundario sin ícono. «Siguiente» y «Anterior» ya los resuelven la paginación (ronda 8) y los pasos a paso (FlujoGuiado): no hay que decidir nada.",
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · «Deshacer» es el enlace con su flecha curva; «Buscar», el secundario con la lupa (mi recomendación)", detalle: "Lo que la ronda 9 ya decidió para una acción chica que corrige una sola cosa (el enlace), con la flecha curva delante para que se reconozca antes de leer. «Buscar» suma la lupa, como el buscador.", movimiento: "El del enlace (el hilo rojo corre al pasar el mouse) y el del botón (sube, la luz cruza, la onda al tocar).", demo: m.una("Así quedan", m.deshacerBuscar("P1")), imagenes: [] },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy", detalle: "Tres «Deshacer» distintos y «Buscar» sin ícono.", movimiento: "—", demo: m.una("Como están", m.deshacerBuscar("hoy")), imagenes: [] },
  ],
};

const spec = {
  titulo: "Unificar · ronda 15 · los íconos, el globito, «Ver más» y los que quedan",
  clave: "unificar-ronda15",
  css: "app.css",
  fotosAlFinal: true,
  estilos: ["../elegir-ronda9/demo9.css", "demo15.css"],
  guion: "guion.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "Lo que queda después de los gráficos: el grosor y el tamaño de los íconos, el globito con número, «Ver más» y dos botones. Las fotos son de las pantallas reales de hoy, con cada propuesta aplicada en vivo (solo cambia el dibujo; no se guardó nada); las demos usan el CSS real del ERP. Elige una tarjeta por pregunta; si quieres mezclar, escríbelo en el comentario.",
  familias: [
    { id: "icono", nombre: "Los íconos", pregunta: "El mismo dibujo con distinto grosor o tamaño.", grupos: [trazo, tam] },
    { id: "contador", nombre: "El globito con número", pregunta: "Cuántos hay, o cuántos te piden algo.", grupos: [globo] },
    { id: "accion.siguiente", nombre: "«Ver más»", pregunta: "Abrir las filas que una lista guarda.", grupos: [vm] },
    { id: "accion.deshacer", nombre: "«Deshacer» y «Buscar»", pregunta: "Los dos botones que quedan.", grupos: [db] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });
