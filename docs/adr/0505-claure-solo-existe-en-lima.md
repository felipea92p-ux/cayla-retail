# ADR-0505 — CLAURE solo existe en Lima: el candado en la base y lo que ve cada sede

> **Actualización 2026-10-27 ([ADR-0542](0542-stock-de-lima-por-dueno.md)):** el candado sigue (CLAURE solo en Lima), pero ahora también por UNIDAD: un traslado desde Lima solo lleva unidades de las empresas que operan en el destino. La insignia «CLAURE» vuelve a leer la ficha; qué unidades de una prenda son de CLAURE lo dice `stock_dueno`.

**Estado:** aceptada · **migración EN PRODUCCIÓN desde 2026-10-24** (con el OK de Felipe; versión `20261024233234`, la hora del pegado) · la web va en su PR · **Fecha:** 2026-10-24 ·
**Decidió:** Felipe · **Sigue a:** ADR-0463 (empresas CAYLA y CLAURE), ADR-0465 (tienda online) y ADR-0467 (filtro «Tienda»)

## Contexto

Felipe (2026-10-24): «las colaboradoras se están confundiendo porque se está creando prendas de CLAURE que son las mismas que tienen en
CAYLA, el mismo proveedor y la misma prenda, entonces les sale en el catálogo cuando no debería salir».

Lo que había en producción ese día: 5 prendas de CLAURE (Blusa Hindú, Broana, Triana, Cudra y Cardigan Río), todas con stock solo en
Tienda LIM. Dos de ellas son de Marisol / Ivanana, la misma proveedora de la Blusa Becky y la Blusa Mia de CAYLA, pero con otro nombre y
otro precio (S/ 59 contra S/ 45). La tienda online ya escondía CLAURE fuera de Lima (ADR-0465), pero el ERP no: Catálogo, Vender,
Existencias, Recibir y Contar le ofrecían a Trujillo y Arequipa las prendas de CLAURE. Y no había nada en la base que impidiera mover una a
Trujillo: «Pedir a otra sede» desde Vender podía traer una prenda de CLAURE y venderla en la caja de CAYLA, mezclando la mercadería y el
dinero de dos negocios.

Felipe eligió, entre «solo la insignia» y «CLAURE solo existe en Lima», la segunda: «con el candado en la base y la insignia CLAURE en Lima».

## Decisión

**1. El candado vive en `movimientos`** (`20261024232000_empresa_solo_mueve_stock_en_sus_sedes.sql`). Un disparador `BEFORE INSERT`
rechaza todo movimiento de una prenda en una sede donde su empresa no opera, mirando el lugar del movimiento y, si es un traslado, su
destino. Es el único punto por el que pasa todo cambio de stock (venta, separado, traslado, recepción, carga inicial, ajuste, conteo,
devolución, cambio), así que cubre también las funciones que se escriban mañana. Es el mismo patrón que la cuarentena (ADR-0328). El
mensaje dice qué prenda, de qué empresa, por qué no y dónde sí: «Blusa Broana es de CLAURE, y CLAURE no está en Tienda TRU: esta prenda
solo se vende, se recibe y se traslada en Tienda LIM.» (hint `empresa_fuera_de_sede`, el mismo de `crear_producto_con_empresa`).

**2. La otra mitad, en `productos`.** La regla une dos tablas, así que también se rompe cambiando la empresa de una prenda con stock.
`crear_producto_con_empresa` crea la prenda como CAYLA con su stock inicial y después le pone la empresa, y solo valida `p_sede_id`, no
`p_ubicacion_id` (donde cae el stock). La web manda las dos iguales, pero por la API se podía crear una de CLAURE con stock en Trujillo.
Además, quien edita el catálogo puede escribir `productos.empresa_id` directo. Un disparador de restricción **diferido al cierre de la
transacción** revisa que la prenda no quede con stock ni apartados donde su nueva empresa no opera. Se juzga al cerrar porque la regla
cruza dos tablas: lo que cuenta es cómo quedan las dos juntas, no el orden en que se tocaron.

