# La barra apilada — una sola pieza (ADR-0358, ronda 5b)

**Decidido:** 2026-10-09, Felipe, **tocando** las demos (página de elegir con demos vivas en claro y oscuro,
`apps/web/unificar/.salida/elegir-grafico/`). **Elegida:** P. **Pieza:** `<BarraApilada>` (`components/ui/BarraApilada.tsx`) y
`<MuestraTramo>` (el cuadrito de una leyenda), CSS en `app/estilos/barra-apilada.css`. Es la **barra que reparte un total en partes**
(la familia `grafico.barra`); la línea, las barras mensuales y la dona siguen en «Por analizar» (`grafico`).

Nació de la deuda que dejó Frescura (la actualización 2026-10-07 de ADR-0208): su rama `claude/frescura-vara-cayla-dos-niveles` (fusionada a
`main` por el PR #889 mientras esta ronda estaba en curso) creó `ui/BarraApilada` con la forma de la barra que «Deuda por vencimiento»
(Compras) dibujaba a mano, y su bitácora lo dejó como pendiente de `/unificar`.

## Qué se comparó

El censo (Admin y Admin-Taller, 180 vistas, más uno aparte contra el worktree de Frescura) y el código contaron **quince archivos** que
dibujan esta barra a mano, con casi diez caras. El censo solo ve lo que el seed muestra (Por pagar, Proveedores, Facturación e Historial);
las demás (Notas de crédito, Proformas, Producción, Caja, el cierre de caja y Eficiencia del Taller) se contaron leyendo el código.

| Forma | Dónde | Cómo se veía | Se mueve / responde |
|---|---|---|---|
| Compras, tramos sueltos sin pista | Por pagar (Deuda por vencimiento 14 px, Deuda por proveedor 8 px), Proveedores (Concentración 8 px), Notas de crédito (8 px) | tramos de esquinas redondas separados 3 px | entran creciendo tramo a tramo, el tramo apuntado se estira, los demás bajan (en Concentración y Notas de crédito), se reacomodan y filtran |
| Compras, las chicas | la mezcla de lo marcado (Por pagar) y el reparto de un pago (hoja Pagar), 5 px | tramos sueltos | solo se reacomodan al cambiar la cifra |
| Píldora con pista, quieta | Facturación (8 px, 2 px de aire; crecen todos a la vez), Historial «Cómo se pagó» (6 px; crece la barra entera), cobrado en el turno de Caja (10 px), cierre de caja (10 px), Por pagar de Producción (10 px), Eficiencia del Taller (12 px), la nota de crédito (8 px) | pista de arena o de hueso, tramos pegados y recortados | los de Caja y la nota de crédito se reacomodan; ninguna responde |
| Píldora con pista de tinta, Producción | costo de una orden: la tarjeta (4 px) y la ficha (12 px) | pista de tinta al 10 % | entran creciendo tramo a tramo; no responden |
| Frescura (en `main` desde el PR #889) | Inventario ▸ Frescura, «Cómo está el piso» (12 px) | píldora con pista, tramos pegados | ninguno; solo se lee |

![la propuesta, en claro y oscuro](capturas/grafico.barra.jpg)

## Lo que eligió (P)

La **pista de arena** de Frescura y Facturación (dice «esto es el 100 %» y, vacía, «no hay nada») con **el movimiento de Compras**, y
tres cosas que ninguna tenía:

1. **El área que siente el mouse mide 24 px o más** aunque la barra pinte 12, 8 o 4 (hoy un tramo de 8 px es difícil de apuntar).
2. **Una sola voz para el lector de pantalla:** si solo se lee, es una imagen con su resumen; si responde, un grupo con su resumen y cada
   tramo es un botón con su nombre y lo que hace («Vencida: S/ 5,133.60. Filtrar la lista»).
3. **Tres altos en múltiplos de 4:** 12 (un panel), 8 (dentro de una tarjeta de cifra), 4 (un hilo junto a un número). Las barras de 10 px
   (Caja, cierre, Por pagar de Producción) y de 5 y 6 px pasan al alto que corresponda al lugar al migrarlas.

## El movimiento de la pieza

- **Entra** creciendo de izquierda a derecha, un tramo tras otro (`anim-crece-x`: 620 ms, 38 ms entre tramos).
- **Se reacomoda** en 700 ms cuando cambia una cifra (se pagó algo): `flex-grow` con transición.
- **Si responde:** el tramo apuntado se estira a 1,35× (200 ms) y los demás bajan al 35 % (el ya elegido sigue entero); con un filtro
  puesto, solo el elegido queda entero. Con el foco del teclado pasa lo mismo y el anillo es el del sistema (ADR-0351). El «encima» solo
  corre donde hay mouse (`@media (hover: hover)`): en un celular se quedaría pegado tras un toque.
- Sin rebote ni bucle (ADR-0136); quieta con «reducir movimiento».
- **Lo que traían las que reemplaza:** Compras (todo lo de arriba, salvo que en «Deuda por vencimiento» los demás tramos no bajaban al
  apuntar: ya lo hacían «Concentración» y las Notas de crédito, y a «Deuda por vencimiento» se le **suma**); Facturación e Historial, el
  crecer de golpe (se reemplaza por el crecer tramo a tramo); Producción ya crecía tramo a tramo; Frescura, nada (gana el movimiento).
  **Una sola cosa cambia de medida:** «Deuda por proveedor», «Concentración» y las Notas de crédito (las de 8 px) se estiraban al apuntarlas
  a 1,7× y ahora a 1,35×, como todas (la de «Deuda por vencimiento» ya era 1,35×). Pregunta para Felipe: ¿1,35× para todas, o 1,7× en las de 8 px?

## Decisiones que tomó Claude donde la demo no alcanzaba (Felipe puede deshacerlas)

- **Los tramos de en medio son rectos**, tanto si responde como si solo se lee. En la demo, los botones salían con esquinas redondas por el
  estilo del navegador y los `<span>` rectos: una barra con dos caras según si responde. Los extremos siguen la píldora.
- **Cada tramo lleva su propia base de arena y el color va en una capa interna.** Sin eso, un color translúcido (`bg-tinta/50`, el gris
  grande de «8–30 días») se partía en tres franjas al estirarse: se veía distinto sobre la arena y sobre la tarjeta. Las leyendas dibujan
  su cuadrito con `<MuestraTramo>`, para que el cuadrito y el tramo tengan el mismo tono.
- **Cada tramo crece por su parte del total** (suma 100) y no por su valor: así la barra llena la pista aunque las cifras sumen menos de 1.
- **El blanco táctil de un tramo no llega a 44 px** (ADR-0350, con dedo): la leyenda de al lado, que hace lo mismo, es el blanco de 44 px.

## Contraste (medido, 2026-10-09)

Los tonos de tinta por debajo de `/50` no llegan a 3:1 contra el hilo de arena (WCAG 1.4.11): `/50` mide 3,1 en claro y 3,7 en oscuro,
`/25` 1,7 y 2,0, `/20` 1,5 y 1,8. **No es una regresión de esta migración** (antes iban sobre la tarjeta, con medidas parecidas) y la
información no depende del color: la leyenda y el resumen para el lector la repiten en texto. Quien use la pieza con un tinta pálido
debe poner el dato también en texto. Si Felipe quiere un piso, es `bg-tinta/50`.

## Lo que queda distinto a propósito

Lo siguiente existe por una decisión, o no es esta función, y **no se corrigió: Felipe dice si se unifica**.

- **Análisis** (ADR-0357): la barra por tiempo sin venderse (`PestanaQuieta`), la de «Dónde está lo que tienes» (`PestanaPiso`, pestaña
  «Nunca salió al piso») y la de modelos de «Todavía no» (`TodaviaNo`) usan `flex` con su cascada propia («los gráficos de Análisis tienen su
  excepción de movimiento»).
- **Aviso de cierre de Caja** (ADR-0359): la barra de turno y horas extra (`rcc-seg`) de `RecordatorioCierreCaja`.
- **Marcas de un conteo** (una por día o paso, todas iguales): la «Racha» de 14 días del Motor de demanda (`PreparacionMotor`) y las de
  Análisis (`analisis/piezas`). No reparten un total; el censo las salta si son seis o más del mismo ancho.
- **Barras de avance de UN solo relleno** (el plazo de pago real de un proveedor contra el pactado, `ui/PistaPlazo`; lo recibido de una
  compra y lo aplicado de una nota de crédito, `ComprobanteAvance.BarraAvance`; la meta de Rendimiento, `ui/BarraAvance`): miden un avance,
  no reparten un total. Son otra función y van en otra ronda.
- **Barras de largo a escala** (el «saldo a escala» de una fila de Proveedores y el piso y almacén de `ResumenStockOverlay`): el largo
  compara con el mayor de la lista y, dentro, se parten en dos. El censo puede contar la de Proveedores cuando hay una parte vencida. La de
  `ResumenStockOverlay` la ve la firma y está marcada con `unificar-fijo`.
- **El medidor de la barra fija de Recibir** (`RecepcionEnvio`: contado, faltante y lo que falta contar): una franja de 3 px pegada al borde de
  la barra fija, sin extremos redondeados, es otro diseño; la firma la ve y está marcada con `unificar-fijo`. Felipe dice si se unifica.
- **El medidor de margen de una orden** (`OrdenPanel`: pierde, al filo, gana; tres zonas fijas con un marcador): es una escala, no reparte un total.

## Deuda y migración

**0 archivos** (`pnpm --filter web unificar:deuda grafico.barra`): ya no queda ninguna barra apilada dibujada a mano. Eran quince al decidir
(14 de deuda más «Deuda por vencimiento», migrada el mismo día). Felipe pidió el resto («migra las otras 13 barras, empezando por Compras») y se
migró el 2026-10-09, un commit por módulo:

| Módulo | Archivos | Estado |
|---|---|---|
| Compras ▸ Por pagar | `DeudaPorVencimiento.tsx`, `PorPagarControles.tsx` (Deuda por proveedor, tramos que son enlaces), `PorPagarLista.tsx` (mezcla de lo marcado), `PagoPiezas.tsx` (reparto de un pago) | **migrado** |
| Compras ▸ Proveedores y Notas de crédito | `ProveedoresIndicadores.tsx` (Concentración), `NotasCreditoPanel.tsx` (por reclamar y saldos a favor), `RegistrarNotaCreditoModal.tsx` (las tres partes del dinero); `.nc-conc` y `.nc-barra` salieron de `app/estilos/notas-credito.css` | **migrado** |
| Vender ▸ Comprobantes y Proformas | `ComprobantesGraficos.tsx` (la pieza homónima con `partes` y leyenda propia pasó a llamarse `BarraConLeyenda` y dibuja su barra con la del sistema), `ComprobantesTarjetas.tsx`, `ProformasTarjetas.tsx`; `.kpi-apilada` y `kpi-crece-x` salieron de `globals.css` | **migrado** |
| Vender ▸ Historial | `HistorialVentasPulso.tsx` («Cómo se pagó»): un tramo por método con su token (`color`) | **migrado** |
| Caja | `CajaTablero.tsx` (cobrado en el turno), `CierreCajaDetalle.tsx` (a dónde fue el efectivo) | **migrado** |
| Producción ▸ Órdenes, Por pagar y Eficiencia | `OrdenTarjeta.tsx`, `OrdenPanel.tsx`, `EficienciaTallerPanel.tsx`, `PorPagarProduccionPanel.tsx` (`/produccion/por-pagar`: Producción contra Compras) | **migrado** |
| Inventario ▸ Frescura | en `main` desde el PR #889 con la versión simple de la pieza; hereda la cara nueva al traer `main` a esta rama | en `main` |

**Cómo se verificó:** en el navegador local, en claro y oscuro, a 1440 y 375 px, y con `tema:auditar` sin hallazgos. Con datos reales del seed:
Por pagar, Proveedores, Facturación e Historial. Con datos de prueba en una página de ensayo temporal (ya borrada, fuera de git): Notas de
crédito y su hoja, `TarjetaCobrado` de Caja, el cierre, las órdenes de Producción, Eficiencia del Taller y la leyenda de Proformas. Qué NO se
vio en vivo: `TarjetaCobrado` en su pantalla (solo se dibuja cuando `/caja` no tiene la comparativa de hoy contra ayer, ADR-0319, que es lo normal:
`CajaAbiertaPanel.tsx`), un cierre real con traslados, órdenes reales de Producción ni un período de Eficiencia con planilla (el seed no los trae).

## Lo que la migración de Compras le pidió a la pieza

Las barras de Compras no eran todas iguales a «Deuda por vencimiento»; la pieza creció (sin cambiar lo que ya hacía) para no perder nada:
- **Tramos que son enlaces** (`href`): «Deuda por proveedor» filtra la lista al navegar a `?prov=`. **Etiqueta y título propios** por tramo
  (`etiqueta`, `titulo`) y un tramo que **no responde** (`inerte`, el «Otros») o que **el lector no oye** (`oculto`, el «Resto»).
- **Resaltar sin filtrar** (`resaltada`): apuntar un tramo de Proveedores no es un filtro, solo enciende la fila de la tabla, así que los demás
  bajan pero ninguno queda «presionado». El estado presionado solo existe cuando la pantalla maneja un filtro (`elegida`).
- **Decorativa** (`decorativa`): las barras de lo marcado, del reparto de un pago, de los saldos a favor y de las tres partes de una nota
  repiten en texto lo que dicen; el lector no las oye, como antes.
- **El 100 % que no es la suma** (`total`): las tres partes de una nota se miden contra el monto de la nota, y lo que falta repartir
  queda de pista, vacío.
- **La entrada espera a su tarjeta** (`retraso`): las tarjetas de cifra entran escalonadas y su barra llega después.
- **Color por token** (`color`), para Historial y Caja, que pintan con `var(--color-metodo-*)` en un `style`.
- Las barras de 5 px pasan a 4 (el hilo); las de 10 px, a 8 (Caja, Producción contra Compras) o a 12 (el cierre); las de 6, a 8 (Historial); las
  de 14, a 12.
- **El cuadrito de una leyenda con un tono translúcido** (Eficiencia, el panel de una orden, Producción contra Compras) se dibuja con
  `<MuestraTramo>`: sobre la tarjeta se veía más claro que su tramo, que va sobre la arena.

## Lo que las dos revisiones adversarias encontraron y se corrigió (2026-10-09)

**Primera** (la pieza y «Deuda por vencimiento»; 6 lentes, 30 agentes): las firmas dejaban pasar cinco archivos que reparten un total, el censo
contaba como barra la «Racha» de 14 días, el tramo translúcido se partía en franjas al estirarse (base de arena por tramo), el elegido bajaba al
apuntar otro tramo, y varias afirmaciones de este registro eran falsas.

**Segunda** (la migración de las otras barras, la pieza ampliada, el candado y los documentos; 6 lentes, 34 agentes; 12 confirmados): 
- Las barras que cambian **mientras se escribe o se marca** (reparto de un pago, mezcla de lo marcado, las tres partes de una nota) perdían su
  transición: un tramo en 0 desaparecía de golpe. Ahora `viva` los deja montados y solo los reacomoda (medido: 35 → 207 px al escribir, de
  vuelta a 0 al vaciar).
- Una barra `decorativa` mostraba texto al pasar el mouse con la cifra cruda («tela: 0.6»): ya no; las que se leen lo dicen bien (`formato`).
- `sinEntrada` en el cierre de caja (dentro de una hoja ADR-0136 no deja agregar movimiento de entrada). La raíz es un `<span>`; soltar el mouse
  de la barra entera suelta el resaltado; un valor NaN cuenta como 0; una barra con enlaces responde sola; una decorativa nunca responde.
- La firma de la barra con pista y sin hilo no veía las de 3 a 8 px: ahora sí, y atrapa dos líneas que son otra cosa (el medidor de Recibir y
  la barra a escala de `ResumenStockOverlay`), marcadas con su motivo.
- Documentos: Frescura ya estaba en `main`, la razón de por qué no se vio `TarjetaCobrado` era otra, `PorPagarProduccionPanel` es de Producción,
  el estirón pasa de 1,7× a 1,35× en tres barras, y varios conteos y encabezados.

La migración **no cambió qué hace nada**: mismo resumen para el lector, mismas etiquetas de tramo, mismos filtros, mismo `apuntar`, mismas URL.

## Al traer `main` a esta rama (hecho el 2026-10-09)

La rama de Frescura entró a `main` (PR #889) con su propia `ui/BarraApilada.tsx`, así que al traer `main` el archivo chocó (se agregó en las dos).
**Se resolvió quedándose con la versión de esta rama**: es un superconjunto compatible (mismas props `segmentos`, `unidad` y `className`; suma `etiqueta`, `formato`,
`alto`, `respuesta`, `retraso`, `total`, `decorativa`, `viva` y `sinEntrada`, y exporta `MuestraTramo`). Lo que cambia para el tablero de Frescura
es su cara: pista de arena con hilo de 2 px, tramos que entran creciendo y se reacomodan, en vez de tramos pegados y recortados que aparecen
quietos. Verificado tras traer `main`: el tablero de «Cómo está el piso» se ve bien con la pieza ampliada (pista, hilo, mismas etiquetas para el lector),
`tema:auditar --escenario frescura.tablero` sin hallazgos, 386 archivos de pruebas en verde y la deuda en 0. **Pendiente, a pedido de Felipe de no tocar Frescura:** su leyenda dibuja el cuadrito a mano (`inline-block … rounded-full ${s.clase}`)
y con un tono translúcido queda más claro que su tramo; usar `<MuestraTramo>` lo arregla.
