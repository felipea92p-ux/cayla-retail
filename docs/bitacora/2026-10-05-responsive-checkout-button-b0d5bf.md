## 2026-10-05 (La hoja de cobro se ajusta a cualquier pantalla: «Confirmar cobro» ya no queda bajo el pliegue — ADR-0307 act. 8)
Qué hice: Felipe cobraba desde un laptop y el botón «Confirmar cobro» de la hoja de cobro salía recortado, con scroll para llegar a él. Medí
en el navegador: a 1280 × 650 la hoja mide 480 px y su contenido pedía 715. El botón estaba dentro de lo que scrollea y las medidas eran
fijas (fichas cuadradas de 150 px, billetes en tres filas). Ahora: (1) cabecera y botón son fijos y solo el cuerpo de los pasos scrollea, y
solo si no cabe; (2) la hoja se compacta sola por SU alto (`container: cobro / size`, bloques `@container cobro (max-height…)`): fichas
bajas que crecen con lo que sobra, billetes en una línea, documento del cliente en 2 × 2, y bajo 40 rem sin la cabecera «Total / Volver»;
(3) al elegir el comprobante el cuerpo baja lo justo para mostrar el documento; (4) en una hoja muy angosta los rótulos caben enteros.
Corrección del mismo día (dos vueltas): Felipe lo vio en su monitor (hoja de ~817 px de alto) y quedó compacto, con seis fichas en una fila, íconos
chicos y espacio vacío. Pidió «el diseño anterior en dos filas de 3, más grandes; solo que sea responsive». Se quitó la fila de seis: la forma es
siempre dos filas de tres y solo cambia el tamaño (a 736 × 817 las fichas vuelven a ser de 128 × 126). La hoja angosta usa la disposición ajustada
hasta 80 rem de alto (a una columna el diseño de siempre pide ~1150 px con efectivo). Tercera vuelta (Felipe: «así debe quedar; hazlo más
responsive» y marcó laptop con el menú abierto y tablet): documento 2 × 2 desde 17,5 rem, nombres de fichas legibles con «Transf.», botón y etiquetas
que ya no se cortan a 325 px; el scroll del peor caso en tablet bajó de 233 a 4 px. Lo que falta es ancho: plegar el menú lateral mientras se cobra
(decisión de Felipe, toca el AppShell).
Por qué así: la causa eran dos cosas (botón dentro del scroll, medidas para pantalla alta), y compactar por el alto de la ventana no sirve
porque el alto que le queda a la hoja cambia con la cabecera, el zoom y el navegador. Sin migración ni cambio de lógica de cobro.
Medido a 1920 × 1080, 1536 × 730, 1440 × 800, 1366 × 650, 1280 × 720, 1280 × 650, 1280 × 500, 1024 × 768 y 375 × 812: de 1440 × 800 para arriba
el caso completo cabe sin scroll; más abajo el botón sigue a la vista. Aprendido: el servidor de desarrollo (Turbopack) no recompila `globals.css`
si se edita con el servidor encendido; hay que pararlo, editar y arrancarlo, o la pantalla muestra el CSS viejo sin ningún error.
Después, pedido de Felipe: lo recibido en efectivo se lee en color (exacto en verde con ✓ y monto, falta en rojo, vuelto neutro): `lecturaDelRecibido` en `lib/vender-reglas.ts` + prueba, ADR-0307 §9.
Felipe se lleva: el ADR-0307 §8 con la tabla de lo medido; una decisión suya pendiente (laptop angosto y bajo con efectivo + boleta + documento
completo: ~120 px de scroll solo para el documento; evitarlo pide esconder campos opcionales del documento, y eso es del negocio).
