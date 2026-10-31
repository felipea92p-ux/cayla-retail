# Simulación · todos los modales con el vidrio de «Mi perfil» (2026-10-31)

Felipe pidió (2026-10-31): «analiza el nuevo modal de Mi perfil y haz una simulación de cómo se verían todos los modales actuales si
usáramos esa misma estética». Mi perfil es «A · Cristal líquido» (`docs/maquetas/mi-perfil-2026-10/`, `app/estilos/perfil-vidrio.css`).

Abrir `index.html` en el navegador (no necesita servidor). La barra negra no es parte del diseño: elige **Hoy / Vidrio / Lado a lado**, la
intensidad del vidrio (**Completa**, como Mi perfil, o **Serena**), el tema y el ancho (escritorio o celular de 375 px). Arriba se elige el
modal. Todo se toca y nada se guarda: segmentos con su gota, mosaico, pasos de cantidad, cerrar con la ×, el velo o Escape.

## Qué se simula

Nueve modales que representan los 275 archivos con `<Modal>`/`<ModalRuta>` y los 14 `<Cajon>` del ERP (contados en el código el
2026-10-31), con sus textos de hoy resumidos y datos inventados:

| Tipo | Modal | Archivo de hoy |
|---|---|---|
| Formulario (≈152) | Registrar cliente | `components/NuevaClientaModal.tsx` |
| Formulario con monto | Registrar gasto | `components/GastoRapidoModal.tsx` |
| Botón rojo (≈43) | Anular orden | `components/OrdenModales.tsx` |
| Sin campos (≈70) | Apartado registrado | `components/apartados/ModalesApartado.tsx` |
| Solo lectura (≈53) | Detalle de la venta · A qué tienda le pides | `components/DetalleVentaModal.tsx` · punto de venta |
| Tabla (≈16) | Ajustar inventario | `components/AjustarInventarioModal.tsx` |
| Mostrador | Cobrar | punto de venta |
| Cajón (14) | Proveedor | `components/ProveedorVistaRapida.tsx` |
| Papel | Reimprimir ticket | `components/apartados/ModalesApartado.tsx` |

Cámara (negra en los dos temas) y las hojas de diseño propio (vista rápida, Insignias, Configuración de campaña, Ajustar stock de
Existencias) no se simulan: no se volverían vidrio.

## Las dos intensidades

- **Completa:** Mi perfil tal cual: vidrio al 54 %, filo de luz que gira hacia el mouse, brillo que lo sigue, velo de 14 %.
- **Serena (la recomendación):** el mismo vidrio más opaco (70 %), sin filo ni brillo; las tablas sobre una lámina casi papel (82 %) y
  una hoja con botón rojo vuelve a papel.

El análisis completo (qué hace al vidrio, cómo le va a cada tipo, lo que cuesta y la recomendación) está al pie de `index.html`.

## Los campos sobre el vidrio (Felipe 2026-10-31: «me gusta Serena, pero los text box ya no van con el modal»)

La caja de hoy (hueso con borde) se ve como papel pegado sobre el vidrio. El selector **Campos** de la barra muestra tres caras; las tres
conservan el borde-control (3:1, ADR-0516), el hilo rojo (verde si el dato está bien) y la luz de «Sigue aquí» (ADR-0284):

- **A · Hundido (recomendada):** un pozo tallado en el vidrio, la misma pista hundida del segmento; al escribir, la caja sube como la gota sin volverse sólida (se ilumina por arriba, gana su sombra y deja ver lo de atrás).
  El campo se reconoce por borde y profundidad a la vez.
- **B · Placa:** una placa de vidrio como las filas. La más parecida a Mi perfil, pero un campo y una fila de solo lectura quedan casi iguales.
- **C · Hilo:** sin caja, el dato sobre una línea. La más liviana, pero un campo vacío es solo una raya (cuesta ver dónde tocar).

Las tres arreglan la luz de «Sigue aquí» y la celda cambiada de la planilla, que sobre el vidrio casi no se veían. Falta medir el borde
sobre el vidrio con una prenda oscura detrás (`tema:auditar`).

## Los botones sobre el vidrio (Felipe 2026-10-31: «A, pero ahora también faltan los botones»)

