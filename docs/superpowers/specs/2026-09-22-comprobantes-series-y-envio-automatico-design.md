# Comprobantes: series y envío automático a SUNAT — diseño (2026-09-22)

Aprobado por Felipe en el chat del 2026-09-22. Maqueta: `docs/maquetas/comprobantes-series-spike-2026-09/`.
Decisión de fondo: D-60 (`docs/datos/DECISIONES-2026-09-21-menu-comercial.md`), esquema de la cola en
`supabase/migrations/20260922151500_comprobantes_cola_de_reintento.sql`.

## Qué cambia para quien usa el sistema

- «Facturación» pasa a llamarse **Comprobantes** y muestra solo las series: en qué número va cada una,
  cuántos lleva, crear y archivar series. Se quedan **Proformas**, **Emitidos** y **Por reintentar**.
- **No hay botón «Transmitir».** Al cobrar, el comprobante se envía solo. Si Lucode no responde, queda en
  la cola «Por reintentar» con su número intacto; «Reintentar ahora» vive solo ahí.
- Se van el **Resumen del día** y la pestaña **Códigos de descuento**. El código al cobrar en Vender sigue
  funcionando igual.

## Decisiones de Felipe (2026-09-22)

1. Todo lo emitido hasta hoy es prueba. Las 20 boletas B004 pendientes se marcaron `no_emitido` con motivo
   «Venta de prueba…» (hecho en producción ese día). Nada viejo entra a la cola.
2. Mientras el sistema esté en desarrollo, `LUCODE_ENTORNO` en Vercel = `sandbox` (lo cambia Felipe). Los
   2 comprobantes transmitidos el 08 y 09-sep fueron a la SUNAT real.
3. Proformas se queda en Comprobantes; los códigos de descuento no se muestran en ningún lado.
4. La nota de venta la define otra sesión: la pantalla de series la recibe como un tipo más.

## Pasos (cada uno se prueba solo)

1. **Envío al cobrar.** `PuntoDeVenta` llama a `POST /api/lucode/emitir { venta_id }` en segundo plano
   (`keepalive`, `x-espera: no`) al cobrar y al subir una venta guardada sin conexión. Si Lucode falla, la
   ruta llama a `fn_marcar_reintento_transmision`. Se prueba cobrando en local contra el sandbox.
2. **Reintento sin cron.** Cada cobro y cada apertura de Comprobantes reintenta lo vencido
   (`proximo_reintento_at <= now()`) y los `pendiente` que quedaron sin enviar (pestaña cerrada antes del
   `fetch`). Antes necesita una reserva atómica en la base para que dos pasadas no envíen el mismo
   comprobante a la vez. Aviso al líder si algo lleva más de 1 h en cola. Un cron de Vercel solo si la cola
   se queda quieta de verdad.
3. **Pantalla.** `/vender/comprobantes` (redirige desde `/vender/facturacion`), menú «Comprobantes»,
   pestañas Series · Emitidos · Por reintentar · Proformas, pastilla del entorno (sandbox = «pruebas»).
4. **Series.** Tarjetas, «Nueva serie» con validación de formato, «Archivar serie» (nunca borrar), aviso
   de números faltantes y lista de salida a producción. Requiere cambiar `unique (ubicacion_id, tipo)` en
   `series_comprobantes`: impide tener NC de boletas (B…) y de facturas (F…) en la misma tienda, y
   archivar una serie y registrar su reemplazo. Migración con OK de Felipe antes de producción.

## Salida a producción (cuando el sistema deje de ser de prueba)

1. `LUCODE_ENTORNO=produccion` en Vercel y volver a desplegar.
2. Archivar las series usadas en pruebas y registrar series nuevas, que empiezan en 1: las pruebas en
   sandbox consumen la misma numeración.
3. Una venta real chica y comprobar que SUNAT la aceptó.

## Fuera de este trabajo

Nota de venta (otra sesión), serie de contingencia sin internet, registro de ventas para el contador.
