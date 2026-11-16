# Imprimir sin diálogo — boletas, tickets, etiquetas y rótulos

Para qué sirve: que lo que el ERP manda a imprimir salga **directo a su impresora, sin el cuadro de impresión
del navegador**. Es un ajuste **de cada computadora**, no del sistema: se hace una vez por equipo.
Contexto: ADR-0114 (comprobante térmico), ADR-0180 y ADR-0366 (Brother), ADR-0304 (ayudante de la Mac).
La guía visual paso a paso para la tienda es el artefacto «Imprimir sin diálogo» (se le pasó a Felipe el 2026-11-16).

## La regla que manda (verificada el 2026-11-16)

Chrome tiene un modo sin diálogo (`--kiosk-printing`). En ese modo imprime en **la última impresora que se usó en ese
perfil de Chrome**, con el papel, los márgenes y la escala que se usaron esa vez, **no** en la impresora predeterminada
del sistema. Lo dice el código de Chrome: `selectInitialDestination_` (`print_preview/data/destination_store.ts`) elige
la impresora reciente antes que la del sistema, y el modo sin diálogo imprime con esa misma elección (`app.ts`,
`isInKioskAutoPrintMode_`); los ajustes que recuerda están en `STICKY_SETTING_NAMES` (`data/model.ts`). Solo la política
`PrintPreviewUseSystemDefaultPrinter` lo cambia a la del sistema. Se probó en la Mac de desarrollo con un perfil aparte
cuya última «impresora» era Guardar como PDF: el ticket salió solo, sin diálogo, a 80 × 120 mm exactos.

Por eso: **una ventana de Chrome sin diálogo = una impresora.** Cada impresora tiene su propio perfil
(`--user-data-dir`), que se «calibra» una vez imprimiendo con el diálogo. Y el perfil propio evita la otra trampa: si
ya hay un Chrome abierto con ese perfil, abrirlo de nuevo con `--kiosk-printing` no aplica la opción.

| Qué se imprime | Impresora | Sin diálogo con |
|---|---|---|
| Boleta o ticket al vender, reimprimir el ticket, ticket de cambio, de apartado | Térmica de 80 mm (Epson TM-T20III) | **«CAYLA Caja»** (Windows y Mac) |
| Etiquetas de precio, rótulos de anaquel, etiquetas al recibir mercadería | Brother QL-1110NWB | Windows: **«CAYLA Etiquetas»** · Mac: el **ayudante** (ADR-0304), desde cualquier ventana |
| Hojas A4: boleta o factura A4, proforma, guía de traslado, cartel del club, ingresos, plan de compra | La de oficina o PDF | **Chrome normal, con diálogo** (a propósito) |

Una hoja A4 mandada desde «CAYLA Caja» saldría en la térmica: las hojas A4 se imprimen desde el Chrome de siempre.

## Windows (una vez por computadora)

1. Drivers instalados: la térmica con papel **80 mm (rollo)**, márgenes 0, escala 100 %; la Brother con papel **62 mm**,
   longitud **40.1** y corte cada 1 (la guía de impresión del ERP, en Etiquetas de precio).
2. Accesos directos (clic derecho en el escritorio → Nuevo → Acceso directo), cada uno con su carpeta de perfil:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\CAYLA\chrome-caja" --no-first-run https://cayla-retail.vercel.app/vender?ventana=caja
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\CAYLA\chrome-caja" --no-first-run --kiosk-printing https://cayla-retail.vercel.app/vender?ventana=caja
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\CAYLA\chrome-etiquetas" --no-first-run https://cayla-retail.vercel.app/etiquetas-de-precio?ventana=etiquetas
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\CAYLA\chrome-etiquetas" --no-first-run --kiosk-printing https://cayla-retail.vercel.app/etiquetas-de-precio?ventana=etiquetas
   ```
   Nombres: «Calibrar caja», «CAYLA Caja», «Calibrar etiquetas», «CAYLA Etiquetas».
3. **Calibrar:** abre «Calibrar caja», entra al ERP, reimprime un ticket (Historial → una venta → Imprimir ticket) y en
   el diálogo elige la térmica, papel 80 mm, márgenes **Ninguno**, escala **100**. Cierra esa ventana (⋮ → Salir). Lo
   mismo con «Calibrar etiquetas»: una etiqueta a la Brother, 62 mm, márgenes Ninguno, escala personalizada 100.
4. Desde ese día se abre **«CAYLA Caja»** para vender y **«CAYLA Etiquetas»** para etiquetas y rótulos.
5. Prueba: en cada una, imprimir no abre ningún cuadro y sale en su impresora.

## Mac (una vez por computadora)

1. Las dos impresoras agregadas en Ajustes del Sistema → Impresoras y escáneres.
2. **Etiquetas y rótulos:** el ayudante (`curl -fsSL https://cayla-retail.vercel.app/mac-etiquetas/instalar.sh | sh` en
   Terminal). Etiquetas de precio deja de mostrar el aviso del ayudante cuando está listo. Funciona desde cualquier
   ventana de Chrome y siempre a la Brother.
