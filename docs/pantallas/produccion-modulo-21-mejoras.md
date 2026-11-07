# Producción — 21 mejoras para que sea ágil, entendible y práctico

> Fecha: 2026-10-30 · SHA analizado: `b9e4df9d4` (= `origin/main`) · Solo análisis, no se tocó código.
> Método: 7 revisores leyendo el código vivo, cada uno con un ángulo (Resumen, Órdenes, Insumos, Abastecimiento,
> navegación y piezas únicas, oficio del taller textil, prueba ciega de lenguaje) → 56 hallazgos → 34 candidatos tras
> juntar duplicados → 4 escépticos que intentaron refutar cada uno contra el archivo citado. Ninguno quedó refutado,
> pero varios salieron con la evidencia corregida (abajo se usa la corregida). De los 34 se eligieron 21; los 6 que
> quedaron fuera están al final.
> **Falta:** verlo en el navegador y con una colaboradora real del Taller. Esto sale del código, no de una persona usándolo.
> **Choques:** varias mejoras caen en obras que ya están abiertas (ADR-0570, actividades 6–10; ADR-0554; ADR-0509). Esas
> van marcadas con ⚠ y se le pasan a la sesión que ya está en eso, en vez de abrir otra obra.
> 💰 = toca dinero, stock, permisos o una RPC: lo decide Felipe.

## A · Que nada se pierda ni se duplique

**1. Guardar «Terminé» y la tela del corte juntos, todo o nada, con un token contra el reintento** 💰 ⚠ADR-0570 · M
Hoy son dos llamadas seguidas (`AnotarAvanceModal.tsx:165-199`, y la salida en `AnotarSalidaModal.tsx:94-114`). Si el wifi
del Taller se cae entre las dos, el corte queda anotado y la tela no. Además, `anotar_termine` y `anotar_insumos_de_la_orden`
no llevan token: si alguien vuelve a apretar después de un corte de red, se anotan otras 30 prendas. Y el «Deshacer» no
devuelve la tela. Propuesta: una sola RPC `anotar_corte(…, p_token)` con `fn_intento_con_huella`. Lo mismo para la salida.

**2. Poner un candado a la tela antes de leer cuánto había** 💰 ⚠ADR-0570 · S
`anotar_insumos_de_la_orden` bloquea la orden, pero no el estante (`20261029190000…sql:140` y `:180`). Si dos cortadoras
anotan casi a la vez «quedaron 20 m» del mismo color, las dos leen «había 45 m» y la segunda recibe un «Avisa al líder»
falso, o el descuento queda mal. Propuesta: `pg_advisory_xact_lock` por (tela, sede), en orden de id, antes de leer.

**3. Que una factura suelta pregunte si es de una orden abierta del proveedor** 💰 · M
`ComprobanteProduccionForm.tsx` nunca menciona órdenes. Si el líder registra suelta la factura de una tela que ya tenía su
OI, Recibir muestra las dos cosas y los mismos 48 m se pueden recibir dos veces. Propuesta: al elegir el proveedor, un
`<Aviso>` que diga «Este proveedor tiene la OI-000012 abierta (48 m Milano Melange). ¿Es de esa orden?».

**4. Que los ajustes de conteo también rebajen el lote** 💰 ⚠ADR-0570 act. 6 · M
El saldo por lote no cuenta los ajustes (`20261029190000…sql:111-113`). Después de un conteo, la pantalla dice «hay 40 m»
y la base rechaza el corte con «el estante tiene un ajuste que los lotes no ven. Avisa al líder». Propuesta: que el ajuste
también pase por lote (exige cambiar un CHECK, con migración). Mientras tanto, solo cambiar el texto del error.

## B · Insumos (la pantalla de tus capturas)

**5. Una sola puerta para todo lo que llega: «Llegó una compra»** 💰 ⚠ADR-0570 act. 7 · L
Hoy la tela entra por cuatro puertas: «Ingresar insumo», «+ Ingresar lote», Recibir y «Registrar la compra». La primera
abre un lote sin proveedor ni factura (`InsumoModales.tsx:60`, `:85`), así que Por pagar no se entera de la deuda y Recibir
sigue mostrando la tela «por recibir». Propuesta: un botón que primero pregunte «¿Viene de un pedido?», ofrezca las órdenes
abiertas y al final pida cómo se paga. «Ingresar insumo» queda solo para «Encontré tela» o para el saldo inicial.

**6. Una sola frase por tela, que distinga «nunca se compró» de «se acabó», y una barra que no mienta** ⚠ADR-0570 act. 6 · S
«FLS01 · 1 lote · alcanza ~0 sem. · sin mínimo definido · Sin saldo · 0.00 m» dice cuatro veces «no hay», con palabras
técnicas (`InsumosPanel.tsx:328-357`). Sin mínimo, la barra se llena entera apenas hay 1 m (`insumos-reglas.ts:268-271`:
`tope = max(mínimo×3, saldo, 1)`). Por eso el color retirado se ve «lleno». Propuesta: un veredicto («Por comprar»,
«Se acabó», «Falta para las órdenes», «Alcanza») y debajo «Quedan 12 m · te dura unas 3 semanas». Sin referencia, no se
dibuja la barra. Y los metros con coma: «12,5 m».

