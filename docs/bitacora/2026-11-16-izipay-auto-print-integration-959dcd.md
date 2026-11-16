# 2026-11-16 · Vender: «Imprimir solo al cobrar» (primer paso hacia el cobro con Izipay)

- **Qué:** un interruptor por equipo en la hoja «Venta registrada» (`lib/imprimir-al-cobrar.ts`, arranca apagado). Encendido, confirmar el cobro
  ya imprime la boleta: sin vuelto vuelve sola a una venta nueva; con vuelto se queda mostrándolo y Enter abre la siguiente. Apagado, Vender queda
  igual que antes. Se sumó la guía de la Mac de caja (`--kiosk-printing` con el Editor de Scripts) a `docs/OPERACION-IMPRESORA-TERMICA.md`.
  Es el paso que no depende de Izipay: cuando Izipay confirme un pago, la venta seguirá este mismo camino. La investigación de Izipay (SDK web, API,
  App to App) quedó en la conversación; el manual App to App dice «confidencial» y no entra al repo.
- **Verificado:** en local, con la impresora simulada (no salió papel): 4 ventas de prueba; con el interruptor encendido imprimió una vez cada una,
  sin vuelto cerró sola y con vuelto se quedó con el foco en «Nueva venta» (1440 px); apagado no imprimió solo. Base local restaurada a su foto.
  Suite completa de la web (929 archivos), `tsc` y Knip limpios; huella de la guía de Vender aceptada (la guía no llega a esta hoja).
- **No verificado:** con la térmica real y Chrome `--kiosk-printing` en una Mac de caja. **Hallazgo aparte (ya existía):** bajo 1024 px, al abrirse
  «Venta registrada» el foco se queda en el escáner de atrás, así que Enter no llega al botón de la hoja.
- **Imprimir sin diálogo (misma rama):** se verificó en el código de Chrome que `--kiosk-printing` imprime en la última impresora del
  perfil (no en la predeterminada del sistema) con su papel, márgenes y escala; se probó en esta Mac con un perfil aparte que guarda a PDF
  (salió solo, a 80 × 120 mm). `docs/OPERACION-IMPRESORA-TERMICA.md` se reescribió con esa regla: un perfil de Chrome por impresora
  («CAYLA Caja», «CAYLA Etiquetas» en Windows; en Mac las etiquetas siguen por el ayudante). Guía visual: el artefacto «Imprimir sin diálogo».
  **No verificado:** en una PC Windows real ni con papel.
