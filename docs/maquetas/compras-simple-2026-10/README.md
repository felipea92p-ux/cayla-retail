# Compras simple — maqueta (2026-10-22)

Abrir `index.html` (se sirve con la entrada `maqueta-referentes` de `.claude/launch.json`: `/compras-simple-2026-10/index.html`).
Todos los nombres, montos y prendas son **un ejemplo inventado**: no existen en el sistema.

## De dónde sale

Reunión de coordinación del 2026-10-22 (Felipe, Daniel, Diego): «prioridad máxima a compras y recibir mercadería», con agilidad
primero. Ese mismo día, en producción (solo lectura): **0 órdenes de compra, 0 fondos por rendir**, las 9 «compras» registradas eran
gastos (plásticos, papelería, farmacia) y **3 065 unidades** entraron por carga inicial con el costo escrito a mano en Catálogo, contra
37 por Recibir. La carga inicial ya cerró en TRU (18-oct) y AQP (21-oct); LIM cierra el 31-oct.

## El camino en 4 pasos (decidido por Felipe en el cuadro, 2026-10-22)

| Paso | Quién · aparato | Qué hace |
|---|---|---|
| 1. Anotar la plata | La compradora · **celular** | Ella misma anota **«Me dieron plata»**: cómo le llegó (transferencia, Yape o Plin, efectivo), cuánto y la foto del voucher (opcional). **Solo la primera vez** también anota «Ya tenía plata del fondo». Puede comprar con esa plata en el acto; sale «por confirmar» hasta que Compras la confirme (paso 4). **Por ronda**: lo que sobra **pasa a la próxima ronda**. |
| 2. Registrar la compra | La compradora · **celular** | Entra desde el menú o la tarjeta de su **Inicio** («Tu ronda de compras»): es el módulo **«Mi ronda de compras»**. **Elige al proveedor** y ve **«¿Qué le compras hoy?»**: sus productos habituales (ver abajo); un toque arma la prenda y sigue cantidad → costo → venta con los de la vez pasada. «Algo nuevo de este proveedor» da de alta un producto. En **Revisar** ve lo anotado, lo corrige y agrega «Otra prenda de …». Al final, **el papel**: qué papel le dieron → foto → monto (ya viene con el total anotado). **La plata sale del fondo al guardar.** «Otro gasto», «Armar un envío» y «Terminé por hoy» siguen igual. |
| 3. Llega a la tienda | La encargada · escritorio | Recibe **mirando la foto**: prenda existente → la elige, suma por color y talla y escribe **el costo de cada una** leyendo el papel; prenda nueva → la crea ahí mismo con **la ficha completa** de Nuevo producto, con precio de venta y costo (sin ir a Catálogo). **El stock entra con su costo en ese mismo momento.** Mientras registra ve cuánto lleva contra lo que se pagó; al decir si coincide, el sistema le dice el caso: cuadra todo · cuadran las prendas pero no la plata · cuadra la plata pero faltan prendas · no cuadra nada. Si no coincide, **lo marca y avisa** (falta o sobra, cuánto, y qué cree que pasó: no vino, se perdió en el camino, llega después). |
| 4. Confirmar y completar | **Quien tiene Compras** (no solo el líder) · escritorio | **Primero, la plata por confirmar**: ve lo que anotó cada compradora con su voucher y lo confirma con un toque o lo corrige (queda «anotó S/ X»). **Después, los papeles por completar**: copia de la foto **el proveedor** (o lo registra si no existe) y **la serie y el número** (factura y boleta; en nota de venta, si lo tiene; sin papel, número interno). Ve lo que recibió la tienda con sus costos y el caso, y **decide quién responde** por lo que no cuadró (el proveedor nos debe, pérdida que asume CAYLA, llega después, el monto se anotó mal). Al guardar, cada papel **se vuelve comprobante** pagado desde el fondo de quien compró. |

## Decisiones de Felipe (2026-10-22, en el cuadro)

- Proveedor y número del papel: los copia **quien completa el papel, en el paso 4**; la compradora y la tienda nunca los escriben.
- El costo: **se pone al recibir y lo escribe la encargada** leyendo la foto; el stock y el costo entran juntos. (Reemplaza lo elegido antes: «la tienda no ve costos».)
- La plata **sale del fondo en el momento de guardar la foto**.
- «Mi ronda de compras» **es un módulo** en Roles y accesos (nace solo para el líder, CLAUDE.md «Módulos y roles»); quien lo tiene lo ve en el menú y como tarjeta en su Inicio. (Reemplaza lo elegido antes: «no es un módulo».)
- Se dice «ronda de compras», no «salida»: también se compra con pedidos al proveedor.
- **La plata la anota la misma compradora** (monto, cómo le llegó y foto del voucher) y **Compras la confirma**; lo que ya tenía del fondo lo anota **solo la primera vez**. Nadie «entrega» plata desde el escritorio.

