## Refresco del volcado de producción (2026-10-17)

- [x] `docs/datos/generado/` refrescado por diferencia (`pnpm datos:refrescar`): 1642 huellas iguales a producción.
- [x] Diccionario, comparador (0 llamadas sin respaldo, 0 sobrecargas) y aviario al día; pájaro para las 20 tablas nuevas,
  y el diccionario vuelto a generar después de dárselo (antes las 20 quedaban en «Sin módulo asignado»).
- [ ] Finanzas confirma que las cinco tablas de las máquinas de cobro (`pos_maquinas`, `pos_maquinas_sedes`, `pos_tarifas`,
  `pos_abonos_lotes`, `cobros_resellados`, ADR-0429) son de Garza. Sus migraciones ya están en main (PR #1138, fusionado el 2026-10-17).
