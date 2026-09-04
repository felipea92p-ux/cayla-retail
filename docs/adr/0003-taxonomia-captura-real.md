# ADR-0003 — 5 categorías nuevas antes de capturar el catálogo real

**Fecha:** 2026-09-03
**Estado:** Migración escrita (`0030`), pendiente de correr en Supabase

## Contexto

El 19-jul-2026 se estudió el historial real de compras de CAYLA (SINATRA, ~2,368
filas) para ver si las 30 categorías "de manual" de `0009_categorias.sql` reflejan
lo que Cayla realmente vende. No calzan del todo: 412 compras de "Complementos"
resultaron ser mayormente bisutería (ya resuelto — bisutería es familia propia
desde el 17-jul), y cinco rubros con volumen real no tenían categoría propia:
Conjuntos (119 compras), Chalecos (66), Bodys (51), y Enterizos — hoy mezclado
dentro de "Vestidos & Enterizos" (108 compras combinadas) sin poder separarse.

Esta decisión quedó escrita en `docs/PLAN-DE-TRABAJO.md` §4 como pendiente de
aprobación y nunca se migró — no había urgencia mientras el catálogo real seguía
sin capturarse. Se retoma el 2026-09-03 al arrancar el Frente 1 (captura del
catálogo real, docs/PLAN-DE-TRABAJO.md §5): es el momento correcto, porque
agregar una categoría después de capturar cientos de prendas reales significa
re-taxonomizarlas una por una; agregarla antes es un `insert`.

## Decisión

Agregar 5 categorías a la familia `indumentaria` (ver `0030_categorias_captura_real.sql`):
Conjuntos, Enterizos, Chalecos, Bodys, Blazers/Sacos — con tallas sugeridas
propuestas por Claude (mismo patrón que categorías similares ya existentes:
XS-XXL para prendas de cuerpo completo, XS-XL para Bodys como Ropa
interior/Lencería) y aprobadas por Felipe sin ajustes.

No se tocó el esquema: `categorias.familia` ya permitía `'indumentaria'` desde
`0009`, así que es una migración puramente aditiva, sin `alter table`.

## Alternativas descartadas

- **Mantener las 30 categorías actuales.** Gana: nada que migrar hoy. Pierde:
  Enterizos sigue sin poder separarse de Vestidos, y Conjuntos/Chalecos/Bodys se
  forzarían dentro de categorías que no les quedan bien durante la captura real
  — el costo se paga después, multiplicado por cientos de prendas, no una vez.
- **Categorías sugeridas por catálogo genérico** (en vez de datos reales de
  compra). Ya se probó este camino el 17-jul con las tallas sugeridas y costó una
  hora de correcciones — la 0009 se corrigió antes de correr precisamente porque
  asumía rangos "de manual" en vez de preguntar qué vende Cayla. No se repite el
  error: las 5 categorías nuevas vienen de compras reales, no de intuición.

## Consecuencias

El catálogo real se puede empezar a capturar (Frente 1, §5 del plan) con una
taxonomía que ya refleja lo que Cayla vende, sin deuda de re-clasificación
pendiente. `tallas_sugeridas` queda como propuesta razonable, no como candado —
se puede ajustar después con un `update`, sin migración nueva, si en la práctica
alguna categoría necesita otro rango.
