# ADR-0668 — Fijar precio con la cuenta única: todas las prendas igual, costo y precio con IGV a la vista, piso que aguanta la rebaja

- **Fecha:** 2026-11-15 · **Estado:** decidido. Construido: A1 (la cuenta en `lib/cuenta-de-precio.ts`), A2 (una sola cuenta en Recibir y Nuevo producto, fuera
  «RUC ⇒ factura») A3 (quien fija el precio ve el costo en esa hoja; SQL en producción desde el 2026-11-15) y A4 (los candados del costo
  dudoso; su SQL espera el OK de Felipe). Lo demás, en el plan
  (`docs/backlog/2026-11-15-logic-examples-review-ff76bf.md`).
- **Pidió:** Felipe, 2026-11-15, al revisar el PR #1867: «el IGV no me lo mezcles aquí… al recibir el costo debe tener el IGV y el precio también, porque un
  integrante no entiende eso; cuando coloca el precio sugerido, ayudarle a entender lo del IGV para que fije un buen precio». Respondió 30 preguntas y revisó la
  maqueta `docs/maquetas/precio-sugerido-2026-11/index.html`.
- **Corrige a:** ADR-0417 en lo que mira una prenda (la cuenta de Compras dependía de la factura) y al PR #1867 (`recibir-margen#1`, que suponía factura por el
  RUC). **Sigue a:** ADR-0641 (precio propuesto con IA), ADR-0403 (rebaja sin céntimos), ADR-0298 (costo atípico).

## El problema

Después del #1867, bajo dos campos escritos con IGV (lo que se pagó y la etiqueta), la línea decía «Ganas S/ 23.32», una cifra sin IGV que la integrante no
puede cuadrar con su resta. Y dependía de si la compra traía factura, que suponía por el RUC del proveedor: medido en producción el 2026-11-15, **solo 14 de 54
papeles (26 %) son factura** y la regla «tiene RUC ⇒ factura» **se equivoca en 21 de 33 (64 %)** (13 de 23 proveedores con RUC nunca dieron factura; el Nuevo
RUS no puede darla). Con esa suposición la línea mostraba verde precios que no lo eran.

## Decisión

1. **A la vista, todo con IGV:** lo que se pagó (el total del papel, sin flete) y el precio de etiqueta. Es lo que la integrante conoce y lo que la ley exige
   mostrar al público (Ley 29571, art. 4).
2. **Una sola cuenta para todas las prendas, vengan con factura o sin ella:** *te quedan = precio ÷ 1.18 − lo que pagaste*. A la venta siempre se le quita la
   parte de SUNAT (siempre se paga); el costo es lo del papel. Lo que se recupere con facturas se suma aparte, en Compras, a fin de mes, y **nunca toca el costo
   de una prenda** (Felipe: «el IGV siempre se ve al final del mes y además hay IGV a favor; ser conservador y poner el costo con IGV a todo me permite evitar
   fijar un precio bajo»). Es el piso real de lo que queda.
3. **El piso («No bajes de»):** el menor precio terminado en .90 que, rebajado 35 % (hacia abajo al S/ 0.10, ADR-0403), todavía deja 20 % del precio rebajado
   sin IGV. ≈ lo que pagaste × 2.27 (S/ 36 → S/ 81.90). Es un margen sobre el precio rebajado, no un recargo sobre el costo (que daría ×2.18). La línea se
   pone **ámbar bajo el piso** («Aguanta poca rebaja: sube a S/ 81.90»), ya no bajo «30 %».
4. **El sugerido es una sugerencia, nunca un candado:** piso + techo (las prendas parecidas que se venden rápido, por la vara de Frescura), con la IA como
   segunda opinión dentro de los dos. «Pierdes» pide confirmar, no prohíbe. Un costo raro no sugiere precio hasta que la persona confirma «Sí, pagué S/ X».
5. **Quien fija el precio ve el costo** en esa hoja; **el cliente nunca** (Vender, ticket, etiqueta, tienda web).
6. Se guarda el costo del papel con IGV; los que la base dividió entre 1.18 se corrigen ×1.18 con historia (A11, con el contador).

