# ADR-0555 — Las fechas de una campaña se ponen al crearla y se cambian en «Editar», no en «Configuración»

- **Fecha:** 2026-10-28 · **Estado:** aceptado (Felipe lo pidió probando en local, 2026-10-28).
- **Relacionados:** ADR-0496 (las ofertas de una campaña), ADR-0541 (una campaña con solo ofertas sale en la Tienda web), ADR-0490 (Editar: nombre e ícono),
  ADR-0488 (la hoja «Configuración» de una campaña).

## El problema

Desde ADR-0496 el descuento de una campaña se arma con **ofertas**, y «Configuración» es la hoja de las ofertas. Pero la misma hoja seguía cargando
con el cambio de fechas de la campaña («Cambiar fechas», «Repetir en 2027», «Guardar fechas»): mezclaba lo que es de la campaña (cuándo rige) con
lo que es de cada oferta (cuánto baja, en qué prendas, cuándo). Y al crear una campaña no se podían poner fechas: había que abrir «Configurar».

## Lo que se decidió

1. **Al crear** una campaña, «Cuándo rige» (Desde, Hasta) es opcional. Las fechas viajan en el mismo pedido de alta
   (`crear_campana(p_nombre, p_desde, p_hasta)`, que ya las aceptaba desde 20261022203000): todo o nada. Sin migración.
2. **«Editar»** (el botón del pase) cambia el nombre, el ícono **y las fechas** de una campaña. Se guardan por la puerta de siempre
   (`PATCH campana`), mandando el descuento y las categorías tal como están: solo cambian las fechas. Si el cambio mueve hoy el precio de alguna
   prenda, avisa que las etiquetas de papel quedaron viejas (el mismo aviso de antes).
3. **«Repetir»** vive en «Editar»: una campaña que ya pasó ofrece «Repetir en 2027» (mismas fechas, un año después, con el aviso del día de la
   semana). No pone las fechas solo: abre con las actuales y el botón las cambia; «Deshacer» las devuelve.
4. **«Configuración»** ya no cambia fechas: la franja de arriba solo las dice. Si la campaña no tiene fechas o ya terminó, manda a «Editar».
5. En el pase, **«Lo que ya tiene»** pierde la fila «Descuento» (ya no hay descuento directo) y gana «Promociones» debajo de «Ofertas». Hoy dice
   «ninguna todavía»: la base solo tiene un tipo de oferta («un % menos»); la fila espera un segundo tipo (2x1, soles menos…).
6. La ayuda de un campo opcional puede ir **bajo el título** (`CampoGuiado ayudaAbajo`); solo «Nueva campaña» la usa.

## Descartado

- **Dejar las fechas en las dos hojas:** dos lugares para lo mismo; la persona no sabría cuál manda.
- **Que «Editar» abra con las fechas del año que viene ya puestas** (lo que hacía «Repetir»): cambia sin que nadie lo pida. Felipe pidió una opción.
- **Una fila «Ofertas y promociones» sola:** más honesta con los datos de hoy, pero Felipe prefirió las dos filas.
- **Un RPC nuevo que cambie solo las fechas:** pide pegar una migración en producción; `actualizar_campana_etiqueta` ya lo hace si se le manda el resto igual.

## SE ROMPE SI

Alguien agrega a «Editar» un cambio de descuento o de categorías sin mandar lo que hay (el RPC reemplaza todo lo que recibe: mandaría el descuento o las
categorías en blanco), o si «Configuración» vuelve a guardar fechas (dos lugares).

## Verificado

En el navegador local: crear una campaña con fechas (aparece en «Lo que viene» y en la base con sus fechas), un «Hasta» antes del «Desde» (avisa y
bloquea «Guardar»), cambiar las fechas de «Dia del perro» desde «Editar» (guarda y no toca sus categorías), «Repetir en 2027» sobre «Aniversario CAYLA»
(sin guardar), y «Configuración» sin controles de fecha. Tipos, lint, knip y las pruebas de guías, guía de foco, piezas únicas, tokens y `sellos-pases`.

## Sin verificar

El guardado de una repetición real, y los tres cambios a 375 px.
