# Impresora térmica en la caja — imprimir sin diálogo

Para qué sirve: con esto, «Imprimir y nueva venta» (Enter) manda el ticket a la térmica **sin abrir el
diálogo de impresión del navegador**. Es un ajuste del **equipo de caja**, no del sistema: se hace una
vez por PC. Contexto y decisión: `docs/adr/0114-pos-comprobante-termico-y-ajustes-de-vender.md`.

## Una vez por PC de caja (Windows + Chrome)

1. **Instala el driver de la térmica** (el del fabricante) y pon la impresora como **predeterminada**:
   *Configuración → Bluetooth y dispositivos → Impresoras y escáneres → tu térmica → Establecer como
   predeterminada*. Antes, apaga *«Permitir que Windows administre mi impresora predeterminada»*, o
   Windows la cambia solo a la última usada.
2. **Ajusta el papel en el driver** (*Preferencias de impresión*): papel **80 mm (rollo)**, márgenes
   **0**, escala **100 %**. El ticket ya deja 4 mm de margen por lado por dentro.
3. **Crea un acceso directo de Chrome solo para la caja**: clic derecho sobre el acceso directo de Chrome
   → *Copiar* → *Pegar* en el escritorio → clic derecho → *Propiedades* → en **Destino**, agrega **al
   final**, después de las comillas y con un espacio:
   ```
   --kiosk-printing
   ```
   Por ejemplo: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing`.
4. **Cierra TODAS las ventanas de Chrome** y ábrelo desde ese acceso directo (si queda una ventana
   abierta, la opción no se aplica).
5. **Prueba**: haz una venta, confirma el cobro y presiona **Enter**. El ticket debe salir sin ningún
   diálogo y el sistema quedar listo para la siguiente venta.

## Una vez por Mac de caja (macOS + Chrome)

1. **Pon la térmica como predeterminada:** *Ajustes del Sistema → Impresoras y escáneres → Impresora
   predeterminada* → tu térmica (no «Última impresora usada»: con eso cambia sola).
2. **Ajusta el papel:** en Chrome, imprime una vez a mano, elige la térmica, papel **80 mm**, márgenes
   **Ninguno** y escala **100 %**. Chrome recuerda ese ajuste.
3. **Crea el «Chrome de caja»:** abre la app **Editor de Scripts** (en Aplicaciones → Utilidades), pega
   esta línea:
   ```
   do shell script "open -na 'Google Chrome' --args --kiosk-printing"
   ```
   *Archivo → Exportar…* → Formato de archivo: **Aplicación** → nómbralo «Chrome de caja» y guárdalo en
   Aplicaciones. Arrástralo al Dock.
4. **Cierra Chrome por completo** (Cmd+Q, no solo la ventana) y ábrelo desde «Chrome de caja».
5. **Prueba** como en Windows: una venta, confirma el cobro, Enter. Debe salir sin diálogo.

## Imprimir solo al cobrar (sin el segundo toque)

Con el «Chrome de caja» ya listo, en la hoja **«Venta registrada»** de Vender enciende **«Imprimir solo
al cobrar»**. Desde la venta siguiente, confirmar el cobro ya imprime la boleta:

- **Sin vuelto** (tarjeta, QR, efectivo exacto): imprime y vuelve sola a una venta nueva.
- **Con vuelto:** imprime y deja a la vista cuánto entregar; Enter abre la venta siguiente.
- Si el papel se atasca: **«Imprimir otra vez»**, o búscala en «Ventas de hoy» y reimprime.

Es un ajuste **de ese equipo**, no de la cuenta. No lo enciendas en un celular ni en un equipo sin el
«Chrome de caja»: ahí abriría el diálogo de impresión solo en cada venta. Para apagarlo, el mismo
interruptor (sale en cualquier venta con vuelto).

## Cosas a saber

- Con `--kiosk-printing`, **todo** lo que se imprima desde ese Chrome sale directo a la impresora
  predeterminada, sin preguntar. Úsalo solo para la caja; para imprimir otra cosa, usa un Chrome normal.
- Si la predeterminada **no** es la térmica, el ticket sale en otra impresora (o no sale). Es lo primero
  que hay que mirar si «no imprime».
- Si la térmica se atasca o se acaba el rollo: **«Solo imprimir»** reintenta sin cerrar la venta.
- Si la clienta no quiere el papel: **«Sin imprimir»** o **Esc**.
- Sin este ajuste todo funciona igual; solo aparece el diálogo de Chrome en cada venta y hay que
  confirmarlo (Enter o clic en *Imprimir*).
- Los datos fiscales que salen impresos viven en `apps/web/lib/emisor.ts`.
