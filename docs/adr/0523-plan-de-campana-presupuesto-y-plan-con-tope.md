# ADR-0523 — Plan de campaña ▸ Presupuesto: cuánto cuesta el plan y el plan que cabe en tu tope

- **Fecha:** 2026-10-26 · **Estado:** construido y probado en local. La pestaña, la cuenta y la simulación **no tocan la base**; guardar el plan con tope y las versiones sí, con la migración
  `20261026184000_plan_compra_versiones_y_precio_de_la_plata.sql`, que está **solo en local** (no en producción): espera el OK puntual de Felipe (ver «Pegarla en producción»).
  El número de este ADR y el de la migración están reservados para la rama `claude/campaign-plan-audit-652032` (`pnpm reservar`).
- **Continúa a:** [ADR-0349](0349-plan-de-campana.md) (el modelo del vendedor de diarios), [ADR-0499](0499-plan-de-campana-descuento-y-fecha-limite.md) (el descuento y el plazo,
  ahora también entre los supuestos) y [ADR-0522](0522-plan-de-campana-centro-de-avisos.md) (el aviso «Te pasas de tu tope» ahora lleva aquí).
- **Relacionados:** ADR-0358 (una función, una pieza: ver «Lo que se aparta de ella»), ADR-0389 (guías interactivas), ADR-0185.
- **Origen:** auditoría `/pantalla` de Compras ▸ Plan de campaña (`docs/pantallas/compras-plan.md`), spike ④ (`docs/maquetas/plan-campana-vision-2026-10/4-presupuesto.html`),
  que Felipe eligió mirando y pidió que se vea «tal cual en la maqueta».

## El problema

El plan decide cada categoría por separado («cuánto cuesta quedarme corto frente a sobrar»). Sumadas, pueden costar más de lo que CAYLA puede inmovilizar en mercadería. Hoy
quien se pasa del tope tiene **una cifra roja** y ninguna guía: recorta a ojo, categoría por categoría, sin saber dónde duele menos. Y tres cosas que son de TODA la campaña
(a cuánto se vende lo que sobra, lo ya pedido, el reparto entre tiendas) vivían escondidas en un cajón, lejos de lo que cuestan.

## Lo que se decidió

1. **Una pestaña «Presupuesto»** junto a Plan, Resultados e Historial (`/compras/plan/presupuesto`, mismo módulo `plan_compra`, nada nuevo en Roles y accesos): cuatro cifras
   (cuánto cuesta, tu tope, lo que se espera ganar, lo que ganas por cada sol), «Dónde se va la plata» (la barra por categoría), «Plan con tu tope», «Cuánto cuesta cada categoría»
   y los «Supuestos». Solo lee y simula: **nada se compra y nada se guarda** (la hoja de cada categoría sigue siendo donde se arma el plan).
2. **El plan con tope usa UN «precio de la plata» (λ) para todas las categorías.** Es el vendedor de diarios con un presupuesto (Hadley y Whitin, 1963): maximizar lo que se espera ganar
   con la restricción de que lo comprado cueste, al costo, lo del tope. Cada sol inmovilizado en mercadería «cuesta» λ soles de lo que esa plata rendiría en otra parte, y cada categoría
   compra hasta su cuantil
   `F = (Cu − λ · costo) ÷ (Cu + Co)`, acotado entre 0 y 1 (con Cu y Co los de siempre: lo que dejas de ganar por faltar y lo que pierdes por sobrar). **λ = 0 es exactamente el plan de
   hoy** (la prueba lo exige: `calcular(l, stock) ≡ calcular(l, stock, 0)`); λ > 0 aprieta todas las categorías a la vez, empezando por donde cada sol rinde menos; λ < 0 las afloja hasta
   cubrir el escenario bueno. Como lo que cuesta el plan baja al subir λ, el λ que deja la compra en el tope se busca por **bisección** (`precioDeLaPlataPara`) y se redondea HACIA ARRIBA a
   milésimas: solo puede abaratar el plan, así que el resultado nunca se pasa del tope por redondear.
3. **Lo que se espera ganar** es lo que suma COMPRAR esto frente a no comprar nada, sobre lo que ya hay: el valor esperado de tener todo (lo que se vende a precio de campaña más lo que
   sobra al % que se fijó, sobre la MISMA triangular de la compra) menos el de tener solo lo que hay, menos lo que costó (`retornoDeComprar`). No es la utilidad de la campaña; la pantalla
   lo dice en un «!».
