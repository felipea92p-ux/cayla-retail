## 2026-11-16 (La foto de catálogo sale planchada y la hoja de fotos ya no encima sus botones)
Qué hice: la ficha que viaja a la IA pide la prenda PLANCHADA al vapor con la textura de su tejido a la vista (`lib/ficha-foto-ia.ts`), y ya no le
cuenta que la tela «se arruga» (la ayuda del lino decía «Se arruga (es parte de su gracia)»). El seersucker no se plancha. La hoja «Fotos de <color>»
de Editar producto pasó a ancha (768), sus botones se acomodan en vez de montarse, «Principal» dice «Hacer principal», el combo no sale de su
columna, «Ponerla primera» va al final, el foco no cae en un botón al abrir y «Listo» queda pegado abajo (`pie-hoja-fijo`: con tres fotos
quedaba bajo el borde; lo encontró `/milimetro`, informe en `docs/milimetro/auditorias/2026-11-16-hoja-fotos-de-un-color.md`). Antes, la foto «WhatsApp Image…» que no subía: Sentry mostró que
Safari no podía leer ni sus primeros bytes (165 KB, NotReadableError), el archivo estaba en la nube sin descargar; el aviso era correcto.
Por qué así: el pantalón de lino Crudo salía arrugado; el pedido lo pedía sin querer. Se dice en positivo y sin «arrugas» (act. (c) del ADR-0659) y
solo en la ficha, para no tocar el cuerpo medido (sus siete huellas siguen iguales). Medido en una página de prueba local: antes 3 a 4 piezas
encimadas por caso; después, ninguna, a 1440 y 375 px.
Felipe se lleva: las fotos ya hechas no cambian solas; se rehacen subiendo la foto real con «Catálogo con IA» encendido, primero el color molde.
Riesgo sin medir (octubre): en una prenda rayada, la IA podría redibujar las rayas; ahí, «Usar mi foto». ADR-0659 act. 2026-11-16 (d).

## 2026-11-16 (El campo de archivo escondido ya no lo encuentra el lector de pantalla)
Qué hice: el `<input type="file">` escondido de `BotonFoto` lleva `aria-hidden` (el botón «Agregar…», con su nombre, es el único camino), y el de
`AdjuntosCompra`, `FotoDelComprobante` y `CuadrarConExtracto`, además, sale del orden de Tab. El medidor de `/milimetro` ya no cuenta lo que está bajo
`aria-hidden`. Medido con la hoja de fotos: 0 campos de archivo en la foto ARIA, Tab solo por los 5 botones, el selector se sigue abriendo.
Por qué así: lo encontró la auditoría de la hoja (WCAG 4.1.2), y Tab se detenía en un campo invisible en los otros tres. Es el arreglo que ya tenía
`ElegirDibujoDeInsignia`. Felipe se lleva: queda aparte la hoja de SUNAT (`SubirPropuestaSireModal`): la guía de foco pone el cursor en su input de
archivo escondido, y el arreglo es de la guía (`irAlIdCampo`).

## 2026-11-16 (La guía de foco no lleva el cursor a un archivo escondido)
Qué hice: `irAlIdCampo` ya no pone el cursor en un input de archivo escondido (fuera de Tab): lo pone en el botón que lo abre, y `CampoGuiado` le une
el error a ese botón. La hoja del SIRE: su input sale de Tab y del lector, como los de las fotos. ADR-0284 act. 2026-11-16 (k).
Por qué así: al pedir lo que falta en «Subir la propuesta del SIRE», el cursor caía en un cuadrito invisible y sin nombre. Un input de archivo dentro
de su `<label>` (Existencias) sí es el control, y sigue recibiendo el cursor. Felipe se lleva: medido en el navegador con la guía real y con la hoja
del SIRE; las pruebas no tienen DOM, así que no hay prueba automática de a dónde va el foco.
