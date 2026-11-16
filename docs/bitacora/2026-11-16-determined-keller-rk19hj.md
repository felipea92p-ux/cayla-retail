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