4. **Lo que cuesta recortar se dice en soles, no en un puntaje:** «Recortas 56 % de lo que gastas y dejas de ganar 30 % de lo que esperabas: por cada sol que ahorras, dejas de ganar
   S/ 0.34.» Esa última cifra es el costo marginal real del recorte y es lo que decide si vale la pena.
5. **Los supuestos de toda la campaña se mudan del cajón «Resumen» a Presupuesto ▸ Supuestos** (lo que sobra, el descuento, lo ya pedido, los días para llegar, el reparto entre tiendas):
   están junto a lo que cuestan y cada uno abre su hoja de siempre. **El simulador** («¿y si la campaña vende distinto?», que mueve el bueno y lo que sobra para todas a la vez) también se muda, bajo el
   plan con tope: son dos formas de preguntar «¿y si?» sobre la misma plata. El cajón queda con el stock y las cifras que filtran la tabla.
6. **El aviso «Te pasas de tu tope» ahora lleva a Presupuesto** (`ir-presupuesto`), donde está el plan que cabe. Una acción de un aviso que la pestaña no sabe abrir (el resumen, una categoría)
   lleva al Plan con `?hoja=resumen` o `?hoja=categoria:<id>`, que lo abre al llegar y borra el parámetro de la URL.

```
DECIDÍ:     un solo precio de la plata (λ) para todas las categorías, hallado por bisección, que deja la compra en el tope y baja la cobertura donde cada sol rinde menos.
DESCARTÉ:   (a) recortar el mismo % a todas las categorías: ignora dónde rinde cada sol y puede dejar sin comprar la que más rinde y comprar de la que menos;
            (b) llenar por orden de ventas hasta agotar el tope: deja categorías enteras en cero y es lo que ya hace el ojo;
            (c) un optimizador entero exacto (mochila): con ~20 categorías la solución por λ queda a una prenda por categoría de la exacta y se explica en una frase («cada sol cuesta λ»);
            quien la lee puede discutirla, y una mochila no.
SE ROMPE SI: lo que sobra vale MÁS que lo que se cobra en la campaña (un descuento de 50 % con un recupero de 60 % del precio de lista): entonces retener sería mejor que vender, la ganancia deja de
            ser cóncava y «más compra no es más ganancia» ya no vale (es un caso raro y la cuenta sigue siendo la del plan); o si el tope baja de lo que cuesta comprar solo el escenario
            flojo en cada categoría: no existe un plan que quepa y la pantalla lo dice («Ni comprando solo lo flojo cabe: lo más flaco cuesta S/ 21,123»), no propone uno que se pase; o si
            los tres escenarios están mal puestos (la base ya impide flojo > normal > bueno).
```

## Lo que se aparta de ellas (a propósito)

- **«Nuevo» en la pestaña** (`Pestanas` ▸ `tono: "nuevo"`): una palabra pizarra pegada al nombre, como la maqueta. Lo decide quien monta las pestañas: `PestanasPlan` la pone hasta el 2026-12-31 y después sola
  deja de salir (una marca de «nuevo» que no caduca es ruido). Es una variante de la píldora de conteo de la pieza, no una pieza nueva.
- **La lista «Hoy contra con tope»** son filas de una rejilla (`pp-versus`), no una `<Tabla>`: vive DENTRO de la tarjeta del plan con tope y una tarjeta dentro de otra pesa más que lo que ayuda.
  Cada fila lleva su texto para lector. La tabla de costos sí es `<Tabla>` y se adapta al ancho de SU tarjeta (`@container`): con la tarjeta angosta deja «% del total» dentro de «Inversión» y «Datos» bajo el nombre.
- **Las tres tarjetas del plan nuevo** (Compras · Cuesta · Esperas ganar) y la barrita de cambio son de la maqueta: CSS propio en `app/estilos/presupuesto-plan.css`, solo tokens.

## Lo que cambió en la pantalla