3. **Boletas:** dos apps con el Editor de Scripts (Archivo → Exportar… → Formato: Aplicación):
   ```
   do shell script "open -na \"Google Chrome\" --args --user-data-dir=\"$HOME/CAYLA/chrome-caja\" --no-first-run \"https://cayla-retail.vercel.app/vender?ventana=caja\""
   do shell script "open -na \"Google Chrome\" --args --user-data-dir=\"$HOME/CAYLA/chrome-caja\" --no-first-run --kiosk-printing \"https://cayla-retail.vercel.app/vender?ventana=caja\""
   ```
   «Calibrar caja» y «CAYLA Caja». Comprobado: la línea compila y arma la orden correcta.
4. **Calibrar** como en Windows con «Calibrar caja» (térmica, papel de 80 mm, márgenes Ninguno, escala 100) y salir con
   Cmd+Q. Desde ese día se abre «CAYLA Caja».

## Imprimir solo al cobrar (sin el segundo toque)

Con «CAYLA Caja» ya listo, en la hoja **«Venta registrada»** de Vender enciende **«Imprimir solo al cobrar»**. Desde
la venta siguiente, confirmar el cobro ya imprime la boleta: sin vuelto vuelve sola a una venta nueva; con vuelto deja
a la vista cuánto entregar y Enter abre la siguiente. Es de ese equipo; no lo enciendas fuera de «CAYLA Caja».

## La ventana sabe qué es (ADR-0670)

El `?ventana=caja` o `?ventana=etiquetas` del ícono marca esa ventana. Desde ahí, lo que no va a su impresora no se imprime y un aviso
dice dónde abrirlo: en «CAYLA Caja», una hoja A4 (y en Windows, una etiqueta); en «CAYLA Etiquetas», un ticket o una hoja A4. Para quitar
la marca de una ventana: abrir cualquier pantalla con `?ventana=normal`.

## Vender en el piso: la boleta sale en la caja (ADR-0670)

- **En el celular o la tablet del piso:** en «Venta registrada», encender **«Imprimir en la caja»**. Desde la venta siguiente, la boleta se
  manda a la cola de la caja y la hoja dice «En la cola de la caja» → «Impresa en la caja». Cuando el piso tenga su impresora, se apaga.
- **En «CAYLA Caja»:** en «Venta registrada», encender **«Imprimir lo que se vende en el piso»** (y, si se quiere, «Avisar con voz»).
  Abajo al centro aparece «Caja imprime el piso» y cuántas faltan. Si la caja estaba apagada, al volver imprime lo pedido en las últimas
  12 horas, en orden.
- Necesita la migración `20261116204000_cola_de_impresion.sql` en producción.

## Cosas a saber

- Sale el cuadro de impresión: esa ventana no se abrió con el acceso «CAYLA …» (había otra ventana de ese perfil
  abierta antes). Cierra todas las de ese perfil y ábrelo desde el acceso.
- Sale en la otra impresora: la pantalla está en la ventana que no le toca, o hay que calibrar de nuevo.
- Para cambiar de impresora o de papel: abre «Calibrar …», imprime una vez con el diálogo y vuelve a «CAYLA …».
- Cada perfil pide entrar al ERP una vez (es como otro navegador).
- Si la térmica se atasca o se acaba el rollo: **«Imprimir otra vez»** o reimprime desde «Ventas de hoy».
- Sin nada de esto, todo funciona igual, con el cuadro de impresión de siempre.
- Los datos fiscales que salen impresos viven en `apps/web/lib/emisor.ts`.
