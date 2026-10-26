// El menú de CAYLA como DATOS: un solo árbol, una sola función pura que dice qué ve cada perfil.
//
// PROMETE: dado un perfil (qué permisos tiene y en qué tipo de ubicación está parado) `menuPara` devuelve las filas del
// lateral de escritorio, las 4 columnas de la barra del celular y el módulo que se abre al aterrizar en una ruta. Sin
// React, sin Supabase, sin efectos: se prueba con `menu.test.ts` sin abrir un navegador.
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
import type { Vista } from "./vista-global";

/* ------------------------------------------------------------------
   Vocabulario del árbol
   ------------------------------------------------------------------ */

/** Tipo de la ubicación en la que está parado quien mira (`personas.ubicacionTipo`). */
export type TipoUbicacion = "tienda" | "almacen" | "taller";
/** @internal Todos los tipos de ubicación, para que las pruebas del menú y de los módulos recorran cada uno. */
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
 *  - ajustarInventario:      cerrar conteo, cerrar traslado con diferencia       (fn_puede_ajustar_inventario). Hasta el
 *                            2026-09-27 también abría el botón «Ajustar»: ADR-0250 lo separó en `ajustarStock` porque
 *                            Existencias/Conteos/Traslados no es «el líder decidió dar el módulo de ajustar».
 *  - ajustarStock:           el botón «Ajustar» de Existencias, Productos y Movimientos (fn_puede_ajustar_stock,
 *                            ADR-0306): lo mismo que ajustarInventario; ajustar es una función de Existencias, no un módulo.
 *  - editarCatalogo:         escribir en el Catálogo                            (fn_puede_editar_catalogo)
 *  - editarCuentasProveedor: cuentas bancarias de proveedores                   (fn_puede_editar_cuentas_proveedor)
 *  - verDineroCompras:       los montos y el registro de Compras (Facturas de compra, Por pagar, Notas de crédito;
 *                            fn_puede_ver_dinero_de_compras / fn_puede_registrar_compras, 20260923130000). Hasta el
 *                            2026-09-22 era `verDinero` y solo del líder (ADR-0126).
 *  - editarEtiquetas:        crear, editar y archivar etiquetas, con o sin descuento (fn_puede_editar_etiquetas, ADR-0293)
 *  - analizar:               Análisis de inventario de su sede                  (fn_puede_analizar)
 *  - registrarGastos:        ver y registrar los gastos de SU tienda (Finanzas ▸ Gastos, ADR-0195 F2; fn_gastos_ubicaciones)
 *  - verCuentasDinero:       Finanzas ▸ Cuentas y dinero de SU tienda (ADR-0195 F3/F4)
 *  - verReportesFinancieros: Finanzas ▸ Resumen y Reportes de SU tienda (ADR-0195 F5/F6/F7/F10)
 *  - verImpuestos:           Finanzas ▸ Impuestos de CAYLA entera (ADR-0195 F8; delegable desde el ADR-0253, fn_puede_ver_impuestos)
 *  - cerrarMes:              Finanzas ▸ Cierre de mes: cerrar y reabrir (ADR-0195 F9; delegable desde el ADR-0253, fn_puede_cerrar_mes)
 */
export const PERMISOS = [
  "administrar", "verDinero", "analizar",
  "facturar", "gestionarCaja", "ajustarInventario", "ajustarStock", "editarCatalogo", "editarCuentasProveedor",
  "verDineroCompras", "editarEtiquetas", "registrarGastos",
  "verCuentasDinero", "verReportesFinancieros", "verImpuestos", "cerrarMes",
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

/**
 * ¿Esta cuenta es una CAJA del mostrador? Una terminal que ve el Punto de venta. Es UNA sola definición para las dos cosas
 * que la tratan distinto: a dónde aterriza (`aterrizajeDe`) y qué grupos ve sueltos (`sueltoEnMostrador`). Una persona
 * nunca es mostrador, aunque venda: el mostrador es el aparato, no quien lo usa.
 */
export function esMostrador(perfil: { terminal?: boolean; modulos?: readonly ClaveModulo[] | null }): boolean {
  return !!perfil.terminal && !terminalVeInicio(perfil.modulos ?? []);
}

/** Claves de los íconos. Los trazos viven en `lib/menu-iconos.ts` (`TRAZOS_MENU`), que comparten el lateral, Roles y accesos y el Inicio; acá solo se nombra cuál lleva cada nodo. */
export type ClaveIcono =
  | "inicio" | "vender" | "apartados" | "caja" | "historial" | "productos" | "inventario" | "existencias" | "movimientos" | "traslados" | "conteo" | "resumen"
  | "facturacion" | "compras" | "colaboradores" | "insumos" | "produccion" | "ordenes" | "cambios" | "posventa" | "devoluciones" | "venta"
  | "catalogo" | "categorias" | "marcas" | "atributos" | "proveedores" | "facturas" | "recibir" | "porPagar" | "gastos"
  | "finanzas" | "dinero" | "reportes" | "impuestos" | "cierre" | "analisis" | "panorama" | "clientas" | "club" | "avisos" | "frescura" | "pulso" | "liquidacion"
  | "gestion" | "planPiso" | "rendimiento" | "campana" | "recibirInsumos" | "ordenesInsumos" | "fondos" | "revisarCompras" | "vitrina" | "pedidosWeb"
  | "recomendaciones" | "tiendaWeb" | "resumenWeb" | "ajustesWeb" | "puntos" | "paleta" | "calendarioCampana" | "insignias";

/** Números que una fila puede llevar de insignia («por atender»). Los calcula el servidor; el árbol solo dice cuál va dónde. */
export type ClaveContador = "trasladosPorAtender" | "pedidosWebPorConfirmar";
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
  /** Se muestra solo a quien NO lo tiene. Lo usó «Recibir mercadería» mientras vivía en Compras para quien ve el dinero y en
   *  Inventario para quien no (ADR-0113, hasta el 2026-10-14); hoy ninguna fila lo usa, y queda para un caso igual. */
  soloSinPermiso?: Permiso;
  /** Si esta fila queda SOLA bajo su grupo de primer nivel, conserva su propio nombre en vez de tomar el del grupo. Existe por dos
   *  casos: «Recibir mercadería» en Inventario —un rol que solo ve ese módulo veía una fila llamada «Inventario» que abría Recibir
   *  (la pantalla no se parece a Existencias): parecía que Recibir no existía hasta darle otro módulo (Felipe, 2026-10-03)— y
   *  «Frescura del piso», que en CAYLA Global es la única pantalla de Inventario (ADR-0208, act. 2026-10-10 (b)): «Inventario» hace
   *  esperar las existencias de la empresa, que esa vista todavía no suma. Desde el 2026-10-13 (ADR-0392) lo llevan también las
   *  cuatro pantallas de «Gestión»: la Terminal de ventas ve solo Frescura y Plan, y el rol Producción solo Análisis; ninguno
   *  debe ver una fila «Gestión» que abre otra cosa. */
  conservaNombre?: true;
  /** Tipos de ubicación donde aplica; sin esto, en todas. */
  ubicaciones?: readonly TipoUbicacion[];
  /**
   * El módulo del rol (ADR-0161 B2, `lib/modulos.ts`) al que pertenece esta pantalla o acción. Cuando el perfil trae sus
   * `modulos` (leídos de `fn_mis_modulos()`), la fila sale solo si la cuenta ve ese módulo. Una TERMINAL siempre se mira
   * así (sin módulos, no ve nada: falla cerrado). Los grupos no lo declaran: salen si les queda alguna hija. Una hoja SIN
   * módulo (Inicio) no es de ningún rol: la ven las personas, y las terminales según `terminalVeInicio`.
   */
  modulo?: ClaveModulo;
  /** La fila sale SOLO si el perfil trae sus `modulos` y ve el suyo; con la regla fija de antes (un perfil sin módulos,
   *  como las rutas de prueba) no sale. Existe por CAYLA Global (ADR-0275): una pantalla que no es de ninguna sede no
   *  existía antes de los módulos y no tiene por qué aparecerle a un perfil que no los trae. */
  soloConModulo?: true;
  /** Los otros módulos que TAMBIÉN abren esta fila (ADR-0161, 20260923130000; lista desde ADR-0504). Una fila de menú con varias
   *  vistas, cada una con su módulo en Roles y accesos: quien ve CUALQUIERA de los módulos entra por la misma fila, y la pantalla
   *  le muestra solo las vistas que le tocan. Catálogo ▸ Insignias junta lo que eran dos filas, Sellos (`etiquetas`, hoy «Insignias»)
   *  y Campañas (`campanas`; Felipe 2026-10-22). Era `moduloAlterno` (uno solo) hasta que Compras necesitó dos. */
  modulosAlternos?: readonly ClaveModulo[];
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
  /**
   * En la caja del mostrador (`esMostrador`) este grupo no se pinta como cabecera: sus pantallas salen sueltas, cada una
   * con su nombre y también las de sus subgrupos, en el lugar donde iba el grupo. Existe por Ventas (Felipe, 2026-09-25):
   * la caja vive en el Punto de venta y la Caja, y abrir un grupo para llegar a ellas era un clic de más cada vez. Los
   * demás grupos siguen agrupados para que el menú de la caja no pase de unas 8 filas.
   */
  sueltoEnMostrador?: true;
};

