# ADR-0649 — Recibir mercadería: lo que Felipe anotó al recibir un envío grande

- **Fecha:** 2026-11-12 · **Estado:** construido en la rama `claude/mis-envios-faltaron-reales`. Sin migración propia: lo único de base de la rama es
  `20261112154000` («faltaron» de Mis envíos, en la bitácora del día), que **no está en producción** y espera el OK de Felipe.
- **Nace de:** Felipe recibió él mismo ENV-001660 (119 prendas, 13 modelos, 4 proveedores, un fardo para Trujillo) y fue anotando 11 notas. Aprobó la lista
  de 13 actividades «en ese orden», eligió «mezclas ocultas de las listas» y «la carta en todo el ERP», y acomodó el contador en una mesa para arrastrar
  piezas (`docs/maquetas/recibir-contador-mesa-2026-11/`).
- **Relacionados:** ADR-0185 (la página no se encoge), ADR-0312 (la carta de colores), ADR-0643 (los colores combinados), ADR-0645 (Contar en dos mitades),
  ADR-0611 (el botón que confirma no se apaga), ADR-0136 (movimiento).

## Decisiones

DECIDÍ, una por nota de Felipe, sin cambiar ninguna regla de negocio ni de la base:

1. **Las hojas de Recibir salen al centro** (`components/ui/HojasAlCentro.tsx`): el `<Modal>` mide la hoja al abrir y se recentra durante 600 ms mientras
   carga su contenido. Solo en `app/(app)/recibir/layout.tsx` por ahora; las demás pantallas lo piden cuando se toquen.
2. **Etiquetas y «Bajar al piso» vuelven al envío** (`?envio=`): la flecha de Etiquetas llevaba a Existencias, fuera de lo que se contaba.
3. **«Llevar al stock»:** costo y precio a la par y del mismo tamaño; la lista de lo que sale lleva el punto de su color, ordenada por color y talla.
4. **La tabla de tallas y colores:** el Tab salta de casilla en casilla (las ✕ y los «—» fuera del Tab), cada casilla con − y + (`PasoCantidad`), el total
   por talla al pie, el 0 de ejemplo centrado (en todo el ERP: `justify-items: stretch` en la pieza) y **«Llenar todas con»** arriba, como en Nuevo
   producto: se aplica en cada tecla y, vacía o con algo que no es una cantidad, las casillas vuelven a como estaban (`llenarTodasLasTallas`).
5. **La carta de colores, una fila por familia, de lo más claro a lo más oscuro** (cambia ADR-0312: ya no hay gamas). Con el nombre del color abajo, fijo
   dentro de la hoja, con su muestra de 40 px. En todo el ERP.
6. **Los colores combinados se arman en la misma carta** (cambia ADR-0643): un círculo grande con la mezcla y sus acompañantes, sin abrir otra hoja; las
   mezclas ya guardadas **no salen en las listas** (son de una sola prenda; se arman de nuevo mirándola).
7. **El contador:** paso 1 y paso 2 lado a lado, con una línea al medio; junto al dial, uno bajo el otro, «Llegaron las N», +5/+10 y «Poner en cero» o «No
   llegó nada»; «¿Pasó algo con esta prenda?» queda a la vista sin bajar. El paso 1 ya no se pliega. Bajo 600 px de placa, un paso bajo el otro.
8. **La cabecera del modelo:** la foto se toca y abre «Lo que anotó Compras» (descripción, costo, venta sugerida, proveedor, marca, cuántas, orden), con
   costo y venta sugerida a la vista.
9. **Sin «Anterior» ni «Siguiente» en Contar** (cambia ADR-0645): las colaboradoras se mueven con la lista. Al pie, «Falta contar: <modelo>» y el único
   «Revisar y cerrar».
10. **La hoja del envío antes de recibir:** agrupada por proveedor, con el total grande y «Empezar a recibir» siempre a la vista.
11. **«Revisa y cierra» rediseñada:** arriba las cifras (entran al stock, para después, faltan, sobran, costo); «Lo que te toca decidir» solo con lo que pide
    algo (lo que falta contar en una lista corta con «Contarla»; lo que no cuadró pregunta «¿Qué pasó?» en la misma fila); «Lo que cuadra» plegado en una
    tabla corta; «Antes de cerrar» en una tarjeta; y el pie dice en palabras qué falta (`textoDeLoQueFalta`, de los mismos campos de la guía). Con algo
    pendiente, «Cerrar el envío» no es negro, pero sigue tocable (ADR-0611).
12. **Un botón que cambia de `type="button"` a `type="submit"` en el mismo lugar lleva una `key` por rama** (`lib/botones-que-cambian-de-tipo.test.ts`): React
    reusaba el nodo y el clic que lo cambiaba enviaba el formulario. Así se saltaba el paso del precio al crear una prenda al recibir.
13. **El contador que rueda mide píxeles enteros** (`round()`): a 15 px el 6 caía en medio píxel y el 0 no, y «60 de 119» se veía desfasado.

DESCARTÉ: dejar el contador con los botones en una fila y el paso 2 debajo (lo que había hecho en la actividad 8): Felipe mostró en la mesa que no lo
entendí. Un `select` de «aplicar a todas» con botón «Aplicar»: Nuevo producto ya lo resolvió sin botón, y la colaboradora conoce esa caja.

SE ROMPE SI: una pantalla nueva de Recibir abre una hoja fuera de `HojasAlCentro` (sale arriba); un navegador sin `round()` en CSS (vuelve a 1.15em, como
antes); una placa de menos de ~620 px con tallas largas (el paso 2 se aprieta: el botón de la tarjeta se parte en dos renglones).

## Lo que cambia en Dynamic

Se tocaron piezas que Dynamic mira (`docs/familia/compartidos.json` de Dynamic): `components/ui/Modal.tsx`, `components/ui/HojasAlCentro.tsx` (nueva) y
`app/estilos/vidrio/recibir-mesa.css`. **Queda como tarea allá**: el `<Modal>` acepta un contexto que lo recentra; sin él, se ve igual que antes.
`recetas.css` no cambió.
