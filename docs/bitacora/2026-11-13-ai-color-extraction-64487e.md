## 2026-11-13 — Los colores salen de la foto (ADR-0663)

- **Qué:** en Nuevo producto (paso 3) y en Recibir ▸ Crear la prenda que llegó (paso 2), «Fotos y colores» reemplaza a la carta: una foto por color, el color se lee en el navegador (`lib/colores-de-la-foto.ts`), 2 a 4 tonos son UNA mezcla (ADR-0643), lo dudoso pregunta (color fuera de la carta → hoja «Nuevo color» con paleta y el tono de la foto; estampado; Multicolor), la espalda se junta con su color, con «Catálogo con IA» el color se lee del PNG sin fondo, y una foto sin color frena crear. Solo web, sin migración.
- **Por qué:** Felipe: «ya no se debe seleccionar los colores sino que a partir de la foto se colocarían». Leer en el navegador es instantáneo, gratis y repetible; pedírselo a la IA costaba 25 s y dinero por foto.
- **Cómo se verifica:** `npx vitest run lib/colores-de-la-foto.test.ts lib/paleta-color.test.ts lib/alta-producto-guia.test.ts lib/guias.test.ts`; en local, /productos/nuevo paso 3 con fotos de prueba (lisa, espalda, mezcla, mezcla nueva, rayas, tono fuera de la carta, IA simulada y caída). `/chaos`: dos sesiones creando la misma mezcla a la vez dejan UNA fila (resistió).

## 2026-11-14 — La foto de «Catálogo con IA» ya no alarga la prenda (ADR-0659 act.)

- **Qué:** el pedido a OpenAI pasó de «rellénala como una persona de talla estándar» a «Nueva A»: el maniquí pone la forma y la prenda sus medidas (largo, corte, mangas, bordes y estampado). En la misma tanda: «Usar mi foto» volvió a la tarjeta de su color, y con dibujo «Es una mezcla» es lo principal.
- **Por qué:** Felipe vio la blusa verde alargada (+8 %). Con «Nueva A» queda puesta y con su largo (0 a −3 %). «Igual a la foto» la dejaba colgada como en el gancho; Felipe eligió mirando la lámina de 5 prendas.
- **Cómo se verifica:** `npx vitest run lib/openai-imagen-reglas.test.ts`; la tabla está en la ADR-0659 («Actualización 2026-11-14 — Puesta, pero la misma prenda»).

## 2026-11-14 — Recibir: sumar un color nuevo con su foto a una prenda que ya existe (ADR-0663 punto 9)

- **Qué:** en Recibir, «Tallas y colores de <prenda>» usa «Fotos y colores»: el color nuevo sale de su foto, los que ya tiene dicen «Ya la tiene», la IA usa de molde la foto de catálogo de la prenda y la foto se suma detrás de las suyas sin cambiar la principal. Antes: el color se elegía de la lista y la foto quedaba para Productos. Además, una foto que la IA prepara ya no se pierde al cambiar de paso (Nuevo producto y Recibir).
- **Por qué:** Felipe: «¿qué pasa si es una prenda que ya existe y solo se quiere agregar un color nuevo?».
- **Cómo se verifica:** `npx vitest run lib/fotos-y-colores-reglas.test.ts lib/fotos-en-curso.test.ts`; en local, un envío con «Blusa Emma verde» → «Sí, es esta» → «Agregar talla o color» → foto → «Es una mezcla» → «Sumar 3 y contar»: 3 variantes nuevas, el pedido a la IA trajo el molde y la foto quedó en el orden 1 sin ser principal (probado con la IA simulada; base restaurada).

