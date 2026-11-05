# ADR-0453 · La planilla estimada por sede: el mes deja de verse sin sueldos mientras Dynamic no paga

- **Fecha:** 2026-10-17 · **Estado:** construido y probado en local (Postgres 16, `pnpm pruebas:planilla-provision`, 31 verificaciones; web: 568
  archivos de pruebas, tipos, lint y Knip en verde; Resumen y Resultados vistos en el navegador con datos de ensayo). **La migración
  `20261018040000_planilla_provision_por_sede.sql` la pegó Felipe en producción el 2026-10-17** y se verificó en solo lectura: las dos funciones
  existen, con los permisos de la migración (`anon` no ejecuta ninguna; `authenticated` solo la pública), y la lectura real con la identidad de un admin
  dio, en las 5 sedes, lo mismo que el cálculo de Dynamic cortado hoy. Rama `claude/provision-by-location-b7aba1` (PR #1192).
- **Números reservados:** ADR `0453` y migración `20261018040000` (`pnpm reservar`).
- **Pedido:** Felipe, 2026-10-17, mirando «Qué tan seguro es este número» de Finanzas ▸ Resumen en Tienda AQP: la pieza «Sueldos del mes» decía
  «Dynamic todavía no pagó el período: hasta que lo haga, el mes se ve sin sueldos». «Esta parte se puede ir provisionando, porque cada sede
  tiene integrantes.» Y, al preguntarle cómo: Dynamic va sumando la boleta de cada persona día a día, hora a hora, así que el estimado se puede
  deducir con mucha exactitud; siempre el período actual; todas las sedes; nada que configurar.
- **Amplía a:** D-33 (retail LEE la planilla de Dynamic, sin duplicarla: ADR-0133, `20260921160000_planilla_por_sede.sql`) y ADR-0417 (el medidor
  de confianza). Lo asentado no cambia.

## El problema primero

La planilla solo llega a retail cuando Dynamic marca el período pagado, y su período va del 29 al 28 y se paga unos días después de cerrar. Casi
todo el mes, cada sede se ve **sin sueldos**: el «te quedan» del Resumen sale inflado, «Tu ritmo» pide menos de lo que hace falta vender y el
Estado de resultados muestra una utilidad que se desinfla de golpe el día que Dynamic paga. El medidor de confianza lo decía («A medias»), pero el
número seguía mintiendo en la dirección que más engaña: todo parece más rentable de lo que es.

Dynamic, en cambio, no está ciego: calcula la boleta de cada persona con las marcaciones del período abierto. Lo que faltaba era leerla.

## Lo que se midió antes de decidir (producción, solo lectura, 2026-10-17)

- La boleta en vivo de un período YA pagado reproduce **al céntimo** lo que Dynamic congeló, en 4 de las 5 sedes con planilla; la quinta (una oficina)
  difiere por un ajuste redondo posterior al congelado. Dynamic congela exactamente lo que calcula `fn_planilla_calcular`, por grupo de vínculo.
- Esa función la cuida Dynamic a propósito: no se concede a `authenticated`, solo la llaman funciones suyas ya guardadas por `fn_es_admin_o_lider()`.
  La puerta oficial que SÍ está concedida es `public.fn_proyeccion_periodo(periodo)`: la misma boleta que un admin ve en la pantalla de Planilla de
  Dynamic, con la misma guardia. **Retail la usa a ella**: no abre ninguna puerta nueva a los sueldos de nadie.
- Se paga de dos maneras: por horas (tiendas, Taller, buena parte de la central) y con **sueldo fijo**. En un período abierto, la boleta ya trae el
  sueldo fijo del mes ENTERO y las horas solo hasta hoy; por eso «lo que corresponde pagar hasta hoy» pide prorratear al fijo.
- **La fórmula de abajo, aplicada a la boleta del período ABIERTO, dio exactamente el mismo devengado que el cálculo de Dynamic cortado hoy, en las 5 sedes** (0,00 % de
  diferencia, con los bonos y descuentos sueltos del período). Una primera simulación SIN período dio ±1,5 %: esa diferencia eran justo los bonos y descuentos, que solo
  entran cuando el cálculo conoce el período. Por eso se usa `fn_proyeccion_periodo` (que sí lo conoce) y no un rango libre.
- Una sede aparece con un mínimo de 3 personas (el piso de `planilla_por_sede`): una tienda con justo 3 queda al borde.

## Decisión

1. **Dos funciones de solo lectura** (`retail.fn_planilla_provision_calc`, interna, y `retail.fn_planilla_provision`, la que llama la web, acotada al
   mismo alcance que el Estado de resultados: `fn_ve_finanzas_de_todo()`, la regla única de Finanzas, ADR-0433). Por cada período de Dynamic SIN pagar cuyo fin cae en el rango, piden `fn_proyeccion_periodo`, y por sede devuelven:
   - **devengado** — lo que corresponde pagar hasta hoy: quien cobra por horas, lo trabajado; quien tiene sueldo fijo, su sueldo en proporción a
     los días corridos del período. Es lo que Dynamic pagaría hoy.
   - **al_cierre** — lo que costaría el período entero: las horas al ritmo de lo trabajado y el fijo completo. Solo con 7 días corridos o más (con menos,
     una semana rara decidiría el mes): si no, nulo y la web usa lo devengado.
   La unidad es `total + provision_total`, **la misma definición de `planilla_por_sede`** (lo que le cuesta a CAYLA).
2. **Fuera del libro** (Felipe): se ve en Resumen y Resultados marcada «estimado», pero **no entra al diario, al Balance ni al cierre**. Se suma en la web
   (`lib/planilla-provision-reglas.ts`, `aplicarProvision`): más planilla, más gastos de operación, menos resultado y la cuenta 62 en el detalle.
3. **Siempre el período actual, leído de las boletas** (Felipe). Nunca «repetir el último período» ni promediar el historial.
4. **Un período está pagado o no lo está.** Apenas Dynamic lo marca pagado, la función deja de devolverlo y entra lo real por `planilla_por_sede` → diario:
   nunca se suman los dos. Un mes **cerrado** para esa unidad (`retail.periodos`) no recibe estimación: lo cerrado se queda cerrado.
5. **Todas las sedes, sin configuración** (Felipe): tiendas, Taller (por su tipo, no por su código `LIM`) y «de la empresa» (la central y la oficina de
   Trujillo, ubicación nula). Una sede nueva entra sola cuando Dynamic le pone al menos 3 personas. El equipo de cada sede es el que Dynamic tiene: no se
   usa `retail.colaboradores`.
6. **Nunca una persona.** Solo importes por sede, con el mismo piso que la vista (menos de 3 personas, oculta) y sin el grupo `prueba`. La respuesta no trae
   nombre ni persona (una prueba lo vigila). Se ve con la misma puerta que hoy: admin o líder en Dynamic (`fn_planilla_visible()`).
7. **Principio 9.** Sin Dynamic en la base, o sin ser admin o líder allá, devuelve cero filas sin error. Si Dynamic falla con UN período, se avisa en el log y
   se sigue con los demás. En la web, una lectura que falla deja el Resumen como estaba (con el motivo en el log del servidor); y mientras la migración no esté
   pegada en producción, la función «no existe» y el ERP sigue exactamente igual.
8. **El medidor de confianza** pasa «Sueldos del mes» de «a medias, sin sueldos» a «a medias, con N personas estimadas», con 4/5 del peso en vez de la mitad:
   la boleta de cada persona es la que Dynamic pagará y solo falta que confirme el pago. «Completo» sigue siendo solo con el período pagado.
9. **«Lo fijo del mes»** lleva los sueldos estimados al período entero (`al_cierre`) y lo demás al mes por regla de tres, como hacía.

## Lo que se corrigió de paso: los sueldos se contaban dos veces en el Pulso

En la base real, los «gastos de operación» **ya incluyen** los sueldos (cuenta 62) y el desgaste (681), y el resultado es `margen − gastos`. El Pulso (ADR-0417,
«camino A») los trataba como si fueran aparte: en la cascada, «Alquileres, servicios y otros gastos» repetía los sueldos y el desgaste, y una línea inventada de
«Otros ajustes a favor» los compensaba para que sumara; y «lo fijo del mes» los contaba dos veces. Casi no se veía porque la planilla estaba en cero casi todo el
mes. Con la provisión se habría visto en grande. Ahora «otros gastos» = gastos − sueldos − desgaste, y las pruebas del Pulso usan la FORMA REAL (antes escribían
los números como si fueran aparte, y por eso no lo cazaron). Una prueba nueva recorre el fixture real de la base.

## Lo que se descartó

- **Repetir el último período pagado** (lo que hoy hace el Flujo): ignora que una sede cambió de equipo o de horas, y el último período puede traer descuentos
  sueltos que no son el ritmo normal.
- **Extrapolar todo por regla de tres desde lo devengado.** Equivoca al sueldo fijo (ya viene entero) y a lo que no corre por días. Por eso el fijo se trata aparte.
- **Llamar al núcleo de Dynamic (`fn_planilla_calcular_nucleo`) con un corte en «hoy».** Dynamic la deja sin permiso a propósito, y no hacía falta: la puerta oficial,
  con el prorrateo del sueldo fijo, ya da lo mismo (ver arriba). No vale una puerta nueva a los sueldos.
- **Reconstruir la boleta en retail** (horas × sueldo) o multiplicar «integrantes de retail × costo medio»: duplicar el cálculo de Dynamic y arriesgar que diverja.
- **Un asiento provisional en el diario** (devengo contable de verdad): complica el cierre de mes y su huella el día que Dynamic paga distinto de lo estimado.
  Si el contador lo pide, es otra decisión (D-35).
- **Una tabla de configuración por sede**: Felipe eligió «nada: todo sale de Dynamic».

## Cómo se prueba

- `pnpm pruebas:planilla-provision` (Postgres, ROLLBACK; Dynamic simulado con una función de ensayo): el cálculo por sede (horas, fijo prorrateado, al cierre), el
  piso de 3, el grupo prueba, el mapeo del Taller y de «la empresa», que un período pagado y un mes cerrado no se estiman, que sin Dynamic o sin permiso devuelve
  vacío, que un período que falla no tira a los demás, los permisos y pegar dos veces.
- Web: `lib/planilla-provision-reglas.test.ts` (16), `lib/pulso-reglas.test.ts` (con la forma real), `lib/finanzas-confianza.test.ts`.
- **Lo que no se puede probar en local**: el contrato real de `fn_proyeccion_periodo` (la base local solo tiene un stub de Dynamic). Se midió a mano contra producción
  (arriba). Si Dynamic renombra una clave de la boleta (`sede`, `tipo_vinculo`, `sueldo_fijo`, `total`, `provision_total`), la provisión sale vacía o en cero, sin
  error: el síntoma sería «el mes vuelve a verse sin sueldos». Quien toque `fn_planilla_calcular` en Dynamic debe avisar.

## Lo que sigue

- **Comparar** lo que diga el Resumen, ya con la web publicada, con la pantalla de Planilla de Dynamic para el mismo período, y refrescar `docs/datos/generado/`
  (COMO-REFRESCAR.md). La migración ya está pegada (un solo pegado, solo `create or replace function`, sin políticas ni `alter`).
- **El Flujo de caja** (su salida «Pago de la planilla») sigue repitiendo el último período. Felipe pidió que las cifras sean las mismas: es el paso siguiente, en su
  propio PR, con `al_cierre` como fuente única (el Resumen muestra lo devengado a la fecha; el Flujo, lo que saldrá del banco el día de pago: dos cortes de la misma boleta).
- Si una tienda queda con menos de 3 personas en Dynamic, su estimación desaparece (la protección de quien cobra). Es una decisión de privacidad de D-33, no un error.

## Actualización 2026-10-22 — «Provisionado» y lo de HOY por horario (Felipe)

**Pedido.** Felipe, 2026-10-22: «Provisionado» en vez de «estimado», y estimar también lo de hoy «por horario». Migración `20261022081000_planilla_provision_hoy_por_horario.sql`
(reservada con `pnpm reservar`); el resto sale de este mismo ADR.

**El problema primero.** Dynamic no cuenta el día en curso: `fn_recalcular_jornada` solo llena `jornadas.horas_trabajadas` cuando hay entrada Y salida final; una persona
«abierta» o «en pausa» vale 0 y la planilla lo lee como `coalesce(horas_trabajadas, 0)`. Así que la provisión de arriba siempre iba un día atrás en horas (el sueldo fijo no:
corre por días corridos). Dynamic nunca estima «hoy por horario»; lo hace retail, con las tasas de la propia boleta y las marcaciones de hoy.

**Lo que se midió antes de decidir (producción, solo lectura, 2026-10-22).** Un día cerrado se estimó con lo que se sabía el día anterior y se comparó con lo que Dynamic sumó de
verdad (`fn_planilla_calcular` cortado en D−1 y en D; 17 días, 5 al 21 de octubre):
- el costo PROMEDIO por hora (`(total + provisión) / horas`) sobrestima 13 % de forma sistemática: mezcla la movilidad, que se paga por día presente;
- el modelo que separa las tasas —por hora `(pago_base − descuento_afp + provision_total) / horas_mes`, por día `monto_movilidad / dias_trabajados`— cae dentro de ±5 % del
  día (≈ ±S/ 35 de S/ 1 200) en 13 de 17 días; los otros tres (7, 9 y 10 de octubre) entre −17 % y +6 %;
- el feriado (8 de octubre, Combate de Angamos) falla un 46 %: ese día Dynamic suma +S/ 956 de `monto_feriados` a todos, sin relación con las horas;
- un día pesa ≈ S/ 1 200 de ≈ S/ 29 000 acumulados: aunque hoy fallara un 20 %, el total se movería menos de 0,5 %.

**DECIDÍ.** Una función interna `retail.fn_planilla_hoy_por_sede(boleta, hoy, ahora)` y una columna nueva `hoy_estimado` en `fn_planilla_provision_calc` y `fn_planilla_provision`.
Va APARTE de `devengado` (que no cambia): la web lo suma al leer (`leerProvision`) y dice cuánto es de hoy en la nota. Horas de hoy = `(ahora − entrada) − ausencias cerradas`
(cada `salida_*` hasta su `retorno_*`, la misma regla que `fn_recalcular_jornada`; en una ausencia, solo hasta que salió). Tres candados:
1. **Sin feriado:** si hoy está en `feriados` de la boleta, `hoy_estimado` es nulo.
2. **Sin jornada rara:** una sola entrada, ninguna salida final, secuencia regular, `0 < horas ≤ 14`, con tasa (`horas_mes > 0`), sin `prueba` y sin sueldo fijo.
3. **Se reemplaza al cerrar:** solo cuentan las jornadas SIN salida final; al marcarla, sus horas reales entran por Dynamic y dejan de estimarse. La boleta se lee ANTES que las
   marcaciones: si una jornada cierra entre las dos lecturas se pierde un instante, nunca se cuenta doble.

**DESCARTÉ.** (a) El costo promedio por hora: sobrestima 13 % sin que quien lo lee pueda saberlo. (b) Sumarlo dentro de `devengado`: la web no podría decir cuánto es de hoy ni
apagarlo, y las pruebas de la cifra firme se mezclarían con las de la estimada. (c) Leer `jornadas.estado`: el estado no trae cuándo empezó una ausencia en curso; las marcaciones sí.

**SE ROMPE SI.** Dynamic renombra `pago_base`, `descuento_afp`, `provision_total`, `monto_movilidad`, `horas_mes` o `dias_trabajados` (sale nulo, sin error), agrega un concepto que
crezca por hora (un bono por hora: se subestimaría), o cambia los tipos de marcación (`salida_*`/`retorno_*`). Principio 9: sin `public.marcajes` (local, CI) o si algo falla,
`hoy_estimado` es nulo, se avisa en el log y la provisión de siempre sale igual (pruebas HF1 y HF2).

**Se queda como estaba.** `al_cierre` (su ritmo cuenta los días corridos con hoy y las horas hasta ayer: subestima ≈ 1/23 a mitad de mes; no se toca aquí); lo que se ve sigue fuera
del libro (diario, Balance y cierre); «Provisionado» reemplaza a «estimado» en la tarjeta de confianza, Resultados y el Pulso.

**Cómo se probó.** `pnpm pruebas:planilla-provision`: 61 verificaciones (H1–H17 jornada por jornada, HC1–HC7 dentro de la provisión, HF1/HF2 con Dynamic caído o cambiado, I1 pegar dos
veces) con Dynamic simulado (`public.marcajes`, feriados, tasas). Control negativo: quitar el candado «sin salida final» hace fallar 4 casos y quitar el de feriado, 2. Pegar la
migración vieja (`20261018040000`) DESPUÉS de esta falla a propósito (no puede cambiar lo que devuelven las funciones): así un pegado equivocado no borra la columna nueva en silencio.
Web: `lib/planilla-provision-reglas.test.ts` (+7), `lib/finanzas-confianza.test.ts`.

**Lo que no se pudo probar en local ni de noche.** La pausa de almuerzo y las horas transcurridas contra jornadas ABIERTAS reales: de madrugada en Lima no hay ninguna.
Se valida en solo lectura en horario de trabajo (comparar el estimado de las 18:00 con lo que Dynamic suma al cerrar el día).