## Lo que la maqueta supone (para confirmar antes de construir)

- El precio de venta de una prenda nueva lo pone la encargada (es parte de la ficha completa).
- Al entregar plata a quien ya tiene una ronda abierta, se suma a esa ronda (no está dibujado).
- Si la compradora pone de su bolsillo, queda «CAYLA le debe»; quién y cuándo se le paga no está dibujado.

## Lo que ya existe en el ERP y se reutiliza

Fondos por rendir (ADR-0362, fase 6: la entrega, la rendición y `rendiciones_fondo.arrastre` para lo que pasa a la próxima ronda),
los gastos del viaje, Recibir contando primero y lo que llega sin aviso (ADR-0393), «Nos debe» y saldo a favor (fase 5), los cuatro tipos
de papel (decisión 50) y Nuevo producto (ADR-0260). El «Día de compra» (ADR-0362, act. 2026-10-21, diseñado y sin construir) lo
reemplaza la ronda de compras. El PR #1248 (precio sugerido de la orden de compra) no choca.

## Lo que cambia contra lo que hay hoy (nada se construye sin aprobar la maqueta)

1. Nace el **papel rápido** (foto + monto) antes del comprobante; la tabla `compras` no se afloja: el papel se vuelve comprobante
   completo en el paso 4.
2. La orden de compra **deja de ser la puerta obligatoria**: la compra nace de la ronda y su foto.
3. El costo lo escribe **quien recibe**, al recibir (ya era así en ADR-0362: quien recibe ve y corrige el costo).
4. Crear una prenda **desde Recibir**, con la misma ficha de Catálogo y sin pasar por carga inicial.
5. La plata del fondo sale al guardar la foto: toca el asiento del fondo (1413) mientras el papel está por completar.

## Registrar una compra: los productos habituales del proveedor (2026-10-22, tarde)

**Qué cambió.** Después de elegir al proveedor ya no se piensa desde cero: la pantalla **«¿Qué le compras hoy?»** muestra **sus**
productos más habituales, sacados de lo que ya se le compró, agrupados por producto (nombre + categoría + marca), primero lo que más
veces se compró y, a igual cantidad de veces, lo más reciente. Se ven hasta 6; si tiene más, «Ver todos los suyos (N)». Cada tarjeta
dice el nombre, la categoría, la marca, el color y, en chico, «La vez pasada: 12 a S/ 17.50 · se vendió a S/ 39.90 · hace 6 días».
Al tocarla, la prenda se arma sola y sigue **cantidad** (con la de la vez pasada puesta: «Seguir con 12»), **costo** y **venta**
(«Igual que la vez pasada: S/ 17.50», de un toque; o se escribe otro). Todo se corrige en **Revisar** antes de guardar. Al final de las
tarjetas está «Algo nuevo de este proveedor»; un proveedor sin compras salta directo a lo nuevo con «Es tu primera compra con él: dinos qué es».

**Producto nuevo, una pregunta a la vez:** qué es (primero las categorías que ya se le compran a ese proveedor, después las demás) →
cómo se llama (el ejemplo y tres chips siguen a la categoría elegida, ADR-0290: con Casacas, ejemplos de casacas) → la marca (si el
proveedor tiene una sola se pone sola y se salta; si tiene varias se elige, más «Sin marca» y «Otra marca») → el color y las tallas
(opcionales, «Lo pongo después») → cantidad → costo → venta (sugerida con el factor de la categoría). Si el nombre se parece a uno que
ya se le compró, avisa antes de duplicar: «¿Es la Blusa manga globo que le compraste el 16?», con «Usar esa» y «No, es otra».

**Lo anotado se ve por su nombre** («12 · Blusa manga globo») en la lista de la ronda, en «Armar un envío», en Recibir («Lo que anotó
Marisol al comprar», con un toque para Sumar si la prenda ya está en Catálogo o Crear si no, con nombre, categoría, marca, costo y
venta ya puestos) y en el paso 4, donde el proveedor ya viene elegido por la compradora. Al guardar, cada producto queda en el
historial: en la siguiente compra a ese proveedor aparece entre sus habituales.

