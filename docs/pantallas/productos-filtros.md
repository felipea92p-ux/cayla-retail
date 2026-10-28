# Pantalla — Productos ▸ barra de filtros (`/productos`, Grilla y Tabla)

> Modo: completo · Fecha: 2026-10-02 · Rol/sede: líder, Tienda Lima (captura de Felipe) · Datos: **real**: consultas de solo lectura a producción hechas por un agente de la sesión el 2026-10-02 (las listó en el informe: `select` y `explain analyze` sobre funciones `STABLE`; Felipe no las corrió)
> SHA analizado: `a25ebdf8` (origin/main). Si cambian `components/FiltrosProductos.tsx`, `components/ui/FiltrosPildora.tsx`, `lib/catalogo-v2.ts`, `lib/productos-orden.ts`, `productos/page.tsx` o `fn_productos*` (`20260929020000` y sus parches `20260929180000`, `20260930020000`), este análisis está vencido.
> Archivos: `apps/web/app/(app)/productos/page.tsx` · `components/FiltrosProductos.tsx` · `components/ui/FiltrosPildora.tsx` · `components/ui/BusquedaEnUrl.tsx` · `components/Paginacion.tsx` · `lib/catalogo-v2.ts` · `lib/productos-orden.ts` · `lib/productos-stock.ts` · RPC `fn_productos`, `fn_productos_resumen`, `fn_productos_buscar` · tablas `productos`, `variantes`, `categorias`, `marcas`, `proveedores`, `colores`, `tallas`, `producto_fotos`
> **Alcance:** es un acercamiento a la barra de filtros de `/productos`, no un re-análisis de la pantalla entera. El análisis general sigue en `productos.md` (2026-09-29) y sus tareas abiertas no se repiten aquí.
> Otra sesión tocándola: **no.** Las filas 25, 27 y 36 de `docs/SESIONES-ACTIVAS.md` nombran `FiltrosProductos.tsx`, pero sus ramas ya están fusionadas (ADR-0254, ADR-0281 y ADR-0283 están en `main`).
> Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción]` consulta de solo lectura del 2026-10-02 · `[referente: fuente]` · `[inferido]` · `[no verificable]`.

## 0 · Veredicto
La barra filtra bien en la base (URL como única fuente, paginado en Postgres, 48 ms), pero **le miente a quien la usa en cuatro lugares**:
- un rango de precio inventado (S/ 0–999, cuando el máximo real es S/ 119);
- píldoras que no dicen qué filtran;
- 179 de 284 opciones (63 %) que llevan a una lista vacía;
- un «Sin stock» que mide la red, mientras la tarjeta muestra la sede.

**Cumple su finalidad:** 5,3/10 · **Relevancia:** 6,0/10 — Soporte

## 1 · Finalidad declarada
«La barra existe para que quien busca una prenda (la colaboradora en el mostrador con la clienta al frente, o el líder que decide qué pedir o qué completar) reduzca el catálogo a lo que le sirve sin conocer el sistema».

Fuentes:
- ADR-0077 (filtros de la grilla).
- ADR-0254 (una sola forma: buscador + panel plegable en las dos vistas).
- ADR-0270 (la cifra de stock es una sola).
- La cabecera de la pantalla: «cuántas hay en tu sede».

¿Los documentos y la pantalla coinciden? **No en el stock.** La cabecera promete «en tu sede», pero el filtro «Stock» mide toda la red (`20260929020000:171,196-198`). Manda la decisión de Felipe del 2026-10-02: el filtro da las dos medidas, cada una rotulada.

## 2 · Objeción
1. **El rango de precio está inventado.**
   - `PRECIO_MAX = 999` está escrito a mano `[código FiltrosProductos.tsx:21-22]`, y el precio más alto del catálogo es S/ 119 `[producción]`. El 88 % del recorrido no filtra nada.
   - Con el tirador en el tope, el filtro no tiene techo, pero el texto dice «S/0–999» `[código :361,376-378]`.
   - Son 200 paradas en 96 px, así que cada píxel vale S/ 10.
   - El paso de 5 en 5 choca con los precios que terminan en ,90: con «40–60» salen 25 productos y con «35–60», 45. Los 17 productos de S/ 39,90 quedan justo debajo `[producción]`.
2. **Las píldoras no dicen qué filtran.**
   - La pieza compartida muestra el texto de la opción elegida, y la opción por defecto es «Todas» `[código FiltrosPildora.tsx:210]`. El nombre del filtro solo llega a los lectores de pantalla (`aria-label`, `:201`).
   - Se ve «TODAS · TODAS · TODOS · TODOS» `[visto]`. Una colaboradora nueva no sabe que la etiqueta es Marca y el camión es Proveedor, y una píldora que dice «ADIDAS» no aclara si es marca o proveedor.
   - Pasa en 6 pantallas: Productos, Compras, Por pagar, Historial de ventas, Comprobantes y «A quién pedirle».
3. **El 63 % de las opciones lleva a una lista vacía.**
   - Categorías: 44 activas, 14 con prendas. Marcas: 85 y 24. Proveedores: 80 y 24. Colores: 75 y 43 `[producción]`.
   - La pantalla ofrece todo lo activo `[código page.tsx:87-91]`.
   - Existencias ya resolvió lo mismo con las opciones de su sede `[código InventarioPanel.tsx:413-428]`, y Movimientos con conteos `[código FiltrosMovimientos.tsx:57-90]`. Son dos pantallas que resuelven lo mismo de otra forma: la de Productos está mal.
4. **«Sin stock» mide la red, y la tarjeta mide la sede.** Hoy Lima tiene 0 prendas, pero «Sin stock» le devuelve 0 resultados `[producción]`. La pregunta del mostrador («¿hay en mi tienda?») no tiene filtro.
5. **El estado se desincroniza de la URL.**
   - Precio y búsqueda se copian a un estado local una sola vez `[código FiltrosProductos.tsx:43-45]`.
   - Con «A quién pedirle» o con el botón Atrás, el chip «Hasta S/100» sigue a la vista sin que la lista esté filtrada. La próxima letra que se escribe vuelve a meter ese precio en la URL `[código :81-83]`.
   - Un clic dado antes de que pasen 350 ms desde la última tecla se pierde, porque el temporizador navega con la URL vieja `[código :58,80]`.
6. **Dos controles para el mismo orden, dentro del panel de filtros.**
   - Las flechas ↑↓ y el desplegable «Ordenar» escriben el mismo dato de la URL (`orden`) `[código :190-203]`.
   - Con una flecha activa, el desplegable dice «Por nombre (A–Z)», que es falso `[código :197]`.
   - El contador «Filtros · N» cuenta el orden como un filtro más `[código :163]`.
7. **La base decide el precio y el color con variantes desactivadas.**
   - `fn_productos` y `fn_productos_resumen` no miran `v.activo` `[código 20260929020000:106-113,302-305]`. La pantalla, en cambio, las esconde desde 17671448.
   - El resumen cuenta 580 variantes y la lista muestra 578 `[producción]`.
   - Hoy no cambia ningún resultado, pero cambiará con la primera talla desactivada a otro precio.

Trade-off: abrir el panel sin arreglar 1–4 sería mostrarle a todos, de entrada, 179 callejones sin salida y un precio inventado. Abrirlo es lo último, no lo primero.

## 3 · Lo que está bien y no se toca
- **La URL es la única fuente de verdad del filtro.** Se puede compartir, sobrevive a la recarga y el servidor filtra en Postgres `[código catalogo-v2.ts:218-233]`. Es el patrón que Shopify, Linear y Stripe recomiendan `[referente: shopify.dev, linear.app/docs/filters]`.
- **Paginado y conteo en la base, sin N+1.** La página tarda 48 ms y «sin stock», 42 ms `[producción]`. A 3 000 productos: 44, 270 y 340 ms, medidos en `20260929020000:26-31`.
- **Regla de combos (ADR-0209).** Buscador con más de 8 opciones y la lista que se completa al bajar, dentro de `DesplegablePildora`, protegidas por `combos-buscan-con-la-regla.test.ts` y `combos-fuera-de-la-cascada.test.ts`.
- **«Sin marca» y «Sin proveedor»** con el uuid nulo (ADR-0283), traducido en un solo lugar `[código marcas.ts:166-174]`.
- **Chips de filtros aplicados con «Limpiar todo».** Al 28 % de las tiendas grandes le falta este resumen `[referente: baymard.com]`.
- **El buscador no abre el loader de pantalla completa** (`useBusquedaEnUrl`, `SenalBuscando`) y atenúa los resultados mientras espera.
- **El producto centinela de «Monto manual» no aparece** `[código 20260929020000:69,98]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 5 | Píldoras sin nombre; «S/0–999» sin espacio y con un tope falso; dos filas de píldoras que se parten al azar | `[visto]` `[código FiltrosPildora.tsx:210]` |
| Lógica de negocio | 5 | El stock mide la red y la tarjeta la sede; el precio y el color cuentan variantes desactivadas; no hay Talla | `[producción]` `[código 20260929020000:110,171]` |
| Arquitectura | 6 | La URL como fuente está bien; el estado local se desincroniza; ninguna función devuelve conteos ni límites | `[código FiltrosProductos.tsx:43-87]` |
| Funciones | 5 | Faltan Talla, Temporada, faltas de la ficha y stock de la sede; sobran las flechas duplicadas y 179 opciones muertas | `[producción]` |
| Utilidad | 4 | Una persona sin contexto no identifica las píldoras ni sabe qué rango de precio existe | `[visto]` `[inferido]` |
| Conexión con el ERP | 7 | El filtro conecta con «A quién pedirle», Existencias y la carga de catálogo; el aviso «sin temporada» no tiene su filtro | `[código page.tsx:164-199]` |

