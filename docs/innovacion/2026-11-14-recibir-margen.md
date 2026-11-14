# Innovar · Recibir ▸ el margen a la vista — 2026-11-14

> **Pasada rápida — sin escéptico, puede traer ideas que no aguantan.** La pregunta «¿ya existe?» se hizo a mano con `grep` en el código y en los ADR.

- **Alcance:** lo que cambió en la rama `claude/recibir-margen-a-la-vista-76b2f4` (PR #1861): `<LineaMargen>` en Recibir (prenda nueva, «Llevar al stock», cierre) y Nuevo producto
- **Modo:** rápido (sin agentes y sin web; la fuente es el radar) · **SHA analizado:** `a13edf81a` · **Radar usado:** 2026-11-13
- **Resultado:** 6 propuestas (3 Ahora · 3 Visión) · 2 descartadas · 1 derivada

## Qué es y qué problema resuelve hoy

Al registrar mercadería, quien pone el costo y el precio de una prenda ahora ve al lado «Ganas S/ 34 · 48 %», que cambia mientras escribe: verde con 30 %
o más, ámbar debajo y rojo si pierde. Antes el margen solo aparecía bajo 30 % o con el costo cambiado. La cuenta es la de Nuevo producto
(`margenPorcentaje`, `lib/alta-producto.ts:81`): **precio con IGV contra costo tal cual**, «una alerta, no contabilidad».

**El hallazgo de esta corrida:** Compras ya hace la cuenta de otra forma. `cuentaDeLinea` (`lib/orden-compra-precio-ayuda.ts:238`) le quita el IGV al
precio y, si la compra tiene factura, también al costo. Así, la misma prenda puede decir un margen al comprarla y otro al recibirla.

## Ahora

| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| recibir-margen#1 | Un solo margen en todo el ERP: Recibir y Nuevo producto usan la cuenta de Compras (sin IGV) | Felipe, encargada | El propio ERP (Compras, `cuentaDeLinea`) | 4 | S | Alta | 4,0 |
| recibir-margen#2 | «¿Y con la rebaja?»: el «?» de la línea dice cuánto queda con un 30 % de campaña | quien pone el precio | Shopify Smart Pricing (radar #19) | 3 | S | Media | 2,1 |
| recibir-margen#3 | El cierre dice cuánto deja el envío entero: «Este envío deja S/ 1 240 · 44 %» | Felipe, encargada | sin fuente verificada | 3 | S | Baja | 1,2 |

## Visión

| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| recibir-margen#4 | El costo llega solo desde el XML de la factura del proveedor, y el margen aparece sin escribir nada | quien recibe | Odoo 19, Square Managerbot (radar #31) | 4 | L | Media | 0,93 |
| recibir-margen#5 | Al recibir una prenda que ya rota rápido, la IA propone subirle el precio (no solo cuando el margen es bajo) | Felipe | Shopify Smart Pricing (radar #19) | 3 | M | Media | 1,05 |
| recibir-margen#6 | Margen prometido contra margen logrado, por envío: lo que se esperaba al cerrar y lo que dejó al venderse | Felipe | sin fuente verificada | 4 | L | Baja | 0,53 |

## Detalle de cada propuesta

### recibir-margen#1 · Un solo margen en todo el ERP  ·  Ahora · impacto 4 · esfuerzo S · confianza Alta · **toca lo delicado (dinero)**
- **Hoy:** dos cuentas para la misma pregunta. Recibir y Nuevo producto: `(precio − costo) / precio`, con el IGV dentro del precio (`lib/alta-producto.ts:81`).
  Compras: el precio sin IGV, y el costo sin IGV si hay factura (`lib/orden-compra-precio-ayuda.ts:225-248`, `IGV = 1.18`). Ejemplo: costo S/ 36 y precio S/ 70. Recibir dice 49 %. Compras dice 49 % si la compra
  tuvo factura (S/ 30.51 contra S/ 59.32), pero **39 %** si no la tuvo (S/ 36 contra S/ 59.32): diez puntos que Recibir no ve.
- **Propuesta:** `margenALaVista` (`lib/margen-a-la-vista.ts`) pasa a llamar a `cuentaDeLinea`, con «¿la compra tiene factura?» que el envío ya sabe.
  El umbral de 30 % se compara contra el margen sin IGV, igual que en Compras.
- **El momento que mejora:** Felipe aprueba un precio en Compras viendo «ganas 39 %» por una compra sin factura y, al recibir, la encargada ve «49 %». Una de las dos cifras
  miente, y la gente aprende a no creerle a ninguna.
- **Cómo lo hacen los mejores:** el mismo ERP ya decidió que la ganancia se mide sin IGV (comentario de cabecera de `orden-compra-precio-ayuda.ts`, «TRES COSAS QUE NO SON LO MISMO»).
- **DECIDÍ** traer Recibir a la cuenta de Compras y no al revés: la de Compras es la más fiel y ya tiene prueba. **DESCARTÉ** mostrar las dos
  cifras: el margen se diría dos veces. **SE ROMPE SI** un envío sin dato de factura (sin aviso) cae en «con factura» por defecto: se infla el margen.
  Sin el dato, se usa «sin factura» y la línea lo dice en su «?».
- **Primer paso:** que Felipe decida qué margen manda (es dinero). **Felipe la aceptó el 2026-11-14.**
- **Esfuerzo corregido a M (2026-11-14, al empezar):** la cuenta es de un archivo, pero Recibir hoy no sabe si la compra trae factura. Compras lo
  supone por el RUC del proveedor (`orden-compra-precio-ayuda.ts:12`); en Recibir hay que llevar ese dato del envío a las tres pantallas, y en
  Nuevo producto sale del proveedor elegido.

### recibir-margen#2 · «¿Y con la rebaja?»  ·  Ahora · impacto 3 · esfuerzo S · confianza Media
- **Hoy:** Compras ya dice «con una rebaja de 35 % aún te quedan S/ …» (`conRebaja`, `lib/orden-compra-precio-ayuda.ts:255`). Recibir no lo dice.
- **Propuesta:** un «?» al final de la línea (regla «Poco texto a la vista»: la línea queda igual) que abre «Con 30 % de campaña: ganas S/ 13» con `conRebaja`.
- **El momento que mejora:** quien pone el precio de una prenda que va a entrar a la campaña de temporada sabe en ese momento si la rebaja se come la ganancia.
- **Cómo lo hacen los mejores:** Shopify Smart Pricing sugiere rebajas mirando costo y ventas, y sus reseñas piden ver el porqué
  ([fuente](https://apps.shopify.com/shopify-smart-pricing), jun-2025; radar #19).
- **DECIDÍ** detrás del «?» y no a la vista. **DESCARTÉ** la rebaja de la campaña activa real, porque obliga a leer campañas en Recibir; queda para después.
  **SE ROMPE SI** el % de la rebaja de ejemplo no es el que CAYLA usa: Felipe lo fija.
- **Primer paso:** depende de #1 (la misma cuenta).

### recibir-margen#3 · Lo que deja el envío entero  ·  Ahora · impacto 3 · esfuerzo S · confianza Baja
- **Hoy:** el pie de cada grupo del cierre suma el costo («Costo de Blusas S/ …», `CerrarEnvio.tsx`), pero nadie suma lo que se va a ganar.
- **Propuesta:** junto al costo total del cierre, «Deja S/ 1 240 · 44 %», ponderado por unidades, solo con las prendas que tienen costo y precio.
- **El momento que mejora:** Felipe sabe, antes de cerrar, si la compra del mes deja lo que esperaba.
- **Cómo lo hacen los mejores:** sin fuente verificada (es común en los ERP, pero el radar no lo cubre).
- **DECIDÍ** ponderar por unidades. **DESCARTÉ** el promedio simple de los %: miente cuando hay pocas unidades caras. **SE ROMPE SI** se suman
  prendas sin precio como si ganaran 0: se dice «12 sin precio todavía».

### recibir-margen#4 · El costo llega de la factura  ·  Visión · impacto 4 · esfuerzo L · confianza Media
- **Hoy:** el costo se escribe a mano o sale de la orden (que ya no se usa: memoria «Órdenes de compra deprecado»). No hay lectura de XML en
  `lib/recepcion*` ni en `components/recepcion*` (grep `xml`).
- **Propuesta:** subir el XML de la factura electrónica; cada línea se empareja con la prenda y el costo se llena solo. El margen aparece sin teclear.
- **Cómo lo hacen los mejores:** Odoo 19 lee la factura y busca la orden ([fuente](https://www.odoo.com/odoo-19-release-notes), sep-2025); Square
  Managerbot crea la orden desde la factura ([fuente](https://squareup.com/help/us/en/article/8617-use-managerbot-to-manage-business-tasks-and-insights)); radar #31.
- **SE ROMPE SI** el emparejamiento es por nombre: con el XML peruano se empareja por el código del proveedor, y lo que no calza se pregunta.

### recibir-margen#5 · Subirle el precio a lo que rota  ·  Visión · impacto 3 · esfuerzo M · confianza Media · **toca lo delicado (precios)**
- **Hoy:** al recibir una que ya existe, la IA propone precio solo si el margen bajó de 30 % o cambió el costo (`pideRevisarAlRecibir`, `lib/precio-propuesto-reglas.ts:111`).
- **Propuesta:** también si la prenda se agotó rápido la última vez (el motor de demanda ya lo sabe). La IA propone subir, con su porqué a la vista.
- **Cómo lo hacen los mejores:** Shopify Smart Pricing sugiere subidas además de rebajas ([fuente](https://apps.shopify.com/shopify-smart-pricing); radar #19).

### recibir-margen#6 · Margen prometido contra logrado  ·  Visión · impacto 4 · esfuerzo L · confianza Baja
- **Hoy:** el rendimiento por proveedor ya mide el margen de lo vendido (`margenDe`, `lib/proveedor-prendas-reglas.ts:203`), pero no lo compara con lo
  que se esperaba al recibir.
- **Propuesta:** el cierre guarda el margen previsto del envío (#3); a los 60 días, «esperabas 44 %, deja 37 %: las rebajas se llevaron 7 puntos».
- **Cómo lo hacen los mejores:** sin fuente verificada.

## Descartadas
- **La cifra que cuenta al cambiar** (animar el número del margen): moda. La línea cambia con cada tecla, y una animación por letra cansa y viola «nunca decorativo» (ADR-0136).
- **Semáforo con más niveles (excelente / bueno / bajo / pierde):** el 30 % ya es la regla de la propuesta de precio (`MARGEN_MINIMO`); un cuarto nivel no cambia ninguna decisión.

## Para otras skills
- `/formidable`: probar con una colaboradora si «Ganas S/ 34 · 48 %» se entiende sin explicación, o si «48 %» se lee como «descuento».
