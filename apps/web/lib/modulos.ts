// Los módulos que un ROL puede ver (ADR-0150 retomado por el ADR-0161 B; migración 20260923030000_roles_por_modulo.sql).
//
// PROMETE: el catálogo de los 23 módulos (el mismo de `retail.modulos`, en el mismo orden), la lista fija de lo que es
// «siempre solo del líder», lo que cada cuenta ve HOY sin haber leído la base, y la traducción de «qué módulos ve esta
// cuenta» a los permisos semánticos que ya preguntan las pantallas (`permisosDeModulos`). Lógica pura: se importa desde el
// servidor y desde el cliente, y se prueba con `modulos.test.ts`.
//
// LA REGLA (Felipe, 2026-09-22): un rol decide solo «ve / no ve» por módulo. Quien ve un módulo hace todo lo que hay en
// él, salvo la lista `SIEMPRE_SOLO_LIDER`, que vive en cada función de la base con `fn_es_lider()`.

import { PERMISOS, type Permiso } from "./menu";

export const CLAVES_MODULO = [
  "vender", "caja", "cambios", "devoluciones", "historial", "facturacion", "clientas",
  "existencias", "conteos", "traslados", "movimientos",
  "productos", "atributos", "etiquetas",
  "facturas_compra", "recibir", "por_pagar", "proveedores", "notas_credito",
  "produccion",
  "analisis", "colaboradores", "roles",
  "configuracion",
] as const;
export type ClaveModulo = (typeof CLAVES_MODULO)[number];

export type Modulo = {
  clave: ClaveModulo;
  grupo: "Ventas" | "Inventario" | "Catálogo" | "Compras" | "Producción" | "Gestión";
  nombre: string;
  /** Lo que se da al encenderlo: quien ve el módulo hace todo esto. */
  incluye: string;
  /** Nunca se delega. Lo usaban Colaboradores y Roles y accesos (ADR-0150, decisión 3) hasta el 2026-09-22, cuando Felipe
   *  los abrió a cualquier rol (20260923131000). Hoy ningún módulo lo usa; queda por si uno nuevo nace así. */
  soloLider?: true;
  /** «Solo líder por ahora»: la base aún exige `fn_es_lider()` en sus funciones; encenderlo abriría una pantalla que
   *  falla al guardar. La base lo rechaza (`retail.modulos.delegable`). Desde 20260923130000 ningún módulo lo usa (los 5
   *  que lo tenían se abrieron); queda para el próximo módulo que nazca así. */
  noDelegable?: true;
};

/** Espejo de `retail.modulos`. `modulos.test.ts` compara esta lista con la siembra de la migración. */
export const MODULOS: readonly Modulo[] = [
  { clave: "vender", grupo: "Ventas", nombre: "Punto de venta", incluye: "Registrar ventas, descuento hasta su tope, dejar en espera, monto manual" },
  { clave: "caja", grupo: "Ventas", nombre: "Caja", incluye: "Abrir y cerrar caja, ingresos y egresos, ajustes de caja" },
  { clave: "cambios", grupo: "Ventas", nombre: "Cambios", incluye: "Registrar cambios de prenda" },
  { clave: "devoluciones", grupo: "Ventas", nombre: "Devoluciones", incluye: "Solicitar devoluciones" },
  { clave: "historial", grupo: "Ventas", nombre: "Historial de ventas", incluye: "Consultar, reimprimir y exportar" },
  { clave: "facturacion", grupo: "Ventas", nombre: "Facturación", incluye: "Emitir boletas, facturas y notas; reenviar a SUNAT" },
  { clave: "clientas", grupo: "Ventas", nombre: "Clientas", incluye: "Registrar, editar y archivar clientas; ver sus compras" },
  { clave: "existencias", grupo: "Inventario", nombre: "Existencias", incluye: "Consultar stock, ajustar stock, apartar prendas" },
  { clave: "conteos", grupo: "Inventario", nombre: "Conteos", incluye: "Iniciar, registrar y cerrar conteos" },
  { clave: "traslados", grupo: "Inventario", nombre: "Traslados", incluye: "Enviar, recibir, cancelar y cerrar con diferencia" },
  { clave: "movimientos", grupo: "Inventario", nombre: "Movimientos", incluye: "Consultar y exportar" },
  { clave: "productos", grupo: "Catálogo", nombre: "Productos", incluye: "Crear, editar y archivar prendas; precios, fotos y códigos" },
  { clave: "atributos", grupo: "Catálogo", nombre: "Categorías, marcas y atributos", incluye: "Crear, editar, desactivar y aprobar propuestas" },
  { clave: "etiquetas", grupo: "Catálogo", nombre: "Etiquetas", incluye: "Crear, editar y archivar etiquetas sin descuento" },
  { clave: "facturas_compra", grupo: "Compras", nombre: "Facturas de compra", incluye: "Registrar, corregir y anular facturas" },
  { clave: "recibir", grupo: "Compras", nombre: "Recibir mercadería", incluye: "Recibir envíos de proveedores" },
  { clave: "por_pagar", grupo: "Compras", nombre: "Por pagar", incluye: "Ver lo que se debe y registrar pagos" },
  { clave: "proveedores", grupo: "Compras", nombre: "Proveedores", incluye: "Crear, editar y archivar; cuentas bancarias, Yape y Plin" },
  { clave: "notas_credito", grupo: "Compras", nombre: "Notas de crédito", incluye: "Registrar y anular notas" },
  { clave: "produccion", grupo: "Producción", nombre: "Órdenes de producción", incluye: "Crear, editar y cancelar órdenes; registrar avance" },
  { clave: "analisis", grupo: "Gestión", nombre: "Análisis", incluye: "Reportes de ventas e inventario" },
  { clave: "colaboradores", grupo: "Gestión", nombre: "Colaboradores", incluye: "Dar y quitar accesos, suspender, cambiar ubicación" },
  { clave: "roles", grupo: "Gestión", nombre: "Roles y accesos", incluye: "Crear roles y asignarlos" },
  // ADR-0195 F1 (20260924210000): nace sin rol y «solo líder por ahora»: sus funciones exigen fn_es_lider().
  { clave: "configuracion", grupo: "Gestión", nombre: "Configuración", incluye: "Metas de venta y fondo de caja de cada tienda, y lo que cambia cada campaña en la caja", noDelegable: true },
];

