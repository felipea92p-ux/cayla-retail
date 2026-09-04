# ADR-0006 — `patrimonio_items.categoria` nunca se propagó a producción

**Fecha:** 2026-09-04
**Estado:** Migración escrita (`supabase/unificacion/15_patrimonio_categoria.sql`), pendiente de pegar en producción

## Contexto

Regenerando `packages/database/src/types.ts` contra el proyecto correcto para
poder comitear el almacén interno, el generador reveló que
`retail.patrimonio_items` no tiene columna `categoria` — solo `id`, `nombre`,
`tipo`, `monto`, `nota`, `created_at`, `updated_at`. `PatrimonioEditor.tsx`
(la pantalla donde Felipe registra sus muebles, equipos, cuentas bancarias y
deudas) inserta `categoria` en cada fila; `lib/finanzas-nucleo.ts:getPatrimonio`
la selecciona.

Mismo patrón que ADR-0004 (`recibir_lote`): la migración local `0013` creó
`patrimonio_items` en julio, la `0019` (posterior, "mi IME debe estar bien
categorizado") le agregó `categoria` — pero el script de unificación
(`supabase/unificacion/06_contabilidad_produccion.sql`) copió la tabla desde
la versión de la `0013`, antes de que `categoria` existiera. Nadie lo notó
porque no hay una prueba automatizada que ejercite `PatrimonioEditor` contra
producción (ver el ítem de cobertura de tests en `docs/BACKLOG.md`).

## Decisión

Escribir `supabase/unificacion/15_patrimonio_categoria.sql`
(`alter table retail.patrimonio_items add column if not exists categoria
text;`) para que Felipe lo pegue en el SQL Editor de producción, y mientras
tanto corregir `packages/database/src/types.ts` a mano para que SÍ incluya
`categoria` en `patrimonio_items` — reflejando lo que la tabla **debe** ser
(igual que el esquema local), no lo que hoy es en producción. La alternativa
— dejar el tipo sin `categoria` hasta que Felipe corra el `alter table` — deja
`next build` roto (el código real necesita ese campo) por algo que se
resuelve con una sola línea de SQL.

## Alternativas descartadas

- **Quitar `categoria` del código para que coincida con producción hoy.**
  Se descartó: sería ocultar el bug real (la categorización de patrimonio ya
  no funcionaría en absoluto) en vez de corregirlo, y perdería una función que
  Felipe pidió explícitamente ("mi IME debe estar bien categorizado").
- **Esperar a que Felipe corra el `alter table` antes de tocar nada de
  código.** Habría dejado bloqueado el build (y por lo tanto el deploy de
  facturación electrónica y almacén interno, que no tienen nada que ver con
  este hallazgo) hasta que se coordinara esa sesión aparte.

## Consecuencias

`next build` vuelve a pasar. **Pendiente de acción de Felipe**: pegar
`15_patrimonio_categoria.sql` en el SQL Editor de producción (prefijo
`retail.` ya incluido en el archivo). Hasta que eso pase, cualquier intento
real de agregar un ítem de patrimonio con categoría seguirá fallando en
producción — el código ahora compila, pero el bug de producción sigue vivo
hasta que se corra el SQL.
