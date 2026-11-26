// Registro de deuda de RELLENOS SILENCIOSOS (regla — ADR-0693, Felipe 2026-11-23).
//
// Un relleno pone un valor en lugar del error: `.catch(() => null)`, `.catch(() => [])`, `.catch(() => {})` o un `catch { return [] }`.
// La pantalla sigue en pie y nadie se entera de que algo falló: el historial «vacío» que en verdad no cargó. Muchos son a propósito
// (una parte opcional que, si no responde, deja la pantalla como antes) y otros esconden una falla. Mirando el código no se distinguen,
// así que el que es a propósito lo DICE en su línea:
//
//   getCambiosBancarios(id).catch(() => []), // relleno-a-proposito: opcional; si falla, la ficha se pinta sin el historial
//
// La marca vale en la línea del `catch`, en el comentario pegado arriba o dentro del manejador, con un motivo de 10 caracteres o más.
// No es relleno lo que ya avisa o hace algo con el error (`console.error`, `capturarError`, `avisar.*`, relanzar, `({ error: String(e) })`,
// `setFallo(true)`), ni el cuerpo de una respuesta (`res.json().catch(() => null)`: la falla ya se ve en `res.ok`). La definición
// única es el escáner `scripts/rendimiento/observabilidad.mjs` (`relleno-silencioso`); lo vigila `lib/relleno-silencioso.test.ts`.
//
// Esta lista es la DEUDA de antes de la regla: cuántos rellenos sin marca tenía cada archivo el 2026-11-23. Un archivo nuevo no entra
// aquí, y un archivo listado no puede sumar uno más. SOLO BAJA: al resolver uno (se marca con su motivo, se avisa o se deja que el error
// suba), se baja su número y `PENDIENTES_HOY`; la prueba exige las cuentas exactas, para que el tablero no mienta en ningún sentido.
// `node scripts/rendimiento/observabilidad.mjs --json` da cada uno con su línea.

/** Cuántos rellenos sin marca quedan en toda la web. Baja a medida que se resuelven; subir es romper la regla. */
export const PENDIENTES_HOY = 126;

