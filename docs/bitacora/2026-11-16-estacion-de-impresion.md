# 2026-11-16 · Imprimir sin cuadro y la estación de la caja (ADR-0670)

- **Qué:** seis actividades de `/construir` en `claude/estacion-de-impresion` (encima del PR #1889). (1) Una hoja que se cierra ya no le
  quita el foco a la que abre en su lugar (`components/ui/Modal.tsx`: bajo 1024 px, Enter no llegaba a «Venta registrada»). (2) Los íconos
  «CAYLA Caja» / «CAYLA Etiquetas» marcan su ventana (`?ventana=`) y todo `window.print()` del ERP frena lo que no va a su impresora
  (`lib/ventana-de-impresion.ts`). (3) La cola `retail.impresiones` con `pedir/tomar/marcar_impresion` y `fn_impresion_estado` (migración
  `20261116204000`). (4) «Imprimir en la caja» en el piso. (5) La estación de la caja con voz. (6) Guías, ADR y PR.
- **Verificado:** en local con la impresora simulada: foco a 800 px; A4 frenado en «caja» y ticket frenado en «etiquetas»; el celular a
  375 px con «En la cola de la caja» → «Impresa en la caja»; la estación imprime una vez en 3 s, dice el monto y, encendida tras estar
  apagada, saca las pendientes en orden. `pnpm pruebas:cola-de-impresion` 18/18 (con control y dos sesiones reales). Suite de la web,
  `tsc`, lint y Knip en verde. Base local restaurada tras cada prueba.
- **No verificado:** con papel y Chrome `--kiosk-printing` reales, en Windows, ni el aviso de tiempo real de `ventas` (en local el
  WebSocket no conecta; lo cubrió el sondeo de 10 s). **Riesgo:** la migración no está en producción; con los interruptores apagados (de
  fábrica) nada cambia hasta pegarla. **Pegada el 2026-11-16** con el OK de Felipe y comprobada en vivo (tabla, RLS sin políticas,
  índices, permisos y las 4 funciones rechazando sin el módulo).
