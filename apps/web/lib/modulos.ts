// Los módulos que un ROL puede ver (ADR-0150 retomado por el ADR-0161 B; migración 20260923030000_roles_por_modulo.sql).
//
// PROMETE: el catálogo de los módulos (el mismo de `retail.modulos`, en el mismo orden), la lista fija de lo que es
// «siempre solo del líder», lo que cada cuenta ve HOY sin haber leído la base, y la traducción de «qué módulos ve esta
// cuenta» a los permisos semánticos que ya preguntan las pantallas (`permisosDeModulos`). Lógica pura: se importa desde el
// servidor y desde el cliente, y se prueba con `modulos.test.ts`.
//
// LA REGLA (Felipe, 2026-09-22): un rol decide solo «ve / no ve» por módulo. Quien ve un módulo hace todo lo que hay en
// él, salvo la lista `SIEMPRE_SOLO_LIDER`, que vive en cada función de la base con `fn_es_lider()`.

import { PERMISOS, type Permiso } from "./menu";

export const CLAVES_MODULO = [
  "inicio",
  "vender", "apartados", "caja", "cambios", "devoluciones", "historial", "facturacion", "clientas", "avisos_club",
  "existencias", "conteos", "traslados", "movimientos", "frescura", "plan_piso",
  "productos", "atributos", "etiquetas",
  "facturas_compra", "recibir", "por_pagar", "proveedores", "notas_credito",
  "produccion",
  "analisis", "colaboradores", "roles",
  "configuracion",
  "gastos", "cuentas_dinero", "reportes_financieros", "impuestos", "cierre_mes",
  "actividad",
  "cayla_global",
  "rendimiento",
] as const;
export type ClaveModulo = (typeof CLAVES_MODULO)[number];

export type Modulo = {
  clave: ClaveModulo;
  grupo: "General" | "Ventas" | "Clientes" | "Inventario" | "Catálogo" | "Compras" | "Producción" | "Gestión" | "Finanzas";
  nombre: string;
  /** Lo que se da al encenderlo: quien ve el módulo hace todo esto. */
  incluye: string;
  /** Nunca se delega. Lo usaban Colaboradores y Roles y accesos (ADR-0150, decisión 3) hasta el 2026-09-22, cuando Felipe
   *  los abrió a cualquier rol (20260923131000). Hoy ningún módulo lo usa; queda por si uno nuevo nace así. */
  soloLider?: true;
  /** «Solo líder por ahora»: la base aún exige `fn_es_lider()` en sus funciones; encenderlo abriría una pantalla que
   *  falla al guardar. La base lo rechaza (`retail.modulos.delegable`). Desde 20260928220000 (ADR-0253, Felipe: «ningún
   *  módulo debería estar limitado a solo el líder») ningún módulo lo usa: Configuración, Impuestos y Cierre de mes, los
   *  últimos, se abrieron. Queda solo por si un módulo nuevo tiene que nacer así mientras se construye. */
  noDelegable?: true;
};