Con los campos hundidos, el idioma es: lo que espera tu dato está hundido; lo que haces sobresale. El selector **Botones** muestra tres
caras; las tres conservan lo de ADR-0358 (borde-control en el secundario, negro → rojo profundo al pasar el mouse, sube 2 px, cruza una luz,
se encoge al presionar) y se aplican también a las píldoras, a las flechas del cajón y a la ×:

- **A · Gota (recomendada):** píldora; el secundario es la gota del segmento, el primario tinta con brillo de vidrio. Cierra el idioma, pero
  dentro de una hoja los botones son píldora y en la pantalla siguen con el radio de hoy.
- **B · Placa:** el radio de los campos; el cambio más chico, pero queda plano junto a los campos hundidos.
- **C · Humo:** el primario también es vidrio ahumado; el más «Mi perfil», pero el primario pierde peso (en Cobrar se ve casi apagado).

## La nota y el aviso sobre el vidrio (Felipe 2026-10-31)

La nota de hoy (`nota-cayla`, losa de hueso) sobre el vidrio es un bloque plano, y en oscuro una losa negra. Una nota no espera un dato
(hundido) ni es una acción (en relieve): explica. El selector **Notas** muestra tres caras; el aviso de atención sigue la misma, con su ámbar:

- **A · Placa (elegida):** lámina de vidrio como las filas.
- **B · Tinte:** sin borde ni relieve, un tinte taupe (ámbar en el aviso) que nace en la «i», puesta en una lente de vidrio, y se
  desvanece en el vidrio.
- **C · Al pie:** sin caja, sobre una línea fina; el aviso de atención pierde fuerza.

## El combo, y botones sin color sólido (Felipe 2026-10-31)

Felipe eligió la nota «A · Placa» y pidió mejorar el combo y que los botones no fueran sólidos.

- **Botones:** el primario es vidrio ahumado de tinta (72 % → 93 %, con su luz arriba) y el peligroso vidrio rojo; los dos desenfocan lo
  de atrás. La gota secundaria quedó más clara. Lo elegido en un mosaico o una lista se marca con borde de tinta y luz, sin relleno sólido.
- **Combo** (selector **Combo**; las tres con el avatar en una lente y la lista de vidrio que se abre al tocarlo):
  - **A · Pozo y gota (elegida):** el cuerpo es el pozo de los campos y la flecha una gota que sobresale.
  - **B · Ficha:** ficha de vidrio en relieve con «Cambiar»; se separa de los campos hundidos.
  - **C · Píldora:** compacta, una línea; pierde «entró a las 9:42», la prueba de asistencia.

## El aviso sobre el vidrio (Felipe 2026-10-31)

Felipe eligió el combo «A · Pozo y gota» y pidió mejorar el aviso: la franja de 3 px se curvaba con la esquina de 18 px como una medialuna
y el ámbar solo vivía en ella. El selector **Aviso** muestra tres caras; las tres ponen el ícono en una lente ámbar que se dibuja al entrar,
y valen igual para error, éxito e info con su color:

- **A · Filo:** la franja se despega del borde y queda como un filo redondeado adentro, con un tinte que nace de él.
- **B · Lente (elegida):** sin franja, la lente más grande y un borde ámbar tenue.
- **C · Borde de luz:** el borde se enciende de ámbar desde la izquierda; en cuatro tonos sería mucha luz.

## La planilla y su movimiento (Felipe 2026-10-31: «mejorar ese tipo de tablas y darle más animaciones»)

Felipe eligió el aviso «B · Lente». La matriz de tallas (12 cajas iguales; el cambio, un anillo gris) ahora dice cuánto cambió cada talla
(+1 / −1), suma cada color (Total) y el pie lo resume. El selector **Tabla** muestra tres caras:

- **A · Celdas vivas (elegida):** números sin cajas; la caja aparece al apuntar (en táctil, siempre). La más limpia, pero esconde − y + al mouse.
- **B · Filas de vidrio:** cada color una placa de vidrio, sus tallas pozos en píldora. Todo a la vista y escala a más tallas.
- **C · Baldosas:** cada talla una baldosa con su número grande; la mejor al dedo, pero el doble de alta.

