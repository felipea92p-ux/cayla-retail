## 2026-10-17 (La tienda online carga en décimas de segundo, y dejó de cortarse el catálogo)
Qué hice: medí la tienda en producción y lo lento era la base: `tienda_catalogo` tardaba 2,36 s de media y, peor, Postgres lo cortó 208 veces
en 24 h por el límite de 5 s (más que las 179 cargas que terminaron; `pg_stat_statements` no cuenta lo cortado, solo lo vio el registro de
Postgres). Con el OK de Felipe apliqué tres migraciones: el precio de cada talla se calcula una vez y no 9 (`20261017171000`), la revisión
«¿se puede mostrar?» pasa a PL/pgSQL y ya no se vuelve a planear en cada prenda (`172000`) y el catálogo arma lo de cada prenda una vez
(`173000`). En producción: catálogo 0,26–0,54 s, looks 0,33 s, un look 0,35 s, ficha ~20 ms y Mi Club 64–101 ms, con el JSON del catálogo
idéntico byte a byte al de antes. En la web, la portada ya no carga zod (12 scripts y 629 KB sin comprimir, antes 14 y 733) y las fotos
viajan en AVIF (21 % menos que WebP en fotos reales).
Por qué así: cada arreglo salió de una medida (cuántas veces se llamó cada función en una carga, copias temporales comparadas contra los
datos de producción sin tocar las vivas) y ninguno cambia lo que se muestra; la prueba nueva `pnpm pruebas:tienda-rapida` compara contra la
versión de antes, con mutantes. No activé «atrás instantáneo»: medido, volver atrás ya no pide nada al servidor. La prioridad de las fotos
de la portada ya estaba bien (eran tres, todas a la vista; yo había contado seis).
Felipe se lleva: una tienda que ya no le dice «No pudimos cargar las prendas» a la mitad de sus clientes; el probador (escondido) sigue en
~0,6 s y lo puede arreglar su obra («Arma el tuyo») con el mismo patrón.
