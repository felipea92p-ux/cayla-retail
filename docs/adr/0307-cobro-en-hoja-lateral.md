# ADR-0307 — El cobro sale del ticket: hoja lateral sobre el catálogo

**Fecha:** 2026-10-02 · **Estado:** construido y probado en local (escritorio y 375 px); la migración del QR
(`20261002130000_venta_pagos_qr.sql`) **aplicada en producción el 2026-10-02** (ver §7) · **Decide:** Felipe (la hoja, su forma «tal cual» la maqueta,
el comprobante sin valor por defecto, el QR con su migración, quitar el Nº de operación de la caja, siempre «Confirmar» y no
el cobro de un toque); Claude (el reparto del «resto», la marca `fn_acepta_pago_qr`, dónde va el QR en Finanzas, el resto
de lo técnico) · **Rama:** `claude/redesign-post-payment-ticket-6d3690` · **Maqueta:**
`docs/maquetas/cobro-hoja-lateral-2026-10/` (la H de la ronda 3, pulida con Felipe en cinco vueltas).

## 1. El problema, primero

Al tocar «Cobrar», todo el cobro (cinco medios, montos, recibido, billetes, Nº de operación, comprobante, documento) se
apretaba dentro de la columna del ticket, de 420 px. Se leía chico, había que bajar con scroll y la grilla de prendas, la
parte más grande de la pantalla, quedaba sin uso mientras se cobraba. Felipe pidió que el cobro ocupe la grilla sin perder
de vista el ticket, que se entienda con pocos toques y que se lea de lejos.

## 2. Decisión

```
DECIDÍ:    al pasar a «cobrar», una hoja ancha entra sobre el catálogo (que queda atenuado detrás) y el ticket sigue a la
           derecha con sus prendas quietas. La hoja tiene dos pasos y un botón:
             1 PAGO — seis cuadrados grandes (efectivo, tarjeta, QR, Yape, Plin, transferencia; F1–F6), el ícono llenando
               el cuadro y el color de su medio. Tocar uno cobra todo con él; tocar un segundo ya es pago mixto (la lógica
               de siempre) y cada cuadrado muestra su monto. Con efectivo, «¿Con cuánto paga?» en billetes sugeridos
               (exacto + 4: S/59.90 → 60, 70, 100, 200) y el vuelto grande.
             2 COMPROBANTE — boleta, factura o nota de venta, NINGUNO marcado al empezar. Elegido, el documento de la
               clienta en una fila.
             «Confirmar cobro» — el mismo del ticket, en grande; apagado dice qué falta.
           En el celular la misma hoja va dentro de la hoja del ticket (`compacta`).
DESCARTÉ:  (a) las rondas 1 y 2 (seis maquetas: mesa de cobro, anillo, recibo vivo, cuenta, teclado, frase): densas o con
           scroll interno; (b) el cobro de un toque con «Deshacer» de la maqueta: registraría la venta (y su boleta a SUNAT)
           sin un Confirmar aparte; Felipe eligió confirmar siempre; (c) reimplementar la consulta de DNI/RUC dentro de la
           hoja: se usa `DocumentoDelComprobante` tal cual y solo se acomoda en una fila con CSS; (d) agregar el QR a
           `METODOS_PAGO`: Apartados, Cambios y Devoluciones lo ofrecerían y sus funciones lo rechazan.
SE ROMPE SI: la migración del QR no está en producción (la hoja muestra cinco medios: `fn_acepta_pago_qr` no existe y la
           web lo lee como «no»); la pantalla es muy baja (la hoja hace scroll por dentro como último recurso; medida sin
           scroll en 1440 × 900 con el menú lateral abierto, el caso más angosto de escritorio).
```

## 3. Lo que cambia en el negocio

1. **El comprobante se elige siempre.** Antes la caja arrancaba en Boleta («Opcional: ya está en Boleta»). Ahora ninguno viene
   marcado y sin elegir no se cobra (`motivoBloqueoCobro`: «Elige el comprobante.»). Una proforma con RUC sigue llegando con
   Factura marcada: es el dato de esa proforma, no un valor por defecto.
2. **«El resto» con tres o más medios.** Con dos medios ya existía: el otro toma lo que falta. Ahora, con tres o más, el primer
   medio que la cajera no escribió a mano se queda con el resto (`PagoAplicado.fijo`, `pagosTrasEditarMonto`). El segundo medio
   que se toca se lleva el cursor a su monto.
