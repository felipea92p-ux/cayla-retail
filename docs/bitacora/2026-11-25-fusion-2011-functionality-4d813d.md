# 2026-11-25 · Vender: el aviso al cobrar reemplaza a «Venta registrada» y los interruptores pasan a la tuerca

- **Qué:** Felipe pidió que la boleta salga sola y que la hoja «Venta registrada» deje de aparecer, también en el celular, con las opciones de
  impresión en otro lugar y sin desconfigurar Trujillo (que ya imprime desde el celular). Aprobó la maqueta `docs/maquetas/impresion-vender-2026-11/`
  (tuerca con texto, sin «Imprimir aquí» en el celular). Sobre el PR #2011: `AvisoAlCobrar` (número, vuelto, «Nueva venta» y «Reimprimir»;
  en el celular «Enviando a la caja» → «Boleta impresa en la caja» o, a los 15 s, «Sigue en la cola de la caja»), `ImpresionDelEquipo` (la
  tuerca junto a «Más», con «1 en cola») y `colaDeLaCaja.ts` (la cola del equipo sigue preguntando después de cerrar el aviso). Mismas
  preferencias y mismos valores de fábrica; prueba nueva «foto de Trujillo». ADR-0670 act. 2026-11-25 (b). Sin migración.
- **Verificado:** en local con una página temporal (no commiteada) que monta la tuerca, el aviso y la impresión real con una venta inventada,
  sin sesión ni base: 1440 px (una impresión, «Boleta impresa», «Reimprimir» manda la segunda, Enter cierra y vuelve al buscador; ventana de
  etiquetas → «La boleta no salió» con «Reintentar»), 375 px táctil con la cola simulada (pedir y preguntar interceptados: «Enviando a la
  caja», a los 15 s «Sigue en la cola», tuerca «1 en cola» que se limpia sola al imprimirse; abrir la tuerca no guarda nada), modo oscuro.
  Capturas en `docs/maquetas/impresion-vender-2026-11/implementado/`. `tsc`, lint y la suite completa de la web.
- **Después, en un banco propio** (`cayla-imprime`, puertos 524xx, cuentas del seed; nada en la base compartida): cobro real en `/vender`.
  Computadora (Lima): una impresión, «Boleta impresa» con el vuelto; ahí apareció un fallo: tras «Reimprimir» el foco quedaba suelto y Enter ya
  no abría la venta nueva (arreglado: el foco vuelve al botón principal al cambiar de estado). Celular (Trujillo): la boleta queda en
  `retail.impresiones`, «Sigue en la cola» a los 15 s, la tuerca «1 en cola» y se limpia al imprimirse. `tema:auditar` 0 solo en oscuro,
  `tacto:medir` todo en 44 px, `/formidable` 8,0 · 8 (`docs/formidable/vender-aviso-al-cobrar.md`), `/chaos` semilla 2016: resiste.
- **No verificado:** con la térmica real, el ayudante de la Mac ni la cola real de Trujillo (Mac encendida y dormida).
