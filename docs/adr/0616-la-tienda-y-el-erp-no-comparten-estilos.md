# ADR-0616: La tienda y el ERP no comparten estilos, y Multicolor es un color de verdad

**Fecha:** 2026-11-06. **Decide:** Felipe. **Contexto:** auditoría de la tienda después del rediseño (ADR-0615).

## El problema

La auditoría encontró líneas curvas (arcos) en las pestañas del catálogo y en «Nuestras tiendas». Felipe preguntó si la tienda comparte CSS con
el ERP, porque un cambio de diseño en uno no debe romper al otro.

**No lo comparten, y no fue esa la causa.** La tienda carga solo `apps/tienda/app/globals.css` y `apps/tienda/app/estilos/`; el ERP, solo los suyos.
El único archivo en común es `campana-efectos.css`, que es una copia en cada app con una prueba de que son idénticas. El arco nació dentro de la tienda: el
rediseño redondeó por lista de clases (`diseno-nuevo.css`) piezas cuya única línea es un borde de un lado, y un borde de un lado se curva en las puntas.

La separación era solo una costumbre, sin nada que la vigilara: por eso la pregunta no tenía una respuesta que se pudiera comprobar.

## Decisión

1. **La tienda y el ERP no comparten estilos, y una prueba lo hace cumplir** (`apps/tienda/lib/css-de-la-tienda.test.ts`): ninguna importa archivos de la
   otra, ninguna usa las variables de la otra (`--color-*` son del ERP, `--dn-*` de la tienda) y ninguna hoja de estilos sale de un paquete compartido. Lo común
   es lógica (`packages/shared`), nunca aspecto.
2. **Una pieza con una sola línea no lleva esquinas redondas.** La misma prueba cruza lo que `diseno-nuevo.css` redondea con lo que cada hoja dibuja con un
   borde de un lado. Encontró seis piezas más que nadie había visto (`.t-pag`, `.fp-qt`, `.fp-cierra`, `.pb-fila`, `.ay-tiendas-vacio`, `.t-pildora-mini`).
3. **`hidden` esconde siempre** (`[hidden] { display: none !important }` en la identidad de la tienda): una rejilla propia le ganaba y las ofertas salían repetidas.
4. **Multicolor es un color de verdad.** En este repo un color sin `hex` ya significaba «de varios colores» (`MuestraColor`, la rueda). La fila con prendas (MIU,
   escrita «MIULTICOLOR», verde fosforescente, en la familia Verde porque el formulario exige un tono) pasa a llamarse Multicolor, sin hex ni familia
   (`20261106145000`). Toda muestra del ERP se pinta con `fondoDeColor`, editarlo no ofrece tono ni familia, y la tienda lo dibuja en rueda y le da su propio filtro.

## Descarté

- **Un paquete de estilos compartido:** es justo lo que hace que un cambio de un lado rompa el otro. Felipe ya decidió que la tienda tiene identidad propia.
- **Pasar las prendas de MIU a MUL:** `color_codigo` va en el código impreso de cada prenda y tiene historia (ADR-0258). Se corrige la fila, no las prendas.
- **Una familia nueva o una columna `es_multicolor`:** una familia toca a cada motor que lista las 10; la columna repetiría lo que `hex is null` ya dice.

## Qué se rompería sin esto

Un rediseño vuelve a redondear una lista de clases y nadie ve los arcos hasta que un cliente los ve. O alguien importa una hoja del ERP en la tienda «para
reutilizar», y el próximo cambio del vidrio del ERP desarma la tienda.
