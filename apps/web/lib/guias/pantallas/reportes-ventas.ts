// Guías de Ventas ▸ Reportes (ADR-0389; Felipe 2026-11-03): «Ventas del mes», «Ranking de prendas» y, donde venden dos empresas, «CAYLA y CLAURE» (ADR-0667). Mismas reglas que `vender.ts`: cada paso se
// ancla a un `data-guia` del código, el texto le habla a quien mira («tú») y explica PARA QUÉ sirve cada cosa. Las dos pantallas solo MIRAN (lo único
// que «hace» algo es bajar un archivo), así que el piloto no toca nada: la guía explica con la pieza encendida y la persona prueba después.

import type { Guia, PasoGuia } from "../tipos";

/** Las dos vistas de Reportes: la fila de pestañas es la misma en las dos pantallas. */
const PESTANAS: PasoGuia = {
  id: "pestanas",
  ancla: "reportes.pestanas",
  titulo: "Un reporte por pregunta",
  texto: "«Ventas del mes» te dice cuánto se vendió y cómo va contra el mes pasado. «Ranking de prendas» te dice cuáles salen más. Donde venden dos empresas, una tercera pestaña separa lo de cada una. Tocas una y cambias de reporte.",
};

/** El botón de la cabecera: baja lo que se ve. Solo aparece si hay algo que bajar. Cada pantalla baja una cosa distinta, y el paso lo dice. */
const DESCARGAR = (titulo: string, texto: string): PasoGuia => ({ id: "descargar", ancla: "reportes.descargar", opcional: true, titulo, texto });

export const GUIA_REPORTES_MES: Guia = {
  id: "vender.reportes",
  ruta: "/vender/reportes",
  titulo: "Reportes: ventas del mes",
  resumen: "Cuánto se vendió en el mes, contra el mes pasado, por día, por sede y por medio de pago.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "Las ventas del mes",
      texto: "Aquí ves cuánto se vendió en un mes, si va mejor o peor que el anterior, qué días se vendió más, qué tienda y qué categoría pesan más y cómo pagaron los clientes. Solo mira: no cambia nada.",
    },
    PESTANAS,
    DESCARGAR("Llévate el mes a Excel", "«Descargar el mes en Excel» baja la tabla de abajo, por tienda o por categoría, con su total, para guardarla o mandarla. No lleva costos ni márgenes: solo ventas."),
    {
      id: "mes",
      ancla: "reportes.mes",
      titulo: "El mes que miras",
      texto: "Con las flechas pasas al mes de al lado y, si tocas el nombre, eliges cualquier mes. Todo lo de abajo cambia con él. En el mes en curso se cuenta hasta hoy.",
    },
    {
      id: "tienda",
      ancla: "reportes.tienda",
      opcional: true,
      titulo: "Una tienda o todas",
      texto: "Si te toca ver todas las tiendas, aquí eliges una para mirar solo lo suyo. Quien ve una sola tienda no tiene este filtro: ya mira la suya.",
    },
    {
      id: "empresa",
      ancla: "reportes.empresa",
      opcional: true,
      titulo: "CAYLA o CLAURE",
      texto: "En Lima se vende de las dos empresas en la misma caja. Aquí miras solo una: las cifras, los gráficos y la tabla cuentan lo cobrado de sus prendas, y «Cómo se pagó», lo suyo de cada pago.",
    },
    {
      id: "cifras",
      ancla: "reportes.cifras",
      titulo: "Las cuatro cifras",
      texto: "Lo vendido (con IGV), cuántas ventas fueron, lo que deja cada venta, y cuántas prendas salieron. Cada una dice si subió o bajó contra los mismos días del mes pasado. Si miras Lima o todas, una línea dice cuánto es de CLAURE.",
    },
    {
      id: "cuadre",
      ancla: "reportes.cuadre",
      opcional: true,
      titulo: "Por qué Finanzas da otra cifra",
      texto: "Aquí lo vendido va con IGV y con lo de CLAURE. En Finanzas, «Vendiste con IGV» también los trae, y «Lo que vendiste» va sin los dos. «Cómo cuadra con Finanzas» te lleva al cuadro que une las dos cifras paso a paso. Solo lo ve quien tiene Resumen y estados financieros.",
    },
    {
      id: "por-dia",
      ancla: "reportes.por-dia",
      titulo: "Qué días se vende más",
      texto: "Una barra por día; la más alta es tu mejor día. La raya punteada es el promedio diario del mes que miras (en el mes en curso, del día 1 a hoy). Las barras por encima de ella van mejor que tu día normal.",
    },
    {
      id: "mes-a-mes",
      ancla: "reportes.mes-a-mes",
      opcional: true,
      titulo: "Mes a mes",
      texto: "Lo vendido en cada mes, uno al lado del otro, hasta doce meses. Tocas un mes y la pantalla se va a ese mes. Solo salen los meses en que ya se vendía.",
    },
    {
      id: "pagos",
      ancla: "reportes.pagos",
      opcional: true,
      titulo: "Cómo pagaron",
      texto: "Lo cobrado por cada medio de pago: efectivo, tarjeta, Yape… y qué parte del total es cada uno. Sirve para saber cuánta plata entra por dónde. Con CAYLA o CLAURE elegida, es lo de esa empresa en cada pago.",
    },
    {
      id: "tabla",
      ancla: "reportes.tabla",
      titulo: "Quién vendió cuánto",
      texto: "El mes partido por tienda, con lo que vendió (con IGV), cuántas ventas, el ticket y las prendas, o por categoría, con su parte del total. La última fila es el total y es igual a la cifra de arriba.",
    },
    {
      id: "corte",
      ancla: "reportes.corte",
      opcional: true,
      titulo: "Por tienda o por categoría",
      texto: "Cambias cómo se corta la tabla: por tienda para ver quién vende más, por categoría para ver qué se vende más. Es el mismo mes, visto de otra forma.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes leer las ventas del mes. Para saber qué prendas lo explican, pasa a «Ranking de prendas». Para repasarlo: Mi perfil ▸ Demo ▸ Reportes de ventas.",
    },
  ],
};

