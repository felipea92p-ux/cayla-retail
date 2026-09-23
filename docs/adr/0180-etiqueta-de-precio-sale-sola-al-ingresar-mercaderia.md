# ADR-0180 — La etiqueta de precio sale sola al ingresar mercadería, leída de los movimientos del ingreso

**Fecha:** 2026-09-23 · **Estado:** paso 1 de 3 construido y verificado en local, rama
`claude/auto-label-generation-discounts-25d6a3`; **SIN migraciones** (no hay nada que pegar en producción) · **Falta:** que
Felipe imprima una hoja en la Brother real y la escanee, y la medida de la cartulina.
**Número:** 0180 porque el 0179 lo tomó en paralelo «Prendas sin registrar» (rama `untagged-products-pos`).

## El problema

Hoy cada etiqueta de precio se arma a mano en P-touch Editor: se copia el precio, se elige la plantilla y se imprime prenda
por prenda. Es lento, y el precio impreso lo tipea una persona. El ERP tuvo una pantalla de etiquetas (QR verificado con la
pistola Zebra el 2026-09-10, ADR-0025), pero **se perdió en el reemplazo V1→V2** (`0af2f1b`): quedaron huérfanos
`components/CodigoQR.tsx`, `lib/qr.ts` y el CSS de impresión de 62 × 29 mm.

**Ojo con el nombre.** En el sistema, «etiqueta» ya es la **campaña** (Black Friday, Aniversario; ADR-0107/0108). Esta es la
**etiqueta de precio**, la de papel. Todo lo suyo dice `EtiquetaPrecio` / «etiqueta de precio», nunca «etiqueta» a secas.

## Decisiones de Felipe (2026-09-23)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Sale al ingresar mercadería** (Recibir, Ingreso sin comprobante, cierre de una producción del Taller), **una por prenda física**. No al crear el producto. | Recién al ingresar se sabe cuántas prendas hay. Al crear el modelo no existe ninguna todavía. |
| 2 | **Rollo DK-22205 (62 mm continuo, adhesivo) pegado sobre una cartulina con agujero.** | Es lo que se usa hoy (foto del 2026-09-23). La medida final la manda la cartulina: **62 × 92 mm es provisional**. |
| 3 | **Se imprime directo desde el ERP** (Chrome + driver Brother). Adiós P-touch Editor. | Nadie vuelve a copiar un precio a mano. |
| 4 | **Diseño «D · Editorial, corregida»**, elegido entre 3 rondas de maquetas (`docs/maquetas/etiqueta-precio-2026-09/`), con QR de 25 mm. | Inspirado en Zara/H&M. La crítica separó lo que sirve a la clienta de lo que sirve a la colaboradora (ver abajo). |
| 5 | **La etiqueta muestra todas las tallas del modelo, con la de la prenda marcada.** | La clienta sabe hasta qué talla hay sin preguntar. |
| 6 | **En campaña, el precio se redondea hacia abajo a .90** (S/ 71.92 → S/ 71.90). | Precio «de tienda». **Toca el cobro**: va en el paso 3, antes que cualquier etiqueta con descuento (paso 2). |

## Decisiones técnicas (Claude)

- **No hay función nueva en la base.** Todo ingreso ya escribe sus `movimientos` de entrada con el origen: `lote_id`
  (`recibir_envio` → `recibir_compras` y los extras; `recibir_lote`) o `produccion_id` (`cerrar_produccion`). La pantalla
  `/etiquetas-de-precio?lotes=…|?produccion=…` solo los lee (principio 4) y les suma código, precio de lista, color y las tallas
  hermanas (`lib/etiquetas-precio.ts`, lógica pura en `lib/etiqueta-precio-reglas.ts`).
- **La seguridad la pone la base.** `movimientos_select` solo muestra las sedes que uno opera: un id escrito a mano de otra
  tienda devuelve una lista vacía. Los ids de la URL se filtran como UUID antes de consultar.
- **No es un módulo del menú (ADR-0161).** Es la salida de tres pantallas que ya tienen su módulo, así que no lleva
  `exigirModulo` ni fila en `retail.modulos`.
- **«Tallas del modelo» son las del modelo en ese color (variantes activas), no el stock del día.** La etiqueta impresa no se
  actualiza sola: con el stock quedaría desactualizada con la primera venta. Por eso dice «Tallas del modelo».
- **El QR codifica `variantes.codigo`** (respaldo: `sku`; la caja resuelve los dos). Sin ninguno, la prenda no se imprime y
  la pantalla lo avisa: una etiqueta con precio que la caja no encuentra es peor que no tener etiqueta. En producción, las
  1.295 variantes activas tienen código (2026-09-23).
- **Lo que llega de otra sede no se etiqueta**: entra por traslado, no por lote, y ya viene etiquetado.
- **Paso 1 imprime el precio de lista.** Si la prenda está en campaña, la caja cobra menos de lo que dice el papel, nunca
  más. El precio de campaña llega con el paso 2, después del redondeo (paso 3).
