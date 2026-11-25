# ADR-0670 — Imprimir sin cuadro: una ventana de Chrome por impresora, y la estación de la caja que imprime lo del piso

- **Fecha:** 2026-11-16 (act. 2026-11-24: interruptores encendidos de fábrica) · **Estado:** construido en la rama `claude/estacion-de-impresion` (seis actividades de `/construir`, una por
  commit). La migración `20261116204000_cola_de_impresion.sql` está en producción desde el 2026-11-16 (con el sí de Felipe).
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
3. **«Imprimir solo al cobrar»** (PR #1889): confirmar el cobro ya imprime; sin vuelto vuelve sola a una venta nueva. *(Cambió el
   2026-11-25: encendido de fábrica en un computador y sin la hoja, haya vuelto o no; ver la actualización al final.)*
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

## Actualización 2026-11-16 (b): el Chrome de siempre, sin íconos aparte

Felipe, al ver la guía de Trujillo: «No hay forma de que se haga mediante abrir el Chrome que siempre usan? … tener distintos accesos de
Chrome puede ser confuso», y después: «que se pueda imprimir sin tener que cambiar el flujo de las colaboradoras, solo acortar pasos. Las
computadoras estarán fijas, así que nunca habrá dos impresoras en una sola computadora». Con UNA impresora por computadora, el motivo de
los perfiles aparte (que la mitad no saliera en la impresora equivocada) desaparece.

1. **Windows:** el Chrome de siempre lleva `--kiosk-printing` en su ícono de la barra de tareas (y del escritorio). Se calibra una vez con
   el cuadro, se apaga «seguir en segundo plano» (si no, la opción no se aplica al volver a abrirlo) y las hojas A4 de esa computadora van
   por Microsoft Edge. El ERP se abre una vez con `?ventana=etiquetas`: frena una hoja A4 o un ticket y dice dónde imprimirlo.
2. **Mac:** el ayudante (ADR-0304) imprime también la boleta, desde la versión 3 de `servidor.sh`. `components/impresion/imprimirBoleta.ts`
   mide `#comprobante-print` con las reglas de impresión de `globals.css` copiadas a una copia invisible, manda el documento con
   `@page{size:80mm <largo>mm}` a `POST /imprimir?tipo=ticket&largo=<mm>` y el ayudante lo imprime con `lp -o media=Custom.80x<largo>mm
   -o TmxPaperCut=CutPerJob` en la ticketera que encuentra (`buscar_ticketera`: la cola que no es Brother y parece térmica). Todo ticket
   pasa por ahí: Venta registrada, Detalle de la venta, Cambios, Apartados y la estación de la caja. En esa Mac la estación se enciende
   sin marcar la ventana.
3. **Si el ayudante falla,** el botón cae al cuadro de siempre con un aviso que dice por qué; la estación nunca cae al cuadro (con la
   ventana minimizada quedaría trabada): la boleta vuelve a la cola.

Verificado sin papel: con una copia del ayudante y una `lp` falsa, la boleta B001-000002 salió en UNA hoja de 80 × 186 mm, centrada,
con el punto del corte al final; con el ayudante caído, aviso y cuadro. Falta la prueba en el papel de Trujillo.

DESCARTÉ:
- **Seguir con un ícono por impresora:** dos Chrome en la misma computadora confunden (Felipe), y con una impresora no hacen falta.
- **La política `PrintPreviewUseSystemDefaultPrinter`:** pide tocar el registro de Windows o un perfil de configuración en la Mac, y en
  la Mac no evita el cuadro.
- **Dejar que el driver ponga el largo (papel `RP80x2000` y recorte):** depende del recorte de la Epson; medir da un PDF exacto de una
  hoja, y el recorte sigue de respaldo (se mide con 3 mm de holgura).

SE ROMPE SI:
1. **Alguien abre Chrome en el almacén desde un enlace (WhatsApp, correo) con Chrome cerrado:** esa sesión abre el cuadro. Se cierra
   Chrome y se abre desde la barra.
2. **Se imprime algo que no es del ERP desde el Chrome del almacén (Ctrl+P en una web):** sale en la Brother. Va por Edge.
3. **La Mac tiene un ayudante viejo (v2):** la boleta sigue saliendo por el cuadro, como antes; se vuelve a pegar la línea.
4. **Una regla de impresión de la boleta deja de estar en `@media print` de un `.css` propio:** la medida no la ve y la boleta se partiría
   en dos hojas. Hoy todas viven en `globals.css`.

