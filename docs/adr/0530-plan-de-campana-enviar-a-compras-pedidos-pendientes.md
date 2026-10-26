# ADR-0530 — Plan de campaña ▸ Enviar a Compras: pedidos pendientes de campaña, y la orden solo al confirmar

- **Fecha:** 2026-10-26 · **Estado:** la base está construida y probada en local (`20261026222000_plan_compra_enviar_a_compras.sql`, **solo en local**: espera el OK puntual de Felipe para pegarla en producción);
  la web se arma en los cortes siguientes (ver «Cómo se construye»). El número de este ADR y el de la migración están reservados para la rama `claude/campaign-plan-audit-652032` (`pnpm reservar`).
- **Continúa a:** [ADR-0526](0526-plan-de-campana-paso-2-modelos-colores-y-tallas.md) (el reparto por modelo, color y talla que aquí se envía) y [ADR-0527](0527-plan-de-campana-cuando-se-paga-igv-y-lo-que-ve-finanzas.md)
  (lo pedido que lee Finanzas).
- **Relacionados:** ADR-0362 (órdenes de compra: de ahí sale la orden), ADR-0161 (módulos y roles), ADR-0358 (una función, una pieza), ADR-0389 (guías interactivas), ADR-0136 (movimiento de modales).
- **Origen:** auditoría `/pantalla` de Compras ▸ Plan de campaña (`docs/pantallas/compras-plan.md`, tarea 7b) y el spike ⑦ `7-enviar-a-compras.html` de `docs/maquetas/plan-campana-vision-2026-10/`, que Felipe eligió mirando
  y quiso «tal cual la maqueta».

## El problema

El paso 2 del Plan dice **qué comprar** (modelos, colores y tallas) pero ese reparto se queda en la pantalla: para pedirlo hay que **volver a teclearlo** en Órdenes de compra, uno por uno, y nada une la orden con la
campaña que la originó. Y una orden de compra solo puede estar `generada` o `anulada`: **no existe «lo que pienso pedir pero todavía no confirmé»**. Meter un tercer estado «borrador» en `ordenes_compra` rompería su
numeración (el número se toma al guardar), su PDF, el envío al proveedor y `fn_plan_compra_pedido` (que solo cuenta las generadas): un borrador no es un pedido (principio 2).

## Lo que se decidió

1. **Una tabla propia, `pedidos_campana`: un pedido PENDIENTE por (campaña, categoría, proveedor).** Dice qué estado tiene (`pendiente` → `pedido` | `rectificado`), **cuándo** piensa la persona pedirlo (**«ya»** o
   una **fecha**), con qué versión del paso 2 se envió, cuántas prendas y a qué costo por prenda (el del plan al enviar), y quién y cuándo. Sus líneas (`pedidos_campana_lineas`: modelo × color × talla × prendas) son
   **la foto de lo enviado** y no se editan.
2. **Enviar NO pide nada.** Solo deja el pedido pendiente en Compras. **La única función que crea una orden de compra es `confirmar_pedido_campana`**, y la aprieta quien tiene «Órdenes de compra», en Compras. Hasta
   entonces el pedido **no cuenta** como pedido: ni el Plan lo resta de «falta pedir» ni Finanzas lo suma a «lo pedido» (no es plata comprometida).
3. **Se envía el paso 2 GUARDADO, con la versión que la persona vio.** Si otra persona guardó otro paso 2 mientras tanto, enviar se rechaza con `PT409` y dice que vuelva a abrir la categoría: lo que se manda es lo
   que se miró. Si el paso 2 cambia **después** de enviar, el pedido no se toca (es lo que se envió) y la bandeja y el Plan dicen **«el plan cambió desde que se envió»**.
4. **Los grupos son por proveedor** (`productos.proveedor_id`), con un solo envío activo por grupo. **Lo que no se envía se dice, no se calla:** las prendas de modelos **sin proveedor** o **sin marca**, los
   **modelos nuevos** (lo que el paso 2 dejó «por elegir»: no hay producto que pedir todavía) y **lo del Taller** (el proveedor «CAYLA SAC» es el propio taller: su pedido es una orden de **producción**, no de
   compra, y conectarlo con Producción es otro cambio, de otro módulo).