**Por qué.** Lo que se le compra a un proveedor se repite casi siempre (el mismo modelo, el mismo costo). Pedir categoría y datos desde
cero cada vez era lo lento y lo que más se equivoca; con los habituales, repetir una compra es tocar y confirmar.

**Decisión de Felipe en el cuadro:** el proveedor se elige **en el celular, al registrar la compra** (no en la tienda). Eso cambia
lo de antes: la compradora ya no anota «solo foto y monto», sino proveedor y prendas; el papel queda al final.

**Datos de ejemplo:** Textiles Rosa (una sola marca, 4 compras anteriores y 7 productos: muestra «Ver todos los suyos»), Confecciones
Lupe (dos marcas: muestra la pregunta de la marca), Inversiones Mayo y Puesto 214 con historial; **Tejidos Andinos sin compras** para
probar la primera compra. La maqueta no guarda nada en el navegador: recargar la página vuelve a la semilla.

**Recorrido para probarlo** (paso 2, celular; empieza tocando la tarjeta «Tu ronda de compras»):
1. *Lo de siempre:* Registrar una compra → Textiles Rosa → Blusa manga globo → Seguir con 12 → Igual que la vez pasada (costo) →
   Igual que la vez pasada (venta) → Seguir: el papel → Factura → foto → Usar esta foto → Guardar. **11 toques** desde Inicio de la
   ronda, con la prenda, la cantidad, el costo y la venta ya anotados. Antes eran 8 toques más el monto escrito a mano (3 teclas o más)
   y **no se anotaba ninguna prenda**: la tienda tenía que buscarla y escribir su costo al recibir.
2. *Algo nuevo:* Textiles Rosa → Algo nuevo → Casacas → «Casaca corta acolchada» → (la marca se salta: CAYLA) → color → tallas o «Lo pongo
   después» → cantidad → costo → venta sugerida → Seguir: el papel → … → Guardar. Vuelve a Registrar una compra → Textiles Rosa: la
   casaca ya está entre sus habituales.
3. *Primera compra:* Registrar una compra → Tejidos Andinos → va directo a «Es tu primera compra con él: dinos qué es».
4. *Duplicado:* Textiles Rosa → Algo nuevo → Blusas → escribe «blusa manga globo» → Seguir → «¿Es la Blusa manga globo que le
   compraste hoy?».

**Para llevarlo al ERP.** En el ERP de CAYLA cada línea de una orden de compra ya guarda **categoría, marca y descripción**
(`orden_compra_items`). Por eso los habituales de un proveedor se calculan **de sus órdenes anteriores** (agrupar por descripción
normalizada + categoría + marca, contar y ordenar por veces y fecha), **sin crear una tabla de productos por proveedor**. Es una
lectura (una función `fn_` de solo lectura, que va a la lista de lectura de `lib/espera-reglas.ts`), y el aviso de duplicado es la misma
comparación contra ese resultado.

## Buscar por categoría, proveedor nuevo y «¿A qué tienda va?» (2026-10-22, noche)

**Qué cambió (pedido de Felipe):**
- **Buscar por categoría.** En «¿A quién le compras?» hay un buscador por nombre y chips por categoría («Todos · Blusas · Polos ·
  Jeans …»): con «Jeans» solo quedan los proveedores a los que ya se les compró jeans, y cada proveedor dice qué vende («Jeans ·
  Shorts»). En «¿Qué le compras hoy?», los chips filtran sus productos por categoría, con cuántos hay en cada una («Blusas 4»).
- **Proveedor nuevo.** Al final de la lista, «Nuevo proveedor»: nombre, RUC (11 números o «No tiene RUC») y las marcas que trae
  (opcional). Si el nombre se parece a uno registrado, avisa antes de duplicarlo: «¿Es Textiles Rosa E.I.R.L.? Ya está registrado», con
  «Usar ese» y «No, es otro». Al registrarlo, sigue directo a su primera compra («Es tu primera compra con él: dinos qué es»). Lo demás
  (cuentas, contacto) lo completa Compras.
- **«¿A qué tienda va?»** al final de cada prenda, después de la venta: Tienda TRU, AQP o LIM. La tienda de la prenda anterior sale
  marcada «Como la anterior». Revisar dice «va a TRU»; un papel con prendas para dos tiendas dice «Mandar a TRU, AQP» y se manda
  en un envío por tienda: al elegir la tienda en «Armar un envío» se marcan solos los papeles que tienen prendas para ella y se ve solo
  lo que va a esa tienda. Al recibir, cada tienda ve solo lo suyo («Lo que anotó Marisol al comprar para Tienda TRU») y una línea con
  lo que de ese papel va a otra tienda.

