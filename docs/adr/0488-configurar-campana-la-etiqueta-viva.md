# ADR-0488 — La hoja «Configuración» de una campaña: la etiqueta viva, a la derecha, como en «Prendas»

- **Fecha:** 2026-10-23 · **Estado:** aceptado (Felipe eligió la «II · La etiqueta» de la maqueta y aprobó la lista de 8 actividades el
  2026-10-23). Rama `claude/campaign-config-modal-mockups-f1b900`.
- **Relacionados:** ADR-0136 (movimiento, con la excepción de abajo), ADR-0358 (una función, una pieza), ADR-0284 (guía de foco), ADR-0389
  (guías), ADR-0481 (Catálogo ▸ Insignias y su sello de tinta), ADR-0486 (campañas por sede), ADR-0180 (reimprimir al guardar), ADR-0333
  (la prenda sin foto).
- **Maqueta:** `docs/maquetas/campana-configuracion-2026-10/` (tres direcciones y cuatro vueltas de la II, con su README).

## El problema

Felipe pidió (2026-10-23) «mejorar el modal de configurar campañas: elegante, sofisticado y con full animaciones». La hoja de antes
(`CampanaModal`) tenía los campos bien, pero no decía lo importante: «Aniversario CAYLA» regía hoy con 10 % y no llegaba a ninguna prenda
(una línea gris lo insinuaba), no mostraba a qué precio queda una prenda, y sus 31 categorías eran píldoras de anchos distintos que «se ven
todo muy desparramado».

## Lo que se decidió

1. **La hoja es la de «Prendas» con el formulario en vez de la lista** (`eqp-hoja`, `eqp-lado`, `eqp-pie`, la tarjeta `eqp-*`): a la izquierda
   el formulario, lo único que corre; a la derecha una superficie hueso con la etiqueta colgada y, debajo, el pie siempre a la vista. Las
   dos hojas de una campaña se ven igual. Ancho a medida de 1100 px (`max-w-[69rem]`, con su `unificar-fijo`), como «Prendas» (78rem).
2. **La etiqueta dice lo que se va a guardar mientras se llena** (`components/campana-hoja/EtiquetaDeCampana.tsx`): el descuento, las
   fechas y su estado (el chip del pase), a cuántas prendas a la venta llega, sus categorías en el mosaico (el ícono de cada una con su
   conteo) y «En caja»: prendas reales que alcanzaría con lo que **de verdad cobra la caja** (`descuentoDeCampana`, que baja el precio final
   al múltiplo de 10 céntimos: 79,90 con 10 % se cobra 71,90; la maqueta decía 71,91 y una prueba lo detectó).
3. **«Cancelar» y «Guardar» van en mitades** también en escritorio (`pie-acciones pie-parejo`): el pie vive en un panel angosto, y Felipe pidió
   los botones «alineados» y «más uniformes». Es una variante nombrada del pie del sistema, no un pie dibujado a mano.
4. **«Cuánto baja»** es `<PasoCantidad tamano="grande" sufijo="%">` (68 px, el número en la serif y − y + de 44 px; las dos opciones son nuevas en
   la pieza y opcionales) con los descuentos de siempre al lado, en dos filas del mismo alto (32 px cada opción; 44 px con el dedo). − y +
   van de 5 en 5 al múltiplo más cercano (`pasoDeDescuento`).
5. **«Cuándo rige»**: los dos `CampoFecha` pintan la temporada en su calendario (la opción nueva `rango`: la franja y un anillo en la otra
   punta). Debajo, la barra de temporada del pase de Insignias si rige hoy («17 oct · hoy, día 7 de 15 · 31 oct») y la duración en una frase
   («25 días, de jueves a domingo»). No la línea por meses de la maqueta: así la campaña se lee igual en su pase y en su hoja.