/** Lo que sigue siendo del líder aunque el rol vea el módulo: decisiones ya tomadas (ADR-0161 B2b), no nuevas.
 *  «Ver costos, márgenes y montos de Compras» (ADR-0126) SALIÓ de esta lista el 2026-09-22 (Felipe): los montos los ve
 *  quien tenga Facturas de compra, Por pagar o Notas de crédito (migración 20260923130000). */
export const SIEMPRE_SOLO_LIDER: readonly { que: string; origen: string }[] = [
  { que: "Anular una venta o un comprobante, y las series de SUNAT", origen: "ADR-0150, decisión 4" },
  { que: "Autorizar un descuento por encima del tope (a una persona; la terminal no tiene tope)", origen: "D-67" },
  { que: "Aprobar o rechazar devoluciones", origen: "ADR-0160" },
  { que: "Poner etiquetas con descuento a una prenda", origen: "ADR-0160" },
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

/** Los módulos que solo se dan a PERSONAS, nunca a una terminal (ADR-0161 P6, Felipe 2026-09-22; en la base,
 *  `fn_exigir_rol_de_terminal`, migración 20260923140000): un aparato compartido de mostrador no da ni quita accesos. */
export const MODULOS_SOLO_PERSONAS: readonly ClaveModulo[] = ["colaboradores", "roles"];

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
  if (rol === "lider") return CLAVES_MODULO.map((clave) => ({ clave, completo: true }));
  if (terminal) return terminal.legado ? MODULOS_DE_HOY[terminal.legado] : [];
  return MODULOS_DE_HOY.integrante;
}

/**
 * De los módulos que ve la cuenta a los permisos que preguntan las pantallas (`puede(persona, …)`). ESPEJA las
 * capacidades de la base (`fn_puede_*()` = líder o `fn_capacidad_por_modulos`), así pantalla y candado dicen lo mismo:
 *  - facturar               ← ve Facturación
 *  - gestionarCaja          ← ve Caja, completo
 *  - ajustarInventario      ← ve Existencias, Conteos o Traslados, completo
 *  - editarCatalogo         ← ve Productos o Categorías/atributos, completo
 *  - editarCuentasProveedor ← ve Proveedores, completo (`fn_puede_editar_cuentas_proveedor`; desde 20260923140000, P3,
 *                             también dar de alta, editar y archivar proveedores y abrir su ficha: `fn_puede_gestionar_proveedores`)
 *  - verDineroCompras       ← ve Facturas de compra, Por pagar o Notas de crédito, completo
 *                             (`fn_puede_ver_dinero_de_compras`, 20260923130000). Solo VER: qué ESCRIBE cada uno lo dice
 *                             `accionesDeCompra` (P1, 20260923140000)
 *  - editarEtiquetas        ← ve Etiquetas, completo (`fn_puede_editar_etiquetas`; las etiquetas CON descuento no)
 *  - analizar               ← ve Análisis, completo (`fn_puede_analizar`)
 * `administrar` y `verDinero` (el dinero del Taller y el Resumen de Producción) siguen siendo del líder: no salen de
 * ningún módulo delegable.
 */
export function permisosDeModulos(rol: "lider" | "integrante", modulos: readonly ModuloDeCuenta[]): readonly Permiso[] {
  if (rol === "lider") return PERMISOS;
  const ve = (c: ClaveModulo) => modulos.some((m) => m.clave === c);
  const completo = (...cs: ClaveModulo[]) => modulos.some((m) => m.completo && cs.includes(m.clave));
  const permisos: Permiso[] = [];
  if (completo("analisis")) permisos.push("analizar");
  if (ve("facturacion")) permisos.push("facturar");
  if (completo("caja")) permisos.push("gestionarCaja");
  if (completo("existencias", "conteos", "traslados")) permisos.push("ajustarInventario");
  if (completo("productos", "atributos")) permisos.push("editarCatalogo");
  if (completo("proveedores")) permisos.push("editarCuentasProveedor");
  if (completo("facturas_compra", "por_pagar", "notas_credito")) permisos.push("verDineroCompras");
  if (completo("etiquetas")) permisos.push("editarEtiquetas");
  return permisos;
}

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