3. **El Nº de operación ya no se pide en la caja** («nunca se ingresan», Felipe) **ni se busca**: el buscador de Ventas ▸
   Historial (que también usan Cambios y Devoluciones, `idsDeVentasBuscadas`) dejó de buscar por él (Felipe, 2026-10-02). La
   columna `venta_pagos.referencia` queda con lo que ya tenía y el detalle de esas ventas lo sigue mostrando.
4. **QR, sexto medio de una venta.** Es el QR de **Izipay** y su abono llega **aparte** de las tarjetas (Felipe, 2026-10-02):
   por eso no va con la tarjeta. Solo en Vender. En Finanzas el cobro con QR se sella en la cuenta de cobro de
   **transferencia** de la sede (`fn_cuenta_sellada` ya manda ahí todo medio que no es Yape, Plin ni tarjeta) y aparece en el
   libro de cuentas como «Cobros con QR · sede». En Caja va en el grupo digital de la dona. Color: tinta (`--color-metodo-qr`),
   como un código impreso.

## 4. Cómo se ve y por qué así

Palabras en DM Sans mayúscula espaciada (`label-cayla`) y cifras en EB Garamond: la letra del botón del ticket (Felipe pidió que
la hoja y el ticket se sientan uno). Íconos de los medios: los de siempre (Yape y Plin dibujados en monocromo, banco para la
transferencia; `iconoMetodo`), más `QrCode`. La guía de foco (ADR-0284) va en la propia hoja: el paso que sigue se enciende con
tinte terracota y «Sigue aquí», «Elige uno» marca el comprobante pendiente, el número del paso pasa a ✓ y el botón dice qué
falta. Movimiento: la hoja entra desde la derecha con `--ease-cayla`, el velo aparece detrás; todo se apaga con
`prefers-reduced-motion`. Esc, «Volver» o tocar el velo vuelven al ticket.

## 5. Dónde vive

- `apps/web/components/punto-de-venta/HojaDeCobro.tsx` — la hoja (sin estado propio; el cobro sigue en `PuntoDeVenta`).
- `apps/web/components/PuntoDeVenta.tsx` — la monta sobre el catálogo (escritorio) o en la hoja del ticket (celular); el botón
  confirma el formulario del ticket desde afuera (`form="ticket-pos"`).
- `apps/web/components/PuntoDeVentaTicket.tsx` — en «cobrar» muestra las prendas quietas; ya no pinta medios ni comprobante.
- `apps/web/lib/vender-reglas.ts` — `montosSugeridos`, `pagosTrasEditarMonto` con «el resto», `metodoDeAtajo(t, medios)`,
  `motivoBloqueoCobro({ sinComprobante })`; pruebas en `vender-reglas.test.ts`.
- `packages/shared/src/enums.ts` — `METODOS_PAGO_VENTA` / `MetodoPagoVenta` (los cinco + QR), aparte de `METODOS_PAGO`.
- `apps/web/app/globals.css` — `--color-metodo-qr`, `.metodo-qr` y el bloque «Hoja de cobro».
- `supabase/migrations/20261002130000_venta_pagos_qr.sql` — el candado de `venta_pagos.metodo` acepta 'qr',
  `fn_acepta_pago_qr()`, y 'qr' en `fn_dinero_libro`, `fn_flujo_caja_proyeccion` y `fn_cuenta_sirve`. Dos partes para pegar
  por separado; validada contra la base local dentro de una transacción con `rollback`.

## 6. Verificación

En local (`/vender`, 1440 × 900, menú lateral abierto y cerrado): Yape por F3, efectivo por F1 con el cursor en su monto, 100
escritos → Yape pasa solo a S/54.80; S/200 recibido → vuelto S/100.00; Boleta; «Confirmar cobro» de la hoja registró la venta
B001-000002 con los dos medios y su vuelto. Sin scroll en la hoja y sin texto cortado (medido). A 375 px: la hoja dentro del
ticket, sin desborde horizontal. QR y Factura probados forzando la marca en local (sin aplicar la migración en la base compartida).

## 7. Producción (2026-10-02)

