## 2026-11-14 — Recibir: «Igual que la anterior» (tarea 7 del tablero de Recibir)

- **Qué:** al crear la siguiente prenda del envío, el paso «¿Cómo es?» ofrece una ficha con el tejido, el patrón y las tallas de la prenda recién creada en la misma categoría (cada dato se quita con su ✕; «Usar» los llena de un toque); y al agregar otro modelo, bajo «La marca», «Como el anterior: <marca>. Usar esa marca». Lógica pura en `apps/web/lib/recepcion-igual-que-anterior.ts` con su prueba; la ficha en `components/recepcion-envio/FichaDeLaAnterior.tsx`; lo recuerda `ContarEnvio` mientras la pantalla está abierta.
- **Por qué así:** es una oferta que se toca, no un valor de fábrica (tallas y marca arrancan vacías por decisión de Felipe; tejido y patrón son opcionales desde el 3-nov). No pisa lo que la persona ya eligió, y nombre, colores y precio no se copian.
- **Verificado:** en local, envío ENV-001660, dos prendas seguidas de Camisas y Blusas: la segunda llegó con Lino y S a L de un toque (Liso quitado antes), y la marca CAYLA se ofreció y se puso en el modelo siguiente. Base local restaurada a la foto. Queda: «Crear ahora» de «Para después» (HacerAhora) no la ofrece todavía.

## 2026-11-14 — «La anterior» sale de la base (innovar `recibir-crear-prenda#1`)

- **Qué:** `/innovar rapido` sobre crear prendas en Recibir dejó 6 propuestas (`docs/innovacion/2026-11-14-recibir-crear-prenda.md`) y Felipe aceptó la #1: la ficha ya no vive solo en la pantalla. `leerPrendasCreadasDelEnvio` lee de `productos` (GET, sin loader, sin migración) las prendas del conteo creadas desde que se abrió el envío, con su tejido, patrón y tallas; `anteriorDeLaCategoria` elige la última de la categoría.
- **Verificado:** prueba de la lectura con la forma real que devuelve PostgREST; en local, la pantalla hace la consulta (200) y, como en ENV-001660 ninguna prenda del conteo se creó después de abrirlo, no ofrece ficha.
- **Queda:** «Crear ahora» de «Para después» (`HacerAhora.tsx`) no la ofrece: abre de a un pendiente y no tiene a mano las prendas del envío.
