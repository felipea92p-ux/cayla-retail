## Auditoría de Compras, Recibir mercadería y la IA de fotos y colores (2026-11-15)

Cómo se hizo: base local con las 1239 migraciones, 73 pruebas de RPC (todas pasan), recorrido en el navegador de la cadena compra → envío → conteo → stock, y cinco revisores de código cuyos hallazgos graves se comprobaron contra las funciones vivas. «Confirmado» = visto en el navegador o leyendo la pantalla y la función viva; «por comprobar» = leído en un solo lado.

### Arreglado en esta rama (solo web, con prueba)
- [x] El color leído de la foto no asienta un metálico por su tono (`lib/colores-de-la-foto.ts`, `cartaComparable`). Visto antes y después en el navegador: gris → «Gris», beige → «Vainilla», marrón → «Tostado».
- [x] Recibir ▸ Cerrar no cierra con una línea cuyo guardado falló (`CerrarEnvio.tsx`; regresión del 2026-11-12).
- [x] Reabrir y volver a cerrar un envío en la misma visita (`RecibirContando.tsx`, la versión más alta). Visto en el navegador: 3 → 4 → 5 → 6.
- [x] La fila de una prenda «por definir» no ofrece «Llegaron las N» (`CategoriasAcordeon.tsx`). Antes dejaba «4 de 4 · Cuadra» con nada guardado.
- [x] «Crear ahora» de Para después manda el proveedor de su línea (`proveedorDeLaHoja`, una regla para Contar y para esa hoja).
- [x] La galería «¿Esta prenda ya existe?» dice «No se pudo buscar» ante un corte, en vez de «no hay» con «Crearla como nueva» al lado.
- [x] «Pagar juntos» en varios medios lee «500,50» (`PagoJuntosModal.tsx`, `PagoPiezas.tsx`).
- [x] Mis compras ▸ Algo nuevo: apagar «A la espera de precio sugerido» devuelve el precio que estaba escrito.
- [x] Recibir ▸ sumar un color a una prenda que existe: cerrar la hoja con una foto en curso pregunta antes.
- [x] La foto que va a la IA: fondo blanco al pasar a JPEG, se achica hasta entrar bajo 1 MB (un navegador que no escribe WebP mandaba un molde de más de 1 MB y cada color después del primero fallaba), tope de 160 s en el navegador y «No se pudo preparar esa foto» cuando el fallo no es el internet.
- [x] La propuesta de precio adelantada se muestra al llegar al paso «Precio» (antes había que pedirla de nuevo).
- [x] El detalle de una compra no ofrece «Anular comprobante» si ya tiene unidades recibidas (`ofreceAnularCompra`). Es defensa de la pantalla: el candado va en la base (ver abajo).

