## 🕘 Actividad: Existencias, Conteos y Traslados (2026-10-02, ADR-0207 act.) — rama `claude/activity-history-expansion-21e88c`

- [x] Migración `20261002233000_actividad_existencias_conteos_traslados.sql` aplicada y probada en LOCAL (`pnpm pruebas:actividad-inventario` 13/13, `pnpm pruebas:actividad` en verde).
- [x] Web: `MODULOS_CON_ACTIVIDAD` suma Existencias, Conteos, Traslados y los que ya anotaban (Clientes, Avisos del club, Productos); prueba que lo cruza con las migraciones.
- [x] Pruebas que desactivan el candado de `movimientos` tras preparar datos (`eliminar_producto*`, `purgar_producto_de_prueba`, `frescura_bajadas`, `frescura_lectura`) disparan antes los eventos de Actividad.
- [x] **EN PRODUCCIÓN** (2026-10-02, 18:01 Lima, a pedido de Felipe, `apply_migration` «actividad_existencias_conteos_traslados»): 5 disparadores creados, 197 líneas de lo pasado (133 de Existencias, 57 de Conteos, 7 de Traslados), la web no puede anotar a mano.
- [x] Corrección aplicada enseguida (`apply_migration` «actividad_prenda_por_referencia», ya dentro del archivo del repo): el nombre de la prenda es `referencia`, no `descripcion` (que es el detalle largo). Vale también para Cambios.
- [ ] **Decisión de Felipe:** las 133 líneas de Existencias reconstruidas antes de esa corrección dicen el detalle largo («Tirantes, top sin mangas…») en vez del nombre. Rehacerlas exige apagar un momento el candado de solo agregar de `actividad` y borrar SOLO esas líneas `carga_inicial` de hoy para volver a cargarlas.
- [ ] Refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`) para que las funciones nuevas entren al diccionario.
- [ ] Desplegar la web (fusionar el PR): hasta entonces el panel desde Existencias/Conteo/Traslados sigue diciendo «todavía no anota» aunque la base ya anota.
- [ ] Productos (siguiente etapa, decidido que se ve en la sede de quien lo hizo): altas con su stock inicial, ediciones con antes→después desde `historial_producto_cambios` agrupadas por guardado.
- [ ] Ajenas a esta rama, vistas al correr las pruebas en el Postgres local compartido: `club_permisos` (2 casos: celular), `eliminar_producto` (espera 1 línea de venta de «Blusa Emma», hay 2), `roles_por_modulo` (una terminal administrativa de más). Son datos de la base local, no código.