**3. Una sola regla de «dónde opera»:** `fn_empresas_de_sede`, la misma que decide qué empresas pregunta el alta (ADR-0463) y qué muestra
cada tienda online (ADR-0465). Hoy: CAYLA en las cuatro sedes; CLAURE, solo en Tienda LIM. Una sede que nadie sumó a `empresa_sedes` es
solo-CAYLA.

**4. Una sonda antes del candado.** Si ya hubiera stock de una prenda en una sede donde su empresa no opera, el disparador la dejaría sin
poder moverse. La migración la busca y, si encuentra algo, no aplica nada y dice qué prenda y dónde. En producción, el 2026-10-24: 0.

**5. Lo que ve cada sede (web, `lib/empresas-de-sede-reglas.ts`, pura y con prueba).** «Las empresas de aquí» son las de la sede
elegida o, en CAYLA Global, todas. Una prenda se ve si su empresa está entre ellas.
- `getCatalogoDeLaSede(sedeId)` (`lib/catalogo-v2.ts`) filtra la copia guardada del catálogo (que se comparte entre sedes) y le pone a
  cada prenda su insignia. La leen **Vender, Apartados, Cambios, Buscar, Recibir (llegada y por factura), Contar y Cuadrar**: lo que se
  OFRECE. Lo que solo busca el nombre de algo que ya está en un documento (una proforma, un traslado, un conteo cerrado, Producción,
  Por regularizar) sigue con `getCatalogo()`; ahí la base es la que rechaza.
- **Existencias** ya no ofrece «En el catálogo, pero sin stock en Tienda TRU» una prenda de CLAURE.
- **Catálogo ▸ Productos**: en una sede con una sola empresa la lista pide solo esa (`p_empresa_id`), aunque la URL diga otra; la
  píldora «Tienda» aparece solo donde conviven dos (Lima y Global). La sugerencia «Combina bien con» también se filtra.
- **La insignia «CLAURE»** (`<InsigniaEmpresa>`, un `<Chip tono="pizarra">` sin punto porque nombra algo, ADR-0358) sale solo donde
  conviven dos empresas y nunca para CAYLA: arriba a la izquierda de la tarjeta de Productos, junto al nombre en su tabla, y bajo el
  nombre en la tarjeta de Vender. Marcar CAYLA en 450 prendas sería ruido.
- Sin respuesta de la base (o en una base sin empresas), se ve todo, como antes: la pantalla se degrada, nunca esconde de más.

## Consecuencia de negocio

Una prenda de CLAURE vendida en Lima **no se puede devolver ni cambiar en Trujillo**: la base lo rechaza con el mensaje de arriba. Se
devuelve o se cambia en Lima. Tampoco puede ir al Taller.

## Alternativas descartadas

- **Solo la insignia, sin esconder ni bloquear:** era lo más rápido, pero Trujillo seguía viendo las prendas de CLAURE y «Pedir a otra
  sede» seguía abierto. Felipe la descartó.
- **Una sola prenda para los dos negocios** (si es la misma blusa, que no se cree otra): tienen distinto dueño, distinto precio y CLAURE
  le cobra su costo a CAYLA en la liquidación. Juntarlas obligaría a llevar el dueño unidad por unidad y tocar el núcleo
  (`stock`, `movimientos`), contra el principio 1.
- **Sumar la empresa a `fn_variante_permitida_en_sede`:** la llaman seis funciones vivas (Vender, separados, pedidos web, tienda online),
  pero ya no la llama `transferir`, ni las recepciones, ni los ajustes. El disparador cubre todo sin reescribir ninguna.
- **Parchar `crear_producto_con_empresa` para validar `p_ubicacion_id`:** un reemplazo anclado más sobre una función viva, y no cubría
  la escritura directa de `productos.empresa_id`. El disparador diferido cubre las dos.
- **Un disparador inmediato en `productos`:** rompía tres pruebas que convierten una prenda del seed a CLAURE dentro de una transacción
  que se deshace (tienda_empresas, productos_filtro_por_empresa, campana_reglas). Diferido, esas no llegan al cierre; y es lo correcto
  para una regla que cruza dos tablas.
