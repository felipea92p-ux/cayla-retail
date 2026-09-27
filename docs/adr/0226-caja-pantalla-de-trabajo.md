# ADR-0226 · Caja pasa de tablero para mirar a pantalla de trabajo

- **Fecha:** 2026-09-26 · **Estado:** Aprobado por Felipe («me parece adecuada la interfaz… realiza que sea visible en el
  sistema»). **Producción:** sin migración ni RPC nueva; es solo pantalla.
- **Spike:** `docs/maquetas/caja-tablero-spike-2026-09/` (tres rondas con Felipe el mismo día).
- **Alcance:** `app/(app)/caja/page.tsx`, `components/CajaAbiertaPanel.tsx`, `components/CajaTablero.tsx` (nuevo),
  `lib/caja-tablero.ts` (nuevo, lecturas), `lib/caja-tablero-reglas.ts` (nuevo, puro, con pruebas), `lib/caja.ts`
  (`getTableroCaja` devuelve también `esperado`).
- **Complementa:** ADR-0116 (tablero por `@container`), ADR-0186 (el esperado tiene un solo dueño), ADR-0195 F1 (meta y
  «Al cerrar», que se conservan), ADR-0206 (en el celular el menú es el cajón ☰), ADR-0225 (Inicio: botón fijo abajo).

## Problema

Caja era un tablero para mirar. Tenía dos acciones: «Registrar movimiento» y «Cerrar caja». Todo lo que se hace alrededor
del cajón estaba en otras pantallas sin un solo enlace: vender, registrar un gasto, cambios y devoluciones, apartados, y
lo pendiente antes de cerrar. Además:

- La cifra con la que se cuadra, **cuánto debería haber en el cajón**, solo salía en «Al cerrar», y solo si la tienda
  tenía meta. TRU no tiene meta, así que no aparecía nunca.
- «Ventas otro método» y la dona **contaban el `anticipo`** (el adelanto de una separación, cobrado otro día) como plata
  de hoy.
- Cinco recuadros del mismo peso (Apertura, Ventas efectivo, Ventas otro método, Entradas, Salidas).
- El historial de cierres repetía el día («mar 22» tres veces) y no tenía leyenda para el rojo y el verde.
- En el celular, el reloj grande y las cinco cifras llenaban la primera pantalla antes de mostrar una sola acción.

## Decisión

- **D1 — La cifra principal es «Efectivo en el cajón ahora».** El total lo dice la base (`fn_resumen_caja` →
  `fn_calcular_esperado_caja`, el mismo número que `cerrar_caja`, ADR-0186). La pantalla solo muestra sus piezas: apertura,
  ventas en efectivo, entradas y salidas, más devoluciones y cambios cuando los hubo. La base da el total a quien puede
  gestionar la caja (`fn_puede_gestionar_caja`: el líder, o un rol que ve el módulo Caja completo). A quien no, la tarjeta
  le muestra las piezas y le dice que el total lo ve quien cierra. **No se tocó el permiso de la base**: Felipe pidió
  «todas», y hoy todas las cuentas cuyo rol tiene Caja completo ya lo reciben.
- **D2 — «Cobrado en el turno» deja fuera el `anticipo`** y lo menciona aparte («+ S/ 30.00 de adelantos aplicados: se
  cobraron el día que se separó»). Yape y Plin van juntos.
- **D3 — Botones para HACER y píldoras para VER, juntos.** Los botones son Cobrar, Registrar gasto, Depósito o retiro,
  Cambio o devolución y Apartados. «Registrar gasto» abre aquí mismo el formulario de Finanzas ▸ Gastos. Las píldoras de
  «Tu caja muestra» son Pendientes, Apartados, Gastos y Cambios y devoluciones: cada una prende una tarjeta.
  **Predeterminado: Pendientes y Apartados**, las dos que piden hacer algo. La elección se recuerda por aparato y por
  sede (`localStorage`, `almacen-local`). Una píldora apagada con algo por atender se marca en ámbar. Todo se muestra
  **solo si la cuenta ve ese módulo** (ADR-0161).
- **D4 — «Cierres anteriores»: una tarjeta con cuatro vistas** (Último cierre, Semáforo, Tabla de turnos, Gráfico) que
  se cambian dentro de la misma tarjeta. **La predeterminada depende del rol:** Último cierre para quien no es líder
  (cómo recibió la caja) y Semáforo para el líder (si los descuadres se repiten). Se marca con un punto rojo y se
  recuerda por aparato. Tabla y Gráfico ocupan todo el ancho. El Gráfico junta los cierres del mismo día y manda el peor
  cuadre. Umbral del ámbar: hasta S/ 5 (`TOLERANCIA_CUADRE`).
- **D5 — Celular: barra fija como la del Inicio (ADR-0225), sin pestañas de menú (ADR-0206).** Lleva «Vender» ancho y
  oscuro, y los cuadrados Gasto, Mover y Cerrar (Cerrar solo para quien puede cerrar). Arriba, «Accesos» con el formato
  del Inicio (Apartados, Cambios, Devoluciones). El reloj grande pasa a una línea («Abrió 09:06 · lleva 2 h 47 min»).
- **D6 — Movimientos del turno con filtro** «Todo / Ventas / Mueve el cajón». Una venta mueve el cajón si tiene efectivo.

## Lecturas y lo que NO hace

- Todo sale de lecturas que las pantallas vecinas ya usan (`buscar_separaciones`, `fn_gastos_lista`, `cambios` y
  `devoluciones` por `caja_id`, `getDevolucionesPendientes`, `getTrasladosPorAtender`). El comprobante sin llegar a SUNAT
  sale de `fn_ventas_del_dia`, que la página ya leía.
- **Apartados se leen SIN `fn_vencer_separaciones`**: esa función libera lo vencido (escribe), y la Caja se vuelve a leer
  cada vez que entra una venta. Vencer queda a cargo de la pantalla de Apartados, como hasta hoy.
- Ninguna lectura tumba la Caja: si una falla, su tarjeta dice «No se pudo leer ahora» (principio 9).
- No cambia `MovimientoCajaModal`. La idea del spike de convertirlo en «¿Qué pasó con la plata?» (depósito → Cuentas y
  dinero, entrega al líder) mueve dinero entre módulos y queda para una decisión aparte.

## Se rompe si

- Un módulo nuevo que trabaje con la caja no se suma a `lib/caja-tablero.ts` y a los accesos: no aparecerá en la Caja.
- La base deja de mandar `esperado` en `fn_resumen_caja`: la tarjeta pasa sola a mostrar solo las piezas, sin total.