**Recorrido para probarlo** (paso 2, celular):
1. Registrar una compra → chip «Jeans» → queda Confecciones Lupe. Borra el chip y escribe «lupe» en el buscador: también.
2. Textiles Rosa → chip «Polos» → solo sus 3 polos.
3. Un habitual → cantidad, costo y venta de un toque → **¿A qué tienda va?** → TRU. Otra prenda → … → AQP (la anterior sale marcada).
   Papel → Guardar: la fila dice «Mandar a TRU, AQP». Armar un envío → TRU → Mandar; Armar un envío → AQP → Mandar: «A TRU, AQP».
4. Registrar una compra → Nuevo proveedor → escribe «Textiles Rosa» → sale el aviso. «No, es otro» → otro nombre, «No tiene RUC» →
   Registrar y seguir → su primera compra.

**Para llevarlo al ERP:** el proveedor nuevo es `registrar_proveedor_de_orden` (ya existe: nombre + RUC o «sin RUC», no duplica y
devuelve el que ya estaba). La tienda de cada prenda es el destino de la línea, que ya existe en el reparto por tienda de las órdenes
de compra (ADR-0139 y la fase 3 de ADR-0362: «Por repartir» y el envío a cada sede). Los chips por categoría son un filtro de la misma
lectura de habituales y de las categorías que el proveedor ya maneja (`fn_proveedor_categorias`).

**Ajuste (2026-10-22):** «Nuevo proveedor» y «Algo nuevo de este proveedor» quedan **fijos al pie de la pantalla** (junto a «Revisar
la compra» cuando ya hay prendas anotadas): la lista corre por detrás y nunca hay que bajar hasta el final para verlos.

**Ajuste (2026-10-22):** «¿Qué es?» (la categoría de un producto nuevo) tiene **buscador**: filtra mientras se escribe, sin tildes ni
mayúsculas, y también encuentra por las prendas típicas de cada categoría («cárdigan» → Chompas). Si no hay ninguna, lo dice y sugiere
otra palabra. Para probarlo: Textiles Rosa → Algo nuevo → escribe «jean», «BLÚSA» o «zapatos».

## Reestructura para quien nunca usó un sistema (2026-10-22, noche)

**Cómo se hizo.** Con capturas de cada pantalla, dos lectoras ciegas leyeron la maqueta sin ver código ni documentos: «Ana» (19 años,
primer día) y «Rosa» (45, encargada de boutique, nunca usó un sistema). **Son agentes de IA, no personas**: lo que marcaron las dos
se corrigió y se volvió a probar una segunda vez. Falta la prueba con Daniel, Diego o una encargada de verdad.

