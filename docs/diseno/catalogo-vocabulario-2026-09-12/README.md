# Rediseño de navegación — Catálogo y vocabulario (Loro)

**Fecha:** 2026-09-12 · **Estado:** propuesta aprobada visualmente por Felipe, sin implementar en código todavía.
**Mockup interactivo:** https://claude.ai/code/artifact/d573e09e-dc1f-45ee-b396-f180986dff69

## El problema

`components/InventarioNav.tsx` mete 9 pestañas planas en una sola fila (Proveedores,
Compras, Recibir, Almacén, Catálogo, Conteo, Etiquetas, Importar, Vocabulario),
mezclando dos cosas distintas:

- **El vocabulario** — qué ES una prenda: categorías, colores, modelo/variante.
- **Los flujos operativos** — qué se HACE con una prenda: comprar, recibir, contar,
  etiquetar, importar.

Consecuencia real, ya documentada en `docs/datos/modulos/02-catalogo-y-vocabulario.md`
(hueco 1): "Vocabulario" —el lugar para agregar un color nuevo— queda en la posición 9
de 9, con el mismo peso visual que "Etiquetas". Nadie lo encuentra en tienda cuando
aparece un color fuera de los 30 del vocabulario cerrado (ya pasó con "Arena",
`0050_color_arena.sql`). Y hoy **no existe ninguna pantalla para crear un color** —
la base de datos literalmente le dice a la persona que vaya a un sitio que no existe.

## Lo que valida el rediseño

Comparado (con fuentes) contra tres sistemas reales del mismo dominio:

- **Shopify** separa por completo Productos/Variantes de Colecciones — qué es el
  catálogo vs. cómo se navega.
- **Square for Retail** usa categorías anidadas simples, cada una con su propia
  pantalla, sin pestañas compitiendo por espacio.
- **Faire** confirma la advertencia contraria: amontonar todo en una pantalla se paga
  carísimo en móvil.

## La propuesta

Dos niveles de navegación en vez de 9 pestañas planas:

1. **Catálogo** (el vocabulario — Loro): subtemas **Modelos** (drill-down a
   talla/color), **Categorías** (6 familias fijas → categorías con prefijo de 3
   letras) y **Colores** (grid de swatches + flujo real para agregar uno nuevo —
   resuelve el hueco 1 de la auditoría).
2. **Operación**: Proveedores, Compras, Recibir, Almacén, Conteo, Etiquetas,
   Importar — agrupados aparte, sin competir visualmente con el vocabulario.

## Archivos de este mockup

- `Main.dc.html` — artboard desktop (1440×900), arranca en Modelos.
- `Movil.dc.html` — artboard móvil (390×844), arranca en Colores, con la barra
  inferior de 5 pestañas real de la app.
- `canvas.json` — layout de los dos artboards en el editor de Claude Design.

Son archivos `.dc.html` del editor de mockups de Claude Design — **no son código de
la app** (no hay Next.js, no hay Supabase real, los datos son de ejemplo). Sirven
como referencia visual/interactiva de la dirección aprobada, no como fuente de
verdad para implementar: la implementación real debe partir de
`components/InventarioNav.tsx`, `components/InventarioAgrupado.tsx` y una pantalla
nueva para `colores` que hoy no existe, siguiendo la paleta y tokens reales de
`apps/web/app/globals.css`.

## Siguiente paso

No implementado todavía. Cuando se decida construirlo, la ruta natural es:
1. Dividir `InventarioNav` en el segmentado Catálogo/Operación.
2. Nueva pantalla `/inventario/colores` con el flujo de alta (hoy no existe ninguna).
3. Adaptar `InventarioAgrupado` para vivir bajo "Catálogo → Modelos" en vez de bajo
   "Catálogo" plano.
