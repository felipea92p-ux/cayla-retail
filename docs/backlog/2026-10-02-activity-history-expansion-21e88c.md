## 🕘 Actividad: Existencias, Conteos y Traslados (2026-10-02, ADR-0207 act.) — rama `claude/activity-history-expansion-21e88c`

- [x] Migración `20261002233000_actividad_existencias_conteos_traslados.sql` aplicada y probada en LOCAL (`pnpm pruebas:actividad-inventario` 13/13, `pnpm pruebas:actividad` en verde).
- [x] Web: `MODULOS_CON_ACTIVIDAD` suma Existencias, Conteos, Traslados y los que ya anotaban (Clientes, Avisos del club, Productos); prueba que lo cruza con las migraciones.
- [x] Pruebas que desactivan el candado de `movimientos` tras preparar datos (`eliminar_producto*`, `purgar_producto_de_prueba`, `frescura_bajadas`, `frescura_lectura`) disparan antes los eventos de Actividad.
- [ ] **NO está en producción.** Pegar la migración (UNA parte, fuera del horario de tienda; `lock_timeout = 3s`, re-ejecutable) y después refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`) para que entre al diccionario.
- [ ] Productos (siguiente etapa, decidido que se ve en la sede de quien lo hizo): altas con su stock inicial, ediciones con antes→después desde `historial_producto_cambios` agrupadas por guardado.
- [ ] Ajenas a esta rama, vistas al correr las pruebas en el Postgres local compartido: `club_permisos` (2 casos: celular), `eliminar_producto` (espera 1 línea de venta de «Blusa Emma», hay 2), `roles_por_modulo` (una terminal administrativa de más). Son datos de la base local, no código.
