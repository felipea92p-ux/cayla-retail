// Arma spec.json de la ronda 16 (cierre: el trazo del marco, las píldoras de color a mano y «Cómo cerró cada día») y llama a elegir.mjs.
//   node construir.mjs   (desde esta carpeta)
import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "./piezas.mjs";

const fotos = (prefijo) =>
  existsSync("img")
    ? readdirSync("img").filter((f) => f.startsWith(prefijo)).sort()
        .map((f) => ({ src: `img/${f}`, pie: f.replace(/^[a-z]+-[A-Z0-9]+-\d+-/, "").replace(/\.png$/, "").replace(/_/g, " ").trim() }))
    : [];
writeFileSync("guion.js", readFileSync("../elegir-ronda9/demo9.js", "utf8"));

const marco = {
  id: "marco",
  nombre: "1 · Los íconos del lateral y la cabecera",
  pregunta: "En la ronda 15 todos los íconos pasaron al grosor de fábrica (2). El marco —el lateral y la cabecera— quedó aparte, con 1,5. ¿Pasa también?",
  ayuda: "El marco tiene su propio juego de íconos (no los de lucide), de 20 px en el lateral y de 18 y 22 en la cabecera y en el menú del celular. Lo que cuenta es la línea que se ve: a 20 px, un trazo de 1,5 dibuja una línea de 1,25 px, casi la misma que un ícono de 16 px con trazo 2 en un botón (1,3 px). Con trazo 2, el lateral se ve más oscuro que el contenido. En las dos propuestas, los tamaños sueltos (18 y 22) pasan a la escala: 20 en el menú, 16 en la lupa de la cabecera.",
  opciones: [
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · Se queda en 1,5, con los tamaños de la escala (mi recomendación)", detalle: "A 20 px, la línea del lateral se ve como la de un botón del contenido. Solo cambian los tamaños sueltos: el menú del celular y el botón del menú, a 20; la lupa de la cabecera, a 16. El colibrí del logo no se toca.", movimiento: "No cambia: el ícono del lateral se corre 2 px y pasa a rojo al pasar el mouse.", demo: m.una("De cerca", m.lupaMarco(1.5)), imagenes: fotos("marco-P2-") },
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · Pasa a 2, como el contenido", detalle: "El mismo número en todo el ERP. A 20 px la línea mide 1,7 px: el lateral se ve más marcado que los botones del contenido. Los mismos tamaños de la escala.", movimiento: "No cambia.", demo: m.una("De cerca", m.lupaMarco(2)), imagenes: fotos("marco-P1-") },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy", detalle: "Trazo 1,5; 20 px en el lateral, 18 en el menú del celular y en la lupa, 22 en el botón del menú.", movimiento: "—", demo: m.una("De cerca", m.lupaMarco(1.5)), imagenes: fotos("marco-A-") },
  ],
};
const pild = {
  id: "pildoras",
  nombre: "2 · Las píldoras de color hechas a mano",
  pregunta: "Quedan 12 píldoras de color dibujadas a mano en 7 pantallas. ¿Pasan a la insignia de estado?",
  ayuda: "La insignia de estado (ronda 2) ya está en casi todo el ERP: con su punto si dice un estado, sin punto (y con su ícono, si lo trae) si nombra algo. Estas 12 se quedaron afuera porque cada pantalla las dibujó a su manera: otro alto, otra letra, el ámbar oscuro o el claro, versalitas en una. Pasarlas cierra el candado: una píldora nueva hecha a mano ya no entra.",
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · Todas a la insignia de estado (mi recomendación)", detalle: "Las que dicen un estado, con su punto: «1 dañada», «2 apartadas», «Sin módulos», «Sin uso», «Pendiente». Las que nombran algo, sin punto: «de fábrica», «Admin · queda a tu nombre» y el aviso de Existencias (con su ícono), y los módulos que se suman o se quitan al cambiar un rol (el que se quita, tachado). Mismo color que hoy; un poco más altas (24 px) donde eran de 18.", movimiento: "Quietas, como toda insignia de estado (solo «Vencida» late).", demo: m.una("Las mismas, con la insignia de estado", m.pildoras("P1")), imagenes: [] },
    { id: "A", tipo: "hoy", entera: true, nombre: "A · Hoy: cada pantalla la suya", detalle: "De 18 a 24 px de alto, de 10 a 12 px de letra, con y sin versalitas.", movimiento: "—", demo: m.una("Como están", m.pildoras("hoy")), imagenes: fotos("pildora-") },
  ],
};
const cierres = {
  id: "cierres",
  nombre: "3 · «Cómo cerró cada día»",
  pregunta: "El gráfico de los cierres del mes, en el historial de Caja. En la ronda 14 quedó aparte porque es la maqueta que elegiste el 12. ¿Se queda o pasa a las barras por tiempo?",
  ayuda: "Hoy: una columna por día y una barra por cierre (si un día se cerró dos veces, dos barras); el alto es lo que se contó y el color cómo terminó; si faltó, encima queda punteado lo que faltaba; los días con la caja abierta van con un recuadro punteado y hoy, sin cerrar, con uno rojo. Tocar una barra abre ese cierre. Las barras de la ronda 14 pueden decir casi todo, pero pierden el recuadro de los días abiertos y las dos barras de un día con dos cierres.",
  opciones: [
    { id: "P1", tipo: "propuesta", entera: true, nombre: "P1 · Se queda como la elegiste el 12 (mi recomendación)", detalle: "Dice más que una fila de barras: cada cierre por separado, el hueco punteado de lo que faltó y los días que la caja no se cerró. Queda registrada como excepción de las barras por tiempo, con su motivo.", movimiento: "Quieta, a propósito (ADR-0136); el detalle de un día al pasar el mouse.", demo: null, imagenes: fotos("cierres-") },
    { id: "P2", tipo: "propuesta", entera: true, nombre: "P2 · Con las barras de la ronda 14", detalle: "Una barra por día en el color de cómo terminó (verde cuadró, rojo faltó, ámbar sobró), la rayita taupe de lo que debía haber, el globito al pasar el mouse y tocar abre el cierre; hoy, rayada. Un día con dos cierres suma los dos; un día con la caja abierta queda vacío.", movimiento: "Crecen desde abajo en cascada una vez; el globito al pasar el mouse.", demo: m.una("Un mes de ejemplo; pasa el mouse", m.cierresBarras()), imagenes: [] },
  ],
};
const spec = {
  titulo: "Unificar · ronda 16 · el cierre: el marco, las píldoras y los cierres del mes",
  clave: "unificar-ronda16",
  css: "app.css",
  fotosAlFinal: true,
  estilos: ["../elegir-ronda9/demo9.css", "../elegir-ronda15/demo15.css", "demo16.css"],
  guion: "guion.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "La ronda de cierre: lo que quedó afuera de las rondas anteriores. Las fotos del marco son del lateral y la cabecera reales, con cada propuesta aplicada en vivo (solo el dibujo; no se guardó nada); las demos usan el CSS real del ERP. Elige una tarjeta por pregunta; si quieres mezclar, escríbelo en el comentario.",
  familias: [
    { id: "icono", nombre: "El marco", pregunta: "El trazo de los íconos del lateral y la cabecera.", grupos: [marco] },
    { id: "estado", nombre: "Las píldoras de color", pregunta: "Las 12 que quedan hechas a mano.", grupos: [pild] },
    { id: "grafico.barras", nombre: "Los cierres del mes", pregunta: "«Cómo cerró cada día».", grupos: [cierres] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });
