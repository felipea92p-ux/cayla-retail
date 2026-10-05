# ADR-0335 · Activos «ya lo teníamos»: lo anterior al sistema entra sin inventar un pago

- **Fecha:** 2026-10-04 · **Estado:** construido y probado en local (25 casos + regresión de 8 pruebas existentes, 560 casos, 0 fallas) y
  **ensayado en producción con ROLLBACK** (lote que termina en excepción a propósito). **SIN PEGAR en producción:** la política de la
  herramienta bloqueó la escritura (cambio de esquema); la migración y la carga del Taller las pega Felipe en el SQL Editor.
- **Pedido:** Felipe, 2026-10-04: «reconstruir los activos de cada sede y luego tener un balance» — Taller, TRU y AQP, cada uno en su sede,
  más una vista integrada del total; «súbelo como activos, tú ve la mejor forma según normas internacionales y deprécialo según las
  normas contables del Perú».
- **Complementa:** ADR-0195 (Finanzas, F2b activos fijos), ADR-0198 (diario derivado), ADR-0072 (las 39 filas que no se rescataron),
  ADR-0332 (Finanzas cuenta desde una fecha). **No toca** `registrar_activo`, el diario, el libro de dinero ni el Balance.

## El problema (medido en producción, solo lectura, 2026-10-04)

- `retail.activos_fijos` tiene **0 filas** en las 4 sedes. Las 39 máquinas del Taller que existían el 12-sep (volcado) ya no estaban el
  15-sep: el corte V1→V2 conservó la tabla vacía, no las filas (ADR-0072 dice «rescatado»). Nunca hubo un `insert` en git: entraron por
  el SQL Editor. Los respaldos de Supabase no se pudieron revisar desde aquí.
- Con 0 activos el Balance diría «S/ 0 en activos fijos» y el Estado de resultados no llevaría depreciación.
- **Un activo no podía entrar sin un pago.** El candado `activos_fijos_pago_coherente` exige comprobante o medio de pago, y de ese pago
  salen una resta en la cuenta que pagó, un asiento al diario y, en efectivo, un egreso del cajón. Para una remalladora comprada en
  agosto de 2025, antes del sistema, nadie sabe con qué se pagó: obligar a decirlo es inventar un pago.

## Decisión

DECIDÍ: **una marca explícita `activos_fijos.carga_inicial` («ya lo teníamos») y una función propia `cargar_activo_inicial`, solo del
líder.** La marca implica «sin comprobante, sin medio de pago, sin egreso, sin cuenta» (el mismo `CHECK`, ahora con dos ramas), y un
disparador aparte (`fn_activos_carga_inicial_validar`) cierra dos cosas: la fecha no es futura ni cae en o después del arranque del
Balance, y la marca no se cambia después. Corregir una carga es anularla y volver a cargarla (`anular_activo`, con un token nuevo).

DESCARTÉ:
- **Un «medio de pago» falso** (`transferencia`, `apertura`): `fn_dinero_libro`, `fn_asientos`, la cuenta sellada y los saldos lo leen en
  seis sitios y los seis tendrían que aprender a ignorarlo. Con la marca, un `medio_pago` nulo ya queda fuera del libro de dinero por
  su propio filtro y `fn_activos_sellar` ya deja pasar un activo sin medio: se probó que la carga agrega **0** líneas al libro.
- **Reescribir `fn_activos_validar`:** en producción NO es la del repo (la parcharon 20260925110000 y 20260925150000: 3,735 caracteres
  vivos contra 3,230 del repo); recrearla borraría los parches sin avisar. La regla nueva vive en su propio disparador.
- **Cargarlas por la pantalla con un medio real** (yape, transferencia): afirmaría en los libros un pago que no se conoce.

SE ROMPE SI: alguien lee `medio_pago is null` como «efectivo» (`fn_asiento_cuenta_de_medio(null)` devuelve `'101'`) para un activo con
fecha de DESPUÉS del arranque: acreditaría la caja con plata que nunca salió. Por eso el disparador exige fecha anterior al arranque.
Mientras `inicio_finanzas` (ADR-0332) no se fije, el diario de meses anteriores al arranque puede mostrar ese crédito a la caja; no entra
al Balance, que parte de los saldos de arranque.

## Reglas que decidió Felipe (2026-10-04)

| Regla | Decisión |
|---|---|
| Costo | **El total pagado, con IGV**, sin separar el IGV (CAYLA tiene mucho IGV a favor por la mercadería; «lo que importa es reconstruir con información real de ahora en adelante»). |
| Monto mínimo para ser activo | **S/ 150** por unidad; lo de menos queda como gasto. |
| Ya depreciado | **Si al arranque ya está depreciado por completo, no se carga.** |
| Compras repartidas entre sedes en SINATRA | **Tal cual cada hoja:** cada sede carga su porción, con la nota «porción de compra compartida». |
| Día de arranque del Balance | **1-oct-2026.** Todo lo comprado hasta septiembre es carga inicial; desde octubre, compra normal con su pago. |
| Fuente de verdad | Las listas ordenadas que Felipe entregó (Taller LIM y las actas de custodia de TRU y AQP). Los libros SINATRA de Drive «tienen múltiples errores»: sirven para buscar fecha y costo, no para decidir qué existe. |
| Una máquina agrupada («3 JUKI por S/ 8,784») | Partes iguales, anotado en la nota de cada fila (no se tiene el precio de cada una). |