- **Impresión:** una hoja montada con un portal en `<body>` (`#etiquetas-precio-print`, mismo patrón que la boleta A4) y una
  página nombrada `@page etiqueta-precio { size: 62mm 92mm }`, así no se pisa la regla de la térmica de 80 mm.
  `print-color-adjust: exact` hace que la talla invertida salga negra aunque «Gráficos de fondo» esté apagado. Todo en mm y
  en #000 puro: la QL-1110NWB no imprime otro color.
- **Lecturas con `leerTodas()`**: un envío grande pasa las 1.000 filas de PostgREST en las tallas hermanas, y cortada, la
  etiqueta saldría con tallas de menos sin error.

**DESCARTÉ:**
- Exportar un CSV para P-touch Editor: el diseño viviría fuera del ERP y seguiría el paso manual.
- El SDK b-PAC de Brother: es solo para Windows y ActiveX.
- Mandar el trabajo desde el servidor al puerto 9100 de la impresora: Vercel no llega a la red de la tienda.
- Una tabla que registre cada etiqueta impresa: nadie la pidió (YAGNI). La fecha de impresión va en el papel.

**SE ROMPE SI:**
1. El driver no tiene un papel de 62 × 92 mm: Chrome escala o parte la etiqueta. Hay que crearlo una vez por computadora (abajo).
2. Alguien imprime una etiqueta de campaña antes del paso 3: el papel diría un precio que la caja no cobra.
3. Se confunde «etiqueta» (campaña) con «etiqueta de precio» en el código.

## La crítica que dio forma al diseño

**Para la clienta:**
- El colibrí y CAYLA.
- La fila de tallas con la suya invertida.
- El color en su propia línea.
- El precio firme.
- En campaña (paso 2), el bloque «−20 %» y el motivo.

**Para la colaboradora:**
- El código en letra monoespaciada del sistema (su 0 lleva barra, no se confunde con la O al teclearlo).
- «Impreso dd.mm.aa»: si conviven dos etiquetas de la misma prenda, manda la más nueva.
- El QR de 25 mm: más grande que los 18 mm verificados con la Zebra, así que más fácil de leer, no más difícil.
- Con 8 tallas o más, la fila baja un punto de letra (visto en el PDF de prueba: XXXL se pegaba a XXL).

## Cómo se verificó (2026-09-23)

- `lib/etiqueta-precio-reglas.test.ts`: 21 casos. Cubren la suma por prenda, el orden de tallas, otro color, las tallas
  apagadas, el respaldo de SKU, la prenda sin código, las cantidades, el precio, la fecha, los ids de la URL y la ida y vuelta
  del enlace. Suite completa: 118 archivos, 24.251 pruebas. `typecheck` y `eslint` en verde.
- Pantalla contra la base local: un lote de 240 prendas da 12 filas y 240 etiquetas, lo mismo que el SQL. Mide 62 × 92 mm y
  el QR 25 mm exactos.
- **PDF real** con el motor de impresión de Chrome (Playwright `page.pdf`, «Gráficos de fondo» apagado) y una página temporal
  con datos inventados: 6 páginas de 62 × 92 mm, una etiqueta por página. Se probaron el nombre largo cortado en 2 líneas,
  la talla única, 5, 8 y 10 tallas, y un precio de S/ 1,299.90.
- **Los 6 QR se decodificaron exactos** desde la imagen a 300 dpi (la resolución de la Brother) con jsQR. El código más largo
  (16 caracteres) entra en QR versión 1, a ~10 px por módulo (el mínimo práctico es 4).
- Producción, solo lectura: `recibir_lote` devuelve el id del lote, `recibir_envio` trae `lotes` y `cerrar_produccion`
  escribe `produccion_id`. Existen las 15 columnas y las 3 relaciones que lee la pantalla.
- **Falta:** imprimir en la QL-1110NWB real y escanear con la pistola (Felipe).

## Configurar la Brother (una vez por computadora que imprima)

> Estos pasos no se probaron contra la impresora real: los nombres exactos del driver pueden variar según la versión.

1. Instalar el **driver completo** de la QL-1110NWB desde la página de soporte de Brother (no el genérico de Windows).
2. En el driver, crear un papel **62 × 92 mm** para el rollo continuo de 62 mm. Brother lo ofrece en la configuración de
   tamaño de papel (en inglés, «Paper Size Setup»). Activar **corte automático cada 1 etiqueta**.
3. En Chrome, la primera vez: Destino **Brother QL-1110NWB** → Más ajustes → Tamaño del papel **62 × 92 mm** → Márgenes
   **Ninguno** → Escala **Predeterminada (100 %)** → **sin** «Encabezados y pies de página». Chrome recuerda la elección.
4. Primera prueba: imprimir 1 etiqueta, escanearla con la pistola en Vender y confirmar que aparece la prenda correcta.

## Lo que sigue

- **Paso 2:** reimprimir con el precio de campaña, con el bloque «−20 %», el motivo y «Válido hasta». Imprimir a mano las
  etiquetas de un producto, para la ropa que ya está en tienda y para la que llega del Taller a una tienda que no imprimió.
  Al terminar una campaña, listar las prendas que hay que volver a etiquetar.
- **Paso 3:** redondeo a .90 en la caja (`registrar_venta` verifica). Toca dinero: revisión propia y OK de Felipe.
- Ajustar 62 × 92 mm a la medida de la cartulina.
