# ADR-0631 · El costo de cada talla en la ficha: la cifra de la prenda, el porqué de cada talla y la última compra

- **Fecha:** 2026-11-07 · **Estado:** construido en la rama `claude/costo-promedio-catalogo-49a6de`. Web + una función de solo lectura
  (`20261107232000_costo_de_las_tallas.sql`), **sin pegar en producción** al cerrar la rama.
- **Pide:** Felipe, con una captura de Catálogo ▸ Editar ▸ Costos del Short Sohanna: «ingresaron costo y 3 colores, en los 2 primeros salió el
  costo promedio y en el último otro costo, verificar qué pasó para arreglarlo y ver cómo visualizarlo en catálogo». Eligió la maqueta y la
  función nueva (con la cuenta exacta por talla) sobre la versión sin base.
- **Sigue a:** ADR-0067 (costo promedio ponderado por variante), `20260927190000` (el costo se corrige a mano hasta la primera compra),
  ADR-0515 (corregir la última compra), ADR-0614 (revertir un cierre devuelve el costo).

## Lo que pasó (medido en producción, solo lectura)

El 22-oct entraron 4 shorts por carga inicial, con el costo declarado de S/ 45. Se vendieron 3 antes del 7-nov. El 7-nov, en Recibir
mercadería, llegó 1 de cada color a S/ 48:

| Talla | Había antes | Llegó | Quedó |
|---|---|---|---|
| Azul acero 28 | 0 (vendida el 23-oct) | 1 a S/ 48 | S/ 48.00 |
| Azul marino 30 | 1 a S/ 45 (sin vender) | 1 a S/ 48 | S/ 46.50 |
| Celeste 30 | 0 (vendida el 26-oct) | 1 a S/ 48 | S/ 48.00 |

**La cuenta estaba bien:** cada talla promedia lo que tenía con lo que llegó. No había dato que arreglar. Lo que fallaba era la pantalla:

- **Las celdas grises no decían por qué.** Solo «promedio ponderado» al pasar el mouse, que en una tablet no existe.
- **Las 6 tallas que no llegaron seguían en S/ 45**, editables, sin decir que era el costo escrito a mano.
- **La columna «Costo» medía 60 px** y cortaba el rango («S/ 45–…»).
- **El Historial ▸ Costo decía otra cifra (S/ 47.25, toda la prenda)**, que la ficha no mostraba en ningún lado.

## Decisión

En la pestaña **Costos** de la ficha:

1. **Arriba, la cifra de la prenda:** «Cada prenda te cuesta hoy S/ 47.25 · promedio de las 4 que tienes · última compra S/ 48.00 el 7 nov ·
   Ver la historia del costo →». Sale de `fn_costo_de_la_prenda`, la misma función del Historial: las dos pantallas dicen el mismo número.
   El enlace abre el Historial directo en su pestaña «Costo» (`?ver=costo`).
2. **Cada talla gris lleva su «?»** (`<Ayuda>`) con su última compra: «Había 1 a S/ 45.00 y llegó 1 el 7 nov a S/ 48.00: el promedio de las 2
   es S/ 46.50.» La lee `fn_costo_de_las_tallas` (nueva). **La cuenta solo se muestra si termina en el costo que muestra la celda.** Si no
   (base sin la función, sin permiso o algo lo movió después), el «?» dice el porqué en palabras, como antes. Nunca afirma una cuenta que no da.
3. **«Cambiar en bloque» ofrece la última compra a las tallas escritas a mano:** «6 tallas aún no llegan por compra: su costo es el que se
   escribió a mano. [Usar S/ 48.00, el de la última compra]». Es lo mismo que «Cambiar el costo de Todas a 48»: las grises no se tocan, y se
   guarda con «Revisar y guardar».
4. **La columna de la derecha (Precio y Costo) va sin «S/» y en dos líneas si varía** («45» / «a 48»), como las celdas.

`fn_costo_de_las_tallas(p_producto_id)` devuelve, por variante, la última entrada efectiva de `fn_costo_historial_efectivo`:
- con la corrección de ADR-0515 aplicada;
- sin los cierres revertidos;
- con las dos líneas de una misma compra juntas.

Devuelve null si la cuenta no ve el dinero de compras.

