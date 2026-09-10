# ADR-0016 — El Taller entrega al almacén interno, y `producciones` jubila a `ordenes_produccion`

**Fecha:** 2026-09-05
**Estado:** Propuesto — la primera mitad la decidió Felipe (2026-09-05: "lo
terminado en el Taller SÍ debe pasar por el almacén interno, con su propio bajar
a piso"); este ADR documenta el cómo y cierra el pendiente que ADR-0004 dejó
abierto.

## Contexto

**El almacén interno ya existe, y el Taller ya tiene el suyo.**
`retail.contenedores` tiene 4 filas, todas `tipo='almacen'`, una por sede —
incluida **LIM, que es el Taller** (`join` de `contenedores` con `public.sedes` y
`retail.sede_meta`). Existen `retail.stock_almacen`, `bajar_a_piso(p_sede_id,
p_variante_id, p_cantidad, p_nota)` y `devolver_a_almacen(...)`. La
infraestructura de la `unificacion/12` está completa y aplicada.

**Lo que la esquiva es el cierre de producción.** El cuerpo real de
`retail.cerrar_produccion` en producción —y el archivo del repo que lo define,
`supabase/migrations/0029_orden_produccion.sql:143-147`— termina así:

```sql
insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, nota)
  values (v_linea.variante_id, v_prod.unidad_id, 'entrada', v_linea.cantidad,
          'Producción del taller', v_persona_id, 'Orden ' || left(p_produccion_id::text, 8))
  returning id into v_mov_id;
perform fn_aplicar_movimiento(v_mov_id);
```

Sin `contenedor_id`. Verificado además con `pg_get_functiondef(...) ~*
'contenedor'`: false en `cerrar_produccion`, true en `recibir_lote`,
`bajar_a_piso` y `fn_aplicar_movimiento`. Como la rama de almacén de
`fn_aplicar_movimiento` se activa por `contenedor_id`
(`unificacion/12_almacen_interno.sql:170`), **lo terminado en el Taller aterriza
directo en el piso de venta**, saltándose el paso que toda la mercadería
comprada sí respeta. Es la única entrada de inventario del sistema que no pasa
por el almacén.

**El modelo viejo de Producción está vacío y todavía cuelga.** `select count(*)
from retail.ordenes_produccion` → **0 filas**; `retail.producciones` → 2.
Jubilar el modelo viejo no cuesta ningún dato. Los restos:
`RecibirLoteForm.tsx:236` manda `p_orden_produccion_id`, parámetro que la firma
real de producción no acepta (`recibir_lote(p_sede_id, p_origen, p_items,
p_proveedor, p_numero_guia, p_nota, p_orden_compra_id)`) — hoy es código muerto
inalcanzable, porque el select que lo llena está detrás de
`produccionesPendientes.length > 0` y `produccionesPendientes` está fijado a `[]`
a propósito en `inventario/recibir/page.tsx:55`, con un comentario de ocho
líneas explicando por qué. Y `retail.lotes` no tiene ninguna columna de vínculo
con producción (`id, sede_id, origen, proveedor, numero_guia, fecha_recepcion,
recibido_por, nota, created_at, proveedor_id, orden_compra_id`).

## Decisión

**DECIDÍ: `cerrar_produccion` entrega al contenedor de almacén de su propia
unidad, y `ordenes_produccion` se jubila sin borrarse.**

1. `cerrar_produccion` resuelve el contenedor `tipo='almacen'` de
   `v_prod.unidad_id` y lo pasa en el `insert into movimientos`. **Si esa unidad
   no tiene almacén, la función falla con un mensaje claro** ("Esta unidad no
   tiene almacén configurado") en vez de degradar al piso en silencio. La prenda
   terminada aparece en el almacén de LIM y se vende recién después de "bajar a
   piso", que ya existe y no se duplica.
2. En el mismo paso, el `motivo` deja de ser el texto libre `'Producción del
   taller'` y pasa a ser un valor estructurado, como ya lo son los de salida
   (`MOTIVOS_SALIDA` en `packages/shared/src/enums.ts:23`) — hoy ese texto es lo
   único que distingue una entrada de producción de una recepción de proveedor,
   y no lo puede filtrar ninguna consulta con confianza.
3. `alter table retail.ordenes_produccion rename to
   zz_obsoleto_ordenes_produccion` — **nunca `drop`** (CLAUDE.md: no se borran
   datos, y aunque hoy sean 0 filas, la regla no tiene excepciones por
   conveniencia). Se borra el `p_orden_produccion_id` muerto de
   `RecibirLoteForm.tsx:236` y las consultas que quedaron apuntando al modelo
   viejo en `inventario/recibir/page.tsx`.

**DESCARTÉ: dejar la entrega directa al piso y documentarla como excepción del
Taller.** Cuesta cero hoy y cuesta el principio: `stock_almacen` deja de
significar "todo lo que llegó y todavía no está a la venta", y la pregunta
"¿cuánto tengo sin exhibir?" pasa a tener una respuesta distinta según si la
prenda vino comprada o producida. Es exactamente el caso especial que hay que
eliminar, no el que hay que documentar.

**DESCARTÉ también: agregar `lotes.produccion_id` para modelar "recibí un lote
que produjo el Taller".** Cuesta una columna, una FK y un concepto nuevo para
expresar algo que el sistema ya sabe expresar: lo que sale del Taller hacia una
tienda es un **traslado entre sedes**, que ya existe en `movimientos` con
`sede_destino_id` y su política de visibilidad (ADR-0001). Un lote es lo que
entra a la red desde afuera; una producción entra por LIM y después se mueve
adentro.

**SE ROMPE SI: el cambio de RPC sale sin la pantalla del almacén de LIM en el
mismo paso.** Es el lunes en que el Taller cierra una producción de 80
enterizos: las prendas quedan invisibles para la venta —están en
`stock_almacen`, que la caja no mira—, el Taller reporta que "el sistema se comió
la producción", y la reacción de las próximas dos horas va a ser volver a la
entrega directa al piso, con lo cual el arreglo se pierde y además queda mal
visto. Migración y pantalla salen juntas, o no salen.

## Lo que decide Felipe

El punto 3 deja una pregunta abierta que es de negocio: **cuando el Taller manda
prendas terminadas a Trujillo, ¿eso es un traslado entre sedes o una recepción
de mercadería en la tienda?** Recomiendo traslado (la mercadería ya está en la
red, ya tiene costo, ya se contó una vez), y `recibir_lote` con `origen='taller'`
queda solo como historia. Si no hay respuesta, ejecuto traslado.

## Consecuencias

El Taller pasa a operar como cualquier otra unidad: recibe en su almacén, baja a
piso lo que corresponde, y lo que manda afuera es un traslado.
`zz_obsoleto_ordenes_produccion` deja constancia de que el modelo existió, sin
que nadie lo confunda con el vigente. Y la fila que `cerrar_produccion` escribe
pasa a decir de dónde salió la prenda con un valor que una consulta puede
filtrar, que es la condición para que el costo de producción llegue algún día al
Flujo de Efectivo (ver ADR-0014, "Consecuencias").

Aquí también deja de ser inerte la tercera cláusula de
`retail.puede_operar_sede` que ADR-0012 repone (`... or exists (select 1 from
retail.sedes where id = p_sede_id and tienda_asociada_id =
public.fn_sede_actual_persona())`): hoy las 5 sedes tienen `tienda_asociada_id`
NULL, y es justo el día que el almacén del Taller sea operado por alguien de
otra unidad cuando esa cláusula empieza a hacer falta.
