# Maqueta · Campañas y ofertas (2026-11-13)

> **Estado: propuesta para Felipe. Solo maqueta:** no toca el código del ERP, ni la base, ni producción.
> Nombres y fechas de las campañas: los de la captura de Felipe del 2026-11-13. Prendas, precios, cifras y ofertas: **inventados**.

`index.html` es un solo archivo y se abre con doble clic. La barra negra cambia **dónde vive** el módulo (fila propia o dentro de Insignias),
**claro / oscuro**, abre **«Qué cambia»** (el antes y después y las decisiones de dinero) y **reinicia**.

## Lo que pidió Felipe

1. «El tema de insignias está siendo confuso, poco intuitivo.»
2. En «Configurar», **«Llevar varias y pagar menos»** y **«Gastar un monto y ahorrar»** tienen que estar habilitadas (hoy dicen «Pronto»).
3. «Con el término "insignias" no sabía que se podían aplicar promociones o descuentos desde ese módulo.»

## El orden (Felipe pidió «la mejor manera, para que sea entendible», 2026-11-13)

| Palabra | Responde | Cambia el precio | Dónde vive |
|---|---|---|---|
| **Insignia** | ¿Qué es esta prenda? (Nuevo, Hecho a mano, Últimas unidades) | **Nunca** | Catálogo ▸ Insignias (Rotación · Artesanal · General) |
| **Campaña** | ¿Qué fecha celebramos? (Black Friday, Navidad, o sin fecha de fin) | Solo a través de sus ofertas | Catálogo ▸ Campañas y ofertas |
| **Oferta** | ¿Qué paga de menos el cliente? (−20 %, 3x2, S/ 30 desde S/ 300) | Sí: es lo único que cambia lo que cobra la caja | Dentro de cada campaña |
| ~~Liquidación~~ | — | — | **Se elimina** (Felipe 2026-11-13: «nunca se ha usado y solo causa confusión») |

La regla: **¿cambia lo que paga el cliente? → Campañas y ofertas. ¿Solo dice algo de la prenda? → Insignias.** En la maqueta: botón «El mapa»
(también el enlace «¿Insignia, campaña u oferta?» de cada cabecera) y la pantalla Insignias navegable desde el menú, donde «Para liquidar» y
«Sorteo» —hoy insignias con descuento (ADR-0473)— ya aparecen como campañas sin fecha de fin (decidido por Felipe el 2026-11-13). La hoja «Pasarla a una campaña» queda en el código para mostrar el antes y el después, pero no se ve: la maqueta arranca en el estado ya decidido.

Por qué fila propia y no dentro de Insignias: Felipe no encontró los descuentos dentro de «Insignias»; la fila propia ya existió el 2026-10-22
(ADR-0473) y se juntó con Insignias al día siguiente (ADR-0481), cuando una campaña era solo fechas y un %. Hoy tiene ofertas. El módulo `campanas`
sigue existiendo en Roles y accesos: separar no cambia quién ve qué ni toca la base.

## Qué propone la maqueta

| Hoy (Catálogo ▸ Insignias ▸ Campañas) | En la maqueta |
|---|---|
| Las ofertas viven dentro de «Insignias»: nadie busca un descuento ahí | Fila propia en Catálogo: **Campañas y ofertas**. Insignias se queda con Rotación, Artesanal y General. El módulo `campanas` ya existe en Roles y accesos (solo perdió su fila del menú el 2026-10-22), así que no cambia quién ve qué |
| Cuatro botones por campaña: Editar, Prendas, Configurar, Desactivar | Una lista de tres preguntas (**Qué le das · En qué prendas · Cuándo y dónde**; la pregunta de prendas cambia según la oferta) con ✓ o «Sigue» y **un** botón, «Preparar la campaña». Nombre, ícono, fechas, prendas sueltas, repetir y desactivar van en «Más» |
| «Configurar» solo abría las ofertas; las prendas se elegían en otra hoja | Una sola hoja con tres pasos más «Revisar y activar»; se puede saltar entre pasos |
| Las prendas sueltas se marcaban en otra hoja («Prendas») | En el paso «En qué prendas»: **Por categoría** o **Prenda por prenda** (buscador, filtro por categoría, grilla con el color de la prenda; se marca el modelo con todas sus tallas y colores). Se combinan: «todas las blusas + Polo Brisa». Abajo, «55 prendas entran» con cada categoría y prenda quitable |
| La etiqueta de la derecha esperaba «a que llegue a una prenda» | Una **compra de prueba** que se cobra en vivo: se ve el 3x2 o el descuento por monto antes de activar |
| «Llevar varias» y «Gastar un monto»: «Pronto» | **Habilitadas.** Llevar varias: 3x2 (N x M), N por S/ X, la N.ª al X %; el grupo se arma con cualquier prenda de la campaña o solo del mismo modelo. Monto: desde S/ X ahorra S/ Y o Y %, con hasta 3 escalones; cuenta solo prendas de la campaña o toda la compra. Regalo y Club siguen en «Pronto» |
| Una campaña sin oferta no decía que no cambia precios | Lo dice: «sin oferta, la campaña solo pone su insignia» |