- Nueva pestaña **Presupuesto** (`components/plan-compra/PresupuestoPlan.tsx`, `PlanConTope.tsx`, `SupuestosDelPlan.tsx`), con su guía interactiva (`compras.plan.presupuesto`).
- La cabecera, las pestañas y el centro de avisos salen de `PlanCampana` a `MarcoPlan` (y el vacío «sin campaña» a `SinCampana`): las pestañas comparten una sola (commit aparte, sin cambiar lo que hace el Plan).
- El cajón «Resumen» pierde «Ya pedido en órdenes», «lo que sobra», «el reparto» (ahora en Supuestos) y el simulador (ahora bajo el plan con tope); la guía del Plan se actualizó y la de Presupuesto es nueva.
- `calcular` y `cuantilCritico` aceptan el precio de la plata (con 0, lo de siempre). La cuenta nueva es `lib/plan-compra-tope.ts` y lo que se dice, `lib/plan-compra-presupuesto.ts`; las dos con su prueba.
  Se cruzó contra la maqueta con los mismos datos: mismas prendas, misma inversión y misma ganancia (33,481.72, 1,135 prendas, 13,196) para λ = 0, 0.2, 0.5 y −0.3. La maqueta redondeaba λ al más cercano y
  a veces se pasaba del tope (S/ 20,036 con un tope de 20,000); aquí nunca.

## Guardar el plan con tope y las versiones (la migración `20261026184000`, solo en local)

Hasta aquí la pestaña solo simula. Para **usar** el plan con tope hay que guardar el precio de la plata en el plan (si no, cada pantalla recalcularía con λ = 0 y el plan «con tope» desaparecería al recargar),
y guardar sin querer, o usar un plan con tope y arrepentirse, no se deshacía. Lo que se decidió:

1. **`planes_compra.precio_de_la_plata`** (λ, entre −1 y 50, de fábrica 0 = el plan de siempre): lo único que cambia de una tabla que ya existe. La web lo aplica en `calcular` (la tabla del Plan, la hoja de cada
   categoría, el paso a paso, el simulador y la exportación cuentan con él, así que ninguna pantalla enseña un número distinto). La base no calcula nada: guarda el λ que la web halló.
2. **`planes_compra_versiones`** (solo se agrega; un disparador impide editarla o borrarla): una **foto** del plan (las categorías con sus supuestos, λ y el tope), quién, cuándo, la nota, de dónde salió
   (a mano · plan con tope · restauración · automática) y lo que la pantalla mostró (prendas, inversión), más su **huella** (md5 de la foto). La numera la base bajo el bloqueo de la fila del plan: sin huecos ni repetidos.
3. **Cinco funciones públicas** (todas piden el módulo «Plan de campaña» y firman con el responsable del combo): `fn_plan_compra_versiones` (la lista SIN las fotos —pesan— con el λ y el tope de hoy y la
   huella de hoy), `fn_plan_compra_version` (una foto), `guardar_plan_compra_version`, `usar_plan_compra_con_tope` y `restaurar_plan_compra_version`. Cuatro internas (la foto, su huella, la fila nueva
   y «proteger lo de hoy»): ni la tienda ni nadie de afuera las ejecuta.
4. **«La de hoy» es la versión cuya huella es la del plan.** Si el plan cambió después de la última versión (alguien guardó una categoría), ninguna coincide y la lista lo dice arriba —«Sin guardar como
   versión»— y ofrece guardarlo. La versión no es «lo último que se guardó»: es un punto de control, y lo vivo es el plan.
5. **Volver NO borra nada.** `restaurar_plan_compra_version` pone las categorías, el λ y el tope como los tenía la versión elegida (solo reescribe lo que cambió, y deja el historial de cada categoría) y
   crea una versión NUEVA que dice de cuál volvió. Las versiones de después siguen en la lista; las categorías que se armaron DESPUÉS de esa versión no estaban en su foto y no se tocan.
6. **«La actual queda guardada para volver» es verdad:** antes de usar el plan con tope o de volver, si el plan de hoy tiene algo que ninguna versión recuerda, la base lo guarda como versión
   **automática** («Antes de usar el plan con tope»). Todo en la misma transacción que el cambio: o quedan las dos cosas o ninguna.
7. **Una versión idéntica a la última no se guarda** (la base se niega: «el plan no cambió»): un doble clic no deja dos, y quien reintenta tras un corte de red recibe una respuesta clara en vez de un duplicado.
8. **Las categorías no se borran en ningún caso** (no existe una función que las borre): por eso una versión nunca queda huérfana ni hace falta cambiar `quitar_plan_compra`, que ya archiva toda campaña con categorías.

