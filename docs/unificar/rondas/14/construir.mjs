// Arma spec.json de la ronda 14 (la línea, las barras por tiempo, la barra a escala y la dona) y llama a elegir.mjs. Usa el CSS real bajado hoy.
//   node construir.mjs   (desde esta carpeta)
import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as m from "./piezas.mjs";

const fotos = (prefijo) =>
  existsSync("img")
    ? readdirSync("img")
        .filter((f) => f.startsWith(`${prefijo}-`))
        .sort()
        .map((f) => ({ src: `img/${f}`, pie: f.replace(/^[a-z]+-\d+-/, "").replace(/\.png$/, "").replace(/_/g, " ") }))
    : [];
writeFileSync("guion.js", readFileSync("../elegir-ronda9/demo9.js", "utf8") + "\n" + readFileSync("demo14.js", "utf8"));

const CON_ADR =
  "Varias tienen su ADR, que dice qué muestran (Caja, ADR-0319; Rendimiento, ADR-0325; el Historial, ADR-0147; el plan de campaña, ADR-0372; Proveedores, ADR-0128): P1 las lleva a la misma pieza sin cambiar qué dicen. Si quieres que alguna conserve su cara, escríbelo en el comentario. Los del Observatorio, Análisis y Finanzas no entran.";

const linea = {
  id: "linea",
  nombre: "1 · La línea",
  pregunta: "Una línea que muestra cómo va algo en el tiempo, casi siempre contra una referencia (ayer, la meta, el plan). ¿Cómo se ve?",
  ayuda: `Hoy hay cuatro líneas grandes y una mini, ninguna compartida: Caja (hoy contra ayer), Rendimiento (el mes contra la meta), el plan de campaña (lo vendido contra el plan) y la ficha de un proveedor (el costo, compra a compra); cada una con su grosor, su punteado, sus colores y su movimiento. ${CON_ADR} Pasa el mouse por la línea.`,
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · La línea de tinta con su área, la referencia punteada, ejes cortos y una guía al pasar el mouse (mi recomendación)",
      detalle:
        "Lo de hoy en tinta (2,5 px) con un área suave debajo; la referencia (ayer, la meta, el plan) en taupe punteado, siempre igual; tres rayas de fondo con sus montos y cinco marcas de tiempo; el último punto con su cifra en serif. Al pasar el mouse, una guía salta al punto más cercano y un globito dice la hora o el día con las dos cifras. En una fila de una lista, la mini de 46 × 18 sin ejes (la de Proveedores). Lo que está bien o mal (vas arriba o abajo de ayer) lo dice la frase de la pantalla, no el color de la línea.",
      movimiento: "Se dibuja de izquierda a derecha una vez al verse (900 ms), el área aparece detrás y el punto final con su cifra al llegar; la guía sigue al mouse. La mini se vuelve a dibujar al pasar por su fila.",
      demo: m.una("Caja y Rendimiento con la misma línea; pasa el mouse", m.lineaDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Solo las dos líneas y la cifra final",
      detalle: "Sin área, sin ejes y sin guía: la línea de tinta, la referencia punteada y la cifra del último punto. Más limpia, pero no se puede leer cuánto se vendió a una hora.",
      movimiento: "Se dibuja una vez al verse.",
      demo: m.una("Las mismas dos", m.lineaDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: cuatro líneas distintas",
      detalle: "Cada pantalla la suya.",
      movimiento: "Caja se revela en 1,1 s; la del proveedor se dibuja; Rendimiento y el plan, quietas.",
      donde: "Caja, Rendimiento, el plan de campaña, la ficha de un proveedor (y la mini de Proveedores).",
      demo: m.una("Las cuatro de hoy, recreadas con los mismos datos", m.lineaDemos.A()),
      imagenes: fotos("linea"),
    },
  ],
};

const barras = {
  id: "barras",
  nombre: "2 · Las barras por hora, día o mes",
  pregunta: "Una barra por hora, por día, por semana o por mes: cuánto se vendió o cuánto vence en cada una. ¿Cómo se ven?",
  ayuda: `Hoy hay once maneras: las ventas por hora de Rendimiento, del cierre de una caja y de Comercial son tres gráficos distintos para lo mismo (otro alto, otro color para la mejor hora, otro movimiento); las barras por día de Rendimiento, de los cierres del mes y del plan de campaña; lo facturado por mes de un proveedor; los pagos que vencen en Por pagar; y los «hilos» del Historial. ${CON_ADR} Pasa el mouse por las barras.`,
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · Barras en arena con la que importa en tinta, su cifra arriba y un globito al pasar el mouse (mi recomendación)",
      detalle:
        "Todas en arena oscura (el color de gráfico del sistema), con las esquinas de arriba redondas y un ancho máximo de 28 px; la que importa (la hora de ahora, el mejor día, el mes en curso) en tinta, con su cifra encima. La meta de cada barra, una rayita taupe. Cuando se lee el monto de cada una (los pagos que vencen), la cifra va sobre todas. El rojo o el ámbar los pone la pantalla (lo vencido). Al pasar el mouse, la barra se oscurece y un globito dice su hora o su día y su monto.",
      movimiento: "Crecen desde abajo en cascada una vez al verse (560 ms, 34 ms entre barras); la cifra aparece al final.",
      demo: m.una("Por hora, por día con la meta, por mes y por semana con montos", m.barrasDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · «Hilos»: barras finas con un nudo en la que importa",
      detalle: "Barras de 4 px en taupe suave, la que importa más oscura y con un nudo arriba (la cara del Historial). Elegante y liviana, pero en una tienda con pocas horas cuesta comparar dos hilos.",
      movimiento: "Crecen desde abajo en cascada.",
      demo: m.una("Las mismas cuatro", m.barrasDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: once maneras",
      detalle: "Cada pantalla la suya.",
      movimiento: "Unas crecen al llegar, otras están quietas; las de Por pagar se ensanchan al pasar el mouse.",
      donde: "Rendimiento, el cierre de una caja, Comercial, Por pagar, Comprobantes, la vista rápida de un proveedor, los cierres del mes, el plan de campaña, el Historial.",
      demo: m.una("Seis de las de hoy, recreadas con los mismos datos", m.barrasDemos.A()),
      imagenes: fotos("barras"),
    },
  ],
};