El movimiento es el de «Ajustar stock» de Existencias (ADR-0494): luz que cruza, filas en cascada, celdas en ola, número que rueda,
diferencia que aparece, total que cuenta, la cruz de fila y talla al pasar el mouse, y cada talla que se sella al guardar. Una vez, sin
rebote ni bucle. Llevarlo a las 16 hojas con tabla es una actualización de ADR-0136 que decide Felipe.

## La barra de pagos (Felipe 2026-10-31)

Felipe eligió la planilla «A · Celdas vivas». La barra de «Detalle de la venta» (`<BarraApilada>`) eran dos bloques planos que no decían
cuánto es cada medio. El selector **Barra** muestra tres caras; en las tres el total cuenta al abrir y cada tramo crece uno tras otro:

- **A · Tubo de vidrio (elegida):** la pista es un pozo y cada tramo vidrio de color; debajo, cada medio con su monto y su parte.
- **B · Etiquetas:** barra de 38 px con el texto adentro; un tramo chico no tiene dónde escribir (a 375 px se corta).
- **C · Fichas:** barra delgada y cada medio en una fila de vidrio con su ícono y una barra fina; el triple de alto.

## Reglas que respeta

Solo tokens (ADR-0169 / ADR-0336), en claro y oscuro; el papel del ticket es `.papel-fijo` y el color de una prenda es dato. Movimiento de
Mi perfil (excepción de ADR-0136, act. 2026-10-31): una vez, sin rebote, apagado con `prefers-reduced-motion`. Una salida a la vista
(la × solo en las hojas que se leen; «Cancelar» en las que guardan). En el celular, la hoja llega desde abajo con su asa (ADR-0479).

## Lo que decidió Felipe

«Serena» para el vidrio (2026-10-31). Los campos: A · Hundido (2026-10-31). Los botones: A · Gota (2026-10-31). Las notas: A · Placa (2026-10-31). El combo: A · Pozo y gota (2026-10-31). El aviso: B · Lente (2026-10-31). La planilla: A · Celdas vivas (2026-10-31). La barra de pagos: A · Tubo de vidrio (2026-10-31).

## La lista de prendas (Felipe 2026-10-31)

La lista de «Detalle de la venta» era una losa casi papel con una muestra de color plana. En las tres caras la prenda sin foto se dibuja
como manda ADR-0333 (ícono de su categoría sobre su color), la talla va en una pastilla y el color con su punto, y el precio en serif.
Selector **Prendas**:

- **A · Filas de vidrio:** cada prenda una fila de vidrio; parece que se toca, como los destinos.
- **B · Lámina de vidrio (elegida):** una placa de vidrio, hilos entre prendas y la talla como insignia en la lente.
- **C · Ticket vivo:** una línea por prenda con puntos guía hasta el precio; en el celular el color no cabe.

**La cara completa elegida:** vidrio Serena · campos A · Hundido · botones A · Gota (sin color sólido) · notas A · Placa · combo A · Pozo y
gota · aviso B · Lente · planilla A · Celdas vivas · barra de pagos A · Tubo de vidrio · lista de prendas B · Lámina de vidrio (2026-10-31). Es lo que muestra la maqueta al abrirla.

**Lo que falta antes de llevarla al código** (pasa por `/unificar`, familia `modal`, módulo por módulo):
1. Medir con `tema:auditar` el contraste del borde de los campos y de los botones sobre el vidrio con una prenda oscura detrás (Existencias).
2. Medir el desenfoque en el Mac mini de tienda con un cajón y una hoja abiertos a la vez (tres capas de `backdrop-filter`).
3. Decisiones de regla que son de Felipe: reescribir la cara única de hoja (ADR-0358, ronda 12); llevar el movimiento de «Ajustar stock»
   (ADR-0494) a toda planilla en una hoja (actualización de ADR-0136); y que en «Celdas vivas» el − y el + se vean al apuntar (ley 6 de
   Formidable y borde de control de ADR-0516). Si elige llevar el vidrio a todas las hojas, pasa por `/unificar` (familia `modal`) y reescribe ADR-0358 ronda 12.
