# 2026-11-10 — Hora de cierre: una sola fuente, el horario de Tienda web

- **Qué pasó:** «Hora de cierre ▸ Poner» no dejaba editar y decía «Falta» en las 4 sedes, aunque el horario por días ya estaba cargado en Tienda web ▸ Conf. Tienda. `ubicaciones.hora_cierre` (la que lee Caja) estaba vacía: Caja no avisaba el cierre ni proyectaba.
- **Qué cambió:** el cierre sale de ese horario (`fn_hora_cierre_de` y `fn_horas_de_cierre`, ADR-0642). `getUbicaciones()` trae el cierre de hoy, el recordatorio usa el del día de apertura de la caja, y la tarjeta de Empresa y tiendas lo muestra («Hoy cerrada» si hoy no abre) y lleva a `/tienda-web/ajustes`. Sin la función en la base, todo cae a `hora_cierre`.
- **Pendiente de Felipe:** pegar `supabase/migrations/20261110213000_hora_de_cierre_sale_del_horario_de_la_tienda.sql` (una ejecución). Hasta entonces Caja sigue sin avisar.
- **Sin verificar:** la función en un Postgres local y la pantalla en el navegador.
