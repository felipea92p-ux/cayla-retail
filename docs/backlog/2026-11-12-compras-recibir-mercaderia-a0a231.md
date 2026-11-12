## Recibir: compras de «Mis compras» antes de su envío (2026-11-12)

- [x] **Pegada en producción el 2026-11-12** `20261112153000_mis_compras_no_salen_sin_guia_en_recibir.sql` (verificado con la consulta de abajo). Verificación: `select position('ADR-0480: viaja con su envío' in pg_get_functiondef('retail.fn_ordenes_directas_por_recibir(uuid)'::regprocedure)) > 0;` y lo mismo con `retail.recibir_orden_sin_envio(uuid,uuid)`.
- [ ] Decidir si la tienda debe ver ANTES del envío que «viene una compra» (hoy lo ve solo dentro de «¿Llegó algo sin aviso?», `fn_compras_pagadas_hacia`). Es decisión de negocio de Felipe: no se construye sin ella.
