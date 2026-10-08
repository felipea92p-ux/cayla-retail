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
import {
  GUIA_CAJA,
  GUIA_CAMBIOS,
  GUIA_COMPROBANTES_MES,
  GUIA_DEVOLUCIONES,
  GUIA_HISTORIAL_CIERRES,
  GUIA_POR_ENVIAR,
  GUIA_PROFORMAS,
  GUIA_SERIES,
} from "./pantallas/ventas-posventa";
import {
  GUIA_ANALISIS,
  GUIA_BAJAR_AL_PISO,
  GUIA_CONTEO,
  GUIA_CONTEO_CONFIRMAR,
  GUIA_CONTEO_DETALLE,
  GUIA_CONTEO_REVISAR,
  GUIA_CUADRAR_PISO,
  GUIA_EXISTENCIAS,
  GUIA_FRESCURA,
  GUIA_MOVIMIENTOS,
  GUIA_NUEVO_TRASLADO,
  GUIA_PEDIDOS_NO_ATENDIDOS,
  GUIA_POR_REGULARIZAR,
  GUIA_RECIBIR,
  GUIA_TRASLADO,
  GUIA_TRASLADOS,
} from "./pantallas/inventario";
import {
  GUIA_ATRIBUTOS,
  GUIA_CATEGORIAS,
  GUIA_EDITAR_PRODUCTO,
  GUIA_FAMILIAS,
  GUIA_HISTORIAL_PRENDA,
  GUIA_MARCAS,
  GUIA_NUEVO_PRODUCTO,
  GUIA_PRODUCTOS,
} from "./pantallas/catalogo";
import { GUIA_FACTURA, GUIA_FACTURAS, GUIA_MI_PARTE, GUIA_NOTAS_CREDITO, GUIA_NUEVA_FACTURA, GUIA_PLAN_CAMPANA, GUIA_POR_PAGAR, GUIA_PROVEEDOR, GUIA_PROVEEDORES } from "./pantallas/compras";
import {
  GUIA_FIN_BALANCE,
  GUIA_FIN_CAMPANAS,
  GUIA_FIN_CIERRE,
  GUIA_FIN_CONCILIACION,
  GUIA_FIN_CUENTAS,
  GUIA_FIN_EFECTIVO,
  GUIA_FIN_ESCENARIOS,
  GUIA_FIN_FLUJO,
  GUIA_FIN_GASTOS,
  GUIA_FIN_IMPUESTOS,
  GUIA_FIN_POR_PAGAR,
  GUIA_FIN_PRESUPUESTO,
  GUIA_FIN_RESULTADOS,
  GUIA_FIN_RESUMEN,
} from "./pantallas/finanzas";
import {
  GUIA_PROD_COTIZACIONES,
  GUIA_PROD_EFICIENCIA,
  GUIA_PROD_FACTURAS,
  GUIA_PROD_INSUMOS,
  GUIA_PROD_ORDENES,
  GUIA_PROD_POR_PAGAR,
  GUIA_PROD_PROVEEDORES,
  GUIA_PROD_RECIBIR,
  GUIA_PROD_RESUMEN,
} from "./pantallas/produccion";
import type { Guia } from "./tipos";

export type PantallaConGuia =
  | { estado: "aplicada"; guia: string }
  | { estado: "no-aplica"; motivo: string }
  | { estado: "pendiente" };

