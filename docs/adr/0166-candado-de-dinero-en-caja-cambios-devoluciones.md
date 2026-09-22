# ADR-0166 — El candado de dinero de Caja, Cambios y Devoluciones vive en la base, no en el navegador

**Fecha:** 2026-09-22 · **Estado:** aceptado (Felipe: «ok») y **aplicado en producción el mismo día**, verificado en solo lectura contra `cayla-dynamic` (huellas de las tres funciones antes/después, permisos de tabla confirmados) y con un Postgres 17 desechable sin Docker (209 migraciones + la nueva, dos veces, 64/64 pruebas). Relacionado: D-13 y D-49 (`docs/datos/DECISIONES-2026-09-12.md`), ADR-0056, ADR-0143 (el mismo candado ya cerrado para stock). Origen: análisis `/pantalla` del módulo Ventas, 2026-09-22 (`docs/pantallas/caja.md`, `cambios.md`, `devoluciones.md`).

## Contexto

El análisis completo de las 6 pantallas de Ventas encontró la misma familia de hueco en tres de ellas, no tres bugs sueltos:

- **Caja:** `registrar_movimiento_caja` solo exigía líder cuando el propio navegador mandaba `p_es_ajuste = true` — cualquier sesión que llamara la función distinto (o cualquier motivo fuera del vocabulario del modal) no pasaba por ningún candado.
- **Cambios:** `registrar_cambio` nunca exigía líder, ni siquiera cuando la diferencia de precio le devolvía plata a la clienta. Caso real en producción: S/100 devueltos por Plin sin comprobante ni aprobación.
- **Devoluciones:** `devoluciones`, `devolucion_items`, `prendas_danadas` y `cambios` seguían con el privilegio de tabla que `0005_grants.sql` concede por defecto a toda tabla nueva del schema (`insert/update/delete` para `authenticated`) — la política RLS limita la SEDE, no el privilegio. Cualquier sesión podía `update devoluciones set estado='aprobada', reembolso_monto=...` desde la consola, saltándose `aprobar_devolucion` (y su candado de líder) entero. Además, `aprobar_devolucion` no comparaba quién registró con quién aprueba — la única devolución real de producción se auto-aprobó en 5,6 segundos — y el tope de reembolso era solo un aviso ámbar en pantalla, nunca un candado real.

## Decisión

Una sola migración (`20260922235000_candado_dinero_caja_cambios_devoluciones.sql`), tres `create or replace` con la misma firma (sin romper compatibilidad) más un `revoke`:

1. **`registrar_movimiento_caja`:** el motivo decide si es ajuste, no un booleano que manda el cliente — vocabulario cerrado (el mismo que ya usa `caja-panel-reglas.ts`), `es_ajuste` deducido en la base, y referencia obligatoria para "Depósito bancario"/"Otro" (lo que el modal ya pedía, ahora también exigido ahí).
2. **`registrar_cambio`:** exige líder cuando la diferencia es negativa (CAYLA le devuelve plata a la clienta) — no cuando la clienta paga de más, que no es el riesgo que esto cierra.
3. **`aprobar_devolucion`:** quien registró una devolución no puede aprobarla ella misma; el reembolso no puede superar lo que la clienta pagó de verdad (con descuento, no precio de lista).
4. **`revoke insert, update, delete, truncate`** sobre las cuatro tablas para `authenticated`/`anon` — mismo patrón que `20260922100000_colaboradores_endurecimiento.sql` y `20260920160000_apartar_stock.sql`. Ninguna de las cuatro tiene un escritor legítimo fuera de sus RPC (todas `security definer`; confirmado que no hay ningún `.from(...)` con insert/update/delete/upsert sobre ellas en `apps/web`).

## Lo que queda fuera, a propósito

- **La nota de crédito de una devolución se sigue calculando sobre precio de lista, no sobre lo pagado con descuento** (`docs/pantallas/devoluciones.md` §2.3) — con línea sin descuento da igual (el único caso real hoy), con descuento se acredita de más ante SUNAT. Es un cambio de qué se reporta a SUNAT, no un candado de permiso: necesita el ok explícito de Felipe aparte.
- **Un cambio que devuelve plata sigue sin comprobante ni nota de crédito.** Felipe ya decidió la solución (serie de nota de crédito con prefijo B por tienda, 2026-09-21, BACKLOG:451) — es un proyecto de SUNAT/Lucode más grande, no se mezcla con este candado de permiso.
- **Cambios no tiene un flujo de "queda pendiente, un líder lo aprueba después"**, a diferencia de Devoluciones. Con el candado nuevo, un cambio con diferencia negativa sin un líder presente se rechaza sin más salida que llamar a una líder (hay 9 de alcance global, ADR-0143) — decisión pendiente de Felipe: ¿construir ese flujo, o dejarlo así?

## Se rompe si

- Alguien vuelve a pegar una migración vieja de estas tres funciones (`0008_caja_y_pagos.sql`, `20260916180000...sql`, cualquier versión anterior a esta) sin darse cuenta de que ya corrió una más nueva encima — mismo riesgo que ya documentó la landmina de `colaboradores` (memoria `supabase-produccion-es-cayla-dynamic`): el candado vuelve a la versión vieja sin ningún error visible.
- Se agrega un motivo nuevo de movimiento de caja solo en `caja-panel-reglas.ts` (el navegador) sin sumarlo también al vocabulario cerrado de `registrar_movimiento_caja` — la base lo rechazaría con "Motivo de egreso desconocido", aunque el modal lo ofrezca.