### Estética (5)
- `[visto]` Las píldoras dicen «TODAS / TODOS» y solo los íconos las distinguen. En mayúsculas (`label-cayla`) cuesta todavía más leerlas.
- `[visto]` «S/0–999» sin espacio después de «S/» y sin separador de miles; la cifra 999 no corresponde a ningún precio.
- `[código FiltrosPildora.tsx + useAnclaje.ts:192]` La lista desplegada mide lo mismo que la píldora (unos 90 px), así que los nombres largos de marca se parten en varias líneas. `Desplegable` ya lo resolvió con `max-content` (`campos.tsx:766-768`).
- `[visto]` Nueve controles se parten en dos filas que el ancho de la pantalla decide, sin orden propio. Baymard pone el límite cómodo de una barra horizontal entre 6 y 8 tipos `[referente: baymard.com/blog/horizontal-filtering-sorting-design]`.

### Lógica de negocio (5)
- **Stock.** ADR-0270 dice que la cifra es una sola. El filtro usa la cifra de la red; la tarjeta, la de la sede. Ninguna D-nn decide qué mide el filtro. Felipe lo decidió el 2026-10-02: las dos, rotuladas.
- **Precio.** Una prenda pasa si **alguna** de sus variantes cae en el rango (`bool_or`, `:110`), mientras que el orden por precio usa el `min` (`:108`). Las dos reglas son razonables. Lo que no corresponde es que miren variantes desactivadas.
- **Estado.** Cuando no viene, entran activos y descontinuados (`:75,101`). Hoy hay 0 descontinuados `[producción]`; Felipe decidió que por defecto se vean «Activos».
- **Stock bajo.** Necesita `stock_minimo`, y ningún producto lo tiene cargado `[producción]`: la opción siempre da 0.
- **Tallas.** La lista final las ordena como texto: L, M, S, XL, XS `[código 20260929020000:261]`.