/** Espejo de `retail.modulos`. `modulos.test.ts` compara esta lista con la siembra de la migración. */
export const MODULOS: readonly Modulo[] = [
  // Inicio (20260925220000, Felipe 2026-09-25): antes no era de ningún módulo (lo veía toda persona, sin excepción).
  // Excepción a «un módulo nuevo nace solo del líder» (CLAUDE.md): nace ENCENDIDO en los roles que ya existen, o cada
  // cuenta se quedaba sin dónde aterrizar el mismo día. Una terminal de ventas no participa: su casa sigue siendo el
  // mostrador (regla propia de `aterrizajeDe`, `lib/menu.ts`), tenga o no este módulo.
  { clave: "inicio", grupo: "General", nombre: "Inicio", incluye: "Ver el tablero de inicio: lo del día, lo por atender y accesos rápidos a su tienda" },
  { clave: "vender", grupo: "Ventas", nombre: "Punto de venta", incluye: "Registrar ventas, descuento hasta su tope, dejar en espera, monto manual" },
  // Apartados (ADR-0196): se separó del Punto de venta a pedido de Felipe (2026-09-24). Nace sin rol: solo lo ve el líder.
  { clave: "apartados", grupo: "Ventas", nombre: "Apartados", incluye: "Apartar prendas con adelanto, entregar cobrando el saldo, extender, liberar y devolver el adelanto" },
  { clave: "caja", grupo: "Ventas", nombre: "Caja", incluye: "Abrir y cerrar caja, ingresos y egresos, ajustes de caja" },
  { clave: "cambios", grupo: "Ventas", nombre: "Cambios", incluye: "Registrar cambios de prenda" },
  { clave: "devoluciones", grupo: "Ventas", nombre: "Devoluciones", incluye: "Solicitar devoluciones" },
  { clave: "historial", grupo: "Ventas", nombre: "Historial de ventas", incluye: "Consultar, reimprimir y exportar" },
  { clave: "facturacion", grupo: "Ventas", nombre: "Facturación", incluye: "Emitir boletas, facturas y notas; reenviar a SUNAT" },
  { clave: "clientas", grupo: "Clientes", nombre: "Fichas de clientes", incluye: "Registrar, editar y archivar clientes; ver sus compras" },
  // Avisos del club (ADR-0288 act. g, G-8; 20261001210500): Clientas ▸ Avisos, los mensajes del club por mandar a las socias
  // con publicidad. Nace SIN rol (solo el líder) y delegable: sus funciones piden este módulo, no al líder.
  { clave: "avisos_club", grupo: "Clientes", nombre: "Avisos del club", incluye: "Ver los mensajes del club por mandar a los miembros con WhatsApp de su tienda (cumpleaños, aniversario, novedades y rebajas en su talla), enviarlos por WhatsApp Web, deshacer un envío y anotar la BAJA" },
  // «Retirar del piso» (ADR-0208, bloque 2) vive en Existencias: el texto lo nombra para que el líder sepa qué da (20260926170000).
  // «Bajada al piso» y «Ajustar stock» NO son módulos (ADR-0306, Felipe 2026-10-02): son funciones de Existencias, porque no
  // tienen entrada propia en el menú. Regla: un módulo es una entrada del menú izquierdo; quien lo ve hace todo lo de adentro.
  { clave: "existencias", grupo: "Inventario", nombre: "Existencias", incluye: "Consultar stock, reponer el piso (bajar del almacén, subir y retirar), apartar prendas y ajustar stock" },
  { clave: "conteos", grupo: "Inventario", nombre: "Conteos", incluye: "Iniciar, registrar y cerrar conteos" },
  { clave: "traslados", grupo: "Inventario", nombre: "Traslados", incluye: "Enviar, recibir, cancelar y cerrar con diferencia" },
  { clave: "movimientos", grupo: "Inventario", nombre: "Movimientos", incluye: "Consultar y exportar" },
  // Frescura del piso (ADR-0208 paso 4, 20260929100000): cuánto lleva colgada cada prenda contra las demás de su categoría
  // en su sede, y qué hacer con lo que se queda. Nace SIN rol (solo el líder) y delegable: por el ADR-0253 sus tres
  // lecturas piden «el líder, o este módulo, en una sede que opera». Quien lo tiene sin ser líder ve SU sede entera; el
  // registro al colgar, «Las 3 tiendas» y la referencia de CAYLA (que leen las otras sedes) siguen siendo del líder.
  { clave: "frescura", grupo: "Inventario", nombre: "Frescura del piso", incluye: "Ver cuánto lleva colgada cada prenda de su tienda contra las demás de su categoría, y qué conviene hacer con la que se queda" },
  // Plan del piso (ADR-0329 + ADR-0328, actividad 12; 20261006100000): cuánto lugar tiene cada grupo de prendas en el riel de su
  // tienda. Primera entrega, solo lectura: la propuesta y los grupos del mix. Nace SIN rol (solo el líder) y delegable (ADR-0253).
  // Quien lo recibe sin ser líder VE la propuesta y los grupos; decidir a qué grupo va cada categoría sigue siendo del líder.
  { clave: "plan_piso", grupo: "Inventario", nombre: "Plan del piso", incluye: "Ver la propuesta de cuánto lugar tiene cada grupo de prendas en el piso de su tienda y contra qué se compara" },
  { clave: "productos", grupo: "Catálogo", nombre: "Productos", incluye: "Crear, editar y archivar prendas; precios, fotos y códigos" },
  { clave: "atributos", grupo: "Catálogo", nombre: "Categorías, marcas y atributos", incluye: "Crear, editar, desactivar y aprobar propuestas" },
  { clave: "etiquetas", grupo: "Catálogo", nombre: "Etiquetas", incluye: "Crear, editar, aprobar y archivar etiquetas, configurar su campaña y descuento, y ponérselas a las prendas" },
  { clave: "facturas_compra", grupo: "Compras", nombre: "Facturas de compra", incluye: "Registrar, corregir y anular facturas" },
  { clave: "recibir", grupo: "Compras", nombre: "Recibir mercadería", incluye: "Recibir envíos de proveedores" },
  { clave: "por_pagar", grupo: "Compras", nombre: "Por pagar", incluye: "Ver lo que se debe y registrar pagos" },
  { clave: "proveedores", grupo: "Compras", nombre: "Proveedores", incluye: "Crear, editar y archivar; cuentas bancarias, Yape y Plin" },
  { clave: "notas_credito", grupo: "Compras", nombre: "Notas de crédito", incluye: "Registrar y anular notas" },
  { clave: "produccion", grupo: "Producción", nombre: "Órdenes de producción", incluye: "Crear, editar y cancelar órdenes; registrar avance" },
  { clave: "analisis", grupo: "Gestión", nombre: "Análisis", incluye: "Reportes de ventas e inventario" },
  { clave: "colaboradores", grupo: "Gestión", nombre: "Colaboradores", incluye: "Dar y quitar accesos, suspender, cambiar ubicación" },
  { clave: "roles", grupo: "Gestión", nombre: "Roles y accesos", incluye: "Crear roles y asignarlos" },
  // ADR-0195 F1 (20260924210000): nació sin rol y «solo líder por ahora». Delegable desde el ADR-0253 (20260928220000):
  // con el módulo se hace todo lo del líder en sus pestañas, de todas las tiendas y de la empresa (`fn_puede_configurar`).
  { clave: "configuracion", grupo: "Gestión", nombre: "Configuración", incluye: "Metas de venta y fondo de caja de cada tienda, lo que cambia cada campaña en la caja, cuentas y cobros, gastos fijos, presupuesto y parámetros tributarios, de todas las tiendas" },
  // ADR-0195 F2 (20260924235100): nace sin rol; delegable (sus funciones preguntan por el módulo, no por el líder).
  // Con el módulo, una cuenta ve y registra los gastos de SU tienda; el líder, los de todas y los «de la empresa».
  { clave: "gastos", grupo: "Finanzas", nombre: "Gastos", incluye: "Registrar y anular los gastos de su tienda (luz, alquiler, movilidad) con o sin factura, sus gastos fijos del mes y sus activos fijos, y decir qué fue cada salida de plata del cajón" },
  // ADR-0195 (20260925100000): los que faltan de Finanzas, dados de alta juntos antes de construir F3–F10. Nacen sin rol.
  // Cuentas y dinero y Reportes son delegables (con el módulo, su tienda). Impuestos y Cierre de mes nacieron del líder y
  // se abrieron con el ADR-0253 (20260928220000): son de CAYLA entera, así que quien los tiene los ve como el líder.
  { clave: "cuentas_dinero", grupo: "Finanzas", nombre: "Cuentas y dinero", incluye: "Ver las cuentas y el efectivo de su tienda; registrar depósitos del cajón al banco, abonos de tarjeta y movimientos entre cuentas; ver lo que se debe y cuándo vence" },
  { clave: "reportes_financieros", grupo: "Finanzas", nombre: "Reportes financieros", incluye: "Ver el resumen, el estado de resultados, el flujo de caja y el balance de su tienda; cómo rindieron las campañas" },
  { clave: "impuestos", grupo: "Finanzas", nombre: "Impuestos", incluye: "Ver el IGV del mes de CAYLA entera (ventas contra compras), la alerta del límite de ventas del régimen y bajar el reporte para el contador" },
  { clave: "cierre_mes", grupo: "Finanzas", nombre: "Cierre de mes", incluye: "Cerrar el mes de cada tienda y de la empresa, y reabrirlo con motivo, viendo los números de todas las tiendas" },
  // ADR-0207 (20260926090000): el historial de cada módulo. No es una pantalla del lateral: se abre desde la cabecera
  // (botón «Actividad»). Nace sin rol; con el módulo, una cuenta ve la actividad de SU tienda; el líder, la de todas.
  // Solo para personas (`MODULOS_SOLO_PERSONAS`): una terminal compartida no revisa lo que hacen las demás.
  { clave: "actividad", grupo: "Gestión", nombre: "Actividad", incluye: "Ver quién hizo qué en cada módulo de su tienda: ventas, caja, cambios, apartados, existencias, conteos, traslados, productos, colaboradores, roles y configuración, con fecha, hora y persona" },
  // ADR-0275 (20260929140000, Felipe 2026-09-28): la vista de toda la empresa, desde el selector de sede. Excepción a «un
  // módulo nuevo nace visible para el líder»: nace QUITADO al Líder de equipo (`lider_modulos_ocultos`), así que al nacer
  // solo la ve el Admin, y solo un Admin la da (`fn_exigir_modulos_dentro_de_lo_mio`). Qué se usa ahí: `lib/vista-global.ts`.
  { clave: "cayla_global", grupo: "Gestión", nombre: "CAYLA Global", incluye: "Ver CAYLA como una sola empresa: las tiendas, el Taller y la empresa juntos, qué tan sano está el negocio y qué conviene decidir; desde el selector de sede" },
  // ADR-0219 (20260929160000, las 20 decisiones de Felipe del 2026-09-26): las ventas de cada persona del
  // mes, para reconocer y acompañar — sin comisión ni bono (D-65, D-112). Nace sin rol (ADR-0161): solo la ve
  // el líder hasta que Felipe se la da al rol de las encargadas. Solo para personas (`MODULOS_SOLO_PERSONAS`):
  // una terminal compartida no revisa el desempeño de nadie.
  { clave: "rendimiento", grupo: "Gestión", nombre: "Rendimiento", incluye: "Ver las ventas de cada persona del equipo en el mes: quién vende más por hora trabajada y quién cierra más ventas, y la ficha de cada quien" },
];