5. **La orden que nace** es la de siempre (`crear_orden_compra`, con todas sus reglas): **una línea por modelo**, con sus colores y tallas dichos en la descripción (`Negro S×5 M×3; Blanco M×2`: la orden no guarda color
   ni talla), la marca del modelo, la categoría y **el costo del plan** como precio; **entrega para el inicio de la campaña** (o hoy, si ya empezó) para que el Plan la cuente como pedida de **esta** campaña
   (`fn_plan_compra_pedido` mira la entrega estimada); **sin tienda destino** («por repartir desde Lima»); una nota «Pedido de campaña: …». Con más de 100 modelos, una línea por marca (una orden lleva hasta 100).
6. **Cambiar de decisión ANTES de pedir se llama «rectificar»** y exige una razón de 3 a 200 letras; queda quién, cuándo y por qué, el pedido deja de contar y **se puede volver a enviar** (el rectificado es historia).
   **Un pedido que ya es orden NO se rectifica desde aquí:** se anula en Órdenes, para que la orden y el plan no queden contradiciéndose. **Cambiar la fecha** también vale solo mientras está pendiente.
7. **Quién puede qué (ADR-0161):** enviar y leer lo del Plan piden **«Plan de campaña»**; confirmar y leer la bandeja de Compras piden **«Órdenes de compra»**; cambiar la fecha, rectificar y ver las líneas de un
   pedido valen con **cualquiera de los dos**. No se creó ningún módulo (ADR-0306): son funciones de pantallas que ya tienen su módulo.
8. **Antes de crear la orden se revisa lo que ella rechazaría, y se dice con el nombre de la cosa** (la orden diría «la línea 3»): un proveedor, una categoría o una marca inactivos, un modelo al que se le
   quitó la marca, **o un modelo cuyo proveedor cambió desde que se envió** (pedirle a quien ya no lo surte es el error que no se ve hasta que llega la mercadería). En todos esos casos el pedido **sigue pendiente**.

```
DECIDÍ:     una tabla propia de pedidos pendientes de campaña (estado, cuándo y foto de líneas) cuya única salida a una orden de compra es una función que la crea con las reglas de siempre y deja el pedido ligado a
            ella en la misma transacción.
DESCARTÉ:   (a) un estado «borrador» en `ordenes_compra`: rompe la numeración, el PDF, el envío al proveedor y `fn_plan_compra_pedido`, y una orden «a medias» es el estado imposible que el principio 2 prohíbe;
            (b) crear la orden al enviar (Felipe pidió que quien compra confirme: enviar es una intención, confirmar es plata); (c) un pedido por categoría con todos los proveedores adentro: una orden es de UN
            proveedor y no se puede confirmar a medias; (d) guardar solo las celdas y volver a leer el paso 2 al confirmar: si el plan cambió, se pediría algo que nadie envió; (e) dejar rectificar un pedido ya
            confirmado: la orden existe, se anula en Órdenes (otro módulo, otras reglas) y dos pantallas no deben poder deshacer lo mismo de dos formas.
SE ROMPE SI: dos personas confirman el mismo pedido a la vez (lo cierra el bloqueo de la fila: la segunda recibe la MISMA orden y el índice único de la orden lo respalda); alguien rectifica mientras otra confirma
            (se turnan: gana una, la otra recibe su razón); el costo del plan se edita después de enviar (el pedido pide al costo que tenía al enviar; el Plan ya lo marca «desactualizado» solo si cambia el paso 2, no el
            costo: ver «Objeciones»); o la campaña empieza dentro de más de un año (la entrega se topa a un año y el Plan no la contaría como pedida de esa campaña).
```

## Cómo se prueba que no se rompe (todo-o-nada, concurrencia y caídas)

