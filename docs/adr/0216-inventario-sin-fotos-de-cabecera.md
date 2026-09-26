# ADR-0216 — Inventario pierde las fotos de cabecera y vuelve a la guía oficial

**Fecha:** 2026-09-26
**Estado:** Construido. `pnpm typecheck` y `eslint` limpios; el encabezado se miró en el navegador con las mismas
props que las pantallas reales (Existencias, detalle de Traslado, detalle y lista de Conteo).
**Afecta:** `apps/web/app/(app)/inventario/{page,mover,movimientos,resumen,traslados}`, `traslados/[id]/page.tsx`,
`components/ConteoVista.tsx`, `components/ConteoDetalleVista.tsx`. Se borran `components/InventarioHero.tsx` y ocho
archivos de `apps/web/public/` (`inventario-hero-*.webp`, `existencias-hero*.webp/.png`). No toca la base.
**Relacionado:** ADR-0169 (paleta y orden de pantalla), `components/ui/CabeceraPantalla.tsx`.

## Contexto

Inventario era el único módulo con foto en la cabecera (`InventarioHero`, 2026-09-22, pedido de Felipe: una foto por
pantalla, fundida por los cuatro bordes). El mismo día, la guía «CAYLA Dynamic» (ADR-0169) puso la regla contraria —
`CabeceraPantalla`: «directo sobre el crema, sin tarjeta alrededor, sin ilustración»— y borró el `ExistenciasHero`
anterior por eso. Las 13 pantallas restantes ya usaban `CabeceraPantalla`. Dos soluciones para el mismo problema.

## Decidí

Las 8 pantallas de Inventario usan `CabeceraPantalla`. Se borran el componente y las fotos.

## Descarté

- **Optimizar las fotos** (recortarlas a la franja real, ~35 KB): resuelve el peso pero no lo estético — seguirían
  siendo fotos genéricas de bodega, en tonos fríos, en el único módulo que las tiene.
- **Fotos reales del Taller y las sedes:** da identidad, pero rompe igual la guía y obliga a producir y mantener fotos.

## Números (medidos en archivos, no en tiempos de carga)

- 5 fotos de 270–333 KB (≈1.5 MB), de 1672×941 px, pintadas en una franja de ≈800×156 px: `bg-cover` mostraba cerca
  del 35 % de cada una. Más `existencias-hero.webp` (54 KB, la de «Mover») y dos huérfanas que nadie referenciaba
  (`existencias-hero-lima.webp` y `existencias-hero-taller.png`, ≈285 KB).
- La cabecera de Existencias pasa de ≈225 px de alto a ≈80 px: «Prioridades de hoy» sube a la vista.
- La lentitud NO era la razón principal: eran fondos CSS de alto fijo (no bloqueaban texto ni datos, sin salto de
  layout), el service worker las guardaba (`sw.js`, cache-first para `.webp`) y en celular el contenedor era
  `hidden md:block`. Lo que pese en Existencias es lo del servidor, no esto.

## Cómo quedó cada pantalla

- Sobretítulo `Inventario · <sección> · <sede>` en texto plano. El migajero con `›` y el color ámbar de Análisis, y el
  enlace «← Traslados» dentro del sobretítulo, dejaron de existir.
- «← Traslados» (detalle de traslado) pasa a botón secundario a la derecha, igual que «← Conteos» en el detalle de
  Conteo, que ya lo hacía.
- «Bajar al piso» pierde el `bg-papel` que necesitaba para leerse sobre la foto.
- La línea «Vista cargada a las …» de Existencias va como `children` de la cabecera.

## Se rompe si

- Alguien vuelve a poner una foto en una cabecera: el ADR-0169 y el comentario de `CabeceraPantalla` ya lo prohíben.
- Se agrega una pantalla de Inventario con `sobretitulo` en JSX: `CabeceraPantalla` lo recibe como `string`; un
  migajero con enlaces se resuelve con una acción a la derecha, no ensanchando el tipo.

## Actualización 2026-09-26 (tarde)

La cabecera de Inventario ya no es `CabeceraPantalla`: pasó a `EncabezadoPagina`, la de Caja, Historial y Posventa
(ADR-0220, pedido de Felipe). Lo que decidió este ADR sobre las fotos sigue en pie: ninguna cabecera lleva foto.
«← Traslados» y «← Conteos» siguen siendo botones, ahora bajo la frase.
