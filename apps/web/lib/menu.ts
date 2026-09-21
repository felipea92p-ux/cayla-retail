// El menú de CAYLA como DATOS: un solo árbol, una sola función pura que dice qué ve cada perfil.
//
// PROMETE: dado un perfil (qué permisos tiene y en qué tipo de ubicación está parado) `menuPara` devuelve las filas del
// lateral de escritorio, las 5 columnas de la barra del celular, las acciones del «+ Nuevo» y el módulo que se abre al
// aterrizar en una ruta. Sin React, sin Supabase, sin efectos: se prueba con `menu.test.ts` sin abrir un navegador.
//
// ASUME: (1) que esto es solo VISIBILIDAD — el candado real vive en la base (RLS, `fn_puede_*`, cada RPC); un nodo que no
// se pinta no protege nada. (2) Que las rutas que declara existen (lo comprueba la prueba contra `app/`). (3) Que un
// mismo destino se pinta UNA vez por perfil (lo comprueba la prueba).
//
// POR QUÉ EXISTE (paso 1 del rediseño, 2026-09-21): las reglas de quién ve qué estaban repartidas en `AppShell.tsx` (siete
// constantes sueltas, una lista de rutas por grupo repetida a mano, las acciones de «+ Nuevo» dentro de otro componente) y
// en `produccion-menu.ts`. Para rediseñar el menú con pruebas hacía falta que el árbol fuera un dato. ESTE paso no cambia
// nada de lo que se ve: `menu-hoy.golden.json` es la fotografía del menú de antes, y `menu.test.ts` exige que este archivo
// la reproduzca fila por fila. Los pasos siguientes cambian el árbol a propósito y cambian la fotografía a propósito.
//
// Las decisiones de fondo que este árbol conserva: ADR-0014 (el riel camina sobre filas visibles), ADR-0057 («Ventas» agrupa
// el mostrador), ADR-0071 (Inventario = cuatro pantallas + Análisis), ADR-0101 (Análisis es de decisión, no de mostrador),
// ADR-0113 (una sola puerta para recibir), ADR-0126 (el dinero de Compras no se le muestra a quien no lo ve), ADR-0130 (el
// lateral se pliega: los grupos cuentan como cerrados) y ADR-0133 (Producción y Compras son dos módulos distintos).

/* ------------------------------------------------------------------
   Vocabulario del árbol
   ------------------------------------------------------------------ */

/** Tipo de la ubicación en la que está parado quien mira (`personas.ubicacionTipo`). */
export type TipoUbicacion = "tienda" | "almacen" | "taller";
export const TIPOS_UBICACION: readonly TipoUbicacion[] = ["tienda", "almacen", "taller"];

/**
 * Los 14 pájaros del aviario (`scripts/datos/aviario.mjs`, `docs/datos/07-GOBIERNO.md` §1): cada nodo cita al dueño del
 * DATO que muestra, para que quien rediseñe el menú sepa a quién preguntarle antes de mover una puerta. `menu.test.ts`
 * compara esta lista con la del aviario: si un pájaro cambia de nombre o nace uno, la prueba avisa.
 */
export const PAJAROS = [
  "01 Ganso", "02 Loro", "03 Tucán", "04 Golondrina", "05 Halcón", "06 Lechuza", "07 Colibrí",
  "08 Cuervo", "09 Pelícano", "10 Gallito", "11 Garza", "12 Urraca", "13 Águila", "14 Gorrión",
] as const;
export type Pajaro = (typeof PAJAROS)[number];

/**
 * Permisos SEMÁNTICOS: lo que una fila exige no es «ser líder», es poder hacer algo. Hoy el líder los tiene todos y el
 * integrante ninguno (`permisosDe`); el día que nazcan Admin y Solo lectura (D-12, cuatro niveles) se cambia UNA función y
 * el árbol no se toca.
 *  - administrar: dar y quitar acceso, configurar (Colaboradores).
 *  - verDinero:   costos, compras, pagos y comprobantes (ADR-0126: `fn_puede_ver_dinero_de_compras`).
 *  - analizar:    lecturas de decisión de una sede (Análisis de inventario).
 */
