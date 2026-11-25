# Auditoría al milímetro — Vender en el celular: la hoja del ticket y la fila de prenda · 2026-11-25 · `mobile-product-layout-7df00f`

Medido: la hoja del ticket (`components/PuntoDeVentaTicket.tsx` con `enHoja`, dentro de `<Modal variante="ticket">`) y la fila de prenda
(`components/punto-de-venta/LineaDelTicket.tsx`), en una página local de prueba que dibuja los componentes reales con prendas inventadas (tres
prendas, una con −10 %), sin base. Ancho 375 × 812 con dedo (claro quieto, oscuro quieto) y 1440 × 900 (claro vivo, para el escritorio). Medidores
del repo cargados enteros (`milimetro`, `espacio`, `tipografia`, `color`, `movimiento`, `textos` de `.claude/skills/*/referencia/medir.js`), con raíz
`[data-guia="vender.ticket"]`.

Resumen: **0 graves · 0 medias · 0 leves de esta rama** (1 media arreglada durante la auditoría: «En espera» se salía 5 px de su botón) · 2 heredados anotados abajo.

## Lo que cambió

1. En la hoja ya no está «Hoy N sin registrar». El pie es más bajo (Total a 36 px y 12 px de aire), «Descuento · Cupón» va en una fila y Responsable en línea.
2. «Dejar en espera» va junto a «Cobrar»: 86 × 56 px, la misma altura y la misma esquina. La cabecera queda en «Ticket» y la ×.
3. La fila de prenda es «controles a la vista» (maqueta 2, elegida por Felipe):
   - **Arriba:** miniatura de 48 px (`MiniaturaPrenda`), el nombre a 16 px seminegrita, el color y la talla a 14 px como piezas sin «·», y el precio.
   - **Abajo:** la cantidad (`PasoCantidad`, 44 px), el «%» de 44 px con borde de control y la papelera de 44 px.
   - **Con descuento:** `<Chip tono="rojo">` con «−10 % Motivo». El stock solo aparece si quedan pocas.

## Lo que dijeron los medidores

| Medidor | 375 claro | 375 oscuro | 1440 claro |
|---|---|---|---|
| Estados | 3 «apagados»: el «−» del paso de cantidad en 1 (la pieza `PasoCantidad`, no confirma nada: falso positivo); 0 bucles | igual | — |
| Espacio | 0 blancos bajo 44 con dedo; un 45,6 px es el `ml-auto` del Total (falso positivo); lo de 2/3/18 px es de piezas decididas | — | 0 fuera de escala |
| Tipografía | 0 lectura bajo 14 px; tamaños 13 · 14 · 16 · 18 · 21 · 36 | — | igual |
| Color | 30 textos, 0 fallas, 4 controles de vidrio sin falla | 0 fallas; APCA a mirar: la insignia «−10 %» 4,98:1 a 13 px (pasa AA; pieza `Chip`) | 36 textos, 0 fallas |
| Movimiento | quieto: 0 animaciones | — | vivo: 3 (velo 160 ms, el Total y el descuento se asientan 320 ms, `--ease-cayla`), 0 bucles |
| Textos | «En espera» cortado (5 px), **arreglado** con su relleno; «Quitar Blusa Emma» como Mayúscula de Título = nombre propio (falso positivo) | — | — |

## Heredados (no de esta rama)

- Los montos salen «S/89.90», sin el espacio que no se parte de ADR-0413, porque los arma `money()` en toda la pantalla de Vender.
- El foco con teclado de la × de la hoja no usa `outline`, sino el halo de las piezas decididas. Sin medir con `{ foco: true }`.

## Sin medir

- Con base y una cuenta real (`cayla-retail-dev-libre`): la página de prueba no tiene sesión.
- Una miniatura con foto real: todas las de la prueba son prendas sin foto, con su categoría sobre su color.
