// Las familias de piezas que `/unificar` compara (ADR-0358): la ÚNICA definición de «qué cuenta como la misma función». La usan
// el motor del censo (`cli.mjs`, que le pasa las funciones de botón al detector de la página), la lámina de comparación y la
// prueba del CI (`lib/unificar.test.ts`), que hace cumplir lo que Felipe ya decidió.
//
// Una FAMILIA agrupa elementos que hacen lo mismo para quien usa el ERP (un «Cancelar», una insignia de estado, unas pestañas),
// aunque el código los dibuje distinto. Una VARIANTE es una forma concreta de dibujarla (alto, radio, fondo, letra…): el censo
// cuenta cuántas variantes tiene cada familia y dónde vive cada una. Lo que se decide es la familia: «de aquí en adelante, las
// pestañas son ESTA pieza», y la prueba del CI falla si alguien vuelve a dibujarlas a mano.
//
// Cómo se agrega una decisión: ver `.claude/skills/unificar/referencia/decision.md`. En corto: la familia recibe `decision` con
// la pieza elegida, su ADR, las `firmas` (expresiones que reconocen una variante a mano en el código) y la `deuda` (los archivos
// que hoy todavía la dibujan a mano: solo puede bajar).

/**
 * Las funciones de un botón, reconocidas por lo que DICE (texto, aria-label o title, sin tildes ni mayúsculas). El orden importa:
 * gana la primera que coincide. «otra» no es una función: esos botones solo entran a la familia `boton` (estilos de botón).
 */
export const FUNCIONES = [
  { id: "volver", nombre: "Volver", patron: "^(volver|regresar|atras)\\b|^←" },
  // «Cerrar caja», «Cerrar conteo» o «Cerrar el mes» son acciones del negocio, no cerrar una hoja: solo cuenta el «Cerrar» a secas.
  { id: "cerrar", nombre: "Cerrar (la hoja o el aviso)", patron: "^cerrar$|^cerrar (esta |este |la |el )?(ventana|hoja|aviso|panel|detalle|vista|modal)\\b|^[×✕✖]$" },
  { id: "cancelar", nombre: "Cancelar", patron: "^cancelar\\b" },
  // «Registrar devolución S/ 75» o «Registrar pago» cierran una operación con dinero: confirman, no crean algo nuevo (censo del
  // mostrador, 2026-10-07).
  { id: "guardar", nombre: "Guardar / Confirmar", patron: "^(guardar|confirmar|aceptar|aplicar|listo)\\b|^registrar (la |el )?(devolucion|cambio|venta|pago|cobro)\\b" },
  // Antes que «eliminar»: «Quitar filtros» limpia la lista, no borra nada.
  { id: "limpiar", nombre: "Limpiar filtros", patron: "^(limpiar|restablecer)\\b|^(quitar|borrar) (los |todos los )?filtros\\b" },
  // «Agregar Blusa Emma talla S» es la talla que se suma al ticket en Vender, no crear algo: no es «Nuevo» (censo del mostrador, 2026-10-07).
  { id: "nuevo", nombre: "Nuevo / Agregar / Registrar", patron: "^(\\+\\s*)?(nuevo|nueva|agregar|anadir|crear|registrar)\\b(?!.*\\btalla\\b)|^\\+$" },
  { id: "editar", nombre: "Editar", patron: "^(editar|modificar)\\b" },
  { id: "eliminar", nombre: "Eliminar / Quitar / Anular", patron: "^(eliminar|borrar|quitar|anular|desactivar|archivar|descartar)\\b" },
  { id: "buscar", nombre: "Buscar", patron: "^buscar\\b" },
  { id: "filtrar", nombre: "Filtrar", patron: "^(filtrar|filtros?|mas filtros)\\b" },
  { id: "exportar", nombre: "Exportar / Descargar", patron: "^(exportar|descargar)\\b|^(csv|excel)$" },
  { id: "imprimir", nombre: "Imprimir", patron: "^(imprimir|reimprimir)\\b" },
  // Antes que «ver»: «Ver más» trae más filas, no abre un detalle.
  { id: "siguiente", nombre: "Siguiente / Cargar más", patron: "^(siguiente|cargar mas|ver mas|mostrar mas)\\b|^[›»→]$" },
  { id: "anterior", nombre: "Anterior", patron: "^anterior\\b|^[‹«]$" },
  { id: "ver", nombre: "Ver / Abrir el detalle", patron: "^(ver|abrir|detalle|mostrar)\\b" },
  { id: "menu", nombre: "Menú de acciones (⋯)", patron: "^(mas acciones|acciones|opciones|mas opciones)$|^[⋯…]$|^\\.\\.\\.$" },
  { id: "copiar", nombre: "Copiar", patron: "^copiar\\b" },
  { id: "deshacer", nombre: "Deshacer", patron: "^deshacer\\b" },
];

/**
 * Un botón que es SOLO un icono y no dice nada (sin texto, sin aria-label ni title) se reconoce por su dibujo de lucide. Es poco
 * fiable a propósito: un botón sin nombre es además una falta de accesibilidad, y el informe lo dice.
 */
/** @type {Record<string, string>} */
export const ICONO_A_FUNCION = {
  x: "cerrar",
  "circle-x": "cerrar",
  "arrow-left": "volver",
  search: "buscar",
  plus: "nuevo",
  pencil: "editar",
  "pencil-line": "editar",
  "square-pen": "editar",
  trash: "eliminar",
  "trash-2": "eliminar",
  printer: "imprimir",
  download: "exportar",
  copy: "copiar",
  "chevron-left": "anterior",
  "chevron-right": "siguiente",
  ellipsis: "menu",
  "more-horizontal": "menu",
  "more-vertical": "menu",
  "ellipsis-vertical": "menu",
  filter: "filtrar",
  "undo-2": "deshacer",
};

/** Cómo se compara un texto: minúsculas, sin tildes, espacios simples. @param {unknown} t */
export const normalizar = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const EXPRESIONES = FUNCIONES.map((f) => ({ id: f.id, re: new RegExp(f.patron) }));

/**
 * La función de un botón por lo que dice; si no dice nada, por su icono. `null` = «otra» (no se agrupa por función).
 * @param {string} texto lo que dice el botón (su texto, aria-label o title)
 * @param {string | null} [icono] el nombre de su icono de lucide, si es un botón de solo icono
 * @returns {string | null}
 */
export function funcionDe(texto, icono = null) {
  const t = normalizar(texto);
  if (t) {
    const f = EXPRESIONES.find((e) => e.re.test(t));
    if (f) return f.id;
    return null;
  }
  return (icono && ICONO_A_FUNCION[icono]) || null;
}

/**
 * Las familias. `pieza` es lo que el sistema ya ofrece hoy para esa función (si ofrece algo); `gobierna`, las reglas que ya
 * decidieron algo sobre ella (una variante que existe POR una decisión no es un descuido: se le pregunta a Felipe, no se
 * «corrige»). `decision` queda en null hasta que Felipe elige.
 */
