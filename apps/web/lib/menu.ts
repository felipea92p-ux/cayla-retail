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

import type { ClaveModulo } from "./modulos";

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
 *  - verDinero:   el dinero del TALLER (proveedores, comprobantes y deuda de Producción) y el Resumen de Producción, que
 *                 mezcla ventas de la red y dinero. Solo el líder (no sale de ningún módulo delegable).
 * Y los poderes que una cuenta recibe sin ser líder porque su ROL ve el módulo (ADR-0161 B2, `permisosDeModulos` en
 * `lib/modulos.ts`). Cada uno espeja una capacidad de la base (`fn_puede_*()` = «líder O su rol ve el módulo»), así que la
 * pantalla y el candado dicen lo mismo:
 *  - facturar:               Facturación (emitir y ver comprobantes). Las anulaciones siguen siendo del líder.
 *  - gestionarCaja:          cerrar caja y mover caja                          (fn_puede_gestionar_caja)
 *  - ajustarInventario:      ajustar stock, cerrar conteo, cerrar traslado con diferencia (fn_puede_ajustar_inventario)
 *  - editarCatalogo:         escribir en el Catálogo                            (fn_puede_editar_catalogo)
 *  - editarCuentasProveedor: cuentas bancarias de proveedores                   (fn_puede_editar_cuentas_proveedor)
 *  - verDineroCompras:       los montos y el registro de Compras (Facturas de compra, Por pagar, Notas de crédito;
 *                            fn_puede_ver_dinero_de_compras / fn_puede_registrar_compras, 20260923130000). Hasta el
 *                            2026-09-22 era `verDinero` y solo del líder (ADR-0126).
 *  - editarEtiquetas:        crear, editar y archivar etiquetas SIN descuento  (fn_puede_editar_etiquetas)
 *  - analizar:               Análisis de inventario de su sede                  (fn_puede_analizar)
 */
export const PERMISOS = [
  "administrar", "verDinero", "analizar",
  "facturar", "gestionarCaja", "ajustarInventario", "editarCatalogo", "editarCuentasProveedor",
  "verDineroCompras", "editarEtiquetas",
] as const;
export type Permiso = (typeof PERMISOS)[number];

export type RolMenu = "lider" | "integrante";

/**
 * La regla FIJA de antes de los roles: el líder tiene todos los permisos y cualquier otra cuenta ninguno. Solo se usa si la
 * base todavía no tiene `fn_mis_modulos()` (web publicada antes de la migración de roles) y en las pruebas de la
 * fotografía; lo normal es `permisosDeModulos` (lo que ve el ROL). Ningún nodo del árbol pregunta por el rol: pregunta por
 * un permiso.
 *
 * Ya no hay «tipo de terminal» (20260923040000, Felipe 2026-09-22): lo que ve y hace una terminal lo decide su rol, igual
 * que a una persona.
 */
export function permisosDe(rol: RolMenu): readonly Permiso[] {
  return rol === "lider" ? PERMISOS : [];
}

/**
 * ¿Una TERMINAL ve «Inicio»? Solo si no ve el Punto de venta: la terminal del mostrador aterriza en `/vender` (pedido de
 * Felipe, 2026-09-21) y su casa es el mostrador; una terminal que no vende (inventario, almacén) sí tiene su Inicio.
 * Es la única regla de terminal que no sale directo de un módulo, porque Inicio no es de ningún módulo.
 */
export function terminalVeInicio(modulos: readonly ClaveModulo[]): boolean {
  return !modulos.includes("vender");
}

/** A dónde va una cuenta al abrir `/`: una terminal que ve el Punto de venta, a `/vender`; cualquier otra, a su Inicio. */
export function aterrizajeDe(perfil: { terminal?: boolean; modulos?: readonly ClaveModulo[] | null }): string {
  return perfil.terminal && !terminalVeInicio(perfil.modulos ?? []) ? "/vender" : "/";
}