### Arquitectura (6)
- **Transacción:** no aplica, la barra solo lee.
- **Concurrencia:** sin escrituras. El único efecto de una carrera está dentro del navegador: el temporizador de 350 ms contra un clic (objeción 5).
- **Caída externa:** no tiene dependencias externas. Si cae `fn_productos`, sale el error de la pantalla (`app/(app)/error.tsx`) y no se pierde nada.
- **Volumen** `[producción]`:
  - Hoy: 86 productos y 578 variantes; 42 altas el 1-oct y la carga sigue.
  - En 3 años: de 1 000 a 2 500 productos y de 7 000 a 17 000 variantes. Hasta 3 000 productos ya está medido (ADR-0194).
  - Los conteos por opción y el rango de precio salen en una pasada sobre `productos` × `variantes`: hoy 3,7 ms (2,3 de planificación). Lo caro es el stock (`fn_existencias_base`), que `fn_productos_resumen` ya paga.
- **Faltante de base:** ninguna función devuelve el mínimo y el máximo del precio ni conteos por opción.
- **Historial del navegador:** cada pausa al escribir agrega una entrada (`buscar(href)` sin `reemplazar`, `:66`), así que el botón Atrás recorre precios intermedios.

### Funciones (5)
- **Existen y funcionan:** buscador (nombre, código, sku, código de barras exacto, marca, proveedor), Categoría, Marca, Proveedor, Color, Estado, Stock, Precio, seis órdenes, chips y «Limpiar todo».
- **Engañosas:** «S/0–999»; «Ordenar: Por nombre» con una flecha activa; «Limpiar todo» saca de la Tabla (`router.push(pathname)`, `:154`); «Filtros · 1» cuando solo se ordenó.
- **Faltan:**
  - Talla (13 en uso; los 6 referentes la tienen).
  - Stock en la sede.
  - Temporada (57 de 86 sin temporada).
  - Faltas de la ficha (76 de 86 sin foto).
  - Color por familia (7 familias).
  - Conteo de resultados arriba (hoy solo al pie, `Paginacion.tsx:109-113`).
  - Buscar sin tildes y por categoría o color; hoy «50%» trae casi todo.