/** Lo que sigue siendo del líder aunque el rol vea el módulo: decisiones ya tomadas (ADR-0161 B2b), no nuevas.
 *  «Ver costos, márgenes y montos de Compras» (ADR-0126) SALIÓ de esta lista el 2026-09-22 (Felipe): los montos los ve
 *  quien tenga Facturas de compra, Por pagar o Notas de crédito (migración 20260923130000). «Poner etiquetas con descuento a
 *  una prenda» SALIÓ el 2026-09-30 (Felipe, ADR-0293): quien crea la prenda la etiqueta como quiera y quien tiene Etiquetas
 *  configura el descuento (migración 20261001130000). */
export const SIEMPRE_SOLO_LIDER: readonly { que: string; origen: string }[] = [
  { que: "Anular una venta o un comprobante, y las series de SUNAT", origen: "ADR-0150, decisión 4" },
  { que: "Autorizar un descuento por encima del tope (a una persona; la terminal no tiene tope)", origen: "D-67" },
  { que: "Aprobar o rechazar devoluciones", origen: "ADR-0160" },
  { que: "Decidir a qué grupo del plan del piso va cada categoría (el módulo Plan del piso solo deja ver la propuesta)", origen: "ADR-0329, decisión 4" },
  // Colaboradores, y Roles y accesos, SALIERON de esta lista el 2026-09-22 (Felipe, 20260923131000). Lo que queda del
  // líder dentro de ellos son las protecciones mínimas de esa migración («decisión de arquitectura, revisable»):
  // ADR-0178 (Felipe, 2026-09-23): entre líderes manda el ADMIN, que se lee de Dynamic (admin allá + Líder aquí).
  { que: "Subir a alguien a Líder de equipo; cambiarle el rol o la sede, quitar, suspender o reactivar a un líder: solo un Admin (admin en Dynamic)", origen: "ADR-0178" },
  { que: "Siempre queda al menos un líder y un admin activos, y nadie se cambia su propio rol", origen: "ADR-0161 y ADR-0178" },
  { que: "Sin ser líder, solo se dan los módulos que uno mismo ve, y no se editan los del propio rol", origen: "ADR-0178" },
  // Las 6 decisiones (Felipe, 2026-09-22, migración 20260923140000):
  { que: "Ver el costo y el stock de las otras sedes en Existencias (Análisis analiza solo su sede)", origen: "ADR-0161 P5" },
  { que: "Ver lo comprado por el Taller en la ficha de un proveedor", origen: "ADR-0161 P3" },
  { que: "Colaboradores, y Roles y accesos, nunca van en el rol de una terminal: solo se dan a personas", origen: "ADR-0161 P6" },
];