- **Filtrar las listas en la base** (`fn_productos_filtro` con la sede): otro parche a una función de tres firmas. La sede ya decide
  `p_empresa_id` en la web, y el candado de la base cuida lo que importa.

## Lo que se rompe si…

- **Una empresa se desactiva** (`empresas.activo = false`) con stock: `fn_empresas_de_sede` ya no la lista y ese stock queda quieto.
  Antes de desactivarla, vender o liquidar lo que tenga.
- **CLAURE abre otra sede** y nadie suma su fila en `empresa_sedes`: no podrá recibir allí (es seguro: el mensaje lo dice).
- **Llega una tercera empresa que no opera en Lima:** en Lima, sin elegir «Tienda», la lista de Productos traería también la tercera
  (la base recibe una sola empresa, no una lista). Habría que pasarle la lista entera a `fn_productos_filtro`.
- **Una pantalla nueva ofrece prendas con `getCatalogo()`** en vez de `getCatalogoDeLaSede`: Trujillo verá las de CLAURE (la base igual
  rechazará moverlas). Lo que se ofrece para vender, recibir o contar lee el de la sede.
- **Una prueba de Postgres** convierte a CLAURE una prenda con stock fuera de Lima y luego hace commit o fuerza
  `set constraints all immediate`: el disparador diferido la rechaza.

## Verificación

- `pnpm pruebas:empresa-solo-en-sus-sedes` (15/15, Postgres local, cada caso en ROLLBACK): control sin el candado; crear una de CLAURE en
  Lima sigue; entrada, traslado, venta y ajuste de CLAURE fuera de Lima rechazados con el mensaje y el hint; en Lima pasan; CAYLA se mueve
  igual en las tres sedes; crear una de CLAURE con el stock en Trujillo y pasar a CLAURE una con stock en Trujillo, rechazados al cerrar;
  una con stock solo en Lima, sí; la sonda; pegada dos veces; sin permisos para la API.
- Con la migración aplicada en local, siguen en verde `tienda-empresas` (45), `productos-empresa` (9), `campana-reglas` (71) y
  `cuarentena-no-se-ajusta` (12). `alta-con-stock-inicial` da 18/30 con y sin el candado (la carga inicial de Trujillo está cerrada en la
  base local): no es de este cambio.
- Web: `lib/empresas-de-sede-reglas.test.ts` (13 casos), los 609 archivos de pruebas de la web, tipos, lint y Knip en verde.
- Navegador (local, con la «Blusa Aurora» marcada como CLAURE solo durante la prueba y devuelta a CAYLA después): en Lima, Productos y
  Vender muestran «CLAURE» en esa prenda y nada en las de CAYLA; en Trujillo, Productos encuentra 1 de 2 «aurora» y no muestra la píldora
  «Tienda», Vender (con todo el catálogo a la vista y buscando «aurora») no la ofrece, y Existencias solo ofrece la de CAYLA «sin stock
  aquí». Vender a 375 px: la insignia cabe y la página no se desborda; en modo oscuro se lee.
- **Producción (2026-10-24, con el OK de Felipe):** pegada con `apply_migration` en una sola parte; quedó registrada como `20261024233234`. Antes, la
  sonda dio 0 prendas con stock fuera de la sede de su empresa. Después: «QUEDÓ BIEN»; el cuerpo de las dos funciones tiene la misma huella md5
  que en la base local (`6e26bc52…` y `e518cad6…`); y una prueba que se deshace sola (cada intento en su bloque, con un error a propósito si
  pasaba) dio: la entrada de la Blusa Broana (CLAURE) en Tienda TRU, rechazada con «Blusa Broana es de CLAURE, y CLAURE no está en Tienda TRU:
  esta prenda solo se vende, se recibe y se traslada en Tienda LIM.»; la de la Blusa Becky (CAYLA), aceptada; 0 movimientos de prueba en la base.