- **Sobran:** las flechas ↑↓ (duplican «Ordenar») y 179 opciones sin prendas.

### Utilidad: persona sin contexto (4)
**Escenario 1.** Hora pico en TRU. La clienta pide «una blusa negra en M, hasta 80 soles».
- La colaboradora abre «Filtros» y ve seis píldoras que dicen «TODAS/TODOS». Toca la de la camiseta y elige Blusas.
- Para el negro adivina cuál es la de la paleta.
- No hay talla.
- Para el precio arrastra un tirador de 96 px donde cada píxel vale S/ 10, y el texto «S/0–999» no le dice dónde están las prendas.
- **Se equivoca o se rinde:** es el diseño, no la capacitación.

**Escenario 2.** El líder de LIM quiere saber qué le falta en su tienda.
- Filtra «Sin stock» y recibe 0 resultados, aunque su tienda tiene 0 prendas.
- Concluye que no le falta nada. **Decide mal con un dato bien calculado, pero mal rotulado.**

**Escenario 3.** Quien carga el catálogo quiere completar las prendas sin foto. No hay forma de filtrarlas: recorre 86 tarjetas.

### Conexión con el ERP (7) — ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 7 | Decide qué se repone y qué se completa del catálogo; alimenta «A quién pedirle» |
| Dinero y stock que toca | ×1 | 4 | Solo lee, pero un «sin stock» mal rotulado lleva a no reponer |
| Frecuencia y personas que la usan | ×1 | 9 | Es la pantalla del catálogo que más se abre, en el mostrador y en la carga |
| Qué se detiene si falla | ×1 | 3 | El buscador sigue funcionando; se pierde velocidad, no la venta |

Relevancia = (2·7 + 4 + 9 + 3) / 5 = **6,0**.

## 6 · Conexión con el ERP
- **Aguas arriba:** el catálogo (`productos`, `variantes`, `categorias`, `marcas`, `proveedores`, `colores`, `tallas`, `producto_fotos`), la cifra única de stock (`fn_existencias_base`, ADR-0270) y las ventas de 30 días (orden «Más vendidos»).
- **Aguas abajo:**
  - «A quién pedirle» lee los mismos filtros.
  - La paginación conserva los parámetros.
  - Las etiquetas en bloque de la Tabla toman la selección filtrada.
  - El aviso «N prendas sin temporada» lleva a Atributos.
- **Pájaro dueño y vecinos:** Catálogo. Vecinos: Existencias (sus filtros toman las opciones de la sede), Compras (reposición), Frescura (temporada).
- **Externos:** ninguno. Sin red, la pantalla no carga, igual que el resto del ERP.

## 7 · Las 12 tareas, por importancia
Felipe tomó todas las decisiones de negocio el 2026-10-02, en 19 preguntas. Se construyen en dos tandas: la **1** es solo web, sin migración; la **2** trae migraciones que Felipe pega en producción **antes** de fusionar su PR.

