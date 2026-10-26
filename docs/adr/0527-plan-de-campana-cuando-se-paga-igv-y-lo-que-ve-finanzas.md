# ADR-0527 — Plan de campaña ▸ Cuándo se paga: la lista de pagos, el IGV por categoría y lo que ve Finanzas

- **Fecha:** 2026-10-26 · **Estado:** construido y probado en local. La web se apaga sola (no ofrece «Cuándo se paga» y Finanzas no dibuja la inversión) si la base no tiene la migración
  `20261026212000_plan_compra_pagos_y_visibilidad.sql`, que está **solo en local** (no en producción): espera el OK puntual de Felipe (ver «Pegarla en producción»). El número de este ADR y el de la migración están
  reservados para la rama `claude/campaign-plan-audit-652032` (`pnpm reservar`).
- **Continúa a:** [ADR-0523](0523-plan-de-campana-presupuesto-y-plan-con-tope.md) (el presupuesto y el tope que esta pantalla complementa), [ADR-0499](0499-plan-de-campana-descuento-y-plazo.md) (la fecha límite para pedir)
  y [ADR-0526](0526-plan-de-campana-paso-2-modelos-colores-y-tallas.md).
- **Relacionados:** el contrato con Finanzas ▸ Resumen (`docs/maquetas/finanzas-v3-2026-10/resumen-campana/README.md`, ya en `main`), ADR-0358 (una función, una pieza), ADR-0389 (guías interactivas),
  ADR-0336 (modo oscuro), ADR-0161 (módulos y roles).
