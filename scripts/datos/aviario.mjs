/**
 * El aviario — de qué pájaro es cada tabla del schema `retail`.
 *
 * La lista salió de `generar.mjs` (`DOMINIOS_RETAIL`, mapa V2 del 2026-09-15) sin cambiar
 * ninguna asignación: este archivo solo le da casa propia, para que el generador y
 * cualquier otra herramienta lean la misma lista en vez de copiarla.
 *
 * Los 14 pájaros son los de `docs/datos/07-GOBIERNO.md` §1. Quién LLEVA cada uno se
 * escribe allá, no acá: el pájaro es el puesto, la persona se apunta en ese archivo.
 */

export const AVIARIO = [
  { n: "01", pajaro: "Ganso", modulo: "Identidad y acceso",
    tablas: ["colaboradores", "ubicaciones", "sububicaciones", "ubicacion_datos_fiscales"] },
  { n: "02", pajaro: "Loro", modulo: "Catálogo y vocabulario",
    tablas: ["categorias", "productos", "variantes", "colores", "codigos_barras", "codigos_correlativos"] },
  { n: "03", pajaro: "Tucán", modulo: "Taxonomía universal", tablas: [] },
  { n: "04", pajaro: "Golondrina", modulo: "Importación de catálogo", tablas: [] },
  { n: "05", pajaro: "Halcón", modulo: "Inventario y movimientos",
    tablas: ["movimientos", "stock", "lotes", "transferencias", "transferencia_items"] },
  { n: "06", pajaro: "Lechuza", modulo: "Conteo y censo físico", tablas: ["conteos", "conteo_items"] },
  { n: "07", pajaro: "Colibrí", modulo: "Ventas y caja",
    tablas: ["cajas", "caja_movimientos", "ventas", "venta_items", "venta_pagos", "clientes", "codigos_descuento", "cambios", "devoluciones", "devolucion_items"] },
  // `proformas` vive en Ventas en 07-GOBIERNO.md (es la cotización del mostrador, no
  // viaja a SUNAT), pero se lista acá con Facturación porque comparte ciclo de vida.
  { n: "08", pajaro: "Cuervo", modulo: "Facturación SUNAT",
    tablas: ["series_comprobantes", "comprobantes", "proformas", "configuracion_empresa"] },
  { n: "09", pajaro: "Pelícano", modulo: "Compras y proveedores",
    tablas: ["proveedores", "compras", "compra_items", "compra_pagos", "compra_adjuntos", "compras_resumen", "compra_items_resumen"] },
  { n: "10", pajaro: "Gallito", modulo: "Producción del Taller", tablas: [] },
  { n: "11", pajaro: "Garza", modulo: "Finanzas operativas", tablas: [] },
  { n: "12", pajaro: "Urraca", modulo: "Contabilidad", tablas: ["activos_fijos"] },
  { n: "13", pajaro: "Águila", modulo: "Inteligencia y reportes", tablas: [] },
  { n: "14", pajaro: "Gorrión", modulo: "Plataforma y esquema", tablas: [] },
];