const escala = {
  id: "escala",
  nombre: "3 · La barra que compara a escala",
  pregunta: "Una fila por cosa (un proveedor, una talla, una tienda) con una barra a escala de la mayor. ¿Cómo se ve?",
  ayuda:
    "Hoy hay cuatro caras: Proveedores (3 px bajo el saldo, lo vencido en rojo), la ficha del Taller (8 px en verde o ámbar), el plan de compra (8 px en tinta al 60 %, la primera en rojo) y el plan del piso (6 px, ADR-0352). Se parece a la barra de avance de la ronda 13, pero no mide un avance: la más larga no está «lista».",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · La barra de avance de la ronda 13, en tinta y sin pasar a verde (mi recomendación)",
      detalle:
        "La misma pieza que ya elegiste en la ronda 13, en tinta: pista de arena, relleno en tinta, a escala de la mayor, el nombre a la izquierda y la cifra a la derecha. Una barra es una barra: la colaboradora la lee igual en todo el ERP. Lo vencido o lo que falta lo pinta la pantalla.",
      movimiento: "Se llena una vez al verse, en cascada.",
      demo: m.una("Proveedores, tallas y tiendas", m.escalaDemos.P1()),
      imagenes: [],
    },
    {
      id: "P2", tipo: "propuesta", entera: true,
      nombre: "P2 · Sin pista: la mayor en tinta y las demás en arena",
      detalle: "Barras de 10 px sin pista, la mayor en tinta y el resto en arena oscura (la cara de un ranking). Se ve quién gana de un vistazo, pero es otra pieza más que aprender.",
      movimiento: "Crecen desde la izquierda en cascada.",
      demo: m.una("Proveedores, tallas y tiendas", m.escalaDemos.P2()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: cuatro caras",
      detalle: "Cada pantalla la suya.",
      movimiento: "Unas crecen al llegar, otras están quietas.",
      donde: "Proveedores, la ficha del Taller, el plan de compra, el plan del piso.",
      demo: m.una("Las de hoy", m.escalaDemos.A()),
      imagenes: fotos("escala"),
    },
  ],
};

const dona = {
  id: "dona",
  nombre: "4 · La dona de lo cobrado",
  pregunta: "El cierre de una caja reparte lo cobrado por medio de pago en una dona. ¿Pasa a la barra apilada, que ya es la pieza del reparto?",
  ayuda:
    "Es la única dona del ERP. Lo mismo («Cómo se pagó») el Historial ya lo dibuja con la barra apilada que elegiste en la ronda 5b, con su leyenda de medio, porcentaje y monto.",
  opciones: [
    {
      id: "P1", tipo: "propuesta", entera: true,
      nombre: "P1 · La barra apilada con su leyenda, como «Cómo se pagó» del Historial (mi recomendación)",
      detalle: "Una barra de 12 px con un tramo por medio de pago en su color, y debajo la lista: medio, porcentaje y monto. El total arriba, en serif.",
      movimiento: "El de la barra apilada: entra tramo a tramo.",
      demo: m.una("El cierre de una caja", m.donaDemos.P1()),
      imagenes: [],
    },
    {
      id: "A", tipo: "hoy", entera: true,
      nombre: "A · Hoy: la dona",
      detalle: "Una dona de 150 px con el total al centro y la lista al lado.",
      movimiento: "Quieta.",
      donde: "El detalle de un cierre de caja (Caja ▸ Historial).",
      demo: m.una("La de hoy", m.donaDemos.A()),
      imagenes: fotos("dona"),
    },
  ],
};

const spec = {
  titulo: "Unificar · ronda 14 · la línea, las barras, la barra a escala y la dona",
  clave: "unificar-ronda14",
  css: "app.css",
  fotosAlFinal: true,
  estilos: ["../elegir-ronda9/demo9.css", "demo14.css"],
  guion: "guion.js",
  claseHtml: readFileSync("clase.txt", "utf8").trim(),
  nota: "Los gráficos que quedaban después de la ronda 13: la línea, las barras por hora, día o mes, la barra que compara a escala y la dona de lo cobrado. Las cifras son de ejemplo. Todo lo de «Pruébalo» está VIVO con el CSS real del ERP de hoy: pasa el mouse por las líneas y las barras. Elige una tarjeta por pregunta; si quieres mezclar o que una pantalla conserve su gráfico, escríbelo en el comentario.",
  familias: [
    { id: "grafico.linea", nombre: "La línea", pregunta: "Cómo va algo en el tiempo, contra una referencia.", grupos: [linea] },
    { id: "grafico.barras", nombre: "Las barras por tiempo", pregunta: "Una barra por hora, día, semana o mes.", grupos: [barras] },
    { id: "grafico.escala", nombre: "La barra a escala", pregunta: "Comparar cosas a escala de la mayor.", grupos: [escala] },
    { id: "grafico.barra", nombre: "La dona de lo cobrado", pregunta: "El reparto de lo cobrado por medio de pago.", grupos: [dona] },
  ],
};
writeFileSync("spec.json", JSON.stringify(spec, null, 1));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { stdio: "inherit" });