/** Algo que todavía no existe: vive en el árbol para que el aviario quede a la vista, y `menuPara` NO lo emite. */
export type Futura = Comun & { estado: "futura"; nota: string; hijos?: readonly Futura[] };

export type Nodo = Hoja | Grupo | Futura;

export function esGrupo(n: Nodo): n is Grupo {
  return n.estado === "viva" && "hijos" in n;
}

/* ------------------------------------------------------------------
   El árbol de HOY (más lo que viene)
   El orden es el del menú, «lo de todos los días primero» (Felipe, 2026-09-25): Inicio, Producción, Ventas, Inventario,
   Catálogo, Compras, Finanzas. En una tienda se ve Inicio, Ventas, Inventario, Catálogo, Compras, Finanzas: el mostrador
   arriba, lo que usa sobre todo el líder abajo, igual que los grupos de Roles y accesos (`MODULOS` en `modulos.ts`), para
   que el líder encuentre cada módulo en el mismo lugar en las dos pantallas. En el Taller el trabajo diario es fabricar,
   así que Producción va primera, pegada a Inicio. No hace falta ninguna regla por ubicación: Producción solo sale en el
   Taller (`ubicaciones: ["taller"]`), así que en una tienda su puesto simplemente no existe. Único desvío de Roles y
   accesos, a propósito: allí Producción va después de Compras.
   Antes (2026-09-16) era Inicio, Catálogo, Producción, Compras, Ventas, Inventario.
   Desde el 2026-10-13 (ADR-0392, Felipe): «Gestión» va DEBAJO de Inicio (en el Taller, después de Producción, porque allí
   el día es fabricar): Inicio y Gestión son «mirar y decidir», todo lo demás es operar. Es el segundo desvío de Roles y
   accesos, a propósito: allí Gestión sigue después de Producción (moverla de orden es otra migración; se dejó escrito).
   ------------------------------------------------------------------ */