## Decisiones que son de Felipe (dinero) — la maqueta usa la propuesta

1. **Decidido (2026-11-13): no se suman.** Una prenda tiene una sola oferta **por tienda y por día** (ver 8).
2. **Decidido (2026-11-13): la más barata va gratis**; si cuestan lo mismo, cualquiera.
3. **Decidido (2026-11-13): el monto no se junta con otra oferta.** Las prendas que ya tienen otra oferta no cuentan para llegar al monto. Y la
   hoja no deja aplicar una doble oferta: si un monto choca con otra campaña (misma tienda y días), lo avisa y no deja activar hasta elegir
   «que esas prendas no cuenten» o que la otra campaña ceda. Si la otra campaña baja toda la tienda, la hoja advierte que el monto no le llegará a nadie ahí.
4. **Decidido (2026-11-13): se configura en cada oferta** — toda la compra, unas categorías o unas prendas.
5. ~~¿Una insignia deja de bajar precios?~~ **Decidido por Felipe (2026-11-13):** sí. «Para liquidar» (−20 %) y «Sorteo» (gratis) pasan a
   Campañas y ofertas como campañas sin fecha de fin, con las mismas prendas; el cliente paga lo mismo. Al construirlo, el paso es una migración
   de datos única (insignia → campaña con su oferta), que espera el OK de Felipe para pegarse en producción.
6. **Decidido (2026-11-13): se elimina el módulo Liquidación** (ADR-0379): nunca se usó y confunde con «Para liquidar». Es un trabajo aparte (menú, módulo, funciones de la base y `registrar_venta`), con su ADR y su OK para producción.
7. **Decidido (2026-11-13): las prendas con oferta mantienen cambio y devolución** (15 días, como hoy), con el **reparto proporcional** en el 3x2. Felipe propuso prohibirlos; se descartó porque INDECOPI multó a Saga Falabella con S/ 42,800 por «No se aceptan cambios ni devoluciones» en un outlet (Resolución Final N.º 2323-2025/CC2, Perú Retail 2025-09-23). Lo investigado: INDECOPI no deja negar el cambio de una prenda en oferta
   (El Peruano, 16-06-2026; multas a Falabella y Oechsle). Propuesta «B», como Target: al vender, el ahorro del grupo se reparte entre sus prendas en
   proporción a su precio (Blusa 79.90 → 61.11, Polo 49.90 → 38.17, Polo 39.90 → 30.52 = S/ 129.80), y cada línea va así a SUNAT. Cambio a otra talla o
   color del mismo modelo: diferencia S/ 0. Por otro modelo: precio nuevo menos lo pagado por esa prenda (regla de hoy, ADR-0380). Devolución: se
   devuelve lo pagado por esa prenda (nota de crédito 07 exacta). No toca `registrar_cambio` ni la nota de crédito. Alternativa «C» (recalcular el
   grupo) más exacta pero con columna nueva y notas de crédito que no calzan con una línea.
8. **Decidido (2026-11-13): una prenda, una oferta por tienda y por día.** El 3x2 de polos en Trujillo y el −20 % de polos en Arequipa conviven. Si al
   configurar una oferta choca con otra en la misma prenda, tienda y días, la hoja lo muestra tienda por tienda y no deja activar hasta resolverlo
   (que la otra campaña ceda esas prendas esos días, o cambiar tiendas, fechas o prendas). La caja nunca elige entre dos ofertas (principio 2).
   En la maqueta: Previos al Black Friday choca con Black Friday del 17 al 21.

## Lo que la maqueta no resuelve

Hoy la caja solo cobra un porcentaje por campaña (`fn_campanas_por_variante`: gana el mayor %) y `registrar_venta` rechaza lo que no coincida.
Habilitar 3x2 y monto cambia `registrar_venta`, el ticket, el comprobante a SUNAT (descuento por línea vía Lucode) y la tienda web.
Va por oleadas, con su ADR, y cada una espera el OK de Felipe. La hoja de hoy es `apps/web/components/sellos/OfertasHoja.tsx` (ADR-0496)
y la pantalla, `apps/web/components/sellos/SellosPantalla.tsx` (ADR-0481).