/** Todas las guías que existen. El motor busca aquí la de la pantalla abierta (`guiaDeRuta`). */
export const GUIAS: readonly Guia[] = [
  GUIA_PUNTO_DE_VENTA,
  GUIA_APARTADOS,
  GUIA_HISTORIAL,
  GUIA_COMPROBANTES,
  GUIA_COMPROBANTES_MES,
  GUIA_POR_ENVIAR,
  GUIA_PROFORMAS,
  GUIA_SERIES,
  GUIA_CAJA,
  GUIA_HISTORIAL_CIERRES,
  GUIA_CAMBIOS,
  GUIA_DEVOLUCIONES,
  GUIA_EXISTENCIAS,
  GUIA_BAJAR_AL_PISO,
  GUIA_CUADRAR_PISO,
  GUIA_FRESCURA,
  GUIA_MOVIMIENTOS,
  GUIA_POR_REGULARIZAR,
  GUIA_ANALISIS,
  GUIA_PEDIDOS_NO_ATENDIDOS,
  GUIA_CONTEO,
  GUIA_CONTEO_DETALLE,
  GUIA_CONTEO_REVISAR,
  GUIA_CONTEO_CONFIRMAR,
  GUIA_TRASLADOS,
  GUIA_TRASLADO,
  GUIA_NUEVO_TRASLADO,
  GUIA_RECIBIR,
  GUIA_PRODUCTOS,
  GUIA_EDITAR_PRODUCTO,
  GUIA_HISTORIAL_PRENDA,
  GUIA_ATRIBUTOS,
  GUIA_CATEGORIAS,
  GUIA_FAMILIAS,
  GUIA_MARCAS,
  GUIA_NUEVO_PRODUCTO,
  GUIA_FACTURAS,
  GUIA_FACTURA,
  GUIA_POR_PAGAR,
  GUIA_NOTAS_CREDITO,
  GUIA_PROVEEDORES,
  GUIA_PROVEEDOR,
  GUIA_NUEVA_FACTURA,
  GUIA_MI_PARTE,
  GUIA_PLAN_CAMPANA,
  GUIA_FIN_RESUMEN,
  GUIA_FIN_GASTOS,
  GUIA_FIN_CUENTAS,
  GUIA_FIN_EFECTIVO,
  GUIA_FIN_POR_PAGAR,
  GUIA_FIN_CONCILIACION,
  GUIA_FIN_RESULTADOS,
  GUIA_FIN_PRESUPUESTO,
  GUIA_FIN_CAMPANAS,
  GUIA_FIN_ESCENARIOS,
  GUIA_FIN_FLUJO,
  GUIA_FIN_BALANCE,
  GUIA_FIN_IMPUESTOS,
  GUIA_FIN_CIERRE,
  GUIA_PROD_RESUMEN,
  GUIA_PROD_ORDENES,
  GUIA_PROD_INSUMOS,
  GUIA_PROD_RECIBIR,
  GUIA_PROD_PROVEEDORES,
  GUIA_PROD_FACTURAS,
  GUIA_PROD_POR_PAGAR,
  GUIA_PROD_COTIZACIONES,
  GUIA_PROD_EFICIENCIA,
];

