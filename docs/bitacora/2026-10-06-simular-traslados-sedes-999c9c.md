## 2026-10-06 (Traslados: cinco traslados simulados en local y tres maquetas visuales para rediseñar la pantalla)
Qué hice: en la base local creé 5 traslados (287 a 291) por las RPC reales, cada uno en una etapa (en camino, atrasado, contándose,
cerrado, con diferencia); y tres maquetas navegables en `docs/maquetas/traslados-visual-2026-10/` —A Ruta, B Mapa, C Horizonte—
con un cajón común donde se cuenta a ciegas, se confirma y se revisa una diferencia, en claro, oscuro y celular.
Por qué así: Felipe vio la pantalla con datos y la encontró poco visual y llena de texto; las maquetas usan el idioma de
Movimientos (ADR-0353: sello, viaje, botones-cifra, cajón) para que los dos módulos se lean igual, y respetan el conteo a ciegas
(ADR-0239 D-130): mientras la caja viene, la pantalla dice qué prendas trae, nunca cuántas.
Felipe se lleva: abrir `index.html` (servidor `maquetas`, puerto 8791), elegir A, B, C o una mezcla, y decidir si Traslados
recibe el movimiento rico de Movimientos; las cinco decisiones están al final del README de la carpeta.
