// Arma spec.json de la ronda 18 (la cabecera sin la frase, con un «?» que la abre) y llama a elegir.mjs.
//   node construir.mjs   (desde apps/web/unificar/.salida/elegir-ronda18, después de bajar-css.mjs y fotos.mjs [oscuro])
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { demo } from "./piezas.mjs";

const NOMBRE = { gastos: "Finanzas ▸ Gastos", existencias: "Existencias", clientes: "Clientes ▸ Fichas", movimientos: "Movimientos", ordenes: "Compras ▸ Órdenes", cambios: "Cambios", caja: "Caja (turno abierto)", categorias: "Catálogo ▸ Categorías", inicio: "Inicio de una integrante" };
const f = (archivo, pie) => (existsSync(`img/${archivo}.png`) ? [{ src: `img/${archivo}.png`, pie }] : []);
const de = (id, op, extra = "", pie = "") => f(`${id}-${op}${extra}`, pie || NOMBRE[id]);

const GASTOS = { id: "gastos", sede: "Todas las sedes", titulo: "Gastos", frase: "Lo que se paga para que el negocio funcione y no es mercadería. Si llegó con factura de un proveedor, compártela con Compras: un solo Por pagar y un solo IGV." };
const CAJA = { id: "caja", sede: "Tienda Trujillo", titulo: "Caja", frase: "Turno de Micaela Vendedora · Integrante" };

const como = {
  id: "como",
  nombre: "1 · La frase que explica la pantalla",
  pregunta: "¿Cómo queda la frase de debajo del título?",
  ayuda:
    "Hoy casi todas las cabeceras del ERP (120 de 131) llevan una frase de 15 px en gris bajo el título, y unas 85 solo explican qué es la pantalla («Lo que se paga para que el negocio funcione…»): la colaboradora la lee el primer día y después es ruido. Las tres propuestas la sacan de la vista y dejan un «?» junto al título que la abre. Al abrirse, la letra pasa de 15 a 16 px y de gris a tinta: si alguien la quiere leer, que se lea bien. Las fotos son las pantallas reales con la propuesta puesta en vivo (solo el dibujo; no se guardó nada).",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · «?» junto al título; la frase baja en su lugar (mi recomendación)",
      detalle: "Un círculo de 32 px con «?» al lado del título (36 px en el celular, para el dedo). Al tocarlo se rellena de tinta y la frase aparece debajo del título, en 16 px, con el hilo taupe de la cabecera a su izquierda; se vuelve a tocar y se va. Empuja lo de abajo en vez de taparlo: nada queda escondido detrás y en el celular se lee igual de bien. Cada vez que se entra a la pantalla vuelve cerrada.",
      movimiento: "El «?» se tiñe de hueso al pasar el mouse y se encoge al presionar; abierto, pasa a rojo profundo al pasar el mouse. La frase baja 4 px con un fundido (260 ms), sin rebote. Con «reducir movimiento», aparece sin animar.",
      demo: demo("P1", GASTOS),
      imagenes: [...de("gastos", "P1"), ...de("gastos", "P1", "-abierto", "Gastos, abierta"), ...de("existencias", "P1"), ...de("clientes", "P1", "-abierto", "Clientes, abierta"), ...de("movimientos", "P1"), ...de("ordenes", "P1"), ...de("cambios", "P1"), ...de("gastos", "P1", "-375", "Gastos a 375 px"), ...de("gastos", "P1", "-abierto-375", "Gastos a 375 px, abierta"), ...de("gastos", "P1", "-abierto-oscuro", "Gastos en oscuro, abierta")],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · «?» junto al título; la frase en un globo",
      detalle: "El mismo «?», pero la frase sale en un globo que flota bajo él (como el «!» de Marcas o Productos, con la letra de 12 a 16 px). La página no se mueve; a cambio, el globo tapa lo que hay debajo (las cifras, el primer botón) hasta que se toca afuera o se aprieta Escape. En el celular ocupa el ancho de la pantalla.",
      movimiento: "El «?» igual que en P1. El globo baja 4 px con un fundido (240 ms) y se va al tocar afuera.",
      demo: demo("P2", GASTOS),
      imagenes: [...de("gastos", "P2", "-abierto", "Gastos, abierta"), ...de("existencias", "P2", "-abierto", "Existencias, abierta"), ...de("cambios", "P2", "-abierto", "Cambios, abierta"), ...de("cambios", "P2", "-abierto-375", "Cambios a 375 px, abierta"), ...de("gastos", "P2", "-abierto-oscuro", "Gastos en oscuro, abierta")],
    },
    {
      id: "P3", tipo: "propuesta", entera: true,
      nombre: "P3 · Un botón con palabra: «? Qué es esto»",
      detalle: "Como P1, pero el botón dice «Qué es esto» además del «?»: se entiende sin adivinar el ícono. A cambio vuelve a poner texto junto a cada título, que es justo lo que se quiere quitar, y compite con los botones de la cabecera.",
      movimiento: "Igual que P1.",
      demo: demo("P3", GASTOS),
      imagenes: [...de("gastos", "P3"), ...de("gastos", "P3", "-abierto", "Gastos, abierta"), ...de("existencias", "P3"), ...de("clientes", "P3", "-abierto", "Clientes, abierta")],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: la frase siempre a la vista",
      detalle: "15 px, gris (tinta al 70 %), hasta 28 rem de ancho, bajo el título de 46 px.",
      movimiento: "Sube con el título al entrar.",
      donde: "Las 112 pantallas con cabecera (todas menos Finanzas sin rediseñar).",
      demo: demo("A", GASTOS),
      imagenes: [...de("gastos", "A"), ...de("existencias", "A"), ...de("clientes", "A"), ...de("movimientos", "A"), ...de("ordenes", "A"), ...de("cambios", "A"), ...de("gastos", "A", "-375", "Gastos a 375 px")],
    },
  ],
};