- **Estados imposibles, en el esquema y no en la pantalla** (`pruebas:plan-compra-envio`, 51 casos): un «pedido» sin orden, un «rectificado» sin motivo, «ya» con fecha, dos envíos activos de lo mismo, una orden ligada a
  dos pedidos, una línea repetida o de 0 prendas, un pedido que cambia después de pedido o de rectificado, que se borra o cuyo plan, proveedor, prendas o costo se editan: **los rechaza la tabla** aunque nadie pase por
  las funciones. Las tablas no se leen ni se escriben desde la web (RLS encendido, **sin políticas** y sin permisos de tabla).
- **Todo-o-nada:** un lote de envíos con UNO inválido no deja ninguno; si la orden de compra rechaza algo que nada más ve (un modelo con más de 99 999 prendas), el pedido **sigue pendiente y no nace orden**.
- **Sesiones reales a la vez** (con commit, sobre filas «ZZ Envio Real» que se borran al terminar): cuatro personas envían a la vez lo mismo → **un** pedido; cuatro confirman a la vez → **una** orden, la misma para las
  cuatro; alguien confirma mientras otra rectifica, cuatro veces → gana una, y las órdenes que nacen son exactamente los pedidos «pedido». **Se comprobó que la prueba ve el fallo:** sin el bloqueo de la fila en
  `confirmar_pedido_campana`, K2 y K3 fallan (y la invariante sigue en pie gracias al disparador de la tabla, que es la segunda red).
- **Caída externa:** no hay red de por medio. Si la base no responde, no se envía ni se confirma nada y la pantalla lo dice; lo que ya estaba en pantalla no se pierde.
- **La puerta responde a la sesión de la tienda** (el rol `authenticated`, no el dueño: ADR-0496 rompió la tienda 16 h por probar solo como dueño) y se cierra sin el módulo que toca y a `anon`.

## Lo que todavía no hace (honestidad)

- **Lo del Taller no llega a Producción**: se dice «va a Producción» y no se crea nada. Conectar el pedido con Producción ▸ Órdenes es otro módulo.
- **La orden no lleva color ni talla** (`orden_compra_items` no los guarda): van en la descripción de cada línea y en el pedido de campaña, que se puede ver desde la orden.
- **El destino de la mercadería no se elige aquí**: la orden nace «por repartir desde Lima» y se reparte como siempre.
- **No hay aviso al proveedor ni al correo**: confirmar crea la orden y el resto del circuito (PDF, envío) es el de Órdenes de compra, sin cambios.

## Objeciones para Felipe (esto cruza módulos)

1. **Es una decisión que toca dos módulos** (Plan de campaña y Órdenes de compra) y agrega una tabla a Compras. Todo está **solo en local**; nada se pega en producción sin tu OK puntual.
2. **El costo del plan se edita después de enviar y el pedido no se entera**: pide al costo que tenía al enviar. Hoy el Plan solo marca «desactualizado» si cambia el paso 2. Si prefieres que cambiar el costo también lo
   marque, es una columna más en la comparación (no lo hice: el costo de una categoría cambia por muchos motivos y el aviso sería ruido).
3. **Cualquiera de los dos módulos puede rectificar o cambiar la fecha** (decisión 7). Si quieres que rectificar sea solo de quien confirma, es quitar un `or` en dos funciones.

## Pegarla en producción (con el OK puntual de Felipe)

Va **después** de `20261026212000`. Son dos tablas **nuevas** con su `enable row level security` (sin políticas, así que no choca con el Asesor de seguridad: ADR-0195), disparadores con `create or replace trigger`,
y funciones; **no hace `alter` de ninguna tabla en uso**, tiene `lock_timeout` de 3 s y se puede pegar dos veces. **El orden con la web da igual:** la web nueva con la base vieja recibe «no existe esa función» y no ofrece
enviar ni dibuja la bandeja; la web vieja con la base nueva no sabe de pedidos. Después de pegarla, refrescar el diccionario (`pnpm datos:generar:produccion`).