export const PERMISOS = ["administrar", "verDinero", "analizar"] as const;
export type Permiso = (typeof PERMISOS)[number];

export type RolMenu = "lider" | "integrante";

/** El ÚNICO lugar donde el rol se traduce a permisos. Ningún nodo del árbol pregunta por el rol: pregunta por un permiso. */
export function permisosDe(rol: RolMenu): readonly Permiso[] {
  return rol === "lider" ? PERMISOS : [];
}

/** Claves de los íconos. Los trazos viven en `AppShell.tsx` (`IC`); acá solo se nombra cuál lleva cada nodo. */
export type ClaveIcono =
  | "inicio" | "vender" | "caja" | "productos" | "inventario" | "movimientos" | "traslados" | "conteo" | "resumen"
  | "facturacion" | "compras" | "colaboradores" | "insumos" | "produccion" | "cambios" | "devoluciones" | "venta"
  | "catalogo" | "categorias" | "atributos" | "proveedores" | "facturas" | "recibir" | "porPagar" | "notasCredito";

/** Números que una fila puede llevar de insignia («por atender»). Los calcula el servidor; el árbol solo dice cuál va dónde. */
export type ClaveContador = "trasladosPorAtender";
export type Contadores = Partial<Record<ClaveContador, number | null>>;

/* ------------------------------------------------------------------
   Los nodos
   ------------------------------------------------------------------ */

type Comun = {
  /** Estable. Los grupos conservan el id que ya tenían en pantalla (`data-grupo-id`); las hojas usan «grupo.hoja». */
  id: string;
  etiqueta: string;
  /** El pájaro dueño del dato que esta fila muestra. */
  pajaro: Pajaro;
  /** Se muestra solo a quien tiene este permiso. */
  exige?: Permiso;
  /** Se muestra solo a quien NO lo tiene. Existe por UN caso: «Recibir mercadería» vive en Compras para quien ve el dinero
   *  de compras y en Inventario para quien no (ADR-0113); las dos filas apuntan a `/recibir` y nunca salen a la vez (parado en
   *  el Taller, quien ve el dinero no tiene ninguna: allí Compras no se muestra). */
  soloSinPermiso?: Permiso;
  /** Tipos de ubicación donde aplica; sin esto, en todas. */
  ubicaciones?: readonly TipoUbicacion[];
};

/** Una pantalla. */
export type Hoja = Comun & { estado: "viva"; ruta: string; icono: ClaveIcono; contador?: ClaveContador };

/** Una cabecera que agrupa pantallas y no navega (en el celular, su `raiz` es a donde lleva). */
export type Grupo = Comun & {
  estado: "viva";
  icono: ClaveIcono;
  /** La puerta del módulo: todo lo que cuelga de esta ruta es de este grupo (decide qué grupo se abre al aterrizar). */
  raiz: string;
  hijos: readonly (Hoja | Futura)[];
};

/** Algo que todavía no existe: vive en el árbol para que el aviario quede a la vista, y `menuPara` NO lo emite. */
export type Futura = Comun & { estado: "futura"; nota: string; hijos?: readonly Futura[] };

export type Nodo = Hoja | Grupo | Futura;

export function esGrupo(n: Nodo): n is Grupo {
  return n.estado === "viva" && "hijos" in n;
}

/** Una acción del panel «+ Nuevo»: registrar algo, no ir a una pantalla. */
export type Accion = Comun & { estado: "viva"; ruta: string; detalle: string };

/* ------------------------------------------------------------------
   El árbol de HOY (más lo que viene)
   El orden es el del menú: Inicio, Colaboradores, Catálogo, Producción, Compras, Ventas, Inventario (Felipe, 2026-09-16).
   ------------------------------------------------------------------ */

