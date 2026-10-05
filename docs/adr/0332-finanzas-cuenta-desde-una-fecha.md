# ADR-0332 · Finanzas cuenta desde una fecha: lo de antes de que el sistema se usara no entra a los estados

- **Fecha:** 2026-10-04 · **Estado:** construido y probado en local, en la rama `claude/ajuste-fecha-nomina-07b3ed`. **La migración
  `20261004190000_finanzas_cuenta_desde.sql` YA ESTÁ EN PRODUCCIÓN** (Felipe la pegó el 2026-10-04; verificada por efectos, solo lectura:
  columna con su `check`, `fn_finanzas_desde`, `guardar_inicio_finanzas`, las tres funciones parchadas, `parametros_finanzas` con la clave,
  `anon` sin ejecución y sin restos de `pg_temp`). El corte sigue **sin fecha** hasta que se elija en Configuración tras publicar la web.
- **Pedido:** Felipe, 2026-10-04, sobre una captura de Finanzas ▸ Resumen: «mi sistema es prácticamente nuevo, por lo que poner ese egreso
  de nómina que proviene de Dynamic de septiembre no tendría mucho sentido; mejor que todo corra a partir de octubre». Decidió la opción A
  (fecha configurable) entre tres que se le propusieron.
- **Complementa:** ADR-0195 (Finanzas), ADR-0198 (diario derivado y cierre de mes), D-33/D-35 (la planilla se lee de Dynamic, por período
  del 29 al 28), ADR-0253 (Configuración delegable). **No toca** ADR-0133 (`planilla_por_sede`).

## El problema (medido en producción, solo lectura, 2026-10-04)

| Qué | Septiembre | Octubre (4 días) |
|---|---|---|
| Ventas | 15 por S/ 1,128 (piloto) | 165 por S/ 15,291 |
| Gastos registrados (`retail.gastos`, vigentes) | **0** | 0 |
| Saldos de arranque (`saldos_iniciales`) | 0 filas en total | |
| Meses cerrados (`periodo_cierres`) | 0 en total | |

El Resumen decía «Utilidad de septiembre –S/ 39,613», «CAYLA no llegó a cubrir sus costos» y «TRU perdió S/ 23,120». Como no hay un solo
gasto registrado, los S/ 22,850 de «gastos de TRU» eran **100 % la planilla de Dynamic** del período 29-ago a 28-sep, contra ventas que casi
no existían. Un número que no dice nada del negocio, que además disparaba avisos y pedía cerrar un septiembre vacío.

## Decisión

DECIDÍ: **una sola fecha, `parametros_finanzas.inicio_finanzas` (siempre día 1 de un mes), que corta lo REGISTRADO antes de ella** — el
diario (`fn_asientos`) y el Estado de resultados (`fn_estado_resultados`) no devuelven nada anterior; de ahí leen Resumen, Reportes,
Balance y Cierre, así que un solo punto corta a todos. La fija el líder (o quien tiene Configuración) en **Configuración ▸ Caja y avisos ▸
«Desde cuándo cuenta Finanzas»**, con el responsable firmando y el antes/después en `configuracion_historial`. Nace nula: pegar la
migración no cambia ningún número hasta que alguien elige la fecha.

DESCARTÉ:
- **B · filtrar solo la planilla con una fecha escrita en el código.** Septiembre seguiría mostrando S/ 1,128 de ventas sin ningún gasto
  —una «ganancia» falsa, el mismo problema al revés—, el Cierre seguiría pidiendo septiembre, y mover la fecha exigiría otra migración en
  producción.
- **C · esconder septiembre solo en pantalla (selector de mes).** Resumen, Cierre y Balance seguirían calculándolo por debajo; el problema
  se tapa, no se arregla.
- **Cortar también la fuente de la planilla (`fn_flujo_planilla_pagada`) o la vista `planilla_por_sede`.** Es el corte «obvio» y es
  peligroso: la proyección de caja usa la **última planilla pagada** como estimado de la que viene. La de octubre (29-sep a 28-oct) se
  pagará aunque el sistema sea nuevo; sin ella, «16 días de caja» crecería y la alerta «la semana 26-oct a 1-nov llegas a –S/ 7,287, bajo
  tu mínimo de S/ 15,000» (S/ 30,062 de planilla) **desaparecería**: se perdería el aviso más útil del tablero. La prueba de mutación lo
  demuestra: con ese corte ingenuo, 4 casos de `finanzas_arranque.mjs` se ponen rojos.
- **Ampliar la firma de `guardar_parametros_finanzas` con un 4.º parámetro.** Dos ajustes distintos en un mismo guardado: si el segundo
  falla, el primero ya quedó. Es una función nueva y pequeña (`guardar_inicio_finanzas`), con su propio botón.

SE ROMPE SI:
1. **Dynamic marca «pagado» el período de octubre DESPUÉS de que se cierre octubre**: octubre saldría sin sueldos y se vería como
   ganancia. El chequeo «Planilla del mes leída de Dynamic» del Cierre ya lo avisa; no se cierra octubre antes de que Dynamic pague.
