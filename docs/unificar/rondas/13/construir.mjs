// Arma spec.json de la ronda 13 (la barra de avance, el anillo, copiar y el menú «Más») y llama a elegir.mjs. Usa el CSS real bajado hoy (bajar-css.mjs).
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
writeFileSync("guion.js", readFileSync("../elegir-ronda9/demo9.js", "utf8") + "\n" + readFileSync("demo13.js", "utf8"));

const avance = {
  id: "avance",
  nombre: "1 · La barra de avance",
  pregunta: "Una barra fina que se llena: cuánto va de algo contra su total o su meta (lo vendido contra la meta, lo contado, lo pagado de una factura). ¿Cómo se ve y cómo se mueve?",
  ayuda:
    "Hoy hay unas 45 en el ERP hechas de 38 maneras: siete altos (3, 4, 5, 6, 8, 10 y 12 px), la pista en arena, en hueso o en tinta al 10 %, el relleno en tinta, en verde, en ámbar o en taupe sin una regla, y la mitad se llena al llegar mientras la otra mitad está quieta. Hay incluso dos componentes distintos que se llaman igual (`BarraAvance`). Usa los «−/+» para mover la cifra.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Una barra con tres altos: se llena al verse y pasa a verde al completarse (mi recomendación)",
      detalle:
        "La pista en arena y el relleno en tinta; al llegar al total pasa a verde sola. Tres altos con nombre: fina (3 px, dentro de una fila), normal (6 px, la de fábrica) y gruesa (12 px, la cifra principal de una pantalla). La rayita de «a esta hora tocaba» es opcional. Lo que está mal (te pasas, se venció) lo pinta la pantalla en rojo o ámbar; la barra no decide qué es malo. Siempre dice su avance al lector de pantalla.",
      movimiento: "Se llena desde cero una vez al verse (760 ms) y, si la cifra cambia, se desliza (500 ms) y cambia de color; sin rebote.",
      demo: m.una("Caja, Recibir, Por pagar y Apartados con la misma barra", m.avanceDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Una barra quieta, siempre en tinta, de un solo alto",
      detalle: "La misma pista en arena, 6 px en todas partes y el relleno en tinta (el rojo o el ámbar, solo si la pantalla lo pide). No se mueve: el número de al lado ya dice cuánto. Más sobria, pero dentro de una fila de 3 px pesa el doble y el «ya está» no se ve.",
      movimiento: "Ninguno.",
      demo: m.una("Las mismas cuatro pantallas", m.avanceDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: 38 maneras",
      detalle: "Cada pantalla la suya.",
      movimiento: "Según la pantalla: quieta, se llena en 300 ms, 500 ms o 1 s, o crece desde la izquierda.",
      donde: "Rendimiento, Inicio, Vender, Caja, Compras (factura, Por pagar, Notas de crédito, nueva compra), Recibir, Conteo, Insumos, Apartados, Productos, Roles, Por regularizar, Frescura, el club.",
      demo: m.una("Diez de las de hoy", m.avanceDemos.A()),
      imagenes: fotos("avance"),
    },
  ],
};

const anillo = {
  id: "anillo",
  nombre: "2 · El anillo",
  pregunta: "Un anillo que se cierra: cuánto va de algo, con la cifra adentro (mi meta de hoy, lo contado de un envío, las semanas que alcanza una talla). ¿Cómo se ve y cómo se mueve?",
  ayuda:
    "Hoy hay 15 anillos dibujados con cuatro técnicas distintas, de 32 a 168 px, con la pista en hueso, arena o tinta al 10 % y el arco en verde, ámbar, rojo, tinta o el color del efectivo; unos se llenan al llegar y otros no. Los del Observatorio, Análisis y los pases de Traslados tienen su diseño por decisión (ADR-0322, 0357 y 0355) y no entran. Usa los «−/+».",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Tres tamaños, el arco de tinta que pasa a verde al cerrarse (mi recomendación)",
      detalle:
        "Chico (40 px: una fila de Existencias o de Conteo), mediano (72 px: Recibir, las revisiones de Cambios y Devoluciones) y grande (160 px: «Mi meta» del Inicio y «hoy contra ayer» de Caja, con la cifra en serif al centro). La pista en hueso, el arco en tinta con las puntas redondas, y verde al completarse; el ámbar o el rojo, solo si la pantalla lo pide. La cifra siempre adentro.",
      movimiento: "Se cierra desde arriba una vez al verse (1,1 s) y, si la cifra cambia, se desliza (500 ms); sin rebote.",
      demo: m.una("Inicio, Recibir y Existencias con el mismo anillo", m.anilloDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Los mismos tres tamaños, verdes y quietos",
      detalle: "El arco siempre verde y sin movimiento, como «Mi meta» del Inicio hoy. Más tranquilo, pero el verde ya no dice «listo»: está verde también a la mitad.",
      movimiento: "Ninguno.",
      demo: m.una("Las mismas tres pantallas", m.anilloDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: 15 anillos, cuatro técnicas",
      detalle: "Cada pantalla el suyo.",
      movimiento: "Se llenan en 300 ms, 900 ms, 1,2 s o 1,3 s, o están quietos.",
      donde: "Caja, Inicio, Recibir, Cambios y Devoluciones, Conteo, Existencias, el Inicio del almacén.",
      demo: m.una("Seis de los de hoy", m.anilloDemos.A()),
      imagenes: fotos("anillo"),
    },
  ],
};

