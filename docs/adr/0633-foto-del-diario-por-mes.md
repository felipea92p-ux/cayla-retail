# ADR-0633 — La foto del diario: cada mes que ya terminó se guarda calculado y se rehace solo cuando algo suyo cambia

- **Fecha:** 2026-11-09 · **Estado:** en construcción (`/construir`, rama `claude/foto-del-diario-cb64df`).
- **Nace de:** el pico de memoria de producción del 2026-11-09 (09:07 y 11:44, con swap) y el diagnóstico de `fn_resumen_finanzas`
  (5,9 s de promedio, ~256.000 bloques por llamada). Felipe preguntó si se podían «cerrar los meses solos y reabrirlos al detectar un
  movimiento»; se le propuso esto en su lugar y lo aprobó el mismo día («Apruebo el plan», «Apruebo la lista»).
- **Relacionados:** ADR-0195 F9 y `20260925180000` (Cierre de mes: el diario congelado), ADR-0583 (`fn_diario` no rearma lo cerrado),
  ADR-0622 (rendimiento de Finanzas, medido), ADR-0632 (el vigía de la madrugada; descarta `pg_cron`), ADR-0166/0352 (Vercel Cron).

## El problema

El diario contable (`fn_asientos`) se arma de cero cada vez que alguien lo mira, desde 57 tablas. Solo se lee guardado lo que está en un mes
**cerrado** (`diario_cerrado`), y no hay ningún mes cerrado. Una carga de Finanzas ▸ Resumen arma el diario cuatro veces, y el balance y el
flujo recorren la historia desde el 28-sep: el costo crece con cada mes que pasa. En una base de 2 GB y 2 núcleos, una sola carga empujó la
máquina a usar swap.

Cerrar los meses solos no sirve: el cierre pone un candado por fecha (nada con fecha de ese mes se puede registrar, cambiar ni anular), exige
chequeos (cajas cerradas, egresos clasificados, prendas regularizadas) y es lo que se le entrega al contador. Reabrirlo solo cuando entra un
movimiento le quitaría el sentido.

## Decisión

DECIDÍ: una **foto** del diario por mes, invisible para quien usa el sistema, sin candado y sin cambiar ninguna cifra.

1. **Qué se guarda.** Para cada mes que ya terminó, las líneas de `fn_asientos` de **todas** las unidades, con la planilla incluida
   (`diario_fotos`, `diario_foto_lineas`). Al leerla se filtra lo que cada cuenta puede ver (sus sedes; la planilla solo si la ve en Dynamic),
   igual que hoy con lo congelado. El mes en curso nunca tiene foto: cambia con cada venta.
2. **Quién la toma.** Un trabajo de **Vercel Cron** con la llave de servicio, no `pg_cron` (ADR-0632: el repo lo descartó tres veces).
   `fn_asientos` gana un modo interno que solo usa la llave de servicio (el mismo patrón de `fn_tomar_comprobantes_para_reintento`,
   `auth.role() = 'service_role'`): ve todo y la planilla, porque la foto es de la empresa entera.
3. **Cuándo vence.** Cada tabla que alimenta el diario anota la fecha **más antigua** que tocó, solo si es de un mes pasado
   (`diario_vencido_desde`). Una venta de hoy no escribe nada extra: el mostrador no paga este cambio ni espera turno. Las tablas sin fecha
   (configuración: tarifas, parámetros, cuentas) vencen todos los meses, porque cambian poco. Las de permisos no vencen nada: la foto guarda
   todo y el permiso se aplica al leer. La planilla de Dynamic no se vigila con disparadores (es otro sistema): la foto guarda una huella de lo
   que leyó de Dynamic para ese mes y, si al leer ya no coincide, ese mes se calcula en vivo.
4. **Cuándo se rehace.** El trabajo programado rehace cada 5 minutos los meses vencidos (desde la fecha anotada hasta el mes pasado) y cada
   madrugada rehace todos, por si alguna regla del diario depende del día y no de una escritura.
5. **Cómo se lee.** `fn_diario` toma la foto de los meses que terminaron si está al día; desde el primer mes sin foto válida, calcula en vivo
   como hoy (el mismo corte que ADR-0583 usa para lo cerrado). Lo cerrado sigue ganando. **Un interruptor** en `parametros_finanzas`, apagado
   de fábrica, decide si se usa: apagarlo vuelve todo a como está hoy, sin migración.
6. **Quién la vigila.** Una invariante más del vigía de la madrugada (ADR-0632): «una foto no coincide con el diario en vivo». Si salta, el
   Observatorio lo dice y la foto se rehace en la próxima vuelta.
7. **El candado.** Una prueba del CI falla si una tabla nueva alimenta `fn_asientos` sin estar clasificada (vigilada, de configuración, de
   permisos o de Dynamic, cada una con su motivo).

DESCARTÉ:
- **Cerrar los meses solos y reabrirlos con cada movimiento:** cambia lo que significa cerrar (candado, chequeos, contador) y bloquearía las
  facturas que llegan tarde.
- **Una versión por mes con un disparador que la sube en cada escritura:** cada venta escribiría en la misma fila; en el mostrador eso es una
  fila de espera y un candado más. Con «la fecha más antigua tocada, solo si es pasada», lo de hoy no escribe nada.
- **Rehacer la foto dentro de la lectura:** las funciones de lectura tendrían que escribir (dejan de ser `stable`) y dos pantallas a la vez
  se pisarían. La lectura nunca escribe: si la foto no está al día, calcula en vivo como hoy.
- **`pg_cron`:** ver ADR-0632.
- **Vigilar con disparadores las tablas de Dynamic:** son de otro sistema; tocarlas desde retail es una decisión de los dos. La huella al leer
  no las toca.

SE ROMPE SI: una tabla nueva alimenta el diario y nadie la vigila (lo ataja el candado del CI; si se escapa, el vigía lo dice a la mañana
siguiente); una regla del diario cambia con el tiempo sin ninguna escritura (la reconstrucción de la madrugada la corrige en menos de un día);
o el trabajo programado deja de correr (las fotos quedan vencidas y todo se calcula en vivo, como hoy: más lento, nunca viejo).
