# Impresora térmica en la caja — imprimir sin diálogo

Para qué sirve: con esto, «Imprimir y nueva venta» (Enter) manda el ticket a la térmica **sin abrir el
diálogo de impresión del navegador**. Es un ajuste del **equipo de caja**, no del sistema: se hace una
vez por PC. Contexto y decisión: `docs/adr/0112-pos-comprobante-termico-y-ajustes-de-vender.md`.

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