/** Claves de los íconos. Los trazos viven en `AppShell.tsx` (`IC`); acá solo se nombra cuál lleva cada nodo. */
export type ClaveIcono =
  | "inicio" | "vender" | "apartados" | "caja" | "historial" | "productos" | "inventario" | "movimientos" | "traslados" | "conteo" | "resumen"
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
  /**
   * El módulo del rol (ADR-0161 B2, `lib/modulos.ts`) al que pertenece esta pantalla o acción. Cuando el perfil trae sus
   * `modulos` (leídos de `fn_mis_modulos()`), la fila sale solo si la cuenta ve ese módulo. Una TERMINAL siempre se mira
   * así (sin módulos, no ve nada: falla cerrado). Los grupos no lo declaran: salen si les queda alguna hija. Una hoja SIN
   * módulo (Inicio) no es de ningún rol: la ven las personas, y las terminales según `terminalVeInicio`.
   */
  modulo?: ClaveModulo;
  /** Otro módulo que TAMBIÉN abre esta fila (ADR-0161, 20260923130000). Existe por UN caso: las etiquetas viven como
   *  pestaña de «Atributos», así que un rol que ve Etiquetas sin ver Categorías/atributos entra por la misma fila (y la
   *  pantalla le muestra solo esa pestaña). */
  moduloAlterno?: ClaveModulo;
};

/** Una pantalla. */
export type Hoja = Comun & { estado: "viva"; ruta: string; icono: ClaveIcono; contador?: ClaveContador };

/** Una cabecera que agrupa pantallas y no navega (en el celular, su `raiz` es a donde lleva). Una hija puede ser, a su
 *  vez, OTRO grupo (D-84, ADR-0155): un subgrupo dentro de un grupo, para cuando un módulo junta demasiadas pantallas
 *  de un mismo tema (Producción → Abastecimiento) y separarlas en su propio módulo de primer nivel no tiene sentido
 *  (comparten pájaro, ubicación y el prefijo de ruta). `menuPara` lo arma con la misma recursión que arma el resto:
 *  no hay un caso especial de "grupo de segundo nivel" en el código, solo un nodo que vuelve a ser un nodo. */