## Actualización 2026-11-24: los dos interruptores vienen encendidos donde les toca

Pedido de la cuenta del equipo, el 2026-11-24: «Cuando se hace boleta o comprobante desde celular no se imprime en la caja, debe estar
marcado por defecto e imprimir de manera automática». En ocho días no salió ni una boleta del piso (0 filas en `retail.impresiones`,
bitácora `2026-11-24-mobile-sales-flow-31a365`). Para que salga hacen falta los dos interruptores: el del celular («Imprimir en la caja»)
y el de la caja («Imprimir lo que se vende en el piso»). Los dos nacían apagados y vivían al pie de «Venta registrada», donde nadie los
encendió.

1. **«Imprimir en la caja» viene encendido en el aparato sin mouse** (`(pointer: coarse) and (hover: none)`: celular y tablet) y apagado
   en la computadora, que imprime donde cobra (`lib/imprimir-al-cobrar.ts`, `enLaCajaDeFabrica`). Para eso, `preferenciaLocal` acepta un
   valor de fábrica que depende del aparato (`deFabricaDelEquipo`). Se pregunta solo si el equipo no tiene nada guardado, así que lo
   elegido a mano gana. El servidor, que no sabe qué aparato es, sigue en «no».
2. **«Imprimir lo que se vende en el piso» viene encendido** (`lib/estacion-de-impresion.ts`). En los demás equipos ese «si» no hace nada:
   la estación solo trabaja donde se imprime sin cuadro (`estacionActiva`: la ventana «CAYLA Caja» o la Mac con la ticketera en su
   ayudante). «Avisar con voz» sigue encendida. «Imprimir solo al cobrar» sigue apagado: no se pidió, y donde no hay `--kiosk-printing`
   abriría el cuadro en cada venta. *(Se pidió al día siguiente: encendido en la computadora desde el 2026-11-25, ver abajo.)*
3. **En el celular, «Venta registrada» ya no ofrece «Imprimir y nueva venta»**: con «Imprimir en la caja» encendido, la hoja pide la
   boleta apenas se abre y muestra «Mandando a la caja» → «En la cola de la caja» → «Impresa en la caja». Su botón principal pasa a ser
   «Nueva venta» y debajo queda «Imprimir aquí». Esa hoja ya existía: lo único que cambia es que llega sola.

DESCARTÉ:
- **Encender «Imprimir en la caja» en todo equipo:** la Mac de la caja sabe que es la caja preguntándole a su ayudante, y la respuesta
  llega después de abrir la pantalla. Su primera venta podía irse a la cola en vez de imprimirse ahí. Una PC sin `?ventana=caja` se
  mandaría sus propias boletas, y una Mac de oficina las dejaría en una cola que nadie toma.
- **Decidir por el ancho de la pantalla (menos de 640 px):** una ventana angosta de la computadora mandaría la boleta a la caja. Una tablet,
  que tampoco tiene impresora, se quedaría afuera.
- **Pasarlo a la cuenta, en la base:** la decisión es del aparato y no de la persona (la misma colaboradora cobra en la Mac y en su
  celular), y no vale una columna nueva.
- **Encenderlo encima de lo que alguien apagó:** quien lo apagó tuvo un motivo, por ejemplo una impresora en el piso.

SE ROMPE SI:
1. **Una tablet que sí imprime (AirPrint) donde nadie tocó el interruptor:** su boleta va a la cola de la caja. Se apaga una vez en esa tablet.
2. **La caja de la sede no tiene la estación activa:** puede ser una Mac sin el ayudante v3 con la ticketera, una PC sin `?ventana=caja`, o
   una estación que alguien apagó. El celular dice «En la cola de la caja» y la boleta no sale. La pedida espera hasta 12 h y sale sola al
   encender la estación. Mientras tanto quedan «Imprimir aquí» y la reimpresión desde Historial.
3. **La caja tiene elegida otra sede:** la estación toma solo la cola de su sede activa, así que lo del piso de otra sede no sale ahí. Ya
   pasaba antes de este cambio.