### #1 · Corregir — El estado del filtro sigue a la URL siempre
- **Dónde:** `FiltrosProductos.tsx:43-87,154` → lógica pura nueva en `lib/productos-filtros.ts`.
- **Por qué en este puesto:** un chip que dice «hasta S/100» con la lista sin filtrar hace decidir sobre datos mal presentados. Además, todo lo demás se construye sobre este estado: primero se arregla el terreno.
- **Cómo lo verificas tú:**
  - Filtra «hasta S/ 60», toca un proveedor en «A quién pedirle» y escribe en el buscador: el precio no vuelve.
  - Escribe «blusa» y toca el orden enseguida: el orden se queda.
  - En la Tabla, «Limpiar todo» te deja en la Tabla.
  - Atrás no recorre precios intermedios.
- **Esfuerzo / dependencias:** M · ninguna. Tanda 1.

### #2 · Mejorar — Cada píldora dice qué filtra (pieza compartida, 6 pantallas)
- **Dónde:** `components/ui/FiltrosPildora.tsx:210` (texto), `useAnclaje.ts:192` (ancho de la lista), `FiltrosHistorialVentas.tsx:237-244` (la píldora «Tienda» siempre se ve elegida).
- **Por qué en este puesto:** es el error que la captura muestra primero, y afecta a 6 pantallas.
- **Cómo lo verificas tú:** en Productos, Compras, Por pagar, Historial, Comprobantes y «A quién pedirle», cada píldora vacía dice «Categoría ▾» y una elegida «Categoría: Blusas ✕»; la ✕ la limpia; la lista se abre al ancho de su texto.
- **Esfuerzo / dependencias:** M · ninguna. Tanda 1.

### #3 · Reconstruir — Precio con cajas «Desde / Hasta», control con límites reales y tramos
- **Dónde:** `FiltrosProductos.tsx:21-22,338-381`, más la lógica pura nueva en `lib/productos-filtro-precio.ts`.
- **Por qué en este puesto:** es el ejemplo de Felipe y la objeción 1.
- **Cómo lo verificas tú:**
  - Sin filtro, el control va de S/ 20 a S/ 120 (22–119 redondeados hacia afuera).
  - Con «Blusas», van los límites de las blusas.
  - Escribir «80» en Hasta filtra «Hasta S/ 80».
  - En ninguna parte aparece «999».
- **Esfuerzo / dependencias:** M · después de #1. En la tanda 1, los límites salen de `fn_productos` con orden por precio; la #5 los reemplaza por la función de facetas y suma los tramos con conteo.
- **DECIDÍ:** límites del resultado visible sin contar el propio filtro de precio, redondeados hacia afuera a múltiplos de 10, y cajas como control principal.
- **DESCARTÉ:** límites de todo el catálogo (lo que hacen Zara y H&M), porque dentro de una categoría barata la mitad del control queda vacía. Y un tope fijo «con o más», porque sigue siendo un número inventado. Con 21 precios distintos y 86 productos, el resultado se obtiene con un `min`/`max` en una sola pasada (3,7 ms); no hace falta caché.
- **SE ROMPE SI:** entra una prenda aislada muy cara (un abrigo a S/ 1 200 con el resto bajo S/ 120). El control lineal se estira y el 90 % vuelve a quedar vacío. Ahí se corta en el percentil 95 con «S/ 120 o más», pero hoy el dato no lo pide.

### #4 · Corregir (base) — El precio y el color dejan de contar variantes desactivadas
- **Dónde:** `fn_productos` y `fn_productos_resumen` (`20260929020000:106-113,302-305`).
- **Por qué en este puesto:** la base y la pantalla dicen cosas distintas (580 contra 578). El día que una talla desactivada tenga otro precio, el filtro devolverá prendas que la tarjeta no puede justificar.
- **Cómo lo verificas tú:** desactiva una talla de S/ 50 en una prenda de S/ 70: «Hasta S/ 60» ya no la trae, y el resumen cuenta lo mismo que la lista.
- **Esfuerzo / dependencias:** S · tanda 2, con #5.

### #5 · Reconstruir (base) — Conteos por opción, sin opciones vacías
- **Dónde:** función nueva de solo lectura que devuelve las facetas (conteos por categoría, marca, proveedor, color y familia, talla, temporada, estado, faltas y disponibilidad, más los límites y tramos de precio) + `page.tsx:87-91` + `DesplegablePildora` (conteo por opción).
- **Por qué en este puesto:** cierra el 63 % de callejones sin salida.
- **Cómo lo verificas tú:**
  - Categoría muestra 14 opciones con su número, no 44.
  - Elige «Negro»: Blusas dice cuántas blusas negras hay.
  - No queda ninguna opción que lleve a 0.
- **Esfuerzo / dependencias:** L · tanda 2, después de #4.
- **DECIDÍ:** conteo disyuntivo: cada filtro cuenta con **todos los demás** filtros activos menos el suyo, en **una sola pasada**. Cada producto lleva una marca por filtro y cada conteo exige todas las marcas salvo la propia. La disponibilidad se calcula una vez con `fn_existencias_base`.
- **DESCARTÉ:**
  - Contar con todos los filtros incluido el propio, porque al elegir «Blusas» desaparecerían las demás categorías y no se podría cambiar de categoría sin limpiar.
  - Una consulta por filtro, porque son 10 pasadas sobre las mismas filas para un resultado que una sola pasada da en 3,7 ms.
  - Ampliar `fn_productos_resumen`, porque cambiar lo que devuelve obliga a `drop` y deja sin pantalla a la web vieja entre que se pega el SQL y se fusiona.
- **SE ROMPE SI:** el filtro de disponibilidad de la sede se pide a 3 000 productos con stock en 4 sedes y la página pasa de 340 ms. En ese caso los conteos de disponibilidad se cargan aparte, después de la lista.

### #6 · Replantear (decidido por Felipe el 2026-10-02) — «Stock» pasa a «Disponibilidad», en la sede y en la red
- **Dónde:** el filtro `p_stock` de `fn_productos` (`20260929020000:142-147,196-198`) y la píldora de `FiltrosProductos.tsx:256-267`.
- **Por qué en este puesto:** es la objeción 4, la pregunta del mostrador.
- **Cómo lo verificas tú:** en LIM, «Hay en Tienda Lima» da 0 y «Sin stock en Tienda Lima» da 86. En TRU, «Hay en Tienda Trujillo» da 85. «Sin stock en ninguna sede» da 0.
- **Esfuerzo / dependencias:** M · tanda 2.
- **DECIDÍ:** opciones Hay en [sede] · Sin stock en [sede] · Sin stock en ninguna sede · Pedir a proveedor (y Stock bajo, que se esconde sola mientras dé 0).
- **DESCARTÉ:** solo la red con el rótulo «en toda la red», porque la pregunta del mostrador sigue sin respuesta. Y solo la sede, porque el líder pierde «se acabó en todas», que es lo que sirve para pedirle al proveedor.
- **SE ROMPE SI:** alguien filtra en una terminal sin sede elegida. Entonces las dos opciones «de la sede» se esconden y quedan las de la red.

### #7 · Mejorar — Un solo «Ordenar por» fuera del panel, conteo arriba, «Más recientes» por defecto
- **Dónde:** `FiltrosProductos.tsx:101,163,190-203,285-332`; `lib/productos-orden.ts` y su prueba; `page.tsx` (barra de resultados).
- **Por qué en este puesto:** dos controles para un mismo dato (Brooks), con un rótulo falso.
- **Cómo lo verificas tú:**
  - Arriba se lee «86 productos · Ordenar por: Más recientes».
  - Ya no están las flechas.
  - Con solo un orden elegido, el botón dice «Filtros», sin número.
- **Esfuerzo / dependencias:** S · después de #1. Tanda 1.

### #8 · Mejorar — Talla y Color, con varias opciones; el color agrupado por familia
- **Dónde:** función de listado (parámetros de lista) + `FiltrosProductos.tsx` + `DesplegablePildora` (casillas).
- **Por qué en este puesto:** «¿la tienes en M?» es la pregunta más común, y «negro o azul» es un pedido real.
- **Cómo lo verificas tú:** marca M y L: salen las prendas con alguna variante activa en M o en L. Marca «Todos los azules»: salen los azules de cualquier tono.
- **Esfuerzo / dependencias:** M · tanda 2, con #5.

### #9 · Mejorar — Panel abierto en escritorio y recordado; hoja en el celular; dos filas «Prenda / Gestión»
- **Dónde:** `FiltrosProductos.tsx:46`, una cookie como `lib/tamano-grilla.ts`, `page.tsx` (la lee el servidor) y `PanelPildoras`.
- **Por qué en este puesto:** es lo que pidió Felipe, y llega después de que la barra dice la verdad.
- **Cómo lo verificas tú:**
  - Al entrar en computadora, el panel está abierto.
  - Si lo cierras y recargas, sigue cerrado.
  - A 375 px se ve «Filtros (2)», y al tocarlo se abre una hoja con «Ver 34 productos».
- **Esfuerzo / dependencias:** M · después de #2. Tanda 1.

### #10 · Mejorar — Temporada y «Por completar» (sin foto, sin temporada, sin marca, sin proveedor)
- **Dónde:** función de listado + facetas + `FiltrosProductos.tsx`; el aviso «N prendas sin temporada» de `page.tsx:164-185`.
- **Por qué en este puesto:** la carga del catálogo sigue (42 altas el 1-oct) y 76 de 86 prendas no tienen foto.
- **Cómo lo verificas tú:** «Por completar ▸ Sin foto» trae 76; «Temporada ▸ Sin temporada» trae 57.
- **Esfuerzo / dependencias:** M · tanda 2.

### #11 · Mejorar — Buscador: sin tildes, por categoría y color, «50%» literal, atajo «/»
- **Dónde:** `fn_productos_buscar` (`20260918231300:36-58`) + `FiltrosProductos.tsx` (el atajo).
- **Por qué en este puesto:** «sueter» no encuentra «Suéter», y la clienta dice «blusa negra», no el código.
- **Cómo lo verificas tú:** «sueter» encuentra «Suéter»; «blusa negra» trae las blusas negras; «50%» no trae el catálogo entero; «/» lleva el cursor al buscador.
- **Esfuerzo / dependencias:** S (atajo, tanda 1) + M (base, tanda 2).

### #12 · Mejorar (bajo valor) — «Activos» por defecto y «Copiar enlace»
- **Dónde:** `catalogo-v2.ts:218-233` (estado por defecto) y la barra de resultados.
- **Por qué en este puesto:** hoy hay 0 descontinuados, así que el efecto es nulo hasta que existan. El enlace ya funciona copiando la dirección a mano.
- **Cómo lo verificas tú:** al entrar, la píldora dice «Estado: Activos»; con «Todos» aparecen las descontinuadas. «Copiar enlace» pega en WhatsApp la misma lista.
- **Esfuerzo / dependencias:** S · tanda 1.

## 8 · Estrategia alternativa
No hay una que apoye mejor la gestión. La alternativa real era «buscar primero, filtrar después» (Shopify POS, Lightspeed: el mostrador busca, no filtra), y ya se cumple: el buscador queda arriba y el panel solo se pliega en el celular. Las pestañas fijas por tarea (Shopify, Zoho) se descartaron con Felipe: repetirían lo que hacen «Disponibilidad» y «Por completar», y hoy «Stock bajo» y «Pedir a proveedor» darían siempre 0.

## 9 · Referentes de ERP y futuro
Todo lo verificado viene de los informes de la sesión: dos agentes leyeron las fuentes el 2026-10-02.
- **Lo que se adoptó:**
  - Rango de precio que sale de los datos: Zara, H&M, Amazon; `range_max` de Shopify; Algolia.
  - Cajas Mín/Máx junto al control: Baymard, Ripley.
  - Tramos sin vacíos: Falabella, Uniqlo.
  - Conteo por opción y ocultar los ceros: H&M, Odoo (`expand=False`), Baymard.
  - Píldora con nombre: Polaris `FiltersBar`, H&M «COLOR [1]».
  - Orden aparte del filtro: Amazon, Polaris, Linear, Notion.
  - Abierto en escritorio y plegado en el celular, con «Ver N»: Odoo, H&M, Uniqlo, NN/g.
  - Disponibilidad en tienda: Uniqlo, Falabella, Square.
  - Talla: los seis referentes de moda.
- **MercadoLibre:** no se pudo leer (pide sesión a un navegador automatizado). Lo que se dice de MercadoLibre es de memoria, sin verificar, y no se usó para decidir.
- **Futuro** (no le sirve hoy a 3 tiendas y 1 taller):
  - Vistas guardadas por persona o rol (Shopify, Odoo, Linear, Zoho).
  - Operadores «es / no es» y combinaciones Y/O (Odoo, Linear).
  - Agrupar por (Odoo).
  - Tejido y patrón como filtro (las etiquetas aún se cargan).
  - «Margen bajo» (hay tres umbrales sin decidir, ver `productos.md` objeción 5).

