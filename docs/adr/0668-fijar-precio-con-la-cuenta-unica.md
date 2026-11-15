# ADR-0668 — Fijar precio con la cuenta única: todas las prendas igual, costo y precio con IGV a la vista, piso que aguanta la rebaja

- **Fecha:** 2026-11-15 · **Estado:** decidido. Construido: A1 (la cuenta en `lib/cuenta-de-precio.ts`), A2 (una sola cuenta en Recibir y Nuevo producto, fuera
  «RUC ⇒ factura») y A3 (quien fija el precio ve el costo en esa hoja; SQL en producción desde el 2026-11-15). Lo demás, en el plan
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

## Lo que falta decidir

1. Las prendas del Taller entran con costo **sin** IGV (`20261015040000_orden_insumo_recepcion_funciones.sql:69,290`): ¿se llevan a con IGV?
2. El contador: con el costo con IGV, cómo queda el libro (costo de ventas e inventario) antes de A11.
3. «Precio ≤ costo» se muestra como aviso rojo que sí deja ver el sugerido (la maqueta lo hace así).
4. ¿Nuevo producto deja crear una prenda sin costo?
5. Antes de corregir ×1.18: las prendas en campaña activa que quedarían bajo el costo nuevo.

## Cómo se verificó

- `lib/cuenta-de-precio.test.ts` (los casos de la maqueta y todo costo de S/ 1 a S/ 500: termina en .90, aguanta y el .90 de abajo no),
  `lib/margen-a-la-vista.test.ts` (incluye que ningún archivo vuelva a suponer factura), `lib/precio-propuesto-reglas.test.ts` (la propuesta nunca deja la
  línea en ámbar), `lib/precio-propuesto-ia.test.ts`; `tsc` limpio.
- Investigación, plan técnico y revisión escéptica: `docs/investigacion/2026-11-15-precio-con-igv/`.