Aplicada por Claude a pedido explícito de Felipe, con `apply_migration` del MCP de Supabase sobre `vovjyyiafkxteijimpuy`
(schema `retail`), en sus dos partes por separado: `venta_pagos_qr_parte1_candado` y `venta_pagos_qr_parte2_funciones`
(quedan en `supabase_migrations.schema_migrations` con su propia fecha como versión). Antes, en solo lectura: el cuerpo de
`fn_dinero_libro`, `fn_flujo_caja_proyeccion`, `fn_cuenta_sirve`, `fn_cuenta_sellada` y `fn_venta_pagos_sellar` en producción
era idéntico byte a byte (md5) al del repo. **Hallazgo que corrigió la migración antes de aplicarla:** el candado de
`venta_pagos.metodo` en producción también acepta `'anticipo'` (el adelanto de un apartado entregado, 20260923090000); la
primera versión de la migración lo rehacía sin él y habría roto la entrega de apartados. La migración conserva `'anticipo'`.
Después, verificado: `fn_acepta_pago_qr()` = true (y `authenticated` puede ejecutarla), `fn_cuenta_sirve('cobro','qr','banco')`
= true, el candado con los siete medios y `fn_dinero_libro(hoy)` respondiendo. El QR aparece en las tiendas cuando esta rama
llegue a `main` (la web publicada todavía no tiene la hoja de cobro).

**Nota (2026-10-02, al fusionar `main`):** la migración nació como `20261002120000_venta_pagos_qr.sql` y `main` trajo otra con la
misma versión (`20261002120000_bajada_y_ajuste_dentro_de_existencias.sql`). Se renombró a `20261002130000`; en producción quedó
registrada por `apply_migration` con su propia versión, así que el cambio de nombre no la toca. El `comment on function` de
`fn_acepta_pago_qr` todavía dice «20261002120000»: es el texto que tiene producción y se deja igual a propósito.
El número de este ADR también cambió al fusionar: nació como 0306, y `main` ya tenía el 0306 («Bajada y ajuste son funciones de
Existencias»).

## 8. Actualización 2026-10-05 — la hoja se ajusta a cualquier pantalla (Felipe)

**El problema.** Felipe cobraba desde un laptop y «Confirmar cobro» salía recortado: había que bajar el scroll para llegar al botón.
La §6 había medido «sin scroll» a 1440 × 900, el tamaño con que se diseñó; nadie lo había medido en un laptop corriente. Medido en el
navegador a 1280 × 650 (menú abierto): la hoja mide **480 px** de alto (el del catálogo, `inset-y-3`) y su contenido pedía **715 px**
(fichas cuadradas de 150 px, billetes en tres filas, documento del cliente apilado). Toda la hoja era un solo scroll, así que el botón
principal, lo único que siempre se necesita, iba al final.

**La causa raíz** eran dos cosas, no una: el botón estaba DENTRO de lo que scrollea, y el diseño tenía medidas fijas pensadas para una
pantalla alta. Subir o bajar un padding no arreglaba ninguna.