### Para decidir con Felipe: toca la base (dinero, stock o una función)
- [ ] **g1 · Corregir una compra ya enviada no llega al envío.** `corregir_compra_rapida` actualiza `orden_compra_items` y no `despacho_items`; `cerrar_conteo_envio` toma el costo de `despacho_items.precio_unitario` y `preparar_prenda_al_recibir`, la categoría y la marca. La hoja deja editar el costo aunque ya salió (`HojaCorregirCompra.tsx`). Confirmado leyendo las dos funciones vivas. Propuesta: propagar costo, nombre, categoría y marca a los envíos `en_camino` y rechazar el cambio si el envío ya está abierto o cerrado (`definir_prenda_de_compra` ya propaga la categoría así).
- [ ] **g1 · Una compra recibida antes de su comprobante se puede anular.** `anular_compra` solo busca `movimientos.compra_item_id`; lo recibido antes vive en `compra_item_recibido_antes`. La invariante INV-14 del vigía mira lo mismo, así que tampoco lo vería. Confirmado en la función viva; sin reproducir (la base local tiene 0 filas en esa tabla).
- [ ] **g2 · El detalle de esas compras dice «0 de 12» y ofrece «Reasignar».** Las vistas `compra_items_resumen` y `compra_item_reparto_resumen` y las funciones `reasignar_reparto_compra` y `cerrar_linea_compra` no conocen `compra_item_recibido_antes` (la cabecera sí: `recalcular_compras`). Confirmado en la vista viva.
- [ ] **g2 · Anular el pago hecho con la plata de la compradora infla su fondo.** `fn_archivar_pago_compra` solo frena los pagos con saldo a favor. Por comprobar en pantalla.
- [ ] **g2 · Dos rondas seguidas cerradas en negativo se pagan dos veces.** `terminar_dia_compras` guarda el saldo acumulado y Revisar compras propone cada cierre entero (50 y 80 por una deuda de 80). Por comprobar.
- [ ] **g3 · Historial ordenado por «Vencimiento» pierde las compras al contado al pasar de página** (`listar_compras` compara con NULL; el cursor sale con fecha vacía). Reproducido por el revisor con un SELECT.
- [ ] **g3 · «Llevar N al stock ya» (una parte) con cambio de precio siempre falla:** `cambiar_precios_en_recepcion` exige la combinación contada y la tabla a medias no se guarda.
- [ ] g4 · La galería de prendas existentes filtra en el navegador sobre las 30 primeras por nombre (`fn_prendas_para_recibir`): con catálogos grandes, buscar por color o marca dice «no hay».
- [ ] g4 · Las píldoras del Historial cuentan facturas de gasto que la lista no muestra; en Por pagar, un comprobante sin vencimiento cae en una banda en la pantalla y en otra en la base.

### Para decidir con Felipe: cómo debe comportarse la pantalla
- [ ] **g2 · El apunte de compras no guarda borrador.** Recargar, o que el celular descarte la pestaña al ir a la cámara o a Yape, pierde la marca, el proveedor y todas las prendas (visto en el navegador). Recibir ▸ Contar y Nueva orden sí guardan. Falta decidir cuándo muere el borrador (al guardar, al salir a propósito, a las N horas).
- [ ] **g2 · Volver al paso 1 y elegir otra marca conserva las prendas:** toda la compra queda con el último proveedor (`elegirProveedor` no toca `lineas`). Falta decidir: preguntar, o empezar otra compra.
- [ ] g3 · Tope de 100 líneas por compra solo en la base: 35 modelos a 3 tiendas lo pasan, el aviso llega al guardar y «anótala en dos» choca con el mismo comprobante.
- [ ] g3 · Una foto en «Arreglando la foto con IA…» no se puede quitar ni cancelar, y las demás esperan al molde: con OpenAI lento son hasta 4 minutos sin poder crear.
- [ ] g4 · Mis compras dice «Por cada una ganas S/ 54.90» (venta menos costo) y Recibir «Ganas S/ 41.19 · 54 %» para la misma prenda: el 2026-11-14 se unificó Recibir y Nuevo producto, no Mis compras.
- [ ] g4 · Registrar proveedor con el padrón caído dice «confírmalo con el cliente antes de emitir»; «Nombre de la vestido»; la lista «¿Quién te trae la marca nueva?» incluye a los proveedores de luz, agua y teléfono.
- [ ] g4 · Sin comprobar en el Safari del equipo: si su canvas escribe WebP (con el arreglo de hoy ya no falla, pero el molde viaja más chico).

### No cubierto
- Plan de campaña (`/compras/plan`): solo el recorrido de humo, sus pantallas abren sin errores.
- Celular a 375 px y modo oscuro de lo tocado: los arreglos no cambian la cara de ninguna pantalla.
- Llamadas reales a OpenAI: la IA se simuló en el navegador (sin gasto). El modelo, el tamaño y los límites por minuto de la cuenta no se comprobaron.
- La cuenta de una colaboradora que no es líder: todo el recorrido se hizo como Admin.
