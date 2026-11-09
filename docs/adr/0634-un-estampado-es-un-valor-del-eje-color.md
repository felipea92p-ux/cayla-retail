# ADR-0634 — Un estampado es un valor del eje color

**Fecha:** 2026-11-09
**Estado:** En construcción (rama `claude/product-color-variants-restock-108f1a`).
**Reabre:** ADR-0106, que dejó el estampado solo en Patrones.
**Afecta:** `retail.colores.tipo` (ya existía, sin uso), `POST /api/productos/colores`, `NuevoColorAlta.tsx`, `lib/color-estampado-reglas.ts`.

## El problema

La misma prenda vuelve en re-stock con varios estampados: mismo proveedor, marca, precio y costo. Una prenda vendible es modelo × talla × color
(`variantes_producto_talla_color_unico`) y el patrón se guarda en el modelo entero (ADR-0095). Tres estampados distintos caen entonces en «Multicolor»
y se mezclan en una sola fila de stock, o dos cosas diferentes se llaman «Azul». Quien recibe o vende no sabe cuál es cuál.

## Decisión (Felipe, 2026-11-09)

**DECIDÍ:** cada estampado es un color con nombre propio dentro del mismo modelo («Floral azul petróleo», «Rayas negro-blanco»), marcado con
`colores.tipo = 'estampado'`. Se arma eligiendo el patrón y el color que más se ve:

- El **nombre** se propone con los dos y se puede escribir a mano.
- El **tono y la familia** son los del color dominante, y por eso Análisis, Frescura y el plan del piso lo cuentan en esa familia sin saber que es un estampado.
- El **patrón no se guarda en el color**: solo ayuda a nombrarlo. Si los patrones no se pueden leer, el nombre se escribe a mano.
- «Liso» no se ofrece como patrón y «Multicolor» no se ofrece como color dominante: no dice qué color manda.
- Un estampado no compara su tono con los demás, porque siempre se parecería a su color dominante.

Variantes, stock, movimientos y ventas no cambian: para ellos sigue siendo un color.

**DESCARTÉ:**
- **Un modelo por estampado.** Ganas: ya se puede y el patrón queda en cada producto. Pagas: Vender muestra una tarjeta por estampado, Análisis parte las ventas de una sola prenda y precio y costo se mantienen por separado.
- **Un tercer eje (talla × color × estampado).** Ganas: el modelo de datos más literal. Pagas: tocar el núcleo de stock y ventas, con unas 3.500 variantes ya creadas, y romper «nunca 3+ ejes» de ADR-0095.
- **Crear estampados sin marcarlos.** Ganas: nada que construir. Pagas: las pantallas no pueden saber que ese color se reconoce por su foto y no por un punto liso.

**SE ROMPE SI:** dos estampados de la misma prenda se proponen con el mismo nombre. No es un candado nuevo: el nombre ya es único y `ExisteTambien` lo dice, así que la persona escribe uno distinto («Floral azul grande»).

## Relación con ADR-0106

ADR-0106 sacó `tipo` de las pantallas porque nadie lo usaba y había dos lugares para decir «floral». Sigue vigente para el **modelo**: el patrón del producto vive en Patrones.
Lo que cambia es que un modelo con **varios** estampados necesita distinguirlos dentro de sí mismo, y eso solo puede hacerse en el eje que separa el stock.
