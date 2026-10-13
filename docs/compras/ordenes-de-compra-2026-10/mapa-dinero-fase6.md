> Anexo de la fase 6 (ADR-0362). Lo armó un agente de lectura el 2026-10-13 y vivía solo en una carpeta temporal; se guarda aquí
> para que la fase 6 no lo pierda. Las rutas M/ W/ P/ y sus números de línea son de `main` al 2026-10-13: confírmalas antes de usarlas.
> Lista de la fase 6 aprobada por Felipe el 2026-10-13: las 9 actividades del README con la 1 y la 2 juntas (el módulo no nace sin su
> pantalla), o sea **8**, y el sistema deja de suponer un solo `por_rendir`.

# Mapa del dinero para la fase 6 (agente Explore, 2026-10-13) — resumen para retomar

M = supabase/migrations · W = apps/web · P = scripts/pruebas

## Lo que se rompe al agregar fondos por persona (más de un `por_rendir`) y los tipos entrega_fondo / devolucion_fondo
1. CHECK `movimientos_dinero_tipo_check` (M/20260925110000:189) → 23514.
2. Lista cerrada en `registrar_movimiento_dinero` (M/20260925110000:949-951) «Di qué pasó con la plata».
3. Permiso de `registrar_movimiento_dinero` (:931 fn_es_lider; :973-983 no-líder solo `deposito` desde cuenta con sede).
4. `fn_movimientos_dinero_validar` vigente = M/20261010223118:102-210; puntas en :147-156 — un tipo nuevo pasa SIN reglas (agujero).
5. Anular: `anular_movimiento_dinero` M/20260925110000:1084 (+ parche M/20261010223118:236-242); `puede_anular` en fn_movimientos_dinero :644.
6. Web `TEXTO_MOVIMIENTO` (W/lib/cuentas-dinero-reglas.ts:38-47): CuentasDinero.tsx:1058 revienta (TypeError) con tipo nuevo; :402, :875, :1071.
7. `fn_texto_movimiento_dinero` (M/20260925110000:232-244, `else p_tipo`) y `TEXTO_REGLA` (W/lib/resultados-reglas.ts:344-376): tipo crudo.
8. Índice `cuentas_dinero_por_rendir_uq` (M/20260925110000:99): un solo por_rendir en toda la tabla → 23505.
9. Subconsultas de UNA fila sobre por_rendir (error 21000 con dos): `fn_caja_traslados_sellar` (M/20260925150000:370, cierre de caja «Entregado al líder»), `fn_dinero_libro` (M/20261002130000:82, tumba libro/saldos/Balance/flujo/Resumen).
10. `registrar_ingreso_caja` (M/20261010223118:321) toma el por_rendir más antiguo (`limit 1`): filtrar `persona_id is null`.
11. `fn_cuenta_sellada` (M/20260925150000:138-140): por_rendir solo líder (42501) → la dueña no paga desde «Mi fondo».
12. `fn_cuentas_para_elegir` (M/20260925150000:572-621, parche M/20260928220000:165-168): por_rendir solo para el líder (y ve TODOS); no puede llevar fn_es_lider (P/roles_lider_editable.mjs:169-173). La usan 13 pantallas.
13. `fn_cuentas_dinero_saldos` (:560-565) y `fn_movimientos_dinero` (:650-651): la dueña no ve su fondo.
14. `fn_cuentas_dinero_inmutable` vigente M/20260925210100:37-61: por_rendir no se archiva nunca (:57-59); persona_id no protegido; editar/eliminar/crear tratan por_rendir como automática (M/20260925210100:167,184-186,270-272; crear solo banco/por_abonar/tarjeta M/20260925110000:1200-1202).
15. Pruebas con `\gset` sin limit (P/cuentas_dinero.mjs:77, P/cuenta_sellada.mjs:82, P/editar_cuentas.mjs:63) y «una sola cuenta por rendir» (P/cuentas_dinero.mjs:115).
16. La rendición NO puede reusar la conciliación (solo bancos/POS/tarjeta).