export const ARBOL: readonly Nodo[] = [
  // Inicio y Análisis no son dueños de tablas: leen lo de otros. Águila es «Inteligencia y reportes» (lee lo de los demás).
  { id: "inicio", etiqueta: "Inicio", estado: "viva", ruta: "/", icono: "inicio", pajaro: "13 Águila" },

  // Integración con Dynamic (2026-09-13): «a quién de Dynamic le doy entrada a retail». Solo quien administra.
  { id: "colaboradores", etiqueta: "Colaboradores", estado: "viva", ruta: "/colaboradores", icono: "colaboradores", pajaro: "01 Ganso", exige: "administrar" },

  // Catálogo (2026-09-16/17): qué ES una prenda y el vocabulario del que cuelga. Colores, tallas, tejidos, patrones y
  // etiquetas viven como pestañas de «Atributos».
  {
    id: "catalogo", etiqueta: "Catálogo", estado: "viva", icono: "catalogo", raiz: "/productos", pajaro: "02 Loro",
    hijos: [
      { id: "catalogo.productos", etiqueta: "Productos", estado: "viva", ruta: "/productos", icono: "productos", pajaro: "02 Loro" },
      { id: "catalogo.categorias", etiqueta: "Categorías", estado: "viva", ruta: "/productos/categorias", icono: "categorias", pajaro: "02 Loro" },
      { id: "catalogo.atributos", etiqueta: "Atributos", estado: "viva", ruta: "/productos/atributos", icono: "atributos", pajaro: "02 Loro" },
    ],
  },

  // Producción (ADR-0133): el módulo de fabricar. Solo se ve PARADO EN UN TALLER, líder incluido (Felipe, 2026-09-20):
  // se decide por el TIPO de la ubicación activa, no por su nombre — un segundo Taller entraría solo. Es visibilidad; la
  // base sigue dejando al líder operar el Taller desde cualquier sede (`fn_puede_operar_ubicacion`).
  //
  // ATENCIÓN — TOPE: quien ve el dinero cuenta 6 hijas acá (Órdenes, Insumos, Proveedores, Comprobantes, Recibir, Por pagar):
  // EXACTAMENTE el tope de 6 por grupo. La próxima (Resumen F6, Eficiencia F7) obliga a REGRUPAR, no a subir el tope; el
  // candidato natural es agrupar el abastecimiento (Proveedores, Comprobantes, Recibir, Por pagar) bajo `produccion.abastecimiento`.
  // La prueba «Producción está EN el tope de 6 hijas» (menu.test.ts) avisa cuando esto cambie.
  {
    id: "produccion", etiqueta: "Producción", estado: "viva", icono: "produccion", raiz: "/produccion", pajaro: "10 Gallito", ubicaciones: ["taller"],
    hijos: [
      { id: "produccion.ordenes", etiqueta: "Órdenes", estado: "viva", ruta: "/produccion/ordenes", icono: "produccion", pajaro: "10 Gallito" },
      { id: "produccion.insumos", etiqueta: "Insumos", estado: "viva", ruta: "/produccion/insumos", icono: "insumos", pajaro: "10 Gallito" },
      // Abastecimiento del Taller (F4a a F4d, ADR-0133): proveedores, comprobantes, recepción y deuda de tela y avíos, APARTE de
      // los de Compras (D-H). Proveedores, Comprobantes y Por pagar solo para quien ve el dinero (D-G): llevan datos bancarios
      // de terceros y montos comprados. Recibir NO exige dinero: lo usa también quien trabaja en el Taller. El id termina en
      // «Produccion» a propósito: es la clave que `produccion-menu.ts` ya expone (`ClaveMenuProduccion`) y no debe chocar con
      // las de Compras. El pájaro es Gallito: `aviario.mjs` le da `proveedores_produccion` y `comprobantes_produccion` (y
      // Recibir escribe `insumo_lotes`, también suyo). Orden como en Compras: proveedor → comprobante → recibir → pago.
      { id: "produccion.proveedoresProduccion", etiqueta: "Proveedores", estado: "viva", ruta: "/produccion/proveedores", icono: "proveedores", pajaro: "10 Gallito", exige: "verDinero" },
      { id: "produccion.comprobantesProduccion", etiqueta: "Comprobantes", estado: "viva", ruta: "/produccion/comprobantes", icono: "facturas", pajaro: "10 Gallito", exige: "verDinero" },
      // OJO, no es «Recibir mercadería»: aquel (`/recibir`, de Compras e Inventario) recibe prendas contra un envío; este recibe
      // tela y avíos contra un comprobante de Producción. Dos pantallas de dos módulos, una etiqueta parecida. Visible solo en el
      // Taller porque el grupo entero lo es (`ubicaciones` del grupo).
      { id: "produccion.recibirProduccion", etiqueta: "Recibir", estado: "viva", ruta: "/produccion/recibir", icono: "recibir", pajaro: "10 Gallito" },
      { id: "produccion.porPagarProduccion", etiqueta: "Por pagar", estado: "viva", ruta: "/produccion/por-pagar", icono: "porPagar", pajaro: "10 Gallito", exige: "verDinero" },
      // Fases F6 y F7 de `docs/PLAN-PRODUCCION.md`. El orden final se decide cuando nazcan.
      { id: "produccion.resumen", etiqueta: "Resumen", estado: "futura", pajaro: "10 Gallito", nota: "Fase F6: el tablero del Taller." },
      { id: "produccion.abastecimiento", etiqueta: "Abastecimiento", estado: "futura", pajaro: "10 Gallito", nota: "El abastecimiento (F4a a F4d) ya vive arriba como hijas sueltas; el nodo queda como el candidato a agruparlas cuando Producción pase el tope de 6 hijas." },
      { id: "produccion.eficiencia", etiqueta: "Eficiencia", estado: "futura", pajaro: "10 Gallito", nota: "Fase F7: mermas y tiempos por orden." },
    ],
  },

  // Compras (ADR-0126): dinero de proveedores. Cada puerta exige `verDinero`; el grupo sale solo cuando no queda ninguna.
  // Es el módulo de comprar para las TIENDAS: parado en el Taller no se muestra, ni al líder (Felipe, 2026-09-21), del mismo
  // modo que Producción no se muestra en una tienda: en cada ubicación el líder ve UNO de los dos. Solo visibilidad: las
  // URLs de Compras siguen abriendo (otras pantallas enlazan a ellas) y el candado real es el de cada RPC. Consecuencia
  // conocida: «Recibir mercadería» vivía acá para el líder, así que parado en el Taller solo le queda en «+ Nuevo».
  // Mismo orden que ya tenía: proveedor → factura → recepción → pago → notas de crédito.
  {
    id: "compras", etiqueta: "Compras", estado: "viva", icono: "compras", raiz: "/compras", pajaro: "09 Pelícano", ubicaciones: ["tienda", "almacen"],
    hijos: [
      { id: "compras.proveedores", etiqueta: "Proveedores", estado: "viva", ruta: "/compras/proveedores", icono: "proveedores", pajaro: "09 Pelícano", exige: "verDinero" },
      { id: "compras.comprobantes", etiqueta: "Comprobantes", estado: "viva", ruta: "/compras", icono: "facturas", pajaro: "09 Pelícano", exige: "verDinero" },
      // ADR-0111/0113: recibir es una sola puerta (`/recibir`). El dato es del Halcón (envíos y lotes), no del Pelícano.
      { id: "compras.recibir", etiqueta: "Recibir mercadería", estado: "viva", ruta: "/recibir", icono: "recibir", pajaro: "05 Halcón", exige: "verDinero" },
      { id: "compras.porPagar", etiqueta: "Por pagar", estado: "viva", ruta: "/compras/por-pagar", icono: "porPagar", pajaro: "09 Pelícano", exige: "verDinero" },
      // Notas de crédito (2026-09-19): lo que el proveedor le acredita a CAYLA. Va pegada a «Por pagar» y al final: las dos
      // responden a la misma pregunta —cuánto dinero hay entre CAYLA y ese proveedor—, una de cada lado. Sin insignia a
      // propósito: el contador de «por reclamar» saldría de `notas_credito_tablero()`, y pagarlo en CADA pantalla de la app
      // por un número que ya se ve como primera cifra del módulo no vale la pena (principio 5).
      { id: "compras.notasCredito", etiqueta: "Notas de crédito", estado: "viva", ruta: "/compras/notas-credito", icono: "notasCredito", pajaro: "09 Pelícano", exige: "verDinero" },
    ],
  },

  // «Ventas» (ADR-0057): el mostrador + lo legal del cobro. El id sigue siendo «venta» (es la clave con la que la pantalla
  // recuerda qué grupo está abierto). Facturación emite documentos ante SUNAT: es del Cuervo y exige `verDinero`.
  {
    id: "venta", etiqueta: "Ventas", estado: "viva", icono: "venta", raiz: "/vender", pajaro: "07 Colibrí",
    hijos: [
      { id: "venta.puntoDeVenta", etiqueta: "Punto de Venta", estado: "viva", ruta: "/vender", icono: "vender", pajaro: "07 Colibrí" },
      { id: "venta.caja", etiqueta: "Caja", estado: "viva", ruta: "/caja", icono: "caja", pajaro: "07 Colibrí" },
      { id: "venta.cambios", etiqueta: "Cambios", estado: "viva", ruta: "/cambios", icono: "cambios", pajaro: "07 Colibrí" },
      { id: "venta.devoluciones", etiqueta: "Devoluciones", estado: "viva", ruta: "/devoluciones", icono: "devoluciones", pajaro: "07 Colibrí" },
      { id: "venta.facturacion", etiqueta: "Facturación", estado: "viva", ruta: "/vender/facturacion", icono: "facturacion", pajaro: "08 Cuervo", exige: "verDinero" },
    ],
  },

  // Inventario (ADR-0071): el mundo único del stock físico. Lo ve cualquier integrante: opera stock, recibe y cuenta.
  {
    id: "inventario", etiqueta: "Inventario", estado: "viva", icono: "inventario", raiz: "/inventario", pajaro: "05 Halcón",
    hijos: [
      { id: "inventario.existencias", etiqueta: "Existencias", estado: "viva", ruta: "/inventario", icono: "inventario", pajaro: "05 Halcón" },
      { id: "inventario.movimientos", etiqueta: "Movimientos", estado: "viva", ruta: "/inventario/movimientos", icono: "movimientos", pajaro: "05 Halcón" },
      // El único con insignia hoy: los traslados que esperan a quien mira (rediseño de Traslados, 2026-09-18).
      { id: "inventario.traslados", etiqueta: "Traslados", estado: "viva", ruta: "/inventario/traslados", icono: "traslados", contador: "trasladosPorAtender", pajaro: "05 Halcón" },
      { id: "inventario.conteo", etiqueta: "Conteo", estado: "viva", ruta: "/inventario/conteo", icono: "conteo", pajaro: "06 Lechuza" },
      // Quinta pantalla (ADR-0101): decisión a nivel sede.
      { id: "inventario.analisis", etiqueta: "Análisis", estado: "viva", ruta: "/inventario/resumen", icono: "resumen", pajaro: "13 Águila", exige: "analizar" },
      // Quien no ve Compras no tiene el grupo donde vive «Recibir mercadería»: su puerta está acá, donde vive el stock.
      { id: "inventario.recibir", etiqueta: "Recibir mercadería", estado: "viva", ruta: "/recibir", icono: "recibir", pajaro: "05 Halcón", soloSinPermiso: "verDinero" },
    ],
  },

  /* ---- Lo que viene: existe en el árbol, `menuPara` no lo emite. Sin ruta ni ícono hasta que nazca. ---- */

  {
    id: "finanzas", etiqueta: "Finanzas", estado: "futura", pajaro: "11 Garza", exige: "verDinero",
    nota: "Módulo nuevo: lo operativo (Garza) y lo contable (Urraca) en un solo lugar.",
    hijos: [
      { id: "finanzas.gastos", etiqueta: "Gastos", estado: "futura", pajaro: "11 Garza", nota: "`gastos`: hoy sin pantalla en V2." },
      { id: "finanzas.resultados", etiqueta: "Resultados", estado: "futura", pajaro: "12 Urraca", nota: "Estado de resultados." },
      { id: "finanzas.balance", etiqueta: "Balance", estado: "futura", pajaro: "12 Urraca", nota: "Balance general." },
      { id: "finanzas.cierreDeMes", etiqueta: "Cierre de mes", estado: "futura", pajaro: "12 Urraca", nota: "Cierra el período contable." },
      { id: "finanzas.activos", etiqueta: "Activos", estado: "futura", pajaro: "12 Urraca", nota: "`activos_fijos`." },
    ],
  },
  { id: "clientas", etiqueta: "Clientas", estado: "futura", pajaro: "07 Colibrí", nota: "`clientes`: la libreta de clientas." },
  {
    id: "configuracion", etiqueta: "Configuración", estado: "futura", pajaro: "01 Ganso", exige: "administrar",
    nota: "Módulo nuevo. Los nombres de las hijas son provisionales.",
    hijos: [
      { id: "configuracion.accesos", etiqueta: "Ubicaciones y accesos", estado: "futura", pajaro: "01 Ganso", nota: "`ubicaciones` y `colaboradores`." },
      { id: "configuracion.empresa", etiqueta: "Empresa y facturación", estado: "futura", pajaro: "08 Cuervo", nota: "`configuracion_empresa`, `series_comprobantes`, `ubicacion_datos_fiscales`." },
    ],
  },
  { id: "apartados", etiqueta: "Apartados", estado: "futura", pajaro: "05 Halcón", nota: "Stock apartado para una clienta." },
  { id: "comercial", etiqueta: "Comercial", estado: "futura", pajaro: "13 Águila", nota: "Inteligencia comercial: lee lo de los demás." },
];

