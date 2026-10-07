## 2026-10-06 (Nace `/unificar`: cuántas formas tiene cada pieza del ERP, con capturas, y la que Felipe elija queda como única — ADR-0358)
Qué hice: la skill `/unificar` y su motor (`apps/web/unificar/`, Playwright sobre el auditor de tema) que recorre el ERP en local, reconoce 40 familias de piezas (los botones por lo que hacen, insignias, pestañas, tablas, cifras, campos, iconos, gráficos…), cuenta sus formas distintas, captura cada una y arma una lámina con las variantes lado a lado y una propuesta en claro y oscuro; la regla «Una función, una pieza» en `CLAUDE.md` y `lib/unificar.test.ts`, que hará cumplir cada decisión con su deuda.
Por qué así: elegir es una conversación con Felipe (capturas, recomendación, pregunta), por eso skill y no agente; y contar 40 familias en 77 pantallas a mano no se repite igual dos veces, por eso un motor sin IA que mide el DOM.
Felipe se lleva: el primer censo (ADR-0358, «Qué había») y una propuesta de ejemplo para «Volver»; falta que elija las primeras familias.

## 2026-10-06 (Primera ronda de /unificar: Volver, Pestañas y Tarjetas de cifra, decididas y aplicadas en todos los módulos)
Qué hice: Felipe eligió las tres recomendaciones; las construí como piezas únicas (`Volver`, `Pestanas` + píldora + segmento de modo, `TarjetaCifra` con una marca por función), las migré en ~100 archivos de todos los módulos sin cambiar qué hace ningún botón, y registré cada decisión con firmas probadas y deuda 0; fotos antes/después de 36 pantallas en `unificar:fotos`.
Por qué así: Felipe pidió verlas aplicadas antes de aprobar, así que se migró en la rama (commits locales, sin subir) y se compara con la misma cuenta y el mismo ancho; lo decidido por ADR quedó intacto.
Felipe se lleva: la página de antes y después por módulo y las preguntas abiertas de cada registro (`docs/unificar/*.md`); falta su aprobación para abrir el PR.

## 2026-10-06, por la tarde (Felipe eligió mirando: flecha redonda, vidrio en mayúsculas, píldora, caja arena y la tarjeta de Compras)
Qué hice: la página `unificar/elegir.mjs` (39 opciones con su captura: lo que existe, lo aplicado y las propuestas); con su elección traje `main` (la flecha redonda vivía ahí), renumeré el ADR a 0357 (el 0354 ya era el historial de la prenda), cambié la piel de las piezas y pasé a ellas Finanzas, Comprobantes y la billetera de Traslados; fotos antes/después de 36 pantallas con un recuadro numerado en cada pieza que cambió.
Por qué así: elegir por descripción falló (no le gustó lo aplicado el 2026-10-06); y como la ronda 1 ya había pasado las pantallas por pocas piezas, el cambio fue de piel y no de 100 archivos.
Felipe se lleva: `apps/web/unificar/.salida/fotos-despues-eleccion/comparar.html` para aprobar; quedan preguntas en cada registro (`docs/unificar/*.md`).

## 2026-10-07 (Felipe respondió las preguntas abiertas de la ronda 1 de /unificar, viéndolas con la pantalla real)
Qué hice: una página con las seis preguntas (pantalla real de hoy y cómo quedaría, con el DOM cambiado en vivo). Con sus respuestas: la flecha de Bajar al piso y Por regularizar sale siempre (el módulo ya lo exige el layout), Producción dice «S/ 0.00» donde hay cero, Apartados en escritorio pasa a `<Pestanas>`, los segmentos de 4 opciones se quedan, y la tarjeta «Caja» del Inicio conserva «Abierta/Cerrada» en grande.
Por qué así: mirar antes de decidir (el 2026-10-06 elegir por descripción falló); y el «—» punteado significa «no hay dato», no «cero».
Felipe se lleva: las cuatro pantallas ya cambiadas; falta enviarle a Dany el aviso (Rendimiento y Clientes) y correr la ronda 2 (`estado`, `accion.nuevo`/`boton`).

## 2026-10-07 (Ronda 2 de /unificar: Felipe eligió mirando, y el censo aprendió a ver el movimiento)
Qué hice: censo nuevo de todo el ERP (240 vistas) y página de elegir con capturas reales cambiadas en vivo; Felipe dejó las insignias como estaban (los chips de Análisis y el líder en negro) y eligió la B para «+ Nuevo / Registrar»: `<Boton>` y un `<BotonEnlace>`/`<BotonAncla>` nuevos con su barrido de luz, el encogerse al presionar y el hilo al guardar, migrados en 21 archivos de 8 módulos (deuda 0). A su pedido, el censo ahora lee el movimiento de cada pieza (al pasar el mouse, al presionar, con el foco, en bucle y al aparecer) y lo mide pasándole el mouse.
Por qué así: Felipe quiere conservar, mejorar y unificar también las animaciones; dos piezas iguales en reposo y distintas en movimiento son dos variantes, y una migración no pierde movimiento. Los botones B copiados a mano no tenían el de la pieza: ahora sí.
Felipe se lleva: `apps/web/unificar/.salida/fotos-despues-nuevo/comparar.html` (14 pantallas antes y después); quedan la pasada de `terminal-ventas` (Vender) y la ronda `boton` (las ~20 versalitas a mano de las hojas).
