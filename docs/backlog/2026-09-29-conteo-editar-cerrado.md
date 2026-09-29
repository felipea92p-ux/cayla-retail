## Editar un conteo cerrado (2026-09-29, ADR-0282)

- [x] **SQL pegado en producción el 2026-09-29** (schema `retail`, `apply_migration`): `20260930020100_conteo_editar_cerrado.sql` (`reabrir_conteo` nueva y `conteo_contar` con una línea). Huellas `md5(prosrc)` iguales a local: `reabrir_conteo` 05c9ccbe…, `conteo_contar` 3dd9c1a2…; `authenticated` ejecuta y `anon` no.
- [x] Botón «Editar conteo» en el resultado de un conteo cerrado.
- [ ] Si se reabre y una variante ya ajustada se deja «pendiente», su ajuste anterior se queda en el stock (lo dice el resultado). Reabrir no guarda quién lo hizo (no mueve stock; el cierre siguiente sí firma).