/** Los módulos que nacen QUITADOS al Líder de equipo (su migración los inserta en `lider_modulos_ocultos`): al nacer solo
 *  los ve el Admin (`fn_ve_modulo`). Espejo de la base, para lo que la web supone sin haberla leído (`modulosDeHoy`). */
export const NACEN_QUITADOS_AL_LIDER: readonly ClaveModulo[] = ["cayla_global"];

/** Los módulos que solo se dan a PERSONAS, nunca a una terminal (ADR-0161 P6, Felipe 2026-09-22; en la base,
 *  `fn_exigir_rol_de_terminal`, migración 20260923140000): un aparato compartido de mostrador no da ni quita accesos.
 *  «Actividad» se sumó con el ADR-0207 (20260926090000): tampoco revisa lo que hacen las demás. «CAYLA Global», con el
 *  ADR-0275 (20260929140000): un aparato fijo a una tienda no mira la empresa entera. */
export const MODULOS_SOLO_PERSONAS: readonly ClaveModulo[] = ["colaboradores", "roles", "actividad", "cayla_global", "rendimiento"];

export function esClaveModulo(x: string): x is ClaveModulo {
  return (CLAVES_MODULO as readonly string[]).includes(x);
}

/** Se puede encender en un rol a medida (ni «solo del líder» ni «solo líder por ahora»). */
export function esDelegable(m: Modulo): boolean {
  return !m.soloLider && !m.noDelegable;
}

