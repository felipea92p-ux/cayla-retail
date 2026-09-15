# 0055 — Subcategoría opcional, un solo nivel, familia heredada del padre

**Fecha:** 2026-09-15
**Estado:** aceptado
**Numeración:** nació como 0053; chocaba con F1 (fotos/temporada, se quedó con 0053) y
F2 (colores, pasó a 0054) — renumerado a 0055 al integrar (F5, 2026-09-15), mismo patrón
que el choque de ADR-0051 de la ronda anterior.

## Contexto

`retail.categorias` era un solo nivel plano dentro de cada una de las 6 familias
fijas (`indumentaria`, `calzado`, ...). Para catálogos que crecen (ej. "Vestidos"
con variantes de "Vestidos largos", "Vestidos cortos", "Vestidos de fiesta") hacía
falta un nivel más fino de agrupación sin reabrir el problema que familia ya
resuelve (un agrupador de primer nivel fijo y cerrado).

## Decisión

- `categorias.categoria_padre_id uuid references categorias(id)`, nullable,
  default `null` — opt-in real: una categoría sin hijas no cambia en nada.
- **Un solo nivel, candado real en la base** (`retail.fn_valida_categoria_subcategoria`,
  trigger `before insert or update`): una categoría que ya tiene padre no puede a
  su vez ser padre, y una categoría que ya tiene hijas no puede convertirse en
  hija. No se confía en que el cliente (esta pantalla, Studio, o una futura)
  mande siempre un valor válido — principio 2 de CLAUDE.md.
- **La familia de una hija siempre es la del padre**, re-derivada por el mismo
  trigger en cada insert/update. Sin esto, una hija podría vivir en una sección
  de familia distinta a la de su padre en la pantalla que agrupa por familia
  (`CategoriasLista.tsx`), separados visualmente sin ninguna razón de negocio.
- `categorias.notas text`, nullable — notas internas, nunca mostradas a la
  clienta.
- No se tocó `familia`: sigue siendo el agrupador fijo de primer nivel: la
  subcategoría es un nivel ADICIONAL por debajo de categoría, no un reemplazo.

## Alternativas descartadas

- **Árbol sin límite de profundidad** (`categoria_padre_id` sin candado): más
  flexible en el papel, pero el negocio real de CAYLA no necesita más de un
  nivel bajo categoría, y un árbol sin límite es la clase de estado que
  "cero estados inconsistentes" (principio 2) prohíbe construir "por si acaso".
- **Tabla `subcategorias` aparte**, en vez de self-FK sobre `categorias`: hubiera
  duplicado familia/prefijo/nombre-único/activo/notas — la subcategoría ES una
  categoría en todo excepto en que tiene un padre. Reutilizar la misma tabla con
  un candado de profundidad evita esa duplicación (principio 3 y 6).

## Consecuencia

Migración `20260915224501_categorias_subcategoria.sql` (renombrada de `...224500` al
integrar — chocaba con la migración de F1, mismo timestamp exacto; contenido intacto).
`retail.actualizar_categoria`
pasó de 4 a 5 argumentos (se agregó `p_notas`) — la firma vieja se dropea
explícitamente en la misma migración para no dejar dos overloads ambiguos.