const copiar = {
  id: "copiar",
  nombre: "3 · Copiar",
  pregunta: "El botón que copia un dato (un CCI, un número de cuenta, el código de una talla) o un texto (el mensaje para el proveedor, el enlace de una lista). ¿Cómo se ve y qué dice cuando ya copió?",
  ayuda:
    "Hoy hay nueve caras en once pantallas: un ícono de 14 px, un círculo de 20 px, una píldora en versalitas, el código que es el botón, «COPIAR MENSAJE» en versalitas, el secundario con y sin ícono, «Copiar» a media fila y el eslabón con y sin palabra. Unas dicen «Copiado» y otras no dicen nada. Prueba: copia un texto de ejemplo.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Junto a un dato, el ícono solo; suelto, «Copiar …»; los dos dicen «✓ Copiado» (mi recomendación)",
      detalle:
        "Junto a un dato que ya se ve (una cuenta, un código), el ícono solo de 32 px, como el lápiz de la ronda 12, con «Copiar <qué>» al pasar el mouse. Suelto, el secundario «Copiar mensaje», «Copiar CCI», «Copiar enlace» (con el eslabón). Al tocar, el ícono se vuelve un ✓ verde que se dibuja y dice «Copiado» 1,8 s, sin que el botón cambie de ancho. Si el navegador no deja copiar, el texto queda marcado para copiarlo a mano (como Traslados).",
      movimiento: "El ícono se va y el ✓ se dibuja (320 ms); el fondo se tiñe de verde y vuelve solo a los 1,8 s.",
      demo: m.una("Las cuentas de un proveedor y un mensaje", m.copiarDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Siempre con la palabra: la píldora «Copiar» junto a un dato",
      detalle: "Junto a un dato, la píldora con «COPIAR» (la de las cuentas de un proveedor); suelto, el mismo secundario de P1. Se lee sin adivinar, pero en una lista de cuentas la columna de píldoras pesa más que los datos.",
      movimiento: "La píldora se tiñe de verde y dice «Copiado».",
      demo: m.una("Las mismas dos pantallas", m.copiarDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: nueve caras",
      detalle: "Cada pantalla la suya.",
      movimiento: "Unas dicen «Copiado», otras nada.",
      donde: "Pagar, el destino de un medio de pago, las cuentas de un proveedor, Existencias, la nota de crédito, el proveedor, Traslados, las terminales, Productos.",
      demo: m.una("Las nueve de hoy", m.copiarDemos.A()),
      imagenes: fotos("copiar"),
    },
  ],
};

const menu = {
  id: "menu",
  nombre: "4 · El menú «Más»",
  pregunta: "El botón que guarda las acciones de vez en cuando (descargar, copiar el enlace, imprimir el cartel). ¿Dice «Más» o es un «⋯»?",
  ayuda:
    "Hoy hay cuatro caras: «Más ▾» con su palabra (Clientes, Marcas, Por regularizar), «⋯» de 36 px con borde (Roles, Movimientos), «⋯ Opciones» (cada comprobante de Facturación, que abre una hoja) y un «Más ▾» hecho a mano en el pie de cada tarjeta de Existencias. Toca para abrir.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · «Más ▾» con su palabra; en una fila de una lista, el «⋯» solo (mi recomendación)",
      detalle:
        "Donde cabe la palabra —la cabecera, una tarjeta, una barra—, el secundario «Más ▾». En una fila de una lista (muchas iguales: los roles, los comprobantes), el «⋯» solo de 32 px, sin borde, con «Más acciones de <qué>» al pasar el mouse: la misma regla que el lápiz de la ronda 12. Los dos abren la misma lista.",
      movimiento: "La flecha gira al abrir; la lista entra bajando 4 px (220 ms); el «⋯» se rellena de hueso al pasar el mouse.",
      demo: m.una("La cabecera de Clientes y la lista de Roles", m.menuDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · El «⋯» en todas partes",
      detalle: "Un solo botón de 36 px con borde, en la cabecera y en las filas. Ocupa menos, pero en la cabecera hay que adivinar qué hay detrás.",
      movimiento: "La lista entra bajando 4 px.",
      demo: m.una("Las mismas dos pantallas", m.menuDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: cuatro caras",
      detalle: "Cada pantalla la suya.",
      movimiento: "Según la pantalla.",
      donde: "Clientes, Marcas, Por regularizar, Roles, Movimientos, Facturación, Existencias.",
      demo: m.una("Las cuatro de hoy", m.menuDemos.A()),
      imagenes: fotos("menu"),
    },
  ],
};

const spec = {
  titulo: "Unificar · ronda 13 · la barra de avance, el anillo, copiar y el menú «Más»",
  clave: "unificar-ronda13",
  css: "app.css",
  fotosAlFinal: true,
  estilos: ["../elegir-ronda9/demo9.css", "demo13.css"],
  guion: "guion.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "Dos gráficos que se repiten en todo el ERP (la barra que se llena y el anillo que se cierra) y dos botones de una sola función (copiar y el menú «Más»). Las líneas y las barras por hora o por día van en la ronda 14, y los íconos en la 15. Los gráficos del Observatorio, Análisis, Finanzas y los pases de Traslados tienen su diseño por decisión y no entran. Todo lo de «Pruébalo» está VIVO con el CSS real del ERP de hoy: nada se guarda. Elige una tarjeta por pregunta; si quieres mezclar, escríbelo en el comentario.",
  familias: [
    { id: "grafico.avance", nombre: "La barra de avance", pregunta: "Cuánto va de algo contra su total o su meta.", grupos: [avance] },
    { id: "grafico.anillo", nombre: "El anillo", pregunta: "Cuánto va de algo, con la cifra adentro.", grupos: [anillo] },
    { id: "accion.copiar", nombre: "Copiar", pregunta: "Copiar un dato o un texto.", grupos: [copiar] },
    { id: "accion.menu", nombre: "El menú «Más»", pregunta: "Las acciones de vez en cuando.", grupos: [menu] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });
