## 2026-10-06 (Traslados: cinco traslados simulados en local y tres maquetas visuales para rediseñar la pantalla)
Qué hice: en la base local creé 5 traslados (287 a 291) por las RPC reales, cada uno en una etapa (en camino, atrasado, contándose,
cerrado, con diferencia); y tres maquetas navegables en `docs/maquetas/traslados-visual-2026-10/` —A Ruta, B Mapa, C Horizonte—
con un cajón común donde se cuenta a ciegas, se confirma y se revisa una diferencia, en claro, oscuro y celular.
Por qué así: Felipe vio la pantalla con datos y la encontró poco visual y llena de texto; las maquetas usan el idioma de
Movimientos (ADR-0353: sello, viaje, botones-cifra, cajón) para que los dos módulos se lean igual, y respetan el conteo a ciegas
(ADR-0239 D-130): mientras la caja viene, la pantalla dice qué prendas trae, nunca cuántas.
Felipe se lleva: abrir `index.html` (servidor `maquetas`, puerto 8791), elegir A, B, C o una mezcla, y decidir si Traslados
recibe el movimiento rico de Movimientos; las cinco decisiones están al final del README de la carpeta.

## 2026-10-06 (Traslados: segunda ronda de maquetas — Pases, La puerta, Conversaciones)
Qué hice: tres maquetas nuevas en la misma carpeta, cada una sobre algo que la gente ya sabe usar: D · Pases (un pase de abordar
TAL → TRU que se da vuelta para contar y recibe un sello), E · La puerta (la tienda dibujada con cajas 3D; se cuenta tocando
cada prenda y se arrastra la caja al almacén o al piso) y F · Conversaciones (un chat por sede, como WhatsApp, con vistos).
Por qué así: A, B y C seguían pidiendo leer o entender una leyenda; Felipe pidió más interactivas, entendibles y amigables. Cada
nueva ordena los traslados distinto (urgencia, lugar, sede) y conserva el conteo a ciegas y lo de ADR-0239.
Felipe se lleva: abrir `index.html` y elegir D, E, F o una mezcla; las cuatro decisiones de la segunda ronda están en el README.
