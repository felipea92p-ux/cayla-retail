// Ronda 18 · vuelta 2: Felipe eligió P2 (globo) + D2 (también los datos) y pidió un «?» y un globo más finos. Tres caras para elegir.
//   node construir2.mjs   (desde apps/web/unificar/.salida/elegir-ronda18, después de VUELTA=2 fotos.mjs [oscuro])
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { demoFino } from "./piezas.mjs";

const NOMBRE = { gastos: "Finanzas ▸ Gastos", existencias: "Existencias", cambios: "Cambios", caja: "Caja (el turno, que también va al «?»)" };
const f = (archivo, pie) => (existsSync(`img/${archivo}.png`) ? [{ src: `img/${archivo}.png`, pie }] : []);
const fotos = (v) => [
  ...f(`gastos-${v}`, "Gastos, cerrada"),
  ...f(`gastos-${v}-abierto`, "Gastos, abierta"),
  ...f(`existencias-${v}-abierto`, NOMBRE.existencias),
  ...f(`caja-${v}-abierto`, NOMBRE.caja),
  ...f(`cambios-${v}-abierto-375`, "Cambios a 375 px"),
  ...f(`gastos-${v}-abierto-oscuro`, "Gastos en oscuro"),
];
const GASTOS = { id: "gastos", sede: "Todas las sedes", titulo: "Gastos", frase: "Lo que se paga para que el negocio funcione y no es mercadería. Si llegó con factura de un proveedor, compártela con Compras: un solo Por pagar y un solo IGV." };

const cara = {
  id: "cara",
  nombre: "La cara del «?» y de su globo",
  pregunta: "Elegiste el globo (P2) y que los datos también vayan ahí (D2). ¿Con qué cara?",
  ayuda:
    "Las tres comparten lo que ya elegiste: el «?» junto al título, el globo que flota sin mover la página y se cierra al tocar afuera o con Escape, la frase en 16 px y, arriba, el nombre de la pantalla en versalitas. En las tres el «?» pasa a la letra del título (la serif de la casa) y el globo entra desde el «?»: crece un poco, se enfoca y se aclara (340 ms, una vez, sin rebote). Cambia el material. Toca el «?» de cada demo: hay cifras detrás para ver cuánto deja pasar.",
  opciones: [
    {
      id: "V1", tipo: "propuesta", entera: true,
      nombre: "V1 · Vidrio esmerilado (mi recomendación)",
      detalle: "El «?» es una lente de vidrio con su filo claro arriba; abierto, lo rodea un halo fino. El globo es vidrio de verdad: deja pasar el color de lo que hay detrás, difuminado, con el mismo filo claro y un pico que apunta al «?». Es el material de las pestañas y las tarjetas de cifra del ERP, así que no es una cosa nueva: se ve de la familia. En oscuro es vidrio ahumado.",
      movimiento: "Al pasar el mouse el «?» sube 1 px y se oscurece su borde. El globo crece desde el pico, se enfoca y se aclara; el hilo taupe del nombre se dibuja y la frase sube un paso después.",
      demo: demoFino("V1", GASTOS),
      imagenes: fotos("V1"),
    },
    {
      id: "V2", tipo: "propuesta", entera: true,
      nombre: "V2 · Tinta translúcida",
      detalle: "El «?» con un anillo fino; abierto, se llena de tinta. El globo es oscuro y un poco transparente, con la letra en crema, como los globos de ayuda de un iPhone: se distingue de inmediato de todo lo demás de la pantalla. En oscuro se invierte solo (vidrio claro con letra oscura).",
      movimiento: "El «?» se tiñe de hueso al pasar el mouse. El globo entra igual que en V1.",
      demo: demoFino("V2", GASTOS),
      imagenes: fotos("V2"),
    },
    {
      id: "V3", tipo: "propuesta", entera: true,
      nombre: "V3 · Papel con hilo rojo",
      detalle: "El «?» no tiene círculo en reposo: solo el signo. Al pasar el mouse, su anillo se dibuja alrededor; abierto, queda cerrado y en rojo profundo. El globo es papel casi opaco (lo de atrás apenas se adivina) con una línea roja fina arriba que se dibuja desde el «?», y el nombre en rojo. Es la más sobria y la que menos se transparenta.",
      movimiento: "El anillo se dibuja en medio segundo al pasar el mouse. La línea roja del globo corre desde el «?» hacia los lados.",
      demo: demoFino("V3", GASTOS),
      imagenes: fotos("V3"),
    },
  ],
};

const spec = {
  titulo: "Unificar · ronda 18 · el «?» de la cabecera",
  clave: "unificar-ronda18-vuelta2",
  css: "app.css",
  fotosAlFinal: true,
  estilos: ["demo18.css", "demo18b.css"],
  guion: "guion.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "Segunda vuelta: elegiste el globo (P2) y que los datos también vayan detrás del «?» (D2), y pediste algo más fino. Tres materiales para el mismo diseño. Toca el «?» de las demos (también en «Ver en oscuro»); las fotos son las pantallas reales con la propuesta puesta en vivo. Si quieres mezclar (el «?» de una y el globo de otra), dilo en el comentario.",
  familias: [{ id: "titulo-pagina", nombre: "La cabecera de una pantalla", pregunta: "El «?» y su globo.", grupos: [cara] }],
};
writeFileSync("spec-vuelta2.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec-vuelta2.json"], { stdio: "inherit" });
