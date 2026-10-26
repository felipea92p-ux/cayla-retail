## 2026-10-26 (Proveedores: tres maquetas para elegir mirando — ADR-0502)
Qué hice:
- **Tres direcciones tocables** en `docs/maquetas/proveedores-2026-10/` (lista y ficha, claro y oscuro): **A · Tres montones** (la lista repartida en vuelve a comprarle / mira antes / frena; la ficha con la respuesta y «¿Se vende? ¿Te deja plata? ¿Cumple?»), **B · El reloj del ritmo** (todo en semanas para vender lo que queda: un mapa de proveedores y la curva «si sigue así» con fecha) y **C · El flujo** (el río de la mercadería de cada proveedor a vendido, en estantes o rotando lento; el perchero de tallas y el hilo del pago).
- Las reglas de `proveedor-ritmo-reglas.ts` y `proveedor-prendas-reglas.ts` copiadas con sus umbrales; los casos reales del ADR-0502 (Lasak 99 semanas, Anqori 22, Deyner 3, Jacard S/ 825 parados) salen igual. Un lugar marcado «Dato nuevo» para las tallas y las sedes que construye otra sesión.
- Revisadas en el navegador a 1440 y 1920 px, claro y oscuro, y a 375 px sin desborde. Lo que gana y paga cada una, en el README de la carpeta.
Por qué así: Felipe dijo que hoy no se entiende lo que muestra Proveedores; las tres responden «¿a quién le vuelvo a comprar?» en 5 segundos con los mismos datos, para que elija mirando.
Estado: solo maquetas, sin código del ERP ni migraciones y sin PR. Falta que Felipe elija; después, `/construir`.

## 2026-10-26 (Proveedores v2: tamaño = cuánto le compras, color = cómo se vende)
Qué hice:
- Felipe descartó la primera ronda: «no puedo identificar a simple vista a quién le compro más… tengo que leer letras pequeñas… usa los colores a tu favor». Nueva carpeta `docs/maquetas/proveedores-v2-2026-10/` con dos reglas para todo: **el tamaño es cuánto le compras** (prendas o soles) y **el color es el ritmo** (verde repón ≤ 6 semanas, pizarra a su ritmo, ámbar frena ≥ 16), el mismo en proveedores, tallas, sedes y prendas.
- Tres formas del tamaño: **A · Mosaico** (área), **B · Barras** (largo, de mayor a menor) y **C · Prendas** (cada polo = 10 prendas, lleno si se vendió); la leyenda de colores también filtra. Ficha común con la franja del color y la respuesta en letra grande, cifras de 40 px y tallas y sedes pintadas por su propio ritmo.
- Revisadas a 1440 px en claro y oscuro y a 375 px sin desborde. La primera ronda queda marcada como descartada en su README.
Por qué así: lo que Felipe necesita leer sin esfuerzo es «a quién le compro más» (tamaño) y «se vende o no» (color); lo demás va en etiquetas legibles junto al nombre.
Estado: solo maquetas, sin PR. Falta que Felipe elija una de las tres.

## 2026-10-26 (Proveedores v3: investigar primero, ranking + lo que no se ve)
Qué hice:
- Felipe descartó la v2 (espacio muerto, colores mal usados, «el mosaico es un error tremendo con muchos proveedores») y pidió investigar antes. `docs/maquetas/proveedores-v3-2026-10/INVESTIGACION.md`: con muchos registros el largo se lee mejor que el área (Cleveland y McGill, Heer y Bostock, «Raising the Bars»); una sola barra por fila; color solo para la excepción y siempre con forma y palabra; a la derecha una cola de excepciones por urgencia; las medidas de retail son vendido y semanas de stock (las que ya calcula `proveedor-ritmo-reglas.ts`).
- Tres maquetas con 52 proveedores (los 11 reales del ADR-0502 y 41 inventados con semilla): ranking ordenado por **prendas compradas o dinero gastado**, filtros con su cuenta, buscador y «Ver los que faltan»; a la derecha, fija, «Lo que no se ve a simple vista» (Para hoy · Antes de volver a comprar · Oportunidades). **A · Tabla** (filas que se abren), **B · Concentración** (curva acumulada arriba y el detalle en la columna derecha) y **C · Compraste y vendiste** (dos puntos por fila; el tramo es lo que queda).
- Revisadas a 1440 y 1920 px, claro y oscuro, y a 375 px sin desborde. La v2 queda marcada como descartada.
Por qué así: lo pidió Felipe y lo respalda la investigación; la ficha se rediseña después de elegir la lista.
Estado: solo maquetas, sin PR.

## 2026-10-26 (Proveedores v4: innovadoras y visuales)
Qué hice:
- Felipe descartó la v3 («elabora 3 más que sean innovadoras y visuales»). Nueva carpeta `docs/maquetas/proveedores-v4-2026-10/` con tres formas de mirar a los 52 proveedores, conservando lo pedido antes (prendas/dinero, color solo con significado y forma, sin espacio muerto, a la derecha lo que no se ve): **A · Mapa de decisiones** (cuánto le compras contra qué tan rápido se vende, en cuatro zonas: repón, prueba comprarles más, frena, no insistas), **B · Sol de proveedores** (el ranking en círculo, un rayo por proveedor del mayor al menor) y **C · Mapa de calor** (el ranking con las semanas de cada talla y cada sede en celdas del verde al ámbar, más la fila de toda la tienda).
- Al cambiar prendas/dinero, los puntos, los rayos y las filas se deslizan a su lugar nuevo; al tocar un proveedor, su detalle (con tallas y sedes en celdas de color) reemplaza la columna derecha.
- Revisadas a 1440 y 1920 px, claro y oscuro, y a 375 px sin desborde. La v3 queda marcada como descartada.
Estado: solo maquetas, sin PR. Falta que Felipe elija.

## 2026-10-26 (Proveedores v5: ranking visual e interactivo, sin extravagancia)
Qué hice:
- Felipe descartó la v4 («que sea un ranking más visual e interactivo pero sin ser demasiado extravagante»). Nueva carpeta `docs/maquetas/proveedores-v5-2026-10/` con tres rankings: **A · Podio y lista** (los 3 primeros en tarjetas grandes y el resto en filas con su barra), **B · Carriles** (barra grande que dice adentro lo vendido y lo que queda; el carril se abre ahí mismo con tallas, sedes y plata) y **C · Filas con su venta** (línea de ventas por día, anillo de vendido y comparar hasta 3 a la derecha).
- En las tres, al cambiar entre prendas y dinero la lista se reacomoda deslizándose y cada proveedor dice cuántos puestos subió o bajó; el color sigue solo en la píldora del ritmo, y a la derecha va lo que no se ve a simple vista.
- Revisadas a 1440 px en claro y oscuro y a 375 px sin desborde. La v4 queda marcada como descartada.
Estado: solo maquetas, sin PR. Falta que Felipe elija.

## 2026-10-26 (Proveedores: Felipe elige la C de la v5 y se ajusta la medida)
Qué hice:
- Felipe eligió **C · Filas con su venta** y pidió, antes de implementar, que «prendas compradas y dinero gastado» tengan su ícono y se muestren mejor. Ahora son dos tarjetas de opción (polo y billete, el total de todos los proveedores y qué quiere decir; la elegida con borde de tinta y su visto), y el mismo ícono acompaña cada cifra del ranking y de la comparación. La maqueta abre en la C.
- Revisada a 1440 y 1920 px, en claro y oscuro, y a 375 px sin desborde.
Estado: maqueta lista para construir con `/construir`; sin código del ERP ni PR todavía.
