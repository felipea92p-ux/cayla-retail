# ADR-0074 — La sugerencia de conteo ordena por valor en riesgo, no por ventas del mes

**Fecha:** 2026-09-17
**Estado:** Corregido en local, pendiente de que Felipe lo revise en navegador antes de commitear.
**Afecta:** `retail.fn_prioridad_conteo` (misma firma, `DROP` + `CREATE`), `lib/conteos.ts`,
`ConteoPanel.tsx`. Sin pantalla nueva — decisión explícita, ver "Descartado" abajo.

## Contexto

`retail.fn_prioridad_conteo` (migración `20260916110000_conteo_alcance_y_cadencia.sql`,
ya en producción) alimenta la sección "Conviene contar primero" de `/inventario/conteo`.
Ordenaba por `ventas_30d desc`: una prenda cara de baja rotación perdía siempre contra un
básico barato que vende mucho, aunque la prenda cara tuviera más plata parada en la
percha. Detectado auditando un documento externo que afirmaba (incorrectamente — ver
BITÁCORA 2026-09-17) que esto ya estaba resuelto.

## Especificación — qué significa exactamente "prioriza por plata en riesgo"

Esta es la parte que no puede quedar solo en el código: es la regla de negocio real.

```
valor_en_riesgo(variante, sede) = stock.cantidad × variantes.precio
```

Es cuánta plata hay parada en esa variante, en esa sede, ahora mismo — no cuánto se
vendió, no cuánto rota. Un descuadre en el conteo de una variante con `valor_en_riesgo`
alto cuesta más caro que uno en una variante barata, sin importar cuál se vende más.

**Orden de la sugerencia (dos criterios, en este orden — el primero no cambió):**
1. **Cobertura primero:** lo nunca contado en esa sede va antes que cualquier otra cosa
   (`dias_sin_contar is null`, vía `nulls first`) — cero confianza en ese número hasta
   que alguien lo cuenta por primera vez, sin importar cuánto valga.
2. **Dentro de eso, valor en riesgo descendente.** Antes era `ventas_30d descendente`.

**Qué NO es "plata en riesgo"** (para que quede escrito y no se reinterprete distinto en
el futuro): no es el valor vendido en el mes, no es el margen, no es el costo — es
cantidad física expuesta ahora × precio de venta. `ventas_30d` salió del resultado de la
función porque ya no ordena nada y no quedaba otro consumidor (verificado por grep).

## Decisión — todo en la misma pantalla, sin ventana nueva

Conversado explícitamente con Felipe: se descartó una pantalla separada tipo "Conteo por
plata en riesgo". Razón — **"alcance" y "prioridad" son dos ejes distintos, no una
jerarquía:** alcance (todo el catálogo / una categoría) decide QUÉ subconjunto mirar,
prioridad decide EN QUÉ ORDEN sugerirlo dentro de ese subconjunto. Plata en riesgo vive
en el eje de prioridad — es un arreglo a cómo ya se ordena la sugerencia existente, no un
tercer lugar a donde ir. Dos pantallas resolviendo "qué contar primero" de dos formas
distintas es el tipo de inconsistencia que después nadie sabe cuál confiar (si alguien
abre un conteo por la pantalla "de siempre" sin pasar por una pantalla paralela, vuelve a
contar a ciegas).

**Descartado:** una vista de reporte cross-sede para dirección ("cuánta plata sin contar
hay expuesta en las 3 sedes a la vez") — es una idea válida pero es un producto distinto
(monitoreo para líder, no una herramienta operativa de conteo) con dueño distinto.
Registrada aparte en `docs/BACKLOG.md` § Pendientes de Benja, no se construye ahora.

## No saturar la pantalla (pedido explícito de Felipe)

La fila de cada sugerencia sigue exactamente igual en estructura — un único renglón,
mismo layout de antes: identidad a la izquierda (referencia · talla · color), un solo
dato a la derecha. Se **reemplazó** "vende N/mes" por el valor (`money()`, ya existente
en el archivo) en vez de mostrar los dos — mostrar ambos habría sido más confuso, no más
útil (“¿por qué está primero si vende menos?”). El único texto nuevo es el título de la
sección, que ahora nombra el criterio: "Conviene contar primero (mayor plata en riesgo)".

## Se rompe si

Si `stock.cantidad` queda desactualizado respecto al piso real mientras hay un conteo
abierto sin cerrar, la sugerencia subestima el valor en riesgo de lo que ya se vendió mal
contado — mismo límite que ya tiene hoy todo el módulo de Inventario, no uno nuevo.

## Verificado

`tsc --noEmit`, `eslint`, `vitest run` (293/293) en verde. `supabase db reset` aplica
limpio (con `DROP` + `CREATE`, no `CREATE OR REPLACE`: Postgres no deja cambiar la forma
de lo que devuelve una función, SQLSTATE 42P13). En navegador, como Felipe (Tienda Lima):
"Todo el catálogo" mostró Casaca Ximena (S/1,079.40, nunca contada) primero; cambiar el
selector a "Solo Vestidos" refrescó correctamente a Vestido Sofía (S/899.40) — confirma
que tanto la carga inicial del servidor como el refetch por categoría del cliente usan el
criterio nuevo. Sin errores de consola atribuibles a este cambio (hay un error de React
preexistente en la misma pantalla, ajeno a `fn_prioridad_conteo` — confirmado por SQL
directo y derivado a otra sesión).
