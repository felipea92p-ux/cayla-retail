# ADR-0020 — `recalcular_stock()` calcula el neto antes de escribir

**Fecha:** 2026-09-09
**Estado:** aplicado y verificado en local; pendiente de pegar en producción
(`supabase/unificacion/25_recalcular_stock_neto.sql`)

## Contexto

`retail.recalcular_stock()` es lo que `docs/ARQUITECTURA.md` §4.2 describe como
la red de seguridad del inventario: "reconstruye `stock` completo desde
`movimientos`". Es la función que se corre el día que se sospecha que el
snapshot derivado se desincronizó de la fuente de verdad.

Se descubrió, sembrando datos de demostración en local, que **nunca pudo haber
funcionado en una base que tuviera al menos una venta**. Falla siempre con:

```
ERROR: new row for relation "stock" violates check constraint "stock_cantidad_no_negativa"
```

El cuerpo escribía en cuatro pasos (entradas, salidas, ajustes, traslados), y
el de salidas insertaba `-sum(cantidad)` confiando en que el
`on conflict (variante_id, sede_id) do update set cantidad = stock.cantidad +
excluded.cantidad` lo restara de la fila que el paso de entradas ya había
creado.

**Postgres no funciona así.** Los CHECK se evalúan sobre la fila *propuesta*,
antes de detectar el conflicto único. La fila negativa se rechaza antes de que
el `do update` llegue a existir. Reproducción mínima, sin nada del dominio:

```sql
create temp table t (a int primary key, b int check (b >= 0));
insert into t values (1, 5);
insert into t values (1, -3) on conflict (a) do update set b = t.b + excluded.b;
-- ERROR: violates check constraint "t_b_check", aunque el resultado seria 2
```

Nadie lo había notado porque nadie la corrió nunca con datos. Es la clase de
defecto que solo aparece el día que de verdad se necesita.

## Decisión

Calcular el **neto por (variante, sede) en una sola pasada** —con un `union all`
para la pata que recibe un traslado— y recién entonces escribir una vez. Así
nunca se propone una fila negativa.

Efecto de fondo: el CHECK deja de ser un obstáculo y vuelve a ser lo que debía
ser. Si el neto *sí* diera negativo, ahora la función falla contra ese CHECK —
que es el comportamiento correcto de una red de seguridad: gritar, no guardar
una mentira.

**Segundo arreglo, del mismo tamaño.** La versión vieja arrancaba con
`truncate table stock`, que además de las cantidades borraba `stock_minimo` (el
mínimo por sede que fija la RPC `fijar_stock_minimo`) y `contenedor_id`.
Ninguna de las dos se deriva de `movimientos`: reconstruir el stock las
destruía. Se corrige en la misma migración porque arreglar solo el error de
Postgres habría entregado algo peor que antes — una función que ahora sí corre
y borra en silencio los mínimos de cada sede. Antes no llegaba a hacer daño
porque no llegaba a terminar.

Ahora actualiza en vez de truncar (`on conflict do update` sobre el neto), y
solo borra filas de pares sin ningún movimiento: filas derivadas obsoletas, no
datos con historial.

## Consecuencias

- La red de seguridad del inventario existe de verdad por primera vez.
- `stock_minimo` y `contenedor_id` sobreviven a una reconstrucción.
- Verificado en local contra los datos de `supabase/seed-demo.sql`: reproduce
  exactamente el mismo stock que el seed calculó por su cuenta (14 filas, **0
  diferencias**), y un `stock_minimo` puesto a mano sobrevivió.
- **En producción está sin aplicar.** El archivo `unificacion/25` trae al final
  la verificación para correr después: que quede una sola función con ese
  nombre (lección de ADR-0004) y que reconstruir no mueva ni una unidad. Si esa
  segunda consulta devuelve algo distinto de 0, no es que el arreglo esté mal:
  es que `stock` y `movimientos` ya estaban desincronizados y la red de
  seguridad hizo su trabajo por primera vez.

## Lo que esto enseña, más allá del bug

Dos funciones distintas del núcleo (`fn_aplicar_movimiento` y esta) escriben
`stock` con la misma técnica de `on conflict do update` sumando deltas.
`fn_aplicar_movimiento` no tiene el problema porque aplica un movimiento a la
vez sobre una fila que bloquea con `for update`, y nunca propone un total
negativo. Vale tenerlo presente si alguna vez se escribe una tercera: el patrón
"inserto el delta y que el ON CONFLICT lo sume" es seguro solo mientras el
delta propuesto pase los CHECK por sí solo.