**Lo que marcaron las dos y cómo quedó:**
| Antes | Ahora |
|---|---|
| Cinco botones sin orden («Me dieron plata», «Registrar una compra», «Otro gasto», «Armar un envío», «Terminé por hoy») | **«¿Qué hiciste?»** con tres respuestas grandes: **Compré ropa · Me dieron plata · Gasté en otra cosa**, cada una con su ejemplo. Lo pendiente sale aparte como **«Te falta: Mandar a la tienda»** |
| «Ronda», «Mi ronda de compras» | **«Mi plata para compras»**, «Tu plata para compras» |
| El saldo con cuatro cifras en una línea | «Tienes para comprar S/ X · Ya gastaste S/ Y de S/ Z»; el detalle, como un cuaderno: «Te quedó de la vez pasada + Te dieron hoy − Compraste − Gastaste en otras cosas = Te queda» |
| «S/ 500 por confirmar» (¿se puede usar?) | «Compras está revisando S/ 500: ya están en tu plata y puedes usarlos» |
| El contador de pasos cambiaba de «de 8» a «de 11» | Siempre **3 pasos**: Proveedor → Prendas → Boleta o factura (con el detalle: «Paso 2 de 3 · Prendas · costo») |
| Costo: el botón «Igual que la vez pasada» y el mismo número ya escrito abajo | El botón negro, o «Otro precio: escríbelo aquí abajo»; el «Seguir» gris dice qué falta |
| Un punto decimal en la cantidad | La cantidad no tiene punto |
| Al guardar, solo un aviso que se iba | Pantalla **«Listo, tu compra quedó guardada»** con «¿Y ahora? Anotar otra compra · Mandar a AQP · Ver mi plata» |
| «Armar un envío» volvía a preguntar la tienda y «Mandar» quedaba gris | **«Mandar a la tienda»**: una tarjeta por tienda con sus compras, «¿Cuántos fardos (paquetes)?» y «Mandar a AQP» |
| «Terminé»: dos casillas que se podían marcar juntas | Dos opciones de una sola respuesta, y el botón dice qué falta elegir |
| Botones grises sin explicación | Debajo de cada botón gris, qué falta («Escribe el nombre o toca uno de arriba») |
| Dibujos: efectivo parecía una muela; transferencia y Yape iguales | Banco, celular y monedas |
| Tienda: todo a la vez, la misma prenda dos veces, «Sumar», «Terminar: 12 prendas» con 30 en el fardo | **Tres pasos numerados**: **1 · Cuenta lo que llegó** (cada prenda que anotó la compradora con «Contar» o «Crear y contar»; buscar otra es secundario) → **2 · ¿Llegó todo?** → **3 · Ya conté todo** (sin número hasta terminar; «Te falta: 2. Boleta de Confecciones Lupe»). Se puede corregir el conteo después |
| Compras: la tira de los 4 casos, todos los proveedores como chips, «¿Quién responde?», textos de Finanzas y de la maqueta | **1 · Plata que anotaron** y **2 · Compras que ya llegaron**; el proveedor ya elegido con «No es este: cambiar»; «¿Qué hacemos?» con «Reclamar al proveedor · Esperar · CAYLA lo asume»; **perder plata se confirma** («CAYLA pierde S/ 24. ¿Seguro?»); «Cambiar el monto» en vez de «Corregir» |
| El aviso verde de arriba tapaba la flecha de volver | El aviso deja pasar el toque |

**Precio de venta (decisión de Felipe, 2026-10-22):** lo pone **la compradora** al comprar (con «Igual que la vez pasada» o el
sugerido por categoría); **al recibir, la tienda lo ve como sugerido** («lo puso Marisol al comprar; cámbialo si quieres») en «Contar» y
en «Crear y contar», y puede cambiarlo. Lo contado muestra «a la venta S/ 29.90».

**Queda abierto:** si llega un solo fardo de dos, la tienda no puede terminar a medias (hoy espera al otro).

## Cómo queda el menú de Compras al implementar la maqueta (decidido por Felipe, 2026-10-22)

Recibir mercadería **no es de Compras**: vive en Inventario (desde el 2026-10-14) y ahí queda, con su diseño nuevo de tres pasos.

| Hoy (7) | Al implementar (6) |
|---|---|
| Plan de campaña | **Plan de campaña** — sin cambios |
| — | **Mi plata para compras** *(módulo nuevo, nace solo para el líder)* — la compradora, en el celular |
| Fondos por rendir | **Revisar compras** — la oficina: *Plata por confirmar* · *Compras que llegaron* · *Cierres del día* |
| Proveedores | **Proveedores** — más los que se registran desde el celular, «para completar» |
| Facturas de proveedor | **Facturas de proveedor** — el archivo de boletas y facturas, que nacen de «Revisar compras» |
| Por pagar | **Por pagar** — solo lo comprado al crédito; lo pagado con la plata de la compradora llega pagado |
| Órdenes de compra | **Se quita del menú** (Felipe) |
| Notas de crédito de proveedor | **Se quita del menú** (Felipe) |

**Quitar no es borrar** (CLAUDE.md, «nunca borres datos»): los módulos `ordenes_compra` y `notas_credito` se apagan del menú y de Roles y
accesos, y sus tablas y funciones quedan. En producción, el 2026-10-22, tenían **0 órdenes de compra y 0 notas de crédito**: no se
esconde ningún dato. Lo que un proveedor debe por lo que no llegó o se cobró de más sigue en **«Nos debe»** (Proveedores y Por pagar),
que ahora se alimenta de «Revisar compras» («Reclamar al proveedor»).

**Notas de crédito de proveedores: por ahora no se manejan** (Felipe, 2026-10-22). No hay pantalla ni acción para anotarlas. Si un
proveedor devuelve plata o debe algo, va por «Nos debe». Si más adelante se necesitan, lo recomendado es una acción dentro de la
factura, sin opción en el menú (ADR-0306).
