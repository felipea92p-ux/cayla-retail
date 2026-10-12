## 2026-10-11 (El precio de una tienda ya no puede quedar bajo el costo)
Qué hice: `poner_precio_sede` rechaza un precio menor que el costo de cualquiera de las tallas activas, para todos (líder incluido), sin decir cuánto cuesta; la hoja lo dice antes de guardar a quien ve costos y «Precio por tienda» marca «Bajo el costo» si el costo subió después (ADR-0370).
Por qué así: la caja ya prohíbe vender bajo el costo a todos, el precio de tienda no vence y cambia lo que cobra toda una tienda, y en 90 días nadie vendió bajo el costo, así que la regla no estorba; para liquidar queda la campaña.
Felipe se lleva: un error de tipeo (S/ 6.99 en vez de 69.90) ya no puede dejar una tienda vendiendo a pérdida; el tope para integrantes se dejó como está a propósito.
