# ADR-0663 — Los colores salen de la foto

- **Fecha:** 2026-11-13 · **Estado:** construido y probado en local; solo web, **sin migración** (usa `retail.color_combinado` y la ruta
  `POST /api/productos/colores`, que ya están en producción). La web todavía no está publicada.
- **Rama:** `claude/ai-color-extraction-64487e`. Número reservado con `pnpm reservar`.
- **Relacionados:** ADR-0643 (la mezcla es UN color de la carta), ADR-0634 (estampados), ADR-0659 («Catálogo con IA»), ADR-0442 (la foto se
  sube tal cual), ADR-0576 («Existe también»), ADR-0284 (guía de foco), ADR-0389 (guías interactivas).
- **Maqueta aprobada:** `docs/maquetas/colores-desde-la-foto-2026-11/`.

## El problema

Felipe, 2026-11-13: en Nuevo producto y en Recibir ▸ Nueva prenda hay que buscar cada color en una carta de 86, y la foto de la prenda ya se
sube de todos modos. «Ya no se debe seleccionar los colores sino que a partir de la foto se colocarían», y «si una prenda tiene varias
tonalidades, el script debe tomarlos todos […] o si solo existe un color entero, solo seleccionar ese».

## Lo que se decidió

1. **«Fotos y colores» reemplaza a la carta** en el paso de colores de las dos pantallas (`components/alta-producto/FotosYColores.tsx`). Se sube
   una foto por color (o varias a la vez, o se arrastran) y cada una se lee en el navegador. La carta de siempre queda para «Cambiar» una
   tarjeta y para «Elegir sin foto» (una prenda sin foto a mano no puede quedar sin crearse).
2. **El lector es lógica pura y local** (`lib/colores-de-la-foto.ts`, con prueba): quita el fondo (lo transparente del PNG, o lo que se
   parece al borde recorriendo desde afuera), agrupa los tonos (k-medias en Lab, arranque determinista), junta los del mismo color con
   ΔE2000 y la luz a la mitad (kL = 2, la regla CMC 2:1 de los textiles), lleva cada grupo al color más parecido de la carta y deja fuera
   lo que ocupa menos de 8 % (botones, etiqueta). Misma foto, mismo resultado; menos de un segundo; sin costo.
3. **Qué queda elegido:** un tono → ese color; 2 a 4 tonos en zonas grandes → **una** mezcla (ADR-0643): la que ya existe con esos
   componentes, o una nueva por el mismo camino que «+ acompañante». Nunca varios colores sueltos: serían varias variantes con el stock
   partido.
4. **Lo dudoso se pregunta, nunca se pone a escondidas:** un tono a más de 8 (el «casi igual» de todo el ERP) del color más parecido →
   «Usar X» o «Crear este color»; un dibujo que se repite → «Elegir el estampado» o «Es una mezcla»; más de 4 colores → «Multicolor» o la
   carta; una foto sin prenda → la carta.
5. **«Crear este color» abre la hoja «Nuevo color» con el tono de la foto** y una **paleta con todos los colores** (`components/ui/PaletaDeColor.tsx`,
   lógica en `lib/paleta-color.ts`) que mueve el mismo tono que el campo de #hex o RGB. «Existe también» (ADR-0576) sigue frenando el
   nombre repetido. La paleta está solo en esa hoja; Catálogo ▸ Atributos sigue con su selector.
6. **La espalda no es otro color:** una foto cuyo color ya tiene tarjeta se suma a esa tarjeta.
7. **Con «Catálogo con IA» encendido**, cada foto pasa primero por la IA (con el mismo molde) y el color se lee de su PNG sin fondo, que es
   más exacto. Si la IA no responde, se avisa, queda la foto real y se lee esa.
8. **Una foto que espera su color bloquea crear** (`problemasAlta` y la guía de foco, con la misma frase): si no, se perdería.

## Lo que se descartó

- **Pedirle los colores a la IA:** 25 s y costo por foto, y responde nombres sueltos que igual hay que llevar a la carta. El lector local es
  instantáneo, gratis, repetible y funciona con la IA caída.
- **Comparar el tono que más se repite en vez del promedio:** en la maqueta arregló un negro con brillo y oscureció un vino con sombra.
- **Crear la mezcla recién al guardar:** obligaba a rehacer cómo la tabla de cantidades identifica cada color (toca stock). Se crea al leer la
  foto; si la persona cambia el color, la mezcla sobrante no se ve en la carta (las mezclas guardadas no se ofrecen) y la base no permite dos
  iguales (`colores_componentes_unico`).

## Lo que se rompe si

- **La sombra o el fondo engañan al lector:** con luz fuerte, un negro puede leerse «Gris antracita»; una prenda crema sobre fondo crema
  pierde el crema (la tarjeta lo avisa). Defensa: la foto de la IA (luz pareja, sin fondo), «Cambiar» y el «¿Por qué?» de cada tarjeta.
- **Se crean colores casi repetidos desde fotos con mala luz:** «Existe también» frena el nombre y la hoja avisa si el tono ya está. Si igual
  pasa, que el color creado desde una foto nazca «pendiente» hasta que lo apruebe un líder (decisión de Felipe, si pasa).
