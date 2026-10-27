# ADR-0539 — Vitrina web ▸ Looks dice en qué tiendas sale cada look, y avisa al armarlo

- **Fecha:** 2026-10-27 · **Estado:** código y pruebas listos en la rama `claude/erp-looks-por-tienda`; **la migración `20261027204000` está solo en la base local: se pega en producción cuando Felipe lo apruebe** (hasta entonces la pantalla se ve como antes, sin chips ni filtro).
- **Relacionados:** ADR-0468 (cada tienda muestra solo los looks que puede vestir), ADR-0465 (CLAURE solo en Lima), ADR-0408 (la tienda online, «Arma tu look»), ADR-0195 (cómo se pegan las migraciones).

## El problema

Felipe tenía 3 looks encendidos y la tienda online mostraba 1. El ERP decía «Se ven en la web: 3 de 3». Los dos números eran verdad en su propia regla: el ERP contaba «cada prenda se ve en la web en *alguna* tienda»; la web, desde ADR-0468, muestra un look solo donde **todas** sus prendas están a la venta y libres **en la misma tienda**. La pantalla no decía en qué tienda sale cada look ni qué prenda le falta, así que la única forma de entenderlo era mirar la base (así se vio: «Look del día» tenía tres prendas solo en Trujillo y una solo en Arequipa; en «Una idea para hoy», la única talla con stock de la cartera no era la que la web ofrece).

## Lo que se decidió

1. **Dos funciones nuevas de solo lectura**, ambas con el módulo `vitrina_web`, que no deciden nada: llaman a las mismas reglas que la tienda online (`fn_tienda_disponible` para «hay», `fn_tienda_precios` para «se ofrece», el catálogo de cada tienda para «se ve»).
   - `retail.fn_vitrina_looks_por_tienda()`: por look, por tienda web y por prenda, `hay` y el motivo (`no_se_ve`, `sin_stock`, `no_ofrecida`), y por tienda `completo` y `faltan`.
   - `retail.fn_vitrina_prendas_por_tienda()`: de cada prenda y color que la web muestra, en qué tiendas hay.
2. **Chips por tienda** en la tarjeta de cada look (verde: sale; ámbar: cuántas prendas faltan, y al pasar el mouse cuáles y por qué).
3. **Al armar un look** (Nuevo y Editar): filtro «Hay en [tienda]» en la grilla y un aviso en vivo bajo las prendas elegidas («Con estas prendas el look sale en TRU» / «no saldría en ninguna tienda: …»). **Es un aviso, no un candado**: se puede guardar un look aunque hoy no salga en ninguna tienda (el stock llega mañana).
4. **El contador y el mensaje dicen lo que dice la web**: «Salen en alguna tienda» y «Encendidos que no salen», y un look encendido que no sale dice qué le falta a cada tienda. El `seVe` que da la base se corrige en la pantalla con `conSalidaPorTienda` (solo hacia «no se ve»; nunca al revés).

## Descartado

- **Calcularlo en la pantalla del ERP con el inventario:** una segunda regla de «hay» que se desfasa de la de la web; el ERP volvería a decir «se ve» donde la web dice que no. Las funciones llaman a las mismas reglas y una prueba exige que `completo` coincida con lo que `tienda_looks(tienda)` devuelve.
- **Cambiar `fn_vitrina_looks` (el editor):** la pantalla de siempre se haría más lenta. Las dos funciones nuevas se piden aparte: la primera con la lista, la segunda solo al abrir la hoja de un look (y se guarda un minuto).
- **Bloquear el guardado de un look que no sale en ninguna tienda:** el stock cambia; un look armado hoy puede salir mañana. Lo decide Felipe si lo quiere (hoy no).
- **Guardar en el look en qué tiendas está completo:** un dato derivado que se queda viejo apenas cambia el stock (principio 4).
- **Una tabla de prendas por tienda al abrir un look guardado:** la reemplaza el aviso en vivo, que dice lo mismo antes de guardar.

## Números (producción, 2026-10-27, solo lectura)

La primera versión, con `fn_vitrina_look_se_ve` fila por fila (recorre el catálogo entero en cada llamada), tardaba **25,8 s** para 4 looks, 15 piezas y 3 tiendas; leyendo el catálogo de cada tienda una vez, **2,0 s**. Para todas las prendas (4619 combinaciones prenda-color-tienda): **6,2 s** con una subconsulta por fila y **2,5 s** juntando las tablas una vez (la versión que quedó). La respuesta de `fn_vitrina_prendas_por_tienda` pesa ~100 KB (1218 prendas-color).

## Todo puede fallar (principio 9)

Si una de las dos funciones no responde, o todavía no está en la base (antes de pegar la migración), la pantalla de looks se ve como siempre: sin chips, sin filtro, sin aviso por tienda, y la hoja dice que no pudo mirar qué hay en las tiendas; nada se pierde ni se bloquea. El número de tiendas es el de las tiendas de la web: con una sola, o con ninguna, el aviso dice lo que corresponde o calla (sin tiendas la web no esconde nada y el ERP tampoco).

## Se rompe si

Alguien cambia la regla de «hay» o de «se ofrece» de la web (`fn_tienda_looks_json`) y estas funciones no se enteran. Lo vigila `pnpm pruebas:vitrina-looks`, secciones «Por tienda, en el ERP»: compara `completo` con `tienda_looks(tienda)` y lo de cada prenda con lo de su look, con un mutante que cuenta «hay» solo por stock.

## Producción

Una sola parte (`20261027204000`), idempotente, que solo crea dos funciones: no toca tablas ni políticas (sin riesgo de 40P01 de ADR-0195) y no usa `select … into` dentro de un texto entre comillas. Se pega con ensayo revertido y verificación de huella, como siempre, y solo con el OK puntual de Felipe. El orden con la web da igual (la web no cambia). Requiere 20261021010000.

## Lo que queda

- Revisar las 8 pruebas viejas de `pnpm pruebas:vitrina-looks` que ya fallaban en `main` con esta base local (precio, láminas y «hay» de las tallas): no son de este cambio.
- Si Felipe quiere que el aviso bloquee, es una condición más en `LookHoja` (`sePuedeConfirmar`); hoy no.
