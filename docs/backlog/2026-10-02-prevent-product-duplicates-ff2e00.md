## Nombre único por marca y carrera entre sedes (2026-10-02, ADR-0294 fases 2b/2c) — rama `claude/prevent-product-duplicates-ff2e00`

- [x] Migración `20261002120100_nombre_unico_por_marca_y_carrera_entre_sedes.sql` escrita y probada en un Postgres desechable.
- [ ] **Felipe:** OK para pegarla en producción (una parte, antes ensayo con `begin; …; rollback;`). Después `pnpm datos:generar:produccion` (el índice cambió de nombre).
- [ ] Probar con cuenta real: la misma prenda con dos marcas distintas (debe dejar), con la misma marca (debe frenar), y dos sedes guardando a la vez.
- [ ] Decidir si `catalogo_crear_producto` (inserta sin chequeo de nombre; lo guarda solo el índice) se retira ya: aún existe en producción.
- [ ] Fase 4 (D7): cerrar `censo_crear_variante` con `fn_ve_modulo('conteos')` — explicado a Felipe, sin decidir.
- [ ] Fase 3: tabla `decisiones_parecido` en modo sombra — explicado a Felipe, sin decidir.
