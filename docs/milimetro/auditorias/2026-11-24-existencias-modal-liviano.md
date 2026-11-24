# Auditoría al milímetro — Existencias: el modal de la prenda, más liviano · 2026-11-24 · `claude/existencias-modal-liviano`

Medido: el modal de la prenda (`PanelTalla.tsx`) abierto sobre `/inventario` en las vistas «Esta talla» y «Todas», a 1440 × 900 claro y vivo,
375 × 812 claro, 1440 oscuro y 1440 quieto. Medidores del repo cargados enteros en la página (`milimetro`, con y sin `foco`; `espacio`,
`tipografia`, `color`, `movimiento`, `textos`), con la hoja (`[data-variante]`) como raíz. Servidor de la rama contra un banco Supabase propio con
el seed (cuenta Líder en Tienda Lima, prenda «Blusa Emma», piso en pausa).

Resumen: **1 grave · 0 medias · 0 leves de esta rama, arreglado** · 3 heredados anotados abajo.

## Hallazgos de esta rama

| # | Severidad | Qué · dónde | Medido | Regla | Estado |
|---|---|---|---|---|---|
| 1 | Grave | El detalle de cada fila de «También puedes» («Con adelanto, en Vender») en `text-tenue` a 14 px sobre el vidrio | 4,26:1 (rango 4,26–4,56 con la imagen de atrás) | `[Norma]` WCAG 1.4.3 (AA 4,5:1) | Arreglado: `text-secundario`. Medido de nuevo: 0 textos bajo AA en claro y en oscuro |

## Lo que pasó limpio

- **Foco:** 18 controles en «Esta talla» y 16 en «Todas», todos con anillo, ninguno tapado (`milimetro` con `foco: true`).
- **Texto:** 0 lecturas bajo 14 px, 0 etiquetas bajo el piso, 0 líneas de más de 80, 0 montos partibles (`tipografia`, `textos`).
- **Espacio:** 0 blancos bajo 24 px, 0 valores fuera de la escala (`espacio`).
- **Quieto:** con el movimiento apagado, 0 animaciones vivas en la hoja (`movimiento`).
- **Sin «·» de separador** en lo que se ve (Felipe 2026-11-24): también corregidos el chip del paso a paso («Beige» + «Talla S»), la línea del
  filtro de «Todas» y la celda «falta, +N atrás». Quedan solo en el modo «Ajustar stock» (planilla de ADR-0494, fuera de este rediseño).

## Heredados (no son de esta rama)

- **El borde de los puntos de color** («Beige» 1,1:1, «Negro» en oscuro 1,39:1, contra 3:1 de WCAG 1.4.11): el color de la prenda es dato y el
  elegido lleva el anillo de tinta. Ya estaba antes; si se quiere un filo, es `/unificar` (familia del punto de color).
- **Las pestañas «Esta talla / Todas»** cambian solo de color al elegirse: pieza decidida (`<Pestanas>`, ADR-0358), con su filo de
  `borde-control`.
- **Animaciones de más de 500 ms**: el lápiz y la luz de la banda de Ajustar (excepción de ADR-0494) y el fondo Seda (marco); los bucles
  medidos son de las tarjetas de la pantalla de atrás, no del modal.

## Sin medir

- Las cifras tabulares: el banco usó una letra de reemplazo para `@fontsource-variable/inter` (no instalada en el worktree), así que el medidor
  de cifras no vale aquí. Lo cuida `lib/letra-cifras.test.ts`.
- Con el dedo (44 px): el medidor de espacio no lo mide con puntero fino; se revisó a ojo y con el medidor de la maqueta a 375 px.
