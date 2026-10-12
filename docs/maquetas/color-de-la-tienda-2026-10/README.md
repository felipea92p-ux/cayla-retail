# Maqueta · Plan del piso ▸ «Color de la tienda» (2026-10-12)

Nada de esto está en el ERP. **Datos inventados** con la forma de TRU (el repo es público: no se suben ventas reales por color). Abrir `color-de-la-tienda.html`;
la barra negra cambia **Caso**, **Piso**, **Aviso de colores**, **Tema** y **Vista** (escritorio 1440, laptop 1024, celular 375).

## Lo que Felipe decidió el 2026-10-12 (lo que la maqueta dibuja)
1. **Franja fija bajo «Hoy» + detalle al pasar el mouse por un tramo del riel** (también con teclado y con toque: nada vive solo en el hover).
2. **Las 6 familias más relevantes y el resto en «Otras»**, que se abre. «Más relevante» = el mayor entre lo que cuelga y lo que vende (así Amarillo no queda escondido).
3. **Una marca por familia solo con evidencia** («Le falta lugar» / «Cuelga de más»); sin marca si está equilibrada o hay pocas ventas.
4. **El color exacto vive dentro del desglose de la familia** (cuelgan N · vendió M en 14 días), con «Se vende y falta» y «Cuelga y no sale» arriba.
5. **Por color, solo ventas confirmadas** (la nota lo dice); **por familia, confirmadas + sin registrar** (lo que ya usa «Tus ventas»).

## La regla de evidencia (se vuelve lib pura con prueba en la actividad 2)
Esperado = ventas totales × la parte que cuelga. Marca solo si la diferencia es mayor que lo que el azar explica (residuo de Poisson |z| ≥ 2, con la varianza en 2 como mínimo),
de al menos 3 prendas, y con 30 ventas o más en total. Relativa, sin cortes fijos: se compara con lo que la propia tienda vende (misma lógica que Frescura).

## Qué enseñan los dos casos
- **TRU** (273 confirmadas): solo Amarillo sale marcada. Tierra se ve equilibrada, pero su desglose deja a Arena en «Cuelga y no sale» y a Chocolate y Topo en «Se vende y falta».
- **AQP** (3 confirmadas de 170): las marcas por familia siguen (usan las sin registrar) y por color la pantalla dice que todavía no se puede ver.

## Para decidir mirando (ninguna está resuelta)
- **Neutro en oscuro:** el tramo se pinta con el color que más cuelga, Negro, y sobre el papel oscuro se lee casi como un hueco con contorno. ¿Neutro en un gris medio?
- **«N colores a mirar»** bajo cada familia (opción «Aviso de colores»): ¿lo dejamos? Sin él, Arena solo se descubre abriendo Tierra.
- **La tarjeta del grupo** sale encima del riel y tapa un poco el título; ¿arriba o debajo?
- **«Otras»** muestra cada familia con todos sus colores; ¿o solo las familias, y los colores al abrir una?

## Cómo se verificó (y qué no)
En el navegador: cifras de TRU contra lo medido en producción (367 colgadas, 273 confirmadas), detalle del grupo, desglose de Tierra y de «Otras», cerrar con Escape, caso AQP, Cuadrado y sin aviso, claro y oscuro, 375 px sin desborde horizontal.
**No se probó** con una colaboradora ni con el diseño en el ERP real (es HTML suelto).