## Norma consultada (texto oficial, 2026-10-04)

- **Reglamento de la Ley del IR, cap. VI (SUNAT):** art. 22 b — máximo 10 % anual para maquinaria y otros bienes, 25 % para equipos de
  procesamiento de datos; lo deducible es lo contabilizado en el ejercicio, sin rectificar cerrado el ejercicio. 22 c — se deprecia desde
  el **mes de uso**. 22 f — control permanente de cada bien. Art. 23 — hasta ¼ UIT por unidad (S/ 1,375 en 2026, UIT S/ 5,500, DS
  301-2025-EF) el contribuyente puede llevarlo a gasto, salvo que sea parte de un conjunto necesario para funcionar.
- **NIC 16:** el costo es el precio de compra más los impuestos indirectos **no recuperables**; depreciación sistemática en la vida útil.
- El sistema ya trae vidas de 10 años (maquinaria, muebles, equipos) y 4 años (cómputo) = los máximos de SUNAT: libros y fisco coinciden.

**Dos apartamientos conocidos, que decide el contador:** (1) el sistema deprecia desde el **mes siguiente** a la fecha (`fn_meses_depreciados`),
no desde el mes de uso: ≈ S/ 190–220 de diferencia en la lista del Taller; (2) el costo se guarda **con IGV**: donde el IGV se usó como
crédito fiscal, el costo tributario es sin IGV, y capitalizarlo con IGV sobreestima la depreciación deducible.

## Qué se cargó y qué falta

- **Taller LIM:** 16 activos (de 14 líneas; 3 JUKI y 2 SIRUBA vienen agrupadas) por **S/ 21,780.67**; ya depreciados a fines de septiembre
  S/ 2,673.53; valor neto S/ 19,107.14. Quedó fuera la «Mesa plegable» (S/ 139.50, menos de S/ 150). Las 5 filas IME de la hoja que no
  estaban en la lista curada (S/ 2,100: plancha industrial, mesa de corte, sillas, cortadora, planchador) NO se cargan: no están en la
  lista de Felipe y el «Patrimonio» del propio libro las omite por categoría.
- **Tienda TRU (9 equipos) y Tienda AQP (8 equipos): preparadas, ensayadas en producción con ROLLBACK, sin pegar.** Las actas de custodia dicen qué
  existe y su serie; la fecha y el costo salen de la compra que se encontró en las hojas «Gastos» de SINATRA. TRU **S/ 18,724.14** (depreciado a
  fines de septiembre S/ 5,230.79; neto S/ 13,493.35) y AQP **S/ 19,133.63** (depreciado S/ 4,377.99; neto S/ 14,755.64); 0 totalmente depreciados.
  Reglas de Felipe: **cada equipo una sola vez, a costo completo, en la sede donde está** (no la porción que reparte la hoja: 4 Mac mini comprados,
  3 en TRU y 1 en AQP, mientras la hoja de TRU carga solo la parte de TRU); emparejamientos aproximados como en la tabla que se le mostró (Mac mini
  con N.° 134 y 136, MacBook M5 con el N.° 257 de TRU, iPhone 15 con «Archi-Iphone», Redmi con las compras Xiaomi); los 3 equipos sin compra en las
  hojas (iPhone 12, Canon EOS 80D + lentes, Lenovo V14-IIL) van con el valor del acta, **3 años de antigüedad** y la nota «ESTIMADO». Las series son
  las del acta, transcritas de una captura: se verifican contra el equipo. Total de las tres sedes: **S/ 59,638.44** de costo, S/ 12,282.31
  depreciados y S/ 47,356.13 de valor neto al 30-sep-2026.
- Los libros SINATRA tienen errores que se dejaron intactos: montos de 2021–2023 de TRU que parecen proporcionales (×0.1125), compras repartidas por
  tercios o mitades entre sedes, filas marcadas `adm` que parecen activos y posibles duplicados entre hojas.
- Los datos (costos, series) **no van a git**: el cargador vive fuera del repo.

## Cómo se pega (CLAUDE.md «Políticas y deadlocks»)

Dos ejecuciones separadas del SQL Editor, en orden: **PARTE 1** (la tabla) y **PARTE 2** (disparador, función, lista); después la carga del
Taller y la de TRU y AQP, cada una con la sesión del líder (`set_config('request.jwt.claim.sub', …, true)` en el mismo lote). Idempotente (tokens fijos por fila).
Verificación posterior, solo lectura: `fn_activos_lista('2026-09-30')` del Taller = 16 activos, S/ 21,780.67, depreciado S/ 2,673.53;
`fn_dinero_libro` sin líneas `activo:%` nuevas; `fn_saldos_iniciales_propuesta('2026-10-01')` con la 333 en S/ 15,327.10 y la 391 en
S/ 2,673.53 (solo del Taller).

## Pruebas

`pnpm pruebas:activos-carga-inicial` (25 casos, ROLLBACK, en `ci.yml`): marca y depreciación, 0 líneas al libro de dinero (contra una compra
normal que sí lo mueve), entra a los saldos de arranque, solo el líder, datos inválidos, los estados imposibles, el candado del arranque,
anular y dar de baja. Se verificó con dos mutaciones (quitar el candado de fecha; permitir medio de pago en la carga): la prueba se pone roja
en ambas. Con `APLICAR_MIGRACION=1` se corre antes de pegar la migración, dentro de cada transacción, sin tocar la base local compartida.
