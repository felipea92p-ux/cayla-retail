# ADR-0029 — Retail no mira el flag `activa` de Dynamic

**Fecha:** 2026-09-10
**Estado:** Aceptado
**Decide:** Felipe, sobre la alternativa de escribir en la tabla de Dynamic

## Contexto

La tienda de Lima (`codigo = '003'`) figuraba en producción con `activo = false`, y aun
así aparecía en el selector de sede. El resultado era una sede **a medias**: se podía
uno parar en ella y vender, pero no cargarle un gasto ni un asiento contable, porque dos
pantallas de Finanzas filtraban por ese flag.

- `app/(app)/finanzas/egresos/page.tsx` — `filter(s => s.tipo !== "almacen" && s.activo)`
- `app/(app)/finanzas/registrar/page.tsx` — `filter(s => s.activo && [...].includes(s.tipo))`

Eso es exactamente el estado inconsistente que prohíbe el principio 2: una tienda donde
entra plata pero no se le puede registrar el alquiler.

Al rastrear el flag apareció lo que cambia la decisión. Desde la unificación,
`retail.sedes` no es una tabla sino una vista:

```sql
SELECT s.id, s.codigo, s.nombre, m.tipo, m.tienda_asociada_id, s.activa AS activo
  FROM sedes s JOIN retail.sede_meta m ON m.sede_id = s.id;
```

`activo` **es `public.sedes.activa`, la columna de Dynamic.** No es un flag de retail: es
el criterio de otro sistema, prestado. Y los dos criterios no coinciden — para CAYLA la
tienda de Lima está abierta y operando; para Dynamic figura inactiva.

Se verificó además que la base **no** bloquea nada por su cuenta: ninguna política RLS de
`retail` menciona `activ*`, y `retail.puede_operar_sede` tampoco. Los dos filtros de
JavaScript eran el único freno real, así que quitarlos alcanza — no queda un "no" del
servidor esperando más abajo.

## Alternativas consideradas

**A. `update public.sedes set activa = true where codigo = '003'`.** Una fila, reversible.
Descartada por Felipe: activa la tienda **en los dos sistemas**, y retail no debería
escribir en la tabla de la que solo es huésped para arreglar un problema propio.

**B. Columna propia (`operativa`) en `retail.sede_meta` + recrear la vista.** Es la forma
correcta de que retail tenga su propio criterio — `sede_meta` existe justamente para lo que
retail sabe de una sede y Dynamic no modela (ya guarda ahí su `tipo` y `tienda_asociada_id`).
Descartada **por ahora**: es un cambio de esquema en producción para un problema que hoy
tiene exactamente una fila y ninguna sede cerrada de verdad.

## Decisión

**Retail deja de filtrar por `activo`.** Las pantallas de Finanzas ofrecen las sedes por
`tipo`, igual que ya hacía el selector de sede del layout — un solo criterio en toda la app.

## Consecuencias

**Se gana:** la tienda de Lima queda entera — recibe gastos y asientos contables como
cualquier otra, sin tocar Dynamic y sin cambio de esquema.

**Se paga:** el día que se cierre una sede de verdad, seguirá apareciendo en esas pantallas.
La salida entonces **no** es volver a colgarse del flag de Dynamic, sino la alternativa B:
una columna propia en `retail.sede_meta`. Está escrito en los dos sitios del código, junto
al filtro, para que quien lo lea no reinvente la discusión.

El campo `activo` sigue viajando en el tipo `Sede` y `getSedes()` sigue exigiendo que no sea
nulo: eso es una guarda contra las columnas nullables de la vista puente, no un filtro de
negocio, y no cambia.

## Nota al margen (no se actuó)

Dynamic tiene una sexta sede, `OTRU` (Oficina TRU), que **nunca llega a retail** porque el
`JOIN` de la vista es interno y no existe su fila en `retail.sede_meta`. Si algún día esa
oficina debe existir en el ERP, el camino es insertarle su `sede_meta`, no tocar la vista.
También se vio que `003` tiene `ciudad = NULL` en Dynamic mientras AQP/LIM/TRU sí la tienen;
no afecta a retail (la etiqueta se deriva del nombre — ver `lib/etiqueta-sede.ts`), pero es
un hueco de datos del lado de Dynamic.
