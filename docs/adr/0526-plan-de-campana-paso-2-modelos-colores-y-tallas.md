# ADR-0526 — Plan de campaña ▸ Paso 2: de lo que decidiste comprar, qué modelos, colores y tallas

- **Fecha:** 2026-10-26 · **Estado:** construido y probado en local. La web se apaga sola (no ofrece el paso 2) si la base no tiene la migración `20261026204000_plan_compra_paso_2_modelos.sql`, que está **solo en
  local** (no en producción): espera el OK puntual de Felipe (ver «Pegarla en producción»). El número de este ADR y el de la migración están reservados para la rama `claude/campaign-plan-audit-652032` (`pnpm reservar`).
- **Continúa a:** [ADR-0349](0349-plan-de-campana.md) (el plan por categoría: es el paso 1), [ADR-0523](0523-plan-de-campana-presupuesto-y-plan-con-tope.md) (el total que el paso 2 reparte) y
  [ADR-0525](0525-plan-de-campana-calendario-con-cuales-campanas-me-quedo.md).
- **Relacionados:** ADR-0358 (una función, una pieza: ver «Lo que se aparta de ella»), ADR-0389 (guías interactivas), ADR-0336 (modo oscuro), ADR-0185 (la página no se encoge bajo el mouse).
- **Origen:** auditoría `/pantalla` de Compras ▸ Plan de campaña (`docs/pantallas/compras-plan.md`, tarea #9). Dos spikes que Felipe eligió mirando: ③ (`3-paso-2.html`: la hoja de la categoría con sus dos pasos y el
  total) y ⑥ (`6-modelos.html`: el ranking de modelos). Felipe pidió ver «primero marca y modelo, y dentro de cada modelo sus colores más vendidos y sus tallas», y que se vea «tal cual en la maqueta».

## El problema

El paso 1 dice «compra 339 Camisas y Blusas»; quien compra tiene que decir **cuáles**: de qué modelos, en qué colores y en qué tallas. Hoy eso vive en la cabeza de quien llama al proveedor o al Taller, y es donde más
plata se pierde: la que se va a un color o a una talla que no sale. El sistema ya sabe qué modelos vendieron, con qué colores y tallas, y cuánto queda de cada uno; le faltaban dos cosas: leerlo ordenado y un lugar donde
guardar lo que la persona eligió. Una dificultad real: en CAYLA **los modelos casi no se repiten** («una prenda nueva vende 1 o 2 en su vida en una tienda»), así que el sistema no puede decir «compra 7 de esta azul talla
M»: solo puede decir cuáles conviene **repetir** y, del resto, dar una guía.

## Lo que se decidió

1. **Un segundo paso en la hoja de cada categoría**: dos pestañas, «1 · Cuánto compro» (el formulario de siempre) y «2 · Qué modelos, colores y tallas». El paso 2 solo se ofrece cuando el paso 1 ya está guardado y pide
   comprar algo; cambiar de paso con algo escrito sin guardar pregunta antes de perderlo. La hoja se ensancha para el paso 2 (`max-w-5xl`).
2. **El paso 2 REPARTE lo que el paso 1 decidió y nunca lo cambia.** Arriba, el total del paso 1 y lo que cuesta; el % «Repetir lo que ya vendió» (el sistema propone uno; la persona lo cambia); y lo que queda para
   «modelos nuevos». Lo repartido en modelos + lo que queda para modelos nuevos = el total. Si la persona se pasa, la pantalla dice cuánto, lleva al paso 1 y **no deja guardar** (la base también lo rechaza).
3. **Dos mitades, porque el sistema solo puede nombrar lo que ya existe.** Un % del total va a **modelos que ya vendieron**, repartido por lo que le falta a cada uno: su parte de las ventas de la categoría
   × lo que conviene tener, menos lo que ya hay de ese modelo. El resto queda como **«modelos nuevos por elegir»**, con una guía de colores y tallas (lo que más vende la categoría, restando lo que ya hay; las tallas, por la
   curva del paso 1). Un modelo con **menos de 5 ventas no se propone** para repetir. El % que propone el sistema es lo que falta de los que sí se pueden repetir contra todo lo que falta (también de los que no, y de lo
   vendido sin modelo), redondeado a 5 y entre 20 y 80.
