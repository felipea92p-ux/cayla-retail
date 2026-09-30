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
export const PIEZAS_DE_LA_GUIA = ["MarcaCampo", "ConMarca", "FaltanDelPaso", "TiraFicha", "EtiquetaAhora", "CampoGuiado", "PieGuia", "useGuiaCampos"] as const;

/** Cuántas pantallas siguen `pendiente`. Baja a medida que se hacen; subir es romper la regla (una pantalla nueva no nace pendiente). */
export const PENDIENTES_HOY = 78;

const PENDIENTE: PantallaGuia = { estado: "pendiente" };

/** La ruta es la de la carpeta bajo `app/(app)`: «/» es Inicio y `[id]` se escribe tal cual. */
export const PANTALLAS: Record<string, PantallaGuia> = {
  // ---- Inicio ----
  "/": { estado: "no-aplica", motivo: "Panel de lectura: muestra lo que toca, lo nuevo y los accesos, sin campos que llenar ni pasos que seguir; su «Te toca» y «Sigue ahora» ya dicen qué sigue (Inicio de Almacén, ADR-0292). El único control parecido a un campo es la casilla «Ver N más»." },
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
  "/inventario/conteo": { estado: "aplicada", evidencia: ["components/AbrirConteo.tsx"] },
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

// ---------------------------------------------------------------------------------------------------------------------------------
// MODALES (ADR-0284, actualización f). Un MODAL es todo archivo bajo `components/` o `app/(app)/` que dibuja un `<Modal>`, un `<ModalRuta>`
// o un `Dialog.Content` y tiene campos. Igual que las pantallas, cada uno se declara aquí, y la prueba falla si aparece uno sin declarar.
// Dentro de un modal la guía ENCIENDE el control que sigue —caja de texto, combo, chips, interruptor, un grupo de cajas— con
// `useGuiaCampos` + `<CampoGuiado>` + `<PieGuia>` (`components/guia-de-foco/`); la clave es la ruta del archivo bajo `apps/web`.
// El comentario de cada `pendiente` dice cuántos controles trae: con UNO solo no hay camino que indicar y suele ser «no-aplica» (con motivo).
// Un archivo que es a la vez el formulario principal de una pantalla y dibuja un `<Modal>` cuenta como modal: sepáralo si hace falta.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Cuántos modales siguen `pendiente`. Baja a medida que se hacen; un modal nuevo no nace pendiente. */
export const MODALES_PENDIENTES_HOY = 89;

export const MODALES: Record<string, PantallaGuia> = {
  "components/AdjuntosCompra.tsx": PENDIENTE, // 3 controles
  "components/AjustarInventarioModal.tsx": PENDIENTE, // 6 controles
  "components/AnularVentaForm.tsx": PENDIENTE, // 4 controles
  "components/ApartadosModal.tsx": PENDIENTE, // 3 controles
  "components/ApartarModal.tsx": PENDIENTE, // 8 controles
  "components/BuscadorGlobal.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/CategoriasLista.tsx": PENDIENTE, // 14 controles
  "components/CerrarCajaModalV2.tsx": PENDIENTE, // 10 controles
  "components/CerrarFaltanteModal.tsx": PENDIENTE, // 5 controles
  "components/ClientaFichaModal.tsx": PENDIENTE, // 16 controles
  "components/ColaboradoresModales.tsx": PENDIENTE, // 14 controles
  "components/ColaboradoresPanel.tsx": PENDIENTE, // 3 controles
  "components/ColoresLista.tsx": PENDIENTE, // 17 controles
  "components/ComboResponsable.tsx": PENDIENTE, // 2 controles
  "components/CompraDetallePanel.tsx": PENDIENTE, // 8 controles
  "components/ComprobanteProduccionDetalle.tsx": PENDIENTE, // 2 controles
  "components/ComprobanteProduccionForm.tsx": PENDIENTE, // 13 controles
  "components/ComprobantesPanel.tsx": PENDIENTE, // 6 controles
  "components/ConfiguracionImpuestos.tsx": PENDIENTE, // 6 controles
  "components/ConfirmarConResponsable.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/ConfirmarTransmision.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/CotizacionesMaquilaPanel.tsx": PENDIENTE, // 6 controles
  "components/DetalleMuestraModal.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/EditarMarcaModal.tsx": PENDIENTE, // 5 controles
  "components/EliminarProductoModal.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/EtiquetasLista.tsx": PENDIENTE, // 7 controles
  "components/FamiliasLista.tsx": PENDIENTE, // 2 controles
  "components/FiltrosHistorialVentas.tsx": PENDIENTE, // 3 controles
  "components/FiltrosMovimientos.tsx": PENDIENTE, // 3 controles
  "components/GastosFijosYActivos.tsx": PENDIENTE, // 17 controles
  "components/GastosPanel.tsx": PENDIENTE, // 13 controles
  "components/InsumoModales.tsx": PENDIENTE, // 18 controles
  "components/MovimientoCajaModal.tsx": PENDIENTE, // 6 controles
  "components/NuevaClientaModal.tsx": { estado: "aplicada", evidencia: ["components/NuevaClientaModal.tsx"] },
  "components/NuevaOrdenProduccionForm.tsx": PENDIENTE, // 11 controles
  "components/NuevaProformaModal.tsx": PENDIENTE, // 10 controles
  "components/OrdenModales.tsx": PENDIENTE, // 4 controles
  "components/OrdenPanel.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/PagarComprobanteProduccionModal.tsx": PENDIENTE, // 3 controles
  "components/PagoJuntosModal.tsx": PENDIENTE, // 6 controles
  "components/PatronesLista.tsx": PENDIENTE, // 4 controles
  "components/PedidosEntreSedes.tsx": PENDIENTE, // 2 controles
  "components/PedirAOtraSedeModal.tsx": PENDIENTE, // 2 controles
  "components/PerfilModal.tsx": PENDIENTE, // 12 controles
  "components/PorRegularizarLista.tsx": PENDIENTE, // 3 controles
  "components/PrendaSinRegistrarModal.tsx": PENDIENTE, // 8 controles
  "components/PrendasDeEtiquetaModal.tsx": PENDIENTE, // 6 controles
  "components/ProductosGrilla.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/ProductosTabla.tsx": PENDIENTE, // 2 controles
  "components/ProveedorModal.tsx": PENDIENTE, // 13 controles
  "components/ProveedorProduccionModal.tsx": PENDIENTE, // 13 controles
  "components/PuntoDeVenta.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/PuntoDeVentaTicket.tsx": PENDIENTE, // 12 controles
  "components/ReasignarReparto.tsx": PENDIENTE, // 9 controles
  "components/RecepcionEnvio.tsx": PENDIENTE, // 16 controles
  "components/RecibirComprobanteModal.tsx": PENDIENTE, // 7 controles
  "components/RegistrarGastoModal.tsx": PENDIENTE, // 29 controles
  "components/RegistrarNotaCreditoModal.tsx": PENDIENTE, // 9 controles
  "components/ReponerPisoModal.tsx": PENDIENTE, // 4 controles
  "components/ResolverDanadosModal.tsx": PENDIENTE, // 4 controles
  "components/ResumenPrevioEnvio.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/RolesModales.tsx": PENDIENTE, // 17 controles
  "components/RolesPanel.tsx": PENDIENTE, // 5 controles
  "components/SaldoFavorAcciones.tsx": PENDIENTE, // 7 controles
  "components/SeriesPanel.tsx": PENDIENTE, // 8 controles
  "components/TallasLista.tsx": PENDIENTE, // 4 controles
  "components/TejidosLista.tsx": PENDIENTE, // 4 controles
  "components/TemporadasLista.tsx": PENDIENTE, // 12 controles
  "components/TerminalesModales.tsx": PENDIENTE, // 6 controles
  "components/TrasladoAnularModal.tsx": PENDIENTE, // 2 controles
  "components/TrasladoCerrarModal.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/TrasladoConfirmarModal.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/actividad/BotonActividad.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/alta-producto/ElegirEtiquetas.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/alta-producto/ElegirMuestra.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/alta-producto/ElegirTallas.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/apartados/ModalesApartado.tsx": PENDIENTE, // 22 controles
  "components/conteo/AltaAlVuelo.tsx": PENDIENTE, // 7 controles
  "components/conteo/CancelarConteoModal.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/ficha-producto/FotosPorColor.tsx": PENDIENTE, // 2 controles
  "components/finanzas/CierreMes.tsx": PENDIENTE, // 5 controles
  "components/finanzas/ConfiguracionCuentas.tsx": PENDIENTE, // 9 controles
  "components/finanzas/ConfiguracionPresupuesto.tsx": PENDIENTE, // 4 controles
  "components/finanzas/CuentasDinero.tsx": PENDIENTE, // 20 controles
  "components/finanzas/EditarCuentaModal.tsx": PENDIENTE, // 9 controles
  "components/finanzas/EstadoResultadosPanel.tsx": PENDIENTE, // 3 controles
  "components/finanzas/PagosSinCuenta.tsx": PENDIENTE, // 2 controles
  "components/finanzas/SaldosArranqueModal.tsx": PENDIENTE, // 3 controles
  "components/punto-de-venta/ClientaDelTicket.tsx": PENDIENTE, // 1 control — un solo control: candidato a no-aplica
  "components/punto-de-venta/Esperas.tsx": PENDIENTE, // 2 controles
};
