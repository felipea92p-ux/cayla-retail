# 2026-11-09 · El vigía diario de invariantes: producción se revisa sola cada madrugada (ADR-0632)

- **Qué pasó:** la auditoría del día encontró que las 28 reglas de «estado imposible» de `/chaos` (stock contra movimientos, venta contra
  pagos, boleta contra venta…) solo se miraban en la base local. En producción, donde se pega SQL a mano casi a diario, nadie las corría.
- **Qué hice:** la base guarda esas reglas como datos, sacadas del detector y con una prueba que no deja que se separen. Un trabajo de Vercel
  las corre a las 3:30, recuerda lo que ya estaba roto y avisa solo lo nuevo a Sentry y a una lente del Observatorio del Admin. Lo que no
  pudo mirar dice «error», nunca «limpia».
- **Por qué así:** con la forma de la casa (Vercel Cron, no `pg_cron`); comparando por identidad y no por fila (si no, la misma venta
  descuadrada volvería «nueva» cada mañana); y avisando donde Felipe mira, porque la alarma de deriva en GitHub lleva 43 días en rojo sin
  que nadie la lea.
- **Felipe se lleva:** pegar una migración (`20261109152000`, una parte) y correr una vez `select retail.fn_correr_invariantes();` para ver,
  por primera vez, cuánto de lo que debería cuadrar en producción no cuadra. Desde ahí, si algo se rompe, lo ve en su Observatorio a la
  mañana siguiente.