export const ARBOL: readonly Nodo[] = [
  // Inicio y Análisis no son dueños de tablas: leen lo de otros. Águila es «Inteligencia y reportes» (lee lo de los demás).
  // `modulo: "inicio"` (20260925220000, Felipe 2026-09-25): antes era la única hoja SIN módulo (la veía toda persona,
  // sin excepción); `modulos.test.ts` lo comprobaba a propósito. Ahora un rol lo puede apagar, como cualquier otro.
  // Una TERMINAL sigue su regla propia (`terminalVeInicio`, más abajo en `esVisible`): vende → su casa es el
  // mostrador, nunca Inicio, tenga o no este módulo en su rol.
  { id: "inicio", modulo: "inicio", etiqueta: "Inicio", estado: "viva", ruta: "/", icono: "inicio", pajaro: "13 Águila" },
  // CAYLA Global (ADR-0275): el tablero de toda la empresa. Solo sale estando en esa vista —parado en una sede, la cuenta
  // no «tiene» este módulo (`modulosEnLaVista`)—, y ahí ocupa el lugar de Inicio, que es de una sede.
  { id: "global", modulo: "cayla_global", soloConModulo: true, etiqueta: "Salud del negocio", estado: "viva", ruta: "/global", icono: "pulso", pajaro: "13 Águila" },

  // «Colaboradores» (a quién de Dynamic le doy entrada a retail) NO va en el menú lateral: se entra desde el perfil del
  // líder (`PerfilModal.tsx`), y adentro viven sus pestañas Terminales y Roles y accesos. Main lo había devuelto al
  // menú el 2026-09-22; Felipe pidió ese mismo día dejarlo en el perfil (se corrige en main después). La ruta
  // `/colaboradores` sigue exigiendo el permiso en la página y en la RPC.

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
      { id: "produccion.ordenes", modulo: "produccion", etiqueta: "Órdenes", estado: "viva", ruta: "/produccion/ordenes", icono: "ordenes", pajaro: "10 Gallito" },
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
      // Órdenes de insumos (ADR-0362 fase 7, decisión 47; Felipe 2026-10-12) va PRIMERA: el trabajo empieza al pedir (pedir → factura →
      // recibir → pagar). Sin `exige`: el módulo es la llave (decisiones 40 y 47) y trae sus precios sin abrir la plata del Taller. Su ruta
      // NO cuelga de `/produccion` a propósito: ese layout pide el módulo de producción, y quien tiene solo «Órdenes de insumos» no lo
      // necesita. Aterrizar en `/ordenes-insumos` abre igual el grupo de Producción (`grupoDe` mira las rutas de las hijas, no solo la
      // `raiz`). Para quien la ve junto a Recibir (sin el dinero del Taller), Abastecimiento ya no se disuelve en «Recibir»: tiene dos.
      // La `raiz` del subgrupo sigue siendo la de Proveedores: el subgrupo no tiene pantalla propia y esa ruta solo dice de qué grupo es.
      // [provisional, revisar con Felipe: el lugar (Producción ▸ Abastecimiento) es la opción (a) de la pregunta 1 del contrato]
      {
        id: "produccion.abastecimiento", etiqueta: "Abastecimiento", estado: "viva", icono: "compras", raiz: "/produccion/proveedores", pajaro: "10 Gallito",
        hijos: [
          { id: "produccion.ordenesInsumos", modulo: "ordenes_insumos", etiqueta: "Órdenes de insumos", estado: "viva", ruta: "/ordenes-insumos", icono: "ordenesInsumos", pajaro: "10 Gallito" },
          { id: "produccion.proveedoresProduccion", modulo: "produccion", etiqueta: "Proveedores", estado: "viva", ruta: "/produccion/proveedores", icono: "proveedores", pajaro: "10 Gallito", exige: "verDinero" },
          { id: "produccion.comprobantesProduccion", modulo: "produccion", etiqueta: "Facturas de insumos", estado: "viva", ruta: "/produccion/comprobantes", icono: "facturas", pajaro: "10 Gallito", exige: "verDinero" },
          // OJO, no es «Recibir mercadería»: aquel (`/recibir`, de Compras e Inventario) recibe prendas contra un envío; este
          // recibe tela y avíos contra un comprobante de Producción. Dos pantallas de dos módulos, una etiqueta parecida.
          { id: "produccion.recibirProduccion", modulo: "produccion", etiqueta: "Recibir", estado: "viva", ruta: "/produccion/recibir", icono: "recibirInsumos", pajaro: "10 Gallito" },
          { id: "produccion.porPagarProduccion", modulo: "produccion", etiqueta: "Por pagar", estado: "viva", ruta: "/produccion/por-pagar", icono: "porPagar", pajaro: "10 Gallito", exige: "verDinero" },
        ],
      },
      // F7 (2026-09-22) ya existe: `/produccion/eficiencia`. NO es una fila del lateral a propósito: vive como PESTAÑA del
      // Resumen («Hoy | Eficiencia»), que es su puerta. Con el regrupo de arriba, sumarla como quinta hija cuando nazca
      // sigue dejando a Producción dentro del tope de 6 (D-84 lo dejó con sitio de sobra a propósito).
      { id: "produccion.eficiencia", etiqueta: "Eficiencia", estado: "futura", pajaro: "10 Gallito", nota: "Existe como pestaña del Resumen: /produccion/eficiencia (F7). No es fila del lateral." },
    ],
  },

  // Gestión (ADR-0392, Felipe 2026-10-13): la puerta de «mirar y decidir», debajo de Inicio (en el Taller, después de
  // Producción). Junta las cuatro pantallas del Águila que no son dueñas de tablas y que el líder mira para dirigir la
  // tienda: Análisis (¿qué hago hoy?), Frescura del piso (¿mi piso está fresco?), Plan del piso (¿cuánto lugar le toca a cada
  // grupo?) y Rendimiento (¿cómo vende cada persona?). Antes vivían repartidas: las tres del piso como filas 5.ª a 7.ª de
  // Inventario (con el tope de hijas subido a 8 a propósito, ADR-0352) y Rendimiento suelta al final. Inventario vuelve a
  // ser las cuatro de operar stock (ADR-0071) y el primer nivel sigue en 8 (Rendimiento deja su fila). El nombre es el del
  // grupo de Roles y accesos donde ya vivían Análisis y Rendimiento (`MODULOS`, `grupo: "Gestión"`).
  // Va ANTES de Inventario en el árbol a propósito: `grupoDe` asigna una ruta al primer grupo que la cubre, y la raíz
  // `/inventario` cubriría `/gestion/frescura`; estando Gestión primero, sus hojas ganan por su ruta exacta, y desde
  // la actividad 2 sus rutas cuelgan de `/gestion/…` (las viejas redirigen en `next.config`). Las cuatro llevan `conservaNombre`: un rol que ve una sola
  // (la Terminal de ventas ve Frescura y Plan; el rol Producción, Análisis) ve esa fila con su nombre, nunca «Gestión».
  {
    id: "gestion", etiqueta: "Gestión", estado: "viva", icono: "gestion", raiz: "/gestion", pajaro: "13 Águila",
    hijos: [
      // Quinta pantalla de Inventario desde ADR-0101; aquí desde ADR-0392. `exige` se queda: es el permiso que su módulo da.
      { id: "gestion.analisis", modulo: "analisis", etiqueta: "Análisis", estado: "viva", ruta: "/gestion/analisis", icono: "analisis", pajaro: "13 Águila", exige: "analizar", conservaNombre: true },
      // ADR-0208 (paso 4): sin `exige`, la visibilidad la da su módulo, que nació solo para el líder.
      { id: "gestion.frescura", modulo: "frescura", etiqueta: "Frescura del piso", estado: "viva", ruta: "/gestion/frescura", icono: "frescura", pajaro: "13 Águila", conservaNombre: true },
      // ADR-0329 / ADR-0352: entrada propia, no una pestaña (una pestaña no es un módulo, ADR-0306).
      { id: "gestion.plan_piso", modulo: "plan_piso", etiqueta: "Plan del piso", estado: "viva", ruta: "/gestion/plan-del-piso", icono: "planPiso", pajaro: "13 Águila", conservaNombre: true },
      // ADR-0219 (respuesta 20): la pantalla del equipo; la ficha de cada persona cuelga de su ruta, no del menú.
      { id: "gestion.rendimiento", modulo: "rendimiento", etiqueta: "Rendimiento", estado: "viva", ruta: "/rendimiento", icono: "rendimiento", pajaro: "13 Águila", conservaNombre: true },
    ],
  },

  // «Ventas» (ADR-0057): el mostrador + lo legal del cobro. El id sigue siendo «venta» (es la clave con la que la pantalla
  // recuerda qué grupo está abierto). Facturación emite documentos ante SUNAT: es del Cuervo y exige `verDinero`.
  // En la caja del mostrador sale SUELTO (Felipe, 2026-09-25): Punto de Venta, Caja, Historial, Cambios, Devoluciones…
  // directo en el lateral, sin la cabecera «Ventas» ni la de «Posventa».
  {
    id: "venta", etiqueta: "Ventas", estado: "viva", icono: "venta", raiz: "/vender", pajaro: "07 Colibrí", sueltoEnMostrador: true,
    hijos: [
      { id: "venta.puntoDeVenta", modulo: "vender", etiqueta: "Punto de Venta", estado: "viva", ruta: "/vender", icono: "vender", pajaro: "07 Colibrí" },
      // Apartados (ADR-0166): la clienta aparta con un adelanto y recoge pagando el saldo. Junto al Punto de venta en el
      // menú, pero con módulo propio desde el ADR-0196: el líder decide aparte quién vende y quién maneja apartados.
      { id: "venta.apartados", modulo: "apartados", etiqueta: "Apartados", estado: "viva", ruta: "/vender/apartados", icono: "apartados", pajaro: "07 Colibrí" },
      // «Pedidos web» vivió aquí, junto a Apartados, del 2026-10-14 al 2026-10-16 (ADR-0408, actividad 8): desde ADR-0430 es de
      // «Tienda web» (abajo), y Ventas vuelve a 6 hijas.
      { id: "venta.caja", modulo: "caja", etiqueta: "Caja", estado: "viva", ruta: "/caja", icono: "caja", pajaro: "07 Colibrí" },
      // Historial de ventas (ADR-0147): el libro de todas las ventas; se lee tras cobrar y cuadrar y de ahí se pasa a corregir.
      { id: "venta.historial", modulo: "historial", etiqueta: "Historial", estado: "viva", ruta: "/vender/historial", icono: "historial", pajaro: "07 Colibrí" },
      // Posventa (D-84, ADR-0166): al entrar Apartados, Ventas pasaba el tope de 6 hijas. Cambios y Devoluciones son lo que pasa
      // DESPUÉS de una venta y se usan mucho menos que el mostrador y la caja: se agrupan en vez de subir el tope (ADR-0144).
      // `raiz` reutiliza la de su primera hija, como Abastecimiento.
      {
        id: "venta.posventa", etiqueta: "Posventa", estado: "viva", icono: "posventa", raiz: "/cambios", pajaro: "07 Colibrí",
        hijos: [
          { id: "venta.cambios", modulo: "cambios", etiqueta: "Cambios", estado: "viva", ruta: "/cambios", icono: "cambios", pajaro: "07 Colibrí" },
          { id: "venta.devoluciones", modulo: "devoluciones", etiqueta: "Devoluciones", estado: "viva", ruta: "/devoluciones", icono: "devoluciones", pajaro: "07 Colibrí" },
        ],
      },
      { id: "venta.facturacion", modulo: "facturacion", etiqueta: "Comprobantes", estado: "viva", ruta: "/vender/comprobantes", icono: "facturacion", pajaro: "08 Cuervo", exige: "facturar" },
    ],
  },

  // Tienda web (ADR-0430, Felipe 2026-10-16): todo lo de la tienda online en un solo lugar. Antes estaba repartido en tres menús y una
  // pestaña: Ventas ▸ Pedidos web, Catálogo ▸ Vitrina web, Clientes ▸ Recomendaciones y Configuración ▸ Tienda web (ADR-0408). Va
  // justo después de Ventas porque es el otro canal de venta, y sus pedidos se atienden a diario en la tienda. Cada hija conserva SU
  // módulo (nadie gana ni pierde un permiso al mudarse), salvo Ajustes: llegó con el de Configuración y desde 20261016223000 tiene el suyo
  // («Datos y plazos de la tienda web», `fn_puede_ajustes_tienda_web`). Sin `conservaNombre`: un rol que ve una sola hija ve la fila «Tienda web», y la pantalla dice cuál es
  // (su cabecera lleva «Tienda web» tras la fecha). Con este grupo el primer nivel pasa a 9 filas: `TOPE_FILAS` en menu.test.ts.
  {
    id: "tiendaWeb", etiqueta: "Tienda web", estado: "viva", icono: "tiendaWeb", raiz: "/tienda-web", pajaro: "07 Colibrí",
    hijos: [
      // «¿Qué te pide hoy la tienda web?»: la ventana de la vitrina, cómo está cada tienda, lo que pide acción y el camino de los
      // pedidos. Su módulo nace solo para el líder (20261016174000) y no trae funciones propias: lee con las de sus hermanas, cada una
      // con el candado de su módulo. Es la `raiz` del grupo: el riel resuelve primero la ruta exacta y luego el prefijo más largo.
      { id: "tiendaWeb.resumen", modulo: "tienda_web", etiqueta: "Resumen", estado: "viva", ruta: "/tienda-web", icono: "resumenWeb", pajaro: "07 Colibrí" },
      // Lo que los clientes separan en la tienda online para ESTA tienda (ADR-0408, actividad 8). El único con insignia del grupo.
      { id: "tiendaWeb.pedidos", modulo: "pedidos_web", etiqueta: "Pedidos", estado: "viva", ruta: "/tienda-web/pedidos", icono: "pedidosWeb", contador: "pedidosWebPorConfirmar", pajaro: "07 Colibrí" },
      // Qué modelos se ven en la web, sus looks y quién espera una talla (ADR-0408, actividades 3, 11 y 12). El dato es del Loro.
      { id: "tiendaWeb.vitrina", modulo: "vitrina_web", etiqueta: "Vitrina", estado: "viva", ruta: "/tienda-web/vitrina", icono: "vitrina", pajaro: "02 Loro" },
      // Cómo se ve la tienda online durante cada campaña (Felipe 2026-10-21): ambiente del catálogo o imagen propia, movimiento y textos. Las fechas,
      // el % y las prendas se siguen armando en Catálogo ▸ Campañas (ADR-0473); aquí solo el diseño. Justo después de la Vitrina: las dos visten la web.
      { id: "tiendaWeb.campanas", modulo: "campanas_web", etiqueta: "Campañas", estado: "viva", ruta: "/tienda-web/campanas", icono: "paleta", pajaro: "02 Loro" },
      // Lo que los clientes le recomiendan a CAYLA desde la web, con su nombre (ADR-0408, 2026-10-15). Firma con el responsable de la
      // sede donde se está parado: en CAYLA Global no se abre (no es de la vista global).
      { id: "tiendaWeb.recomendaciones", modulo: "recomendaciones", etiqueta: "Recomendaciones", estado: "viva", ruta: "/tienda-web/recomendaciones", icono: "recomendaciones", pajaro: "07 Colibrí" },
      // Lo que la web muestra de cada tienda y los plazos de los pedidos (ADR-0408, actividad 6). Era la pestaña «Tienda web» de
      // Configuración y la abría su módulo; desde 20261016223000 tiene el suyo («Datos y plazos de la tienda web»). El rótulo («Conf. Tienda», Felipe
      // 2026-10-21; antes «Datos y plazos») dice qué hay dentro: «Ajustes» a secas era demasiado general. El dato sigue siendo del Ganso, como el resto de Configuración.
      // `soloConModulo`: antes de los roles (un perfil sin módulos) esta pantalla no existía, así que la fila no le aparece a nadie.
      { id: "tiendaWeb.ajustes", modulo: "ajustes_web", soloConModulo: true, etiqueta: "Conf. Tienda", estado: "viva", ruta: "/tienda-web/ajustes", icono: "ajustesWeb", pajaro: "01 Ganso" },
    ],
  },

  // Inventario (ADR-0071): el mundo único del stock físico. Lo ve cualquier integrante: opera stock, recibe y cuenta.
  {
    id: "inventario", etiqueta: "Inventario", estado: "viva", icono: "inventario", raiz: "/inventario", pajaro: "05 Halcón",
    hijos: [
      { id: "inventario.existencias", modulo: "existencias", etiqueta: "Existencias", estado: "viva", ruta: "/inventario", icono: "existencias", pajaro: "05 Halcón" },
      { id: "inventario.movimientos", modulo: "movimientos", etiqueta: "Movimientos", estado: "viva", ruta: "/inventario/movimientos", icono: "movimientos", pajaro: "05 Halcón" },
      // El único con insignia hoy: los traslados que esperan a quien mira (rediseño de Traslados, 2026-09-18).
      { id: "inventario.traslados", modulo: "traslados", etiqueta: "Traslados", estado: "viva", ruta: "/inventario/traslados", icono: "traslados", contador: "trasladosPorAtender", pajaro: "05 Halcón" },
      { id: "inventario.conteo", modulo: "conteos", etiqueta: "Conteo", estado: "viva", ruta: "/inventario/conteo", icono: "conteo", pajaro: "06 Lechuza" },
      // Análisis (ADR-0101), Frescura del piso (ADR-0208) y Plan del piso (ADR-0352) vivieron aquí como filas 5.ª a 7.ª hasta el
      // 2026-10-13: desde ADR-0392 son de «Gestión» (arriba). Inventario vuelve a las cuatro de operar stock (ADR-0071), más
      // «Recibir mercadería»: cabe en el tope general de 6, sin excepción.
      // Recibir vive AQUÍ para todos (Felipe, 2026-10-14; ADR-0393 y ADR-0362, decisión 38): es donde entra el stock. Hasta ese día
      // vivía en Compras para quien ve el dinero de Compras y aquí solo para quien no (ADR-0113): dos lugares según quién mirara, y el
      // líder parado en el Taller no lo tenía en ningún menú. Lo que muestra (con o sin montos) lo sigue decidiendo la pantalla.
      { id: "inventario.recibir", modulo: "recibir", etiqueta: "Recibir mercadería", estado: "viva", ruta: "/recibir", icono: "recibir", pajaro: "05 Halcón", conservaNombre: true },
    ],
  },

  // Catálogo (2026-09-16/17): qué ES una prenda y el vocabulario del que cuelga. Colores, tallas, tejidos, patrones y
  // temporadas viven como pestañas de «Atributos». Los sellos vivieron ahí también hasta el 2026-10-22 y las campañas tuvieron su
  // fila ese mismo día (ADR-0473); esa tarde Felipe pidió juntarlos en «Sellos», con las campañas como su primera vista, y el 2026-10-23 que se
  // llamaran «Insignias» (ADR-0481): deciden a cuánto se vende y cuándo, no qué es la prenda.
  // Marcas (2026-09-25): la pantalla existía desde el ADR-0109 pero nunca entró al menú; solo se llegaba por un enlace
  // dentro de Nuevo producto. Felipe vio una marca mal cargada en Proveedores y no tenía por dónde corregirla. Mismo
  // módulo que Categorías: «atributos» ya se llama «Categorías, marcas y atributos» en Roles y accesos.
  {
    id: "catalogo", etiqueta: "Catálogo", estado: "viva", icono: "catalogo", raiz: "/productos", pajaro: "02 Loro",
    hijos: [
      { id: "catalogo.productos", modulo: "productos", etiqueta: "Productos", estado: "viva", ruta: "/productos", icono: "productos", pajaro: "02 Loro" },
      // «Vitrina web» vivió aquí, después de Productos, del 2026-10-14 al 2026-10-16 (ADR-0408, actividad 3): desde ADR-0430 es de
      // «Tienda web».
      { id: "catalogo.categorias", modulo: "atributos", etiqueta: "Categorías", estado: "viva", ruta: "/productos/categorias", icono: "categorias", pajaro: "02 Loro" },
      { id: "catalogo.marcas", modulo: "atributos", etiqueta: "Marcas", estado: "viva", ruta: "/productos/marcas", icono: "marcas", pajaro: "02 Loro" },
      { id: "catalogo.atributos", modulo: "atributos", etiqueta: "Atributos", estado: "viva", ruta: "/productos/atributos", icono: "atributos", pajaro: "02 Loro" },
      { id: "catalogo.insignias", modulo: "etiquetas", modulosAlternos: ["campanas"], etiqueta: "Insignias", estado: "viva", ruta: "/productos/insignias", icono: "insignias", pajaro: "02 Loro" },
      // ADR-0379 (Felipe 2026-10-10): las prendas sueltas que se liquidan con su etiqueta, SIN pasar a Productos. Vive en
      // Catálogo porque es la otra cara de «qué se vende y a cuánto» (y el grupo Inventario ya está en su tope). La
      // visibilidad la da su módulo, que nace solo para el líder.
      { id: "catalogo.liquidacion", modulo: "liquidacion", etiqueta: "Liquidación", estado: "viva", ruta: "/productos/liquidacion", icono: "liquidacion", pajaro: "02 Loro" },
    ],
  },

  // Compras (ADR-0126): dinero de proveedores. Cada puerta exige `verDineroCompras` (quien ve Facturas de compra, Por pagar
  // o Notas de crédito, 20260923130000) Y su propio módulo; el grupo sale solo cuando no queda ninguna.
  // Proveedores es la excepción (ADR-0161 P3, 20260923140000): exige su módulo (`editarCuentasProveedor`), no el dinero —
  // quien lo tiene sin los montos ve el directorio y la ficha sin cifras. Plan de campaña y Órdenes de compra, también: piden solo
  // su módulo (ADR-0387, Felipe 2026-10-12: «el módulo es la llave»; sus funciones no piden más que eso).
  // Es el módulo de comprar para las TIENDAS: parado en el Taller no se muestra, ni al líder (Felipe, 2026-09-21), del mismo
  // modo que Producción no se muestra en una tienda: en cada ubicación el líder ve UNO de los dos. Solo visibilidad: las
  // URLs de Compras siguen abriendo (otras pantallas enlazan a ellas) y el candado real es el de cada RPC. Consecuencia
  // conocida: «Recibir mercadería» vivía acá para el líder, así que parado en el Taller solo le queda en «+ Nuevo».
  // Mismo orden que ya tenía: proveedor → factura → recepción → pago → notas de crédito.
  // PL-50 (Felipe, 2026-09-23): «Comprobantes» y «Notas de crédito» son palabras SOLO de Ventas (lo que CAYLA le emite a la
  // clienta ante SUNAT). Acá se dice «Facturas de proveedor» y «Notas de crédito de proveedor»; en el Taller, «Facturas de
  // insumos». Solo cambió el texto visible: ids, rutas y claves de módulo siguen iguales. Desde el 2026-10-23 (ADR-0480 act.)
  // «Facturas de proveedor» es «Historial de compras»: solo lectura, y el papel puede ser factura, boleta, nota de venta o ninguno.
  {
    id: "compras", etiqueta: "Compras", estado: "viva", icono: "compras", raiz: "/compras", pajaro: "09 Pelícano", ubicaciones: ["tienda", "almacen"],
    hijos: [
      // Plan de campaña (ADR-0349): cuánto comprar para una campaña, por categoría. Va primero: se planifica antes de comprar. Muestra
      // costos e inversión, así que pide ver el dinero de Compras como sus hermanas (ADR-0126).
      { id: "compras.plan", modulo: "plan_compra", etiqueta: "Plan de campaña", estado: "viva", ruta: "/compras/plan", icono: "campana", pajaro: "09 Pelícano" },
      // ADR-0480 (Compras simple, Felipe 2026-10-22): la compra nace en el celular de quien compra. «Mis compras» reusa la
      // clave `ordenes_compra` (unas 40 funciones la usan como llave: recibir, gastos del viaje, datos bancarios, proveedor nuevo,
      // «Nos debe»); las pantallas de órdenes salen del menú. «Notas de crédito» se retiró: «por ahora no manejaremos notas de crédito».
      { id: "compras.miPlata", modulo: "ordenes_compra", etiqueta: "Mis compras", estado: "viva", ruta: "/compras/mi-plata", icono: "fondos", pajaro: "09 Pelícano" },
      { id: "compras.proveedores", modulo: "proveedores", etiqueta: "Proveedores", estado: "viva", ruta: "/compras/proveedores", icono: "proveedores", pajaro: "09 Pelícano", exige: "editarCuentasProveedor" },
      // ADR-0504 (Felipe 2026-10-24, opción A): UNA fila, tres pestañas —Historial, Revisar compras (la oficina, `fondos`) y Por pagar—, antes tres
      // filas sueltas (Compras bajó de 6 a 4). Los TRES módulos siguen en Roles y accesos y la fila se abre con cualquiera; cada pestaña pide el suyo
      // (`CabeceraHistorialCompras`, `lib/compras-pestanas-reglas.ts`) y las rutas no cambian. Sin `exige`: `verDineroCompras` sale de Historial o Por
      // pagar y, sumado al módulo, escondería la fila de un rol con solo «Revisar compras».
      // «Recibir mercadería» ya no vive aquí: desde el 2026-10-14 es una sola fila, en Inventario (ver allí).
      { id: "compras.comprobantes", modulo: "facturas_compra", modulosAlternos: ["fondos", "por_pagar"], etiqueta: "Historial de compras", estado: "viva", ruta: "/compras", icono: "facturas", pajaro: "09 Pelícano" },
    ],
  },

  /* ---- Lo que viene: existe en el árbol, `menuPara` no lo emite. Sin ruta ni ícono hasta que nazca. ---- */

  // Finanzas (ADR-0195, plan en docs/PLAN-FINANZAS.md): nace con Gastos (F2). Sin `exige` en el grupo: cada hija pide lo
  // suyo, y Gastos es de quien tenga el módulo (su tienda) o del líder (todas). Vive en todas las ubicaciones: el Taller
  // también paga luz y alquiler. Con el Resumen (F10) las seis hijas están vivas; `/finanzas` lleva al Resumen a quien lo ve.
  {
    id: "finanzas", etiqueta: "Finanzas", estado: "viva", icono: "finanzas", raiz: "/finanzas", pajaro: "11 Garza",
    hijos: [
      // Las 6 hijas del spike (docs/maquetas/finanzas-2026-09/, PLAN-FINANZAS §6); las 11 piezas son pestañas dentro de ellas.
      // Cada fase pasa la suya a «viva» con su ruta, ícono y permiso (ADR-0195 F3–F10).
      { id: "finanzas.resumen", modulo: "reportes_financieros", etiqueta: "Resumen", estado: "viva", ruta: "/finanzas/resumen", icono: "panorama", pajaro: "12 Urraca", exige: "verReportesFinancieros" },
      { id: "finanzas.gastos", modulo: "gastos", etiqueta: "Gastos", estado: "viva", ruta: "/finanzas/gastos", icono: "gastos", pajaro: "11 Garza", exige: "registrarGastos" },
      { id: "finanzas.dinero", modulo: "cuentas_dinero", etiqueta: "Cuentas y dinero", estado: "viva", ruta: "/finanzas/dinero", icono: "dinero", pajaro: "12 Urraca", exige: "verCuentasDinero" },
      { id: "finanzas.reportes", modulo: "reportes_financieros", etiqueta: "Reportes", estado: "viva", ruta: "/finanzas/reportes", icono: "reportes", pajaro: "12 Urraca", exige: "verReportesFinancieros" },
      { id: "finanzas.impuestos", modulo: "impuestos", etiqueta: "Impuestos", estado: "viva", ruta: "/finanzas/impuestos", icono: "impuestos", pajaro: "12 Urraca", exige: "verImpuestos" },
      { id: "finanzas.cierreDeMes", modulo: "cierre_mes", etiqueta: "Cierre de mes", estado: "viva", ruta: "/finanzas/cierre", icono: "cierre", pajaro: "12 Urraca", exige: "cerrarMes" },
    ],
  },
  // Clientas, paso 2 del acta (D-92, docs/datos/DECISIONES-2026-09-26-clientas.md): «crecer
  // Clientas... como grupo propio del menú», no anidada bajo Ventas. Desde 20261004010000 (Felipe
  // 2026-10-03) Roles y accesos (`modulos.ts`) lo agrupa igual: grupo «Clientes» con «Fichas de
  // clientes» y «Avisos del club». Fue HOJA hasta que nació su segunda pantalla: con Avisos (ADR-0288
  // act. g, tanda 1g, módulo `avisos_club`) pasa a GRUPO, como lo dejó anotado el paso 2.
  // Las fichas conservan el corazón de siempre y la cabecera estrena uno propio (como «Venta» y
  // «Posventa»): quien solo ve las fichas sigue viendo la misma fila, con el mismo ícono, porque un
  // grupo con una sola hija se disuelve en ella con el nombre del grupo (`construirFila`).
  {
    id: "clientas", etiqueta: "Clientes", estado: "viva", icono: "club", raiz: "/clientas", pajaro: "07 Colibrí",
    hijos: [
      { id: "clientas.fichas", modulo: "clientas", etiqueta: "Fichas", estado: "viva", ruta: "/clientas", icono: "clientas", pajaro: "07 Colibrí" },
      { id: "clientas.avisos", modulo: "avisos_club", etiqueta: "Avisos", estado: "viva", ruta: "/clientas/avisos", icono: "avisos", pajaro: "07 Colibrí" },
      // Beneficios del club (programa de puntos, actividad 8): lo que se le ofrece al cliente, configurable sin deploy. Solo el líder.
      { id: "clientas.beneficios", modulo: "beneficios_club", etiqueta: "Beneficios", estado: "viva", ruta: "/clientas/beneficios", icono: "puntos", pajaro: "07 Colibrí" },
      // «Recomendaciones» vivió aquí del 2026-10-15 al 2026-10-16 (ADR-0408): desde ADR-0430 es de «Tienda web».
    ],
  },
  // Rendimiento (ADR-0219, respuesta 20) fue hoja suelta «al final del menú lateral» hasta el 2026-10-13: desde ADR-0392 es la
  // cuarta fila de «Gestión» (arriba), y así el primer nivel sigue en 8. Nace sin rol (ADR-0161).
  {
    id: "configuracion", etiqueta: "Configuración", estado: "futura", pajaro: "01 Ganso", exige: "administrar",
    nota: "Módulo nuevo. Los nombres de las hijas son provisionales.",
    hijos: [
      { id: "configuracion.accesos", etiqueta: "Ubicaciones y accesos", estado: "futura", pajaro: "01 Ganso", nota: "`ubicaciones` y `colaboradores`." },
      { id: "configuracion.empresa", etiqueta: "Empresa y facturación", estado: "futura", pajaro: "08 Cuervo", nota: "`configuracion_empresa`, `series_comprobantes`, `ubicacion_datos_fiscales`." },
    ],
  },
  { id: "apartados", etiqueta: "Apartados", estado: "futura", pajaro: "05 Halcón", nota: "Stock apartado para un cliente." },
  { id: "comercial", etiqueta: "Comercial", estado: "futura", pajaro: "13 Águila", nota: "Inteligencia comercial: lee lo de los demás." },
];

