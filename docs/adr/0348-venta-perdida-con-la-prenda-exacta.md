# ADR-0348 — Venta perdida con la prenda exacta: lo que se pidió y no había cuenta como demanda

- Fecha: 2026-10-05
- Estado: aceptado. Felipe decidió el 2026-10-05 guardar la prenda exacta y avisarle a Dany antes de pegar en producción.
- Toca el Club, que planificó Dany (acta D-92 a D-111). **Ver «Para Dany» abajo.**
- Migración `20261005212000_venta_perdida_con_prenda.sql`. **No está en producción.**

## Problema

Cuando un cliente pide una talla que no hay, Vender y Cambios lo anotan en `pedidos_no_atendidos` (ADR-0152, ADR-0288 D-6). Pero
la pantalla manda solo un texto («Blusa Carlita · Blanco») y la talla escrita. La función ya aceptaba el producto y nadie se lo
pasaba, y el color no se guardaba en ningún lado.

El motor de demanda (ADR-0347) no puede sumar ese pedido a su grupo (categoría × talla × familia de color). Así, una prenda que se
agota «deja de venderse» para el sistema justo cuando más se pide: es la profecía que se cumple sola de la investigación.

## Decisión

1. **La columna nueva `pedidos_no_atendidos.variante_id`** es opcional, con FK a `variantes`, e identifica prenda, talla y color.
   Lo anotado antes, o con texto libre, sigue en NULL.
2. **`registrar_pedido_no_atendido` gana `p_variante_id`**, último y opcional. Con variante:
   - la variante tiene que existir;
   - el producto sale de ella, y si además viene `p_producto_id`, tiene que ser el mismo;
   - la talla escrita, si no vino, también sale de ella.

   Sin variante, la función hace exactamente lo de antes. La firma de 7 parámetros se suelta y se crea la de 8, porque otra firma
   con `create or replace` crearía una sobrecarga.
3. **Vender (`AnotarNoHabia`, desde la ventana de la prenda) y Cambios (`CambioSalidas`) mandan la variante de la talla que se
   pidió.** En pantalla no cambia nada: es el mismo botón con las mismas tallas.
4. **El motor la cuenta:** `fn_demanda_sede` suma en su grupo cada «buscó y no había» que tiene prenda (`perdidas`), igual que una
   venta. «Se la probó y no la llevó» no cuenta: la prenda sí estaba y no convenció. El texto libre tampoco, porque no se puede
   ubicar en un grupo.

## Para Dany (Club, D-104 «Llegó tu talla»)

- **Lo que el Club ya lee no cambia:** `producto_id`, `descripcion_libre`, `talla`, `clienta_id`, `motivo` y `razon` se llenan
  igual. Desde ahora `producto_id` llega lleno cuando se anota desde Vender o Cambios; antes llegaba vacío.
- **Hay un dato nuevo:** `variante_id`. Con él, «Llegó tu talla» puede saber exactamente qué prenda llegó (producto, talla y
  color) sin interpretar el texto.
- **La prueba del Club `scripts/pruebas/club_se_probo.mjs` se ajustó:** tres casos miraban que la función viva fuera la de 7
  parámetros y ahora miran la de 8. Los casos que vuelven a pegar la migración del Club siguen mirando la suya. Pasa 22 de 22.
- Si algo de esto choca con el plan del Club, se conversa antes de pegar en producción: la migración no está pegada.

## Alternativas descartadas

- **Guardar solo el color.** La variante ya es la combinación de producto, talla y color, y es la llave que usa todo el
  inventario. Tres columnas sueltas podrían contradecirse; la variante no.
- **Interpretar el texto que ya se guarda.** Es frágil: los nombres se renombran y el color va escrito a mano.

## Cómo se pega en producción

Una sola parte: un `alter table` que agrega una columna opcional (no reescribe la tabla), un índice, `drop function` y
`create function`. No lleva políticas ni `drop trigger` (ADR-0195). Se pega **antes** de publicar la web nueva. La web vieja sigue
funcionando con la función nueva porque el parámetro nuevo es opcional. La guarda aborta si la función viva no es
`1254793ac2956a751a7345ebf2f825d1`, que es el md5 medido en producción y en local el 2026-10-05. Va antes de
`20261005215000_motor_demanda_lectura.sql`, que lee la columna nueva.

## Cómo se verificó

- `pnpm pruebas:motor-demanda-lectura`, casos L1 y L2:
  - con variante, la función llena el producto y la talla, y rechaza una variante de otro modelo o inexistente;
  - sin variante, hace lo de siempre;
  - «buscó y no había» con prenda suma 2 en su grupo, y no cuentan «se la probó», el texto libre ni lo anotado hoy.
- `pnpm pruebas:pedidos-no-atendidos`: 20 de 20. `pnpm pruebas:club-se-probo`: 22 de 22.
- vitest: `se-probo-reglas` (la variante viaja, y una vacía no) y `demanda-reglas` (lo perdido suma a la demanda del grupo).
- A 375 px, la ventana de la prenda en Vender muestra «Anotar que no había» con sus tallas igual que antes. No se anotó nada
  desde el navegador, para no escribir en la base local que comparten varias sesiones.