const dato = {
  id: "dato",
  nombre: "2 · La frase que dice un dato",
  pregunta: "Unas 35 frases no explican la pantalla: dicen algo que la persona necesita ver. ¿También se esconden?",
  ayuda:
    "«Turno de Micaela · Integrante» en Caja, «42 categorías activas» en Categorías, «Conteo 12 · Almacén» en un conteo, el RUC y el contacto de un proveedor, los datos de una factura, el veredicto de Frescura del piso («Hoy el piso está fresco…»), la campaña con su descuento y sus fechas. Si se esconden detrás del «?», el «?» deja de significar «qué es esto».",
  opciones: [
    {
      id: "D1", tipo: "propuesta", entera: true,
      nombre: "D1 · Se quedan a la vista, sin «?» (mi recomendación)",
      detalle: "La pieza separa las dos cosas: lo que explica va detrás del «?» y lo que es dato se queda bajo el título, como hoy. Una pantalla puede tener las dos (una compra: el proveedor a la vista, la explicación detrás del «?»). Yo clasifico cada una de las ~120 frases y te paso la lista para que la revises antes de migrar.",
      movimiento: "El de hoy.",
      demo: demo("A", CAJA),
      imagenes: [...de("caja", "A"), ...de("categorias", "A"), ...de("inicio", "A")],
    },
    {
      id: "D2", tipo: "propuesta", entera: true,
      nombre: "D2 · También detrás del «?»",
      detalle: "Todas las cabeceras quedan solo con el título y su «?». Más limpio, pero el turno de Caja, la cuenta de Categorías o el veredicto de Frescura pasan a estar a un toque.",
      movimiento: "El de P1 (o el que elijas arriba).",
      demo: demo("P1", CAJA),
      imagenes: [...de("caja", "P1"), ...de("caja", "P1", "-abierto", "Caja, abierta"), ...de("categorias", "P1"), ...de("inicio", "P1")],
    },
  ],
};

const spec = {
  titulo: "Unificar · ronda 18 · la cabecera sin su frase",
  clave: "unificar-ronda18",
  css: "app.css",
  fotosAlFinal: true,
  estilos: ["demo18.css"],
  guion: "guion.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "Las colaboradoras dicen que el texto es muy chico y que nadie lo lee. Empezamos por la frase de cada cabecera. Las demos usan el CSS real del ERP: toca el «?» para abrirlo y cerrarlo. Las fotos son las pantallas reales con la propuesta puesta en vivo. Elige una tarjeta por pregunta; si quieres mezclar, dilo en el comentario.",
  familias: [{ id: "titulo-pagina", nombre: "La cabecera de una pantalla", pregunta: "Lo que va bajo el título.", grupos: [como, dato] }],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });
