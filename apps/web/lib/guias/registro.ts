// Registro de las GUÍAS INTERACTIVAS por pantalla (ADR-0362, Felipe 2026-10-07). Es, a la vez, cómo se vigila y el tablero del
// despliegue módulo por módulo: `lib/guias.test.ts` exige que CADA `page.tsx` de `app/(app)` esté aquí con uno de tres estados.
//
//   aplicada   la pantalla tiene su guía (`guia`: su clave en `GUIAS`). La prueba comprueba que cada ancla de cada paso existe en el
//              código, y que la «huella de controles» de la pantalla (`guias/huellas/`) está al día: si nace un botón o un campo
//              que la guía no explica ni descarta, falla (Felipe eligió el candado «por controles»).
//   no-aplica  no hay nada que enseñar (una ruta técnica, una hoja de impresión, un mensaje). `motivo` en palabras del negocio.
//   pendiente  DEUDA de las pantallas hechas antes de la regla. Una pantalla NUEVA no puede nacer aquí: o trae su guía o dice por qué
//              no aplica. Al terminar una, se pasa a «aplicada» y se baja `PENDIENTES_HOY` (la cuenta es exacta: solo baja).

import { GUIA_APARTADOS, GUIA_COMPROBANTES, GUIA_HISTORIAL, GUIA_PUNTO_DE_VENTA } from "./pantallas/vender";
import type { Guia } from "./tipos";

export type PantallaConGuia =
  | { estado: "aplicada"; guia: string }
  | { estado: "no-aplica"; motivo: string }
  | { estado: "pendiente" };

/** Todas las guías que existen. El motor busca aquí la de la pantalla abierta (`guiaDeRuta`). */
export const GUIAS: readonly Guia[] = [GUIA_PUNTO_DE_VENTA, GUIA_APARTADOS, GUIA_HISTORIAL, GUIA_COMPROBANTES];

/** Cuántas pantallas siguen `pendiente`. Baja a medida que se hacen; subir es romper la regla. */
export const PENDIENTES_HOY = 78;

const PENDIENTE: PantallaConGuia = { estado: "pendiente" };

/** La ruta es la de la carpeta bajo `app/(app)`: «/» es Inicio y `[id]` se escribe tal cual. */
export const PANTALLAS: Record<string, PantallaConGuia> = {
  // ---- inicio ----
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
  "/clientas/avisos": PENDIENTE,
  "/clientas/cartel": { estado: "no-aplica", motivo: "Hoja de impresión del cartel del club: se revisa y se imprime, no hay piezas que recorrer." },
  // ---- colaboradores ----
  "/colaboradores": PENDIENTE,
  // ---- comercial ----
  "/comercial": PENDIENTE,
  "/comercial/calidad": PENDIENTE,
  // ---- compras ----
  "/compras": PENDIENTE,
  "/compras/@modal/(.)factura/[compraId]": { estado: "no-aplica", motivo: "La misma vista que /compras/factura/[compraId] abierta como hoja: comparte su guía." },
  "/compras/@modal/[...catchAll]": { estado: "no-aplica", motivo: "Ruta técnica de una ranura paralela: devuelve vacío para cerrar el modal, no dibuja nada." },
  "/compras/factura/[compraId]": PENDIENTE,
  "/compras/notas-credito": PENDIENTE,
  "/compras/nueva": PENDIENTE,
  "/compras/parte/[compraId]": PENDIENTE,
  "/compras/plan": PENDIENTE,
  "/compras/por-pagar": PENDIENTE,
  "/compras/proveedores": PENDIENTE,
  "/compras/proveedores/[id]": PENDIENTE,
  // ---- configuracion ----
  "/configuracion": PENDIENTE,
  // ---- devoluciones ----
  "/devoluciones": PENDIENTE,
  // ---- etiquetas-de-precio ----
  "/etiquetas-de-precio": { estado: "no-aplica", motivo: "Hoja de impresión de etiquetas: se revisa y se imprime, no hay piezas que recorrer." },
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
  "/global/elige-sede": { estado: "no-aplica", motivo: "Un paso de paso: pide elegir la sede y vuelve; lo explica la guía de la pantalla de donde se viene." },
  // ---- inventario ----
  "/inventario": PENDIENTE,
  "/inventario/bajar": PENDIENTE,
  "/inventario/conteo": PENDIENTE,
  "/inventario/conteo/[id]": PENDIENTE,
  "/inventario/conteo/[id]/confirmar": PENDIENTE,
  "/inventario/conteo/[id]/revisar": PENDIENTE,
  "/inventario/cuadrar": PENDIENTE,
  "/inventario/frescura": PENDIENTE,
  "/inventario/mover": PENDIENTE,
  "/inventario/movimientos": PENDIENTE,
  "/inventario/por-regularizar": PENDIENTE,
  "/inventario/resumen": PENDIENTE,
  "/inventario/traslados/(billetera)": PENDIENTE,
  "/inventario/traslados/(billetera)/[id]": PENDIENTE,
  "/inventario/traslados/guia/[id]": { estado: "no-aplica", motivo: "Hoja de impresión de la guía de un traslado: se imprime y viaja con la mercadería." },
  "/inventario/traslados/nuevo": PENDIENTE,
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
  "/productos/@modal/(.)[id]/historial": { estado: "no-aplica", motivo: "La misma vista que /productos/[id]/historial abierta como hoja: comparte su guía." },
  "/productos/@modal/[...catchAll]": { estado: "no-aplica", motivo: "Ruta técnica de una ranura paralela: devuelve vacío para cerrar el modal, no dibuja nada." },
  "/productos/[id]/editar": PENDIENTE,
  "/productos/[id]/historial": PENDIENTE,
  "/productos/atributos": PENDIENTE,
  "/productos/categorias": PENDIENTE,
  "/productos/familias": PENDIENTE,
  "/productos/marcas": PENDIENTE,
  "/productos/nuevo": PENDIENTE,
  // ---- recibir ----
  "/recibir": PENDIENTE,
  // ---- rendimiento ----
  "/rendimiento": PENDIENTE,
  // ---- sin-acceso ----
  "/sin-acceso": { estado: "no-aplica", motivo: "Un mensaje de una línea («no tienes acceso a esta pantalla»): no hay nada que enseñar." },
  // ---- vender ----
  "/vender": { estado: "aplicada", guia: GUIA_PUNTO_DE_VENTA.id },
  "/vender/apartados": { estado: "aplicada", guia: GUIA_APARTADOS.id },
  "/vender/comprobantes": { estado: "aplicada", guia: GUIA_COMPROBANTES.id },
  "/vender/comprobantes/emitidos": PENDIENTE,
  "/vender/comprobantes/por-reintentar": PENDIENTE,
  "/vender/comprobantes/proformas": PENDIENTE,
  "/vender/comprobantes/series": PENDIENTE,
  "/vender/historial": { estado: "aplicada", guia: GUIA_HISTORIAL.id },
};