/** Todas las hojas VIVAS de `ARBOL`, en su orden (el orden del menú), sin filtrar por perfil: la usa `aterrizajeDe`
 *  para encontrar «la primera pantalla que ve» sin repetir el árbol. Una `Futura` no cuenta: no existe todavía. */
function hojasDelArbol(nodos: readonly Nodo[]): Hoja[] {
  return nodos.flatMap((n) => (n.estado !== "viva" ? [] : esGrupo(n) ? hojasDelArbol(n.hijos) : [n]));
}
const HOJAS_DEL_ARBOL = hojasDelArbol(ARBOL);

/** La ruta del módulo elegido si el rol todavía lo ve; si no (o no eligió), la primera ruta de `HOJAS_DEL_ARBOL` que
 *  el rol ve, en el orden del menú; `null` si no le queda ninguna. */
function primeraRutaDe(modulos: readonly ClaveModulo[], preferido?: string | null): string | null {
  if (preferido && modulos.includes(preferido as ClaveModulo)) {
    const elegida = HOJAS_DEL_ARBOL.find((h) => h.modulo === preferido);
    if (elegida) return elegida.ruta;
  }
  return HOJAS_DEL_ARBOL.find((h) => h.modulo && modulos.includes(h.modulo))?.ruta ?? null;
}