/** Un módulo que ve la cuenta. `completo = false`: lo VE pero sin sus capacidades de escritura (el rol está
 *  `limitado_como_hoy`, ADR-0161 B2d pendiente). */
export type ModuloDeCuenta = { clave: ClaveModulo; completo: boolean };

/** El «tipo» que tenían las terminales antes de los roles (ADR-0160/0162). Ya no decide nada en la base
 *  (20260923040000); solo sirve para leer una base VIEJA que todavía lo devuelve en `fn_mi_terminal()`. */
export type TipoTerminalLegado = "ventas" | "administrativa";
export const TIPOS_TERMINAL_LEGADO: readonly TipoTerminalLegado[] = ["ventas", "administrativa"];

/**
 * Lo que cada cuenta ve HOY, igual a la siembra de la migración (las claves son las de `retail.roles`, sin el prefijo
 * `terminal_`). Se usa solo si la base todavía no tiene `fn_mis_modulos()` (la web se publicó antes de pegar la
 * migración): la cuenta sigue viendo exactamente lo de antes.
 */
export const MODULOS_DE_HOY: Record<"integrante" | TipoTerminalLegado, readonly ModuloDeCuenta[]> = {
  integrante: (["vender", "caja", "cambios", "devoluciones", "historial", "clientas", "existencias", "conteos", "traslados", "movimientos", "productos", "atributos", "recibir", "produccion"] as const).map(
    (clave) => ({ clave, completo: false }),
  ),
  ventas: (["vender", "caja", "cambios", "devoluciones", "historial", "facturacion", "clientas"] as const).map((clave) => ({ clave, completo: true })),
  administrativa: (["existencias", "conteos", "traslados", "movimientos", "recibir", "productos", "atributos", "proveedores"] as const).map((clave) => ({
    clave,
    completo: true,
  })),
};