DECIDÍ: una cuenta que no sabe de facturas y siempre quita la parte de SUNAT de la venta, con el piso que aguanta una rebaja de 35 %.
DESCARTÉ: (a) la cuenta de Compras con la factura de cada compra (#1867): la mitad de los papeles no es factura, saberlo pide un dato por compra que Felipe no
quiere llevar, y suponerlo por el RUC falla en 64 %; (b) la resta simple con IGV (70 − 36 = S/ 34): infla lo que queda hasta 46 % y empuja a precios bajos; (c)
mantener el ámbar en 30 %: con la cuenta sin factura, una rebaja de campaña de 35 % deja casi en cero a un precio «verde».
SE ROMPE SI: una compra con factura tiene un costo guardado dividido entre 1.18 (lo que hace hoy `fn_costo_de_entrada`, 20261106005000) y se compara contra lo
escrito con IGV: la reposición parece 18 % más cara y el piso de una prenda vieja sale 18 % más bajo. Por eso el aviso «Pagaste S/ X más» (A7b) y el techo
(A12) esperan a A11.

## Qué se construyó (A1 y A2)

- `apps/web/lib/cuenta-de-precio.ts`: IGV, la rebaja fuerte, `cuentaDelPrecio` y `pisoDelPrecio`, en céntimos enteros. Compras (`orden-compra-precio-ayuda.ts`)
  usa sus mismas funciones de céntimos.
- `margenALaVista(costo, precio)` y `<LineaMargen>` ya no reciben factura: «Te quedan S/ 23.32 · 39 %», ámbar bajo el piso con «sube a S/ …». Se borraron
  `facturaDelEnvio`, `<FacturaDelMargen>`, `useFacturaDelMargen` y la lectura de RUC de `recepcion-envio.ts`.
- `pideRevisarAlRecibir` avisa exactamente donde la línea se pone ámbar, y `revisarPrecioDeLaIA` sube lo que propone la IA al mismo piso (siempre sobre el
  piso de 30 % que exige la base, `precio_propuestas`): la propuesta ya no deja la línea en ámbar. La instrucción a la IA dice «más o menos el costo × 2,3».
- Nuevo producto: la cifra grande, su línea y su nivel («Aguanta poca rebaja» / «Buen precio») con la misma cuenta.
- No cambia qué se guarda ni toca la base.
- Revisión independiente (3 miradas + un verificador por hallazgo, 2026-11-15): se arreglaron el % de la propuesta de la IA (decía «ganas 56 %» al
  lado de un «48 %»: ahora usa la misma cuenta), los textos que aún hablaban del «30 %» (propuesta, Revisar precios, guías), el ámbar cuando ningún
  precio hasta el tope aguanta la rebaja (antes salía verde) y el piso, que ahora compara sin redondear (un 19.95 % pasaba por 20 %).
- **Queda abierto:** la ayuda de precio de Compras (`orden-compra-precio-ayuda.ts`, sin pantalla) sigue midiendo «aguanta» con el margen
  redondeado, y Editar producto ▸ Costos, Revisar precios (base) y Proveedores siguen con su vara vieja: van en A13–A15. Con un costo sobre
  ~S/ 2,200 la IA se llama y no devuelve propuesta (gasta la consulta): se corta antes en A6.

## Qué se construyó en A3: quien fija el precio ve el costo, en esa hoja

- **Lo que ya estaba:** en Recibir, la terminal que recibe ya veía y escribía el costo desde el 2026-11-07 (`fn_puede_poner_costo_al_recibir`,
  20261107194000) y ya podía confirmar un costo atípico (`fn_ve_costos_al_recibir` incluye Recibir). Proponer un precio con la IA ya estaba abierto
  a Productos y Recibir. Lo que faltaba era Catálogo: quien tiene Productos cambia el precio en Editar producto sin ver el costo, y «Revisar
  precios» y «Aplicar» le decían que su rol no ve los costos.
- **`retail.fn_ve_costo_de_prenda()`** (20261115200000) = el dinero de Compras, o Productos, Recibir o Campañas. Reemplaza al dinero de Compras en
  las seis funciones de la hoja donde se fija un precio: `fn_costos_variantes_json`, `fn_costo_de_la_prenda`, `fn_costo_de_las_tallas`,
  `catalogo_actualizar_producto` (el costo a mano de una talla sin costo de compra, como ya hacía crear una prenda), `fn_precios_a_revisar` y
  `aplicar_precio_propuesto`. La web la espeja en `veCostoDePrenda` (`lib/modulos.ts`), y `lib/modulos.test.ts` la cruza con la migración.
- **La tabla de Productos no cambia.** Medido en producción: el único rol que gana el costo es «Terminal de ventas» (las 3 terminales del
  mostrador). Con la tabla abierta, sus columnas Costo y Margen quedarían en la pantalla que la clienta tiene delante. La decisión 5 dice «en esa
  hoja»: el costo sale al abrir la hoja que cambia el precio, no en la lista que se mira de pasada. `fn_productos_listado`, `_facetas` y `_filtro`
  siguen con el dinero de Compras.
- **El cliente nunca:** `lib/costo-no-llega-al-cliente.test.ts` sigue el árbol de dibujo de Vender, Cambios, Devoluciones, los comprobantes, las
  etiquetas de precio, los rótulos, la Vitrina y toda la tienda web (y su primer salto a `lib/`), y falla si alcanza la cuenta del precio, la
  línea «Te quedan» o una lectura del costo. Se probó metiéndole a propósito `LineaMargen` y una lectura al ticket: dijo por dónde llegaban.
- **Pasado de A3 a A4:** el plan ponía aquí `fn_precio_referencia` (costo anterior, subtotal sin IGV, banda de la categoría). Nadie la usaría
  hasta los candados de costo de A4: nace allá, con la pantalla que la lee.

DECIDÍ: una puerta, «puede fijar precio en alguna hoja», solo en las funciones de esa hoja.
DESCARTÉ: (a) abrir `fn_puede_ver_dinero_de_compras()`, que también cuida facturas y deudas con proveedores; (b) abrir también la tabla de
Productos: pone el costo en la pantalla del mostrador sin que nadie lo pida.
SE ROMPE SI: una pantalla de cara al cliente llama a una de esas seis para «mostrar el ahorro»; la base no distingue pantallas, la prueba de la
web sí.

## Qué se construyó en A4: el costo dudoso se confirma por su monto

- **Lo que dicen los datos (producción, 2026-11-15, 60 días):** los tres candados nuevos habrían saltado **0 veces**. La pantalla precarga el
  costo de la orden con IGV (escrito = orden en 104 de 104 líneas), así que «sin IGV» no ocurrió por tecleo; lo que hoy divide entre 1.18 es la
  base misma (48 variantes, A11). A4 es el seguro contra el error de tecleo (440 por 44) y, sobre todo, contra lo que llega **sin orden** (311 de
  440 entradas de envíos), donde la banda de la categoría es la única red. «Llegó mercadería» (`recibir_lote`) se usa más que el envío nuevo
  (27 lotes contra 31 en 14 días): A4 cubre los dos.
- **Una regla, en la base** (20261115204000, PARTE 1): `fn_motivo_de_costo_con` (pura, solo números) y `fn_motivo_de_costo` (la que lee la
  base). Primero los motivos de siempre que no dependen del anterior (sin costo; mayor que el precio, que pasa a A5); después «sube» / «baja»
  con la MISMA banda 2× / ⅔ de `fn_costo_fuera_de_banda` (se llama, no se copia) contra el **anterior en papel** (`fn_costo_anterior_en_papel`:
  × 1.18 si la última entrada pasó por una factura); después «sin_igv» (lo de la orden ÷ 1.18, ±2 %); y «fuera_de_banda» (`fn_banda_de_costo`:
  de la mitad del p10 al doble del p90 de los MODELOS de la categoría, con 5 o más; si no, su familia; nunca la de toda CAYLA; una familia
  fuera de los motores no tiene banda). La web la espeja (`motivoDeCosto`, `lib/cuenta-de-precio.ts`) y las dos corren los mismos casos
  (`scripts/pruebas/costo-dudoso-casos.json`).
- **Se confirma un MONTO** (`fn_costo_confirmado`): `confirma_montos` viaja dentro del JSON de cada línea, de `p_separado` o de `p_items`, sin
  cambiar ninguna firma (20261115205000, PARTE 2, sobre `fn_recepcion_entrar`, `recibir_lote`, `cerrar_conteo_envio`, `resolver_pendiente_envio`,
  `recibir_despacho` y `llevar_al_stock_ahora`). El «sí» suelto sigue valiendo para los cuatro motivos de antes (la web publicada, la cola sin
  conexión); los dos nuevos solo con el monto. Quién confirma no cambia (`fn_ve_costos_al_recibir`).
- **La hoja avisa antes de guardar** (`fn_precio_referencia` → `AvisoCostoDudoso`): en el cierre, en «Llevar al stock» y en «Hacer ahora», la
  duda sale bajo el costo con «Sí, pagué S/ X» y, si es lo de la orden sin IGV, «Usar S/ …». Mientras dure no hay «Te quedan», ni «revisar
  precio», ni propuesta de la IA, y no se cierra (el cursor va a ese costo). Si la lectura no responde, la hoja no inventa una duda y lo dice;
  la base sigue revisando al cerrar. «Llegó mercadería» no sugiere precio: confirma desde el aviso de la base, ahora con el monto.

DECIDÍ: la regla en la base y su espejo en la web, cruzados por una tabla de casos; el monto confirmado viaja en el JSON.
DESCARTÉ: (a) bajar la banda a 1.5× / 0.75× (11 de 300 entradas legítimas en 60 días pedirían confirmar: alarma que se confirma por reflejo);
(b) la banda p10–p90 cruda (27 % de las entradas); (c) la de toda CAYLA (marcaría a todos los accesorios baratos); (d) cambiar el tipo de
`confirma_costo` o una firma (PGRST203 y la cola sin conexión rechazada al subir).
SE ROMPE SI: un descuento real que la orden no anota deja el costo 15 % abajo (se toma por «sin IGV»; hoy 0 de 142 líneas tienen descuento);
la PARTE 2 se pega antes que la web (la web vieja manda el «sí» suelto para un «fuera_de_banda» y la base vuelve a pedirlo); lo que «Hacer
ahora» toma del catálogo ya venía dividido (se compara contra sí mismo: A11).
**Revisión independiente** (3 miradas y un verificador por hallazgo, 2026-11-15: 27 hallazgos, 15 confirmados). Se arregló, antes de pegar
la PARTE 2: «Hacer ahora» confirmaba el aviso de la base con el «sí» suelto y, con las dudas nuevas, quedaba en un ciclo sin salida (ahora manda
los montos que mostró la base); el cierre comparaba con la orden de la línea principal y no con la del modelo; una duda en «Lo que cuadra»
plegado frenaba sin llevar el cursor (ahora la tarjeta se abre); se pedía confirmar costos que no entran al stock en ese cierre; «Hacer ahora»
comparaba con todas las tallas y revisaba la duda después de abrir la confirmación; «Llevar al stock» no confirmaba el costo propio de una talla
o color; el rechazo mostraba lo guardado como «costo actual» (ahora trae `anterior`, en papel); y la regla pura tenía un permiso que no servía.
**Fuera de A4, escrito:** «Recibir contra factura» (`recibir_envio`, 0 usos en 90 días) sigue con su banda; la matriz «Cambiar por talla» del
cierre no repite el aviso (la fila de arriba ya lo muestra); quitar el «sí» suelto cuando la web nueva lleve días publicada.

## Qué se construyó en A5a: «Pierdes» pide confirmar, en la base

- **Más grande de lo que decía el plan.** Hoy prohíben un precio bajo el costo seis funciones, no cuatro: `poner_precio_sede`,
  `poner_precio_sede_variantes`, `cambiar_precio_en_recepcion`, `cambiar_precios_en_recepcion`, `fn_fusion_precios_sede_costo` (#1884) y,
  con otra vara (×0.70), `aplicar_precio_propuesto` (A13). Por eso A5 va en cuatro partes: **A5a** la base, **A5b** la hoja «¿Lo dejas así?» en
  Recibir, **A5c** el precio de la tienda (ficha, terminal) y la fusión, **A5d** el «costo mayor que el precio» de la entrada al stock.
- **La regla también aprieta.** La de hoy compara el precio CON IGV contra el costo; «Pierdes» es precio ÷ 1.18 < costo. Entre el costo y el
  costo × 1.18 hoy se guarda en silencio un precio que pierde: 19 tallas con precio general y 18 precios de tienda (medido el 2026-11-15).
- **`fn_pierde_con`** (20261116040000): lo que queda, redondeado al céntimo como «Te quedan», es negativo: 200·p < 236·c − 118 en céntimos.
  La web la espeja en `pierdeConElPrecio` y las dos corren `scripts/pruebas/pierde-casos.json`.
- **La confirmación viaja en el encabezado `x-confirma-perdida`**, como el responsable: sin él, la regla de siempre (la web publicada no
  cambia); `no`, frena si pierde (`precio_pierde`, «Con S/ 40 pierdes S/ 2.10 por prenda.», la cifra solo a quien ve el costo); `si`, pasa.
  Ninguna firma cambia, y llega sola a las llamadas internas (Recibir → precio de tienda). La pregunta previa del navegador en producción
  acepta el encabezado (comprobado el 2026-11-16).
- **La fusión pide confirmar, como el resto** (Felipe, 2026-11-16, al preguntarle: «Pide confirmar, como el resto»).

DECIDÍ: la regla en la base y la confirmación en un encabezado, con «sin encabezado = la regla de siempre».
DESCARTÉ: (a) un parámetro nuevo con `default` (cambia la firma, PGRST203, y hay que llevarlo a mano a cada llamada interna); (b) la regla
nueva sin modo viejo (con el SQL pegado y la web de hoy, 37 guardados pasarían a un rechazo que la pantalla no sabe confirmar); (c) el bloqueo
optimista de la corrección 16 en esta parte (sin casos medidos con 3 tiendas; la regla ya se evalúa en la base con el costo vigente).
SE ROMPE SI: una pantalla manda `x-confirma-perdida: si` sin mostrar la pérdida; o un costo dividido entre 1.18 (hasta A11) hace que una
prenda con factura «pierda» menos de lo que pierde.

## Lo que falta decidir

1. Las prendas del Taller entran con costo **sin** IGV (`20261015040000_orden_insumo_recepcion_funciones.sql:69,290`): ¿se llevan a con IGV?
2. El contador: con el costo con IGV, cómo queda el libro (costo de ventas e inventario) antes de A11.
3. ~~«Precio ≤ costo» se muestra como aviso rojo que sí deja ver el sugerido~~ resuelto en A4 como la maqueta: no es una duda del costo (no apaga el sugerido); su confirmación es la de «Pierdes» (A5).
4. ¿Nuevo producto deja crear una prenda sin costo?
5. Antes de corregir ×1.18: las prendas en campaña activa que quedarían bajo el costo nuevo.

## Cómo se verificó

- `lib/cuenta-de-precio.test.ts` (los casos de la maqueta y todo costo de S/ 1 a S/ 500: termina en .90, aguanta y el .90 de abajo no),
  `lib/margen-a-la-vista.test.ts` (incluye que ningún archivo vuelva a suponer factura), `lib/precio-propuesto-reglas.test.ts` (la propuesta nunca deja la
  línea en ámbar), `lib/precio-propuesto-ia.test.ts`; `tsc` limpio.
- Investigación, plan técnico y revisión escéptica: `docs/investigacion/2026-11-15-precio-con-igv/`.