```
DECIDÍ:    1 · El botón y la cabecera no scrollean. La hoja recorta (`overflow-hidden`) y solo el CUERPO de los dos pasos
               (`.hoja-cobro-cuerpo`) scrollea, y solo si ni compactada cabe. «Confirmar cobro» queda siempre a la vista, a
               1280 × 500 también.
           2 · La hoja se adapta por SU alto, no por el de la ventana: es un contenedor de tamaño con nombre (`container: cobro / size`)
               y los bloques `@container cobro (max-height: …)` de `globals.css` cambian sus medidas. **La forma no cambia nunca:** dos filas
               de tres fichas y, en la hoja ancha, los billetes al lado; solo cambia el tamaño. De 52 rem de alto para arriba (~832 px) es el
               diseño de siempre, sin tocar. Bajo 52 rem se aprietan los espacios (cabecera, relleno de los pasos, botones del comprobante) y
               las fichas valen lo que sobra, entre 4,25 rem y su tamaño de siempre (hoja ancha: 28,5 rem es lo que ocupa todo lo demás en el
               peor caso, así que desde ~45 rem las fichas siguen siendo las de siempre; los billetes pasan a 3 por fila). La hoja ANGOSTA (a
               una columna los billetes caen debajo y el diseño de siempre pide ~1150 px con efectivo) usa la disposición ajustada hasta
               80 rem: fichas de 3,25 rem hasta cuadradas (9,4 rem), los billetes en UNA línea con el vuelto junto a «¿Con cuánto paga?» y el
               documento del cliente en 2 × 2 en vez de apilado. Bajo 40 rem la cabecera «Total / Volver» se esconde (repite el total del
               ticket y del botón; «Volver» está en «← Ticket», Esc y el velo). Con pago en dos medios las fichas suben a 5,75 rem para que
               quepa el monto de cada una.
           3 · Al elegir el comprobante, si el documento del cliente queda bajo el pliegue, el cuerpo baja lo justo para mostrarlo
               (`scrollIntoView({ block: "nearest" })`, sin movimiento con `prefers-reduced-motion`).
           4 · En una hoja muy angosta (< 24 rem útiles: una tablet a 1024 px con el menú abierto) el comprobante pasa a dos líneas en
               vez de cortarse («NOTA …») y «Confirmar cobro» pierde el ✓ para que su rótulo quepa.
DESCARTÉ:  · Escalar toda la hoja con `zoom`/`transform` según el alto: a 0,6 el rótulo de 13 px queda en 8 px y no se lee.
           · Compactar por `@media (max-height)` de la ventana: el alto que le queda a la hoja cambia con la cabecera de la página, el
             zoom y el navegador; la ventana no lo sabe. Medido: 650 px de ventana = 480 de hoja, pero 730 = 560 y 800 = 630.
           · Poner los dos pasos lado a lado en una hoja baja: a 480 px de ancho cada columna quedaba de 230 px y los billetes no caben.
           · Esconder los campos opcionales del documento (nombre, celular) tras un «+»: cambia qué se ve al cobrar, y eso es del negocio.
```

**Lo medido.** Con la hoja REAL a 1920 × 1080 (736 × 910) y a 1280 × 650, 1366 × 650, 1440 × 800, 1536 × 730, 1280 × 500, 1024 × 768 y 375 × 812
(`compacta`: igual que antes). Los demás tamaños, con una maqueta temporal con el MISMO marcado y las mismas clases, calibrada contra la hoja real
(a 736 × 910 dio cabecera 61, paso 1 = 352, pie 64 y fichas de 127 × 127: lo mismo que la hoja real; el paso 2 difirió en 3 px). «Cabe» = el peor
caso (efectivo + boleta con DNI y celular; también factura y nota de venta) sin scroll en el cuerpo:

| Hoja (ancho × alto) | Fichas | Peor caso |
|---|---|---|
| 736 × 910 y 736 × 817 (monitor grande) | 128 × 126 (las de siempre) | cabe |
| 736 × 760 | 128 × 126 | cabe |
| 736 × 700 | 128 × 121 | cabe |
| 736 × 650 | 128 × 96 | cabe |
| 736 × 560 (sin cabecera) | 128 × 68 | cabe |
| 641 × 630 | 120 × 86 | cabe |
| 531 × 1000 (angosta, alta) | 155 × 150 (cuadradas) | cabe |
| 531 × 850 | 155 × 108 | cabe |
| 531 × 650 y 531 × 740 | 158 × 48 y 158 × 53 | cabe |
| 531 × 550 (laptop, menú abierto) | 154 × 48 | scrollea 9 px |
| 582 × 480 y 531 × 480 (laptop de 650 px, menú abierto) | 97 × 68 y 154 × 48 | scrollea 55–79 px, solo para el documento; el botón no se mueve |
| 325 × 700 y 325 × 598 (tablet a 1024 px) | 89 × 48 y 85 × 48 | cabe y scrollea 4 px; botón y rótulos enteros |

**Lo que NO se resolvió y por qué.** En una hoja angosta y baja (menú abierto en un laptop de ~650 px) con efectivo, boleta y el
documento completo, los pasos suman ~510 px y la hoja da ~400: ahí sí scrollea, pero el botón no se mueve y el documento sube solo. Cabría
sin scroll escondiendo campos del documento, y eso lo decide Felipe (arriba, «descarté»).