4. **El ranking**: todos los modelos juntos, del que más vendió al que menos, con su marca debajo del nombre; de cada uno, lo que vendió, lo que hay (y para cuántos días alcanza), lo que el sistema propone, lo que compra la
   persona y cuánto dato tiene («Con base» desde 10 ventas, «Poco dato» de 5 a 9, «Pocas ventas: no se repite»). Abierto, cada modelo muestra sus colores y de cada color sus tallas.
5. **Se edita en tres niveles y todo cuadra hacia arriba**: las tallas suman el color, los colores suman el modelo y los modelos + los nuevos suman el total. Cambiar el modelo suelta lo que se había movido dentro de él;
   cambiar una talla congela las otras como estaban. Dentro de un modelo, cada color y cada talla pesan lo que vendieron **con cautela**: con pocas ventas se apoyan en un reparto parejo (el mismo peso n/(n+10) de la curva
   de tallas del paso 1 — la contracción de siempre, no una cuenta nueva). «editado» marca solo lo que se aparta de lo que propone el sistema.
6. **Se guarda como fotos que solo se agregan** (`planes_compra_paso_2`): una por guardado, con el % de repetir, el total del paso 1 con que se guardó y las prendas por modelo × color × talla. La de mayor versión es la
   vigente; lo ya guardado se restaura **exacto** al volver a abrir (también lo que se dejó en 0). La lectura trae siempre las celdas de lo guardado, aunque ese modelo ya no tenga ventas en 90 días ni stock: si no, la
   pantalla no lo vería y al guardar de nuevo se perdería en silencio.
7. **La lista del Plan dice qué categorías ya tienen su paso 2**: «Paso 2 hecho», «Paso 2 por hacer» o «Paso 2 por revisar» si el total del paso 1 cambió después de guardarlo; y el cajón Resumen cuenta cuántas van
   («Paso 2 hecho: 1 de 8»).

```
DECIDÍ:     que el paso 2 reparta el total del paso 1 en modelos que ya vendieron (un % que propone el sistema) y deje el resto como «modelos nuevos por elegir», sin cambiar nunca el total, y que lo elegido se
            guarde como fotos que solo se agregan, con la versión que la persona vio.
DESCARTÉ:   (a) el «Subir el total» de las maquetas (cambiar el paso 1 desde el paso 2): el total sale de los tres escenarios; un número manual necesitaría un concepto nuevo en `calcular`, en el plan con tope
            (λ), en Presupuesto y en las versiones, y habría dos fuentes de verdad de cuánto comprar. Lo que sí hay: un botón «Ir al paso 1» cuando te pasas (objeción abierta: ver abajo);
            (b) repartir por «familia de color» (el spike ③ A+C): `colores.familia_color` tiene 10 familias donde «neutro» junta negro, blanco y gris —justo lo que no se puede mezclar al comprar— y las 8 de la
            maqueta eran inventadas; el color real de cada modelo sí sirve (y Felipe eligió ver modelos);
            (c) una cantidad por variante dicha como cifra firme: con 1 o 2 ventas por prenda es inventar precisión; (d) guardar el reparto en una tabla relacional con borrar y volver a escribir: se pierde quién
            cambió qué, y hay que cuidar la transacción; en la línea del plan como JSON: ataría el reparto a la versión de la línea; solo en el navegador: otra persona lo vería sin hacer; escribirlo directo como
            orden de compra: un borrador no es un pedido (principio 2).
SE ROMPE SI: el paso 1 cambia DESPUÉS de guardar el paso 2 (la fila dice «Paso 2 por revisar» y la hoja muestra «Te pasaste» si el total bajó: no recorta en silencio); dos personas editan el mismo paso 2 a la
            vez (la segunda recibe «guardó otro paso 2» con quién y a qué hora, y lo suyo sigue en pantalla sin guardar); un modelo vendió muchas prendas pero casi todas de UN color que ya se agotó (con pocas ventas por
            color la propuesta se apoya en lo parejo y puede proponer colores que no salen: por eso solo es una propuesta y la columna «Dato» dice cuánto creerle); o la categoría tiene más de 300 modelos con ventas
            o stock (se muestran los 300 que más vendieron y la hoja lo dice).
```

