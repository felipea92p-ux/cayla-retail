## Las 36 de Finanzas · tarea 28 (parcial)
- [x] Chip de costo estimado en ¿Ganamos? (web, sin migración).
- [x] Medidor de confianza: contar bancos con saldo fechado (migración `20261106015000`, hecha y probada en local; **falta pegarla en producción, con el OK de Felipe**).
- [ ] `respuestaTuyo` recibe `vale.cuadra`; «No cuadra» arriba del CSV del Balance.
- [x] Felipe decidió: nivel en palabras, sin cifra.
- [ ] Ver el chip en pantalla con ventas de prendas sin registrar (la base local puede no tenerlas).

## Las 36 de Finanzas · tarea 18 (cierres y planilla impaga) — decisiones de Felipe, 2026-11-05 (nada construido)
Contexto: Dynamic cierra la planilla del 29 al 28 y el período cuenta en el mes en que TERMINA (D-35); entra al libro recién cuando Dynamic lo marca pagado, 1 a 3 días después del 28 en la práctica. Felipe cierra el mes entre el 1 y el 6.
- [ ] Planilla impaga del mes **bloquea el cierre**, desde el primer cierre (octubre; su planilla se pagó el 4-nov, no lo traba).
- [ ] **Solo un Admin** puede saltar ese bloqueo, con un motivo escrito que queda en el cierre (`periodo_cierres.avisos`).
- [ ] Un mes **solo se cierra si el anterior ya está cerrado** (chequeo `mes_anterior` bloqueante en `fn_cierre_mes_estado`; exime unidades sin asientos y meses antes de `inicio_finanzas`).
- [ ] **Reabrir solo el último cerrado** (`reabrir_periodo`).
- [ ] Si Dynamic corrige la planilla de un mes ya cerrado: **solo avisar** que la huella ya no coincide (ya lo hace el chequeo de huella); nunca reabrir solo.
- [ ] El chequeo `planilla` lee `public.periodos_planilla.estado` del período que termina en el mes, no `pm.este_mes` (una sede con menos de 3 personas quedaría frenada siempre). No congelar la provisión (ADR-0453 §2).
- Migración con parche anclado a `fn_cierre_mes_estado`, `reabrir_periodo` y `cerrar_periodo`; casos nuevos en `pruebas:cierre-mes`; ajustar las suites que llaman a `cerrar_periodo`. Pegarla en producción espera el OK de Felipe.
