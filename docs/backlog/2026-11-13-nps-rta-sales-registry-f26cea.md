# Lo que se paga a SUNAT va en soles enteros (rama `claude/nps-rta-sales-registry-f26cea`)

- [x] **PEGADO en producción el 2026-11-13** (huellas después: `3b1ac5747f59c82b6db76d091cd4b23c` y `910a626867d3ff0f01d5c4fedde9d122`, iguales al ensayo): `supabase/migrations/20261113220000_lo_que_se_paga_a_sunat_va_en_soles_enteros.sql`, una ejecución. Antes: confirmar que las huellas de `fn_flujo_caja_proyeccion(integer)` y `fn_impuestos_panel(date)` siguen siendo `2e70992d2f8543613a793de08a94862d` y `bd3ab41e9807bcda62ae15ff7abc547e`. Si un ancla no aparece una vez, aborta sin cambiar nada.
- [ ] **Para el contador:** el IGV por pagar se redondea al final (débito − crédito − saldo, al céntimo, y luego a soles). El formulario 621 redondea casilla por casilla: puede diferir en S/ 1. Hoy no se paga IGV (saldo a favor); decidir antes de que toque.
- [ ] **Para el contador:** al pagar IGV en soles enteros quedarán céntimos en la 4011; se cierran con su asiento de redondeo.
- [ ] La tarjeta «Renta de 2026» (`renta-anual-reglas.ts`) estima los pagos a cuenta del año aparte; no se tocó. Mirar si debe usar la misma regla.