/** Sin `fn_mis_modulos()` en la base. `terminalLegado`: el tipo que devuelve una base VIEJA en `fn_mi_terminal()`; una
 *  terminal sin tipo reconocible no ve ningún módulo (falla cerrado: pierde poder, nunca lo gana). */
export function modulosDeHoy(
  rol: "lider" | "integrante",
  terminal: { legado: TipoTerminalLegado | null } | null = null,
): readonly ModuloDeCuenta[] {
  if (rol === "lider") return CLAVES_MODULO.filter((c) => !NACEN_QUITADOS_AL_LIDER.includes(c)).map((clave) => ({ clave, completo: true }));
  if (terminal) return terminal.legado ? MODULOS_DE_HOY[terminal.legado] : [];
  return MODULOS_DE_HOY.integrante;
}

/**
 * De los módulos que ve la cuenta a los permisos que preguntan las pantallas (`puede(persona, …)`). ESPEJA las
 * capacidades de la base (`fn_puede_*()` = líder o `fn_capacidad_por_modulos`), así pantalla y candado dicen lo mismo:
 *  - facturar               ← ve Facturación
 *  - gestionarCaja          ← ve Caja, completo
 *  - ajustarInventario      ← ve Existencias, Conteos o Traslados, completo (cerrar conteo/traslado con diferencia;
 *                             sigue así desde antes de ADR-0250, a propósito: no es el botón «Ajustar»)
 *  - ajustarStock           ← lo mismo que ajustarInventario (`fn_puede_ajustar_stock`, ADR-0306): el botón «Ajustar» de
 *                             Existencias, Productos y Movimientos. Ajustar stock es una función de Existencias, no un módulo.
 *  - editarCatalogo         ← ve Productos o Categorías/atributos, completo
 *  - editarCuentasProveedor ← ve Proveedores, completo (`fn_puede_editar_cuentas_proveedor`; desde 20260923140000, P3,
 *                             también dar de alta, editar y archivar proveedores y abrir su ficha: `fn_puede_gestionar_proveedores`)
 *  - verDineroCompras       ← ve Facturas de compra, Por pagar o Notas de crédito, completo
 *                             (`fn_puede_ver_dinero_de_compras`, 20260923130000). Solo VER: qué ESCRIBE cada uno lo dice
 *                             `accionesDeCompra` (P1, 20260923140000)
 *  - editarEtiquetas        ← ve Etiquetas, completo (`fn_puede_editar_etiquetas`; también las etiquetas CON descuento, ADR-0293)
 *  - analizar               ← ve Análisis, completo (`fn_puede_analizar`)
 *  - registrarGastos        ← ve Gastos, completo (`fn_gastos_ubicaciones`, ADR-0195 F2): los de SU tienda
 *  - verCuentasDinero       ← ve Cuentas y dinero, completo (ADR-0195 F3): las cuentas y el efectivo de SU tienda
 *  - verReportesFinancieros ← ve Reportes financieros, completo (ADR-0195 F5): los reportes de SU tienda
 *  - verImpuestos           ← ve Impuestos, completo (`fn_puede_ver_impuestos`, ADR-0253)
 *  - cerrarMes              ← ve Cierre de mes, completo (`fn_puede_cerrar_mes`, ADR-0253)
 * `administrar` y `verDinero` (el dinero del Taller y el Resumen de Producción) siguen siendo del líder: no salen de
 * ningún módulo delegable (`PERMISOS_SIN_MODULO`).
 *
 * El LÍDER (ADR-0253): tiene todos si ve todos los módulos; si un Admin le quitó alguno en Roles y accesos, pierde los
 * permisos que salen SOLO de lo quitado (como cualquier rol) y conserva los que no salen de ningún módulo. Lo que es
 * «siempre solo del líder» vive en la base (`fn_es_lider()`) y no depende de esto.
 */
