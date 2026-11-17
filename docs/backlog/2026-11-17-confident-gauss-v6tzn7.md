# 2026-11-17 · El ERP en teléfonos de gama baja

Rama `claude/confident-gauss-v6tzn7`. Bitácora: `docs/bitacora/2026-11-17-confident-gauss-v6tzn7.md`. ADR-0674.
Alcance que eligió Felipe: Catálogo, Compras, Inventario y todo Ventas. La Fase 1 (5 actividades) está hecha; esto es lo que sigue.

## Esperan a Felipe

- [ ] **Reservar el ADR-0674** (`pnpm reservar adr` desde una máquina que pueda subir etiquetas): desde la nube el remoto respondió 403. El
  0673 lo tomó `claude/anular-comprobante-permisos` mientras se trabajaba.
- [ ] **Probar en un teléfono barato real** (Galaxy A05 / Redmi A3, ~S/ 350, por USB con Chrome DevTools): el emulador no frena la gráfica, así
  que la ganancia del modo liviano no se pudo medir aquí. Mirar: abrir una hoja, desplazar Existencias, cobrar en Vender, con y sin liviano.
- [ ] **Mover los umbrales del modo liviano con datos:** tras una semana publicada, `vercel logs --query tiempo_de_pantalla` con
  `select(.tactil == true)` agrupado por `ram`. Hoy es una apuesta (2 GB, o 4 GB táctil). Cambió la regla que Felipe aprobó en la pregunta
  («4 núcleos o menos» encendía todo iPhone y no los teléfonos baratos de 8 núcleos): ADR-0674, decisión 2.

## Fase 2 (aprobada la lista, sin empezar)

- [ ] **Que el ticket de Vender y la compra a medio registrar (Mis compras) no se pierdan** si Android cierra la pestaña por memoria: hoy el
  ticket en curso vive solo en la pantalla (`lib/version-nueva-reglas.ts:13`); se guardan los en espera y la cola. Revalidar stock y precio al
  recuperarlo, como `esperaAlCargar`. Toca Vender: con `/chaos`.
- [ ] **Partir el código de las pantallas pesadas:** modales bajo demanda en Caja (980 KB propios), Mis compras (887), Apartados (860), Vender
  (681), Existencias (668), Nuevo producto (505), Campañas (424), Recibir (417), Productos (403). GSAP de Vender solo con animaciones encendidas.
- [ ] **Recorrer las 21 pantallas a 375 px** y arreglar lo roto; PL-105 pasa a cubrir los cuatro módulos (ADR y la casilla del PR).

## Visto de paso

- [ ] **Abrir los Filtros de Productos en el celular tarda ~600–700 ms** con el procesador frenado 4 veces (medido local, `next dev`): es
  JavaScript de React, no dibujo. Mirarlo en la Fase 2.
- [ ] **CSS que se quedó global por el orden:** `tienda-web.css`, `tienda-web-conf.css`, `trafico.css` (los pisa `vidrio/tienda-web.css`),
  `estados-financieros.css` (`vidrio/estados.css`) y `vidrio/vitrinas-sedes.css` (`config-vistas.css`). Se pueden mover junto con su par.
- [ ] **~744 KB de CSS que alcanza el marco** (65 archivos: `finanzas.css`, `vidrio/estados.css`, `telar.css`, `analisis.css`…): moverlo es ver
  qué componente del marco lo arrastra, como se hizo con el buscador.
- [ ] **`RecordatorioCierreCaja`** (20 KB propios + 15 KB de CSS) se carga en todo el día y solo se ve al cierre: candidato a diferir, con
  cuidado porque vive en la cabecera.
- [ ] **No verificados a la vista** tras mover su CSS: el Inicio de almacén, el acompañante y la vista previa de campañas (los cubre
  `lib/css-por-pantalla.test.ts`). La estación de impresión encendida tampoco se probó.