/**
 * El panel «+ Nuevo»: registrar algo, no ir a una pantalla. Fase UI 1 (2026-09-11) lo recortó a las escrituras que V2 ya
 * tiene resueltas de punta a punta; ofrecer otra antes sería un enlace que compila y revienta. ADR-0111: UNA sola puerta
 * para recibir. ADR-0113: la misma para todos. «Registrar comprobante» es del líder: es dinero.
 */
export const ACCIONES_NUEVO: readonly Accion[] = [
  { id: "nuevo.venta", etiqueta: "Nueva venta", detalle: "Registrar la compra de una clienta", estado: "viva", ruta: "/vender", pajaro: "07 Colibrí" },
  { id: "nuevo.comprobante", etiqueta: "Registrar comprobante", detalle: "Una compra a proveedor, con su pago si es al contado", estado: "viva", ruta: "/compras/nueva", pajaro: "09 Pelícano", exige: "verDinero" },
  { id: "nuevo.recibir", etiqueta: "Recibir mercadería", detalle: "Lo que llegó, contra sus comprobantes", estado: "viva", ruta: "/recibir", pajaro: "05 Halcón" },
  { id: "nuevo.mover", etiqueta: "Mover mercadería", detalle: "Trasladar stock entre ubicaciones", estado: "viva", ruta: "/inventario/mover", pajaro: "05 Halcón" },
  { id: "nuevo.cambio", etiqueta: "Registrar cambio", detalle: "La clienta cambia una prenda por otra talla o color", estado: "viva", ruta: "/cambios", pajaro: "07 Colibrí" },
  { id: "nuevo.devolucion", etiqueta: "Registrar devolución", detalle: "Una clienta devuelve algo que compró", estado: "viva", ruta: "/devoluciones", pajaro: "07 Colibrí" },
];