/**
 * A dónde ATERRIZA una cuenta al abrir `/` (20260925220000, Felipe 2026-09-25). Una TERMINAL manda aparte y siempre:
 * si ve el Punto de venta, su casa es el mostrador (Felipe, 2026-09-21); si no, Inicio — no participa de «pantalla
 * principal» ni de que Inicio se apague. Una PERSONA: la pantalla principal de su rol si todavía la ve; si no (o su
 * rol nunca eligió una), la primera pantalla que ve, en el orden del menú (Inicio sale primero si la tiene, como
 * antes); si no le queda NINGUNA (ni Inicio ni ningún otro módulo), «Sin acceso» — nunca queda sin saber a dónde ir.
 * En CAYLA Global (ADR-0275) el Inicio de una sede no tiene sentido: quien iba a quedarse en él va al tablero, salvo
 * el Admin, cuyo Inicio es el Observatorio de toda la empresa (ADR-0322; si el Observatorio no se puede leer, el Inicio
 * lo manda igual al tablero al dibujarse).
 *
 * La usan el Inicio, al abrirse, y el login, ANTES de navegar (`app/api/aterrizaje`): así la cuenta entra directo a su
 * pantalla, sin pasar por `/` (Felipe 2026-10-13: al entrar «se ve el inicio» un instante). Una sola regla para los dos.
 */