## 10 · Fuera de esta pantalla
**La regla «el filtro de stock mide la red» (ADR-0270) también vale fuera de Productos.** Cualquier pantalla que filtre «sin stock» con la cifra de la red le contesta mal al mostrador de una tienda vacía, como hoy a Lima. Antes de copiar «Disponibilidad» a otra pantalla, hay que revisar con el mismo lente qué mide cada filtro de stock del ERP. La regla de ADR-0270 es sobre **una** cifra, no sobre **qué** cifra pregunta cada persona.

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:productos-filtros]` #1 El estado del filtro sigue a la URL (desincronización, carrera de 350 ms, «Limpiar todo» conserva la vista, historial) — M
- [ ] `[pantalla:productos-filtros]` #2 Píldora con nombre en la pieza compartida (6 pantallas) + «Tienda» de Historial — M
- [ ] `[pantalla:productos-filtros]` #3 Precio con cajas, límites reales y tramos — M
- [ ] `[pantalla:productos-filtros]` #4 Precio y color sin variantes desactivadas (base) — S
- [ ] `[pantalla:productos-filtros]` #5 Facetas: conteos por opción y sin opciones vacías (base) — L
- [ ] `[pantalla:productos-filtros]` #6 Disponibilidad en la sede y en la red (base) — M
- [ ] `[pantalla:productos-filtros]` #7 Un solo «Ordenar por», conteo arriba, «Más recientes» por defecto — S
- [ ] `[pantalla:productos-filtros]` #8 Talla y Color con varias opciones, color por familia (base) — M
- [ ] `[pantalla:productos-filtros]` #9 Panel abierto y recordado, hoja en el celular, filas Prenda/Gestión — M
- [ ] `[pantalla:productos-filtros]` #10 Temporada y «Por completar» (base) — M
- [ ] `[pantalla:productos-filtros]` #11 Buscador sin tildes, por categoría y color, «%» literal, atajo «/» — S+M
- [ ] `[pantalla:productos-filtros]` #12 «Activos» por defecto y «Copiar enlace» — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Barra | Buscar | Busca por nombre, código, sku, código de barras, marca y proveedor | ajustar (tildes, categoría y color, «%») | `fn_productos_buscar` |
| Barra | Botón «Filtros · N» | Abre o cierra el panel; N cuenta el orden | ajustar | `FiltrosProductos.tsx:163` |
| Panel | Flechas ↑↓ | Ordenan por precio | sobra | `:190,293-332` |
| Panel | Ordenar | Cuatro órdenes que no son de precio | ajustar: sale del panel y suma los de precio | `:194-203` |
| Panel | Categoría | 44 opciones, 30 sin prendas | ajustar: nombre y conteo | `[producción]` |
| Panel | Marca | 85 opciones + «Sin marca», 61 sin prendas | ajustar | `[producción]` |
| Panel | Proveedor | 80 + «Sin proveedor», 56 sin prendas | ajustar | `[producción]` |
| Panel | Color | 75, 32 sin prendas, una sola a la vez | ajustar: familia y varias | `[producción]` |
| Panel | Estado | Todos por defecto | ajustar: «Activos» | Felipe 2026-10-02 |
| Panel | Stock | Red, no sede | replantear: «Disponibilidad» | `:256-267` |
| Panel | Precio | Control de 0 a 999 de 5 en 5 | reconstruir | `:338-381` |
| Panel | — | Talla, Temporada, Por completar | falta | `[producción]` |
| Debajo | Chips + «Limpiar todo» | Quita uno o todos; «Limpiar» saca de la Tabla | ajustar | `:127-161` |
| Resultados | «N productos» | Solo al pie | falta arriba | `Paginacion.tsx:109-113` |
| Resultados | Copiar enlace | — | falta | Felipe 2026-10-02 |

## Historial
| Fecha | SHA | Modo | Finalidad | Relevancia | Nota |
|---|---|---|---|---|---|
| 2026-10-02 | `a25ebdf8` | completo | 5,3 | 6,0 | Primer análisis de la barra (acercamiento a `productos.md`); 19 decisiones de Felipe en la misma sesión |