/**
 * Las 5 columnas fijas de la barra del celular, por id de nodo; `null` es el hueco del «+». Punto de Venta y Caja son de uso
 * diario en el mostrador; lo demás queda a un toque del lateral. Un grupo en una columna lleva a su `raiz` y muestra la suma de
 * los números de sus hijas (igual que su cabecera cerrada en el lateral).
 */
export const COLUMNAS_MOVIL: readonly (string | null)[] = ["inicio", "venta.puntoDeVenta", null, "inventario", "venta.caja"];

/* ------------------------------------------------------------------
   Lo que sale de `menuPara`
   ------------------------------------------------------------------ */

export type ItemMenu = { id: string; etiqueta: string; href: string; icono: ClaveIcono; /** Cuántas cosas de esta fila piden acción a quien mira; ausente = sin insignia. */ contador?: number };
export type GrupoMenu = { id: string; etiqueta: string; icono: ClaveIcono; hijos: ItemMenu[] };
export type FilaMenu = ItemMenu | GrupoMenu;
export type AccionNuevo = { id: string; etiqueta: string; detalle: string; href: string };

export function esGrupoMenu(f: FilaMenu): f is GrupoMenu {
  return "hijos" in f;
}

export type PerfilDelMenu = {
  permisos: readonly Permiso[];
  ubicacionTipo: TipoUbicacion;
  /** Números que salen en las insignias; `null`/ausente/0 = sin insignia. */
  contadores?: Contadores;
};

