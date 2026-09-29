// Registro de la GUÍA DE FOCO por pantalla (regla — CLAUDE.md «Guía de foco», ADR-0284, Felipe 2026-09-29).
//
// La regla: toda pantalla o modal donde alguien llena campos o avanza por pasos le dice, en el propio lugar, qué está hecho, qué
// sigue y qué falta (`components/alta-producto/guia.tsx`, `useGuiaAlta.ts`, `lib/alta-producto-guia.ts`; modelo de una ficha que se
// edita: `components/ficha-producto/TiraFicha.tsx`). Este archivo es cómo se vigila y, a la vez, el tablero del despliegue módulo por
// módulo: `lib/guia-de-foco.test.ts` exige que CADA `page.tsx` de `app/(app)` esté aquí con uno de tres estados.
//
//   aplicada   la pantalla ya tiene su guía. `evidencia`: los archivos que usan las piezas (la prueba los abre y busca el uso: no se
//              puede declarar «aplicada» sin haberla puesto).
//   no-aplica  no hay nada que llenar ni pasos que seguir (un mensaje, una lista de solo lectura, una ruta técnica). `motivo` en
//              palabras del negocio; sin motivo, la prueba falla.
//   pendiente  DEUDA de las pantallas hechas antes de la regla. Una pantalla NUEVA no puede nacer aquí: o trae su guía o declara por
//              qué no aplica. Al terminar una, se pasa a «aplicada» y se baja `PENDIENTES_HOY` (la prueba exige la cuenta exacta:
//              así el tablero no miente ni en un sentido ni en el otro).
//
// Un modal o un componente con campos no es una `page.tsx`: la prueba no lo ve, pero la regla vale igual (casilla del PR).

export type PantallaGuia =
  | { estado: "aplicada"; evidencia: readonly string[] }
  | { estado: "no-aplica"; motivo: string }
  | { estado: "pendiente" };

/** Lo que una pantalla «aplicada» tiene que usar: al menos una de estas piezas aparece en cada archivo de su evidencia. */
export const PIEZAS_DE_LA_GUIA = ["MarcaCampo", "ConMarca", "FaltanDelPaso", "TiraFicha", "EtiquetaAhora"] as const;

/** Cuántas pantallas siguen `pendiente`. Baja a medida que se hacen; subir es romper la regla (una pantalla nueva no nace pendiente). */
export const PENDIENTES_HOY = 80;

const PENDIENTE: PantallaGuia = { estado: "pendiente" };