export const GUIA_REPORTES_RANKING: Guia = {
  id: "vender.reportes.ranking",
  ruta: "/vender/reportes/ranking",
  titulo: "Reportes: ranking de prendas",
  resumen: "Qué prendas se venden más, con las fechas y los filtros que quieras.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "Lo que más se vende",
      texto: "Aquí ves qué prendas salen más en las fechas que elijas, de la que más a la que menos, y si van mejor o peor que antes. Sirve para saber qué reponer y qué dejar de insistir. Solo mira: no cambia nada.",
    },
    PESTANAS,
    DESCARGAR("Llévate el ranking a Excel", "«Descargar el ranking en Excel» baja todas las filas con tus filtros, no solo las de esta página, para guardarlas o mandarlas. No lleva costos ni márgenes: solo ventas."),
    {
      id: "buscador",
      ancla: "ranking.buscador",
      titulo: "Busca un modelo",
      texto: "Escribe el nombre o el código de una prenda y el ranking se queda con ella. Busca mientras escribes, sin apretar nada.",
    },
    {
      id: "fechas",
      ancla: "ranking.fechas",
      titulo: "Las fechas",
      texto: "Los últimos 7, 30 o 90 días, un mes entero o las fechas que tú elijas. Todo lo de abajo se calcula con ese período y se compara con el período anterior del mismo largo.",
    },
    {
      id: "tienda",
      ancla: "ranking.tienda",
      opcional: true,
      titulo: "Una tienda o todas",
      texto: "Si ves todas las tiendas, aquí eliges una para ver qué se vende en esa. Quien ve una sola tienda ya mira la suya y no tiene este filtro.",
    },
    {
      id: "empresa",
      ancla: "ranking.empresa",
      opcional: true,
      titulo: "CAYLA o CLAURE",
      texto: "En Lima, mira solo las prendas de una empresa: el ranking, las tallas y colores y lo que queda son de esa empresa.",
    },
    {
      id: "nivel",
      ancla: "ranking.nivel",
      titulo: "Por modelo o por color y talla",
      texto: "«Por modelo» junta todos los colores y tallas de una prenda. «Por color y talla» las separa: sirve para saber exactamente qué talla y color pedir.",
    },
    {
      id: "filtros",
      ancla: "ranking.filtros",
      titulo: "Afina con filtros",
      texto: "Categoría, marca, talla y color: cada uno deja solo lo que coincide. Los que pongas salen debajo como etiquetas que se quitan con un toque, y «Limpiar todo» las quita juntas.",
    },
    {
      id: "orden",
      ancla: "ranking.orden",
      titulo: "Qué ordena el ranking",
      texto: "«Prendas» ordena por cuántas salieron; «Soles», por cuánta plata dejaron. Una prenda cara puede vender menos y aun así dejar más.",
    },
    {
      id: "cifras",
      ancla: "ranking.cifras",
      titulo: "Las cuatro cifras",
      texto: "Cuántas prendas se vendieron con tus filtros, cuánto sumaron, cuántos modelos salieron y qué parte de la venta sostienen las diez primeras: si es alta, unas pocas prendas cargan con todo.",
    },
    {
      id: "tabla",
      ancla: "ranking.tabla",
      titulo: "El ranking",
      texto: "Una fila por prenda: cuánto se vendió, qué parte del total es, si sube o baja contra el período anterior y cuánto stock queda en las tiendas. Si alcanza para poco, la fila lo avisa: es lo que hay que reponer primero.",
    },
    {
      id: "tallas",
      ancla: "ranking.tallas",
      opcional: true,
      titulo: "Las tallas que se llevan",
      texto: "Lo mismo del ranking, cortado por talla y con tus mismos filtros: te dice qué tallas piden más los clientes.",
    },
    {
      id: "colores",
      ancla: "ranking.colores",
      opcional: true,
      titulo: "Los colores que se llevan",
      texto: "Igual, por color. La frase de abajo te dice cuál es el que más sale y cuál le sigue.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes qué prendas se llevan más y cómo afinarlo. Para repasarlo: Mi perfil ▸ Demo ▸ Ranking de prendas.",
    },
  ],
};