export type Menu = {
  /** Las filas del lateral de escritorio, en orden. */
  riel: FilaMenu[];
  /** Las 5 columnas de la barra del celular; `null` es el hueco del «+». */
  movil: (ItemMenu | null)[];
  /** Las acciones del panel «+ Nuevo». */
  nuevo: AccionNuevo[];
  /**
   * El grupo que se abre al aterrizar en `pathname` (`null` si no es de ninguno). Mira TODO el árbol vivo, no solo lo que
   * este perfil ve: pararse en `/produccion/ordenes` es estar en Producción aunque a esta persona no se le pinte la fila,
   * y como aterrizar en un grupo cierra los otros, ignorarlo cambiaría lo que ve. Un mismo destino en dos grupos
   * («Recibir mercadería») se le atribuye al grupo donde a este perfil se le pinta.
   */
  grupoDe: (pathname: string) => string | null;
};

/** ¿`pathname` es esta ruta o cuelga de ella? `/` solo coincide consigo misma (si no, todo lo tendría de padre). */
export function rutaActiva(pathname: string, ruta: string): boolean {
  return ruta === "/" ? pathname === "/" : pathname === ruta || pathname.startsWith(ruta + "/");
}

function cumplePermisos(n: Comun, permisos: readonly Permiso[]): boolean {
  if (n.exige && !permisos.includes(n.exige)) return false;
  if (n.soloSinPermiso && permisos.includes(n.soloSinPermiso)) return false;
  return true;
}

