---
name: skill-analisis-arboles-decision
description: Evalúa la complejidad y eficiencia de la lógica condicional (árboles de decisión) de un archivo, módulo o de todo `apps/web/lib` — profundidad excesiva, escaleras if/else-if, condiciones reevaluadas, falta de poda anticipada (early exit) — y propone el aplanado concreto (guardas, tabla de decisión, condición nombrada). Úsala al tocar o revisar un `*-reglas.ts`, una función con muchos `if`, o cuando Felipe pregunte por qué una regla es difícil de seguir o de probar. Mide FORMA (mantenimiento y corrección), no milisegundos.
---

Analiza la lógica condicional de: $ARGUMENTS   (un archivo, un módulo como `frescura`, o `todo`)

**Regla madre:** con 3 tiendas y 1 taller, evaluar 40 reglas cuesta microsegundos. **No se propone un refactor «para que sea más rápido».**
El único argumento válido es *corrección y mantenimiento*: una escalera de 12 `else if` es donde nace el caso que nadie probó. Si la
única ganancia que puedes nombrar es velocidad de CPU, no hay hallazgo (Jeff Dean: sin número no hay decisión de rendimiento).
Solo analizas y propones; ejecutar es un paso aparte que Felipe ordena. Fundamento: `docs/investigacion/2026-10-03-arboles-ux-observabilidad.md`.

## Paso 1 — Medir (el escáner decide qué mirar, no tu olfato)

```bash
node scripts/rendimiento/arboles.mjs --archivo lib/<x>.ts      # un archivo
node scripts/rendimiento/arboles.mjs --dir apps/web/lib --top 20   # el ranking del módulo o de todo
```

Por función da: **CC** (complejidad ciclomática), **prof** (anidamiento de control), **escalera** (largo de la cadena `if/else if`) y
banderas: `compleja` (CC ≥ 15) · `profunda` (≥ 4 niveles) · `escalera` (≥ 5 eslabones → candidata a tabla) · `reevalua` (la misma
condición dos o más veces) · `sin-guardas` (CC ≥ 10 y ni un `if (…) return` de primer nivel) · `else-sobra` · `ternario-anidado`.
Es AST pero no sabe de negocio: **cada bandera se confirma leyendo la función** antes de entrar al informe.

## Paso 2 — Diagnóstico por función (lee el código, luego clasifica)

| Síntoma | Pregunta que lo confirma | Cura |
|---|---|---|
| `profunda` | ¿Se puede descartar el caso raro/inválido ANTES de entrar al camino feliz? | **Cláusulas de guarda**: `if (!x) return …` arriba; el camino feliz queda sin sangría |
| `escalera` | ¿Cada eslabón compara el mismo sujeto con un valor/umbral distinto? | **Tabla de decisión**: `[{ cuando, entonces }]` ordenada, recorrida con `find` (Torvalds: que el caso borde deje de ser caso borde) |
| `reevalua` | ¿La condición repetida es la misma *regla de negocio* o coincidencia? | Calcular una vez, **nombrarla** (`const esPrendaQuieta = …`) y que las ramas la lean |
| `sin-guardas` | ¿Qué entradas son imposibles o triviales? | Poda anticipada: salir temprano, no al final de un `else` gigante |
| `else-sobra` | ¿La rama `if` ya termina en `return`/`throw`? | Quitar el `else` y aplanar |
| `ternario-anidado` | ¿Se lee en voz alta sin perderse? | Sacar a función con nombre o tabla |

**Reordenar por frecuencia** (la condición que casi siempre decide, primero) **solo se propone con datos reales de qué rama se ejecuta**.
Hoy no hay cómo medirlo (ver `/skill-evaluacion-observabilidad`): dilo en vez de adivinar.

## Paso 3 — Lo que el escáner no ve (decláralo siempre)

- **Las RPC de Postgres.** El árbol real del cobro y de varios movimientos vive en `supabase/migrations/*.sql`, no en TypeScript. Si la
  función de la UI solo llama una RPC, el árbol está allá: léelo antes de opinar.
- **Pruebas:** un refactor de árbol solo es seguro si el `.test.ts` de al lado recorre cada rama. Antes de proponer aplanar, comprueba
  que la prueba cubre todas las salidas; si no, **el primer paso del refactor es escribir esa prueba** (Kent Beck: primero el terreno).
- **La regla escrita en una decisión (D-nn / ADR):** una cascada con un orden raro puede ser un orden de negocio. Busca con
  `grep -rn "<término>" docs/datos/DECISIONES-*.md docs/adr` antes de reordenar.

## Paso 4 — Informe (formato fijo)

Por cada función confirmada, máximo 12 en total, ordenadas por puntaje:

```
### <función> — <archivo:línea>   CC <n> · prof <n> · escalera <n>
- Problema (con la bandera y la línea):
- Refactor concreto: <el código resultante en 5–15 líneas, o la tabla>
- Prueba que lo protege: <cuál existe / cuál falta>
- Riesgo: <qué cambiaría de comportamiento si se hace mal>
- Ganancia: mantenimiento | corrección | (velocidad: solo si hay medición)
```

Cierra con los tres movimientos del criterio: el trabajo, **la objeción** (qué de lo pedido no vale la pena) y **lo que no pidió** (lo de
mayor consecuencia que apareció). Y las tres líneas QUÉ HICE / POR QUÉ ASÍ / QUÉ SE ROMPERÍA SIN ESTO.

**No hagas:** reordenar sin frecuencia medida · «optimizar» una regla con volumen de 3 tiendas · fusionar dos `*-reglas.ts` (principio 3,
piezas pequeñas) · tocar `productos/variantes/stock/movimientos` (núcleo estable, principio 1).
