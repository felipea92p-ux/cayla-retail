## 🕘 Actividad: Colaboradores, Roles, Configuración y Regularizar (2026-10-03, ADR-0207 act.) — rama `claude/actividad-colaboradores-config-regularizar` (sobre la del #745)

- [x] Migración `20261003210000_actividad_colaboradores_roles_configuracion_regularizar.sql` aplicada y probada en LOCAL (`pnpm pruebas:actividad-gestion` 9/9, con las formas reales de los tres historiales de producción). Pruebas vecinas en verde (las 4 en rojo fallan igual sin estos disparadores: datos de la base local).
- [x] Web: `MODULOS_CON_ACTIVIDAD` suma Recibir mercadería, Colaboradores, Roles y Configuración.
- [ ] **NO está en producción.** Una parte, `lock_timeout = 3s`; toma candados breves de los tres historiales y de `prendas_por_regularizar`. Después, refrescar el volcado.
- [ ] Fusionar después del #745 (esta rama parte de la suya).
- [ ] Siguientes: Facturación; preparar Devoluciones, Recibir mercadería / Compras, Producción y Finanzas antes de que se usen.