**7. Cifras que piden algo: «Falta para cortar» y «Viene en camino», cada una con su botón «Pedir»** ⚠ADR-0570 act. 6 · M
«Bajo el mínimo 2» cuenta telas que no tienen mínimo (`InsumosPanel.tsx:93`), e «Insumos 7» solo cuenta el catálogo. El
subtítulo promete «qué pedir», pero en toda la pantalla no hay un solo enlace para pedir. Propuesta: las cifras se calculan
contra las órdenes en proceso y filtran la lista al tocarlas. La fila de una tela que no alcanza lleva un «Pedir» que arma
la orden de insumos con la tela y los metros (la regla ya existe en Resumen).

**8. Anotar la tela como se compró, en kilos o rollos, y que el sistema la pase a metros** 💰 ⚠ADR-0554 act. 4 · M
El punto se compra por kilo, pero la hoja pide «Cantidad (m)» y «Costo por m» (`InsumoModales.tsx:96-110`): hay que
convertir de memoria, y un error deja mal el costo de todas las prendas que salgan de esa tela. `metrosPorKilo` ya existe
y no se usa. Propuesta: «¿Cuántos kilos?» con el rinde de la tela, y debajo «= 173,5 m».

**9. El libro de movimientos dentro de cada tela, con la orden que la cortó** ⚠ADR-0570 · M
Hoy es una columna fija de 21rem con los últimos 12 movimientos de todas las telas mezclados (`InsumosPanel.tsx:183`,
`insumos.ts:95`). «Sale al cortar −48.00 m» no dice qué orden fue ni se puede tocar. Propuesta: el libro va bajo los lotes
de cada color, con «Sale al cortar · OP-000014 · Blusa Emma» como enlace. «1º» pasa a decir «Se usa primero» y «s/c»,
«sin código».

## C · La orden de producción

**10. Botones que digan «Mandar 30 a Costura Rosa» y «Recibir de Costura Rosa», en el orden en que pasa** · S
`RutaViva.tsx:224-233` dibuja primero «Vuelta» y después «Salida», con palabras de libro contable, aunque la misma orden
diga «Sigue: mandar costura a X». En el mismo cambio: `AnotarSalidaModal.tsx:152` manda a anular «desde «Todo lo que
pasó»», y esa sección se llama «Historia» (`LineaDeTiempo.tsx:42`). El título se guarda en una constante para que no
vuelva a quedar huérfano. Poner al día la guía y su huella.

**11. Preguntar a quién se manda al mandar, no frenarlo al pasar al stock** 💰 · M
Sin servicio elegido, la hoja se titula «¿Cuántas mandas a Pendiente de registrar?» y deja mandar igual
(`orden-pagina-reglas.ts:686-689`, `AnotarSalidaModal.tsx:123`). El problema recién aparece al pasar al stock. Propuesta:
el primer campo es «¿A quién se lo mandas?», con «+ Registrar» y «Todavía no sé». Es una sugerencia, no un candado.

**12. La tela de la orden se nota al abrirla y se resuelve dentro de «Terminé»** 💰 ⚠ADR-0509/0554 · M
«Sin tela elegida» vive plegado y no cuenta como falta (`orden-nivel-dos-reglas.ts:35-44`). Al cortar, el aviso dice
«cierra esta hoja y usa «Declarar tela y avíos»» (`orden-tela-sin-anotar-reglas.ts:71`), y la cortadora pierde las 15
celdas que ya revisó. Hay seis lugares para anotar la tela de una orden. Propuesta: en «Terminé», un combo «¿Con qué tela
cortaste?» y el «¿cuánto quedó?» en la misma hoja. En la orden, un aviso ámbar «Sin tela: el costo por prenda saldría sin
tela». Si «Nueva orden» debe exigir tela (salvo una muestra o tela del cliente) lo decide Felipe.

**13. Anotar las fallas de la vuelta igual que en «Terminé»: «Se arregla / Segunda / No volvió»** 💰 · M
La vuelta usa otro control («Volvieron buenas / Segundas / Faltaron», `AnotarVueltaModal.tsx:45`, `:142-147`), pide un
motivo escrito a mano y no tiene «Se arregla». Tres blusas que el Taller puede rehacer quedan como segundas. Propuesta:
usar `<FilasDeFalla>` con los motivos a un toque.

**14. La cabecera de la orden muestra lo que sigue; Anular y Revertir pasan a «Más»** · S
En una orden en proceso, el botón más visible es el rojo «Anular orden» (`AccionesDeLaOrden.tsx:38-41`). «Llevarlas a las
tiendas», que deja el traslado armado, solo sale en un aviso de 9 s: si se pierde, hay que escribir el traslado a mano.
Propuesta: «Llevarlas a las tiendas» fijo en la cabecera de una orden cerrada. Lo peligroso va en `<MenuAcciones texto="Más">`.

