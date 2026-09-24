# ADR-0191 — Totales de Caja y del Historial de ventas calculados en la base

- **Fecha:** 2026-09-23
- **Estado:** construido y probado en local; migración `20260924140000_totales_de_caja_e_historial_en_la_base.sql`
  **por pegar en producción**. Orden: **primero la base, después la web** (la pantalla de Caja la necesita; el Historial
  aguanta sin ella con su cálculo viejo).
- **Contexto:** auditoría de escalabilidad (2026-09-23), etapa 3 de 5. Depende de la etapa 1 (ADR-0188, índice
  `ventas(caja_id)`).

## Problema

Tres pantallas traían filas a la web para sumarlas en JavaScript:

1. **Historial de ventas** (`totalesVentasHistorial`, `lib/ventas-historial.ts`) traía cada venta del rango con sus
   prendas y pagos, cortado en 1.000 (PostgREST no da más en una respuesta). Con ~2.300 ventas al mes, un rango de más de
   dos semanas salía «parcial»: sin totales, sin trazo por día y sin reparto por forma de pago. Y aun sin cortarse,
   pesaba ~385 KB por visita.
2. **Tablero de Caja** (`getResumenCaja` y `getSeriesVentasCaja`, `lib/caja.ts`) leían las ventas de la caja y después
   sus pagos con `.in("venta_id", [cada id])`: una caja con 470 ventas arma ~17 KB de ids en la URL, y una caja abierta
   varios días termina rompiendo el largo de la URL. Además rehacían en JS la misma cuenta del cajón que
   `fn_calcular_esperado_caja` (ADR-0186): dos fórmulas del mismo dinero (principio 4). La hora de la serie salía del reloj
   del servidor, no de Lima.
3. **Caja en vivo** (`useCajaEnVivo`) hacía dos `count` cada 5 s por pestaña, y el conteo no cambia cuando se **anula**
   una venta (la fila sigue ahí): el tablero no se enteraba.

## Decisión

Tres funciones de solo lectura que devuelven **una fila**:

- `fn_totales_historial_ventas(desde, hasta, sede, vendedor, estado, pago, comprobante, incluir_prueba, ids)` → jsonb con
  ventas, anuladas, unidades, total, por día (Lima) y por forma de pago. Mismos filtros que `consulta()` de la web y la
  misma regla de qué cuenta (una anulada se cuenta aparte y no suma en nada). `p_ids` queda para una búsqueda ya
  resuelta a ids (PR #275); hoy la web no lo manda. La web traduce con `totalesDesdeLaBase` (ticket, días rellenados con
  cero y formas de pago ordenadas: las mismas reglas de antes). **Sin tope.**
- `fn_resumen_caja(caja)` → jsonb. Los montos del cajón salen de `fn_calcular_esperado_caja` (no se repite la fórmula);
  aparte suma solo el reparto por método y la serie por hora de Lima. Trae también el esperado, con el candado de
  `fn_esperado_caja` (`fn_puede_gestionar_caja()`; sin él, `null`). La web: `getTableroCaja` reemplaza a las dos lecturas.
- `fn_sello_caja(caja)` → texto «ventas:anuladas:movimientos:devoluciones:cambios». Una ida a la base en vez de dos, y
  cambia al anular. Sigue sin sondear con la pestaña oculta (ya lo hacía).

De paso, `getVentasMismaHoraSemanaAnterior` (Inicio) trae los pagos embebidos en la misma lectura en vez de una segunda
con los ids en la URL.

**Permisos.** Son `security definer` (no pagan la RLS por fila) y por eso aplican a mano la regla que hoy aplica la RLS a
la web: `fn_es_lider() OR ubicacion_id = fn_ubicacion_actual_persona()` sobre `ventas`/`cajas`, y sobre `comprobantes`
para el filtro «con / sin comprobante». La prueba lo compara contra la RLS real (`set local role authenticated`). `anon`
no ejecuta ninguna.

**Respaldo del Historial.** Si la función no existe (web desplegada antes que la migración), el Historial vuelve al
cálculo de antes con su tope (`totalesConTope`) y la pantalla se ve como hoy. Se retira cuando la migración esté en
producción. Caja no tiene respaldo a propósito: mantenerlo sería conservar la fórmula duplicada.

## Alternativas descartadas

- **`security invoker` apoyada en la RLS.** Evita repetir la regla, pero cada fila vuelve a pasar por las políticas
  (ADR-0176). Con la regla escrita en un solo `where` y probada contra la RLS se tiene lo mismo, más rápido.
- **Pedir las ventas por páginas (`leerTodas`) y seguir sumando en JS.** Arregla el tope, pero multiplica las idas y el
  peso (~385 KB → varios MB en un trimestre) para terminar en seis números.
- **Supabase Realtime para la Caja en vivo.** Sigue pendiente de autorización (ADR-0018); el sello es el paso barato mientras.

## Cómo se verificó

- `pnpm pruebas:totales-caja-historial` (nuevo, 27/27): 3.000 ventas sintéticas con ROLLBACK; la función = la suma fila por
  fila bajo la RLS real en 9 combinaciones de filtros × 2 cuentas (líder y colaboradora de Trujillo); pasa de 1.000 sin
  cortarse; la colaboradora que pide Lima ve 0; la caja da los mismos montos que las 6 lecturas de antes (500 ventas) y el
  esperado de `fn_esperado_caja`; el esperado solo con permiso de cerrar; otra sede se rechaza; el sello cambia al anular.
- Paridad con el código JS real (`resumir`/`serieDiaria`/`mezclaDePagos` sobre las filas vs. `totalesDesdeLaBase` sobre la
  función), huellas md5 idénticas en 5 casos: líder todo (2.874 ventas, S/ 887.861,45), líder 30 días, líder 7 días Yape,
  Trujillo 30 días, Trujillo anuladas.
- Tiempos en la base local (tibia): Historial 60 días (2.800 ventas) ~23 ms y 3,8 KB, antes ~15 ms pero **cortado** en
  1.001 ventas y ~385 KB; Caja ~6 ms y 0,7 KB en 1 lectura, antes 6 lecturas (~11 ms en la base, más la URL de 17 KB);
  sello 2,6 ms en 1 ida, antes 3,4 ms en 2.

## Consecuencias

- El Historial muestra totales, trazo y reparto para cualquier rango.
- La serie por hora de la Caja queda en hora de Lima también en el servidor de producción (UTC); en local ya coincidía.
- Pendiente: con la pestaña visible, cada cambio detectado hace `router.refresh()` completo y muestra el loader general
  (ADR-0149); es lo de siempre, no empeora, pero con muchas ventas por minuto convendría refrescar solo el tablero.
