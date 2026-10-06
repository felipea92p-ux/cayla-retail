// Las familias de piezas que `/unificar` compara (ADR-0354): la ÚNICA definición de «qué cuenta como la misma función». La usan
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
  { id: "guardar", nombre: "Guardar / Confirmar", patron: "^(guardar|confirmar|aceptar|aplicar|listo)\\b" },
  // Antes que «eliminar»: «Quitar filtros» limpia la lista, no borra nada.
  { id: "limpiar", nombre: "Limpiar filtros", patron: "^(limpiar|restablecer)\\b|^(quitar|borrar) (los |todos los )?filtros\\b" },
  { id: "nuevo", nombre: "Nuevo / Agregar / Registrar", patron: "^(\\+\\s*)?(nuevo|nueva|agregar|anadir|crear|registrar)\\b|^\\+$" },
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
    pieza: "Hoy hay varias: `Pestanas`, `TabsSubrayado`, `SegmentoDeslizante`, `SegmentoEnlaces` (components/ui/)",
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
    pieza: "`<TarjetaCifra>` (components/ui/TarjetaCifra.tsx); también existen `TarjetaKpiVidrio`, `TarjetaIndicador`, `TarjetaSenal`",
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
 *     fecha: "2026-10-07",
 *     adr: "docs/adr/0354-unificar-una-funcion-una-pieza.md",
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
 * @typedef {{ fecha: string, adr: string, registro: string, elegida: string, pieza: string, tambien?: string[], firmas: string[], deuda: string[], excepciones?: Excepcion[] }} Decision
 * @type {Record<string, Decision>}
 */
export const DECISIONES = {
  "accion.volver": {
    fecha: "2026-10-06",
    adr: "docs/adr/0354-unificar-una-funcion-una-pieza.md",
    registro: "docs/unificar/accion.volver.md",
    elegida: "propuesta · un solo botón con flecha",
    pieza: "components/ui/Volver.tsx",
    firmas: [
      // La línea de 11 px en versalitas que era la forma «enlace», copiada a mano.
      "label-cayla inline-flex items-center gap-1\\.5 text-\\[11px\\] text-tinta/65",
      // La prop que daba dos caras a la pieza.
      "<Volver[^>]*\\bforma=",
      // Una vuelta escrita a mano con el glifo.
      "←\\s*Volver a ",
    ],
    deuda: [],
    excepciones: [
      { archivo: "app/(app)/global/elige-sede/page.tsx", motivo: "Tarjeta de barrera (elegir sede): su salida es la única acción de la tarjeta y va con los botones, no es la vuelta de una pantalla interna (docs/unificar/accion.volver.md)" },
    ],
  },
};

export const FAMILIAS = [...BASE, ...ACCIONES].map((f) => ({ ...f, decision: DECISIONES[f.id] ?? null }));

export const familiaPorId = (id) => FAMILIAS.find((f) => f.id === id) ?? null;

/** Una línea legítima que se parece a una variante a mano se exime con este comentario en la MISMA línea (10 caracteres de motivo). */
export const MARCA_FIJA = /unificar-fijo:\s*\S.{8,}/;