export const GUIA_REPORTES_EMPRESAS: Guia = {
  id: "vender.reportes.empresas",
  ruta: "/vender/reportes/empresas",
  titulo: "Reportes: CAYLA y CLAURE",
  resumen: "Lo vendido de cada empresa en la tienda, dónde entró cada cobro y venta por venta.",
  pasos: [
    {
      id: "bienvenida",
      ancla: null,
      titulo: "Dos empresas, una caja",
      texto: "En Lima se venden prendas de CAYLA y de CLAURE en la misma caja. Aquí ves cuánto vendió cada una, en qué cuenta entró cada cobro y, si bajas, cada venta con sus prendas. Solo mira: no cambia nada.",
    },
    PESTANAS,
    {
      id: "periodo",
      ancla: "empresas.periodo",
      titulo: "Qué días miras",
      texto: "Un mes, todo desde que llegó CLAURE, o las fechas que tú elijas. Todo lo de abajo cambia con lo que elijas.",
    },
    { id: "mes", ancla: "empresas.mes", opcional: true, titulo: "El mes", texto: "Con las flechas pasas al mes de al lado; si tocas el nombre, eliges cualquier mes." },
    { id: "fechas", ancla: "empresas.fechas", opcional: true, titulo: "Tus fechas", texto: "El primer y el último día, los dos incluidos. Hasta seis meses de una vez." },
    {
      id: "tienda",
      ancla: "empresas.tienda",
      opcional: true,
      titulo: "La tienda",
      texto: "Solo salen las tiendas donde venden dos empresas.",
    },
    {
      id: "cifras",
      ancla: "empresas.cifras",
      titulo: "Las cuatro cifras",
      texto: "Lo vendido en la tienda, lo de cada empresa (con su parte del total) y las ventas mixtas: las que llevan prendas de las dos. Una venta mixta cuenta en las dos empresas.",
    },
    {
      id: "plata",
      ancla: "empresas.plata",
      titulo: "¿Dónde está la plata?",
      texto: "Cada cobro en la cuenta donde entró: el efectivo en el cajón, el Yape en el BCP y la tarjeta y el QR en Izipay, que deposita en Interbank. Debajo, cuánto de CLAURE entró a cuentas de CAYLA. Toca una fila para ver sus ventas.",
    },
    {
      id: "lados",
      ancla: "empresas.lados",
      titulo: "Cada empresa por su lado",
      texto: "Cómo le pagaron a cada una y, mes a mes, cuántas ventas y prendas, y cuántas salieron con boleta o con nota de venta.",
    },
    {
      id: "ventas",
      ancla: "empresas.ventas",
      titulo: "Venta por venta",
      texto: "Cada venta con su comprobante, cómo se pagó y cuánto es de cada empresa. La última fila suma lo que ves.",
    },
    {
      id: "filtros",
      ancla: "empresas.filtros",
      titulo: "Busca lo que te importa",
      texto: "Filtra por empresa, medio, cuenta, comprobante o solo las mixtas. «Limpiar filtros» vuelve a todas.",
    },
    {
      id: "prendas",
      ancla: "empresas.prendas",
      opcional: true,
      titulo: "Las prendas de una venta",
      texto: "Al tocar una venta se abre: cada prenda con su talla, su color y de qué empresa es, y cómo se pagó.",
    },
    {
      id: "historial",
      ancla: "empresas.historial",
      opcional: true,
      titulo: "La venta en Historial",
      texto: "Te lleva a esa venta en Historial, donde puedes ver su comprobante o corregirla.",
    },
    {
      id: "fin",
      ancla: null,
      titulo: "¡Listo!",
      texto: "Ya sabes dónde está la plata de cada empresa. Para repasarlo: Mi perfil ▸ Demo ▸ Reportes de ventas.",
    },
  ],
};