/** Cuántas pantallas siguen `pendiente`. Baja a medida que se hacen; subir es romper la regla. */
export const PENDIENTES_HOY = 11;

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
  "/caja": { estado: "aplicada", guia: GUIA_CAJA.id },
  "/caja/historial": { estado: "aplicada", guia: GUIA_HISTORIAL_CIERRES.id },
  // ---- cambios ----
  "/cambios": { estado: "aplicada", guia: GUIA_CAMBIOS.id },
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
  "/compras": { estado: "aplicada", guia: GUIA_FACTURAS.id },
  "/compras/@modal/(.)factura/[compraId]": { estado: "no-aplica", motivo: "La misma vista que /compras/factura/[compraId] abierta como hoja: comparte su guía." },
  "/compras/@modal/[...catchAll]": { estado: "no-aplica", motivo: "Ruta técnica de una ranura paralela: devuelve vacío para cerrar el modal, no dibuja nada." },
  "/compras/factura/[compraId]": { estado: "aplicada", guia: GUIA_FACTURA.id },
  "/compras/notas-credito": { estado: "aplicada", guia: GUIA_NOTAS_CREDITO.id },
  "/compras/nueva": { estado: "aplicada", guia: GUIA_NUEVA_FACTURA.id },
  "/compras/parte/[compraId]": { estado: "aplicada", guia: GUIA_MI_PARTE.id },
  "/compras/plan": { estado: "aplicada", guia: GUIA_PLAN_CAMPANA.id },
  "/compras/por-pagar": { estado: "aplicada", guia: GUIA_POR_PAGAR.id },
  "/compras/proveedores": { estado: "aplicada", guia: GUIA_PROVEEDORES.id },
  "/compras/proveedores/[id]": { estado: "aplicada", guia: GUIA_PROVEEDOR.id },
  // ---- configuracion ----
  "/configuracion": PENDIENTE,
  // ---- devoluciones ----
  "/devoluciones": { estado: "aplicada", guia: GUIA_DEVOLUCIONES.id },
  // ---- etiquetas-de-precio ----
  "/etiquetas-de-precio": { estado: "no-aplica", motivo: "Hoja de impresión de etiquetas: se revisa y se imprime, no hay piezas que recorrer." },
  // ---- finanzas ----
  "/finanzas": { estado: "no-aplica", motivo: "Solo redirige: lleva a Finanzas ▸ Resumen o a Gastos según lo que la cuenta ve. La guía es la de la pantalla a la que llega." },
  "/finanzas/cierre": { estado: "aplicada", guia: GUIA_FIN_CIERRE.id },
  "/finanzas/dinero": { estado: "aplicada", guia: GUIA_FIN_CUENTAS.id },
  "/finanzas/dinero/conciliacion": { estado: "aplicada", guia: GUIA_FIN_CONCILIACION.id },
  "/finanzas/dinero/efectivo": { estado: "aplicada", guia: GUIA_FIN_EFECTIVO.id },
  "/finanzas/dinero/por-pagar": { estado: "aplicada", guia: GUIA_FIN_POR_PAGAR.id },
  "/finanzas/gastos": { estado: "aplicada", guia: GUIA_FIN_GASTOS.id },
  "/finanzas/impuestos": { estado: "aplicada", guia: GUIA_FIN_IMPUESTOS.id },
  "/finanzas/reportes": { estado: "aplicada", guia: GUIA_FIN_RESULTADOS.id },
  "/finanzas/reportes/balance": { estado: "aplicada", guia: GUIA_FIN_BALANCE.id },
  "/finanzas/reportes/campanas": { estado: "aplicada", guia: GUIA_FIN_CAMPANAS.id },
  "/finanzas/reportes/escenarios": { estado: "aplicada", guia: GUIA_FIN_ESCENARIOS.id },
  "/finanzas/reportes/flujo": { estado: "aplicada", guia: GUIA_FIN_FLUJO.id },
  "/finanzas/reportes/presupuesto": { estado: "aplicada", guia: GUIA_FIN_PRESUPUESTO.id },
  "/finanzas/resumen": { estado: "aplicada", guia: GUIA_FIN_RESUMEN.id },
  // ---- global ----
  "/global": PENDIENTE,
  "/global/elige-sede": { estado: "no-aplica", motivo: "Un paso de paso: pide elegir la sede y vuelve; lo explica la guía de la pantalla de donde se viene." },
  // ---- inventario ----
  "/inventario": { estado: "aplicada", guia: GUIA_EXISTENCIAS.id },
  "/inventario/bajar": { estado: "aplicada", guia: GUIA_BAJAR_AL_PISO.id },
  "/inventario/conteo": { estado: "aplicada", guia: GUIA_CONTEO.id },
  "/inventario/conteo/[id]": { estado: "aplicada", guia: GUIA_CONTEO_DETALLE.id },
  "/inventario/conteo/[id]/confirmar": { estado: "aplicada", guia: GUIA_CONTEO_CONFIRMAR.id },
  "/inventario/conteo/[id]/revisar": { estado: "aplicada", guia: GUIA_CONTEO_REVISAR.id },
  "/inventario/cuadrar": { estado: "aplicada", guia: GUIA_CUADRAR_PISO.id },
  "/inventario/frescura": { estado: "aplicada", guia: GUIA_FRESCURA.id },
  "/inventario/mover": { estado: "no-aplica", motivo: "Solo redirige a Traslados ▸ Nuevo con lo que traía la dirección vieja. La guía es la de Nuevo traslado." },
  "/inventario/movimientos": { estado: "aplicada", guia: GUIA_MOVIMIENTOS.id },
  "/inventario/por-regularizar": { estado: "aplicada", guia: GUIA_POR_REGULARIZAR.id },
  "/inventario/resumen": { estado: "aplicada", guia: GUIA_ANALISIS.id },
  "/inventario/traslados/(billetera)": { estado: "aplicada", guia: GUIA_TRASLADOS.id },
  "/inventario/traslados/(billetera)/[id]": { estado: "aplicada", guia: GUIA_TRASLADO.id },
  "/inventario/traslados/guia/[id]": { estado: "no-aplica", motivo: "Hoja de impresión de la guía de un traslado: se imprime y viaja con la mercadería." },
  "/inventario/traslados/nuevo": { estado: "aplicada", guia: GUIA_NUEVO_TRASLADO.id },
  // ---- movimientos ----
  "/movimientos": { estado: "no-aplica", motivo: "Solo redirige a Inventario ▸ Movimientos (la dirección vieja). La guía es la de esa pantalla." },
  // ---- pedidos-no-atendidos ----
  "/pedidos-no-atendidos": { estado: "aplicada", guia: GUIA_PEDIDOS_NO_ATENDIDOS.id },
  // ---- produccion ----
  "/produccion": { estado: "aplicada", guia: GUIA_PROD_RESUMEN.id },
  "/produccion/comprobantes": { estado: "aplicada", guia: GUIA_PROD_FACTURAS.id },
  "/produccion/cotizaciones-maquila": { estado: "aplicada", guia: GUIA_PROD_COTIZACIONES.id },
  "/produccion/eficiencia": { estado: "aplicada", guia: GUIA_PROD_EFICIENCIA.id },
  "/produccion/insumos": { estado: "aplicada", guia: GUIA_PROD_INSUMOS.id },
  "/produccion/ordenes": { estado: "aplicada", guia: GUIA_PROD_ORDENES.id },
  "/produccion/por-pagar": { estado: "aplicada", guia: GUIA_PROD_POR_PAGAR.id },
  "/produccion/proveedores": { estado: "aplicada", guia: GUIA_PROD_PROVEEDORES.id },
  "/produccion/recibir": { estado: "aplicada", guia: GUIA_PROD_RECIBIR.id },
  // ---- productos ----
  "/productos": { estado: "aplicada", guia: GUIA_PRODUCTOS.id },
  "/productos/@modal/(.)[id]/historial": { estado: "no-aplica", motivo: "La misma vista que /productos/[id]/historial abierta como hoja: comparte su guía." },
  "/productos/@modal/[...catchAll]": { estado: "no-aplica", motivo: "Ruta técnica de una ranura paralela: devuelve vacío para cerrar el modal, no dibuja nada." },
  "/productos/[id]/editar": { estado: "aplicada", guia: GUIA_EDITAR_PRODUCTO.id },
  "/productos/[id]/historial": { estado: "aplicada", guia: GUIA_HISTORIAL_PRENDA.id },
  "/productos/atributos": { estado: "aplicada", guia: GUIA_ATRIBUTOS.id },
  "/productos/categorias": { estado: "aplicada", guia: GUIA_CATEGORIAS.id },
  "/productos/familias": { estado: "aplicada", guia: GUIA_FAMILIAS.id },
  "/productos/marcas": { estado: "aplicada", guia: GUIA_MARCAS.id },
  "/productos/nuevo": { estado: "aplicada", guia: GUIA_NUEVO_PRODUCTO.id },
  // ---- recibir ----
  "/recibir": { estado: "aplicada", guia: GUIA_RECIBIR.id },
  // ---- rendimiento ----
  "/rendimiento": PENDIENTE,
  // ---- sin-acceso ----
  "/sin-acceso": { estado: "no-aplica", motivo: "Un mensaje de una línea («no tienes acceso a esta pantalla»): no hay nada que enseñar." },
  // ---- vender ----
  "/vender": { estado: "aplicada", guia: GUIA_PUNTO_DE_VENTA.id },
  "/vender/apartados": { estado: "aplicada", guia: GUIA_APARTADOS.id },
  "/vender/comprobantes": { estado: "aplicada", guia: GUIA_COMPROBANTES.id },
  "/vender/comprobantes/emitidos": { estado: "aplicada", guia: GUIA_COMPROBANTES_MES.id },
  "/vender/comprobantes/por-reintentar": { estado: "aplicada", guia: GUIA_POR_ENVIAR.id },
  "/vender/comprobantes/proformas": { estado: "aplicada", guia: GUIA_PROFORMAS.id },
  "/vender/comprobantes/series": { estado: "aplicada", guia: GUIA_SERIES.id },
  "/vender/historial": { estado: "aplicada", guia: GUIA_HISTORIAL.id },
};