**(b) La Mac vuelve a preguntar si es la caja.** Esa misma tarde, en producción, la estación de TRU imprimió cinco boletas del piso
(17:10 a 17:38) y después se apagó sola: dos boletas quedaron en la cola sin que nadie las tomara (0 intentos) hasta recargar. La Mac
sabe que es la caja preguntándole a su ayudante si ve la ticketera, y solo lo preguntaba al abrir la página. Bastaba que una respuesta
fallara para que dejara de ser la caja hasta recargar, y nadie lo notaba. Pasaba de dos formas: el ayudante tardaba más de 5 s, o una
boleta no salía y el código borraba la respuesta sin avisar. El comentario del código ya prometía «cada cuánto se vuelve a preguntar»,
pero nada lo hacía. Ahora la pregunta vive en `lib/ayudante-de-boletas.ts`:

- Mientras alguien escucha (la estación o «Venta registrada»), la Mac vuelve a preguntar cada 30 s y apenas la pestaña vuelve a verse.
  Usa un solo reloj, solo en una Mac.
- Si una boleta no sale, pregunta de nuevo enseguida y, hasta que llegue la respuesta, vale la última.
- `lib/boletas-por-ayudante.test.ts` recorre el caso de TRU sin recargar. Sin el arreglo falla en 3 de sus 6 casos.

Se probó en el navegador con un ayudante de mentira: la insignia se va a los 29 s de perder la ticketera, vuelve a los 30 s de
recuperarla y, al volver a la pestaña, vuelve en el acto.

## Actualización 2026-11-25: confirmar el cobro imprime y vuelve solo, sin la hoja «Venta registrada»

El equipo, al ver la hoja en Vender: «debería imprimirse de manera automática cuando se confirme el cobro y ya omitirse que aparezca eso».
Eligió (con las opciones a la vista) **sin hoja, salvo excepciones**, y **en todo equipo menos celular y tablet**. Cambia el punto 3.

1. **«Imprimir solo al cobrar» nace encendido en la computadora y apagado en el celular o la tablet** (`lib/imprimir-al-cobrar.ts`): el
   mismo criterio y el mismo mecanismo que «Imprimir en la caja» el 2026-11-24 (`MQ_SIN_IMPRESORA`, `deFabricaDelEquipo`), al revés. Lo
   que un equipo ya guardó se respeta. Juntos: la computadora imprime sola donde cobra; el celular manda la boleta a la cola de la caja.
2. **Encendido, Vender no abre la hoja:** monta el recibo sin dibujar nada (`components/punto-de-venta/ImpresionAlCobrar.tsx`), lo manda
   a imprimir, vuelve a una venta nueva y, cuando la boleta ya se mandó, avisa «Venta de S/… registrada · Boleta B001-… · Vuelto S/…»
   con «Reimprimir» (el aviso propio del ayudante se calla: `imprimirBoleta({ conAviso: false })`). El vuelto ya lo dijo la hoja de cobro.
3. **La hoja aparece solo cuando hay algo que ver o hacer con ella** (`queHacerAlRegistrar`): sin conexión o sin comprobante, «Imprimir en
   la caja», el WhatsApp de la boleta (imprime al abrirse y se queda), o la boleta que no salió (`frenada`: la ventana no imprime tickets;
   la hoja dice «La boleta no salió» y espera el botón). El vuelto ya no la deja abierta.
4. **Cambios** usa la misma preferencia: el comprobante nuevo de un cambio con diferencia también sale solo en un computador (#1910).

DESCARTÉ:
- **Sin hoja nunca:** una boleta que no sale (la ventana de etiquetas, el freno) quedaría sin nadie que lo note en el momento.
- **Solo encender lo que ya existía:** con vuelto la hoja se quedaba abierta, y eso es justo lo que se pidió quitar.
- **Encenderlo también en el celular:** abriría el cuadro de imprimir o guardar PDF en cada venta del piso.

SE ROMPE SI:
1. **Un computador sin impresión directa** (Windows sin `--kiosk-printing`, Mac sin el ayudante v3): cada venta abre el cuadro de
   impresión. Es un clic en vez de los dos de antes; se arregla configurando la impresión directa, no apagando esto.
2. **Hay que apagarlo en un equipo:** el interruptor vive en la hoja, que ahora casi no aparece. Se llega a ella con una venta con
   WhatsApp o con «Imprimir en la caja»; si pasa seguido, el interruptor necesita otro lugar (pendiente en el backlog).
3. **Una caja táctil sin mouse** (un todo en uno que el navegador ve como `(pointer: coarse) and (hover: none)`): arranca como un
   celular, mandando a la caja; se cambia una vez en su hoja.