## Hechos útiles
- `fn_cuenta_sirve` vigente M/20261002130000:42-52: por_rendir solo con efectivo (Yape/transferencia → banco). Espejo web W/lib/cuenta-sellada-reglas.ts:39-45.
- Contables: `cuentas_dinero_contable_del_tipo` (M/20260925110000:85-90) obliga por_rendir = 101. Producción NO tiene 1413 en `retail.cuentas`; sí 609 (flete) y 631.
- `fn_asientos_dinero_y_caja` (M/20260925170000:87-163): tipo nuevo → ELSE (debe = cuenta destino, haber = cuenta origen): correcto para transferencias internas.
- `fn_flujo_lineas`: tipo nuevo → 'entre_cuentas' (correcto). `fn_plata_del_dueno`, `fn_saldos_iniciales_propuesta`, `fn_bal_causas_dinero`: tipo nuevo no afecta (correcto). `fn_bal_dinero` suma todas las cuentas (fondos en 101 — o 1413 si se cambia).
- `fn_asientos` asienta pagos/gastos con `fn_asiento_cuenta_de_medio` (efectivo → 101), NO por cuenta_dinero_id: pagar desde un fondo en 1413 asentaría 101 → hay que tocarlo si el fondo va a 1413 (actividad 8).
- Pagos: `compra_pagos` sella con `fn_compra_pagos_sellar` (M/20260925150000:380-418) vía fn_cuenta_sellada; `gastos` con `fn_gastos_sellar` (:471-503); `gastos_pago_coherente` permite efectivo con cuenta y sin egreso.
- Pago de orden al contado: `registrar_comprobante_orden` (M/20261012211000 + parches 230000 y 235000); medios del contado (:402) sin tarjeta; cuenta = p_pago[i].cuenta_id (:453-473).
- Por pagar: `registrar_pagos_compra` (puerta fn_puede_pagar_compras M/20261012204000:298-324) y `registrar_pago_compras_medios` (:271-297).
- `registrar_gasto` firma vigente con p_cuenta_id (M/20260925150000:990-1001); permiso fn_gastos_puede.
- Categorías de gasto: no hay flete ni viajes; 609 existe sin categoría (W/lib/resultados-reglas.ts:383 lo dice).
- Módulos de Finanzas: gastos 250, cuentas_dinero 260, reportes 270, impuestos 280, cierre_mes 290 → `fondos` = 265, después de "cuentas_dinero" en CLAVES_MODULO (W/lib/modulos.ts:22), MODULOS :114-121, permisosDeModulos :265-269; menú Finanzas W/lib/menu.ts:423-435; layout como W/app/(app)/finanzas/gastos/layout.tsx; vista global W/lib/vista-global.ts:32-45 (pantalla bajo /finanzas debe estar en MODULOS_DE_LA_VISTA_GLOBAL); guardián en la base para P/roles_cobertura_modulos.mjs.
- Un módulo NO puede existir sin su entrada de menú (W/lib/modulos.test.ts:410-430) → la actividad 1 (base) y la 2 (pantalla) van juntas: re-proponer la lista a Felipe.
- Pruebas de dinero existentes: P/cuentas_dinero, editar_cuentas, cuenta_sellada, caja_ingresos_con_origen, flujo_caja, estado_resultados, cierre_mes, balance, perdidas, resumen_finanzas, finanzas_arranque, activos_carga_inicial, gastos, por_pagar_consolidado, redondeo_efectivo, ordenes_compra_comprobante, ordenes_compra_sin_comprobante, roles_cobertura_modulos, roles_lider_editable. Prueba nueva: package.json + PRUEBAS (W/lib/ci-paridad.test.ts).
- Rama `claude/purchase-order-phase6-9b0c82` creada (sin commits); migraciones reservadas 20261013181000 y 20261013182000.
