# ADR-0531 — Una terminal cambia el precio solo en su tienda

- **Fecha:** 2026-10-26 · **Estado:** construido, probado y **con su migración en producción** (2026-10-26, con el OK de Felipe: «pega tú la
  migración»; aplicada por el MCP de Supabase con `apply_migration`, que la registra con la hora de aplicación: `20261026224000` →
  `20261026232834`). Se pegó antes de fusionar el PR #1374: mientras la web nueva no se publique, una terminal que edite la matriz de precio
  recibe el rechazo con el mensaje genérico de la web de hoy.
- **Relacionados:** ADR-0162 (terminales fijas a una tienda), ADR-0161 (módulos y roles), el precio de tienda por prenda
  (`20261011100000_precio_de_tienda_por_prenda.sql`, Felipe 2026-10-09/10) y el precio de venta desde la recepción (Felipe 2026-10-24).

## El problema

Una prenda tiene dos precios: el **de la prenda** (`variantes.precio`, la matriz de la ficha), que vale en todas las tiendas, y el **de una
tienda** (`precios_sede_prenda`, `poner_precio_sede`), que vale solo ahí. Una terminal está fija en una tienda, y el precio de tienda ya solo
le dejaba tocar la suya. Pero con «Productos» podía editar la matriz de la ficha —o elegir «Todas las sedes» al cambiar un precio desde Recibir
envío— y el precio cambiaba también en Trujillo, Arequipa y Lima. Felipe: «Las cuentas de terminal de cada sede deben cambiar el precio solo
para sus sedes, no debe permitir cambiar el precio de otras sedes, ni siquiera debe salir esa opción».

## Lo que se decidió

1. **En la base, un disparador sobre la columna** (`variantes_terminal_no_cambia_precio`, BEFORE UPDATE OF precio, solo si el valor cambia):
   si la sesión es una terminal (`fn_es_terminal()`), se rechaza con `42501` y el hint `terminal_precio_de_la_prenda`. Un disparador y no un
   `if` en cada función: hoy escriben ese precio `catalogo_actualizar_producto` y `cambiar_precio_en_recepcion` (alcance «todas»), y la que se
   sume mañana queda cubierta sola.
2. **Lo que sigue permitido a una terminal:** guardar la ficha sin tocar el precio (el mismo valor no dispara), crear una prenda o sumarle una
   talla con su precio (crear no es cambiar: una talla reactivada conserva el suyo) y poner, cambiar o quitar el precio de SU tienda.
3. **En la pantalla, la terminal no ve la opción.** Ficha ▸ Variantes y precios: las tallas guardadas muestran su precio sin caja, no aparece
   «cambiar en bloque» y la bajada dice dónde se cambia («Precio en Tienda X», más abajo). El bloque «Precio por tienda» habla solo de su tienda
   y dice que lo que cambie ahí no toca a las otras. Recibir envío ▸ Cerrar: el precio de venta vale solo en su sede, sin «Todas las sedes».
4. **Personas, sin cambios:** el líder y una integrante siguen cambiando el precio de la prenda como antes (la integrante pone precio de tienda
   solo en la suya, como ya era).

## Lo que se descartó

- **Convertir la edición de la matriz en precio de tienda:** el precio de tienda es uno por prenda (todas sus tallas) y la matriz es por talla;
  traducir uno al otro escondería qué se guardó.
- **Frenar también las altas de una terminal con un precio distinto:** una talla nueva no se vendió en ninguna otra tienda todavía, y la
  recepción crea prendas desde una terminal (la de almacén vive en una tienda). Se puede revisar si aparece el caso.

## Cómo se prueba

`pnpm pruebas:precio-terminal` (en la lista de `scripts/ci/pruebas-postgres.mjs`): la terminal no cambia el precio y no queda nada escrito; el
mismo precio, otra columna y una talla nueva pasan; el líder, una integrante y sin sesión cambian como antes; la migración se pega dos veces.
`pruebas:precio-sede` y `pruebas:precio-desde-recepcion` siguen en verde.