/** Rutas relativas a `apps/web/` → cuántos rellenos sin marca tiene ese archivo. */
export const RELLENOS_PENDIENTES: Readonly<Record<string, number>> = {
  // ---- app/(app)/configuracion/ ----
  "app/(app)/configuracion/page.tsx": 1,
  // ---- app/(app)/inventario/ ----
  "app/(app)/inventario/page.tsx": 2,
  // ---- app/(app)/vender/ ----
  "app/(app)/vender/reportes/empresas/page.tsx": 1,
  // ---- app/api/pedidos-web/ ----
  "app/api/pedidos-web/avisar/route.ts": 1,
  // ---- app/login/ ----
  "app/login/page.tsx": 3,
  // ---- components/ ----
  "components/BajarAlPisoForm.tsx": 2,
  "components/CompraDetalle.tsx": 1,
  "components/DetalleVentaModal.tsx": 1,
  "components/EscanerBusqueda.tsx": 1,
  "components/EscanerCamara.tsx": 1,
  "components/EscanerConteo.tsx": 1,
  "components/FiltrosHistorialVentas.tsx": 1,
  "components/ProformasPanel.tsx": 1,
  "components/VersionNueva.tsx": 1,
  "components/alta-producto/NuevoColorAlta.tsx": 1,
  "components/apartados/ApartarVista.tsx": 1,
  "components/apartados/TodosVista.tsx": 2,
  "components/asistente/Acompanante.tsx": 1,
  "components/barrido-piso/BarridoPiso.tsx": 1,
  "components/conteo/control-conteo.ts": 1,
  "components/cuadre-piso/CuadrarPisoForm.tsx": 2,
  "components/existencias/AnilloMision.tsx": 1,
  "components/ficha-producto/useCatalogoIA.tsx": 2,
  "components/finanzas/estados/SelectorPeriodo.tsx": 1,
  "components/finanzas/telar/usePendientesTelar.ts": 1,
  "components/guias/recorrido.ts": 2,
  "components/guias/vistas.ts": 2,
  "components/impresion/imprimirBoleta.ts": 1,
  "components/pedidos-web/AvisosCelularHoja.tsx": 5,
  "components/punto-de-venta/useEsperaDelCartel.ts": 2,
  "components/recepcion-envio/useFotosDeEstampados.ts": 1,
  "components/recomendaciones/useQuienEsElCliente.ts": 1,
  "components/ui/Espera.tsx": 1,
  "components/ui/TablaViva.tsx": 1,
  "components/ui/useAtrasCierraLaHoja.ts": 1,
  // ---- lib/ ----
  "lib/acceso-web-reglas.ts": 1,
  "lib/almacen-local.ts": 1,
  "lib/ancla-de-la-direccion.ts": 1,
  "lib/apartar-desde-ticket.ts": 1,
  "lib/asistente/recorrido.ts": 1,
  "lib/bajada-reglas.ts": 2,
  "lib/barrido-piso-reglas.ts": 1,
  "lib/borrador-orden.ts": 4,
  "lib/caja-tablero.ts": 1,
  "lib/campanas-web-editor.ts": 1,
  "lib/candidatas-alta-lector.ts": 3,
  "lib/catalogo-v2.ts": 1,
  "lib/costo-atipico-reglas.ts": 1,
  "lib/cuadre-piso-reglas.ts": 1,
  "lib/elige-sede-reglas.ts": 1,
  "lib/envio-sunat.ts": 1,
  "lib/existencias-ajuste-modelo.ts": 1,
  "lib/existencias-mision.ts": 1,
  "lib/foto-prenda-reglas.ts": 1,
  "lib/frescura.ts": 6,
  "lib/guias/diferidas.ts": 1,
  "lib/guias/reglas.ts": 1,
  "lib/historial-acciones-reglas.ts": 1,
  "lib/historial-prenda-reglas.ts": 1,
  "lib/horario-edicion-reglas.ts": 1,
  "lib/inicio-avisos.ts": 1,
  "lib/inventario-v2.ts": 1,
  "lib/liviano-cliente.ts": 1,
  "lib/lucode.ts": 1,
  "lib/medir-tramos.ts": 1,
  "lib/navegacion-al-instante.ts": 1,
  "lib/orden-pagina-reglas.ts": 1,
  "lib/ordenes-compra.ts": 2,
  "lib/pedidos-web.ts": 1,
  "lib/plan-compra-avisos.ts": 1,
  "lib/plan-compra-pagar.ts": 1,
  "lib/por-regularizar-stock.ts": 1,
  "lib/posibles-duplicados.ts": 1,
  "lib/precios-sede-datos.ts": 2,
  "lib/preferencia-local.ts": 1,
  "lib/recepcion-cierre-borrador.ts": 1,
  "lib/recepcion-envio.ts": 2,
  "lib/reportes-por-empresa.ts": 1,
  "lib/reportes-ventas-alcance.ts": 1,
  "lib/responsable-conteo.ts": 2,
  "lib/roles.ts": 1,
  "lib/salida-sin-guardar.ts": 1,
  "lib/sin-conexion-reglas.ts": 1,
  "lib/sire-api-reglas.ts": 1,
  "lib/sondear-la-base.ts": 1,
  "lib/sonido-conteo.ts": 2,
  "lib/terminales-alta.ts": 3,
  "lib/tiempos-de-pantalla-cliente.ts": 1,
  "lib/tiempos-de-pantalla-reglas.ts": 2,
  "lib/useCambiosEnVivo.ts": 1,
  "lib/useEnLinea.ts": 1,
  "lib/useQueHayPorTienda.ts": 1,
  "lib/vendido-sin-registrar.ts": 1,
};
