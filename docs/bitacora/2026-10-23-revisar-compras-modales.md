## 2026-10-23 (Revisar compras: «Quién tiene plata» y «Entregas y devoluciones» en una hoja — ADR-0480)
Qué hice: en `/compras/fondos`, «Quién tiene plata» (las cifras de toda la empresa y la fila de cada persona, con «Registrar devolución» y «Registrar su pago») y «Entregas y devoluciones» (con «Anular») salen del pie de la pantalla y se abren en una hoja desde dos botones de la cabecera (`components/fondos/HojaDeFondos.tsx`). En la pantalla quedan la bandeja y las rendiciones por aprobar. La guía abre y cierra cada hoja; el auditor del tema tiene los dos escenarios nuevos y los de devolver, saldar y anular abren primero su hoja.
Por qué así: Felipe 2026-10-23, «el botón de quién tiene plata no funciona; que aparezca en un modal, para no cargar mucho la pantalla principal; Entregas y devoluciones también». El botón era un salto con ancla dentro del marco que se desplaza, y no llevaba a ninguna parte. Las tablas llegan armadas desde el servidor como contenido de la hoja: al guardar una acción de adentro, la pantalla se refresca y la hoja sigue abierta con lo nuevo.
Qué se rompería sin esto: la pantalla principal seguiría mezclando lo que espera a Compras con el registro de fondos, y «Quién tiene plata» seguiría sin hacer nada.
Estado: tipos, 594 archivos de vitest y Knip en verde. `guias:recorrer --guia compras.fondos`: 15 pasos. `tema:auditar` de las dos hojas, la de devolver y la de anular: 0 hallazgos en claro y oscuro, a 1440 y 375.

## 2026-10-23 (Revisar compras con el diseño «A · Bandeja serena»)
Qué hice: Felipe pidió diseños del módulo completo. Se dibujaron tres direcciones en un lienzo (https://claude.ai/artifact/3H2pxpS3JwxivgQyGztBTe) y eligió la A, que ahora sigue todo el módulo:
- **La bandeja:** las cifras llevan el total en soles y la lista tiene su cabecera.
- **El detalle de una compra:** la foto al lado de tres bloques («Cuadra», «Llegó todo», cómo se pagó) y «1 de 3».
- **Los detalles de plata, gasto y ronda:** la plata con avatar y fichas de cuenta, el gasto con su ícono y fichas de papel, y la ronda con su cuaderno.
- **«Quién tiene plata»:** una fila por persona con su barra.
- **«Entregas y devoluciones»:** agrupadas por día, con íconos.
- **«Entregar plata»:** fichas de persona y de cuenta.

Las piezas nuevas son `FichasCuenta` y la cabecera de `PanelDetalle` con monto, subtítulo y avatar. Lo que se guarda no cambió: las mismas llamadas a la base, validaciones e ids de la guía de foco.

Lo que quedó distinto del dibujo:
- **Las cifras:** son `TarjetaCifra` sin ícono, la pieza única.
- **La ronda cerrada:** muestra solo el renglón final, porque el cierre no trae lo que le dieron, compró y gastó.
- **«Rondas abiertas» y «por recibir» en Quién tiene plata:** no están, porque piden una lectura nueva en la base.
- **«¿Para qué?» en Entregar plata:** sigue obligatorio, porque la base lo exige.

Estado:
- vitest en verde (594 archivos) y Knip limpio.
- `guias:recorrer compras.fondos`: 16 pasos.
- `tema:auditar` de la pantalla y nueve escenarios (los dos de bandeja que faltan arriba, «Quién tiene plata», «Entregas y devoluciones», «Entregar plata», gasto, cierre, devolver y anular): 0 hallazgos en claro y en oscuro, con las capturas revisadas a 1440 y a 375.
