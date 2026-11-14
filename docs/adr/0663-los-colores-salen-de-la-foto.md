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
   «Usar X» o «Crear este color»; un dibujo que se repite → «Es una mezcla» (lo principal: el dibujo ya lo dice el patrón del paso 2) o «Elegir otro color» («Elegir el estampado» solo si la lista tiene algún color estampado; producción no tenía ninguno al 2026-11-14, Felipe); más de 4 colores → «Multicolor» o la
   carta; una foto sin prenda → la carta.
5. **«Crear este color» abre la hoja «Nuevo color» con el tono de la foto** y una **paleta con todos los colores** (`components/ui/PaletaDeColor.tsx`,
   lógica en `lib/paleta-color.ts`) que mueve el mismo tono que el campo de #hex o RGB. «Existe también» (ADR-0576) sigue frenando el
   nombre repetido. La paleta está solo en esa hoja; Catálogo ▸ Atributos sigue con su selector.
6. **La espalda no es otro color:** una foto cuyo color ya tiene tarjeta se suma a esa tarjeta.
7. **Con «Catálogo con IA» encendido**, cada foto pasa primero por la IA (con el mismo molde) y el color se lee de su PNG sin fondo, que es
   más exacto. Si la IA no responde, se avisa, queda la foto real y se lee esa.
8. **Las fotos tienen un solo lugar** (/formidable, Felipe 2026-11-14): la tabla de variantes de Nuevo producto ya no lleva la miniatura
   por fila ni la línea «Una foto para todos los colores»; «Catálogo con IA» se prende junto a «Fotos y colores». En las tarjetas, lo que
   espera una respuesta va primero y lleva un solo botón negro; ante un color que no está creado, **«Usar X» es el principal** y «Crear
   este color» el secundario. Una prenda sin color (una correa) recibe su foto en Editar producto.
9. **Sumar un color a una prenda que ya existe, con su foto** (Recibir, Felipe 2026-11-14): la hoja «Tallas y colores de <prenda>» también
   usa «Fotos y colores» (con permiso de fotos). Los colores que la prenda ya tiene salen como tarjetas «Ya la tiene» (sin pedir foto; su ×
   solo los quita de lo que llegó). Con «Catálogo con IA», el molde es la foto de catálogo que la prenda ya tiene (la principal, si es de IA),
   y la foto se sube a la prenda detrás de las suyas sin cambiarle la principal (`lugarDeLasFotosNuevas`), también cuando no hay nada nuevo
   que crear.
10. **Una foto en proceso no se pierde al cambiar de paso:** la guarda la pantalla (`useFotosEnCurso`), no la pieza.
11. **Una foto que espera su color bloquea crear** (`problemasAlta` y la guía de foco, con la misma frase): si no, se perdería.

## Lo medido con fotos reales (actividad 2, 2026-11-13)

90 fotos de 90 productos de producción (solo lectura; 56 PNG, 34 JPG; ninguna todavía de «Catálogo con IA»), contra el color puesto a mano
y contra una revisión visual foto por foto (en 12 de 69 prendas lisas, el color de la carta asignado no describe la foto). Errores callados
(propone un color o una mezcla equivocados, o liso para algo con dibujo):

| Lector | Lisas: acierta / pregunta / falla | Con dibujo: pregunta / propone | Errores callados |
|---|---|---|---|
| Primero (tonos unidos en cadena, tono 10, dibujo 0,04) | 53 / 5 / 11 | 4 / 8 | 19 |
| **El de hoy (de a dos grupos sin cadenas, fondo encerrado fuera, tono 12, dibujo 0,05)** | **53 / 10 / 6** | **10 / 2** | **8** |

Los dos cambios se hicieron porque los umbrales solos no alcanzaban (bajar «tono» a 4 partía las lisas). `/formidable` encontró el mismo
error en el navegador: unas rayas de 400×500 achicadas salían «Gris 100 %». Quedan como pruebas de regresión en `colores-de-la-foto.test.ts`.
Lo que falla todavía: sombras fuertes (azul marino que sale negro), dibujos muy finos que el achicado borra, accesorios metálicos. Hay que
volver a medir cuando haya fotos de «Catálogo con IA», y revisar los hex de la carta que el equipo usa distinto (FFF, MOK, AMM).

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
