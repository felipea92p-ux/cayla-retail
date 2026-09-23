# Cierre del hueco de seguridad más grave — 2026-09-23

> El hueco que PL-61/84/85 marcaron como el más urgente de todo el plano. Cerrado hoy, en dos partes.

## Qué estaba abierto

`ventas`, `venta_items`, `venta_anulacion_items`, `clientas`, `conteos`, `lotes`, `devoluciones` y
`devolucion_items` aceptaban `INSERT`/`UPDATE`/`DELETE` directo desde el navegador para cualquier
sesión autenticada — saltándose `registrar_venta`, `anular_venta` y el resto de las funciones que
de verdad validan precio, stock, caja abierta y rol.

## Cómo se cerró

**Parte 1 — `devoluciones`/`devolucion_items`/`prendas_danadas`/`cambios`:** cerradas por otra
sesión el mismo 2026-09-23 (commit `520915d0`, ADR-0166, rama `claude/pantalla-ventas-module-bf9b1b`,
aún sin fusionar a `main`).

**Parte 2 — `ventas`/`venta_items`/`venta_anulacion_items`/`clientas`/`conteos`/`lotes`:** rescatado
y completado ADR-0119 (2026-09-18, nunca fusionada). Verificado antes de pegar, contra producción en
vivo: 14 funciones (6 + 8) escriben en estas 6 tablas, todas `security definer`, todas dueñas
`postgres`; cero escritura directa desde `apps/` o `packages/`; los 3 triggers nuevos en
`ventas`/`conteos` (construidos junto con ADR-0161/0178) no se ven afectados porque corren bajo la
función dueña de la tabla, no bajo quien la llama.

Migración: `supabase/migrations/20260923210000_ventas_clientas_conteos_lotes_solo_rpc.sql`
(commit `f2c27fe3`). Pegada por Felipe el 2026-09-23.

## Verificación después de pegar

- Las 8 tablas muestran solo `SELECT` para `authenticated` — confirmado con consulta de solo lectura.
- Las 6 funciones críticas del mostrador (`registrar_venta`, `anular_venta`, `registrar_clienta`,
  `abrir_conteo`, `cerrar_conteo`, `recibir_lote`) conservan su permiso de ejecución intacto —
  confirmado con `has_function_privilege`.

## Qué queda abierto, sin resolver por esto

- `0005_grants.sql` (`alter default privileges`) sigue dando escritura por defecto a cualquier tabla
  **nueva** de `retail` — la raíz del patrón sigue viva. Ir a la raíz fue la opción descartada por
  alcance en PL-85.
- Transferencias y `transferencia_items` no se verificaron en este cierre.
- La bitácora de SQL (`retail.sql_aplicado`, PL-95) sigue sin construirse — este documento y el
  commit son el registro mientras tanto.
