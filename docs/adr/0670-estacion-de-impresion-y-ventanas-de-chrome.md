# ADR-0670 — Imprimir sin cuadro: una ventana de Chrome por impresora, y la estación de la caja que imprime lo del piso

- **Fecha:** 2026-11-16 · **Estado:** construido en la rama `claude/estacion-de-impresion` (seis actividades de `/construir`, una por
  commit). **La migración `20261116204000_cola_de_impresion.sql` NO está en producción:** la pega Felipe (una sola parte).
- **Pidió:** Felipe, 2026-11-16: «cuando la venta es por efectivo que solo se haga clic en confirmar pago y ya te imprime la boleta» y
  «que al momento de mandar a imprimir cualquier cosa se imprima directamente sin abrir ningún cuadro de diálogo»; y, de su idea de
  Izipay, que la boleta salga en la caja sin que la colaboradora se acerque. Decidió en preguntas: interruptor por equipo en el piso (habrá
  una impresora inalámbrica después), la cola sale sola cuando la caja vuelve, voz con interruptor, y en la ventana de caja lo que no va a
  la térmica no se imprime y se explica.
- **Sigue a:** ADR-0114 (comprobante térmico), ADR-0180/0366 (Brother), ADR-0304 (ayudante de la Mac), ADR-0603 (tiempo real en `ventas`).

## Lo que se verificó antes de decidir

Chrome sin cuadro (`--kiosk-printing`) **no** imprime en la impresora predeterminada del sistema: imprime en la última impresora que usó
ese perfil, con su papel, márgenes y escala (`selectInitialDestination_` en `print_preview/data/destination_store.ts`;
`isInKioskAutoPrintMode_` en `app.ts`; `STICKY_SETTING_NAMES` en `data/model.ts`; solo la política `PrintPreviewUseSystemDefaultPrinter`
lo cambia). Se probó en una Mac con la Epson y la Brother: un perfil aparte cuya última «impresora» era Guardar como PDF guardó el ticket
solo, sin cuadro, a 80 × 120 mm. La guía que había en el repo decía lo contrario («la predeterminada») y se corrigió.

## Decisión

1. **Una ventana de Chrome por impresora.** «CAYLA Caja» (la térmica) y, en Windows, «CAYLA Etiquetas» (la Brother), cada una con su
   perfil (`--user-data-dir`) y `--kiosk-printing`, calibradas una vez imprimiendo con el cuadro. En la Mac las etiquetas siguen por el
   ayudante (ADR-0304). Las hojas A4 se imprimen desde el Chrome de siempre. La guía visual es el artefacto «Imprimir sin diálogo».
2. **La ventana sabe qué es.** El ícono abre el ERP con `?ventana=caja|etiquetas`; `MarcaDeVentana` (layout raíz, también en el login) la
   guarda en el `localStorage` de ese perfil y la quita de la dirección. Todo `window.print()` del ERP pasa por `imprimirEnEstaVentana`:
   lo que no va a la impresora de esa ventana no se imprime y un aviso dice dónde abrirlo (`lib/ventana-de-impresion.ts`, pura y probada).
3. **«Imprimir solo al cobrar»** (PR #1889): confirmar el cobro ya imprime; sin vuelto vuelve sola a una venta nueva.
4. **La cola de impresión en la base** (`retail.impresiones` + `pedir_impresion`, `tomar_impresion`, `marcar_impresion`,
   `fn_impresion_estado`): una pedida viva por venta; la caja toma con `for update skip locked` (dos cajas nunca la misma); una tomada sin
   marcar vuelve a los 2 min y se deja tras 5 intentos; no se toma lo pedido hace más de 12 h ni lo anulado. RLS sin políticas, permisos
   por el módulo Vender y la sede, en la base. No entra a la publicación de tiempo real: la caja ya escucha `ventas`.
5. **El piso:** «Imprimir en la caja», interruptor por equipo en «Venta registrada»; la hoja pide la boleta y muestra «En la cola de la
   caja» → «Impresa en la caja» (pregunta cada 3 s, sin loader). Cuando llegue la impresora inalámbrica, se apaga en ese equipo.
6. **La estación:** en «CAYLA Caja», «Imprimir lo que se vende en el piso» (y «Avisar con voz», encendida de fábrica). Montada en el marco
   del ERP: se entera por el aviso de venta nueva (más una segunda mirada a los 2,5 s) y revisa cada 10 s; espera con relojes, no con
   cuadros (con la ventana minimizada no hay cuadros: así se trababa en la primera prueba); nunca imprime encima del recibo de «Venta
   registrada».

DESCARTÉ:
- **Una sola ventana sin cuadro para todo:** con dos impresoras en la misma computadora, la mitad sale en la equivocada (una hoja A4 en la
  térmica son metros de papel).
- **Un ayudante local en Windows** (como el de la Mac) que enrute cada trabajo: más software que mantener en cada PC y sin forma de
  probarlo aquí; la regla del perfil lo resuelve con la configuración que Chrome ya trae.
- **Imprimir sin la cola, escuchando ventas nuevas:** la caja imprimiría también las suyas (dos veces) y una venta del piso con la caja
  apagada se perdería.
- **Publicar `impresiones` en tiempo real:** pide una política de lectura (otra parte que pegar) y no hace falta.
- **Firmar `pedir_impresion` con el responsable:** la venta ya quedó firmada; quien la pide es quien vendió (`ventas.usuario_id`).

SE ROMPE SI:
1. **Alguien abre una hoja A4 desde «CAYLA Caja» con Ctrl+P:** el atajo del teclado no pasa por el freno y sale en la térmica.
2. **La caja estuvo apagada más de 12 h:** esas boletas no salen solas (decisión: no sacar las de ayer de golpe); se reimprimen desde
   Historial.
3. **Dos personas cambian el perfil de un ícono** (lo calibran con otra impresora): esa ventana imprime en la otra. Se arregla calibrando.
4. **La migración no está pegada y alguien enciende un interruptor:** el piso dice «No se pudo mandar a la caja» y la caja «sin conexión
   con la cola»; con los interruptores apagados (de fábrica) nada cambia.

## Producción

Pegar `supabase/migrations/20261116204000_cola_de_impresion.sql` en una sola parte (crea una tabla y funciones nuevas; no toca tablas en
uso ni crea políticas, ADR-0195). Se puede pegar antes o después de publicar la web: los interruptores nacen apagados.