## D · Abastecimiento: pedir → factura → llegó → pagar

**15. Cada orden de insumos con su trayecto «Pedida → Facturada → Llegó → Pagada», y filtros por lo que le falta** 💰 · M
La orden solo conoce «Generada» o «Anulada» (`ordenes-compra-reglas.ts:138-142`): sigue diciendo «Generada» con la tela ya
en el Taller, y al pie junta hasta cuatro chips sueltos. La lista solo filtra «Generadas / Anuladas». Propuesta: una regla
pura que derive el eslabón. El chip de cada fila dice lo que falta («Falta la factura», «Falta recibir», «Falta pagar»).
Después, con OK, las píldoras y la cifra de atrasadas.

**16. Por pagar dice si la tela ya llegó, antes del botón «Pagar»** 💰 · M
Hoy se puede pagar una factura cuyos 48 m todavía no llegaron: la fila no lo dice, aunque el detalle sí lo sabe
(`PorPagarProduccionPanel.tsx:108-130`). Propuesta: un chip «Llegó todo / Falta llegar 12 m / Sin llegar» y un aviso en la
hoja de pago que no bloquea. Facturas deja de repetir las cifras de Por pagar y responde «qué falta recibir».

**17. Una sola palabra para cada cosa, y Recibir sin códigos ni reglas escondidas** · S
El mismo documento se llama «Facturas de insumos», «Registrar la compra», «Comprobantes» y «Papel en parte». Recibir titula
«Recibir OI-000012», explica en un párrafo que «en blanco es todo lo que queda y «0» si no llegó nada» y muestra «sin IGV»
a quien solo cuenta metros (`RecibirOrdenInsumoModal.tsx:127`). Propuesta: decir «factura o boleta» en toda la cadena. El
título pasa a «Pedido a Textiles Lima · 28 oct» y un botón «Llegó todo» llena las cajas. El IGV se pliega en «Precio del
pedido».

## E · Resumen: qué fabrico hoy

**18. En «¿Qué fabrico primero?», decir si la tela alcanza para lo sugerido** · M
La fila dice «Fabricar unas 40 prendas» y no dice si hay tela. El dato ya se calcula (`page.tsx:102`
`materialesDelModelo`, la hoja dice «Faltan 80 m»), pero no llega a la fila (`produccion-primero.ts:21-64`). Propuesta: un
`<Chip>` «Hay tela» o «Falta Milano 12 m», con «Pedir» al lado.

**19. «Para decidir» sin el sobrestock, y el total de prendas en el título** · S
Cada modelo con sobrestock suma una tarjeta «no produzcas más» que no pide ninguna decisión (`produccion-decisiones.ts:576-588`),
y entierra la entrega vencida y el pago vencido. El globito cuenta modelos, pero la carga de la semana son prendas. La frase
«se están agotando y sí se venden» sale aunque todos sean «para vigilar». Propuesta: el sobrestock pasa a una línea de «Los
demás modelos», el título lleva «unas 180 prendas» y «Preparar orden» se llama igual en la hoja.

## F · Todo el módulo

**20. Nombres de menú que digan qué hay detrás** · S ⚠ADR-0509
«Órdenes» y «Órdenes de insumos» conviven en el mismo grupo (`menu.ts:252-278`), «lote» significa una orden en un lado y un
rollo en el otro, y la lista dice «Orden de antes de las fases». Propuesta: «Órdenes de producción», «lote» solo para la
tela, «Orden antigua: sin pasos». Regenerar `menu-hoy.golden.json`.

**21. Lo escondido a la vista y lo hecho a mano con las piezas del sistema** · M
A Cotizaciones de maquila solo se llega por un enlace dentro de Proveedores, y muestra «(D-31)» en pantalla. Eficiencia
sigue marcada «futura» en `menu.ts:290`, y sus cuatro tarjetas llevan el punto verde fijo aunque el costo suba un 30 %. Tres
listas (Facturas, Proveedores, Cotizaciones) arman su tabla a mano y 7 de las 10 rutas siguen «pendiente» en la guía de foco,
entre ellas Recibir y Facturas, que son las que se llenan. Propuesta: «Precio de afuera» como pestaña del Resumen, que el
color del punto lo decida una regla, `<Tabla>` en las tres listas y `/focus` en las pendientes.

## Quedaron fuera (reales, de menor impacto inmediato)
- Anotar un tendido que corta dos órdenes del mismo rollo y repartir la tela (`20261029190000…sql:32`, ya en su «SE ROMPE SI»).
- Tarjetas de cifra del Resumen sin enlace, y «Ventas/sem.», «Cobertura» y «Poca base» en la tabla de abajo.
- Preguntar «¿Cuándo?» también al mandar y al recibir (hoy solo «Terminé» tiene fecha).
- Imprimir la hoja de corte con un QR que abre «Terminé» en el celular (antes, preguntar si la orden viaja en papel).
- Eficiencia: costo por modelo contra su precio.
- La entrega de Nueva orden con el selector de fecha del navegador en vez de `<CampoFecha>`.