export function aterrizajeDe(perfil: {
  terminal?: boolean;
  modulos?: readonly ClaveModulo[] | null;
  pantallaPrincipal?: string | null;
  esAdmin?: boolean;
  vista?: Vista;
}): string {
  const modulos = perfil.modulos ?? [];
  if (perfil.terminal) return esMostrador(perfil) ? "/vender" : "/";
  const destino = primeraRutaDe(modulos, perfil.pantallaPrincipal) ?? "/sin-acceso";
  return destino === "/" && perfil.vista === "global" && !perfil.esAdmin ? "/global" : destino;
}

/**
 * Las 4 columnas fijas de la barra del celular, por id de nodo. Punto de Venta y Caja son de uso diario en el mostrador; lo
 * demás queda a un toque del lateral. Un grupo en una columna lleva a su `raiz` y muestra la suma de los números de sus hijas
 * (igual que su cabecera cerrada en el lateral).
 */
export const COLUMNAS_MOVIL: readonly string[] = ["inicio", "venta.puntoDeVenta", "inventario", "venta.caja"];

/* ------------------------------------------------------------------
   Lo que sale de `menuPara`
   ------------------------------------------------------------------ */

export type ItemMenu = { id: string; etiqueta: string; href: string; icono: ClaveIcono; /** Cuántas cosas de esta fila piden acción a quien mira; ausente = sin insignia. */ contador?: number };
/** Una hija puede volver a ser un `GrupoMenu` (subgrupo, D-84): el tipo es recursivo porque el árbol lo es. */
export type GrupoMenu = { id: string; etiqueta: string; icono: ClaveIcono; hijos: FilaMenu[] };
export type FilaMenu = ItemMenu | GrupoMenu;