```
DECIDÍ:     guardar el λ en el plan y las versiones como fotos que solo se agregan, con una huella para saber cuál es la de hoy, y que volver cree una versión nueva en vez de reescribir la historia.
DESCARTÉ:   (a) versiones como «un contador en cada línea» (lo que ya hay): dice cuántas veces se guardó, no deja volver a nada; (b) restaurar borrando las versiones posteriores: «nada se borra» es lo que
            hace seguro volver, y el costo de guardar 50 fotos de 5 KB por campaña es cero; (c) guardar prendas e inversión calculadas en la base: duplicaría `calcular` en SQL (dos fuentes de verdad); la
            base guarda lo que la pantalla MOSTRÓ, y «qué cambió» se vuelve a calcular en la web con el stock de hoy en los dos lados.
SE ROMPE SI: dos personas editan el plan a la vez y una vuelve a una versión mientras la otra guarda una categoría: se ponen en fila (la fila del plan se bloquea) y el plan queda con lo último, pero la versión
            de volver se tomó antes del guardado de la otra, así que «la de hoy» deja de coincidir y la lista lo dice (es lo correcto: hay algo sin versionar); o si alguien escribe `planes_compra` con
            `precio_de_la_plata` por fuera de estas funciones (la base lo permite al dueño: sin versión, la lista mostrará «sin guardar» y nada más).
```

**Pegarla en producción (con el OK de Felipe).** Una sola parte (columna con valor constante, una tabla nueva, un disparador con `create or replace trigger` y funciones, sin políticas), idempotente, con
`lock_timeout` de 3 s, DESPUÉS de `20261026171000` (la guarda lo comprueba y se niega si falta). Se comprueba con: `select column_name from information_schema.columns where table_schema = 'retail' and
table_name = 'planes_compra' and column_name = 'precio_de_la_plata'` (una fila) y `select proname from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_plan_compra_versiones',
'fn_plan_compra_version', 'guardar_plan_compra_version', 'usar_plan_compra_con_tope', 'restaurar_plan_compra_version')` (cinco). Después, refrescar el diccionario de datos (`pnpm datos:generar:produccion`).
**Con la base vieja la web no se rompe:** la lectura de versiones falla con «no existe esa función», la pantalla la toma como «la base no lo sabe» y esconde las versiones y «Usar el plan con tope»; el plan se
calcula con λ = 0 y se simula. **Con la web vieja y la base nueva** nada cambia: no sabe de λ ni de versiones.

**Caída externa.** Nada llama a la red. Si la base todavía no tiene la función (la web se publicó antes que la migración), la pantalla lo toma como «no hay plan con tope que guardar»: esconde las versiones y
«Usar el plan con tope» y calcula con λ = 0. Si la lectura FALLA por otra razón (la base lenta o caída) pasa algo peor: el plan con tope que guardaste dejaría de aplicarse y las cifras de compra cambiarían
sin que nadie lo vea. Por eso el servidor distingue las dos cosas (`esFirmaDesconocida`) y, ante un fallo, el marco muestra «No se pudo leer si tu plan usa un tope: las cifras pueden no ser las del plan con tope que
guardaste» (y la falla va al log del servidor). Se degrada así, y no pierde ningún dato: lo guardado sigue en la base.

**Probado (`pnpm pruebas:plan-compra-versiones`, 45 casos, ROLLBACK):** guardar sin cambios se rechaza; la numeración no salta; «usar» guarda la automática solo si hacía falta; volver no borra, no toca lo armado después
y solo reescribe lo que cambió; un fallo al escribir la versión deshace el λ, el tope y las categorías; la tabla no se edita ni con el dueño; las cinco funciones responden al rol de la tienda y no a `anon`;
pegarla dos veces deja lo mismo; y **cuatro «usar el plan con tope» a la vez** (cuatro sesiones reales) entran en fila: 1 automática + 4 versiones, numeradas 1 a 5 sin repetir.

## Lo que viene (no está en este cambio)

El Calendario, el Paso 2 por colores y tallas, el ranking de modelos, «Enviar a Compras» y Finanzas ▸ Inversión en mercadería son las siguientes pestañas de la misma visión.

## Cómo se verifica

Con una campaña de varias categorías con plan: «Inversión al costo» coincide con el cajón y con la suma de la tabla; mover el deslizador a un tope menor da un plan que cuesta lo del tope o menos y dice cuánto
dejas de ganar; con un tope mayor que el plan máximo dice «ya cubres el escenario bueno»; por debajo del mínimo dice que no cabe. Probado en escritorio (claro y oscuro) y a 375 px; `guias:recorrer`
de `compras.plan` y de `compras.plan.presupuesto`.