export function permisosDeModulos(rol: "lider" | "integrante", modulos: readonly ModuloDeCuenta[]): readonly Permiso[] {
  if (rol === "lider") {
    if (CLAVES_MODULO.every((c) => modulos.some((m) => m.clave === c))) return PERMISOS;
    const deSusModulos = permisosDeModulos("integrante", modulos.map((m) => ({ clave: m.clave, completo: true })));
    return PERMISOS.filter((p) => PERMISOS_SIN_MODULO.includes(p) || deSusModulos.includes(p));
  }
  const ve = (c: ClaveModulo) => modulos.some((m) => m.clave === c);
  const completo = (...cs: ClaveModulo[]) => modulos.some((m) => m.completo && cs.includes(m.clave));
  const permisos: Permiso[] = [];
  if (completo("analisis")) permisos.push("analizar");
  if (ve("facturacion")) permisos.push("facturar");
  if (completo("caja")) permisos.push("gestionarCaja");
  if (completo("existencias", "conteos", "traslados")) permisos.push("ajustarInventario");
  if (completo("existencias", "conteos", "traslados")) permisos.push("ajustarStock");
  if (completo("productos", "atributos")) permisos.push("editarCatalogo");
  if (completo("proveedores")) permisos.push("editarCuentasProveedor");
  if (completo("facturas_compra", "por_pagar", "notas_credito")) permisos.push("verDineroCompras");
  if (completo("etiquetas")) permisos.push("editarEtiquetas");
  if (completo("gastos")) permisos.push("registrarGastos");
  if (completo("cuentas_dinero")) permisos.push("verCuentasDinero");
  if (completo("reportes_financieros")) permisos.push("verReportesFinancieros");
  if (completo("impuestos")) permisos.push("verImpuestos");
  if (completo("cierre_mes")) permisos.push("cerrarMes");
  return permisos;
}

/** Los permisos que no salen de ningún módulo: del líder, siempre (ADR-0253: quitarle módulos no se los quita). */
export const PERMISOS_SIN_MODULO: readonly Permiso[] = ["administrar", "verDinero"];

/**
 * ¿La cuenta USA este módulo? El líder, siempre; cualquier otra, si su rol lo ve COMPLETO (no `limitado_como_hoy`). Espeja
 * «`fn_es_lider()` o `fn_capacidad_por_modulos(array[clave])`», la forma de las capacidades de UN solo módulo. Existe para
 * lo que se decide módulo por módulo sin inventar un permiso por acción (ADR-0161 P1, 20260923140000: en Compras cada módulo
 * hace solo lo suyo —registrar/anular facturas, pagar, registrar notas de crédito— aunque los tres vean los montos).
 */
export function usaModulo(rol: "lider" | "integrante", modulos: readonly ModuloDeCuenta[], clave: ClaveModulo): boolean {
  return rol === "lider" || modulos.some((m) => m.clave === clave && m.completo);
}

/** Qué hace cada cuenta con un comprobante de compra (ADR-0161 P1): cada acción es de UN módulo. */
export type AccionesDeCompra = { facturas: boolean; pagar: boolean; notas: boolean };
export function accionesDeCompra(rol: "lider" | "integrante", modulos: readonly ModuloDeCuenta[]): AccionesDeCompra {
  return {
    facturas: usaModulo(rol, modulos, "facturas_compra"), // fn_puede_registrar_facturas_compra: registrar, anular, reparto, adjuntos
    pagar: usaModulo(rol, modulos, "por_pagar"), // fn_puede_pagar_compras: pagos y reembolsos
    notas: usaModulo(rol, modulos, "notas_credito"), // fn_puede_registrar_notas_credito
  };
}

/** Normaliza lo que devuelve `fn_mis_modulos()`: ignora claves que esta versión de la web no conoce. */
export function leerModulos(filas: readonly { clave: string; completo: boolean }[]): ModuloDeCuenta[] {
  return filas.filter((f) => esClaveModulo(f.clave)).map((f) => ({ clave: f.clave as ClaveModulo, completo: !!f.completo }));
}
