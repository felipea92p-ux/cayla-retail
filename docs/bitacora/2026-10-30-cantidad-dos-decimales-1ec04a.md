# 2026-10-30 · Insumos: la tela se ve con dos decimales (rama cantidad-dos-decimales-1ec04a)

- **Qué:** Felipe vio «1 m» en la cifra grande de un color de tela que tenía 0.70 m (la fila de lote decía «0.7 m / 9 m»). Había dos redondeos:
  la cifra grande usaba `CifraQueCuenta formato="entero"` y `cantidadTexto` cortaba los metros a 1 decimal, aunque «Ingresar lote» deja escribir 2
  (un lote de 12.25 m se veía «12.3 m»). Ahora cada unidad tiene `vista` (los decimales con que se MUESTRA, fijos: metro 2, kilo 2, el resto 0) y
  `cantidadTexto` y la cifra grande (`CifraQueCuenta decimales=`) la usan: «0.70 m», «9.00 m», «12.25 m».
- **Por qué un campo nuevo y no subir `decimales`:** `UNIDADES_INSUMO.decimales` también manda `cantidadAPedir` (lo que se le pide al proveedor, hacia
  arriba, metros de 10 en 10 cm: 15.12 m → 15.2 m, con su prueba). Subirlo habría cambiado en silencio cuánta tela se pide. Ver y pedir son dos resoluciones.
- **Alcance:** `cantidadTexto` lo usan también Resumen de Producción, Recibir, Orden de insumos, Retirar color y las decisiones del Taller: todas
  muestran los metros con dos decimales. Sin cambio en la base ni en las funciones.
- **Verificado:** vitest completo 744/744 (se actualizaron 15 afirmaciones de texto en 4 archivos que fijaban «13 m», «150 m»…, más 2 pruebas nuevas), Knip limpio, `tsc` limpio; en el
  navegador con una página temporal (ya borrada): «0.70 m», «0.70 m / 9.00 m», «12.25 m», avío en unidades sin decimales; a 375 px el desborde de la fila
  de lote queda igual que antes (se apretó el espacio entre columnas solo en celular).
- **Pendiente (no hecho, decide Felipe):** la misma tela se escribe con cuatro formateadores (`cantidadTexto`, `cantidadConUnidad` de la página de la orden,
  `cantidadConUnidad` de órdenes de insumo y `cifraDeCantidad`): en una misma frase de las decisiones salen «155.00 m en camino» y «35 m a Textiles Andinos».
  Y la base guarda 3 decimales (`numeric(12,3)`; el comprobante los admite): con dos a la vista, 12.345 m se lee «12.35 m».