2. **Una migración futura recrea `fn_asientos` o `fn_estado_resultados` copiando un texto viejo del repo**: devuelve el corte sin avisar.
   Parte siempre de la definición viva (`pg_get_functiondef`) o reaplica esta migración; `finanzas_arranque.mjs` lo vigila en el CI.
3. **Alguien cierra un mes mientras otro líder mueve el corte, en el mismo instante.** `guardar_inicio_finanzas` toma la fila de parámetros
   `for update` (dos cambios del corte se ordenan), pero no se ordena contra `cerrar_periodo`. Es un riesgo de milisegundos entre dos
   líderes; se acepta y queda dicho aquí.

## Qué se corta y qué NO (a propósito)

| Se corta (lo registrado) | NO se corta (lo que viene o es obligación) |
|---|---|
| Estado de resultados, utilidad, «no llegó a cubrir sus costos», «perdió S/ X en septiembre» | **La proyección de caja** (`fn_flujo_caja_proyeccion`): días de caja, semanas bajo el mínimo, la planilla que vendrá |
| El diario y, por él, Balance y Cierre de mes (septiembre ya no se ofrece para cerrar) | **Impuestos**: el IGV de septiembre se declara a SUNAT en octubre; el Resumen sigue diciendo «septiembre: S/ X por declarar» |
| «Lo que ya pasó» del Flujo deja de **listar** la planilla pagada anterior | **Eficiencia del Taller** y la vista `planilla_por_sede`: el costo por prenda necesita los sueldos de septiembre |
| | Dinero (cuentas, cajas, conciliación) y Por pagar: son saldos reales, no un período |

## Contrato (3 líneas, Liskov)

`guardar_inicio_finanzas(p_fecha date)` **promete** fijar o quitar (nulo) la fecha, dejar el antes/después en `configuracion_historial` con el
responsable, y no borrar ni editar nada ya registrado — solo cambia lo que las pantallas cuentan. **Asume** módulo «Configuración», día 1,
no futuro y ningún mes cerrado. **Falla** con un mensaje que la persona entiende (nunca un código).

## Estados imposibles (Lamport) y quién los impide

| Estado imposible | Se impide con |
|---|---|
| Un primer mes a medias (no se puede cerrar) | `check` de la columna: `extract(day from inicio_finanzas) = 1` |
| Un corte en el futuro que esconde el mes en curso | `guardar_inicio_finanzas` |
| Un corte movido bajo un mes ya cerrado (su diario congelado diría otra cosa) | `guardar_inicio_finanzas` (cualquier `periodos.estado = 'cerrado'`) |
| Cerrar por accidente un mes anterior al corte (congelaría un diario vacío y bloquearía mover el corte) | la web no lo ofrece (`CierreMes` filtra los meses; la página dice desde cuándo cuenta). **La base sí lo permitiría**: ver el backlog |

## Cómo se pega en producción

Una sola ejecución del archivo. Orden: **primero el SQL, después la web** (el SQL solo no cambia nada; la web sola no rompe nada). Antes de
escribirla se comprobó en producción que cada ancla aparece **exactamente una vez** en el texto vivo, y estas son las huellas md5 de las
definiciones que se reescriben (si cambian antes de pegar, la migración aborta entera en vez de pisar un parche):

`fn_asientos 1f0e98345be8ae06900e46742aa77f61` · `fn_estado_resultados 33984d54a7bcac84c0bf942436fdc4a6` ·
`fn_flujo_caja_real 4ea4ef73526e51be852bd4368544097d` · `fn_parametros_finanzas 262d8a7e39edd1335bcb48023656bab0`

`alter table retail.parametros_finanzas` (una fila, solo la leen funciones de Finanzas) con `lock_timeout = 3s`; sin políticas ni
disparadores, así que no toma las tablas de `auth`/`storage`. Pegarla dos veces no hace nada la segunda.

## Pruebas

- `pnpm pruebas:finanzas-arranque` (39 casos, ROLLBACK, cableada en `ci.yml`): sin corte nada cambia; con corte septiembre sale vacío, un
  rango que lo cruza arranca en él, el diario no trae nada anterior; el Flujo deja de listar esa planilla y **la proyección sigue contando
  la última planilla pagada aunque sea anterior al corte**; las reglas de `guardar_inicio_finanzas` (día 1, no futuro, mes cerrado, permiso,
  repetir no escribe, quitar el corte); `anon` no ejecuta; pegar la migración dos veces deja las funciones iguales.
- **Mutación** (probada): quitar el recorte de `p_desde` rompe 3 casos; cortar también la fuente de la planilla rompe 4.
- `finanzas-arranque-reglas.test.ts` (18 casos) y 9 casos nuevos en `resumen-finanzas-reglas.test.ts`. Suite completa: 330 archivos, verde;
  `tsc` y `eslint` limpios.
- En el navegador, con la base local: Configuración ▸ Caja y avisos (escritorio y 375 px), Resumen antes/después, Cierre de mes y Reportes
  de un mes anterior al corte.
