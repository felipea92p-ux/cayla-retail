# ADR-0522 — Plan de campaña: un centro de avisos compacto, con lo urgente a la vista

- **Fecha:** 2026-10-26 · **Estado:** construido y probado en local (sin migración: no toca la base). Pendiente: que Felipe lo mire con datos de verdad y lo fusione.
  El número de este ADR está reservado para la rama `claude/campaign-plan-audit-652032` (`pnpm reservar`).
- **Continúa a:** [ADR-0499](0499-plan-de-campana-descuento-y-fecha-limite.md) (el plazo y el descuento que ahora avisan desde aquí; su «paso 4», el aviso de
  deriva, vive en este centro) y [ADR-0520](0520-plan-de-campana-historial-de-lo-que-propuso-el-sistema.md) (la exactitud de los datos que el centro lee).
- **Relacionados:** ADR-0185 (la página no se encoge bajo el mouse), ADR-0358 (una función, una pieza: ver «Lo que se aparta de ella»), ADR-0389 (guías interactivas).
- **Origen:** auditoría `/pantalla` de Compras ▸ Plan de campaña, tarea #4 (`docs/pantallas/compras-plan.md`); spike ② (`docs/maquetas/plan-campana-vision-2026-10/2-avisos.html`),
  que Felipe eligió mirando y pidió que se vea «tal cual en la maqueta».

## El problema

El Plan avisaba en cinco lugares a la vez: la franja del plazo para pedir, la línea del stock sobre la tabla, el detalle del stock en el cajón, «empezó sin plan» y
«no encontramos esa campaña». Y **el número del ícono contaba solo las tiendas sin stock al día**: el plazo para pedir, que es lo que cuesta plata si se ignora, no sumaba.
Además, el descuento de una campaña puede cambiar después de armar el plan y nada lo decía (ADR-0499, paso 4).

## Lo que se decidió

1. **Un solo centro de avisos**, junto a las pestañas: una campana de 40 px con su número dentro, sin palabra (abierto dice «Ocultar»). Abre una lista **flotante** que no mueve la tabla,
   con su propia barra de desplazamiento cuando hay más avisos de los que caben. Se cierra con Escape, con un clic afuera y al elegir una acción que abre otra cosa.
2. **Lo urgente asoma aunque esté cerrado.** Si el plazo es justo o ya no llega y hay algo por pedir, una línea roja con su punto que late asoma junto a la campana («Pide antes del 26/10 · hoy») y el
   número se pone rojo. Esconder el plazo tras un contador baja cuánto se lo descubre (NN/g; PatternFly), y es el único aviso cuyo costo de ignorarlo es dinero.
3. **El número cuenta lo que hay que hacer** (urgentes y por atender) y lo que la persona no marcó como visto; lo que solo informa («los datos todavía no son exactos») se lee al abrir y no suma.
4. **«Ya lo vi» no borra:** deja de contar ese aviso **hasta que cambie el dato** (su huella: otra tienda sin cuadrar, otra categoría planeada, otro descuento). Lo urgente no se puede marcar. Lo que solo
   informa («Entendido») se esconde. Se recuerda en este navegador, una llave por campaña (`useAvisosVistos`); es una comodidad de quien mira, no un dato del negocio.
5. **Seis avisos**, de más a menos urgente: el plazo, el stock sin cuadrar, las que más venden sin plan, la **deriva del descuento**, el tope y lo exacto de los datos. Lo que cambia lo que se está
   mirando (campaña archivada, «no encontramos esa campaña», «empezó sin plan») **se queda en su lugar**: no son pendientes.
6. **Deriva del descuento (ADR-0499, paso 4):** una categoría con plan cuyo descuento guardado no es el que hoy da la campaña. No se compara si el sugerido rige solo algunos días o algunas tiendas
   (la persona pudo corregirlo a propósito y marcarlo sería un falso aviso), ni si la base no guarda el descuento.
7. **La lógica es pura y probada** (`lib/plan-compra-avisos.ts`, 37 casos): qué es urgente, qué cuenta, cuándo un «ya lo vi» deja de valer, la deriva. La pieza solo dibuja
   (`components/plan-compra/CentroDeAvisos.tsx`, cara en `app/estilos/centro-avisos.css`).

```
DECIDÍ:     un centro de avisos único que cuenta lo que hay que hacer, con lo urgente asomando una línea aunque esté cerrado.
DESCARTÉ:   (a) esconder todo tras el número, sin nada a la vista: la investigación dice que baja el descubrimiento justo del aviso que cuesta plata;
            (b) dejar las franjas y sumar el centro: cinco lugares más uno;
            (c) guardar «ya lo vi» en la base: sería un dato por persona y por campaña para una comodidad; en el navegador alcanza y no toca producción.
SE ROMPE SI: la persona usa dos computadores (lo visto en uno no se ve en el otro: el aviso vuelve a contar, que es el lado seguro); o si un aviso PENDIENTE importa tanto como el plazo y nadie abre la
            campana: hoy solo lo urgente asoma. El stock sin cuadrar tenía antes su línea sobre la tabla (la prueba ciega solo lo encontraba tocando el ícono); ahora se lee abriendo la campana.
            Es el costo de lo compacto que Felipe eligió; si hace falta, el plazo y el stock vuelven a asomar con un cambio de una línea (`corto` en `lib/plan-compra-avisos.ts`).
```

## Lo que se aparta de ellas (a propósito)

- **No usa `<Aviso>` ni `<Globito>`** (ADR-0358): Felipe pidió que se vea **tal cual la maqueta** (la franja de 5 px, la etiqueta del nivel, los botones en columna a la derecha, el número dentro del botón).
  El CSS es la maqueta traducida a los tokens, así que el modo oscuro sale solo. Si Felipe quiere que otras pantallas lo usen, pasa por `/unificar`.
- **Un bucle:** el punto de la línea que asoma late mientras haya algo urgente, como el de «Vencida» (señal de «esto urge», no adorno). Se apaga con `prefers-reduced-motion`.
- **Tamaños de ícono fuera de la escala** (campana de 18 px, ícono de aviso de 22 px, los de la maqueta): `app/estilos/centro-avisos.css` está en las excepciones de la familia `icono`.
- **El borde de los botones** es `borde-control` (3:1), el color del sistema para lo que se toca; la maqueta usaba el taupe al 60 %, casi igual a la vista.

## Lo que cambió en la pantalla

- Sale la franja del plazo (su «Cambiar los días» vive en el aviso del plazo) y la línea del stock sobre la tabla (`AvisoStockEnLinea`, su prop `avisoStock` y el número viejo `avisosDelResumen`).
- El cajón pasa a llamarse **«Resumen»** (el detalle del stock por tienda sigue adentro, y «Ver qué falta» lo abre).
- La guía de `compras.plan` explica el centro (dos pasos nuevos) y deja de apuntar a las franjas que ya no existen; huella aceptada.

## Cómo se verifica

Con el plazo justo y algo por pedir: la campana y su número se ponen rojos y asoma la línea aunque esté cerrada; con todo en orden, el número es 0 y no asoma nada; «Ya lo vi» baja el número y vuelve si cambia el dato;
cambiar un descuento guardado a otro que el de la campaña hace aparecer «La campaña dice −20 % y tu plan de Vestidos supone −10 %»; con más avisos de los que caben, la lista corre por dentro sin mover la página.
Probado en escritorio (claro y oscuro) y a 375 px; `guias:recorrer compras.plan` recorre sus 29 pasos.