export type Grupo = Comun & {
  estado: "viva";
  icono: ClaveIcono;
  /** La puerta del módulo: todo lo que cuelga de esta ruta es de este grupo (decide qué grupo se abre al aterrizar). */
  raiz: string;
  hijos: readonly (Hoja | Grupo | Futura)[];
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
   El orden es el del menú: Inicio, Catálogo, Producción, Compras, Ventas, Inventario (Felipe, 2026-09-16).
   ------------------------------------------------------------------ */

export const ARBOL: readonly Nodo[] = [
  // Inicio y Análisis no son dueños de tablas: leen lo de otros. Águila es «Inteligencia y reportes» (lee lo de los demás).
  { id: "inicio", etiqueta: "Inicio", estado: "viva", ruta: "/", icono: "inicio", pajaro: "13 Águila" },

  // «Colaboradores» (a quién de Dynamic le doy entrada a retail) NO va en el menú lateral: se entra desde el perfil del
  // líder (`PerfilModal.tsx`), y adentro viven sus pestañas Terminales y Roles y accesos. Main lo había devuelto al
  // menú el 2026-09-22; Felipe pidió ese mismo día dejarlo en el perfil (se corrige en main después). La ruta
  // `/colaboradores` sigue exigiendo el permiso en la página y en la RPC.

  // Catálogo (2026-09-16/17): qué ES una prenda y el vocabulario del que cuelga. Colores, tallas, tejidos, patrones y
  // etiquetas viven como pestañas de «Atributos».
  {
    id: "catalogo", etiqueta: "Catálogo", estado: "viva", icono: "catalogo", raiz: "/productos", pajaro: "02 Loro",
    hijos: [
      { id: "catalogo.productos", modulo: "productos", etiqueta: "Productos", estado: "viva", ruta: "/productos", icono: "productos", pajaro: "02 Loro" },
      { id: "catalogo.categorias", modulo: "atributos", etiqueta: "Categorías", estado: "viva", ruta: "/productos/categorias", icono: "categorias", pajaro: "02 Loro" },
      { id: "catalogo.atributos", modulo: "atributos", moduloAlterno: "etiquetas", etiqueta: "Atributos", estado: "viva", ruta: "/productos/atributos", icono: "atributos", pajaro: "02 Loro" },
    ],
  },

  // Producción (ADR-0133): el módulo de fabricar. Solo se ve PARADO EN UN TALLER, líder incluido (Felipe, 2026-09-20):
  // se decide por el TIPO de la ubicación activa, no por su nombre — un segundo Taller entraría solo. Es visibilidad; la
  // base sigue dejando al líder operar el Taller desde cualquier sede (`fn_puede_operar_ubicacion`).
  //
  // REGRUPADO (D-84, ADR-0155, 2026-09-21): quien ve el dinero y analiza (el líder) llegó a contar 7 hijas acá (Resumen,
  // Órdenes, Insumos, Proveedores, Comprobantes, Recibir, Por pagar) — por encima del tope de 6 por grupo, deuda declarada
  // desde que «Resumen» entró (F6, #231). Las cuatro de dinero/abastecimiento bajan un nivel, a `produccion.abastecimiento`
  // (mismo patrón que ya usa «Compras»: una cabecera que agrupa, no una pantalla propia). Producción vuelve a 4 hijas de
  // primer nivel, con sitio de sobra para cuando `produccion.eficiencia` (F7) esté lista.
  {
    id: "produccion", etiqueta: "Producción", estado: "viva", icono: "produccion", raiz: "/produccion", pajaro: "10 Gallito", ubicaciones: ["taller"],
    hijos: [
      // Resumen (F6, #231): «¿qué necesita mi decisión hoy?». Es la página raíz del módulo (`/produccion`), una lectura de
      // decisión que mezcla ventas de la red y dinero: solo el líder (`verDinero`; hasta el 2026-09-22 era `analizar`, que
      // desde entonces sale del módulo Análisis y no abre nada del Taller); quien trabaja en el Taller va directo a Órdenes.
      // Va PRIMERA. Su ruta es la `raiz` del grupo: el riel resuelve la fila activa por coincidencia exacta y luego por el
      // prefijo más largo, así que en `/produccion/ordenes` sigue marcando Órdenes y no Resumen.
      { id: "produccion.resumenProduccion", modulo: "produccion", etiqueta: "Resumen", estado: "viva", ruta: "/produccion", icono: "resumen", pajaro: "10 Gallito", exige: "verDinero" },
      { id: "produccion.ordenes", modulo: "produccion", etiqueta: "Órdenes", estado: "viva", ruta: "/produccion/ordenes", icono: "produccion", pajaro: "10 Gallito" },
      { id: "produccion.insumos", modulo: "produccion", etiqueta: "Insumos", estado: "viva", ruta: "/produccion/insumos", icono: "insumos", pajaro: "10 Gallito" },
      // Abastecimiento del Taller (F4a a F4d, ADR-0133): proveedores, comprobantes, recepción y deuda de tela y avíos, APARTE de
      // los de Compras (D-H). SUBGRUPO (D-84): antes eran 4 hijas sueltas de Producción; ahora cuelgan de esta cabecera, igual
      // que «Compras» agrupa a las suyas — el mismo trazo (`icono: "compras"`) a propósito, es el mismo concepto (abastecerse
      // de un proveedor) aplicado al Taller en vez de a la tienda. `raiz` reutiliza la ruta de su primera hija (Proveedores):
      // el subgrupo no tiene pantalla propia, así como la `raiz` de Producción reutiliza la de Resumen y la de Catálogo la de
      // Productos. Proveedores, Comprobantes y Por pagar solo para quien ve el dinero (D-G): llevan datos bancarios de terceros
      // y montos comprados. Recibir NO exige dinero: lo usa también quien trabaja en el Taller — por eso, para quien no ve el
      // dinero, `menuPara` deshace el subgrupo solo (le queda una única hija visible, «Recibir») y sube esa hija con SU propio
      // nombre, no con «Abastecimiento»: el subgrupo es una etiqueta de organización para quien ve varias pantallas, no una que
      // valga la pena imponerle a quien solo necesita recibir tela. El id de cada hija termina en «Produccion» a propósito: es
      // la clave que `produccion-menu.ts` ya expone (`ClaveMenuProduccion`) y no debe chocar con las de Compras. El pájaro es
      // Gallito: `aviario.mjs` le da `proveedores_produccion` y `comprobantes_produccion` (y Recibir escribe `insumo_lotes`,
      // también suyo). Orden como en Compras: proveedor → comprobante → recibir → pago.
      {
        id: "produccion.abastecimiento", etiqueta: "Abastecimiento", estado: "viva", icono: "compras", raiz: "/produccion/proveedores", pajaro: "10 Gallito",
        hijos: [
          { id: "produccion.proveedoresProduccion", modulo: "produccion", etiqueta: "Proveedores", estado: "viva", ruta: "/produccion/proveedores", icono: "proveedores", pajaro: "10 Gallito", exige: "verDinero" },
          { id: "produccion.comprobantesProduccion", modulo: "produccion", etiqueta: "Comprobantes", estado: "viva", ruta: "/produccion/comprobantes", icono: "facturas", pajaro: "10 Gallito", exige: "verDinero" },
          // OJO, no es «Recibir mercadería»: aquel (`/recibir`, de Compras e Inventario) recibe prendas contra un envío; este
          // recibe tela y avíos contra un comprobante de Producción. Dos pantallas de dos módulos, una etiqueta parecida.
          { id: "produccion.recibirProduccion", modulo: "produccion", etiqueta: "Recibir", estado: "viva", ruta: "/produccion/recibir", icono: "recibir", pajaro: "10 Gallito" },
          { id: "produccion.porPagarProduccion", modulo: "produccion", etiqueta: "Por pagar", estado: "viva", ruta: "/produccion/por-pagar", icono: "porPagar", pajaro: "10 Gallito", exige: "verDinero" },
        ],
      },
      // F7 (2026-09-22) ya existe: `/produccion/eficiencia`. NO es una fila del lateral a propósito: vive como PESTAÑA del
      // Resumen («Hoy | Eficiencia»), que es su puerta. Con el regrupo de arriba, sumarla como quinta hija cuando nazca
      // sigue dejando a Producción dentro del tope de 6 (D-84 lo dejó con sitio de sobra a propósito).
      { id: "produccion.eficiencia", etiqueta: "Eficiencia", estado: "futura", pajaro: "10 Gallito", nota: "Existe como pestaña del Resumen: /produccion/eficiencia (F7). No es fila del lateral." },
    ],
  },

  // Compras (ADR-0126): dinero de proveedores. Cada puerta exige `verDineroCompras` (quien ve Facturas de compra, Por pagar
  // o Notas de crédito, 20260923130000) Y su propio módulo; el grupo sale solo cuando no queda ninguna.
  // Es el módulo de comprar para las TIENDAS: parado en el Taller no se muestra, ni al líder (Felipe, 2026-09-21), del mismo
  // modo que Producción no se muestra en una tienda: en cada ubicación el líder ve UNO de los dos. Solo visibilidad: las
  // URLs de Compras siguen abriendo (otras pantallas enlazan a ellas) y el candado real es el de cada RPC. Consecuencia
  // conocida: «Recibir mercadería» vivía acá para el líder, así que parado en el Taller solo le queda en «+ Nuevo».
  // Mismo orden que ya tenía: proveedor → factura → recepción → pago → notas de crédito.
  {
    id: "compras", etiqueta: "Compras", estado: "viva", icono: "compras", raiz: "/compras", pajaro: "09 Pelícano", ubicaciones: ["tienda", "almacen"],
    hijos: [
      { id: "compras.proveedores", modulo: "proveedores", etiqueta: "Proveedores", estado: "viva", ruta: "/compras/proveedores", icono: "proveedores", pajaro: "09 Pelícano", exige: "verDineroCompras" },
      { id: "compras.comprobantes", modulo: "facturas_compra", etiqueta: "Comprobantes", estado: "viva", ruta: "/compras", icono: "facturas", pajaro: "09 Pelícano", exige: "verDineroCompras" },
      // ADR-0111/0113: recibir es una sola puerta (`/recibir`). El dato es del Halcón (envíos y lotes), no del Pelícano.
      { id: "compras.recibir", modulo: "recibir", etiqueta: "Recibir mercadería", estado: "viva", ruta: "/recibir", icono: "recibir", pajaro: "05 Halcón", exige: "verDineroCompras" },
      { id: "compras.porPagar", modulo: "por_pagar", etiqueta: "Por pagar", estado: "viva", ruta: "/compras/por-pagar", icono: "porPagar", pajaro: "09 Pelícano", exige: "verDineroCompras" },
      // Notas de crédito (2026-09-19): lo que el proveedor le acredita a CAYLA. Va pegada a «Por pagar» y al final: las dos
      // responden a la misma pregunta —cuánto dinero hay entre CAYLA y ese proveedor—, una de cada lado. Sin insignia a
      // propósito: el contador de «por reclamar» saldría de `notas_credito_tablero()`, y pagarlo en CADA pantalla de la app
      // por un número que ya se ve como primera cifra del módulo no vale la pena (principio 5).
      { id: "compras.notasCredito", modulo: "notas_credito", etiqueta: "Notas de crédito", estado: "viva", ruta: "/compras/notas-credito", icono: "notasCredito", pajaro: "09 Pelícano", exige: "verDineroCompras" },
    ],
  },

  // «Ventas» (ADR-0057): el mostrador + lo legal del cobro. El id sigue siendo «venta» (es la clave con la que la pantalla
  // recuerda qué grupo está abierto). Facturación emite documentos ante SUNAT: es del Cuervo y exige `verDinero`.
  {
    id: "venta", etiqueta: "Ventas", estado: "viva", icono: "venta", raiz: "/vender", pajaro: "07 Colibrí",
    hijos: [
      { id: "venta.puntoDeVenta", modulo: "vender", etiqueta: "Punto de Venta", estado: "viva", ruta: "/vender", icono: "vender", pajaro: "07 Colibrí" },
      // Apartados (ADR-0166): la clienta aparta con un adelanto y recoge pagando el saldo. Junto al Punto de venta: es la
      // misma caja — por eso en los roles cuelga del módulo «Punto de venta».
      { id: "venta.apartados", modulo: "vender", etiqueta: "Apartados", estado: "viva", ruta: "/vender/apartados", icono: "apartados", pajaro: "07 Colibrí" },
      { id: "venta.caja", modulo: "caja", etiqueta: "Caja", estado: "viva", ruta: "/caja", icono: "caja", pajaro: "07 Colibrí" },
      // Historial de ventas (ADR-0147): el libro de todas las ventas; se lee tras cobrar y cuadrar y de ahí se pasa a corregir.
      { id: "venta.historial", modulo: "historial", etiqueta: "Historial", estado: "viva", ruta: "/vender/historial", icono: "historial", pajaro: "07 Colibrí" },
      // Posventa (D-84, ADR-0166): al entrar Apartados, Ventas pasaba el tope de 6 hijas. Cambios y Devoluciones son lo que pasa
      // DESPUÉS de una venta y se usan mucho menos que el mostrador y la caja: se agrupan en vez de subir el tope (ADR-0144).
      // `raiz` reutiliza la de su primera hija, como Abastecimiento.
      {
        id: "venta.posventa", etiqueta: "Posventa", estado: "viva", icono: "cambios", raiz: "/cambios", pajaro: "07 Colibrí",
        hijos: [
          { id: "venta.cambios", modulo: "cambios", etiqueta: "Cambios", estado: "viva", ruta: "/cambios", icono: "cambios", pajaro: "07 Colibrí" },
          { id: "venta.devoluciones", modulo: "devoluciones", etiqueta: "Devoluciones", estado: "viva", ruta: "/devoluciones", icono: "devoluciones", pajaro: "07 Colibrí" },
        ],
      },
      { id: "venta.facturacion", modulo: "facturacion", etiqueta: "Comprobantes", estado: "viva", ruta: "/vender/comprobantes", icono: "facturacion", pajaro: "08 Cuervo", exige: "facturar" },
    ],
  },

  // Inventario (ADR-0071): el mundo único del stock físico. Lo ve cualquier integrante: opera stock, recibe y cuenta.
  {
    id: "inventario", etiqueta: "Inventario", estado: "viva", icono: "inventario", raiz: "/inventario", pajaro: "05 Halcón",
    hijos: [
      { id: "inventario.existencias", modulo: "existencias", etiqueta: "Existencias", estado: "viva", ruta: "/inventario", icono: "inventario", pajaro: "05 Halcón" },
      { id: "inventario.movimientos", modulo: "movimientos", etiqueta: "Movimientos", estado: "viva", ruta: "/inventario/movimientos", icono: "movimientos", pajaro: "05 Halcón" },
      // El único con insignia hoy: los traslados que esperan a quien mira (rediseño de Traslados, 2026-09-18).
      { id: "inventario.traslados", modulo: "traslados", etiqueta: "Traslados", estado: "viva", ruta: "/inventario/traslados", icono: "traslados", contador: "trasladosPorAtender", pajaro: "05 Halcón" },
      { id: "inventario.conteo", modulo: "conteos", etiqueta: "Conteo", estado: "viva", ruta: "/inventario/conteo", icono: "conteo", pajaro: "06 Lechuza" },
      // Quinta pantalla (ADR-0101): decisión a nivel sede.
      { id: "inventario.analisis", modulo: "analisis", etiqueta: "Análisis", estado: "viva", ruta: "/inventario/resumen", icono: "resumen", pajaro: "13 Águila", exige: "analizar" },
      // Quien no ve Compras no tiene el grupo donde vive «Recibir mercadería»: su puerta está acá, donde vive el stock.
      { id: "inventario.recibir", modulo: "recibir", etiqueta: "Recibir mercadería", estado: "viva", ruta: "/recibir", icono: "recibir", pajaro: "05 Halcón", soloSinPermiso: "verDineroCompras" },
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
  { id: "nuevo.venta", modulo: "vender", etiqueta: "Nueva venta", detalle: "Registrar la compra de una clienta", estado: "viva", ruta: "/vender", pajaro: "07 Colibrí" },
  { id: "nuevo.comprobante", modulo: "facturas_compra", etiqueta: "Registrar comprobante", detalle: "Una compra a proveedor, con su pago si es al contado", estado: "viva", ruta: "/compras/nueva", pajaro: "09 Pelícano", exige: "verDineroCompras" },
  { id: "nuevo.recibir", modulo: "recibir", etiqueta: "Recibir mercadería", detalle: "Lo que llegó, contra sus comprobantes", estado: "viva", ruta: "/recibir", pajaro: "05 Halcón" },
  { id: "nuevo.mover", modulo: "traslados", etiqueta: "Mover mercadería", detalle: "Trasladar stock entre ubicaciones", estado: "viva", ruta: "/inventario/mover", pajaro: "05 Halcón" },
  { id: "nuevo.cambio", modulo: "cambios", etiqueta: "Registrar cambio", detalle: "La clienta cambia una prenda por otra talla o color", estado: "viva", ruta: "/cambios", pajaro: "07 Colibrí" },
  { id: "nuevo.devolucion", modulo: "devoluciones", etiqueta: "Registrar devolución", detalle: "Una clienta devuelve algo que compró", estado: "viva", ruta: "/devoluciones", pajaro: "07 Colibrí" },
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
/** Una hija puede volver a ser un `GrupoMenu` (subgrupo, D-84): el tipo es recursivo porque el árbol lo es. */
export type GrupoMenu = { id: string; etiqueta: string; icono: ClaveIcono; hijos: FilaMenu[] };
export type FilaMenu = ItemMenu | GrupoMenu;
export type AccionNuevo = { id: string; etiqueta: string; detalle: string; href: string };

export function esGrupoMenu(f: FilaMenu): f is GrupoMenu {
  return "hijos" in f;
}

/** Todas las hojas que cuelgan de una fila YA CONSTRUIDA (`riel`/`movil`), sin importar cuántos subgrupos haya en el
 *  medio (D-84): la usan `menuPara` (para sumar los números de la barra del celular) y `menu.test.ts` (para que un
 *  invariante siga valiendo aunque una pantalla se mude un nivel más abajo, sin tener que saber a qué profundidad vive). */
export function hojasDe(f: FilaMenu): ItemMenu[] {
  return esGrupoMenu(f) ? f.hijos.flatMap(hojasDe) : [f];
}

export type PerfilDelMenu = {
  permisos: readonly Permiso[];
  ubicacionTipo: TipoUbicacion;
  /** ¿Quien mira es una cuenta TERMINAL (un aparato, ADR-0162)? Ausente o `false` = una persona. Lo que ve una terminal
   *  sale SIEMPRE de sus `modulos` (su rol), nunca de un tipo. */
  terminal?: boolean;
  /** Los módulos que ve la cuenta (su rol, `fn_mis_modulos()`). Ausente en una PERSONA = la regla fija de antes, que es la
   *  que prueban la fotografía y los invariantes; `menu.test.ts` exige que los módulos de hoy den el mismo menú. Ausente en
   *  una TERMINAL = ningún módulo. */
  modulos?: readonly ClaveModulo[] | null;
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
  // Una terminal se mira SIEMPRE por sus módulos (sin ellos, ninguno: falla cerrado). Una persona, solo si los trae.
  const modulos = perfil.terminal ? (perfil.modulos ?? []) : perfil.modulos;
  if (modulos) {
    // Por rol (ADR-0161): la hoja sale si la cuenta ve su módulo; un grupo, si le queda alguna hija (lo resuelve
    // `construirFila`). Una hoja sin módulo (Inicio): las personas siempre, las terminales según `terminalVeInicio`.
    if (n.modulo) return modulos.includes(n.modulo) || (!!n.moduloAlterno && modulos.includes(n.moduloAlterno));
    if (esHojaOAccion(n) && perfil.terminal) return terminalVeInicio(modulos);
  }
  return true;
}

function esHojaOAccion(n: object): boolean {
  return !("hijos" in n);
}

/** Todas las rutas que cuelgan de `n` para este perfil: la propia si es una hoja, o `raiz` + las de sus hijos (recursivo:
 *  un hijo puede ser, a su vez, un subgrupo) si es un grupo. Filtra solo por PERMISO, no por ubicación — igual que hacía
 *  el código antes de D-84: hoy ningún hijo declara una `ubicaciones` propia distinta de la de su grupo. La usa `grupoDe`
 *  para saber, de TODO el árbol vivo, qué módulo de primer nivel contiene una ruta (se mira aunque el perfil no la vea). */
function rutasDe(n: Hoja | Grupo | Futura, permisos: readonly Permiso[]): string[] {
  if (n.estado !== "viva") return [];
  if (esGrupo(n)) return [n.raiz, ...n.hijos.filter((h) => cumplePermisos(h, permisos)).flatMap((h) => rutasDe(h, permisos))];
  return [n.ruta];
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

  // Arma la fila de `n` para este perfil, o `undefined` si no le toca ninguna — MISMA función para un nodo de primer
  // nivel que para un subgrupo (D-84): un grupo con hijos que a su vez son grupos no es un caso especial, es la misma
  // regla llamándose de nuevo. `esRaiz` decide qué pasa si el grupo termina con una sola hija visible: la raíz absorbe
  // el nombre del grupo (así ya se comportaba «Compras» o «Catálogo»: el módulo necesita una etiqueta estable aunque
  // adentro solo quede una pantalla) — un SUBGRUPO no: su hija sube con su propio nombre, sin pasar por el del subgrupo,
  // porque ese nombre («Abastecimiento») es solo una etiqueta de organización para quien ve varias pantallas ahí, no una
  // que valga la pena imponerle a quien ve una sola (quien no ve dinero en el Taller solo tiene «Recibir»: debe seguir
  // leyendo «Recibir», no «Abastecimiento» — es exactamente lo que veía antes de D-84, sin el subgrupo de por medio).
  const construirFila = (n: Nodo, esRaiz: boolean): FilaMenu | undefined => {
    if (!esVisible(n, perfil) || n.estado !== "viva") return undefined; // el 2do checkeo es solo para que TS estreche Nodo a Hoja | Grupo.
    if (!esGrupo(n)) return aItem(n);
    const hijos = n.hijos.map((h) => construirFila(h, false)).filter((f): f is FilaMenu => f !== undefined);
    // Un grupo sin hijas visibles no agrupa nada; con una sola, se disuelve: sube esa hija (ver la nota de arriba).
    if (hijos.length === 0) return undefined;
    if (hijos.length === 1) return esRaiz ? { ...hijos[0], id: n.id, etiqueta: n.etiqueta } : hijos[0];
    return { id: n.id, etiqueta: n.etiqueta, icono: n.icono, hijos };
  };

  // ---- riel de escritorio ----
  const riel: FilaMenu[] = [];
  const emitidos = new Map<string, FilaMenu>();
  for (const n of arbol) {
    const fila = construirFila(n, true);
    if (!fila) continue;
    riel.push(fila);
    emitidos.set(n.id, fila);
  }

  // ---- barra del celular ----
  const movil: (ItemMenu | null)[] = [];
  for (const id of columnas) {
    if (id === null) {
      movil.push(null);
      continue;
    }
    const fila = emitidos.get(id) ?? riel.flatMap(hojasDe).find((h) => h.id === id);
    if (!fila) continue;
    if (!esGrupoMenu(fila)) {
      movil.push(fila);
      continue;
    }
    // Una cabecera en la barra lleva a la puerta de su módulo y suma los números de TODAS sus hojas (los de un subgrupo
    // incluidos: la columna representa al módulo entero, no a un nivel del árbol).
    const nodo = arbol.find((n) => n.id === id);
    if (!nodo || !esGrupo(nodo)) continue;
    const suma = hojasDe(fila).reduce((acc, h) => acc + (h.contador ?? 0), 0);
    movil.push({ id, etiqueta: fila.etiqueta, href: nodo.raiz, icono: fila.icono, ...(suma > 0 ? { contador: suma } : {}) });
  }

  // ---- «+ Nuevo» ----
  const nuevo = acciones.filter((a) => esVisible(a, perfil)).map((a) => ({ id: a.id, etiqueta: a.etiqueta, detalle: a.detalle, href: a.ruta }));

  // ---- qué grupo contiene cada ruta ----
  // La puerta del módulo (`raiz`) cubre todo lo que cuelga de ella; las hijas aportan lo que vive fuera de ese prefijo
  // (Caja, Cambios y Devoluciones cuelgan de otras rutas que `/vender`; `/recibir`, de ninguna) — un subgrupo aporta,
  // recursivamente, las suyas (`rutasDe`). Una hija que este perfil no tiene por permiso no aporta su ruta: así «Recibir
  // mercadería» cuenta para UN solo grupo por perfil. Solo se mira el primer nivel del árbol: aterrizar en cualquier
  // ruta de un subgrupo sigue abriendo el MÓDULO que lo contiene (Producción), no el subgrupo (Abastecimiento) — es la
  // cabecera de primer nivel la que cierra a las demás al aterrizar, igual que hoy.
  const rutasPorGrupo: [string, string[]][] = [];
  for (const n of arbol) {
    if (!esGrupo(n)) continue;
    rutasPorGrupo.push([n.id, rutasDe(n, perfil.permisos)]);
  }
  const grupoDe = (pathname: string): string | null => rutasPorGrupo.find(([, rutas]) => rutas.some((r) => rutaActiva(pathname, r)))?.[0] ?? null;

  return { riel, movil, nuevo, grupoDe };
}