- **Origen:** auditoría `/pantalla` de Compras ▸ Plan de campaña (`docs/pantallas/compras-plan.md`, tarea #10) y el spike ⑤ `5-finanzas.html` («Cuándo se pide y se paga»), que Felipe eligió mirando y quiso «tal cual en
  la maqueta». Dos decisiones suyas del 2026-10-26 que mandan aquí: **se guarda la lista de pagos (fecha, %), no la forma de armarla** y **la visibilidad en Finanzas tiene tres estados**, no un sí o no.

## El problema

El Plan dice **cuánto comprar** y **cuánto cuesta**, pero no **cuándo sale esa plata de la caja** ni **qué parte es IGV**. Y Finanzas, que sí necesita saberlo para decir si la caja aguanta la campaña, no tenía de dónde
leerlo: el Resumen tenía el bloque «Inversión en mercadería» construido contra un contrato y **sin nada que lo alimentara** (`getInversionMercaderia` devolvía `null`). Además, una compra de campaña **no es un gasto**
(son prendas en el estante, que se vuelven costo el día que se venden): quien mira Finanzas tiene que poder decidir si esa campaña se ve, se ve solo en el «¿y si compro esto?» o no se ve.

## Lo que se decidió

1. **Una pantalla nueva: Presupuesto ▸ «Cuándo se paga»** (`/compras/plan/presupuesto/pagos`, un selector «Costos y tope · Cuándo se paga» bajo las pestañas, en las dos partes del Presupuesto). Sobre **lo que
   todavía falta pedir** (lo que el plan pide comprar, ya sin lo que hay ni lo que viene en camino) la persona parte la compra en **1, 2 o 3 tandas**; de cada una elige la **semana del pedido**, el **% de la compra** y
   **cómo se paga** (contado, a 30 días, a 60, 50 % de anticipo y el resto a 30, 30 % de anticipo y el resto a 60). Ve cuánto sale de caja por tanda y **mes a mes**, y un aviso si una tanda se pide **después de la fecha
   límite** (llegaría con la campaña empezada). Las categorías de abajo son una ayuda para imaginarse qué cae en cada tanda: no se guardan.
2. **IGV por categoría.** Algunos costos del plan ya incluyen el IGV y otros no. La persona marca cuáles; el sistema dice, por categoría, **cuánto se le paga al proveedor (sin IGV), cuánto es IGV y cuánto sale de la
   caja**. En los dos casos el IGV es el 18 % del valor sin IGV: la marca solo cambia el valor sin IGV (costo ÷ 1,18 si ya lo incluye). La marca es de **esa campaña**: no cambia el costo de la ficha.
3. **Se guardan los PAGOS, no las tandas.** Lo que se guarda y lo que Finanzas lee es una lista de **(fecha, %)** que suma 100. Las tandas viajan en la misma foto **solo para que la pantalla vuelva a abrirse como se
   dejó**; la base no las lee. Si mañana cambia la pantalla, Finanzas no se entera.
4. **Se guarda como fotos que solo se agregan** (`planes_compra_pagos`): una por guardado, con la versión, quién y cuándo. La de mayor versión es la vigente. **Lo idéntico a lo ya guardado no crea otra foto** (un doble
   clic, un reintento tras un corte de red) y **no se pisa**: si otra persona guardó mientras se editaba, la base rechaza con `PT409` y dice quién y a qué hora; lo de esta persona sigue en pantalla.
5. **Tres estados de visibilidad por campaña** (`planes_compra.visibilidad_finanzas`, por defecto **«todo»**, firmada con quién y cuándo): **«Se hará: todo Finanzas»**, **«Solo en Escenarios»** y **«No mostrarla»**.
   Elegir uno se guarda al instante y **no borra nada**: la campaña sigue en el Plan y en Compras.
6. **Lo que lee Finanzas (`getInversionMercaderia`).** Por campaña: lo planeado sin IGV, el IGV, el tope, lo pedido en órdenes, lo ya pagado, hasta cuándo pedir, la lista de pagos y si se ve. **Cada sol está en una sola
   etapa**: el plan es lo pedido más lo que falta pedir, y lo ya pagado está dentro de lo pedido. Lo calcula la web **con las mismas funciones que arman la pantalla del Plan** (`armarFilas`, `plazoDePedido`, el precio de la plata, el descuento):
   el Plan y el Resumen no pueden decir dos montos distintos de la misma campaña. Solo se arman las campañas en «todo», sin archivar, con algo planeado, que no terminaron y que empiezan en los próximos 120 días (las 4 más
   cercanas).
7. **«Lo pagado» sale de lo facturado de verdad** (`fn_plan_compra_pagado`): comprobantes vigentes de mercadería de las órdenes generadas de la campaña, **sin IGV** (cada uno aporta lo pagado en la proporción de su subtotal
   sobre su total; una nota de venta, que no lleva IGV, aporta todo).

```
DECIDÍ:     guardar la lista de pagos (fecha, %) como fotos que solo se agregan, con las tandas como dato opaco para la pantalla; la visibilidad como una columna de tres valores firmada; y calcular lo que lee Finanzas
            en la web, con las mismas funciones del Plan, entregándolo por la única función `getInversionMercaderia`.
DESCARTÉ:   (a) guardar solo las tandas y calcular los pagos al leer (Felipe lo descartó: acopla a Finanzas con cómo está armada la pantalla; un cambio de aquí movería la caja de allá); (b) calcular el plan, el IGV y lo
            pedido en SQL, como un gemelo de `calcular`: la cuenta (cuantil, el precio de la plata, el descuento) viviría en dos lenguajes, y la primera vez que una cambie sin la otra el Plan y Finanzas dirían montos
            distintos de la misma campaña; (c) un interruptor sí/no (Felipe pidió tres estados); (d) una pista de tres botones en fila para la visibilidad: en la columna de la derecha no caben ni a 1160 px, y elegir GUARDA al
            instante, así que un radiogroup con flechas guardaría con cada flecha: son tres opciones que se leen enteras, una bajo otra; (e) leer el flujo de caja de Reportes y Escenarios desde aquí: es de Finanzas y no
            está pedido (ver «Lo que todavía no hace»).
SE ROMPE SI: se anota una orden de compra con IGV en una categoría que NO está marcada «ya incluye el IGV» (o al revés): `pedido` y `falta pedir` quedan en bases distintas y el plan sale mal por el 18 %;
            dos personas guardan la forma de pago a la vez (la segunda recibe «guardó otra forma de pago» con quién y a qué hora; no se pisa nada); una factura se registra con un precio distinto al de la orden
            (`pagado` puede pasar de `pedido`: el Resumen lo topa y no se rompe, pero la etapa «pedido sin pagar» sale en 0); o la cuenta de quien mira el Resumen no tiene el módulo «Plan de campaña»: no ve la inversión
            (ver «Objeciones»).
```

## Lo que se aparta de ellas (a propósito)

- **La visibilidad son tres opciones en columna** (`.pp-opcion`), no un segmento de tres botones: ver DESCARTÉ (d). Es local hasta que Felipe decida en `/unificar` una pieza para «elegir entre tarjetas» (el README de Finanzas ya
  la dejaba como pendiente). Elegir guarda al instante, así que son botones con `aria-pressed`, no un `radiogroup`.
- **La caja de cada tanda** (`.pp-tanda`) y la lista «Qué pasa en Finanzas» (`.pp-donde`) son propias (`app/estilos/pagos-plan.css`, solo tokens): la maqueta las tiene y el sistema no tiene pieza para ellas.
- **Las cifras de mes a mes son `TarjetaCifra`** (cuatro, una por mes), sin inventar otra pieza.
- **Guía de foco:** no hay campos obligatorios ni pasos que completar (arranca con tandas que ya suman 100 % y se pueden guardar tal cual); lo que podría salir mal lo dice en el lugar (la tanda que llega tarde, «los
  pagos tienen que sumar 100 %» sobre el botón). Declarada `no-aplica` con su motivo.

## Lo que todavía no hace (honestidad de la pantalla)

**Hoy solo el Resumen de Finanzas lee la compra** (y su «Tu caja», dentro del Resumen). El flujo de caja de Reportes y Escenarios **todavía no la leen**: sumar la compra planeada a `fn_flujo_caja_proyeccion` es un
cambio de Finanzas, con su propia migración y su propio riesgo de contarla dos veces. La pantalla **no promete lo que no existe**: la lista «Qué pasa en Finanzas» dice «Todavía no la leen: se conectarán» y las frases de
cada estado (`TEXTO_DE_VISIBILIDAD`) hablan solo del Resumen. Cuando se conecten, esas frases son lo único que cambia aquí. También queda para la siguiente actividad la **gráfica de la caja de las próximas 12 semanas**
del spike ⑤ y el recomendador «Cómo pagar la campaña».

## Lo que cambió en la web

- **Pantalla:** `PagosPlan.tsx` (el marco) → `CuandoSePaga.tsx` (las cifras, las tandas, mes a mes, IGV, visibilidad y guardar) + `TandaDePago.tsx` + `CostoEIgv.tsx` + `VisibilidadEnFinanzas.tsx` +
  `PartesDelPresupuesto.tsx` (el selector, también en «Costos y tope»). Lee con `getPlanCompra(plan, { conPagos: true })`; las demás pestañas no piden las dos lecturas nuevas.
- **La cuenta es de `lib/plan-compra-inversion.ts`** (52 pruebas: las tandas por defecto, cada forma de pago, que los pagos sumen EXACTO 100 con cualquier mezcla, el IGV de las dos maneras, mes a mes, lo guardado leído,
  y el contrato con Finanzas pasando por `leerInversion` con cada sol en una sola etapa) y **la política de la lectura**, de `lib/plan-compra-inversion-lectura.ts` (18 pruebas con una base de mentira: cuáles campañas, y
  qué se dice cuando algo se cae). `plan-compra-inversion-servidor.ts` solo le entrega el cliente real.
- **Finanzas ▸ Resumen:** `getInversionMercaderia` (`lib/inversion-mercaderia.ts`) deja de devolver `null` y llama a la política de arriba. Una sola novedad visible: si la lectura se cae, el Resumen lo dice en un aviso
  («No se pudo leer el plan de campaña… Lo ya registrado sigue contando») en vez de callarse (el contrato lo pedía; la página y el panel reciben `inversionFalla`).
- La guía interactiva suma **«Cuándo se paga»** (10 pasos) y un paso al Presupuesto (las dos partes). Escenario `compras.plan-pagos` para `tema:auditar`.

## La base (la migración `20261026212000`, solo en local)

1. **`planes_compra.visibilidad_finanzas`** (`'todo' | 'escenarios' | 'nada'`, por defecto `'todo'`) más `_por`/`_en`. `check`: solo esos tres valores y **nunca una firma a medias** (quién sin cuándo o cuándo sin quién).
2. **`planes_compra_pagos`**: fotos que solo se agregan (`unique (plan, versión)`, disparador `planes_compra_pagos_inmutable`: el mismo del historial del plan). **`check` de la lista de pagos**: de 1 a 24 pagos, cada fecha
   existe y no se repite, cada % de 0,01 a 100 y la suma EXACTA 100 (función inmutable `fn_pagos_de_compra_validos`): **lo hace cumplir la base aunque nadie pase por la función**. RLS encendido y sin políticas.
3. **`fn_plan_compra_pagos(plan)`** (la última foto con quién y cuándo, y la visibilidad con su firma; `por` es `null` mientras nadie la cambió, nunca «una persona»), **`guardar_plan_compra_pagos`** (rechaza con mensajes claros
   lo imposible —no suman 100, una fecha que no existe o repetida, un % fuera de rango, más de 24 pagos, una categoría de IGV que no existe— sin escribir nada; idéntico = misma versión; `PT409` si otra persona guardó),
   **`cambiar_visibilidad_plan_compra`** (con candado de fila: dos personas a la vez se turnan sin error) y **`fn_plan_compra_pagado(plan)`**.
4. Todas piden el módulo «Plan de campaña» (42501 si no), firman con `fn_actor_persona_id(true)` y responden al rol de la tienda (`authenticated`), no solo al dueño (ADR-0496 rompió a toda la tienda 16 h por probar
   solo como dueño).

**Pegarla en producción (con el OK de Felipe).** Una sola parte: una columna nueva en `planes_compra` (con valor fijo: no reescribe la tabla), una tabla NUEVA con su `alter … enable row level security`, un disparador con
`create or replace trigger` (nunca `drop trigger`: ADR-0195) y funciones; **sin políticas**; `lock_timeout` de 3 s; idempotente. Va **después** de `20261026204000`. Se comprueba con:

```sql
select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'planes_compra' and column_name like 'visibilidad_finanzas%';   -- 3
select count(*) from information_schema.tables where table_schema = 'retail' and table_name = 'planes_compra_pagos';                                          -- 1
select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_plan_compra_pagos', 'fn_plan_compra_pagado', 'guardar_plan_compra_pagos', 'cambiar_visibilidad_plan_compra', 'fn_pagos_de_compra_validos');  -- 5
select count(*) filter (where visibilidad_finanzas = 'todo') = count(*) from retail.planes_compra;                                                             -- true (por defecto todo se ve)
```

**Un efecto a la vista de todos al pegarla:** como el valor por defecto es «todo», **el Resumen de Finanzas empezará a mostrar «Inversión en mercadería» de las campañas que ya tienen plan** (las que empiezan en los
próximos 120 días), sin que nadie haya tocado nada. Es lo decidido («por defecto, todo se ve»), pero conviene saberlo antes de pegar. Después, refrescar el diccionario de datos (`pnpm datos:generar:produccion`).
**Con la base vieja la web no se rompe:** las lecturas dicen «no existe esa función», la pantalla no ofrece «Cuándo se paga» y el Resumen no dibuja el bloque (ni lo reclama). Con la web vieja y la base nueva, nada cambia.

**Caída externa.** Nada llama a la red. Si la base no responde al abrir «Cuándo se paga», la pantalla lo dice y **no ofrece guardar a ciegas** (podría pisar lo que ya había); si se corta la red al guardar, no se sabe si
llegó y la pantalla lo dice (volver a pulsar «Guardar» no duplica nada). Si no responde al leer el Plan para el Resumen, esa campaña **no se dibuja a medias** y el Resumen lo avisa: nunca un S/ 0 que parezca un dato. Se
degrada así y no pierde ningún dato.

**Probado (`pnpm pruebas:plan-compra-pagos`, 27 casos; cada uno en su transacción con ROLLBACK, salvo la concurrencia, que usa filas reales y las borra al terminar):** la lectura (por defecto «todo», un plan que no
existe da `null`), guardar (versiones, idéntico, versión vieja `PT409`, la suma, 15 imposibles distintos rechazados con `P0001`, IGV, tandas acotadas), **la base rechaza lo imposible aunque nadie pase por la función**,
la visibilidad (tres valores, firma completa), lo pagado (solo comprobantes vigentes de mercadería de órdenes generadas dentro de las fechas, sin IGV), las puertas (rol de la tienda sí; sin el módulo 42501; `anon` nada),
pegarla dos veces, y **cuatro personas a la vez** dejan una sola foto y cuatro cambios de visibilidad se turnan sin error.

## Objeciones que quedan en pie (decisión de Felipe)

1. **El tope y «lo que falta pedir» no son lo mismo en las dos pantallas.** La pestaña Costos y tope compara el tope contra **lo que todavía falta pedir** (`Σ inversión`); Finanzas lo compara contra **todo lo planeado**
   (`pedido + falta pedir`). Apenas se pide algo, el Plan dice «te quedan S/ X para comprar» y Finanzas dice «te quedan S/ Y de aire», con X > Y. Lo coherente es lo de Finanzas (el tope es «cuánto invertir en la
   campaña»); arreglarlo cambia la cuenta del Plan (ADR-0372/0523) y merece su decisión.
2. **El tope está en las unidades del costo que escribes** (con o sin IGV, según la categoría), y Finanzas lo compara contra el plan **sin IGV**: en las categorías marcadas «ya incluye el IGV» la comparación es
   optimista por hasta el 18 %. Se entrega el tope tal cual está; hace falta decidir en qué unidades se fija.
3. **Quien mira el Resumen necesita también el módulo «Plan de campaña».** La compra se lee con las funciones del Plan, que piden ese módulo: una cuenta de Finanzas sin él **no ve el bloque** (se degrada sin avisar,
   porque «no te corresponde» no es una falla). Si el contador debe verlo sin ver el Plan, hace falta una función propia para Finanzas con su permiso: decisión de permisos, tuya.
4. **El flujo de caja de Reportes y Escenarios no leen la compra** (ver arriba): hoy el estado «Solo en Escenarios» no tiene dónde verse.

## Cómo se verifica

Con una campaña con algo por pedir: «Presupuesto ▸ Cuándo se paga» trae cuatro cifras (compra al costo, lo que sale de caja con IGV, hasta cuándo pedir, «esto no es un gasto»); cambiar a 3 tandas, mover una semana o una
forma de pago cambia lo que sale de caja mes a mes; una tanda pedida después de la fecha límite dice que llega tarde; marcar una categoría «ya incluye el IGV» baja el valor sin IGV y deja lo que sale de caja igual;
guardar deja «Guardado por … (versión 1)» y al volver a abrir todo está como se dejó; «Finanzas ▸ Resumen» muestra «Inversión en mercadería» con la misma campaña y **el mismo monto** que el Plan (con el IGV
marcado, «Falta pedir» baja a costo ÷ 1,18 y «de caja saldrán» sigue siendo el costo). Probado en escritorio (claro y oscuro, **`tema:auditar` 0 hallazgos**, también a 375 px).
