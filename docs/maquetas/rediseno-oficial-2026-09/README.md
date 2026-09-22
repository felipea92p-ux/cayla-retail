# Rediseño con la paleta oficial CAYLA (2026-09-22)

Rediseño visual completo (color, tipografía, orden, estética) de las 15 pantallas ya
cubiertas en la Sala de Diseño, aplicando al pie de la letra la guía de estilo oficial
"CAYLA Dynamic" (ver el artefacto `Sala de Diseño CAYLA`, sección "Paleta oficial").

**No son propuestas nuevas de funcionalidad** — mismo contenido, mismos estados, mismas
reglas de negocio que ya están construidas o documentadas; lo que cambia es la piel
visual: paleta (11 tokens, con `hueso` y `pizarra` que antes no se usaban), radios por
función (control 8px / superficie 16px / flotante 20px / píldora 999px), 5 variantes de
botón, insignias de estado, tablas con zebra en `hueso`, y el ease de movimiento
`cubic-bezier(.22,1,.36,1)`.

## Cómo está armado

Un solo `cayla-oficial.css` compartido por los 15 HTML (a diferencia de los spikes
anteriores en `docs/maquetas/`, que son autocontenidos) — con 15 archivos habría sido
mucha duplicación para un solo cambio de tema. Cada HTML trae su propio botón "Ver en
oscuro" (toggle `data-tema` en `<body>`, ambos temas ya están retonados contra WCAG AA
en la guía oficial).

## Ventas (6 pantallas)

- `caja.html` — dashboard con caja abierta.
- `cambios.html` — landing + vista previa del paso "Reemplazo".
- `devoluciones.html` — landing + "Por aprobar" + motivo estructurado (ADR-0158).
- `facturacion.html` — vista Resumen. **Arregla la deuda pendiente de la BITÁCORA:** las
  tarjetas de vidrio con blur pasan a papel plano + borde `sand`, igual que el resto del
  sistema.
- `vender.html` — Punto de Venta (catálogo + ticket), no cubierto en la ronda anterior.
- `historial.html` — libro de ventas con línea de tiempo por día.

## Catálogo (3 pantallas, nuevas en esta ronda)

- `productos.html`, `categorias.html`, `atributos.html`.

## Inventario (5 pantallas, nuevas en esta ronda)

- `existencias.html`, `movimientos.html`, `traslados.html`, `conteo.html`, `analisis.html`.

## Inicio (1 pantalla, nueva en esta ronda)

- `inicio.html` — las 4 capas: Hoy/Tu día, Por atender, Ir a, Actividad reciente.

## Fidelidad de contenido

La estructura, los textos y los estados de cada pantalla se levantaron leyendo el
código real (`page.tsx` + componentes + `lib/*-reglas.ts`), no de memoria — igual que
en `cierre-de-venta-2026-09/`. Lo único que cambia acá es el estilo visual.