function esVisible(n: Comun & { estado: string }, perfil: PerfilDelMenu): boolean {
  if (n.estado !== "viva") return false;
  if (!cumplePermisos(n, perfil.permisos)) return false;
  if (n.ubicaciones && !n.ubicaciones.includes(perfil.ubicacionTipo)) return false;
  return true;
}

/** ¿Este perfil ve el módulo de Producción? Lo lee de `ubicaciones` del nodo: la regla vive en el árbol, no en un `if`. */
export function puedeVerProduccion(perfil: { ubicacionTipo: TipoUbicacion }): boolean {
  const produccion = ARBOL.find((n) => n.id === "produccion");
  return produccion?.ubicaciones?.includes(perfil.ubicacionTipo) ?? true;
}

/** De dónde sale el menú. Es el de hoy salvo en las pruebas, que le pasan árboles a propósito para probar las reglas sueltas. */
export type FuenteMenu = { arbol: readonly Nodo[]; acciones: readonly Accion[]; columnas: readonly (string | null)[] };
export const MENU_DE_HOY: FuenteMenu = { arbol: ARBOL, acciones: ACCIONES_NUEVO, columnas: COLUMNAS_MOVIL };

export function menuPara(perfil: PerfilDelMenu, { arbol, acciones, columnas }: FuenteMenu = MENU_DE_HOY): Menu {
  // Sin número (0, null, ausente) no hay insignia.
  const contadorDe = (clave?: ClaveContador): number | undefined => {
    const n = clave ? perfil.contadores?.[clave] : undefined;
    return n && n > 0 ? n : undefined;
  };
  const aItem = (h: Hoja): ItemMenu => {
    const contador = contadorDe(h.contador);
    return { id: h.id, etiqueta: h.etiqueta, href: h.ruta, icono: h.icono, ...(contador !== undefined ? { contador } : {}) };
  };

  // ---- riel de escritorio ----
  const riel: FilaMenu[] = [];
  const emitidos = new Map<string, FilaMenu>();
  for (const n of arbol) {
    if (!esVisible(n, perfil)) continue;
    if (esGrupo(n)) {
      const hijos = n.hijos.filter((h): h is Hoja => esVisible(h, perfil)).map(aItem);
      // Un grupo sin hijas no agrupa nada; con una sola, se muestra como fila suelta (con el nombre del grupo).
      if (hijos.length === 0) continue;
      const fila: FilaMenu = hijos.length === 1 ? { ...hijos[0], id: n.id, etiqueta: n.etiqueta } : { id: n.id, etiqueta: n.etiqueta, icono: n.icono, hijos };
      riel.push(fila);
      emitidos.set(n.id, fila);
    } else if (n.estado === "viva" && "ruta" in n) {
      const fila = aItem(n);
      riel.push(fila);
      emitidos.set(n.id, fila);
    }
  }

  // ---- barra del celular ----
  const movil: (ItemMenu | null)[] = [];
  for (const id of columnas) {
    if (id === null) {
      movil.push(null);
      continue;
    }
    const fila = emitidos.get(id) ?? riel.flatMap((f) => (esGrupoMenu(f) ? f.hijos : [])).find((h) => h.id === id);
    if (!fila) continue;
    if (!esGrupoMenu(fila)) {
      movil.push(fila);
      continue;
    }
    // Una cabecera en la barra lleva a la puerta de su módulo y suma los números de sus hijas.
    const nodo = arbol.find((n) => n.id === id);
    if (!nodo || !esGrupo(nodo)) continue;
    const suma = fila.hijos.reduce((acc, h) => acc + (h.contador ?? 0), 0);
    movil.push({ id, etiqueta: fila.etiqueta, href: nodo.raiz, icono: fila.icono, ...(suma > 0 ? { contador: suma } : {}) });
  }

  // ---- «+ Nuevo» ----
  const nuevo = acciones.filter((a) => esVisible(a, perfil)).map((a) => ({ id: a.id, etiqueta: a.etiqueta, detalle: a.detalle, href: a.ruta }));

  // ---- qué grupo contiene cada ruta ----
  // La puerta del módulo (`raiz`) cubre todo lo que cuelga de ella; las hijas aportan lo que vive fuera de ese prefijo
  // (Caja, Cambios y Devoluciones cuelgan de otras rutas que `/vender`; `/recibir`, de ninguna). Una hija que este perfil
  // no tiene por permiso no aporta su ruta: así «Recibir mercadería» cuenta para UN solo grupo por perfil.
  const rutasPorGrupo: [string, string[]][] = [];
  for (const n of arbol) {
    if (!esGrupo(n)) continue;
    const propias = n.hijos.filter((h): h is Hoja => h.estado === "viva" && cumplePermisos(h, perfil.permisos)).map((h) => h.ruta);
    rutasPorGrupo.push([n.id, [n.raiz, ...propias]]);
  }
  const grupoDe = (pathname: string): string | null => rutasPorGrupo.find(([, rutas]) => rutas.some((r) => rutaActiva(pathname, r)))?.[0] ?? null;

  return { riel, movil, nuevo, grupoDe };
}
