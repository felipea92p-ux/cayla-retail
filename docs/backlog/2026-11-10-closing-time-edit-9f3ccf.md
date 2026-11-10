# Backlog — closing-time-edit-9f3ccf (2026-11-10)

- [ ] **POR PEGAR (2026-11-10)** — pegar en producción `20261110213000_hora_de_cierre_sale_del_horario_de_la_tienda.sql` (Felipe; una ejecución). Después, abrir Caja en una tienda y ver el aviso de cierre y la proyección.
- [ ] **Prueba de base propia** (`scripts/pruebas/`, y su lista en `scripts/ci/pruebas-postgres.mjs`): `fn_hora_cierre_de` con cierre por fecha, día sin fila, sede sin horario por días y 24:00.
- [ ] **Caja abierta un día en que la tienda no abre** (ej. LIM un domingo): el recordatorio usa el cierre del día de apertura, que ahí no existe, así que no avisa. Decidir con Felipe si debe recordar con el último cierre de la semana.
- [ ] `ubicaciones.hora_cierre` queda solo como respaldo de sedes sin horario por días y ya no se edita en ninguna pantalla; decidir si se retira cuando todas las tiendas tengan horario.
- [ ] Verificar en el navegador la tarjeta «Hora de cierre» (con y sin el módulo «Datos y plazos de la tienda web», claro y oscuro).
