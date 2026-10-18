# ADR-0449 — En el probador, la prenda de abajo se une a la de arriba por su pretina

**Fecha:** 2026-10-17
**Estado:** Construido en la rama. `tsc` de la tienda, `eslint`, `pnpm knip` y las 565 pruebas de la tienda en verde. **Mirado en el navegador local** con la figura real y
prendas de producción (polo con ojal, camisa beige, blusa bordada, blusa negra crop, falda y pantalón de pierna ancha). **Falta:** verlo con una cuenta real en
`/looks/arma`, en un celular de verdad (Safari) y la figura quieta (ver «Pendiente»).
**Afecta:** `apps/tienda/lib/union-prendas.ts` y su prueba (nuevos, puros), `apps/tienda/components/probador/useUnionDeLaFigura.ts` (nuevo) y `Figura.tsx`. **No toca la
base**: sin migración, sin columna nueva, sin RPC.
**Relacionado:** ADR-0434 (el probador), ADR-0444 (máximo 3 prendas), ADR-0442 (el recorte sale del PNG de la IA).

## Contexto

Felipe (2026-10-17), mirando el probador: «la unión con el pantalón debe coincidir». Con un polo con ojal y la «Falda Jean», la pretina de la falda asomaba más ancha que el borde
del polo (244 px contra 155 px en la escena). La causa: cada prenda se dibujaba por su **largo en cm** (el propio o el típico de su categoría) y su ancho salía de la proporción de
su recorte. La falda no tiene largo propio y usaba el típico de 55 cm, cuando una mini mide unos 40: salía más grande que la realidad, con la pretina ancha.

## Decidí

1. **La prenda de abajo se dibuja por su PRETINA, no por su largo.** `cajaDeAbajoUnida` iguala la pretina de la falda, el short o el pantalón al ancho del borde de abajo del torso de la
   prenda de arriba; su largo sale de la forma de la foto, entre 20 y 120 cm. Una mini y una maxi salen bien sin anotarles nada.
2. **Con un margen de ±15 % de una cintura estándar (36 cm plana).** Una falda no cambia de tamaño porque se cambie de blusa: con una blusa ajustada la unión coincide, y una oversize
   o un crop simplemente cuelga por encima de la pretina, como en una persona.
3. **Las dos medidas salen de la propia imagen del recorte, en el navegador del cliente** (`useUnionDeLaFigura`): el almacén deja leer los píxeles de un recorte (CORS abierto), se baja
   a 240 px y se miden dos fracciones por prenda. Funciona ya con los 338 recortes que existen, sin columna nueva y sin volver a procesar nada. Se guardan en memoria por URL mientras
   dura la pestaña.
4. **Se mide con el tramo de prenda más ancho de cada fila**, así dos mangas sueltas a los lados no se suman al torso; el borde de abajo es donde termina ese torso.
5. **Mientras llegan las medidas, o si no se pueden leer, la prenda se dibuja como siempre** (por su largo) y, al llegar, cambia de tamaño con la transición que ya tiene la figura
   (principio 9: sin la medida, no se rompe nada). Un body metido (`metida`) no se ajusta.

## Medido con prendas reales de producción (`medirRecorte` y `cajaDeAbajoUnida` sobre los PNG reales, con la prenda de arriba a 62 cm)

| La falda con… | Borde de la blusa | Pretina | Largo de la falda |
|---|---|---|---|
| Polo con ojal | 80 px | 80 px | 36 cm |
| Camisa beige | 88 px | 88 px | 40 cm |
| Blusa bordada | 63 px | 76 px (acotada) | 34 cm |
| Blusa negra crop | 121 px | 103 px (acotada) | 47 cm |

Sin el margen (la pretina copiando el borde exacto), la misma falda salía de **28 a 54 cm** según la blusa elegida: una falda no cambia de largo al cambiar de blusa, y por eso se acotó.
El pantalón de pierna ancha da de 84 a 114 cm. En el navegador, el polo con ojal y la falda quedan con la unión coincidente.

## Descarté

- **Igualar la cintura de todas las prendas de arriba.** Mostrado con cuatro blusas reales: el polo ajustado salía altísimo, el crop diminuto y se perdía ver qué es oversize.
- **Que la pretina copie el borde exacto, sin margen.** El largo de la falda cambiaba de blusa en blusa (28 a 54 cm).
- **Guardar las medidas en la base** (una columna en `foto_recortes` y un cambio en `registrar_recorte`). Es esquema en producción y obliga a volver a medir los 338 recortes; medir en el
  navegador no necesita nada de eso. Si algún día pesa en el celular, se guarda.
- **Poner un largo por defecto a cada categoría.** Una falda midi o maxi saldría como mini.

## Pendiente y riesgos

- **La figura quieta** (Favoritos, la página de un look guardado, el enlace compartido) se dibuja en el servidor y sigue por largo: allí la unión todavía no coincide. Hacerla pide un
  componente de cliente o guardar las medidas.
- **Prendas de arriba que se llevan metidas o con volado:** un body queda sin ajustar; una blusa con peplum tiene el borde más ancho que la cintura y su falda sale al tope del margen.
  Con las mangas pegadas al torso el «tramo más ancho» las incluye y el borde sale ancho: el margen lo acota. Hace falta probarlo con más prendas.
- **Recortes viejos con gancho** (la camisa beige de producción lo tiene) se miden igual: el gancho no es un torso, pero no se limpian aquí.
- **El largo sigue siendo la puerta de entrada**: una prenda sin largo no entra al probador («Falta el largo»), aunque para las de abajo su valor ya no se use. Quitar esa exigencia es un
  cambio de la base y lo decide Felipe.
- **No probado** en Safari ni en un celular real; sí en el navegador de escritorio.
