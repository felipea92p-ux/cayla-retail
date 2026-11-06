## Las 36 de Finanzas · tarea 28 (parcial)
- [x] Chip de costo estimado en ¿Ganamos? (web, sin migración).
- [x] Medidor de confianza: contar bancos con saldo fechado (migración `20261106015000`, hecha y probada en local; **falta pegarla en producción, con el OK de Felipe**).
- [ ] `respuestaTuyo` recibe `vale.cuadra`; «No cuadra» arriba del CSV del Balance.
- [x] Felipe decidió: nivel en palabras, sin cifra.
- [ ] Ver el chip en pantalla con ventas de prendas sin registrar (la base local puede no tenerlas).

## Las 36 de Finanzas · tarea 18 (cierres y planilla impaga) — decisiones de Felipe, 2026-11-05 (nada construido)
Contexto: Dynamic cierra la planilla del 29 al 28 y el período cuenta en el mes en que TERMINA (D-35); entra al libro recién cuando Dynamic lo marca pagado, 1 a 3 días después del 28 en la práctica. Felipe cierra el mes entre el 1 y el 6.
- [x] Planilla impaga del mes **bloquea el cierre**, desde el primer cierre (octubre; su planilla se pagó el 4-nov, no lo traba).
- [x] **Solo un Admin** puede saltar ese bloqueo, con un motivo escrito que queda en el cierre (`periodo_cierres.avisos`).
- [x] Un mes **solo se cierra si el anterior ya está cerrado** (chequeo `mes_anterior` bloqueante en `fn_cierre_mes_estado`; exime unidades sin asientos y meses antes de `inicio_finanzas`).
- [x] **Reabrir solo el último cerrado** (`reabrir_periodo`).
- [x] Si Dynamic corrige la planilla de un mes ya cerrado: **solo avisar** que la huella ya no coincide (ya lo hace el chequeo de huella); nunca reabrir solo.
- [x] El chequeo `planilla` lee `public.periodos_planilla.estado` del período que termina en el mes, no `pm.este_mes` (una sede con menos de 3 personas quedaría frenada siempre). No congelar la provisión (ADR-0453 §2).
- HECHO el 2026-11-05: migración `20261106022000` (parches anclados + `cerrar_periodo_saltando_planilla`), suite nueva `pnpm pruebas:cierre-orden-y-planilla` (19/19 en local), pantalla del cierre con el botón «Cerrar sin la planilla…» solo para el Admin. **Falta pegarla en producción (OK de Felipe) y ver la pantalla con una cuenta Admin.** Nota: el chequeo `planilla` sigue leyendo `fn_planilla_periodos` (períodos pagados), no `periodos_planilla.estado`; una unidad que tuvo planilla en los últimos 3 meses y este mes no tiene ninguna queda frenada hasta que un Admin la salte.
