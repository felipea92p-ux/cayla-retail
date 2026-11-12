# Auditoría al milímetro — /productos ▸ «Por completar» ▸ «Sin costo» · 2026-11-12 · claude/catalog-sin-costo-filter-f15815 (31590138d)
Medido: 1440×900 claro quieto · 375×812 claro (hoja «Filtros») · 1440×900 oscuro     Servidor: http://localhost:3010 (base local con 20261112155000)
Cuenta: líder del seed (ve el dinero de Compras). Con una terminal de tienda la opción no sale, como pide la regla.
Alcance: lo que cambia este PR, la opción «Sin costo» de la lista y la píldora puesta. Medido con `window.__milimetro = { raiz: '[role=listbox]' }`.
Resumen: 0 graves · 0 medias · 0 leves · 2 decididos a propósito

## Graves
Ninguno.

## Medias
Ninguna.

## Leves
Ninguna.

## Decidido a propósito
1. La pieza es `<DesplegablePildora>` (`components/ui/FiltrosPildora.tsx`), familia `filtro` decidida el 2026-10-13 (ADR-0358). La opción nueva entra
   por la misma lista (`faltasVisibles` → `opcionesConConteo`): no hay nada dibujado a mano. Medido: las cinco filas iguales, 39 px de alto
   (224 × 39 a 375 px), relleno 8/12 px, nombre en 15 px/400 tinta, conteo en 13 px tinta al 64 % con cifras tabulares; «Sin costo 362» igual que sus hermanas.
2. Elegida: `?falta=costo`, la píldora se rellena de tinta con «Por completar: Sin costo» y su ✕, «362 productos», y al reabrir la fila dice
   `aria-selected="true"` con su ✓ (no depende solo del color, WCAG 1.4.1). En oscuro, el medidor de color no marca ningún texto de la lista ni de la píldora.

## Sin medir
- El anillo de foco de la lista (`ul` con `aria-activedescendant`, sin `outline`): es de la pieza decidida y este PR no la toca. El medidor de color lo
  deja «medir a ojo». Si hay que revisarlo, es una auditoría de `filtro`, no de esta opción.
- Lo que los medidores de página encontraron fuera de la lista (botones «Ver todos los colores» bajo 24 px, letras de 10,5 px en «Grilla/Tabla», dos
  `:hover` sin `(hover: hover)` en `.barra-t` y `.parecidas-punto`) existía antes y no lo cambia este PR. Queda para una auditoría de `/productos` entera.
- Movimiento: la lista hereda el de la pieza; no se agregó ni quitó ninguno.
