# Proveedores · tres direcciones (2026-10-26)

Lo pidió Felipe: Compras ▸ Proveedores ya calcula lo comprado, lo vendido, el ritmo, la deuda y las entregas de cada proveedor
(ADR-0502), pero **hoy no se entiende lo que muestra**. Estas son tres maquetas tocables para elegir mirando. Todas responden la misma
pregunta en 5 segundos —**¿a quién le vuelvo a comprar?**— con los mismos datos y las mismas reglas; cambia cómo se ve la respuesta.
No se tocó código de la app ni migraciones.

## Cómo verlas

`index.html` (con un servidor, por ejemplo la configuración `maqueta-referentes` de `.claude/launch.json`:
`http://localhost:3031/proveedores-2026-10/`). La barra de arriba es de la maqueta: dirección **A · B · C**, **Lista / Ficha**, el proveedor de
la ficha (Deyner, Jacard, Anqori, Lasak; los demás se abren tocándolos en la lista) y el tema claro u oscuro. La dirección y la vista viven
en la URL (`#b/ficha/lasak`).

## Qué cuentan

- **Lo comprado contra lo vendido y lo que queda**, en unidades.
- **El ritmo**: las semanas que tardaría en venderse lo que queda (`proveedor-ritmo-reglas.ts`): lento desde 16, se agota hasta 6, no se
  juzga con menos de 20 compradas ni 21 días en la tienda.
- **El veredicto de una palabra** (`veredictoDe`): Rinde, Rota lento, Pocas ventas, Costo por confirmar, Margen bajo.
- **La respuesta**: vuelve a comprarle (se agota, con costo real y margen igual o mayor al promedio), se agota pronto (margen por confirmar:
  no recomienda gastar), mira antes (costo, margen o prendas paradas) y frena (ritmo lento). Es la misma unión que hacen los avisos de
  `proveedor-analisis-reglas.ts`.
- **Los dos orígenes**: Compras (costo exacto) y carga inicial (estimado). Con la carga como mayoría, el dinero dice «por confirmar».
- **La plata**: deuda, vencido, plazo real contra el pactado, entregas atrasadas, «Nos debe» y saldo a favor. El Taller (CAYLA SAC), aparte.
- **Los dos datos nuevos** que construye otra sesión: las **tallas** por proveedor y **en qué sede rinde**. Llevan la marca «Dato nuevo · en
  construcción» y sus números son inventados.

Los datos de ejemplo (`datos.js`) usan los casos reales del ADR-0502 (Lasak 183/6/99 semanas, Textil Anqori 138/19/22, Deyner 406/193/3,
Jacard S/ 825 parados en 4 prendas, y Wayi, Alex William Sevilla y Marisol Bellido con 19, 22 y 17 semanas). Hoy el 0 % de lo comprado
tiene costo real; en la maqueta, Deyner, Jacard e Hilos del Sur ya llegaron por Compras, para que se vea cómo cambia la pantalla cuando el
dinero deja de estar «por confirmar». Si una suma no cuadra, la consola lo avisa.

Las reglas están copiadas en `comun.js` con los mismos umbrales; si la maqueta se aparta de `apps/web/lib`, manda `apps/web/lib`.

## Las tres direcciones

### A · Tres montones (la respuesta primero)

La lista ya viene repartida en tres columnas: **Vuelve a comprarle · Mira antes de pedirle · Frena**. Cada proveedor es una tarjeta con
su frase («Lo que le queda se acaba en unas 3 semanas, y deja 48 % de margen»), las semanas en grande, la barra vendido/queda, dónde
rinde, la talla que se acaba primero y sus banderas (vencido, entregas atrasadas, te debe). La ficha abre con la respuesta en una frase
(«Sí, vuelve a comprarle.» / «Frena. No le pidas más por ahora.») y las tres preguntas que la sostienen: **¿Se vende? ¿Te deja plata?
¿Cumple?**, cada una con su marca.

- **Gana:** es la que responde más rápido y la que menos hay que aprender; no hay un gráfico que leer, solo leer la columna. La ficha
  explica el porqué en el idioma de la tienda.
- **Paga:** esconde la comparación entre proveedores (no se ve que Lasak es cuatro veces más lento que Anqori: están juntos en «Frena»), y
  con muchos proveedores la columna se hace larga. Es la más cercana a lo que ya existe, la menos «gráfica».

