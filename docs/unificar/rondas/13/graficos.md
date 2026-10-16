# El mapa de los gráficos del ERP (2026-10-14, para las rondas 13 y 14)

Trazado en el código (`apps/web/components` y `apps/web/app`) por un agente `Explore`, porque el motor del censo solo ve bien los gráficos SVG
grandes. Es una foto del 2026-10-14 (rama `claude/unificar-ronda-13` @ `6446cc9f3`): las líneas se corren, pero los archivos sirven de
punto de partida. **La ronda 13 migró** las barras de avance (sección 4) y los anillos (sección 3) que no tienen diseño por ADR; lo demás es
la **ronda 14**. No se cuentan la barra apilada (`grafico.barra`), los íconos, los loaders, el colibrí del login, los pasos de un paso a paso,
las muestras de color ni los adornos.

ADR que deciden un diseño propio y no se tocan sin la palabra de Felipe: **ADR-0322** (Observatorio), **ADR-0357** (Análisis), **ADR-0195**
(Finanzas, su kit) y **ADR-0355** (los pases de Traslados).

## 1. Líneas y tendencias (ronda 14)

| # | Archivo | Qué muestra | Pantalla | Forma | ADR |
|---|---|---|---|---|---|
| L1 | `components/ui/Sparkline.tsx` | Lo facturado en 12 meses a un proveedor | /compras/proveedores (fila) | 46×18, trazo 1,5, tinta/30; se dibuja al llegar y al pasar el mouse | 0128 |
| L2 | `components/ProveedorCostoEvolucion.tsx` | Costo de la prenda más comprada, compra a compra | /compras/proveedores/[id] | 420×120, trazo 2,5; verde si baja, ámbar si sube; guía que salta | 0128 |
| L3 | `components/CajaComparativa.tsx` | Venta acumulada de hoy contra todo el día de ayer | /caja | alto 240, hoy 3,2 tinta y ayer 2,5 punteado; se revela con un clip; ejes y tooltip propio | 0319 |
| L4 | `components/HistorialVentasPulso.tsx` | Ventas por día o semana: «hilos», curva y promedio | /vender/historial | 300×116; hilos que crecen, curva que se dibuja | 0147 |
| L5 | `components/rendimiento/GraficoVentasMeta.tsx` | Ventas acumuladas del mes contra la meta | /rendimiento | alto 200; tinta con área al 7 %, meta taupe punteada; «Ver como tabla» | 0325 |
| L6 | `components/plan-compra/ComoVaCampana.tsx` | Vendido acumulado contra el plan y «si sigue así» | /compras/plan/resultados | 560×220; rojo, rojo punteado, pizarra punteado | 0372 |
| L7 | `components/observatorio/piezas.tsx` (`Spark`) | Tickets y prendas por hora | / (Admin) | área + línea, se revela | 0322 |
| L8 | `components/observatorio/PanelTienda.tsx` | Ritmo contra el período anterior, otra tienda y la meta | / (Admin) | cuatro trazos punteados distintos | 0322 |

Casi iguales: L3, L5, L6 y L8 son «lo acumulado contra una referencia punteada» con cuatro punteados y cuatro grosores distintos.

## 2. Barras que comparan cantidades (ronda 14)

**Verticales:** `ui/BarrasMensuales.tsx` (facturado por mes, vista rápida de un proveedor) · `CajaComparativa.tsx` (hoy menos ayer por hora,
divergente) · `rendimiento/GraficoVentasMeta.tsx` (ventas por día con la raya de la meta) · `rendimiento/PanelRendimiento.tsx` (ventas por
hora) · `CierreCajaDetalle.tsx` (ventas por hora del turno y la cascada del efectivo) · `GraficoCierresDelMes.tsx` (cada cierre del mes,
quieto a propósito, ADR-0136) · `CajaTablero.tsx` (`VistaGrafico`: el esperado por día) · `CajaGraficos.tsx` (ventas por hora, /comercial) ·
`SalidasDeCaja.tsx` (los pagos que vencen por semana, Por pagar) · `finanzas/kit.tsx` y `finanzas/GraficoSemanas.tsx` (ADR-0195) ·
`ComprobantesGraficos.tsx` (facturado contra el resto, apiladas) · `plan-compra/DetalleCampanaHistorial.tsx` (venta por día de la campaña) ·
`analisis/*` (ADR-0357).