## Lo que se aparta de ellas (a propósito)

- **Los colores × tallas de un modelo son una rejilla de pasos de cantidad** (`MatrizDelModelo`), no una `<Tabla>` ni un `<table>`: es una matriz de tallas (la familia «Tablas» deja aparte las matrices de tallas) y vive
  dentro de una fila abierta. Cada celda es el paso de cantidad del sistema (`PasoCantidad` «celda»), con su número que se puede escribir.
- **La hoja usa `ancho="max-w-5xl"`** en el paso 2 (`// unificar-fijo`): la matriz de colores × tallas no cabe en los 768 px de la hoja ancha. En el celular la matriz se desplaza dentro de su caja.
- **«Usar lo que propone»** (no «Volver a lo que propone», como la maqueta): `accion.volver` es la flecha redonda de navegación, y este botón no vuelve a ningún lado: descarta lo que se movió.
- **«Modelos nuevos por elegir»** es un bloque propio con un tinte verde suave (`.p2-nuevos`): no es un aviso ni un vacío, es lo que queda del total. CSS en `app/estilos/paso-2-plan.css`, solo tokens (el modo oscuro
  sale solo; el punto de cada color es dato y no cambia con el tema).
- **Guía de foco**: el paso 2 no tiene campos obligatorios (todo viene propuesto y se guarda tal cual o cambiado); lo que «falta» lo dice el cuadre («Quedan N para modelos nuevos» / «Te pasaste N»), que es la guía.

## Lo que cambió en la pantalla

- `PlanCategoriaModal` tiene los dos pasos (`Pestanas`); el paso 2 es `PasoModelos.tsx` + `FilaDeModelo.tsx` (el ranking y la rejilla) + `CantidadEditable.tsx` (el paso de cantidad que se escribe y se confirma al salir) +
  `useModelosDeLaCategoria.ts` (la lectura bajo demanda: solo al abrir el paso 2).
- **La cuenta es de `lib/plan-compra-modelos.ts`** (25 pruebas: la propuesta, la cascada de ediciones, lo guardado restaurado exacto, una categoría sin tallas, lo que la base manda mal) y la lista del Plan muestra el
  marcador por categoría (`FilaCategoria`) y el cajón Resumen su cifra (`CifrasPlan`).
- La guía interactiva del Plan suma 8 pasos (opcionales: solo aparecen si la categoría ofrece el paso 2).

## La base (la migración `20261026204000`, solo en local)

1. **`fn_plan_compra_modelos(plan, categoría)`**: los modelos de la categoría con ventas en 90 días o stock, con su marca, lo vendido y lo que hay, y de cada uno sus colores y tallas; las ventas sin modelo (anotadas «sin
   registrar»); los colores de la categoría; lo último que se guardó. **Con las mismas reglas de `fn_plan_compra`** (una venta completada y no de prueba, sin la prenda centinela; el stock libre de apartados y sin
   Cuarentena en ubicaciones activas): una sola fuente de verdad de qué es una venta y qué es stock.
2. **`planes_compra_paso_2`**: fotos que solo se agregan (`unique (plan, categoría, versión)`, `check (unidades <= total)`, disparador `planes_compra_paso_2_inmutable`: el mismo del historial del plan). RLS encendido
   y **sin políticas**: la web no la lee ni la escribe directo.
3. **`guardar_plan_compra_paso_2`**: pide el módulo y firma al responsable; rechaza lo imposible (un modelo de otra categoría o de prueba, un color que no existe, una talla que no es de la categoría o que falta, la
   misma celda dos veces, 0 o demasiadas prendas, un reparto que se pasa del total) con mensajes claros y sin escribir nada; se pone en fila con quien guarda lo mismo a la vez (candado por categoría: las versiones salen sin
   huecos ni repetidas); **lo idéntico a lo ya guardado no crea otra foto** (un doble clic, un reintento tras un corte de red); y **no pisa**: si otra persona guardó mientras editabas, rechaza con `PT409` y dice quién y a
   qué hora.