DECIDÍ: mostrar el costo por talla (el promedio de cada una) más la cifra de la prenda arriba, y ofrecer la última compra a las tallas
escritas a mano con un botón.
DESCARTÉ: que al recibir mercadería las tallas que no llegaron tomen solas el costo nuevo. Una compra de la talla 28 no prueba lo que cuesta
la 32 (hay proveedores que cobran más las tallas grandes), y la base escribiría un costo que nadie confirmó en una variante sin compra.
DESCARTÉ también la versión sin función nueva (el «?» en palabras y el enlace al Historial): el Historial cuenta la prenda entera, no la
talla, y el caso del Short Sohanna se entiende solo con la cuenta de cada talla.
SE ROMPE SI: la persona usa el botón con una última compra que fue de una talla más cara que las demás: las tallas escritas a mano quedan con
ese costo. Lo mitiga que el botón dice el monto y que todo se ve en ámbar hasta «Revisar y guardar».

## Lo que no cambia

- **Ningún costo ni ninguna regla.** Una talla con compra sigue sin corregirse a mano, y una sin compra sigue editable.
- **Ni cómo se calcula el promedio ni las ventas ya hechas.** Las 3 ventas de octubre guardaron su costo de S/ 45.
- **Quien no ve el dinero no ve nada nuevo.**

## Producción

Una sola parte, re-ejecutable, sin políticas ni `drop trigger`. Se puede pegar antes o después de publicar la web: sin la función, la ficha
funciona igual, solo que el «?» explica en palabras. Verificación: `select to_regprocedure('retail.fn_costo_de_las_tallas(uuid)') is not null;`
→ `t`. Se deshace con `drop function if exists retail.fn_costo_de_las_tallas(uuid);`.

## Pruebas

- `pnpm pruebas:costo-de-las-tallas`: 7 casos contra Postgres. Cubre:
  - una talla con prenda de antes y otra sin nada;
  - dos facturas de una misma compra;
  - un cierre revertido;
  - una talla sin compras;
  - una cuenta sin permiso.

  Dos mutaciones de la función hacen fallar la prueba.
- `lib/costo-tallas-reglas.test.ts`: las frases, la línea de la prenda y la sugerencia contra «Cambiar en bloque», con el caso real.
- `lib/matriz-ficha-reglas.test.ts`: la columna en dos líneas.

## Actualización 2026-11-09 · Igualar las tallas sin stock en todas las prendas («Solo sin stock», Felipe)

Felipe pidió «esto realízalo para todos los productos». La pantalla ya sirve para todas las prendas. Lo nuevo es igualar en la base el costo
de las tallas que todavía no llegan por compra al de la última compra de su prenda, sin esperar a que alguien abra cada ficha.

Medido en producción el 2026-11-07 (solo lectura):
- **45 prendas** tienen al menos una compra.
- En **13** de ellas hay **60 tallas** sin compra con otro costo: 34 subirían, 26 bajarían y 16 están en S/ 0.
- **15 de esas 60 tienen stock** (30 prendas en tienda). Cambiarlas movería el valor del inventario en −S/ 79.28.

DECIDÍ (Felipe, entre tres): solo las tallas **sin stock**, con el script de una sola vez
`supabase/migrations/pegar-en-produccion-costo-declarado-ultima-compra-2026-11-09.sql`. Funciona así:
- Primero hace un ensayo («ENSAYO_OK» que deshace todo) y se aplica cambiando una línea.
- Guarda la foto de antes en `respaldo_purgas.filas` y sube la versión de cada prenda tocada (una ficha abierta desde antes no pisa el costo
  nuevo).
- Se detiene si ya se aplicó.
- Excluye las tallas con stock, las que están en un traslado en camino, las desactivadas y las prendas cuya última compra fue sin costo.

DESCARTÉ:
- Las 60 con stock: reescribe lo que cuestan 30 prendas que ya estaban en tienda y no llegaron en esa compra. Si su costo escrito era el
  real, se pierde.
- No tocar la base: cada prenda quedaba con su costo viejo hasta que alguien abriera su ficha y usara el botón.

SE ROMPE SI: una prenda tiene la última compra de una sola talla más cara que las demás (por ejemplo, la XL). Todas sus tallas sin compra
toman ese costo. El ensayo lista cada prenda con cuántas tallas cambian, para revisarlo antes de aplicar.
Las 15 tallas con stock quedan como están y se corrigen una por una en su ficha, si hace falta.