export function esGrupoMenu(f: FilaMenu): f is GrupoMenu {
  return "hijos" in f;
}

/** Ids de los grupos HERMANOS de `id` (mismo nivel, mismo padre; `id` no incluido). Abrir un grupo cierra a sus
 *  hermanos — un solo desplegado a la vez por nivel (Felipe, 2026-10-23) —, pero nunca a su padre ni a sus hijos:
 *  abrir Abastecimiento no cierra Producción. */
export function hermanosDe(id: string, filas: readonly FilaMenu[]): string[] {
  if (filas.some((f) => esGrupoMenu(f) && f.id === id)) return filas.filter((f) => esGrupoMenu(f) && f.id !== id).map((f) => f.id);
  for (const f of filas) {
    if (!esGrupoMenu(f)) continue;
    const dentro = hermanosDe(id, f.hijos);
    if (dentro.length) return dentro;
  }
  return [];
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
  /** Las 4 columnas de la barra del celular. */
  movil: ItemMenu[];
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
  if (n.soloConModulo && !modulos) return false;
  if (modulos) {
    // La regla del mostrador manda sobre el módulo para una TERMINAL (Felipe, 2026-09-21): vende → su casa es el
    // mostrador, nunca Inicio, tenga o no el módulo en su rol. Independiente de «Inicio apagable» (20260925220000):
    // una terminal no participa de ese candado.
    if (n.id === "inicio" && perfil.terminal) return terminalVeInicio(modulos);
    // Por rol (ADR-0161): la hoja sale si la cuenta ve su módulo; un grupo, si le queda alguna hija (lo resuelve
    // `construirFila`).
    if (n.modulo) return modulos.includes(n.modulo) || !!n.modulosAlternos?.some((m) => modulos.includes(m));
  }
  return true;
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
export type FuenteMenu = { arbol: readonly Nodo[]; columnas: readonly string[] };
export const MENU_DE_HOY: FuenteMenu = { arbol: ARBOL, columnas: COLUMNAS_MOVIL };

export function menuPara(perfil: PerfilDelMenu, { arbol, columnas }: FuenteMenu = MENU_DE_HOY): Menu {
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
    if (hijos.length === 1) {
      if (!esRaiz) return hijos[0];
      // `conservaNombre`: la hija que quedó sola sigue llamándose como ella misma, no como el grupo (solo «Recibir mercadería»).
      const propia = n.hijos.some((h) => h.id === hijos[0].id && "conservaNombre" in h && h.conservaNombre);
      return propia ? { ...hijos[0], id: n.id } : { ...hijos[0], id: n.id, etiqueta: n.etiqueta };
    }
    return { id: n.id, etiqueta: n.etiqueta, icono: n.icono, hijos };
  };

  // ---- riel de escritorio ----
  // Un grupo `sueltoEnMostrador`, en la caja, se arma como si fuera un SUBGRUPO (`esRaiz = false`): con una sola hija
  // visible, esa hija sube con su propio nombre («Punto de Venta», no «Ventas»). Y en vez de su cabecera van sus hojas,
  // las de sus subgrupos incluidas (`hojasDe`). Es la misma regla de disolver un grupo que ya existía, aplicada al primer
  // nivel. `grupoDe` no cambia: pararse en `/caja` sigue siendo estar en Ventas, y moverse ahí cierra el grupo que
  // estuviera abierto (Inventario), igual que para cualquier otra cuenta.
  const mostrador = esMostrador(perfil);
  const riel: FilaMenu[] = [];
  const emitidos = new Map<string, FilaMenu>();
  for (const n of arbol) {
    const suelto = mostrador && esGrupo(n) && !!n.sueltoEnMostrador;
    const fila = construirFila(n, !suelto);
    if (!fila) continue;
    riel.push(...(suelto ? hojasDe(fila) : [fila]));
    emitidos.set(n.id, fila);
  }

  // ---- barra del celular ----
  const movil: ItemMenu[] = [];
  for (const id of columnas) {
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

  return { riel, movil, grupoDe };
}
