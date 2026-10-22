# ADR-0474 · El costo de planilla de retail es el costo real: bruto + EsSalud + provisiones

- **Fecha:** 2026-10-22 · **Estado:** construido y probado en local (`pnpm pruebas:planilla-provision`); SQL por pegar en producción.
  Migración `20261022164000_planilla_costo_real_con_cargas.sql` (reservada con `pnpm reservar`).
- **Decide:** Felipe, 2026-10-22, al ver la medida de abajo («Costo real completo»; el contador lo revisa después).
- **Toca:** ADR-0133 / D-33 (la vista puente `retail.planilla_por_sede`) y ADR-0453 (la provisión de sueldos).

## El problema primero

Lo que retail asienta como gasto de personal (cuenta 62) y muestra en el Estado de resultados, en Producción ▸ Eficiencia y en la provisión del mes era
`total + provision_total`: la definición de Dynamic (`v_planilla_pagada.costo_total`). Pero `total` es **lo que recibe la persona**: ya sin la AFP ni la
renta de 4ª que se le retienen (que son parte de su remuneración bruta y las paga la empresa a la AFP y a SUNAT), y sin el EsSalud, que le cuesta al empleador
y no sale de la boleta de nadie. Medido en septiembre (período 28-ago → 27-sep, 28 personas, sin «prueba»):

| Concepto | S/ |
|---|---|
| Neto que recibe el colaborador (`total`) | 30 062 |
| + AFP retenida | 2 214 |
| + Renta de 4ª retenida | 87 |
| **= Remuneración bruta** | **32 364** |
| + EsSalud del empleador (`aporte_essalud`) | 2 476 |
| + Provisiones (gratificación, CTS, vacaciones **y** bonificación extraordinaria: `provision_total` ya la trae) | 3 363 |
| **Costo real para CAYLA** | **38 203** |
| Lo que retail asentaba (`costo_total` de Dynamic) | 33 426 |

El gasto fijo más grande salía **S/ 4 777 (12,5 %) corto**: el resultado del mes parecía mejor de lo que es, en la dirección que más engaña.

## Decisión

**DECIDÍ:** el costo de planilla de retail es `total + descuento_pension + retencion_4ta + aporte_essalud + provision_total`.
1. **Lo pagado.** `retail.planilla_por_sede.costo_total` suma eso sobre la foto congelada de Dynamic. `pagado` (el neto) y `provisiones` no cambian: el Flujo de caja
   sigue leyendo `pagado` (lo que sale del banco a los colaboradores; la AFP y SUNAT salen por sus propios movimientos). Lo lee también Producción ▸ Eficiencia: el costo de la
   planilla del Taller por prenda sube igual, y es lo correcto.
2. **Lo provisionado** (`fn_planilla_provision_calc`): la misma suma por persona. Con una diferencia que se midió: el **EsSalud de un período abierto es el del mes entero**
   (1 992,60 cortado a mitad de mes y completo; sale del piso de EsSalud, no de las horas), así que se prorratea por días corridos, igual que el sueldo fijo. La AFP y la renta de 4ª
   sí crecen con las horas y entran como están.
3. **Lo de hoy** (`fn_planilla_hoy_por_sede`): la tasa por hora pasa a la base del bruto, `(pago_base + provision_total) / horas_mes` (antes restaba la AFP para parecerse al neto).
   Retrotest 5–21 de octubre contra lo que Dynamic sumó con la definición nueva: ≈ −1,6 % en los días normales, 13 de 17 dentro de ±5 % (los mismos cuatro días raros de siempre).

**DESCARTÉ:**
- *Dejarlo y mostrar la brecha aparte:* el resultado seguiría inflado y la brecha sería una nota que cada colaboradora tendría que sumar a mano.
- *Sumar solo el EsSalud:* sigue faltando ≈ S/ 2 300 de AFP y renta de 4ª que sí son parte del bruto; no resuelve el problema de fondo.
- *Cambiar `costo_total` en Dynamic:* es de Dynamic y lo usa su propia pantalla de Planilla; retail define SU costo en la vista puente que ya es suya.
- *Repartir en cuentas 621/627/629:* es una decisión del contador (la cuenta de EsSalud es la 627, la de beneficios sociales la 629); por ahora todo en la 62, como siempre. Si él lo pide, es otro cambio.

**SE ROMPE SI:** Dynamic renombra `descuento_pension`, `retencion_4ta` o `aporte_essalud` en su vista, o `descuento_afp`, `retencion_4ta`, `aporte_essalud` en su boleta
(la provisión los toma como 0 y el costo vuelve a verse corto, sin error); o cambia cómo calcula el piso de EsSalud (si dejara de ser el mes entero en un período abierto,
el prorrateo por días lo sobrestimaría).

## Lo que cambia para quien mira

- **Producción no tiene ningún mes cerrado todavía** (`retail.periodos` vacío el 2026-10-22), así que al pegar la migración cambia **de inmediato** la planilla de septiembre
  (+S/ 4 777) y de cualquier período ya pagado que caiga en un mes abierto, en el Estado de resultados, el Resumen y el Pulso. Un mes CERRADO se queda cerrado (su diario está congelado).
- El «te quedan» y «Tu ritmo» del Resumen suben su gasto fijo ≈ 12 %: es la cifra honesta.
- **Eficiencia del Taller:** el costo por prenda sube ≈ 12 % (misma razón).
- La web no cambia de código salvo un texto («de dónde sale» dice «costo real»): lee las mismas columnas.

## Cómo se prueba

`pnpm pruebas:planilla-provision`: casos CR1–CR5 (el costo real de una sede con dos por hora y un fijo, el EsSalud por días, boletas viejas sin los campos nuevos) y V1–V6 (la vista de
lo pagado suma el costo real, deja el neto y las provisiones como estaban, excluye «prueba», sigue `security_invoker` y sin personas, y sin Dynamic no falla), más los de ADR-0453 con la tasa
sobre el bruto. Segura en cualquier orden con la web.
