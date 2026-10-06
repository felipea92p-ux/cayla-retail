## 2026-10-06 (Nace `/unificar`: cuántas formas tiene cada pieza del ERP, con capturas, y la que Felipe elija queda como única — ADR-0358)
Qué hice: la skill `/unificar` y su motor (`apps/web/unificar/`, Playwright sobre el auditor de tema) que recorre el ERP en local, reconoce 40 familias de piezas (los botones por lo que hacen, insignias, pestañas, tablas, cifras, campos, iconos, gráficos…), cuenta sus formas distintas, captura cada una y arma una lámina con las variantes lado a lado y una propuesta en claro y oscuro; la regla «Una función, una pieza» en `CLAUDE.md` y `lib/unificar.test.ts`, que hará cumplir cada decisión con su deuda.
Por qué así: elegir es una conversación con Felipe (capturas, recomendación, pregunta), por eso skill y no agente; y contar 40 familias en 77 pantallas a mano no se repite igual dos veces, por eso un motor sin IA que mide el DOM.
Felipe se lleva: el primer censo (ADR-0358, «Qué había») y una propuesta de ejemplo para «Volver»; falta que elija las primeras familias.

## 2026-10-06 (Primera ronda de /unificar: Volver, Pestañas y Tarjetas de cifra, decididas y aplicadas en todos los módulos)
Qué hice: Felipe eligió las tres recomendaciones; las construí como piezas únicas (`Volver`, `Pestanas` + píldora + segmento de modo, `TarjetaCifra` con una marca por función), las migré en ~100 archivos de todos los módulos sin cambiar qué hace ningún botón, y registré cada decisión con firmas probadas y deuda 0; fotos antes/después de 36 pantallas en `unificar:fotos`.
Por qué así: Felipe pidió verlas aplicadas antes de aprobar, así que se migró en la rama (commits locales, sin subir) y se compara con la misma cuenta y el mismo ancho; lo decidido por ADR quedó intacto.
Felipe se lleva: la página de antes y después por módulo y las preguntas abiertas de cada registro (`docs/unificar/*.md`); falta su aprobación para abrir el PR.

## 2026-10-07 (Felipe eligió mirando: flecha redonda, vidrio en mayúsculas, píldora, caja arena y la tarjeta de Compras)
Qué hice: la página `unificar/elegir.mjs` (39 opciones con su captura: lo que existe, lo aplicado y las propuestas); con su elección traje `main` (la flecha redonda vivía ahí), renumeré el ADR a 0357 (el 0354 ya era el historial de la prenda), cambié la piel de las piezas y pasé a ellas Finanzas, Comprobantes y la billetera de Traslados; fotos antes/después de 36 pantallas con un recuadro numerado en cada pieza que cambió.
Por qué así: elegir por descripción falló (no le gustó lo aplicado el 2026-10-06); y como la ronda 1 ya había pasado las pantallas por pocas piezas, el cambio fue de piel y no de 100 archivos.
Felipe se lleva: `apps/web/unificar/.salida/fotos-despues-eleccion/comparar.html` para aprobar; quedan preguntas en cada registro (`docs/unificar/*.md`).