4. **`fn_plan_compra_pasos_2(plan)`**: la última foto de cada categoría, para marcar la lista sin abrir cada una.

**Pegarla en producción (con el OK de Felipe).** Una sola parte: una tabla NUEVA con su `alter … enable row level security`, un disparador con `create or replace trigger` (nunca `drop trigger`: ADR-0195) y funciones; **sin
políticas**; `lock_timeout` de 3 s; idempotente. Va **después** de `20261026190000`. Se comprueba con:

```sql
select count(*) from information_schema.tables where table_schema = 'retail' and table_name = 'planes_compra_paso_2';                         -- 1
select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_plan_compra_modelos', 'fn_plan_compra_pasos_2', 'guardar_plan_compra_paso_2');  -- 3
```

Después, refrescar el diccionario de datos (`pnpm datos:generar:produccion`). **Con la base vieja la web no se rompe:** la lectura dice «no existe esa función», la hoja no ofrece el paso 2 y la lista no marca nada.
Con la web vieja y la base nueva, nada cambia.

**Caída externa.** Nada llama a la red. Si la base no responde al abrir el paso 2, la hoja lo dice con «Reintentar» y el paso 1 sigue intacto; si se corta la red al guardar, no se sabe si llegó y la pantalla lo dice
(volver a pulsar «Guardar» no duplica nada). Se degrada así y no pierde ningún dato.

**Probado (`pnpm pruebas:plan-compra-paso-2`, 21 casos; cada uno en su transacción con ROLLBACK, salvo la concurrencia, que usa filas reales y las borra al terminar):** lo que cuenta la lectura (ventas anuladas, de
prueba o de hace más de 90 días no; stock apartado y de Cuarentena no; modelos de prueba no), lo ya elegido siempre aparece, cada imposible se rechaza sin escribir, lo idéntico no crea otra foto, la versión vieja no
pisa, la tabla no se edita ni se borra, las puertas (rol de la tienda sí; sin el módulo 42501; `anon` nada), pegarla dos veces, y **cuatro personas a la vez** dejan una sola foto vigente.

## Lo que viene (no está en este cambio)

«Enviar a Compras» (spike ⑦) leerá esta tabla agrupando lo elegido por proveedor. Las objeciones de abajo esperan a Felipe.

## Objeciones que quedan en pie (decisión de Felipe)

1. **El total editable de las maquetas.** El «Subir el total» (y el aviso «También cambia en el paso 1») no está: ver DESCARTÉ (a). Si se quiere, la forma limpia es un concepto explícito —«prendas de más, decididas al
   repartir»— que se suma a lo que calcula el plan y viaja en las versiones; es un cambio de la cuenta del Plan y merece su propio ADR.
2. **Con 30 días de ERP casi no hay modelos con 5 ventas.** La pantalla lo dice («Por modelo sí hay señal; por color y talla, poca»; «Los datos todavía no son exactos») y el % propuesto baja o se va a 0 cuando no hay a
   quién repetir; pero el paso 2 será útil de verdad cuando el ERP lleve meses, no hoy.
3. **«Hay hoy» por modelo no cuenta lo que ya viene en órdenes de compra** (eso se descontó del total en el paso 1, pero no se sabe de qué modelo es): un modelo con una orden en camino puede aparecer como «le falta».

## Cómo se verifica

Con una categoría con plan (paso 1 guardado) y ventas con modelo: la hoja tiene las dos pestañas; el paso 2 trae el ranking del que más vendió al que menos; mover una talla cambia el color, el modelo y lo que queda para
modelos nuevos; pasarse del total muestra «Te pasaste N» y deshabilita «Guardar el paso 2»; guardar deja «Guardado por … (versión 1)» y al volver a abrir todo está como se dejó; la lista marca «Paso 2 hecho» en esa
categoría y el Resumen cuenta «1 de N». Probado en escritorio (claro y oscuro, **`tema:auditar` 0 hallazgos**) y a 375 px; `guias:recorrer compras.plan` (34 pasos) sin errores.