**Horizontales, a escala de la mayor:** `observatorio/*` (ADR-0322) · `plan-compra/DetalleCampanaHistorial.tsx` y
`DetalleCategoriaResultados.tsx` (ADR-0372) · `analisis/*` (ADR-0357) · `plan-piso/DetalleDelGrupo.tsx`, `DesgloseDeColor.tsx` (ADR-0352) ·
`movimientos/TiposMovimiento.tsx` (sellos, ADR-0353) · `ProveedoresPanel.tsx` (la deuda a escala, con lo vencido) · `ResumenStockOverlay.tsx`
(`unificar-fijo`) · `vista-rapida/MatrizUnidades.tsx` (la vista rápida) · `ficha-producto/PanelDelTaller.tsx` (unidades por talla; hoy dice
`progressbar` y es una excepción de `grafico.avance`).

Casi iguales: las «ventas por hora» de Rendimiento, el cierre de caja y Comercial (tres altos, tres colores para la mejor hora, tres
movimientos); las «barras por día» de Rendimiento, los cierres del mes, Caja y el plan de campaña; `BarrasFin` y `GraficoSemanas` son la misma.

## 3. Anillos (ronda 13: migrados los que no tienen ADR)

Migrados a `<Anillo>`: Caja (`CajaComparativa`), «Mi meta» (`inicio/MiMeta`), Existencias (`AnilloMision`, `AroSemanas`), Conteo
(`ContarConteo`), Recibir (`RecepcionEnvio`), Cambios y Devoluciones (`FlujoGuiado`) y el Inicio del almacén (`CabinaAlmacen`,
`BloquesLaterales`). Quedan por su ADR los del Observatorio (`piezas.tsx`, `Mapa.tsx`, `Abajo.tsx`), Análisis (`analisis/piezas.tsx`) y los
pases de Traslados (`Billetera.tsx`, `ReversoPase.tsx`). **La dona de lo cobrado por medio de pago** (`CierreCajaDetalle.tsx`) reparte un
total: ronda 14.

## 4. Barras de avance (ronda 13: migradas las que no tienen ADR)

Migradas a `<BarraAvance>` (unas 40 en 27 archivos): las listas en `docs/unificar/grafico.avance.md`. Quedan por su ADR las del Observatorio
(`Observatorio.tsx`, `Mapa.tsx`), Análisis (la racha de 14 días), Finanzas (`.fin-umbral-barra`, `.fin-barra`) y el trayecto con el camión
(`inicio-almacen/BloquesLaterales.tsx`, `traslados-pases/LineaViaje.tsx`), y por excepción la del registro en la página pública del club.

## 5. Otros gráficos de datos (sin familia todavía)

El flujo «Qué hacer hoy» de Análisis (ADR-0357), el mapa de calor de horas del Observatorio (ADR-0322), la mancuerna y el riel de perchas del
plan del piso (ADR-0352), el ritmo del turno de Caja (una venta por punto, ADR-0116), el semáforo de cierres de Caja, el riel hasta Navidad de
Análisis, la banda de lo vendido del plan de compra (ADR-0349), la regla de zonas de Frescura, la regla de precio de Ventas sin registrar
(ADR-0360), el semáforo de margen de una orden de producción, la balanza de Recibir contando, los puntitos «N de M» de Comprobantes, la línea
de vida de una factura por pagar y el turno contra el tiempo extra del aviso de cierre de caja (ADR-0359).
