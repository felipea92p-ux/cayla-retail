# 2026-11-16 · Lo que queda de los graves heredados de `/milimetro`

Rama `claude/graves-heredados-milimetro`. Informe: `docs/milimetro/auditorias/2026-11-16-graves-heredados.md`.

## Decididas por Felipe y hechas en esta rama («todo lo recomendado», 2026-11-16)

- [x] 1A · La página deja el alto de la cabecera (y de la mesa de Finanzas pegada); ~40 compensaciones a mano bajaron a su aire.
- [x] 2A · Filo de `borde-control` en la elegida del segmento, de las pestañas y del segmento de campo.
- [x] 3A · El buscador del mostrador con su borde.
- [x] 4A · En oscuro, la barra de la ventana de Tienda web más oscura («Abrir la tienda» 6,7:1).
- [x] 5B · La barra por tiempo sin cifra en gris con 36 % de tinta (3,26:1 claro, 6,0 oscuro).
- [x] 6A · El foco de `.fin-control` es el del sistema (borde de tinta y halo; anillo de 2 px con más contraste).
- [x] 7A · El aro de los puntos de color a 38–40 % (los peores, 3,3–3,9:1).

## Para Dynamic (se miran, no viajan solos)

- [ ] `vidrio/pantalla.css`, `vidrio/graficos-y-pasos.css`, `vidrio/campos-y-botones.css`, `vidrio/pantalla-en-vidrio.css`, `vidrio/tienda-web.css`:
  el filo de la elegida (2A), el foco de `.fin-control` (6A) y la barra de Tienda web (4A). Solo cambia cómo se ven; nada cambia cómo funcionan.

## Esperan una decisión de Felipe

- [ ] **El interruptor apagado** (`.interruptor` en `vidrio/campos-y-botones.css`): su aro es `borde-control` al 70 %; medido 1,11:1 de relleno en
  Inventario ▸ Cuadrar el piso. La perilla dice el estado, pero el contorno del control no llega a 3:1. Pieza decidida (ADR-0358, casilla).

## Sin decisión, para hacer

- [ ] **Las hojas con `pie-hoja-fijo`** (~130): desde 640 px nada aparta el foco del pie pegado. Medir primero con Tab en 3 hojas largas (Ajustar inventario,
  Registrar gasto, Proveedor); si se confirma, `scroll-margin-bottom` en los controles de la hoja (no `scroll-padding`: el pie es sticky).
- [ ] **Medidores:** que `/graficos` cuente la cifra escrita en la leyenda de al lado (los tramos de `BarraApilada` en Plan, Proveedores, Resumen de
  Finanzas y Plan del piso la llevan); que `/milimetro` (foco) lea el anillo de un ancestro con `:has` o del `::after` (Proveedores y Categorías sí
  lo dibujan, el medidor no lo ve) y recorra también hacia atrás; que `/color` salte un control `sr-only` y una `caja-cayla` que no se toca.
- [ ] `vidrio/catalogo.css`: borrar `.tarjeta-valor > button:focus-visible { outline-offset: … }`, que quedó sin efecto (el anillo ahora lo lleva la placa).
- [ ] `MovimientosCajaModal.tsx`: la fila de un movimiento dentro de la hoja recorta su anillo de foco por la izquierda: `-ml-1 pl-1` en su lista.
- [ ] La Grilla de Productos: el «+N» de los colores mide 24,9 × 24 con el dedo (no 44).