const BASE = [
  {
    id: "boton",
    grupo: "Botones",
    nombre: "Estilos de botón",
    funcion: "Todo lo que se presiona para hacer algo, sin importar qué hace. Cuenta cuántos estilos distintos de botón hay.",
    pieza: "`btn-cayla` + `btn-primario|secundario|peligro|sutil|enlace` (app/globals.css)",
    gobierna: ["ADR-0169"],
  },
  {
    id: "estado",
    grupo: "Etiquetas",
    nombre: "Insignias de estado",
    funcion: "La etiqueta corta que dice en qué estado está algo: «Pagado», «Pendiente», «Vencida», «Activo».",
    pieza: "`<Chip>` (components/ui/Chip.tsx)",
    gobierna: ["ADR-0169"],
    // El tono (verde, ámbar, rojo) es el DATO que la insignia comunica, no su forma: no separa variantes.
    sinColorEnLaClave: true,
  },
  {
    id: "contador",
    grupo: "Etiquetas",
    nombre: "Contadores (globito con número)",
    funcion: "El número chico que avisa cuántos hay: avisos sin leer, pendientes de una pestaña.",
    pieza: "`<Insignia>` (components/ui/Insignia.tsx)",
    gobierna: [],
  },
  {
    id: "filtro",
    grupo: "Filtros y búsqueda",
    nombre: "Píldoras de filtro",
    funcion: "El botón redondeado que prende o apaga un filtro de la lista.",
    pieza: "`pildora-cayla`, `<BotonFiltro>`, `<FiltrosPildora>`",
    gobierna: ["ADR-0169", "ADR-0209"],
  },
  {
    id: "buscador",
    grupo: "Filtros y búsqueda",
    nombre: "Buscadores",
    funcion: "La caja donde se escribe para buscar en una lista.",
    pieza: "`useBusquedaEnUrl` + `SenalBuscando` (components/ui/BusquedaEnUrl.tsx)",
    gobierna: ["ADR-0149"],
  },
  {
    id: "pestanas",
    grupo: "Navegación",
    nombre: "Pestañas y segmentos",
    funcion: "Elegir una vista entre varias de la misma pantalla, con una marcada como activa.",
    pieza: "Tres, una por pregunta (ADR-0358): `<Pestanas>` (vista), `pildora-cayla` (filtro y período), `SegmentoEnlaces` / `SegmentoDeslizante forma=\"modo\"` (modo y ordenar)",
    gobierna: [],
  },
  {
    id: "paginacion",
    grupo: "Navegación",
    nombre: "Paginación",
    funcion: "Pasar de página en una lista larga.",
    pieza: "`<PaginacionLocal>` (components/ui/PaginacionLocal.tsx)",
    gobierna: ["ADR-0185"],
  },
  {
    id: "enlace",
    grupo: "Navegación",
    nombre: "Enlaces de texto",
    funcion: "Un texto que lleva a otra pantalla («Ver todo», «Ir a Traslados»).",
    pieza: "`btn-enlace` (app/globals.css)",
    gobierna: ["ADR-0169"],
  },
  {
    id: "campo",
    grupo: "Formularios",
    nombre: "Cajas de texto",
    funcion: "Donde se escribe un dato en un formulario (nombre, monto, fecha).",
    pieza: "`CampoTexto` / `caja` (components/ui/campos.tsx)",
    gobierna: ["ADR-0169", "ADR-0195"],
  },
  {
    id: "etiqueta-campo",
    grupo: "Formularios",
    nombre: "Títulos de campo",
    funcion: "El texto sobre una caja que dice qué dato va ahí.",
    pieza: "`Campo` (components/ui/campos.tsx)",
    gobierna: ["ADR-0284"],
  },
  {
    id: "combo",
    grupo: "Formularios",
    nombre: "Desplegables (combos)",
    funcion: "Elegir una opción de una lista.",
    pieza: "`CampoSelect`, `Desplegable`, `ComboBuscable`, `SelectFin` (ADR-0209)",
    gobierna: ["ADR-0209"],
  },
  {
    id: "casilla",
    grupo: "Formularios",
    nombre: "Casillas e interruptores",
    funcion: "Marcar sí o no.",
    pieza: "`<Casilla>`, `toggle` (components/ui/)",
    gobierna: [],
  },
  {
    id: "tabla",
    grupo: "Datos",
    nombre: "Tablas",
    funcion: "Una lista de registros en filas y columnas.",
    pieza: "`<Tabla>` (components/ui/Tabla.tsx); en Finanzas, `fin-tabla` (ADR-0195)",
    gobierna: ["ADR-0169", "ADR-0195"],
  },
  {
    id: "cifra",
    grupo: "Datos",
    nombre: "Tarjetas de cifra",
    funcion: "Un número grande con su nombre arriba: «Vendido hoy S/ 1 240».",
    pieza: "`<TarjetaCifra>` (components/ui/TarjetaCifra.tsx), con una marca por lo que hace (ADR-0358); `TarjetaKpiVidrio` solo en Facturación (ADR-0124)",
    gobierna: ["ADR-0169"],
  },
  {
    id: "grafico",
    grupo: "Datos",
    nombre: "Gráficos",
    funcion: "Barras, líneas o donas que muestran una evolución o un reparto.",
    pieza: "`Graficos`, `BarrasMensuales`, `Sparkline`, `DonaMetodos` (components/ui/)",
    gobierna: ["ADR-0169"],
  },
  {
    id: "grafico.barra",
    grupo: "Datos",
    nombre: "Barra apilada",
    funcion: "Una barra que reparte un total en partes de un solo color (la deuda por vencimiento, las unidades del piso por estado, cómo se pagó). Se reconoce por su forma: una fila baja y ancha de tramos sin texto cuyos anchos suman el de la fila.",
    pieza: "`<BarraApilada>` (components/ui/BarraApilada.tsx), ADR-0358; las de Análisis (ADR-0357) y el aviso de cierre de Caja (ADR-0359) existen por una decisión y esperan la palabra de Felipe",
    gobierna: ["ADR-0169", "ADR-0128", "ADR-0357", "ADR-0359"],
  },
  {
    id: "titulo-pagina",
    grupo: "Textos",
    nombre: "Títulos de pantalla",
    funcion: "El nombre grande de la pantalla, arriba.",
    pieza: "`<EncabezadoPagina>` en todo el ERP; `<CabeceraPantalla>` solo en Finanzas (decidido el 2026-10-14)",
    gobierna: ["ADR-0220", "ADR-0195", "ADR-0254"],
  },
  {
    id: "titulo-seccion",
    grupo: "Textos",
    nombre: "Títulos de sección",
    funcion: "El título de un bloque dentro de una pantalla o de una hoja.",
    pieza: null,
    gobierna: [],
  },
  {
    id: "vacio",
    grupo: "Textos",
    nombre: "Estados vacíos",
    funcion: "Lo que se ve cuando una lista no tiene nada: «Aún no hay ventas hoy».",
    pieza: null,
    gobierna: ["ADR-0350"],
  },
  {
    id: "aviso",
    grupo: "Textos",
    nombre: "Avisos y notas",
    funcion: "Un recuadro que avisa algo o explica: una nota en hueso, una alerta.",
    pieza: "`nota-cayla` (app/globals.css), `Avisos` (components/ui/Avisos.tsx)",
    gobierna: ["ADR-0169", "ADR-0149"],
  },
  {
    id: "icono",
    grupo: "Iconos",
    nombre: "Iconos",
    funcion: "El mismo dibujo (una X, una flecha, una lupa) con distinto tamaño, grosor o fuente.",
    pieza: "lucide-react, `strokeWidth={1.5}`",
    gobierna: [],
    // El color de un icono lo hereda del texto que acompaña: no separa variantes.
    sinColorEnLaClave: true,
  },
  {
    id: "modal",
    grupo: "Hojas",
    nombre: "Hojas y modales",
    funcion: "La ventana que se abre encima de la pantalla.",
    pieza: "`<Modal>` / `<ModalRuta>` (components/ui/Modal.tsx): una cara, tres anchos (`tamano`) y una salida a la vista (decidido el 2026-10-14)",
    gobierna: ["ADR-0136", "ADR-0358"],
  },
  {
    id: "avatar",
    grupo: "Personas",
    nombre: "Avatares",
    funcion: "El círculo con la foto o las iniciales de una persona.",
    pieza: "`<AvatarPersona>` (components/ui/AvatarPersona.tsx)",
    gobierna: [],
  },
];

/** Las funciones de botón que el sistema YA resuelve con una pieza propia (las demás se dibujan con `btn-cayla`). */
const PIEZA_DE_FUNCION = {
  volver: "`<Volver>` (components/ui/Volver.tsx): forma `boton` en el pie de EncabezadoPagina (ADR-0220), forma `enlace` en las demás",
};

const ACCIONES = FUNCIONES.map((f) => ({
  id: `accion.${f.id}`,
  grupo: "Botones por función",
  nombre: `Botón «${f.nombre}»`,
  funcion: `Todos los botones que hacen «${f.nombre}». Si se ven distinto en dos pantallas, alguien tiene que aprender dos veces lo mismo.`,
  pieza: PIEZA_DE_FUNCION[f.id] ?? null,
  gobierna: f.id === "volver" ? ["ADR-0169", "ADR-0220"] : ["ADR-0169"],
}));

/**
 * Las decisiones de Felipe, por familia. Se escriben aquí (no en la lista de arriba) para que una decisión sea un cambio chico y
 * fácil de revisar. Forma:
 *
 *   "pestanas": {
 *     fecha: "2026-10-06",
 *     adr: "docs/adr/0358-unificar-una-funcion-una-pieza.md",
 *     registro: "docs/unificar/pestanas.md",
 *     elegida: "B · SegmentoDeslizante",            // o «propuesta»
 *     pieza: "components/ui/SegmentoDeslizante.tsx", // la pieza de esa función desde hoy (relativa a apps/web)
 *     tambien: ["components/ui/IndicadorDeslizante.tsx"], // otras piezas elegidas o que la pieza usa (no cuentan como deuda)
 *     firmas: ['role="tablist"'],                   // reconocen una variante dibujada a mano (expresiones regulares)
 *     deuda: ["components/Algo.tsx"],               // quienes todavía la dibujan a mano: solo baja
 *     excepciones: [{ archivo: "components/finanzas/kit.tsx", motivo: "ADR-0195: el kit de Finanzas" }], // lo que un ADR deja como está
 *   },
 */
/**
 * @typedef {{ archivo: string, motivo: string }} Excepcion
 * @typedef {{ fecha: string, adr: string, registro: string, elegida: string, pieza: string, tambien?: string[], ventana?: number, firmas: string[], deuda: string[], excepciones?: Excepcion[] }} Decision
 * @type {Record<string, Decision>}
 */