6. **«Categorías»** (no «Dónde rige», que desde ADR-0486 son las tiendas) es una grilla de `Casilla` por familia
   (`CategoriasDeCampana.tsx`): `TituloGrupo` con su total y una casilla de «toda la familia» (a medias si eliges algunas); cada categoría
   en una fila que se toca entera, con su conteo y su barra a escala (`BarraAvance` en tinta, tenue si no está elegida); las familias chicas
   comparten fila, las sin prendas van plegadas y un `Buscador` filtra sin tildes por la categoría o su familia (`categoriasDeLaHoja`).
7. **Al guardar, el sello de la campaña se estampa en la etiqueta** (`SelloTinta`, el de su pase) y la hoja se cierra cuando terminó (750 ms;
   sin movimiento, al instante). El aviso de después y su «Imprimir sus etiquetas» (ADR-0180) siguen igual.
8. **Nada de la base cambia.** Guarda por la misma ruta (`PATCH /api/productos/etiquetas`) con las mismas reglas; el cargador solo suma el
   prefijo y la familia de cada categoría para su ícono.

## Movimiento: la excepción de ADR-0136

Felipe pidió «full animaciones» y eligió la II mirándola. Lo que se mueve, todo **una vez**, con `--ease-cayla`, sin rebote ni bucle y
apagado con `prefers-reduced-motion`: el hilo de la etiqueta se dibuja, la etiqueta baja y se asienta, el descuento entra subiendo cada vez
que cambia, las casillas entran en cascada, cada pieza del mosaico aparece, la categoría vuela de su casilla a su pieza (el vuelo de
«Prendas») y el sello se estampa al guardar (el de Insignias). Lo vigila `lib/campana-hoja-movimiento.test.ts`. Los únicos bucles de la hoja
son los que ya eran señal: las rayas del círculo de un campo opcional (guía de foco) y el hilo de «Guardando…».

## Lo que se apartó de la maqueta, a propósito

- El título va arriba a todo lo ancho (como «Prendas»), no dentro de la columna del formulario.
- Las piezas del mosaico son categorías: llevan su ícono sobre el tono de su familia (una categoría no tiene color de prenda).
- Las fechas se escriben o se eligen en `CampoFecha` (el campo del ERP), no en un calendario nuevo.
- La línea de temporada es la barra del pase de Insignias (punto 5).

## Actualización 2026-10-23 — lo que dejaron `/chaos` y `/formidable` (con el OK de Felipe)

- **Una prenda es un modelo en un color** en la hoja, en su grilla de categorías y en la tarjeta de Tienda web (`PrendaConCosto.modelo`, la
  misma clave que `prendasDelSello` del pase): la hoja decía «23 prendas» (tallas) y el pase de la misma campaña «8». Y «Lo que ya tiene»
  del pase ya no suma dos veces: «8 prendas de Vestidos y Faldas» (antes «8 prendas + toda Vestidos, Faldas», y eran las mismas). La
  frase bajo el título del pase, que decía lo mismo, la quitó main el mismo día (sin cursivas en Insignias).
- **«Toda la familia» es toda:** también sus categorías sin prendas y las que no coinciden con lo buscado (`GrupoCategorias.todas`). Antes
  marcaba 13 de 18 en Indumentaria. La fila de su título se toca entera.
- **«Guardar» manda un solo pedido** (`unSoloEnvio`): tres clics en el mismo instante mandaban tres PATCH iguales.
- **La guía dice una sola cosa:** «· opcional» solo cuando la guía lo marca opcional, la ayuda de las fechas solo con las fechas vacías, y el
  porqué de lo que falta a la vista en el pie (`PieGuia conFrase`).
- Columnas de 13,5 rem (a 1024 px no se corta ningún nombre), sin la bajada que mandaba a «Prendas», y «Elegir / Quitar todas» como botón
  chico sutil (ADR-0358, marcan varias de un toque).

Queda, de Felipe: dos equipos con la misma hoja (gana el último, sin aviso: la función no tiene versión) y si una campaña puede ser del
100 %. Informe: `docs/formidable/catalogo-configurar-campana.md` y la fila de `docs/chaos/README.md`.