/** La ruta es la de la carpeta bajo `app/(app)`: «/» es Inicio y `[id]` se escribe tal cual. */
export const PANTALLAS: Record<string, PantallaGuia> = {
  // ---- Inicio ----
  "/": PENDIENTE,
  // ---- actividad ----
  "/actividad": PENDIENTE,
  // ---- buscar ----
  "/buscar": PENDIENTE,
  // ---- caja ----
  "/caja": PENDIENTE,
  "/caja/historial": PENDIENTE,
  // ---- cambios ----
  "/cambios": PENDIENTE,
  // ---- clientas ----
  "/clientas": PENDIENTE,
  // ---- colaboradores ----
  "/colaboradores": PENDIENTE,
  // ---- comercial ----
  "/comercial": PENDIENTE,
  "/comercial/calidad": PENDIENTE,
  // ---- compras ----
  "/compras": PENDIENTE,
  "/compras/@modal/(.)factura/[compraId]": PENDIENTE,
  "/compras/@modal/[...catchAll]": { estado: "no-aplica", motivo: "Ruta técnica de una ranura paralela: devuelve vacío para cerrar el modal, no dibuja nada." },
  "/compras/factura/[compraId]": PENDIENTE,
  "/compras/notas-credito": PENDIENTE,
  "/compras/nueva": PENDIENTE,
  "/compras/parte/[compraId]": PENDIENTE,
  "/compras/por-pagar": PENDIENTE,
  "/compras/proveedores": PENDIENTE,
  "/compras/proveedores/[id]": PENDIENTE,
  // ---- configuracion ----
  "/configuracion": PENDIENTE,
  // ---- devoluciones ----
  "/devoluciones": PENDIENTE,
  // ---- etiquetas-de-precio ----
  "/etiquetas-de-precio": PENDIENTE,
  // ---- finanzas ----
  "/finanzas": PENDIENTE,
  "/finanzas/cierre": PENDIENTE,
  "/finanzas/dinero": PENDIENTE,
  "/finanzas/dinero/conciliacion": PENDIENTE,
  "/finanzas/dinero/efectivo": PENDIENTE,
  "/finanzas/dinero/por-pagar": PENDIENTE,
  "/finanzas/gastos": PENDIENTE,
  "/finanzas/impuestos": PENDIENTE,
  "/finanzas/reportes": PENDIENTE,
  "/finanzas/reportes/balance": PENDIENTE,
  "/finanzas/reportes/campanas": PENDIENTE,
  "/finanzas/reportes/escenarios": PENDIENTE,
  "/finanzas/reportes/flujo": PENDIENTE,
  "/finanzas/reportes/presupuesto": PENDIENTE,
  "/finanzas/resumen": PENDIENTE,
  // ---- global ----
  "/global": PENDIENTE,
  "/global/elige-sede": PENDIENTE,
  // ---- inventario ----
  "/inventario": PENDIENTE,
  "/inventario/bajar": PENDIENTE,
  "/inventario/conteo": PENDIENTE,
  "/inventario/conteo/[id]": PENDIENTE,
  "/inventario/conteo/[id]/confirmar": PENDIENTE,
  "/inventario/conteo/[id]/revisar": PENDIENTE,
  "/inventario/frescura": PENDIENTE,
  "/inventario/mover": PENDIENTE,
  "/inventario/movimientos": PENDIENTE,
  "/inventario/recibir": PENDIENTE,
  "/inventario/resumen": PENDIENTE,
  "/inventario/traslados": PENDIENTE,
  "/inventario/traslados/[id]": PENDIENTE,
  // ---- movimientos ----
  "/movimientos": PENDIENTE,
  // ---- pedidos-no-atendidos ----
  "/pedidos-no-atendidos": PENDIENTE,
  // ---- produccion ----
  "/produccion": PENDIENTE,
  "/produccion/comprobantes": PENDIENTE,
  "/produccion/cotizaciones-maquila": PENDIENTE,
  "/produccion/eficiencia": PENDIENTE,
  "/produccion/insumos": PENDIENTE,
  "/produccion/ordenes": PENDIENTE,
  "/produccion/por-pagar": PENDIENTE,
  "/produccion/proveedores": PENDIENTE,
  "/produccion/recibir": PENDIENTE,
  // ---- productos ----
  "/productos": PENDIENTE,
  "/productos/@modal/(.)[id]/historial": PENDIENTE,
  "/productos/@modal/[...catchAll]": { estado: "no-aplica", motivo: "Ruta técnica de una ranura paralela: devuelve vacío para cerrar el modal, no dibuja nada." },
  "/productos/[id]/editar": { estado: "aplicada", evidencia: ["components/ProductoForm.tsx"] },
  "/productos/[id]/historial": PENDIENTE,
  "/productos/atributos": PENDIENTE,
  "/productos/categorias": PENDIENTE,
  "/productos/familias": PENDIENTE,
  "/productos/marcas": PENDIENTE,
  "/productos/nuevo": { estado: "aplicada", evidencia: ["components/NuevoProductoForm.tsx", "components/alta-producto/piezas.tsx"] },
  // ---- recibir ----
  "/recibir": PENDIENTE,
  // ---- rendimiento ----
  "/rendimiento": PENDIENTE,
  // ---- sin-acceso ----
  "/sin-acceso": { estado: "no-aplica", motivo: "Solo muestra un mensaje y un enlace: no hay campos ni pasos." },
  // ---- vender ----
  "/vender": PENDIENTE,
  "/vender/apartados": PENDIENTE,
  "/vender/comprobantes": PENDIENTE,
  "/vender/comprobantes/emitidos": PENDIENTE,
  "/vender/comprobantes/por-reintentar": PENDIENTE,
  "/vender/comprobantes/proformas": PENDIENTE,
  "/vender/comprobantes/series": PENDIENTE,
  "/vender/historial": PENDIENTE,
};
