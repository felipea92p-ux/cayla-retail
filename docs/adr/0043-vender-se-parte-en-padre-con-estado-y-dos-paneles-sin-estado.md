# ADR-0043 — Vender se parte en un padre con estado y dos paneles sin estado

**Fecha:** 2026-09-14
**Estado:** Aplicado en `main` (commits `556be89` y `ad1fa21`). Refactor puro: cero
cambios de comportamiento ni visuales, medidos (ver «Verificación»).
**Afecta:** `apps/web/components/PuntoDeVenta.tsx` (705 → 415 líneas),
`PuntoDeVentaTicket.tsx` (nuevo, 251) y `PuntoDeVentaCatalogo.tsx` (nuevo, 224).

## Contexto

Felipe va a abrir **dos ramas de trabajo en paralelo sobre Vender**, con dos sesiones
a la vez. La pantalla era un solo componente cliente de 705 líneas: 16 `useState`,
todos los handlers y todo el JSX (cabecera, catálogo, ticket y cuatro modales) en el
mismo archivo. Dos sesiones editando eso a la vez chocan en cada integración, y el
choque es en JSX — el peor tipo de conflicto para resolver a mano.

## Decisión

Se parte la pantalla en tres piezas con una regla simple: **el padre es dueño de
todo lo que cambia; los hijos solo pintan**.

- **`PuntoDeVenta.tsx` (padre)** conserva el 100 % del estado (`carrito`, búsqueda,
  categoría, método de pago, comprobante, DNI/nombre de la clienta, avisos, modales),
  los dos refs (`buscador`, `token` de idempotencia), los `useMemo` (categorías,
  catálogo filtrado, resultados de búsqueda) y todos los handlers (`agregar`,
  `quitar`, `actualizar`, `alTeclado`, `cobrar`…). También la cabecera («Venta en
  tienda · sede» + Abrir/Cerrar caja), el `<div aria-disabled>` que apaga todo con la
  caja cerrada, y los cuatro modales.
- **`PuntoDeVentaCatalogo.tsx`** devuelve el `<section>` izquierdo tal cual: título,
  botón Monto manual, campo de escaneo con su lista de resultados, aviso, chips de
  categoría, grilla de prendas y el desplegable «Ventas de hoy».
- **`PuntoDeVentaTicket.tsx`** devuelve el `<aside>` derecho tal cual: líneas del
  ticket, totales, método de pago, boleta/factura, documento de la clienta y Cobrar.

El contrato de props sigue la convención que ya usaba `ConsultaDocumento`:
**`valor` + `onValor`**, en español, sin sufijo `Change`; donde el handler es 1:1 el
padre pasa el setter directo (`onCategoria={setCategoria}`), donde compone varias
cosas el padre las compone (`onEscribir` = `setQ` + `setActivo(0)` + `setAviso(null)`).
Los hijos **no tienen hooks**: ni estado, ni `useMemo`, ni `memo()`, ni contexto.
Lo compartido (`money`, `ID_CARGO_ESPECIAL`, `VarianteBusqueda`, `ItemCarrito`) lo
exporta el padre y los hijos lo importan de ahí — los tipos se borran al compilar y
los dos valores solo se leen al renderizar, así que el ciclo padre↔hijo es inocuo
(ESM lo resuelve y el ESLint del repo no tiene `import/no-cycle`).

Se descartó: mover estado a los hijos (rompería la única fuente de verdad del
carrito), un contexto (esconde la costura que justamente se quiere ver), y agrupar
props en objetos (más estructura que movimiento, y 22 props planas se leen mejor
que 4 objetos cuando lo que importa es ver el contrato completo de un vistazo).

## Consecuencias — cómo se trabaja en paralelo sobre esta costura

1. Sesión A es dueña de `PuntoDeVentaCatalogo.tsx`; sesión B de
   `PuntoDeVentaTicket.tsx`. Ninguna abre el archivo de la otra.
2. `PuntoDeVenta.tsx` es zona compartida. Lo que cada sesión necesite ahí (un estado,
   un handler, una prop nueva) va en **commits chicos, separados de la UI, y a `main`
   apenas compilan** — así el choque, si aparece, son 3 líneas de props, no 150 de JSX.
3. Una sola base local para las dos sesiones: si una rama necesita migración, es la
   única que corre `supabase db reset`, y avisa antes.
4. `BITACORA.md` / `BACKLOG.md`: cada sesión agrega su bloque, nunca reescribe el de
   la otra; al integrar se conservan ambos.
5. Integración: la primera rama que termina entra a `main`; la segunda hace
   `git merge main` en su worktree y resuelve la costura ahí, antes de entrar.

## Verificación (lo que se midió, no lo que se supuso)

- **`renderToString`** de la versión original (`e3c92ff`) y de la final, con las
  mismas props, caja abierta y caja cerrada: **byte a byte idéntico**, ids de
  `useId()` incluidos. Ese era el único riesgo real de meter componentes intermedios:
  React deriva esos ids de las bifurcaciones del árbol, y un componente con un solo
  hijo no agrega ninguna — confirmado en la práctica, no solo en la teoría.
- **HTML del servidor para `/vender`** (fetch con sesión, dev local): 33 960 bytes y
  el mismo sha256 antes y después del primer corte.
- **DOM en cliente** tras el primer corte: idéntico salvo el contador global de
  `useId` (`_r_2_` vs `_r_0_`), que avanza por la carga, no por el árbol.
- **Interacciones por las props nuevas**: agregar prenda, ±cantidad, método de pago,
  Factura apaga Cobrar, Boleta lo enciende, Quitar vacía — idénticas al original.
- `tsc` y `eslint` limpios; 95/95 tests; pre-commit en verde en ambos commits.
