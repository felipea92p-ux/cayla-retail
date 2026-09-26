# ADR-0230 — Existencias decide con una sola regla de piso («Acción hoy»)

**Fecha:** 2026-09-26
**Estado:** En producción. PR #445 fusionado por Felipe el 2026-09-26 (merge `3b7dac06`, desplegado por Vercel). Su
migración `20260925170551_existencias_ritmo_reciente` ya estaba en producción antes del merge: consultada en vivo,
`retail.fn_ritmo_reciente_json` tiene el mismo cuerpo que el archivo (md5 de `prosrc` igual al de la base local).
**Escrito después del merge:** el PR no traía ADR. Su única constancia eran comentarios en el código
(«Felipe, tercera/cuarta ronda, 2026-09-25»); este documento la deja fuera del código.
**Reemplaza en parte:** ADR-0071 (el semáforo de cuatro estados y el umbral de «Reponer piso» en 7) y la línea de
ADR-0208 que decía que «Reponer» aparece con 7 o menos en el piso.
**Afecta:** `apps/web/lib/existencias-recomendaciones.ts`, `politica-operativa-inventario.ts`, `existencias-ritmo.ts`,
`existencias-ritmo-servidor.ts`, `existencias-filtros.ts`, `inventario-reglas.ts`, `inventario-v2.ts`,
`components/InventarioPanel.tsx`, `ReponerPisoModal.tsx`, `RitmoRecientePopover.tsx`, `RecomendacionesOverlay.tsx`,
`AnalisisCoberturaOverlay.tsx`, `app/(app)/inventario/page.tsx`.

## Contexto

Hasta el PR, tres reglas distintas decidían si una talla necesitaba algo, cada una con su número:

- El **semáforo** (ADR-0071): «Sin stock» (nada en piso ni almacén), «Stock bajo · pedir traslado» (10 o menos en
  el almacén), «Reponer piso» (7 o menos en el piso, con más de 10 en el almacén) y «Normal». La tarjeta
  «Reponer a piso hoy» contaba solo «Reponer piso».
- El **botón «Reponer»**, con su propia regla: 7 o menos en el piso y algo en el almacén.
- **«Ver recomendaciones»**, sobre el motor de Análisis (`planDeReposicion`, ritmo de 30 días): cantidades y
  «traer de otra sede».

Una fila podía decir «Stock bajo» con el botón «Reponer» al lado y otra cosa en «Ver recomendaciones».

## Decidí (lo que trajo el PR #445)

- **Una sola regla, `calcularAccionHoy`:** si lo LIBRE en el piso (neto de lo apartado) es `umbralStockPisoReposicion`
  o menos, la talla dice «Reponer a piso»; si no, «Sin acción». No mira el ritmo, la cobertura ni el almacén: el
  almacén solo agrega contexto («Sin stock en almacén», «Sin stock en almacén · 8 uds en camino»). La tarjeta, la
  columna, el filtro, el botón y «Ver recomendaciones» leen el mismo mapa (`accionHoyPorVariante`).
- **Los umbrales viven en `politica-operativa-inventario.ts`:** 4 unidades para reponer y 3 jornadas mínimas para medir
  el ritmo. Hay lugar para un número por sede (`OVERRIDES_POR_SEDE`), vacío a propósito: hoy todas usan el default.
- **CAYLA no sugiere cuánto reponer:** lo decide la vendedora. «Ver recomendaciones» lista qué reponer y por qué, sin
  cantidades.
- **Ritmo reciente y Cobertura piso** salen del ledger único (`fn_ritmo_reciente_json` sobre `fn_ledger_puntos`,
  ADR-0202): ventas de 7 días ÷ jornadas en que la talla estuvo en el piso. Solo informan, no disparan nada. Si la
  función falla, quedan en «N/D» con aviso y la acción se calcula igual (probado en local sin la función).
- **La tabla:** Stock actual (libre en piso / almacén, lo apartado debajo), Cobertura piso, Ritmo reciente, En camino,
  Acción hoy, En la red. Sale la barra «Distribución de stock»; sus enlaces suben a «Prioridades de hoy». El filtro
  Estado se parte en dos: Acción y Estado (dañado, por colgar).

## Lo que cambió al fusionarlo con `main` (2026-09-26)

- El aviso de «Retirar del piso» (D-41, llegó a `main` después del PR) preguntaba al semáforo borrado: ahora pregunta a
  `calcularAccionHoy` con la política de la sede. Avisa con 4 o menos, ya no con 7.
- «Stock actual» muestra lo libre. El PR dibujaba lo físico bajo una ayuda que decía «nunca lo apartado», y la tabla y
  el modal de Reponer daban dos cifras distintas para la misma percha.
- La prueba SQL del PR pedía dos personas no-admin en sedes distintas y la siembra estándar tiene una: se corrigió.

## Descarté (lo que el PR dejó atrás)

- **El umbral en 7 de ADR-0071.** El 16-09 se subió de 4 a 7 porque «con 4 el aviso llegaba tarde». La regla nueva usa
  4, pero con otra forma: antes el 7 solo contaba si el almacén tenía más de 10; ahora el 4 cuenta siempre. En Trujillo
  local la tarjeta pasa de 0 a 16 tallas: con la regla vieja todo caía en «Stock bajo» porque el almacén tiene de 3 a 5.
- **«Stock bajo · pedir traslado» y «Sin stock».** Existencias ya no dice cuándo pedir mercadería a otra sede. Esa
  pregunta queda solo en Análisis (`planDeReposicion`, sin cambios).
- **Cantidades sugeridas en «Ver recomendaciones».**

## Se rompe si

- El 4 vuelve a llegar tarde en una tienda que vende rápido (lo que pasó el 16-09): se corrige en la política, con el
  default o con un número para esa sede. Ningún componente lleva el umbral escrito.
- Una tienda vacía su almacén y nadie pide traslado: Existencias ya no lo avisa.
- Alguien vuelve a escribir un umbral en un componente en vez de leer la política: dos reglas otra vez.

## Queda abierto (decisión de Felipe)

- Dónde ve ahora la tienda que tiene que pedir un traslado (antes era el estado «Stock bajo»).
- Si el 4 se confirma después de usarlo en las tiendas, o vuelve a 7.