### B · El reloj del ritmo (una sola medida)

Todo se mide en **semanas para vender lo que queda**. La lista abre con un mapa: una regla de 1 a 100+ semanas, con la zona verde
«Se acaba pronto · repón» hasta 6 y la ámbar «Rota lento · frena» desde 16. Cada proveedor es un círculo en su lugar (más grande, más
le compraste; lleno si tiene costo real, punteado si está por confirmar), y los círculos corren a su lugar al llegar. Debajo, la tabla del
que se acaba antes al que más tarda, cada fila con su reglita; pasar el mouse por un círculo enciende su fila. La ficha es la curva
**«Si sigue así»**: las prendas en estantes hasta hoy y la proyección punteada hasta que se acaban, con la frase «Lo que le queda se acaba el
17 de noviembre» o «dura hasta septiembre de 2028». Las tallas y las sedes también van en semanas, cada una con su reloj.

- **Gana:** una sola unidad para todo, la misma que ya decide el veredicto y los avisos; se ve de un golpe la distancia entre proveedores
  (Deyner a 3, Lasak a 99) y la ficha convierte el ritmo en una fecha, que se entiende sin saber qué es un ritmo.
- **Paga:** pide aprender a leer el mapa (escala que estira lo corto) y el dinero queda en segundo plano. En el teléfono el mapa se desliza
  de lado; la tabla de abajo lo reemplaza. Una proyección lineal puede leerse como promesa: la nota lo aclara.

### C · El flujo (adónde fue cada prenda)

La lista abre con **el río de tu mercadería**: de cada proveedor (a la izquierda, con el color de lo que harías con él) salen cintas
hacia «Vendiste», «En estantes, a su ritmo», «En estantes, rotando lento» y «Otras salidas». Las cintas corren de izquierda a derecha
una sola vez; pasar el mouse por un proveedor enciende las suyas. Debajo, una cinta por proveedor cuyo largo es lo que le compraste. La
ficha es el río de ese proveedor en tres tramos: **de dónde vino** (Compras o carga inicial) → **qué prenda era** → **adónde fue**; el
**perchero de tallas** (lo vendido en tinta, lo que sigue colgado en arena), las sedes con su color y **el hilo del pago** (factura → pactado →
cuándo le pagas).

- **Gana:** es la más gráfica y la que mejor cuenta los dos orígenes (la cinta pizarra de Compras crece sola cuando Compras entre en uso).
  Se ve dónde está parada la mercadería: el 37 % de lo comprado se está quedando en cinco proveedores.
- **Paga:** es la más lenta para «¿a quién le compro?»: la respuesta está en el color y en la frase, no en la forma. El río con once
  proveedores ya está lleno; con cincuenta habría que agruparlos. Es la más cara de construir (un gráfico propio del módulo, como El telar
  de Finanzas) y en el teléfono se desliza de lado.

## Lo común a las tres

- **Piezas:** `EncabezadoPagina`, `PasoSugerido`, `TarjetaCifra`, `Chip`, `BarraApilada`, `BarraAvance`, `Tabla`, `TituloSeccion` con su
  globito, `nota-cayla`, el aviso con su «¿Por qué?» que se abre con un toque. Los gráficos propios (el mapa del reloj, la curva, el río,
  el perchero, el hilo) no reemplazan ninguna pieza decidida.
- **Colores:** solo los tokens de `globals.css` y su oscuro de `tema.css`, incluidos los colores de sede (`--color-sede-*`) para el dato de sede.
- **Movimiento** (ADR-0136): todo entra una sola vez al verse, sin rebote ni bucle, con `--ease-cayla`; las cifras cuentan, las barras crecen,
  las líneas se dibujan. Nada late. Todo se apaga con `prefers-reduced-motion`.
- **Revisadas** en el navegador a 1440 y 1920 px, en claro y oscuro, y a 375 px sin desborde horizontal de la página.

## Lo que queda para después de elegir

- Llevar la dirección elegida al ERP con `/construir`, sobre las funciones que ya existen (`fn_proveedores_rendimiento`,
  `fn_proveedor_prendas`) más las de tallas y sedes de la otra sesión.
- Pasar por `/focus`, `/sugerir`, `/formidable`, `/guia` y `/unificar` como manda `CLAUDE.md`. Un gráfico propio nuevo (el mapa, el río) pide
  su actualización del ADR-0136 y que Felipe lo elija mirando.
