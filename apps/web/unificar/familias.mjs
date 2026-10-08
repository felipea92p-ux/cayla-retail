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
    id: "titulo-pagina",
    grupo: "Textos",
    nombre: "Títulos de pantalla",
    funcion: "El nombre grande de la pantalla, arriba.",
    pieza: "`<EncabezadoPagina>` (Ventas, Inventario, Catálogo ▸ Productos); `<CabeceraPantalla>` (Finanzas)",
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
    pieza: "`<Modal>` / `<ModalRuta>` (components/ui/Modal.tsx)",
    gobierna: ["ADR-0136"],
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
      "\\bbtn-(?:sutil|enlace)\\b[^\"'`]*\\btext-rojo"
    ],
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
    "firmas": [
      // La frase en cursiva serif (B) y su versión «SinCoincidencias».
      "\\bfont-display\\b[^\"'`]*\\bitalic\\b[^\"'`]*\\btext-tinta\\/6[05]\\b",
      // La frase gris suelta de <Tabla> y sus primas (A), la centrada gris clara de Caja y la cursiva chica.
      "\\bp-5 text-sm text-tinta\\/75\\b|\\bpy-6 text-center text-xs text-tinta\\/50\\b|\\btext-xs italic text-tinta\\/65\\b|\\bpx-3 py-3 text-sm text-tinta\\/65\\b",
      // El título en negrita sobre panel claro (C), el recuadro punteado (F, Apartados) y el colibrí que flota (G).
      "\\brounded-xl bg-papel\\/60 px-6 py-10\\b|\\bborder-dashed border-(?:sand|tinta\\/25)\\b[^\"'`]*\\bpy-(?:6|10)\\b[^\"'`]*\\btext-center\\b|\\bcmp-flota\\b|\\btp-vacia\\b"
    ],
    "deuda": [
      "app/(app)/compras/nueva/page.tsx",
      "app/(app)/compras/por-pagar/page.tsx",
      "app/(app)/compras/proveedores/[id]/page.tsx",
      "app/(app)/inventario/traslados/(billetera)/page.tsx",
      "app/(app)/inventario/traslados/nuevo/page.tsx",
      "app/(app)/produccion/insumos/page.tsx",
      "app/(app)/produccion/ordenes/page.tsx",
      "app/(app)/produccion/recibir/page.tsx",
      "app/(app)/productos/nuevo/page.tsx",
      "app/(app)/recibir/page.tsx",
      "app/estilos/comprobantes-lista.css",
      "app/estilos/traslados-pases.css",
      "components/apartados/EntregarVista.tsx",
      "components/CajaAbiertaPanel.tsx",
      "components/CajaTablero.tsx",
      "components/CategoriasLista.tsx",
      "components/CierreCajaDetalle.tsx",
      "components/ClientaFichaModal.tsx",
      "components/colaboradores/EquipoLista.tsx",
      "components/ColaboradoresPanel.tsx",
      "components/ColaSunatPanel.tsx",
      "components/ComprasAgrupadas.tsx",
      "components/ComprobantesPanel.tsx",
      "components/ComprobantesProduccionPanel.tsx",
      "components/CotizacionesMaquilaPanel.tsx",
      "components/FiltrosRecibidas.tsx",
      "components/InsumosPanel.tsx",
      "components/MoverMercaderiaFormV2.tsx",
      "components/NotasCreditoPanel.tsx",
      "components/NuevaProformaModal.tsx",
      "components/OrdenesTablero.tsx",
      "components/PorPagarLista.tsx",
      "components/PorPagarProduccionPanel.tsx",
      "components/ProduccionSoloEnTaller.tsx",
      "components/ProductosGrilla.tsx",
      "components/ProductosTabla.tsx",
      "components/ProformasPanel.tsx",
      "components/ProveedoresPanel.tsx",
      "components/ProveedoresProduccionPanel.tsx",
      "components/RecepcionesCompraLista.tsx",
      "components/RecibirProduccionPanel.tsx",
      "components/RegistrarNotaCreditoModal.tsx",
      "components/ResumenProduccionPanel.tsx",
      "components/RolesPanel.tsx",
      "components/SinCoincidencias.tsx",
      "components/traslados-pases/Billetera.tsx",
      "components/ui/campos.tsx",
      "components/ui/ComboBuscable.tsx",
      "components/ui/FiltrosPildora.tsx",
      "components/ui/Tabla.tsx",
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
      // Las dos piezas que existían a mano.
      "^\\s*(?:export\\s+)?function\\s+(?:AvisoInline|AvisoDeError)\\b",
      // Un párrafo rojo suelto (el error va bajo su campo o en <Aviso tono=\"error\">).
      "<p\\b[^>]*className=\\{?[\"'`][^\"'`]*\\btext-(?:xs|sm|\\[1[23](?:\\.5)?px\\]) text-rojo(?:-profundo)?\\b"
    ],
    "deuda": [
      "components/AbrirCajaFormV2.tsx",
      "components/AbrirConteo.tsx",
      "components/AjustarInventarioModal.tsx",
      "components/alta-producto/ConfigurarCategoria.tsx",
      "components/alta-producto/ElegirColores.tsx",
      "components/alta-producto/ElegirEtiquetas.tsx",
      "components/alta-producto/ElegirMuestra.tsx",
      "components/alta-producto/ElegirTallas.tsx",
      "components/alta-producto/NuevaMarcaForm.tsx",
      "components/alta-producto/NuevoColorAlta.tsx",
      "components/alta-producto/piezas.tsx",
      "components/alta-producto/ProductoCreado.tsx",
      "components/alta-producto/ProponerValor.tsx",
      "components/AnularVentaForm.tsx",
      "components/apartados/ApartarVista.tsx",
      "components/apartados/EntregarVista.tsx",
      "components/apartados/ModalesApartado.tsx",
      "components/AvisoCostoAtipico.tsx",
      "components/BajarAlPisoForm.tsx",
      "components/CerrarCajaModalV2.tsx",
      "components/CierreCajaDetalle.tsx",
      "components/clientas/BeneficiosClubModal.tsx",
      "components/clientas/club-piezas.tsx",
      "components/colaboradores/FichaColaborador.tsx",
      "components/ColoresLista.tsx",
      "components/ComprobanteEncabezado.tsx",
      "components/conteo/AltaAlVuelo.tsx",
      "components/conteo/CancelarConteoModal.tsx",
      "components/conteo/EditarConteo.tsx",
      "components/conteo/ElegirPrendas.tsx",
      "components/conteo/RevisarConteo.tsx",
      "components/cuadre-piso/CuadrarPisoForm.tsx",
      "components/DevolucionesPendientes.tsx",
      "components/EditarMarcaModal.tsx",
      "components/existencias/FlujoTalla.tsx",
      "components/ficha-producto/AgregarColoresModal.tsx",
      "components/ficha-producto/AgregarTallasModal.tsx",
      "components/finanzas/EstadoResultadosPanel.tsx",
      "components/FlujoGuiado.tsx",
      "components/inicio/AjustarInicio.tsx",
      "components/MoverMercaderiaFormV2.tsx",
      "components/NuevaProformaModal.tsx",
      "components/OrdenInsumos.tsx",
      "components/PagoPiezas.tsx",
      "components/PerfilModal.tsx",
      "components/punto-de-venta/ClientaDelTicket.tsx",
      "components/RecepcionEnvio.tsx",
      "components/RegistrarNotaCreditoModal.tsx",
      "components/ResolverDanadosModal.tsx",
      "components/RolesModales.tsx",
      "components/RolesPanel.tsx",
      "components/SelectorDeAjuste.tsx",
      "components/TerminalesModales.tsx",
      "components/VentaRegistradaModal.tsx",
      "components/VentasDeHoy.tsx",
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
      "type=\"search\"|inputMode=\"search\"",
      "<SenalBuscando\\b",
      "placeholder=\"Escanea la etiqueta"
    ],
    "deuda": [
      "components/alta-producto/ArbolCategoria.tsx",
      "components/atributos/kit.tsx",
      "components/BuscadorHistorial.tsx",
      "components/BuscadorVentas.tsx",
      "components/clientas/BuscadorClientas.tsx",
      "components/colaboradores/DarAccesoModal.tsx",
      "components/colaboradores/EquipoLista.tsx",
      "components/ComprobantesProduccionPanel.tsx",
      "components/FacturacionCabecera.tsx",
      "components/FiltrosExistencias.tsx",
      "components/FiltrosMovimientos.tsx",
      "components/FiltrosProductos.tsx",
      "components/FiltrosRecibidas.tsx",
      "components/MarcasLista.tsx",
      "components/NotasCreditoPanel.tsx",
      "components/por-regularizar/PanelPrendas.tsx",
      "components/PorRegularizarLista.tsx",
      "components/ProveedoresPanel.tsx",
      "components/ProveedoresProduccionPanel.tsx",
      "components/punto-de-venta/ClientaDelTicket.tsx",
      "components/PuntoDeVentaCatalogo.tsx",
      "components/RecepcionEnvio.tsx",
      "components/RegistrarNotaCreditoModal.tsx",
      "components/RolesPanel.tsx",
      "components/traslados-pases/Billetera.tsx",
    ],
    "excepciones": [
      { "archivo": "components/finanzas/kit.tsx", "motivo": "El buscador del kit de Finanzas (ADR-0195, decidido a propósito): Felipe dice si se suma a la pieza" },
      { "archivo": "components/analisis/AnalisisPantalla.tsx", "motivo": "El buscador de prendas de Análisis v4 (ADR-0357, decidido a propósito): Felipe dice si se suma" }
    ]
  },
};

export const FAMILIAS = [...BASE, ...ACCIONES].map((f) => ({ ...f, decision: DECISIONES[f.id] ?? null }));

export const familiaPorId = (id) => FAMILIAS.find((f) => f.id === id) ?? null;

/** Una línea legítima que se parece a una variante a mano se exime con este comentario en la MISMA línea (10 caracteres de motivo). */
export const MARCA_FIJA = /unificar-fijo:\s*\S.{8,}/;