**Correcciones el mismo día (Felipe, al verlo en su monitor).** La primera versión compactaba bajo 52 rem para todo ancho y, desde ~47 rem, la
hoja ancha pasaba a SEIS fichas en una fila (íconos y nombres chicos, la mitad de la hoja vacía): su hoja mide ~817 px y le tocó eso. Él pidió
dos veces lo mismo: *«quiero el diseño anterior en dos filas de 3 donde se veían más grandes, simplemente quería que sea responsive»*. Se
eliminó la fila de seis y el apilado de la hoja ancha: la FORMA queda fija y solo cambia el tamaño (arriba). El candado
`lib/hoja-de-cobro-ajuste.test.ts` ahora impide `repeat(6` y exige que la ficha base siga siendo cuadrada. **Qué se midió y qué no:** a 736 × 817 la
maqueta da fichas de 128 × 126 y el peor caso cabe; no se abrió la hoja real a esa altura (el panel del navegador tenía otra sesión del usuario).

**Tercera vuelta (Felipe: «así tal cual debe quedar; solo hazlo más responsive»; falla en laptop con el menú abierto y en tablet).** El diseño
grande no se tocó. Esos dos casos son de ANCHO (hoja de 531 y de 325 px: el menú lateral ocupa 256 px y la columna del ticket ~380), y se mejoró
lo que cabe dentro del cobro: el documento del cliente en 2 × 2 desde 17,5 rem (antes 26), fichas con nombres legibles (mínimo 9 px y «Transf.» en
la ficha de menos de 6 rem), «Confirmar cobro» sin cortarse a 325 px (rótulo de 12 px sin el ✓), la etiqueta «Sigue aquí» y el estado del paso sin
pisarse, y fichas y comprobante un poco más bajos en la hoja angosta (de 52 a 48 px). Efecto: a 325 × 598 el scroll del peor caso bajó de 233 a
4 px; a 531 × 650 cabe todo. **Lo que falta es del lateral, no del cobro:** el menú lateral plegado le daría a la hoja ~190 px más (a 1280 px de ancho
llegaría a su tope de 736 y se vería como el diseño grande). Hoy plegar es una preferencia de la persona (`lateralPlegado`, cookie); plegarlo solo
mientras el cobro está abierto toca el `AppShell` de todos los módulos y queda como decisión de Felipe.

**Lo que dejó escrito para no repetirlo.**
- `lib/hoja-de-cobro-ajuste.test.ts` vigila las tres piezas: la hoja no tiene `overflow-y-auto`, el botón está fuera del cuerpo, la hoja es el
  contenedor `cobro`, y ninguna clase que la compactación cambia convive con una utilidad de Tailwind de su misma familia (`gap-2`, `h-14`…): la
  capa `utilities` le gana a `@layer components` (ADR-0105) y el valor compacto nunca se aplicaría. Al escribirlo apareció un `gap-2` mío en la raíz
  que ya lo hacía.
- Los tamaños que cambian viven en clases `hoja-cobro-*` de `globals.css`, no como utilidades en `HojaDeCobro.tsx`.
- Medir una pantalla en un monitor grande no prueba nada para un laptop: este arreglo se midió a 13 tamaños.

## 9. Actualización 2026-10-05 (tarde) — lo recibido en efectivo se lee en color (Felipe)

Bajo los billetes de «¿Con cuánto paga?» la hoja dice qué pasa con lo recibido. Felipe pidió que **lo exacto salga en verde** (el ✓, el texto y la
cantidad) y **lo que falta en rojo** (el texto y la cantidad). Quedó así: «EXACTO ✓ S/149.90» en `verde-profundo`, «FALTAN S/5.00» en `rojo-profundo`
(antes, ámbar) y «VUELTO S/50.10» neutro: el vuelto es información, no un aviso. La línea de exacto ahora lleva el monto además del ✓ (antes solo el ✓) y, en la hoja
ancha, baja de 3 a 2,25 rem para caber junto a la etiqueta en la columna de los billetes (279 px; medido a 736 × 817, 736 × 650 y 531 × 650: nunca se desborda).
La regla vive en `lecturaDelRecibido` (`lib/vender-reglas.ts`, con su prueba): `null` sin recibido, `vuelto` si sobra, `falta` si no llega y `exacto` si es justo,
contra lo que se cobra en monedas (con el redondeo, ADR-0311). No cambia lo que bloquea el cobro: eso sigue siendo `motivoBloqueoCobro`. El «Falta S/…» de la
cabecera del paso 1 (ámbar) no se tocó: Felipe habló de la línea bajo los billetes.