export const DECISIONES = {
  "accion.volver": {
    fecha: "2026-10-06",
    adr: "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    registro: "docs/unificar/accion.volver.md",
    elegida: "la flecha redonda de EncabezadoPagina (elegida mirando el 2026-10-06)",
    pieza: "components/ui/Volver.tsx",
    firmas: [
      // La línea de 11 px en versalitas que era la forma «enlace», copiada a mano.
      "label-cayla inline-flex items-center gap-1\\.5 text-\\[11px\\] text-tinta/65",
      // La prop que daba dos caras a la pieza.
      "<Volver[^>]*\\bforma=",
      // Una vuelta escrita a mano con el glifo («← Volver a Caja»). El «← Atrás» de un paso a paso es otra familia (paso atrás).
      "←\\s*Volver a ",
      // El «Atrás» de un paso a paso escrito a mano (Felipe 2026-10-07, ronda 3: «volver solo es una flecha»): el texto «Atrás» solo
      // en su línea, o una flecha dibujada con «Atrás» / «Volver» al lado.
      "^\\s*(?:<span aria-hidden>←<\\/span>\\s*)?Atrás\\s*$",
      "<ArrowLeft\\b[^>]*\\/>\\s*(?:Atrás|Volver)\\b",
      // Una vuelta escrita con el glifo y un nombre («← Ticket», «← Todas las cajas»). «← Anterior» y «← Volver al inicio» de una
      // paginación no son una vuelta: pasan de página (otra familia).
      "^\\s*←\\s+(?!Anterior\\b|Volver al inicio\\b)[A-ZÁÉÍÓÚ][^<{}]*$",
      // «Volver a contar / a revisar / a editar…» como texto de un botón. No cuentan los que NO vuelven a un paso: reintentar,
      // restablecer, la salida de una pantalla de error ni el enlace dentro de una frase.
      "^\\s*Volver (?:a|al) (?!intentar|lo predeterminado|la predeterminada|como está|la que propone|inicio|período)[^<{}\"]+\\s*$",
    ],
    deuda: [],
    excepciones: [
      { archivo: "components/conteo/RevisarConteo.tsx", motivo: "«Volver a contar» es la acción principal de Revisar conteo (ir a contar lo pendiente), no un paso atrás (Felipe 2026-10-07)" },
      { archivo: "app/(app)/global/elige-sede/page.tsx", motivo: "Tarjeta de barrera (elegir sede): su salida es la única acción de la tarjeta y va con los botones, no es la vuelta de una pantalla interna (docs/unificar/accion.volver.md)" },
    ],
  },
  "cifra": {
    "fecha": "2026-10-06",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/cifra.md",
    "elegida": "la tarjeta de Compras (B) tal cual, elegida mirando el 2026-10-06",
    "pieza": "components/ui/TarjetaCifra.tsx",
    "firmas": [
      "<(TarjetaCifraAnalisis|TarjetaIndicador|TarjetaSenal|TarjetaAvance)\\b",
      "^\\s*(export\\s+)?function\\s+(TarjetaCifraAnalisis|TarjetaIndicador|TarjetaSenal|TarjetaAvance)\\b|^\\s*(export\\s+)?function\\s+(Tarjeta|Cifra)\\(\\{\\s*(etiqueta|rotulo)"
    ],
    "deuda": []
  },
  "accion.nuevo": {
    "fecha": "2026-10-07",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/accion.nuevo.md",
    "elegida": "B · versalitas de 11 px y 40 px (label-cayla), elegida mirando el 2026-10-07, con su movimiento: barrido de luz, se encoge al presionar, hilo al guardar",
    "pieza": "components/ui/campos.tsx",
    // El texto del botón suele ir en la línea siguiente a su clase: la firma mira 9 líneas desde donde empieza.
    "ventana": 9,
    "firmas": [
      // La cara B copiada a mano (sin el barrido de luz ni el encogerse al presionar de la pieza).
      "className=\\{?[\"'`]label-cayla\\b[^\"'`]*\\b(?:bg-tinta|border-tinta\\/25)\\b[^\"'`]*\\bpx-4\\b[^\"'`]*[\"'`]\\}?[^<]{0,400}?>\\s*(?:<[A-Z]\\w*[^>]*\\/>\\s*)?\\+?\\s*(?:Nuev[oa]s?|Registrar|Agregar|Crear)\\b",
      // El barrido viejo de 800 ms (ronda 3: el movimiento es uno solo, `.mov-boton`).
      "\\bboton-brillo\\b",
      // Un botón negro que al pasar el mouse va al rojo de marca o a un gris (Felipe 2026-10-07: «que sea rojo profundo», el de la guía).
      "\\bbg-tinta\\b[^\"'`]*\\b(?:enabled:)?hover:bg-(?:rojo(?!-profundo)|tinta\\/\\d+)\\b"
    ],
    "deuda": [
    ],
    "excepciones": [
      { "archivo": "components/analisis/TodaviaNo.tsx", "motivo": "El «Registrar N» chico dentro del anillo de Análisis v4 tiene su propio diseño y movimiento (ADR-0357); Felipe dice si se unifica" }
    ]
  },
  "boton": {
    "fecha": "2026-10-07",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/boton.md",
    "elegida": "B · dos voces a propósito (versalitas en la cabecera de una pantalla, letra normal en hojas y tarjetas), con la onda al clic; elegida mirando el 2026-10-07",
    "pieza": "components/ui/campos.tsx",
    "tambien": ["components/ui/OndaBotones.tsx", "app/globals.css"],
    "firmas": [
      // La versalita copiada a mano (label-cayla + esquinas + fondo tinta o borde): no toma la voz del lugar ni la onda.
      "\\blabel-cayla\\b[^\"'`]*\\brounded-(?:md|lg|xl)\\b[^\"'`]*\\b(?:bg-tinta|border-tinta\\/\\d+)\\b|\\blabel-cayla\\b[^\"'`]*\\b(?:bg-tinta|border-tinta\\/\\d+)\\b[^\"'`]*\\brounded-(?:md|lg|xl)\\b"
    ],
    // El mostrador entró en su propia pasada (2026-10-07): conserva sus altos (28–36 px los compactos, 44–56 los de cobro) con
    // letra de 12,5 px en los compactos, y toma la voz, el movimiento y la onda. Probado a 375 px (PL-105).
    "deuda": [],
    "excepciones": [
      { "archivo": "components/SelectorMesFacturacion.tsx", "motivo": "Es el selector de mes de la barra de vidrio de Comprobantes (ADR-0124): un filtro de período, familia de pestañas, no un botón" }
    ]
  },
  "accion.eliminar": {
    "fecha": "2026-10-07",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/boton.md",
    "elegida": "A · rojo desde el principio (btn-peligro, <Boton peso=\"peligro\">, fila-alerta en la barra de vidrio), elegida mirando el 2026-10-07",
    "pieza": "components/ui/campos.tsx",
    "tambien": ["app/globals.css"],
    "firmas": [
      // Un enlace o un botón sutil teñido de rojo a mano para borrar o anular: va btn-peligro.
      "\\bbtn-(?:sutil|enlace)\\b[^\"'`]*\\btext-rojo",
      // Desactivar, eliminar, anular, borrar o archivar escrito como enlace (dentro de una frase): es un <Boton peso="peligro"> en el
      // pie de la hoja, como en Categorías, Familias, Colores y Proveedores (ronda 9, 2026-10-13). «Archivados (3)», que muestra
      // lo archivado, no es la acción (`(?!d)`).
      "\\bbtn-enlace\\b[^\\n]*(?:\\n[^\\n]*){0,3}?\\n\\s*(?:\\{[^}\\n]*\\?\\s*\")?(?:Desactiv|Elimin|Anul|Borr|Archiv)(?:ar|a)(?!d)\\w*"
    ],
    "ventana": 4,
    "deuda": []
  },
  "accion.cerrar": {
    "fecha": "2026-10-07",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/boton.md",
    "elegida": "A · la × sola, arriba a la derecha (<Modal conCerrar>, ModalRuta por defecto), elegida mirando el 2026-10-07",
    "pieza": "components/ui/Modal.tsx",
    "tambien": ["components/ui/ModalRuta.tsx"],
    "firmas": [
      // Un botón «Cerrar» escrito al pie de una hoja.
      "^\\s*Cerrar\\s*$"
    ],
    "deuda": [],
    "excepciones": [
      { "archivo": "components/CajaTablero.tsx", "motivo": "Es «Cerrar caja» (con su candado), una operación del negocio, no cerrar una hoja" }
    ]
  },
  "pestanas": {
    "fecha": "2026-10-06",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/pestanas.md",
    "elegida": "vidrio en mayúsculas (vista) · píldora (filtro) · caja arena (modo), elegidas mirando el 2026-10-06",
    "pieza": "components/ui/Pestanas.tsx",
    "tambien": [
      "components/ui/SegmentoEnlaces.tsx",
      "components/ui/SegmentoDeslizante.tsx",
      "components/ui/IndicadorDeslizante.tsx",
      "components/ui/BotonFiltro.tsx",
      "app/estilos/pestanas-y-segmentos.css"
    ],
    "firmas": [
      "\\?\\s*[\"'`](?=[^\"'`]*\\bbg-(?:papel|hueso)(?![\\w\\[\\]./-]))(?=[^\"'`]*\\btext-tinta(?![\\w\\[\\]./-]))(?=[^\"'`]*(?:\\bshadow-|\\bring-1\\b|\\bfont-(?:medium|semibold)\\b))[^\"'`]*[\"'`]\\s*:\\s*[\"'`][^\"'`]*\\btext-(?:taupe|tinta/[4-8]\\d)\\b|aria-pressed:bg-hueso aria-pressed:(?:font-semibold )?text-tinta\\b",
      "role=\"tab\"(?=[\\s>/]|$)",
      "-mb-px[^\"'`]*\\bborder-b-2\\b|\\bborder-b-2\\b[^\"'`]*-mb-px|after:h-0\\.5 after:bg-(?:tinta|rojo)\\b"
    ],
    "deuda": []
  },
  "vacio": {
    "fecha": "2026-10-08",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/vacio.md",
    "elegida": "P1 · el ícono de lo que falta que se dibuja, título serif, frase que dice qué hacer y el botón (grande y chico); al no encontrar, dice qué se buscó y deja deshacerlo ahí; elegida tocándola el 2026-10-08",
    "pieza": "components/ui/Vacio.tsx",
    "tambien": ["app/estilos/vacio-aviso-buscador.css"],
    "ventana": 2,
    "firmas": [
      // La frase gris suelta que dice que no hay nada («Sin ventas todavía.», «No hay separaciones abiertas.», «Ninguna cuenta tiene
      // este rol»), con el texto en su línea o en la siguiente: el censo de mostrador (2026-10-13) encontró 49 que las firmas de abajo,
      // atadas a una clase exacta, no veían. «Nada se guarda todavía» explica, no es un vacío; otra frase que explica lleva su unificar-fijo.
      "<(?:p|div)\\b[^>]*className=[\"'{`][^\"'`]*\\btext-(?:tinta\\/(?:4|5|6)[05]|taupe(?:\\/\\d+)?)(?![\\w-])[^\"'`]*[\"'`]\\}?[^>]*>\\s*(?:Sin |Ningún|Ninguna|Ninguno|Nada (?!se guard)|Todavía no|No hay|Aún no (?!se guard))",
      // La frase en cursiva serif (B) y su versión «SinCoincidencias».
      "\\bfont-display\\b[^\"'`]*\\bitalic\\b[^\"'`]*\\btext-tinta\\/6[05]\\b",
      // La frase gris suelta de <Tabla> y sus primas (A), la centrada gris clara de Caja y la cursiva chica.
      "\\bTABLA\\.vacio\\b|\\bpx-5 py-8 text-center text-sm text-taupe\\b|\\bp-5 text-sm text-tinta\\/75\\b|\\bpy-6 text-center text-xs text-tinta\\/50\\b|\\btext-xs italic text-tinta\\/65\\b|\\bpx-3 py-3 text-sm text-tinta\\/65\\b",
      // El título en negrita sobre panel claro (C), el recuadro punteado (F, Apartados) y el colibrí que flota (G).
      "\\bfin-guia\\b|\\bvacio-vista\\b|<GuiaVacia\\b|\\brounded-xl bg-papel\\/60 px-6 py-10\\b|\\bborder-dashed border-(?:sand|tinta\\/25)\\b[^\"'`]*\\bpy-(?:6|10)\\b[^\"'`]*\\btext-center\\b|\\bcmp-flota\\b|\\btp-vacia\\b"
    ],
    "deuda": [

    ],
    "excepciones": []
  },
  "aviso": {
    "fecha": "2026-10-08",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/aviso.md",
    "elegida": "P2 · la franja a la izquierda con el ícono que se dibuja (el error destella una vez) · nota-cayla con su «i» · el error de un dato bajo su campo y el de la hoja en el aviso; elegida tocándola el 2026-10-08",
    "pieza": "components/ui/Aviso.tsx",
    "tambien": ["app/estilos/vacio-aviso-buscador.css", "components/ui/campos.tsx", "components/ui/Avisos.tsx"],
    "firmas": [
      // Un recuadro de tono pintado a mano: fondo suave de ámbar, rojo o verde con su texto profundo, esquinas de caja y relleno
      // de recuadro (una insignia o un chip, redondos y chicos, no cuentan).
      "[\"'`](?=[^\"'`]*\\bbg-(?:ambar|rojo|verde)\\/(?:\\[0\\.0\\d+\\]|5|10)\\b)(?=[^\"'`]*\\btext-(?:ambar|rojo|verde)-profundo\\b)(?=[^\"'`]*\\brounded-(?:md|lg|xl|2xl)\\b)(?=[^\"'`]*\\bpy-(?:2|2\\.5|3)\\b)",
      // La franja copiada (con su fondo de tono; el acento de una tarjeta de cifra no es un aviso).
      "\\bborder-l-(?:ambar|rojo)\\b[^\"'`]*\\bbg-(?:ambar|rojo)\\/",
      // Los de Finanzas y Análisis, que se suman (Felipe 2026-10-08).
      "\\baviso-datos\\b|\\bfin-nota-bloque\\b",
      // Las dos piezas que existían a mano.
      "^\\s*(?:export\\s+)?function\\s+(?:AvisoInline|AvisoDeError)\\b",
      // Un párrafo rojo suelto (el error va bajo su campo o en <Aviso tono=\"error\">).
      "<p\\b[^>]*className=\\{?[\"'`][^\"'`]*\\btext-(?:xs|sm|\\[1[23](?:\\.5)?px\\]) text-rojo(?:-profundo)?\\b"
    ],
    "deuda": [

    ],
    "excepciones": []
  },
  "buscador": {
    "fecha": "2026-10-08",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/buscador.md",
    "elegida": "P1 · la caja hundida con lupa viva, «/», «×», «Buscando…» solo si la espera tarda y el conteo (lista) · la píldora que se despega (mostrador); busca mientras se escribe; elegida tocándola el 2026-10-08",
    "pieza": "components/ui/Buscador.tsx",
    "tambien": ["app/estilos/vacio-aviso-buscador.css", "components/ui/BusquedaEnUrl.tsx"],
    "firmas": [
      // Una caja de buscar dibujada a mano.
      // (Un `inputMode="search"` o el placeholder de Vender ya no cuentan: son props que se le pasan a la pieza.)
      "<input\\b[^>]*type=\"search\"|^\\s*type=\"search\"",
      "<SenalBuscando\\b",
      // Los de Finanzas y Análisis, que se suman (Felipe 2026-10-08).
      "\\bfin-buscar\\b|className=\"buscar\""
    ],
    "deuda": [

    ],
    "excepciones": []
  },
  "casilla": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/casilla.md",
    "elegida": "P1 · la casilla que se dibuja (el fondo de tinta crece desde el centro y el ✓ se traza) y el interruptor que se prende en tinta, con la perilla que se estira al presionar; elegida tocándola el 2026-10-13",
    "pieza": "components/ui/Casilla.tsx",
    "tambien": ["components/ui/campos.tsx", "app/estilos/campos-y-casillas.css"],
    "firmas": [
      // Una casilla del navegador o dibujada a mano (la pieza ya es un <input type="checkbox"> por dentro). No cuentan un selector de
      // CSS (`[type="checkbox"]`) ni el input escondido que solo guarda un estado (`sr-only`, el «ver más» del Inicio).
      "(?<!\\[)type=(?:\"checkbox\"|\\{\"checkbox\"\\})(?![^\\n]*\\bsr-only\\b)",
      // Un interruptor hecho a mano (la pieza es <Interruptor>).
      "(?<!\\[)role=\"switch\"",
      // Una casilla invisible que mueve una cara dibujada a mano con `peer-checked:` (la casilla propia de Por pagar, el «Es un regalo» de
      // Recepción): es <Casilla> o <Interruptor>. Encontradas al rastrear el censo de después (2026-10-13).
      "(?<!\\[)type=(?:\"checkbox\"|\\{\"checkbox\"\\})[^\\n]*\\bpeer\\b"
    ],
    "excepciones": [
      { "archivo": "components/finanzas/EscenariosPanel.tsx", "motivo": "ADR-0195: Finanzas se dibuja como su spike; la casilla es la de la opción en tarjeta del kit (fin-opcion-esc)" },
      { "archivo": "components/finanzas/EstadoResultadosPanel.tsx", "motivo": "ADR-0195: Finanzas se dibuja como su spike; «Comparar con…» es la casilla del kit dentro de su botón" }
    ],
    "deuda": []
  },
  "paginacion": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/paginacion.md",
    "elegida": "P1 · las páginas con la píldora que se desliza: números de 13 px en cuadrados de 32 px y la página actual como una píldora de tinta que viaja de un número al otro; elegida tocándola el 2026-10-13",
    "pieza": "components/ui/Paginas.tsx",
    "tambien": ["components/ui/PaginacionLocal.tsx", "components/Paginacion.tsx", "app/estilos/enlaces-paginas-caras.css"],
    "firmas": [
      // Una paginación dibujada a mano: su propia barra de números (la pieza la arma con `numerosDePagina`).
      "aria-label=\"Paginación\"",
      "\\bnumerosDePagina\\(",
      // El «Siguiente página →» o «← Volver al inicio» escrito a mano (la paginación por cursor ya lo dibuja con la pieza).
      "Siguiente página →|← Volver al inicio"
    ],
    "deuda": [],
    "excepciones": []
  },
  "avatar": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/avatar.md",
    "elegida": "P1 · AvatarPersona en cuatro tamaños fijos (24 · 32 · 40 · 80): iniciales en serif sobre arena, la foto que entra con un fundido, el punto verde de «de turno» y la pila que se abre al pasar el mouse; elegida tocándola el 2026-10-13",
    "pieza": "components/ui/AvatarPersona.tsx",
    "tambien": ["app/estilos/enlaces-paginas-caras.css"],
    "ventana": 3,
    "firmas": [
      // Un círculo de iniciales dibujado a mano: un `rounded-full` con `{iniciales(…)}` adentro (en la misma línea o en las dos
      // siguientes). No cuentan los que llevan su propia clase por una decisión (el Observatorio, la página pública del club) ni el
      // monograma de una empresa (Proveedores): no son la cara de una persona.
      "rounded-full[^\\n]*(?:\\n[^\\n]*){0,2}\\{\\s*iniciales\\("
    ],
    "deuda": [],
    "excepciones": []
  },
  "enlace": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/enlace.md",
    "elegida": "En una frase, P1 · el hilo que se llena (btn-enlace: subrayado tenue; al pasar el mouse un hilo rojo corre de izquierda a derecha y el texto pasa a rojo profundo). Suelto, P2 · versalitas rojas con la flecha que avanza (<EnlaceVer>); elegidas tocándolas el 2026-10-13",
    "pieza": "components/ui/EnlaceVer.tsx",
    "tambien": ["app/globals.css", "app/estilos/enlaces-paginas-caras.css"],
    "firmas": [
      // El rojo que se subraya al pasar el mouse (y las versalitas rojas a mano): un enlace en una frase es `btn-enlace`; uno suelto que
      // lleva a ver más, <EnlaceVer>.
      "\\btext-rojo(?:-profundo)?\\b[^\"'`]*\\bhover:underline\\b",
      // El subrayado tenue o el que se pone rojo, dibujados a mano.
      "\\bunderline\\b[^\"'`]*\\bdecoration-tinta\\/\\d+",
      "\\bhover:text-rojo(?:-profundo)?\\b[^\"'`]*\\bhover:underline\\b|\\bhover:underline\\b[^\"'`]*\\bhover:text-rojo",
      // La flecha escrita a mano al final de un `btn-enlace` («Ver traslados →»): un enlace que lleva a ver más es <EnlaceVer>.
      "\\bbtn-enlace\\b[^\\n]*(?:\\n[^\\n]*){0,3}?[^\\n]*→\\s*(?:\\{|<\\/)",
      // Lo mismo en versalitas a mano («Ver los 11 →», «Ver todas las sedes →»): encontradas por el censo de después (2026-10-13).
      "\\blabel-cayla\\b[^\\n]*(?:\\n[^\\n]*){0,3}?[^\\n]*→\\s*(?:\\{|<\\/|\\n|$)"
    ],
    "ventana": 4,
    "deuda": [],
    "excepciones": []
  },
  "tabla": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/tabla.md",
    "elegida": "P1 · <Tabla> de hoy con movimiento: banda arena, títulos taupe, zebra hueso; las filas entran en cascada, la que lleva a su detalle muestra el hilo rojo de canto y la «›» al pasar el mouse, la abierta se queda marcada, la recién guardada respira en verde; elegida tocándola el 2026-10-13",
    "pieza": "components/ui/Tabla.tsx",
    "tambien": ["app/globals.css"],
    "firmas": [
      // Una tabla de registros dibujada a mano con <table> (la pieza es <Tabla> + `fila()` + `celda()`).
      "<table\\b",
      // Un encabezado de tabla a mano (sus títulos con `role="columnheader"`): el encabezado es <Encabezado>.
      "role=\"columnheader\""
    ],
    "deuda": [],
    "excepciones": [
      { "archivo": "app/estilos/finanzas.css", "motivo": "ADR-0195: el CSS del kit de Finanzas (su comentario nombra la tabla del spike)" },
      { "archivo": "components/ConfiguracionCargaInicial.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/ConfiguracionImpuestos.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/ConfiguracionTiendas.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/GastosFijosYActivos.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/GastosPanel.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/ImpuestosPanel.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/finanzas/BalancePanel.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/finanzas/CampanasPanel.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/finanzas/ConfiguracionCuentas.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/finanzas/ConfiguracionPresupuesto.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/finanzas/CuentasDinero.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/finanzas/EscenariosPanel.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/finanzas/EstadoResultadosPanel.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/finanzas/FlujoCajaPanel.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/finanzas/PorPagarConsolidado.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/finanzas/PresupuestoPanel.tsx", "motivo": "ADR-0195: la tabla del kit de Finanzas (fin-tabla), decidida a propósito; Felipe no la unió en la ronda 7" },
      { "archivo": "components/BoletaA4.tsx", "motivo": "papel físico (ADR-0336): se imprime tal cual, fuera del censo" },
      { "archivo": "components/ProformaA4.tsx", "motivo": "papel físico (ADR-0336): se imprime tal cual, fuera del censo" },
      { "archivo": "components/ordenes-compra/HojaOrdenCompra.tsx", "motivo": "papel físico (ADR-0336): se imprime tal cual, fuera del censo" },
      { "archivo": "components/plan-compra/ExportarPlan.tsx", "motivo": "papel físico (ADR-0336): se imprime tal cual, fuera del censo" },
      { "archivo": "components/MatrizOrden.tsx", "motivo": "una matriz de tallas y colores (o de tiendas): otra función, no una lista de registros" },
      { "archivo": "components/alta-producto/MatrizCantidades.tsx", "motivo": "una matriz de tallas y colores (o de tiendas): otra función, no una lista de registros" },
      { "archivo": "components/alta-producto/MatrizVariantes.tsx", "motivo": "una matriz de tallas y colores (o de tiendas): otra función, no una lista de registros" },
      { "archivo": "components/existencias/FlujoTalla.tsx", "motivo": "una matriz de tallas y colores (o de tiendas): otra función, no una lista de registros" },
      { "archivo": "components/existencias/PanelTalla.tsx", "motivo": "una matriz de tallas y colores (o de tiendas): otra función, no una lista de registros" },
      { "archivo": "components/ficha-producto/MatrizStockFicha.tsx", "motivo": "una matriz de tallas y colores (o de tiendas): otra función, no una lista de registros" },
      { "archivo": "components/ficha-producto/piezas.tsx", "motivo": "una matriz de tallas y colores (o de tiendas): otra función, no una lista de registros" },
      { "archivo": "components/ExistenciasTarjetas.tsx", "motivo": "una matriz de tallas y colores (o de tiendas): otra función, no una lista de registros" },
      { "archivo": "components/RecepcionEnvio.tsx", "motivo": "una matriz de tallas y colores (o de tiendas): otra función, no una lista de registros" },
      { "archivo": "components/RepartoPorTienda.tsx", "motivo": "una matriz de tallas y colores (o de tiendas): otra función, no una lista de registros" },
      { "archivo": "components/plan-compra/RepartoTiendas.tsx", "motivo": "una matriz de tallas y colores (o de tiendas): otra función, no una lista de registros" },
      { "archivo": "components/ProductosTabla.tsx", "motivo": "ADR-0254: la tabla de Catálogo ▸ Productos tiene su diseño aprobado; Felipe no la unió en la ronda 7" },
      { "archivo": "components/analisis/FichaPrenda.tsx", "motivo": "ADR-0357: Análisis tiene su movimiento y su diseño por decisión" }
    ]
  },
  "titulo-seccion": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/titulo-seccion.md",
    "elegida": "P1 en las tres preguntas · bloque: serif de 21 px con su dato o su acción a la derecha · grupo dentro de una hoja: versalitas con una raya que se dibuja · separador de día: versalitas con el total del día, pegado arriba al bajar; elegidas tocándolas el 2026-10-13",
    "pieza": "components/ui/TituloSeccion.tsx",
    "tambien": ["app/estilos/titulos.css"],
    "firmas": [
      // Cuántos hay en un bloque, puesto a la derecha como si fuera un resumen: va en `cuenta`, el globito pegado al nombre (ronda 9).
      "<TituloSeccion\\b(?:[^>]|=>)*?\\bdato=\\{<b>\\{[\\w.]+\\.length\\}<\\/b>\\}",
      // Un título de bloque en serif dibujado a mano (de 18 a 24 px): es <TituloSeccion>.
      "<h[234]\\b[^>]*className=[\"'{`][^\"'`]*\\bfont-(?:display|serif)\\b[^\"'`]*\\btext-(?:lg|xl|2xl|\\[(?:1[89]|2[0-4])(?:\\.5)?px\\])",
      "<h[234]\\b[^>]*className=[\"'{`][^\"'`]*\\btext-(?:lg|xl|2xl|\\[(?:1[89]|2[0-4])(?:\\.5)?px\\])[^\"'`]*\\bfont-(?:display|serif)\\b",
      // Un título en versalitas a mano (`label-cayla` en un h2/h3/h4): de bloque, <TituloSeccion>; de grupo, <TituloGrupo>.
      "<h[234]\\b[^>]*className=[\"'{`][^\"'`]*\\blabel-cayla\\b",
      // Un título en sans seminegrita a mano (13 a 16 px).
      "<h[234]\\b[^>]*className=[\"'{`][^\"'`]*\\btext-(?:sm|base|\\[1[3-6](?:\\.5)?px\\])(?![\\w-])[^\"'`]*\\bfont-(?:semibold|medium|bold)\\b"
    ],
    "deuda": [],
    "excepciones": [
      { "archivo": "components/guias/ElegirDemoModal.tsx", "motivo": "ADR-0389: las guías interactivas tienen su tarjeta y su movimiento por decisión" },
      { "archivo": "components/guias/GuiaInteractiva.tsx", "motivo": "ADR-0389: las guías interactivas tienen su tarjeta y su movimiento por decisión" },
      { "archivo": "components/guias/MotorGuias.tsx", "motivo": "ADR-0389: las guías interactivas tienen su tarjeta y su movimiento por decisión" },
      { "archivo": "components/clientas/piezas-club-publico.tsx", "motivo": "la página pública del club (club-publico.css): la ve el cliente, tiene su propio diseño" },
      { "archivo": "app/(app)/vender/comprobantes/error.tsx", "motivo": "una pantalla de error: su título es el de la pantalla, no el de un bloque" }
    ]
  },
  "campo": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/campo-combo.md",
    "elegida": "P1 · la caja que se enciende: todo campo de una hoja es la caja hundida de 40 px que, con el cursor adentro, sube a papel y dibuja el hilo rojo desde el centro (verde si el dato está bien, barre mientras consulta); el monto, 48 px con su cifra en serif; elegida tocándola el 2026-10-13",
    "pieza": "components/ui/campos.tsx",
    "tambien": ["components/ui/CampoFecha.tsx", "components/ui/CampoMonto.tsx", "components/ComboResponsable.tsx", "components/ui/Buscador.tsx", "components/ui/ComboBuscable.tsx", "components/ui/FiltrosPildora.tsx", "components/ui/Casilla.tsx", "app/estilos/campos-y-casillas.css"],
    "ventana": 14,
    "firmas": [
      // Una caja de texto dibujada a mano: un <input> (ni casilla, ni radio, ni oculto, ni archivo, ni rango) fuera de las piezas. Es
      // `CampoTexto` / `CampoMonto` / `CampoFecha`, o la caja `caja-cayla caja-campo` si el campo no lleva su etiqueta.
      // Se mira el elemento hasta su cierre (`/>` o `>`): un input dentro de la caja de la pieza (`self-stretch` en `caja-campo`) o que
      // ES la caja (`caja-campo-input`, `campoTexto`) ya está bien.
      "<input\\b(?!(?:(?!\\/>)[\\s\\S])*?(?:\\bself-stretch\\b|\\bcaja-campo-input\\b|\\{campoTexto\\}|\\bsr-only\\b|\\btype=(?:\"|\\{\")(?:checkbox|radio|hidden|file|range|color)\\b))",
      "<textarea\\b(?!(?:(?!<\\/textarea>|\\/>)[\\s\\S])*?(?:\\bself-stretch\\b|\\bcaja-campo-input\\b|\\{campoTexto\\}))"
    ],
    "deuda": [],
    "excepciones": [
      { "archivo": "components/GastoRapidoModal.tsx", "motivo": "ADR-0368: el monto del gasto rápido de Caja (gr-monto) tiene su diseño y su movimiento por decisión" },
      { "archivo": "components/IngresoRapidoModal.tsx", "motivo": "ADR-0375: el monto de Registrar ingreso es el del gasto rápido (gr-monto), por decisión" },
      { "archivo": "components/finanzas/kit.tsx", "motivo": "ADR-0195: el kit de Finanzas (fin-control, SelectFin) queda como está; con la caja de la ronda 6 está a 4 px de ser igual y Felipe dice si se une" },
      { "archivo": "components/finanzas/ConfiguracionPresupuesto.tsx", "motivo": "ADR-0195: el kit de Finanzas (fin-control, SelectFin) queda como está; con la caja de la ronda 6 está a 4 px de ser igual y Felipe dice si se une" },
      { "archivo": "components/ConfiguracionImpuestos.tsx", "motivo": "ADR-0195: el kit de Finanzas (fin-control, SelectFin) queda como está; con la caja de la ronda 6 está a 4 px de ser igual y Felipe dice si se une" },
      { "archivo": "components/ConfiguracionTiendas.tsx", "motivo": "ADR-0195: el kit de Finanzas (fin-control, SelectFin) queda como está; con la caja de la ronda 6 está a 4 px de ser igual y Felipe dice si se une" },
      { "archivo": "app/estilos/alta-guia.css", "motivo": "la guía de foco (ADR-0284) busca los controles por su rol o su etiqueta: no dibuja ninguno" },
      { "archivo": "components/alta-producto/MatrizCantidades.tsx", "motivo": "las celdas de una matriz de tallas y colores: otra función, no un campo de formulario" },
      { "archivo": "components/MatrizOrden.tsx", "motivo": "las celdas de una matriz de tallas y colores: otra función, no un campo de formulario" },
      { "archivo": "components/ficha-producto/MatrizStockFicha.tsx", "motivo": "las celdas de una matriz de tallas y colores: otra función, no un campo de formulario" },
      { "archivo": "components/ficha-producto/piezas.tsx", "motivo": "las celdas de una matriz de tallas y colores: otra función, no un campo de formulario" },
      { "archivo": "components/existencias/FlujoTalla.tsx", "motivo": "las celdas de una matriz de tallas y colores: otra función, no un campo de formulario" },
      { "archivo": "components/rotulos/TiraBrother.tsx", "motivo": "papel físico (ADR-0336): la tira que se imprime en la Brother" },
      { "archivo": "components/ImprimirEtiquetasPrecio.tsx", "motivo": "papel físico (ADR-0336): la vista de la etiqueta que se imprime" },
      { "archivo": "components/traslados-pases/ReversoPase.tsx", "motivo": "ADR-0355: los pases de Traslados tienen su diseño por decisión" },
      { "archivo": "components/analisis/PestanaQuieta.tsx", "motivo": "ADR-0357: Análisis tiene su diseño y su movimiento por decisión" },
      { "archivo": "components/BuscadorGlobal.tsx", "motivo": "el buscador de la cabecera (Ctrl K) es parte del marco, fuera del censo" },
      { "archivo": "components/clientas/RegistroClub.tsx", "motivo": "la página pública del club (club-publico.css): la ve el cliente, tiene su propio diseño" }
    ]
  },
  "combo": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/campo-combo.md",
    "elegida": "P1 · el combo es la misma caja que se enciende (el chevron gira y se pone rojo, el valor elegido entra subiendo); P1 · una lista para todo combo: la elegida con el hilo rojo de canto y su ✓ que se dibuja, cascada hasta 8, buscador fijo con su lupa; elegidas tocándolas el 2026-10-13",
    "pieza": "components/ui/campos.tsx",
    "tambien": ["app/globals.css", "components/ui/ComboBuscable.tsx", "components/ComboResponsable.tsx", "components/ui/FiltrosPildora.tsx", "components/ui/useCombo.ts", "app/estilos/campos-y-casillas.css", "components/ui/ListaSugerencias.tsx"],
    "firmas": [
      // Un combo o una lista desplegable hecha a mano (la regla de combos ya era una, ADR-0209; ahora también su cara).
      "role=\"combobox\"",
      "role=\"listbox\"",
      "\\blista-flotante\\b"
    ],
    "deuda": [],
    "excepciones": [
      { "archivo": "components/finanzas/kit.tsx", "motivo": "ADR-0195: el kit de Finanzas (fin-control, SelectFin) queda como está; con la caja de la ronda 6 está a 4 px de ser igual y Felipe dice si se une" },
      { "archivo": "app/estilos/alta-guia.css", "motivo": "la guía de foco (ADR-0284) busca los controles por su rol o su etiqueta: no dibuja ninguno" },
      { "archivo": "components/alta-producto/useGuiaAlta.ts", "motivo": "la guía de foco (ADR-0284) busca los controles por su rol o su etiqueta: no dibuja ninguno" },
      { "archivo": "components/observatorio/Observatorio.tsx", "motivo": "ADR-0322: el Observatorio del Admin tiene su diseño y su movimiento por decisión" }
    ]
  },
  "filtro": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/campo-combo.md",
    "elegida": "P1 · la píldora que dice su nombre: borde arena con su ícono y su nombre en letra normal; puesta, rellena de tinta con lo elegido y su ✕ (como el filtro por clic de la ronda 1); elegida tocándola el 2026-10-13",
    "pieza": "components/ui/FiltrosPildora.tsx",
    "tambien": ["app/estilos/campos-y-casillas.css"],
    "ventana": 8,
    "firmas": [
      // Un filtro que se abre dibujado como caja en una barra de filtros (`Desplegable forma="caja"`): es <DesplegablePildora>.
      // `(?:[^>]|=>)`: la flecha de un `onValor={(v) => …}` no corta la búsqueda (así se escapaban seis, 2026-10-13).
      "<Desplegable\\b(?:[^>]|=>)*?\\bforma=\"(?:caja|cajaBaja)\""
    ],
    "excepciones": [
      { "archivo": "components/clientas/RegistroClub.tsx", "motivo": "la página pública del club tiene su propia caja (club-input) y el mes de nacimiento es un campo, no un filtro" }
    ],
    "deuda": []
  },
  "etiqueta-campo": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/etiqueta-campo.md",
    "elegida": "P1 · versalitas que se encienden: el título de Campo (11 px, tinta al 62 %, * rojo si es obligatorio, «· opcional» tenue) que se oscurece mientras su caja está encendida, con las marcas de la guía de foco al lado; elegida tocándola el 2026-10-13",
    "pieza": "components/ui/campos.tsx",
    "tambien": ["app/estilos/campos-y-casillas.css"],
    "firmas": [
      // El título de Campo copiado a mano (versalitas sobre una caja): es <Campo> o la clase `campo-etiqueta`.
      "\\blabel-cayla block text-\\[11px\\] text-tinta\\/(?:6\\d|7\\d)\\b",
      // Un título de campo en letra normal hecho a mano: un <label> de 12 a 14 px con peso.
      "<label\\b[^>]*className=[\"'{`][^\"'`]*\\btext-(?:xs|sm|\\[1[234](?:\\.5)?px\\])(?![\\w-])[^\"'`]*\\bfont-(?:medium|semibold)\\b"
    ],
    "deuda": [],
    "excepciones": []
  },
  "accion.exportar": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/accion.exportar.md",
    "elegida": "P1 · «Descargar» + qué («Descargar Excel», «Descargar CSV», «Descargar reporte del ajuste»), nunca «Exportar» ni solo un ícono: el botón secundario con el ícono de descarga que BAJA 2 px al pasar el mouse y el hilo mientras se arma el archivo; elegida tocándola el 2026-10-13",
    "pieza": "components/ui/BotonDescargar.tsx",
    "tambien": ["app/globals.css"],
    "firmas": [
      // El ícono de descarga dibujado fuera de la pieza (un botón a mano o solo un ícono): es <BotonDescargar>.
      "<Download\\b",
      // «Exportar» como texto de un botón, un ítem de menú o una etiqueta: el verbo es «Descargar».
      "^\\s*Exportar\\b|>\\s*Exportar\\b|etiqueta: \"Exportar|aria-label=\"Exportar"
    ],
    "deuda": [],
    "excepciones": []
  },
  "accion.filtrar": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/accion.filtrar.md",
    "elegida": "P1 · una píldora más: «Filtros» con la cara de las píldoras que abre (borde arena, su ícono, su nombre en letra normal; abierta, borde tinta y la flecha roja) y cuántos hay puestos en el globito de los títulos; en el celular, solo el ícono con su punto; elegida tocándola el 2026-10-13",
    "pieza": "components/ui/FiltrosPildora.tsx",
    "tambien": ["app/estilos/campos-y-casillas.css"],
    "ventana": 3,
    "firmas": [
      // Un botón de filtros hecho a mano (el ícono de deslizadores y «Filtros» al lado): es <BotonFiltros>.
      "\\bSlidersHorizontal\\b[^\\n]*(?:\\n[^\\n]*){0,1}?\\n\\s*Filtros\\b",
      // El conteo escrito («Filtros · 2»): va en el globito de la pieza.
      "Filtros\\{[^}]*·"
    ],
    "deuda": [],
    "excepciones": []
  },
  "accion.ver": {
    "fecha": "2026-10-13",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/accion.ver.md",
    "elegida": "P1 · llevar a ver algo en otra pantalla es siempre el botón secundario con la flecha a la derecha que avanza 4 px (<BotonVer>), nunca negro ni con «→» escrito; dentro de una frase, el enlace; junto a un resumen, <EnlaceVer>; elegida tocándola el 2026-10-13. Al lado de una fila de una lista (los pendientes del turno en Caja), «Ver» es el enlace del sistema (`btn-cayla btn-enlace`): la fila no crece (P1, elegida el 2026-10-14)",
    "pieza": "components/ui/BotonDescargar.tsx",
    "tambien": [],
    "ventana": 6,
    "firmas": [
      // Un botón NEGRO que solo lleva a otra pantalla («Ver en Existencias», «Ir a Caja», «Abrir ficha completa»): es <BotonVer>.
      "<(?:Link|BotonEnlace|a)\\b[^>]*?(?:\\bbtn-primario\\b|peso=\"primario\")[^>]*>\\s*\\n(?:\\s*<[^>]*\\/>\\s*\\n)?\\s*(?:Ver|Ir a|Abrir ficha)\\b",
      // «→» escrito a mano en un botón del sistema que lleva a otro lado: la flecha la dibuja la pieza.
      "\\bbtn-(?:primario|secundario|sutil)\\b[^\\n]*(?:\\n[^\\n]*){0,2}?\\n\\s*(?:Ver|Ir a|Abrir)\\b[^\\n]*→",
      // El «Ver» de una fila hecho a mano (un botoncito de 11 px con borde): es el enlace del sistema.
      "<(?:Link|a|button)\\b(?:[^>]|=>)*?\\btext-\\[11px\\](?:[^>]|=>)*>\\s*Ver\\s*<"
    ],
    "deuda": [],
    "excepciones": []
  },
  "accion.cancelar": {
    "fecha": "2026-10-14",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/accion.cancelar.md",
    "elegida": "P1 · «Cancelar» es el botón secundario del sistema, del ancho de su palabra, ANTES del botón que guarda y los dos a la derecha del pie (`pie-acciones` / <PieAcciones>); lo que borra o desactiva, solo a la izquierda; en el celular, mitades; el flujo del mostrador conserva sus 48 px; elegida tocándola el 2026-10-14",
    "pieza": "components/ui/PieAcciones.tsx",
    "tambien": ["app/estilos/pie-acciones.css", "components/ui/Modal.tsx", "components/FlujoGuiado.tsx"],
    "ventana": 6,
    "firmas": [
      // Un «Cancelar» a media fila (`flex-1`, `botonCancelar`), sutil, discreto o en versalitas: es el secundario a su medida en `pie-acciones`.
      "<(?:Boton|button|BotonEnlace|Link)\\b(?:[^>]|=>)*?(?:\\bbtn-sutil\\b|peso=\"discreto\"|\\blabel-cayla\\b|\\bflex-1\\b|\\{botonCancelar\\})(?:[^>]|=>)*>\\s*Cancelar(?=\\s*(?:<|\\n|$))"
    ],
    "deuda": [],
    "excepciones": [
      { "archivo": "components/GeneradorDibujo.tsx", "motivo": "una barra de herramientas del dibujo (Cancelar, Otras variantes, Usar este), no el pie de una hoja" }
    ]
  },
  "accion.limpiar": {
    "fecha": "2026-10-14",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/accion.limpiar.md",
    "elegida": "P2 · cada filtro puesto es la píldora de los vacíos (<FiltroPuesto>, tinta con su ✕) y «Limpiar todo» una píldora más, punteada, con el embudo tachado (<BotonLimpiar>); el verbo es «Limpiar» + qué, nunca «Quitar filtros»; en la hoja del celular, el secundario; en el calendario y en «Pagar juntos», el enlace; elegida tocándola el 2026-10-14",
    "pieza": "components/ui/FiltrosPuestos.tsx",
    "tambien": ["app/estilos/vacio-aviso-buscador.css"],
    "ventana": 4,
    "firmas": [
      // «Limpiar» en versalitas sueltas o sutil: es <BotonLimpiar> en la fila de filtros, el enlace en el calendario, el secundario en una hoja.
      "<(?:button|Boton)\\b(?:[^>]|=>)*?(?:\\blabel-cayla\\b|\\bbtn-sutil\\b)(?:[^>]|=>)*>\\s*Limpiar\\b",
      // La pastilla de un filtro puesto hecha a mano (versalitas con su ×): es <FiltroPuesto>.
      "rounded-full border border-tinta\\/15 bg-tinta\\/\\[0\\.04\\]",
      // El verbo: «Limpiar», nunca «Quitar filtros».
      "\\bQuitar (?:los )?filtros\\b"
    ],
    "deuda": [],
    "excepciones": []
  },
  "accion.imprimir": {
    "fecha": "2026-10-14",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/accion.imprimir.md",
    "elegida": "P1 · <BotonImprimir>: siempre con la impresora a la izquierda y «Imprimir» + qué; negro solo si imprimir ES el paso (el ticket después de vender, las etiquetas de lo que acaba de llegar), si no secundario; «o guardar en PDF» va en la frase de al lado; la hoja sale de la impresora al pasar el mouse; elegida tocándola el 2026-10-14. La impresora es SOLO de lo que imprime en ese momento: «Etiquetas», que lleva a la pantalla de etiquetas, lleva la etiqueta (<Tag>) en Productos y en Existencias (P1, elegida el 2026-10-14)",
    "pieza": "components/ui/BotonImprimir.tsx",
    "tambien": ["app/globals.css"],
    "ventana": 3,
    "firmas": [
      // La impresora dibujada fuera de la pieza (un botón a mano): es <BotonImprimir>.
      "<Printer\\b",
      // «Imprimir o guardar (en) PDF» en el botón: lo del PDF va en la frase de al lado.
      "Imprimir o guardar",
      // Un botón del sistema que dice «Imprimir…» sin la pieza.
      "(?:\\bbtn-(?:primario|secundario)\\b|<Boton\\b)(?:[^>]|=>)*>\\s*(?:\\{[^}\\n]*\\?\\s*)?[\"`]?Imprimir\\b"
    ],
    "deuda": [],
    "excepciones": [
      { "archivo": "components/OpcionesComprobante.tsx", "motivo": "«Imprimir de nuevo» es una opción de una lista (abre el PDF), no un botón" },
      { "archivo": "components/apartados/TodosVista.tsx", "motivo": "fila compacta del mostrador: reimprimir es un ícono con su nombre para el lector, junto al de WhatsApp" },
      { "archivo": "components/GuiaImpresion.tsx", "motivo": "la guía de impresión DIBUJA el botón de la pantalla de etiquetas para explicarlo; no es un botón" }
    ]
  },
  "titulo-pagina": {
    "fecha": "2026-10-14",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/titulo-pagina.md",
    "elegida": "P1 · la cabecera de Inventario (<EncabezadoPagina>) en todas las pantallas menos Finanzas: arriba la sede y la fecha con su hilo, el nombre del menú en 46 px, la frase y los botones a la derecha; la vuelta es la flecha a la izquierda de la línea de la sede y lo que dice de dónde se llegó va tras la fecha (`detalle`); Finanzas conserva la de su spike (<CabeceraPantalla>, ADR-0195); elegida mirando las fotos de cada pantalla el 2026-10-14",
    "pieza": "components/ui/EncabezadoPagina.tsx",
    "tambien": ["components/ui/CabeceraPantalla.tsx"],
    "firmas": [
      // El título de una pantalla dibujado a mano en la serif de la casa (con su sobretítulo en versalitas al lado): es <EncabezadoPagina>.
      "<h1\\b(?:[^>]|=>)*\\bfont-display\\b",
      // La cabecera de Finanzas fuera de Finanzas.
      "<CabeceraPantalla\\b"
    ],
    "deuda": [],
    "excepciones": [
      { "archivo": "components/GastosPanel.tsx", "motivo": "Finanzas conserva la cabecera de su spike (ADR-0195)" },
      { "archivo": "components/ImpuestosPanel.tsx", "motivo": "Finanzas conserva la cabecera de su spike (ADR-0195)" },
      { "archivo": "components/finanzas/ResumenFinanzas.tsx", "motivo": "Finanzas conserva la cabecera de su spike (ADR-0195)" },
      { "archivo": "components/finanzas/CierreMes.tsx", "motivo": "Finanzas conserva la cabecera de su spike (ADR-0195)" },
      { "archivo": "components/finanzas/CabeceraDinero.tsx", "motivo": "Finanzas conserva la cabecera de su spike (ADR-0195)" },
      { "archivo": "components/finanzas/CabeceraReportes.tsx", "motivo": "Finanzas conserva la cabecera de su spike (ADR-0195)" },
      { "archivo": "app/(app)/productos/[id]/historial/page.tsx", "motivo": "la página «Historial» de la vista rápida es decidida a propósito (ADR-0354, ADR-0136 act. 2026-10-05)" },
      { "archivo": "components/PantallaNoEncontrada.tsx", "motivo": "un estado (la pantalla que no existe), no la cabecera de una pantalla del menú" },
      { "archivo": "components/ProduccionSoloEnTaller.tsx", "motivo": "un estado (Producción solo se ve parado en el Taller), no la cabecera de una pantalla" },
      { "archivo": "app/(app)/sin-acceso/page.tsx", "motivo": "un estado (tu rol no ve este módulo), no la cabecera de una pantalla" },
      { "archivo": "app/(app)/error.tsx", "motivo": "un estado (la pantalla se cayó), no la cabecera de una pantalla" },
      { "archivo": "app/(app)/global/elige-sede/page.tsx", "motivo": "un estado (en CAYLA Global esta pantalla pide una sede), no la cabecera de una pantalla" },
      { "archivo": "components/plan-compra/ExportarPlan.tsx", "motivo": "la hoja del plan de campaña que se imprime o se guarda: es papel, no una pantalla" },
      { "archivo": "components/clientas/piezas-club-publico.tsx", "motivo": "la página pública del club, para el cliente fuera del ERP, con su propio diseño" },
      { "archivo": "components/clientas/PaginaLegalClub.tsx", "motivo": "la página legal del club, pública y fuera del ERP, con su propio diseño" }
    ]
  },
  "accion.guardar": {
    "fecha": "2026-10-14",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/accion.guardar.md",
    "elegida": "P1 · mientras guarda, el botón dice «Guardando…» (u otro verbo, `textoCargando`: «Anulando…», «Desactivando…», «Imprimiendo…») y corre el hilo de abajo, sin cambiar de ancho, y se apaga para que un doble clic no guarde dos veces; lo hace la pieza con `cargando` (`<Boton>`, `BotonCompacto` y los botones del flujo del mostrador); elegida tocándola el 2026-10-14",
    "pieza": "components/ui/campos.tsx",
    "tambien": ["components/ui/BotonCompacto.tsx", "components/FlujoGuiado.tsx"],
    "firmas": [
      // La palabra de espera escrita a mano en el botón: la pone la pieza con `cargando`.
      "\\?\\s*\"Guardando…\"\\s*:",
      // La rueda que gira dentro de un botón que guarda: la espera es el hilo de la pieza.
      "<Loader2\\b[^>]*animate-spin"
    ],
    "deuda": [],
    "excepciones": []
  },
  "accion.editar": {
    "fecha": "2026-10-14",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/accion.editar.md",
    "elegida": "P1 · abrir la edición de algo entero es el botón secundario con el lápiz (<BotonEditar>), nunca negro; en una fila o una tarjeta de una lista, el lápiz solo de 32 px con «Editar …» para el lector (<LapizEditar>); dentro de una frase o de una hoja, el enlace (ronda 9); elegida tocándola el 2026-10-14",
    "pieza": "components/ui/BotonEditar.tsx",
    "tambien": [],
    "ventana": 3,
    "firmas": [
      // El lápiz dibujado fuera de la pieza (un «Editar» a mano).
      "<Pencil\\b",
      // «Editar» negro, sutil o en versalitas: es <BotonEditar> o <LapizEditar>.
      "(?:\\bbtn-primario\\b|peso=\"primario\"|\\bbtn-sutil\\b|peso=\"discreto\"|<AccionTarjeta\\b)(?:[^>]|=>)*>\\s*Editar\\b"
    ],
    "deuda": [],
    "excepciones": [
      { "archivo": "components/vista-rapida/VistaRapidaProducto.tsx", "motivo": "la vista rápida de un producto es de diseño propio (ADR-0136 act. 2026-10-05); su «Editar» ya es el secundario con el lápiz, con la cara de sus botones" },
      { "archivo": "components/ficha-producto/MatrizStockFicha.tsx", "motivo": "la ficha de stock: el lápiz de corregir un color va junto al tacho, los dos con su borde, y el chico de la celda es la pista de que la talla se edita al tocarla" }
    ]
  },
  "modal": {
    "fecha": "2026-10-14",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/modal.md",
    "elegida": "P1 · P1 · P1 · toda hoja con la misma cara (papel, sin sombra, título serif de 24 px y la frase en taupe), tres anchos con nombre (`tamano`: angosta 448, mediana 576, ancha 768) y una salida a la vista (la × si solo se lee, «Cancelar» si guarda, nunca las dos); las de diseño propio conservan su `ancho` con su motivo; elegidas tocándolas el 2026-10-14",
    "pieza": "components/ui/Modal.tsx",
    "tambien": ["components/ui/ModalRuta.tsx"],
    "firmas": [
      // Un ancho a medida (`max-w-…`): la hoja recibe un tamaño con nombre.
      "\\bancho=(?:\"[^\"]*max-w|\\{\"[^\"]*max-w|\\{`[^`]*max-w)",
      // El título de 26 px de antes: toda hoja tiene el mismo título.
      "\\btituloGrande\\b"
    ],
    "deuda": [],
    "excepciones": [
      { "archivo": "components/NuevaOrdenProduccionForm.tsx", "motivo": "Nueva orden de producción es de diseño propio (la matriz y la barra de la ficha): conserva su ancho" }
    ]
  },
  "grafico.barra": {
    "fecha": "2026-10-09",
    "adr": "docs/adr/0358-unificar-una-funcion-una-pieza.md",
    "registro": "docs/unificar/grafico.barra.md",
    "elegida": "P · la pista de arena de Frescura y Facturación con todo el movimiento de «Deuda por vencimiento» de Compras: entra tramo a tramo, se estira al pasar el mouse y los demás bajan, se reacomoda al cambiar la cifra; tres altos (12 · 8 · 4), 24 px para el mouse y una sola voz para el lector; elegida tocando las demos el 2026-10-09",
    "pieza": "components/ui/BarraApilada.tsx",
    "tambien": ["app/estilos/barra-apilada.css"],
    "firmas": [
      // El tramo dibujado a mano: crece por `flex-basis 0` y se reacomoda con `transition-[flex-grow…]` (Compras, Por pagar, el reparto de un pago).
      // Las clases van en un solo texto y en cualquier orden.
      "[\"'`](?=[^\"'`]*(?<![\\w-])basis-0(?![\\w-]))(?=[^\"'`]*\\btransition-\\[[^\\]]*flex-grow)",
      // La barra dibujada a mano con un hilo entre tramos: una fila baja (de 4 a 14 px) separada por 1 a 3 px.
      "[\"'`](?=[^\"'`]*(?<![\\w-])flex(?![\\w-]))(?=[^\"'`]*(?<![\\w-])h-(?:1|1\\.5|2|3|3\\.5|\\[5px\\])(?![\\w.\\[-]))(?=[^\"'`]*(?<![\\w-])gap-(?:px|0\\.5|\\[3px\\])(?![\\w.\\[-]))",
      // La barra con pista y sin hilo: una fila baja (de 3 a 16 px) sobre una pista de arena, hueso o tinta al 5 o 10 % (Caja, Por pagar
      // de Producción, el reparto del gasto del Taller, el cierre de caja). Una barra de UN solo relleno que se llena con `absolute` o sin
      // `flex` no entra (mide un avance: `BarraAvance`, `PistaPlazo`); si alguien la dibuja con `flex`, salta y se resuelve con la pieza o con
      // `unificar-fijo` y su motivo. Las clases, en cualquier orden.
      "[\"'`](?=[^\"'`]*(?<![\\w-])flex(?![\\w-]))(?=[^\"'`]*(?<![\\w-])h-(?:1|1\\.5|2|2\\.5|3|3\\.5|4|\\[\\d+px\\])(?![\\w.\\[-]))(?=[^\"'`]*(?<![\\w-])bg-(?:sand|hueso|tinta/(?:5|10))(?![\\w-]))",
      // Las barras con clase propia: la de las tarjetas de Facturación (`kpi-apilada`) y las de Notas de crédito (`nc-conc`, `nc-barra`).
      "className=\"[^\"]*(?<![\\w-])(?:kpi-apilada|nc-conc|nc-barra)(?![\\w-])",
      // Una pieza homónima (la de Facturación y Proformas, con `partes` y leyenda propia): el mismo nombre que la del sistema.
      "^\\s*(?:export\\s+)?(?:default\\s+)?(?:function|const)\\s+BarraApilada\\b"
    ],
    "deuda": [],
    "excepciones": []
  },
};

export const FAMILIAS = [...BASE, ...ACCIONES].map((f) => ({ ...f, decision: DECISIONES[f.id] ?? null }));

export const familiaPorId = (id) => FAMILIAS.find((f) => f.id === id) ?? null;

/** Una línea legítima que se parece a una variante a mano se exime con este comentario en la MISMA línea (10 caracteres de motivo). */
export const MARCA_FIJA = /unificar-fijo:\s*\S.{8,}/;
