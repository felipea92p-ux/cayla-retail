# Apartados: celular opcional (ADR-0367)

- [x] Migración `20261009231332_apartado_sin_celular.sql` en producción (2026-10-09).
- [ ] Refrescar el volcado (`pnpm datos:refrescar` + `datos:generar:produccion`): `separaciones.clienta_celular` ya admite null.
- [ ] Pedir a otra sede (`pedir_prenda_para_apartar`, `PedirYApartarModal`) sigue exigiendo celular: decidir si también pasa a opcional.
