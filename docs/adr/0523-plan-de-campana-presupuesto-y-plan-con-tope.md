# ADR-0523 — Plan de campaña ▸ Presupuesto: cuánto cuesta el plan y el plan que cabe en tu tope

- **Fecha:** 2026-10-26 · **Estado:** la pestaña, la cuenta y la simulación están construidas y probadas en local (**sin migración**: no toca la base). Lo que sigue —guardar el plan con tope
  y las versiones— llega en su propia migración (sección «Lo que viene»). El número está reservado para la rama `claude/campaign-plan-audit-652032` (`pnpm reservar`).
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

## Lo que viene (no está en este cambio)

- **Guardar el plan con tope** (`planes_compra.precio_de_la_plata`) y las **versiones del plan** (cada «Usar» y cada «Guardar una versión» es un punto al que volver): llegan con su migración, que queda
  solo en local hasta que Felipe diga. Mientras la base no lo guarde, el botón «Usar el plan con tope» no se ofrece y la pestaña simula.
- El Calendario, el Paso 2 por colores y tallas, el ranking de modelos y «Enviar a Compras» son las siguientes pestañas de la misma visión.

## Cómo se verifica

Con una campaña de varias categorías con plan: «Inversión al costo» coincide con el cajón y con la suma de la tabla; mover el deslizador a un tope menor da un plan que cuesta lo del tope o menos y dice cuánto
dejas de ganar; con un tope mayor que el plan máximo dice «ya cubres el escenario bueno»; por debajo del mínimo dice que no cabe. Probado en escritorio (claro y oscuro) y a 375 px; `guias:recorrer`
de `compras.plan` y de `compras.plan.presupuesto`.
