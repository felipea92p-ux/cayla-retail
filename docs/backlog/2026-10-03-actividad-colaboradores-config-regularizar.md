## 🕘 Actividad: Colaboradores, Roles, Configuración y Regularizar (2026-10-03, ADR-0207 act.) — rama `claude/actividad-colaboradores-config-regularizar` (sobre la del #745)

- [x] Migración `20261003210000_actividad_colaboradores_roles_configuracion_regularizar.sql` aplicada y probada en LOCAL (`pnpm pruebas:actividad-gestion` 9/9, con las formas reales de los tres historiales de producción). Pruebas vecinas en verde (las 4 en rojo fallan igual sin estos disparadores: datos de la base local).
- [x] Web: `MODULOS_CON_ACTIVIDAD` suma Recibir mercadería, Colaboradores, Roles y Configuración.
- [x] **EN PRODUCCIÓN** (2026-10-03, ~11:00 Lima, a pedido de Felipe, `apply_migration`): 4 disparadores; se reconstruyeron 55 líneas de colaboradores, 31 de roles y 25 de configuración (ninguna prenda regularizada todavía); ninguna con dinero de la empresa; la web no puede anotar a mano. 37 quedaron sin sede (altas de líderes y roles tocados por cuentas sin tienda): solo las ve el líder.
- [x] Volcado refrescado (foto 2026-10-03 16:01 UTC: 154 relaciones, 793 funciones; las 1078 huellas coinciden). Solo cambiaron los grupos `fn_activ*` y `trg_acti*`.
- [x] El #745 ya está en `main`; este PR (#753) va directo contra `main`.
- [ ] Siguientes: Facturación; preparar Devoluciones, Recibir mercadería / Compras, Producción y Finanzas antes de que se usen.
