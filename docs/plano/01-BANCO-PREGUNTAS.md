# Banco de preguntas del plano maestro — PL-25 a PL-143

> Generado el 2026-09-22. 119 preguntas en 4 sesiones (~29-31 c/u), sobre 8 frentes, filtradas contra el
> acta de las 24 decisiones y la ronda de 60 preguntas del 2026-09-12 para no repetir nada ya decidido.
> Eliminadas por repetir algo ya decidido: 18. Eliminadas por solaparse entre frentes: 4.


## Sesión 1 — FRENTE 1 — El negocio real: flujos de tienda y Taller que el ERP debe reflejar + FRENTE 2: Glosario y vocabulario canónico — la palabra exacta para cada cosa, en negocio, pantalla y base (29 preguntas)

### PL-25 · Flete tienda

**R-24 dice que el traslado interno lo paga la tienda que recibe, pero A-07 deja abierto si ese costo frena que la mercadería estancada en TRU llegue a Tienda LIM (~S/2.5k/mes, la que menos puede pagar flete). ¿Qué regla aplicamos?**

*Por qué:* docs/datos/15-COMO-OPERA-CAYLA.md:242-248 (R-24, A-07): 'la tienda chica (Lima, ~S/2.5k al mes) es la que menos puede pagar flete y la que más necesitaría recibir mercadería que no rota en Trujillo... vale la pena revisar esta regla contra el objetivo'. Contradice directamente a R-22 si no se resuelve.

- **Sigue pagando quien recibe, sin excepción (Recomendado)** — Ganas: una sola regla simple, sin negociar caso por caso. Pagas: Lima puede seguir sin recibir lo que no rota en TRU si el flete le pesa — justo lo contrario de R-22.
- **CCO (sede corporativa) absorbe el flete cuando el destino es Tienda LIM** — Ganas: Lima nunca se frena por flete y rota mejor el stock estancado. Pagas: un gasto nuevo sin dueño claro en D-32 (CCO) y hay que fijar un tope mensual.
- **Sin flete solo cuando el traslado nace de una alerta de "estancado" del sistema, nunca cuando la tienda lo pide por gusto** — Ganas: solo se subsidia el traslado que evita pérdida real (R-22). Pagas: el sistema necesita distinguir traslado por alerta vs. traslado manual, hoy no existe esa marca.

### PL-26 · Estancado

**A-02 deja abierto el umbral de 'estancado' por categoría (R-20 dice que depende de si es básico o de campaña, y hoy no existe ninguna columna que lo guarde). ¿Cómo lo fijamos para arrancar?**

*Por qué:* docs/datos/15-COMO-OPERA-CAYLA.md:208-215,256 (R-20, A-02): 'el umbral de "estancado" es una columna de categorias, no una constante en el código... A-02 · El umbral de "estancado" por cada categoría · Felipe con las líderes'.

- **Un solo número para empezar (30 días, como dice R-20) y se ajusta por categoría después con las líderes de equipo (Recomendado)** — Ganas: sale ya, sin esperar a reunir a las 3 líderes de equipo. Pagas: una blusa de campaña y un básico se tratan igual las primeras semanas.
- **Felipe fija hoy mismo el número por cada categoría real del catálogo** — Ganas: el umbral correcto desde el día uno. Pagas: hay que revisar cada categoría antes de que exista el reporte que lo usa.
- **Se calcula solo, comparando la velocidad de venta real de cada categoría (percentil, no un número fijo)** — Ganas: se ajusta con el historial real sin que nadie lo actualice a mano. Pagas: necesita meses de ventas reales que hoy no existen (catálogo recién cargado).

### PL-27 · Rol Compras

**R-10 encontró un hueco real: quien paga proveedores y crea fichas no encaja en ninguno de los 4 niveles de D-12 (Admin/Líder de equipo/Integrante/Solo lectura) — en producción hoy crear un proveedor u orden solo lo puede hacer Felipe (docs/datos/modulos/09-compras-y-proveedores.md, 'Quién ve y quién toca'). ¿Creamos un nivel propio para Compras?**

*Por qué:* docs/datos/15-COMO-OPERA-CAYLA.md:100-109 (R-10): 'los cuatro niveles de D-12... no contemplan este rol... Ese par de permisos juntos merecen una decisión explícita, no un descuido.' docs/datos/modulos/09-compras-y-proveedores.md:319-322: 'En producción, Líder de equipo NO manda en compras... crear un proveedor o una orden lo puede hacer solo Felipe.'

- **Sí, un nivel "Compras" nuevo: crea/edita proveedor, registra orden y pago, pero no cierra caja ni ve otras sedes (Recomendado)** — Ganas: el permiso calza con lo que esa persona hace de verdad, sin prestarle el nivel completo de Líder de equipo. Pagas: una quinta fila en la tabla de roles y más RLS que mantener.
- **Compras entra como Líder de equipo, sin distinguir sede** — Ganas: cero tablas nuevas, se resuelve hoy con lo que ya existe. Pagas: esa persona también podría cerrar caja o ajustar stock de cualquier tienda, que no es su trabajo.
- **Compras entra como Integrante y el líder de turno o Felipe aprueban cada proveedor y cada pago** — Ganas: máximo control, nadie se inventa un proveedor solo. Pagas: un cuello de aprobación en cada compra, contra la velocidad que R-44 ya eligió.

### PL-28 · Vale/saldo

**R-37 dice que el segundo paso de una devolución es 'nota de crédito o vale', pero solo existe la nota de crédito de SUNAT (ligada a un comprobante) — un 'vale' sin comprobante no tiene dónde guardarse y D-43 sigue como hueco. ¿Construimos el vale como algo aparte de la nota de crédito SUNAT?**

*Por qué:* docs/datos/15-COMO-OPERA-CAYLA.md:367-369 (R-37) y docs/datos/modulos/07-ventas-y-caja.md (D-43, hueco 1): 'Las devoluciones de clientas no existen; se marcan como hueco... Bloqueadas por D-34.' informes-lectores.md:355: 'vale o saldo a favor de la clienta... solo existe la nota de crédito SUNAT... y devoluciones no guarda saldo'.

- **Sí: un saldo por clienta (con o sin comprobante), que se canjea en cualquier compra futura (Recomendado)** — Ganas: cubre el caso real (clienta sin comprobante que solo quiere cambiar de talla otro día). Pagas: es una tabla y una regla de vencimiento nuevas, y hay que decidir si vence igual que el saldo de fidelización de R-34.
- **No: toda devolución sin cambio inmediato se resuelve con nota de crédito SUNAT, aunque la venta original no tuviera comprobante** — Ganas: cero tablas nuevas, un solo mecanismo. Pagas: una venta 'sin comprobante' (R-15, ya decidido que se registra igual) no tiene cómo devolverse sin inventar un comprobante que nunca existió.
- **El vale se pospone: mientras tanto, toda devolución sin cambio inmediato es reembolso en efectivo** — Ganas: simple para quien está en caja. Pagas: contradice el orden que el propio R-37 fija (reembolsar es la última opción, no la segunda).

### PL-29 · Anular venta

**R-46 dice que anular una venta es del líder de equipo 'mientras la caja de ese día siga abierta', pero la caja no tiene fecha de negocio (hueco 12, docs/datos/modulos/07-ventas-y-caja.md): una caja abierta el lunes puede seguir abierta el viernes. ¿Qué ventana real usamos?**

*Por qué:* docs/datos/15-COMO-OPERA-CAYLA.md:456-462 (R-46) y docs/datos/modulos/07-ventas-y-caja.md, hueco 12: 'La caja no tiene día... una caja abierta el lunes sigue abierta el viernes y se lleva las ventas de toda la semana.'

- **Mientras la caja siga abierta, sin importar cuántos días lleve — la regla literal de R-46, tal cual (Recomendado)** — Ganas: cero tablas nuevas, reutiliza lo que ya existe. Pagas: si una caja queda abierta varios días (hoy pasa, según la bandeja de pendientes), la ventana de anular se estira sin que nadie lo note.
- **Mismo día calendario en que se vendió, exista o no ya un cierre de caja** — Ganas: coincide con lo que dice R-46 en palabras ('el mismo día'), sin depender de cuándo alguien cierra caja. Pagas: exige que `cajas` tenga una fecha de negocio propia — hoy no la tiene, es trabajo nuevo.
- **Lo que sea más corto entre los dos: mismo día calendario Y caja abierta** — Ganas: cierra el hueco de las cajas de varios días sin perder la protección de la caja cerrada. Pagas: misma columna nueva que la opción anterior, más una regla doble que explicar en pantalla.

### PL-30 · Pago S/2000

**R-09 (ley 28194) dice que un pago en efectivo a proveedor de S/2,000 o más pierde el crédito fiscal, y pide 'un aviso' en pantalla. ¿El aviso detiene el pago o solo lo advierte?**

*Por qué:* docs/datos/15-COMO-OPERA-CAYLA.md:86-94 (R-09): 'aviso en la pantalla de pago cuando metodo_pago = "efectivo" y monto >= 2000... barato de construir'. Solo dice 'aviso', no dice si detiene el pago — hueco real de diseño.

- **Solo avisa: aparece el mensaje, pero se puede seguir si de verdad no hay otra forma de pagar (Recomendado)** — Ganas: cubre el caso real (proveedor de Gamarra que solo acepta efectivo, R-07) y nunca bloquea una compra urgente. Pagas: alguien puede ignorar el aviso por apuro y CAYLA pierde el crédito fiscal igual.
- **Bloquea: un pago en efectivo ≥ S/2,000 no se puede registrar sin partirlo en transferencia** — Ganas: cero pérdidas de crédito fiscal por esta causa. Pagas: con >30% de compras sin factura y proveedores chicos que solo manejan efectivo (R-07), puede trabar una compra real por seguir una regla tributaria.
- **Bloquea, pero el líder de equipo puede autorizar la excepción con motivo** — Ganas: control real sin frenar del todo la operación. Pagas: otra autorización más sobre el equipo de Compras (ver la pregunta de Rol Compras).

### PL-31 · OC a medias

**Una orden de compra que llega incompleta (parte del fardo nunca llega) hoy se queda 'pendiente' para siempre — el propio ADR-0035 deja esto abierto. ¿Cómo se cierra una orden recibida a medias para siempre?**

*Por qué:* docs/AUDITORIA-2026-09-17.md, sección Compras (Pendientes): 'Decisión pendiente: qué hacer con una factura recibida a medias para siempre — ADR-0035 deja explícitamente abierto si se agrega una acción para cerrar una línea con faltante.'

- **Un botón 'Cerrar con faltante': el líder de equipo confirma que lo que no llegó ya no va a llegar y la orden queda cerrada con la diferencia visible (Recomendado)** — Ganas: la orden deja de ensuciar 'Dinero comprometido en camino' para siempre. Pagas: hay que decidir si esa diferencia se resta del monto pagado o solo queda anotada.
- **Se cierra sola a los N días de la fecha estimada, sin que nadie confirme nada** — Ganas: cero trabajo manual. Pagas: puede cerrar una orden que en realidad sí va a completarse, solo tarde.
- **Se queda como está: se anota en la nota de texto libre que ya no va a llegar el resto** — Ganas: cero cambios. Pagas: el número de 'comprometido en camino' sigue mintiendo indefinidamente (docs/datos/modulos/09-compras-y-proveedores.md, hueco 6).

### PL-32 · Reverso pago

**Hoy un pago a proveedor registrado por error no tiene reverso: deja esa factura bloqueada para pagos futuros para siempre porque no existe RPC de reverso. ¿Quién puede revertir un pago mal registrado?**

*Por qué:* docs/AUDITORIA-2026-09-17.md, sección Compras (Pendientes): 'Un pago a proveedor registrado por error no tiene reverso — deja esa factura bloqueada para pagos futuros para siempre porque no existe RPC de reverso.'

- **Solo el líder de equipo, con motivo obligatorio, y el pago original queda visible como anulado (nunca se borra) (Recomendado)** — Ganas: corrige el error del día sin perder rastro (principio de nunca borrar de CLAUDE.md). Pagas: una RPC nueva con sus propios candados (no revertir más de lo pagado, etc.).
- **Nadie revierte: si alguien se equivoca, se contacta a Felipe para que lo arregle directo en la base** — Ganas: cero código nuevo. Pagas: cada error de tecleo se vuelve un ticket a Felipe, y con 97% de compras al contado (R-01) el error es fácil de cometer.
- **El mismo Compras puede revertir su propio pago, sin pasar por el líder** — Ganas: se corrige al toque. Pagas: quien paga también puede borrar la evidencia de haber pagado mal — el mismo riesgo que R-44 ya reconoció y aceptó vigilar después.

### PL-33 · Estado OC

**El estado 'confirmada' de una orden de compra existe en la base pero ninguna pantalla lo escribe nunca — es un estado fantasma entre 'pendiente' y 'recibida' (docs/datos/modulos/09-compras-y-proveedores.md, hueco 8). ¿Lo usamos de verdad o lo quitamos?**

*Por qué:* docs/datos/modulos/09-compras-y-proveedores.md, hueco 8: 'El estado "confirmada" es inalcanzable... es un estado fantasma que ensucia el modelo mental de quien entra hoy.'

- **Se usa de verdad: el proveedor confirma el fardo y pasa a 'confirmada' antes de llegar, así 'Dinero comprometido' distingue lo pactado de lo ya confirmado (Recomendado)** — Ganas: una señal real de que el pedido va en camino, no solo pactado por WhatsApp. Pagas: un paso más que alguien tiene que acordarse de marcar.
- **Se quita: solo 'pendiente' → 'recibida' o 'cancelada', como funciona hoy en la práctica** — Ganas: menos estados que explicar en pantalla. Pagas: hay que tocar el CHECK de la base y limpiar el estado fantasma en el código.

### PL-34 · Validar RUC

**El RUC de un proveedor se escribe a mano y nadie lo valida contra SUNAT — la consulta al padrón (lib/padron.ts) hoy solo la usa Facturación, nunca la ficha de proveedor. ¿Validamos el RUC al crear un proveedor?**

*Por qué:* docs/datos/modulos/09-compras-y-proveedores.md, columna `ruc`: 'Se escribe a mano y nadie lo valida: la consulta a SUNAT (lib/padron.ts) solo la usa Facturación, nunca esta pantalla.'

- **Sí, igual que en Facturación: se consulta el padrón y se autocompleta razón social/dirección, pero se puede guardar igual si el proveedor no tiene RUC (Recomendado)** — Ganas: menos error de tecleo y datos reales para el sustento tributario. Pagas: depende de que el padrón responda; con >30% de compras sin factura (R-07), muchos proveedores ni tienen RUC que validar.
- **No, se deja como texto libre: la mayoría son proveedores chicos de Gamarra sin RUC de todos modos** — Ganas: cero fricción al crear un proveedor nuevo. Pagas: el RUC sigue siendo un dato decorativo, sin poder cruzarlo con nada.

### PL-35 · Cta. banco

**R-12 (dato duro: hay 2 cuentas empresariales, Interbank y BCP) propone —sin que Felipe lo haya confirmado— que una sea la Operativa y la otra la Reserva, sin tarjeta y movida solo por Felipe. ¿Confirmamos esa asignación?**

*Por qué:* docs/datos/15-COMO-OPERA-CAYLA.md:121-134 (R-12): 'Recomendación, y encaja con lo que ya existe: una es la Operativa... y la otra pasa a ser la Reserva... No hace falta abrir nada nuevo.' Es recomendación mía, no una decisión de Felipe todavía.

- **Sí, tal como lo propone R-12: una Operativa (todo el movimiento diario) y una Reserva (solo Felipe) (Recomendado)** — Ganas: separa la plata del día a día de la de gratificación/CTS/renta (R-13) sin abrir cuenta nueva. Pagas: hay que decir cuál banco es cuál, y que el líder o Compras solo opera contra la Operativa.
- **No: las dos cuentas se usan indistintamente, como hoy** — Ganas: cero cambio de hábito. Pagas: nada protege la plata de gratificación/CTS de gastarse en el día a día — el riesgo que R-13 ya señaló.
- **Se abre además una tercera cuenta de Compras con tope, como R-12 deja insinuado para más adelante** — Ganas: Compras nunca puede mover más de su tope. Pagas: una cuenta más, comisiones y conciliación mensual extra — el propio R-12 advierte que eso suma costo sin necesidad clara todavía.

### PL-36 · Herramientas

**R-51/A-08: las herramientas del Taller (tijeras cortahilos, abre ojal) no encajan como insumo consumible ni como activo fijo — la nota dice 'vale confirmarlo con el contador', que todavía no ha pasado. Mientras tanto, ¿cómo las registramos?**

*Por qué:* docs/datos/15-COMO-OPERA-CAYLA.md:523-535 (R-51) y tabla 'Lo que quedó abierto', A-08: 'Si las herramientas del taller se tratan como gasto o como activo · el contador'. Pregunto la postura interina de Felipe, no reemplazo al contador.

- **Como gasto al comprarlas (la propuesta ya escrita en R-51), y se revisa con el contador cuando exista Contabilidad completa (Recomendado)** — Ganas: no frena ninguna compra de hoy ni exige decidir algo contable sin el contador. Pagas: si el contador después dice que debían ser activo, hay que reclasificar retroactivamente.
- **Como activo fijo, igual que las máquinas de coser, hasta que el contador diga lo contrario** — Ganas: más cauteloso contablemente. Pagas: exige depreciación (P-18) sobre objetos de bajo valor — sobre-ingeniería para una piquetera.
- **Se posponen: no se registran todavía, se sigue anotando aparte hasta tener contador** — Ganas: cero riesgo de reclasificar después. Pagas: esas compras reales (uno de los 5 rubros de R-51) quedan invisibles para 'cuánto compré sin respaldo este mes' (R-08).

### PL-37 · Tope caja

**R-50 (ya decidido: el depósito sube al sistema con voucher y número de operación) no fija un monto máximo de efectivo que una tienda puede acumular antes de estar obligada a depositar. ¿Fijamos un tope?**

*Por qué:* docs/datos/15-COMO-OPERA-CAYLA.md:504-521 (R-50): describe el registro del depósito con voucher y número de operación, pero no un tope de efectivo en tienda — la pieza de control interno que R-50 no cubrió.

- **Sí, un monto por tienda que Felipe define, y el sistema avisa cuando el efectivo esperado del día lo supera (Recomendado)** — Ganas: menos efectivo parado y expuesto en el cajón de cada tienda. Pagas: hay que fijar el número por tienda y qué pasa un día de campaña (Navidad, R-19) cuando se dispara.
- **No, cada líder de equipo decide cuándo depositar según su criterio, como hoy** — Ganas: cero regla nueva que mantener. Pagas: nadie más que la líder sabe cuánto efectivo real hay guardado en cada tienda en un momento dado.

### PL-38 · Categ. gasto

**`gastos.metodo_pago` ya existe y ya se usa en el cuadre de caja, pero sus categorías son texto libre — el comentario de `0007_finanzas.sql` promete 'categorías de gasto estructuradas' en un ADR que nunca se escribió (hueco 15, docs/datos/modulos/07-ventas-y-caja.md). ¿Cerramos ya esa lista, sin tocar Contabilidad completa (que PL-08 dejó pausada)?**

*Por qué:* docs/datos/modulos/07-ventas-y-caja.md, hueco 15, y `0007_finanzas.sql:2`: 'categorías de gasto estructuradas' es una promesa incumplida. Revisita parcial de PL-08: esto NO reabre Contabilidad completa (asientos/PLE siguen pausados) — es solo la tabla `gastos` operativa que ya existe y ya se usa en el cuadre.

- **Sí: una lista cerrada con los 5 rubros reales de compra de R-51 (mercadería, insumos del taller, servicios de terceros, limpieza/oficina, herramientas) más los gastos de operación del día a día (Recomendado)** — Ganas: 'cuánto compré sin respaldo este mes' (R-08) y el margen por tienda salen de una categoría real, no de texto libre sin sumar. Pagas: hay que migrar lo poco que ya existe y mantener la lista.
- **No todavía: sigue como texto libre hasta que arranque Contabilidad completa** — Ganas: no se toca nada mientras TRU recién sale en vivo. Pagas: cada reporte de gasto por categoría (R-41, punto 2) sigue siendo imposible de armar.

### PL-39 · Eficiencia

**D-31 pide medir al Taller por 'eficiencia' además del costo absorbido, y hoy `grep eficiencia` no devuelve nada en el código (hueco 4, docs/datos/modulos/10-produccion-del-taller.md). ¿Qué significa 'eficiencia' para Felipe, en concreto?**

*Por qué:* docs/datos/modulos/10-produccion-del-taller.md, hueco 4: 'No existe la medición de eficiencia del Taller que D-31 pide ("lo que gastó contra lo que absorbió en las prendas que produjo"). grep -rn "eficiencia" apps/web sigue sin devolver nada.'

- **Cuánta tela se aprovecha de verdad: metros consumidos vs. metros que Audaces dice que debía consumir esa corrida (R-26/R-28) (Recomendado)** — Ganas: usa el dato exacto que ya trae Audaces, sin inventar una fórmula nueva. Pagas: solo sirve para tela; no dice nada de mano de obra ni de tiempo de la corrida.
- **Cuánto se planeó producir vs. cuánto salió bueno (`cantidad_plan` vs `cantidad_buenas`, ya existen las dos columnas)** — Ganas: cero dato nuevo que capturar, ya está en `producciones`. Pagas: no mide desperdicio de tela ni de plata, solo cuántas prendas se malograron.
- **Costo real de la corrida vs. lo que costaría mandarla a maquila externa (la cotización con fecha ya decidida en la ronda de 60 preguntas)** — Ganas: responde directo la pregunta de negocio 'me conviene tener Taller propio'. Pagas: depende de tener la cotización de maquila cargada y actualizada cada ~6 meses, que hoy no existe (hueco 3 del mismo módulo).

### PL-40 · Caja offline

**D-49 dice que la caja sin internet nunca se congela, pero abrir y cerrar caja hoy NO tienen versión offline (hueco 3, docs/datos/modulos/07-ventas-y-caja.md): 'si el internet se cae a las 9:55 y la caja todavía no se abrió, esa tienda no vende en todo el día, ni offline'. ¿Qué hace la tienda ese día?**

*Por qué:* docs/datos/modulos/07-ventas-y-caja.md, hueco 3: 'Abrir y cerrar caja no funcionan sin red... Promesa incumplida, ADR-0036 §"Lo que NO entra en este ADR": "Caja offline (abrir/cerrar) — abrir dos cajas de la misma sede sin coordinación es otro estado imposible (principio 2) que este ADR no resuelve".'

- **Se construye abrir/cerrar caja offline también, extendiendo el mismo mecanismo que ya protege la venta (ADR-0036) (Recomendado)** — Ganas: cumple D-49 sin excepción. Pagas: 'abrir dos cajas de la misma sede sin coordinación' es un estado imposible nuevo que hay que resolver bien — el propio ADR-0036 lo dejó fuera a propósito.
- **Se acepta el hueco por ahora: si cae el internet antes de abrir caja, la tienda anota en papel y carga todo al volver la señal** — Ganas: cero trabajo nuevo mientras TRU recién sale en vivo. Pagas: vuelve el problema que el ERP nació para resolver — ventas en papel que se pierden o llegan tarde.

### PL-41 · Sede o Ubic

**PL-15 fijó que en negocio se dice 'sede' y en la base 'ubicaciones', pero no fijó la palabra en PANTALLA — y la app hoy se contradice a sí misma: PerfilModal.tsx:222 y ColaboradoresTablas.tsx:132 muestran 'Ubicación'; CodigosDescuentoPanel.tsx:209 y caja/historial/page.tsx:51 muestran 'Sede'. ¿Qué palabra gana en pantalla, cara al colaborador?**

*Por qué:* PL-15 (docs/plano/00-ACTA-24-DECISIONES.md:134-138) solo fijó negocio=sede y base=ubicaciones, dejando la columna 'pantalla' sin decidir; la app real ya divergió sola entre 'Sede' y 'Ubicación' en componentes vivos, citados arriba con línea exacta.

- **"Sede" en toda pantalla (Recommended)** — Ganas: coherente con el vocabulario obligatorio de CLAUDE.md y con la palabra que ya usa Felipe hablando de negocio. Pagas: hay que corregir los componentes que hoy dicen 'Ubicación' (PerfilModal, ColaboradoresTablas, ComprobantesPanel, MovimientoDetalle) y considerar renombrar UbicacionSwitcher.tsx/SelectorUbicacion.tsx para no desalinear nombre de archivo y texto visible.
- **"Ubicación" en toda pantalla** — Ganas: coincide exactamente con el nombre de la tabla y columna (ubicacion_id), cero traducción entre código y pantalla. Pagas: contradice el vocabulario obligatorio de CLAUDE.md ('sede/tienda/boutique') y suena más técnico para una colaboradora de mostrador.
- **Mezcla deliberada por tipo de pantalla** — Ganas: 'Sede' en mostrador (vender, caja, colaboradores) y 'Ubicación' en pantallas técnicas (movimientos, inventario, configuración) — cada una con la palabra más natural para su público. Pagas: exige documentar y vigilar la regla; hoy está rota exactamente porque nadie la escribió.

### PL-42 · Rol en UI

**El rol de colaborador se muestra en pantalla con dos palabras distintas para lo mismo: PerfilModal.tsx:220 y AppShell.tsx:971 dicen 'Colaborador'; CajaAbiertaPanel.tsx:189 dice 'Integrante' para el mismo rol (`colaboradores.rol`). ¿Cuál es la palabra oficial en pantalla?**

*Por qué:* Contradicción real y ya en producción entre dos componentes vivos del mismo flujo (perfil/AppShell vs. caja); CLAUDE.md:149-151 dice ambas palabras son intercambiables ('colaborador/integrante') sin decir cuál va en pantalla. La propia memoria cayla-decisiones-60-preguntas-2026-09.md usa ambas sin resolverlo: Bloque 13 dice 'entra con rol `colaborador`' y Bloque 14 dice 'una integrante busca lo que necesita en mostrador' — la ambigüedad sigue viva incluso en las notas más recientes.

- **"Colaborador" en toda pantalla (Recommended)** — Ganas: coincide exactamente con colaboradores.rol='colaborador' (0016_roles_colaborador.sql), cero traducción al leer un mensaje de error o un log. Pagas: hay que corregir CajaAbiertaPanel.tsx y cualquier otro texto suelto que hoy diga 'Integrante'.
- **"Integrante" en toda pantalla** — Ganas: es la voz que usa Felipe y la que promete D-12 (Admin, Líder de equipo, Integrante, Solo lectura). Pagas: sigue sin coincidir con el nombre real de la columna, y hay que corregir PerfilModal.tsx y AppShell.tsx en vez de un solo componente.
- **Las dos conviven según el uso** — Ganas: 'Integrante' como plural/genérico ('los integrantes del equipo') y 'Colaborador' como el rol puntual de una persona, preservando ambos usos naturales del español. Pagas: exige una regla escrita de cuándo es cuál; la mezcla de hoy es accidental, no por esta regla, así que hay que auditar cada aparición para confirmar cuál sigue el patrón.

### PL-43 · Rol: código

**El código está dividido: la base dice colaboradores.rol IN ('lider','colaborador') (0016_roles_colaborador.sql:30), pero el front sigue tipando rol: 'lider' | 'integrante' (apps/web/lib/persona-actual.ts:14, RolMenu en apps/web/lib/menu.ts:52) y packages/shared/src/enums.ts define ROLES=['lider','integrante']. Tocan a 83 archivos que preguntan persona.rol. ¿Qué se corrige?**

*Por qué:* informes-lectores.md:261-262 ya deja planteadas ambas rutas con su costo (glosario 3 columnas: informes-lectores.md line ~254); esta pregunta cierra esa bifurcación con la cita exacta de los 3 archivos de código que hoy dicen 'integrante'.

- **Retirar 'integrante' del código (Recommended)** — persona-actual.ts, menu.ts y enums.ts pasan a 'lider'|'colaborador', igual que la base. Ganas: cero migración de esquema, una sola fuente de verdad (la base) para el tipo. Pagas: 'integrante' desaparece del código y solo queda como palabra de pantalla si Q2 lo decide así.
- **Migrar la base a 'integrante'** — Cambiar el CHECK de colaboradores.rol y los 83 archivos que ya dicen 'colaborador' en otro sentido. Ganas: coincide con D-12 tal como está escrito hoy. Pagas: cambio de esquema en producción con datos reales (25 colaboradores) y reescribir 83 archivos por una palabra, no por una regla de negocio nueva.
- **Dejarlo como está** — Ganas: cero trabajo hoy. Pagas: cualquier agente de IA que lea persona-actual.ts y luego escriba SQL contra colaboradores.rol='integrante' rompe en producción — es el tipo de bug que la regla de oro de migraciones existe para evitar.

### PL-44 · Sede=Taller

**El vocabulario obligatorio de CLAUDE.md dice 'sede/tienda/boutique', pero 'tienda/boutique' no describe al Taller — que README.md también llama 'sede' ('## Sedes reales: TRU · AQP · LIM · Taller'). Cuando una pantalla necesita la palabra paraguas para las 4 (3 tiendas + Taller), ¿'sede' incluye al Taller, o el Taller necesita su propio paraguas?**

*Por qué:* README.md:8 y CLAUDE.md:4 ya usan 'sede' incluyendo al Taller sin decirlo explícitamente; el vocabulario obligatorio (CLAUDE.md:150) solo nombra 'tienda/boutique', dejando fuera al Taller de forma literal. En cayla-finalidad-y-plano-2026-09.md, Felipe trata 'las 3 tiendas' y 'el Taller' como categorías separadas ('las 3 tiendas y el Taller juntos en Inicio'), sin fijar una palabra paraguas.

- **"Sede" incluye al Taller (Recommended)** — "Tienda" se reserva para las 3 que venden. Ganas: una sola palabra paraguas para selectores y textos genéricos, como ya hace README.md. Pagas: en textos de negocio hay que aclarar aparte cuándo 'sede' vende y cuándo produce, porque la palabra sola no lo dice.
- **"Ubicación" es el paraguas real** — 'Sede' se reserva para las que atienden clientas. Ganas: alinea 1 a 1 con ubicaciones.tipo de la base. Pagas: contradice PL-15, que ya fijó 'sede' = ubicaciones como par completo, no solo la parte que vende.
- **Sin paraguas: siempre 'tienda' o 'el Taller'** — Nunca se usa 'sede' a secas para las 4. Ganas: cero ambigüedad en cada frase. Pagas: rompe cualquier texto o selector genérico ('elige tu sede') que hoy cubre los 4 casos con una sola palabra.

### PL-45 · LIM vs 003

**En Dynamic (fuente real de identidad) el código LIM es el Taller y 003 es la Tienda Lima (ADR-0097; docs/datos/00-MAPA.md:15,21-22) — al revés de lo que sugiere el nombre. Retail V2 ya no usa esos códigos para identificar (ADR-0097 identifica por nombre+tipo), pero README.md:8 y CLAUDE.md:4 siguen escribiendo 'TRU/AQP/LIM + Taller', dando a entender que LIM=Tienda Lima. ¿Qué hace el glosario con estos códigos frente al colaborador?**

*Por qué:* Es la contradicción central que el propio encargo de este frente nombra explícitamente: 'nombres de código de sede (LIM=Taller en producción, 003=tienda de Lima) frente a lo que dice cara al colaborador', con evidencia en ADR-0097 y docs/datos/00-MAPA.md:15.

- **Nunca mostrar LIM/003 a un colaborador (Recommended)** — Siempre 'Tienda Lima' y 'Taller' completos; LIM/003 quedan anotados en el glosario solo como 'trampa histórica de Dynamic, no usar'. Ganas: elimina la trampa de raíz en vez de explicarla cada vez. Pagas: hay que corregir README.md:8 y CLAUDE.md:4 (PL-15 ya lo deja como pendiente #6 de su acta).
- **Adoptar 003 como código corto oficial de Lima** — LIM se reserva exclusivamente para el Taller en cualquier texto interno. Ganas: un código corto por sede sigue siendo útil en reportes y URLs, y coincide con Dynamic. Pagas: '003' no dice nada por sí solo a quien no conoce la tabla; exige la misma nota aclaratoria que la opción anterior.
- **Documentar la trampa pero seguir usando LIM como hoy** — Se permite seguir escribiendo 'LIM' para la tienda en textos informales. Ganas: no toca ningún texto existente. Pagas: PL-15 (se rompe si) ya advierte que CLAUDE.md sigue diciendo esto mal y que corregirlo es el primer paso del plano, no el último — esta opción lo contradice.

### PL-46 · OTRU

**OTRU (Oficina Trujillo) existe y está activa en Dynamic, pero retail 'no la ve' — no tiene fila en el equivalente V2 y nada avisa (docs/datos/00-MAPA.md:24,34). ¿El glosario de retail incluye OTRU, o queda fuera por completo?**

*Por qué:* docs/datos/00-MAPA.md:24 marca explícitamente que OTRU 'existe y está activa en el sistema de personal, y retail NO la ve' sin ninguna fila equivalente en V2; nadie ha decidido si eso es vocabulario del glosario o un pendiente de otro documento.

- **Fuera del glosario de retail (Recommended)** — Se documenta solo en el contrato con Dynamic (14-DYNAMIC.md) como 'existe allá, retail no la opera'. Ganas: el glosario de retail no promete una palabra para algo que ningún colaborador de retail va a ver nunca. Pagas: si retail algún día necesita reconocerla, nadie lo verá venir salvo por ese otro documento.
- **Incluida, marcada como hueco abierto** — Se incluye en el glosario con la nota 'invisible para retail hoy, riesgo abierto'. Ganas: deja constancia escrita de un hueco real (00-MAPA ya lo marca con ⚠️) en el documento que sí van a leer los agentes de IA. Pagas: mezcla en un glosario de vocabulario un pendiente de arquitectura que no es, en sí, una palabra en conflicto.

### PL-47 · Encargada

**D-12 decidió explícitamente 'nunca "encargada": hay hombres y mujeres' en favor de 'Líder de equipo' (docs/datos/DECISIONES-2026-09-12.md:68), y BACKLOG.md:4795 confirma que el pie del menú ya dejó de decir 'Encargada'. Pero GUIA-CARGA-CATALOGO.md, PLAN-DE-TRABAJO.md, ESTUDIO-CONTABILIDAD.md y MANUAL-CONTABLE-CAYLA.md — documentos que hoy leen colaboradoras reales — siguen diciendo 'Encargada'/'Encargadas' de punta a punta. ¿Se corrigen?**

*Por qué:* D-12 (docs/datos/DECISIONES-2026-09-12.md:68) ya prohibió 'encargada' por razón de género, y el propio código ya lo cumplió en el menú (BACKLOG.md:4795), pero 4 documentos operativos que colaboradoras reales sí leen no se corrigieron — deriva documental real, no hipotética.

- **Corregir todo a "Líder de equipo" (Recommended)** — Sin excepción, incluidas las guías de mostrador. Ganas: una sola palabra en cualquier documento que un colaborador pueda leer, sin depender de si es 'técnico' o 'de guía'. Pagas: son 4+ documentos y decenas de menciones a revisar uno por uno.
- **"Encargada" se acepta en guías de mostrador** — Nunca en código, pantalla ni en el glosario formal. Ganas: cero corrección hoy, y es más cercano al habla real de tienda. Pagas: contradice D-12 tal como está escrito ('nunca'), y dos documentos con dos reglas distintas es exactamente el tipo de deriva que este glosario busca cerrar.
- **Solo se corrige fuera de la segunda persona** — Se reemplaza por 'Líder de equipo' en todo, excepto frases dirigidas directamente a una colaboradora (p. ej. GUIA-CARGA-CATALOGO.md:12, '...pregunta a tu encargada de sede'). Ganas: conserva el tono conversacional donde ya funciona. Pagas: exige distinguir caso por caso, no una regla mecánica que un agente de IA pueda aplicar sola.

### PL-48 · Admin futuro

**Dynamic ya usa la palabra 'admin' con otro significado: fn_rol_actual()='admin' es hoy la condición que es_lider() traduce a 'Líder' en retail (docs/datos/00-MAPA.md, sección de roles). D-12 promete un cuarto nivel futuro de retail que también se llamaría 'Admin' (Felipe y quien designe, ve todo). Cuando se construya, ¿usamos la misma palabra o una distinta para no chocar con el 'admin' que ya significa 'líder' en Dynamic?**

*Por qué:* docs/datos/00-MAPA.md documenta 'el hallazgo que vale por todo el capítulo': fn_rol_actual()='admin' hoy equivale a Líder, mientras D-12 (línea 67 de DECISIONES-2026-09-12.md) reserva 'Admin' para un rol futuro distinto y más amplio — mismo nombre, dos significados reales. cayla-finalidad-y-plano-2026-09.md ya detalla qué vería ese Admin sin que nadie note ni resuelva el choque de nombre con Dynamic.

- **Nombre distinto en español (Recommended)** — P. ej. 'Dueño' o 'Gerencia' — 'Admin' queda libre para lo que ya significa en Dynamic. Ganas: evita que un agente de IA lea 'admin' en un log de Dynamic y lo confunda con el rol nuevo de retail. Pagas: hay que corregir D-12 y todo lo que ya cita 'Admin' como cuarto nivel (docs/datos/DECISIONES-2026-09-12.md:67, apps/web/lib/menu.ts:43).
- **Se mantiene "Admin" como dice D-12** — Se documenta en el glosario que es un homónimo del 'admin' de Dynamic con otro significado. Ganas: cero cambio a lo ya decidido y escrito. Pagas: dos 'admin' distintos en el mismo sistema es la misma clase de ambigüedad que ya causó que es_lider() lea fn_rol_actual()='admin' sin que nadie lo hubiera anotado como trampa hasta ahora.

### PL-49 · Vender/Venta

**El módulo de venta tiene 4 nombres coexistiendo: ruta /vender, id de nodo 'venta' (ADR-0057), etiqueta visible de grupo 'Ventas' (apps/web/lib/menu.ts:202) y etiqueta de pantalla 'Punto de Venta' (menu.ts:204). ¿Esta jerarquía de 4 palabras queda como está, o el glosario fija una sola palabra visible?**

*Por qué:* informes-lectores.md:672 señala explícitamente esta coexistencia de 4 nombres para la misma pantalla como fuente de confusión documental, con cita de ADR-0043, 0044, 0057 y 0114 y de apps/web/lib/menu.ts.

- **Queda como está, documentando la regla (Recommended)** — Ruta/id son vocabulario de código (nunca los ve un colaborador); 'Ventas'/'Punto de Venta' son las dos únicas palabras visibles, cada una con su rol claro (grupo vs. pantalla). Ganas: cero trabajo, y ya sigue la convención del repo (código en verbo/id, pantalla en español de negocio). Pagas: cualquier documento que mezcle las 4 sin anotar la regla se sigue leyendo como una contradicción.
- **Se fija una sola palabra visible** — 'Ventas' gana y se anota que 'Vender'/'venta'/'Punto de Venta' son solo nombres internos de código. Ganas: un colaborador nuevo ve una sola palabra en dos lugares del menú. Pagas: 'Punto de Venta' es la palabra que el propio Felipe usó para el flujo del celular (Bloque 4 de la memoria de 60 preguntas) — quitarla del texto visible se aleja de su propio lenguaje.

### PL-50 · Comprobante

**'Comprobante' nombra 3 objetos de negocio distintos en 3 pantallas: la boleta/factura que retail emite a la clienta y SUNAT acepta (ADR-0100, tabla comprobantes), la factura del proveedor en Compras (menu.ts:187) y el recibo de tela/avíos del Taller en Producción (menu.ts:163). 'Nota de crédito' repite el patrón: lo que retail emite a la clienta en una devolución (ADR-0100) frente a lo que un proveedor le acredita a CAYLA (ADR-0142, módulo /compras/notas-credito). ¿Se renombra alguno para distinguirlos fuera de su menú?**

*Por qué:* Confirmado en el propio código: apps/web/lib/menu.ts:163 y :187 usan 'Comprobantes' para dos objetos distintos, y ADR-0100 (venta) frente a ADR-0142 (compras) definen 'Nota de Crédito' con dueños y flujos de dinero opuestos.

- **Se mantienen los 4 nombres iguales (Recommended)** — El contexto de cada sección de menú (Ventas, Compras, Producción) ya los distingue; el glosario documenta la ambigüedad para que nadie la arrastre a un texto que mezcle módulos (ADR, BACKLOG, prompts). Ganas: cero cambio de pantalla ni de código, y las 4 ya conviven sin bug real hoy. Pagas: cualquier texto que hable de 'la nota de crédito' o 'el comprobante' sin decir de qué módulo sigue siendo ambiguo para quien no vive en el repo.
- **Se renombran los de Compras y Producción** — 'Factura de proveedor' y 'Nota de crédito de proveedor' en Compras, 'Comprobante del Taller' en Producción; 'Comprobante'/'Nota de crédito' a secas quedan solo para ventas/SUNAT. Ganas: fuera del menú, 'comprobante' y 'nota de crédito' dejan de necesitar aclaración. Pagas: toca 3 etiquetas de menu.ts más toda mención en ADR-0111/0142 y BACKLOG, por una palabra que hoy no ha causado un bug real, solo confusión de lectura.

### PL-51 · Cambiar sede

**La misma acción tiene dos verbos: 'Cambiar ubicación' (ColaboradoresModales.tsx:228, ColaboradoresTablas.tsx:53 — mover a un colaborador de sede) y 'Cambio de sede' (nombre del componente AvisoCambioDeSede.tsx — avisar que la sesión del líder cambió de sede). ¿Cuál gana como verbo oficial?**

*Por qué:* Dos componentes vivos y distintos (ColaboradoresModales.tsx:228 y AvisoCambioDeSede.tsx) usan dos verbos distintos para la misma acción de negocio, sin que ningún ADR haya fijado cuál es el verbo canónico.

- **"Cambiar de sede" en los dos casos (Recommended)** — Alineado con la respuesta de Q1 si gana 'sede' en pantalla. Ganas: un solo verbo para la misma acción de negocio (moverse/mover a alguien de sede), sin que el nombre dependa de si es el líder o un colaborador el que cambia. Pagas: hay que renombrar el texto de ColaboradoresModales.tsx y ColaboradoresTablas.tsx, no solo el componente del aviso.
- **Se quedan como están** — 'Ubicación' para la acción administrativa sobre otra persona (colaboradores) y 'sede' para el aviso de la propia sesión. Ganas: cero cambio, y 'sede' ya suena natural en el aviso ('te llevo a otra sede'). Pagas: es exactamente la mezcla sin regla que ya generó la Q1 — dos palabras para la misma cosa, sin que nadie haya decidido cuál va dónde.

### PL-52 · unidad_id

**El V1 muerto usaba asientos.unidad_id como tercera palabra para lo mismo que hoy es sede/ubicación (esas tablas no existen en V2). Cuando Garza (Finanzas) se construya sobre V2 y necesite anotar un gasto por sede, ¿la columna se llama ubicacion_id (consistente con el resto de V2) o puede reaparecer 'unidad' como palabra?**

*Por qué:* informes-lectores.md:331 documenta 'tres palabras para lo mismo: sede, ubicación, unidad', citando asientos.unidad_id de V1; el módulo que reintroduciría esa tercera palabra (Garza/Finanzas) todavía no existe, así que es la única oportunidad de cerrarla antes de construir.

- **Siempre ubicacion_id (Recommended)** — 'Unidad' queda retirada del vocabulario por completo, es exclusivamente V1. Ganas: cero tercera palabra para lo mismo; Finanzas hereda la misma convención que ya usa todo V2 (stock.ubicacion_id, movimientos.ubicacion_id). Pagas: ninguna real — es la opción de menor esfuerzo y mayor consistencia.
- **"Unidad" como sinónimo contable** — Se permite en Finanzas porque así habla el rubro ('centro de costo' = 'unidad de negocio'). Ganas: usa el vocabulario que un contador externo ya reconoce de otros sistemas. Pagas: reintroduce exactamente la tercera palabra que hoy confunde, en el módulo que menos puede permitirse ambigüedad (dinero).

### PL-53 · Taller

**packages/shared/src/enums.ts (líneas 1-13) todavía define TIPOS_SEDE=['tienda','fabrica','almacen'] y SEDES con 'TALLER', y docs/datos/00-MAPA.md:22 glosa el Taller como 'Fábrica (el Taller)' — mientras la base V2 y el resto del repo ya usan solo 'taller' (ubicaciones.tipo='taller'). ¿'fábrica' se purga por completo del vocabulario, o se conserva como sinónimo en contextos con terceros (maquila, proveedores)?**

*Por qué:* packages/shared/src/enums.ts líneas 1-13 son código muerto que el propio archivo admite ('esta lista NO refleja la realidad... anotada en el BACKLOG para borrarse') pero sigue usando 'fabrica', y docs/datos/00-MAPA.md:22 sigue glosando el Taller con esa palabra en un documento que los agentes de IA leen.

- **Se purga por completo (Recommended)** — Solo existe 'Taller' en cualquier texto, código o conversación con terceros. Ganas: una sola palabra en todo el sistema, sin depender de si el lector es interno o un proveedor de maquila. Pagas: enums.ts ya está marcado para borrarse (BACKLOG) — esto solo confirma que también se borra el comentario y el valor 'fabrica', no solo el código muerto.
- **Se conserva como sinónimo con terceros** — 'Fábrica' se mantiene al hablar con proveedores de maquila externos que no conocen el nombre interno 'Taller'. Ganas: más claro para alguien de afuera del negocio. Pagas: reintroduce en textos cara a terceros la misma dualidad que el repo ya está limpiando puertas adentro.


## Sesión 2 — FRENTE 3: arquitectura y el contrato con Dynamic + FRENTE 4: Modelo de datos e invariantes V2 (29 preguntas)

### PL-54 · Guardarraíl

**PL-07 decidió diferir la separación de Dynamic con un guardarraíl: consumir su identidad/rol "desde un solo punto" para que separarlos cueste días y no meses (00-ACTA-24-DECISIONES.md:74-80). Hoy la RLS de retail llama fn_rol_actual()/fn_sede_actual_persona() de Dynamic tal cual (03_candados.sql:41-55, citado en ADR-0091 §Consecuencias) y 52 archivos de supabase/migrations/*.sql referencian `public.` sin pasar por un archivo central. ¿Dónde debe vivir ese "punto único" de ahora en adelante?**

*Por qué:* PL-07 SE ROMPE SI: "cada migración nueva llama funciones de Dynamic por su cuenta... hoy nadie vigila esta regla" (00-ACTA-24-DECISIONES.md:79-80). Verificado en el worktree: 52 archivos de supabase/migrations/*.sql contienen `public.` y no existe .github/CODEOWNERS.

- **Un archivo/capa fija (ej. lib/dynamic-contrato.ts + un prefijo de función SQL) es la única puerta permitida (Recommended)** — Ganas: el día de separar, un solo archivo dice todo lo que toca a Dynamic. Pagas: mover las llamadas RLS y de vistas que hoy son directas, y mantener la disciplina en cada PR nuevo.
- **El punto único ya son los fn_ que 03_candados.sql reusa; solo falta documentarlo** — Ganas: cero código nuevo, ya funciona. Pagas: no cubre las 52 migraciones que tocan public. fuera de esos fn_; el guardarraíl sigue sin vigilancia real.
- **No hace falta punto único: cada módulo decide cómo llega a Dynamic según lo que necesite** — Ganas: velocidad hoy, cero fricción. Pagas: el costo de separar sube en cada PR sin que nadie lo note — exactamente el escenario que PL-07 nombra como ruptura.

### PL-55 · Chequeo CI

**No existe .github/CODEOWNERS ni un paso de CI que detecte una migración nueva llamando a public.* (Dynamic) fuera del punto único que se decida en la pregunta anterior. ¿Qué mecanismo lo vigila?**

*Por qué:* Verificado: .github/ solo tiene workflows/, sin CODEOWNERS. ci.yml:135-138 y 230-232 arman un stub de Dynamic para pruebas, pero no revisan qué funciones llaman las migraciones nuevas.

- **Chequeo automático en CI: falla si una migración nueva contiene public. fuera de la lista permitida (Recommended)** — Ganas: la regla se cumple sola, sin depender de que alguien se acuerde. Pagas: mantener la lista de excepciones y ajustar el script cuando la frontera crezca legítimamente.
- **Revisión humana: toda migración que toque public. exige un segundo par de ojos, apoyada en PL-10 (revisión para lo transversal)** — Ganas: no hay que escribir un script nuevo. Pagas: depende de que el revisor humano lo note cada vez; con 52 migraciones ya coladas, el historial dice que no siempre pasa.
- **Sin mecanismo nuevo: se confía en que el ADR y CLAUDE.md ya lo dicen** — Ganas: cero trabajo. Pagas: es la misma confianza que ya produjo 52 migraciones sin vigilancia; PL-07 se rompe en silencio.

### PL-56 · Fecha D-17

**D-17 (docs/datos/DECISIONES-2026-09-12.md:92-93) definió supabase/unificacion/ como "deuda a extinguir, con fecha" — esa fecha nunca se escribió, y ADR-0056 ya la declara "confirmada muerta como riel" desde el corte V1→V2. ¿Qué fecha o disparador cierra esta deuda?**

*Por qué:* sintesis.md:166: "D-17: supabase/unificacion/ era deuda a extinguir con fecha. No encontré esa fecha en los documentos que leí". informes-lectores.md:662 confirma que ADR-0056:5-7 la declara muerta pero D-17 sigue llamándola "el riel real".

- **Fecha fija: se archiva a docs/historico/ (PL-14) en la próxima sesión que toque este frente (Recommended)** — Ganas: cierra la deuda esta semana, no queda flotando otra vez. Pagas: hay que resolver antes las tablas huérfanas y lo que producción tiene y main no, o se archiva con huecos sin documentar.
- **Disparador, no fecha: se archiva cuando se reconstruyan las 3 tablas huérfanas y se reconcilien las funciones parchadas (ADR-0091 §SE ROMPE SI)** — Ganas: no se archiva nada a medias. Pagas: sin fecha límite, puede seguir postergándose como ya pasó una vez.
- **Se deja como está: ya nadie la usa como riel, no urge moverla** — Ganas: cero esfuerzo. Pagas: D-17 sigue incumplida y un agente nuevo puede volver a pegar 01_sedes.sql creyendo que es el camino vigente — el error que ADR-0091 ya documentó una vez.

### PL-57 · Deuda unific

**ADR-0091 confirma que 3 tablas viven en producción sin CREATE TABLE en ningún archivo del repo (retail.sede_meta, retail.sede_datos_fiscales, retail.configuracion_empresa — el "paso 02" que nunca se versionó). Si hubiera que reconstruir producción hoy, esas 3 tablas no existirían. ¿Se prioriza escribirlas ahora, antes de archivar unificacion/?**

*Por qué:* ADR-0091 líneas 92-97 y 110-123: "Hoy es imposible reconstruir producción solo con lo que hay en el repo"... "no está confirmada con un comando visto en ningún archivo ni log".

- **Sí, antes de archivar: una migración con las 3 tablas verificadas contra producción (Recommended)** — Ganas: el día de un restore completo desde cero, no falta nada. Pagas: una sesión completa contra producción en solo lectura para sacar la forma real de las 3 tablas antes de escribir el CREATE.
- **No ahora: se anota como pendiente con dueño (Gorrión) y se resuelve cuando haga falta reconstruir de verdad** — Ganas: cero trabajo esta semana, TRU sale en vivo primero (PL-01/PL-05). Pagas: la deuda sigue silenciosa y es justo el riesgo que Felipe no ve hasta que un restore falle.

### PL-58 · Gastos main

**sintesis.md:166 pregunta: "¿qué hacer con lo que producción tiene y main no (gastos/registrar_gasto, permisos revocados)?" — funciones vivas en producción sin gemelo en el repo. ¿Se reconstruyen en una migración nueva o se dejan como están?**

*Por qué:* sintesis.md:166, citando docs/BACKLOG.md:265-268: producción tiene gastos/registrar_gasto y permisos revocados que el repo no define en ningún archivo versionado — el mismo patrón que causó el drift de recibir_lote (ADR-0004).

- **Se reconstruyen con pg_get_functiondef contra producción, igual que hizo ADR-0004 con recibir_lote (Recommended)** — Ganas: cierra el mismo tipo de drift que ya causó un hallazgo de seguridad real (recibir_lote sin validar sede). Pagas: una auditoría función por función, ya anotada como pendiente en ARQUITECTURA.md §6.
- **Se documentan como divergencia conocida y se dejan para cuando alguien las toque por otra razón** — Ganas: cero esfuerzo ahora. Pagas: el próximo CREATE OR REPLACE sobre esa función desde el repo puede pisar silenciosamente lo que produce hoy, sin que nadie note la diferencia hasta que falle en tienda.

### PL-59 · Vista o RPC

**Retail lee datos de Dynamic de dos formas distintas hoy: una vista puente con security_invoker que lib/eficiencia.ts consulta directo (retail.planilla_por_sede sobre public.v_planilla_pagada, ARQUITECTURA.md:279-280), y una función security definer propuesta para turnos (retail.fn_asesoras_de_turno, investigación del 2026-09-21). ¿Cuál es el patrón único para leer Dynamic de ahora en adelante?**

*Por qué:* Hallazgo del mapeo (informes-lectores.md:781-782, "dos formas de resolver lo mismo"): el mismo problema de leer Dynamic sin exponerla completa se resuelve con una vista security_invoker en un caso y una función security definer en otro, sin que ningún documento diga cuándo usar cuál.

- **Vista puente security_invoker para agregados sin fila individual (montos, sumas); RPC security definer cuando hay que filtrar por persona o fila (Recommended)** — Ganas: la regla nace de por qué existen los dos casos reales (planilla es agregado, turnos es por persona). Pagas: escribir la regla explícita para que el próximo caso no vuelva a improvisar.
- **Solo RPC security definer siempre, incluida la planilla: se retira la vista puente** — Ganas: un solo patrón, cero ambigüedad. Pagas: reescribir retail.planilla_por_sede (aplicada en producción el 2026-09-21) sin necesidad real de cambiarla.
- **Solo vistas puente security_invoker, nunca RPC nueva hacia Dynamic** — Ganas: más simple de auditar (una vista se lee con \d+). Pagas: no sirve para fn_asesoras_de_turno, que necesita lógica (tratar una marca desconocida como pausa) que una vista no puede tener.

### PL-60 · 14-DYNAMIC

**docs/datos/14-DYNAMIC.md:477 dice que retail.planilla_por_sede "No existe. Sería la tercera ventana de la frontera" — pero ya está aplicada en producción desde el 2026-09-21 (ARQUITECTURA.md:279-280). ¿Se corrige esa sección ahora o se marca el documento entero como histórico, ya que también describe V1 en otros puntos (informes-lectores.md:149)?**

*Por qué:* informes-lectores.md:149: "14-DYNAMIC.md sigue en V1 y presenta D-33 como contrato a construir (línea 428) cuando ya existe".

- **Se corrige esa sección ahora: es la única página que promete ser "el contrato de la frontera" (Recommended)** — Ganas: el documento que un agente nuevo lee primero para tocar Dynamic deja de mentir en el punto más crítico. Pagas: revisar si el resto del archivo (fechado V1) también necesita el mismo trato.
- **Se marca TODO el archivo como histórico y se escribe una página nueva y corta con el contrato real** — Ganas: evita parchar un documento que ya describe un sistema anterior en varios puntos. Pagas: hay que decidir quién escribe la página nueva y cuándo.

### PL-61 · ADR en rama

**PL-13 descartó "el ADR más reciente manda" porque "72 ADR viven solo en ramas" (00-ACTA-24-DECISIONES.md:122-126). Un caso concreto y de seguridad: ADR-0119 (arregla que ventas/venta_items/devoluciones acepten INSERT/UPDATE directo desde el navegador) vive solo en origin/claude/hola-baee84, su migración no está aplicada, y no aparece en docs/BACKLOG.md. ¿Qué se hace con decisiones estructurales que quedaron así, sin fusionar?**

*Por qué:* sintesis.md:52: "EL HUECO DE SEGURIDAD MÁS GRAVE NO ESTÁ EN EL RADAR... vive solo en origin/claude/hola-baee84, no aplicada y sin prueba vigente, y no figura en BACKLOG... y TRU sale esta semana".

- **Se trae ADR-0119 a main y se aplica esta semana, antes de que TRU opere con datos reales (Recommended)** — Ganas: cierra el hueco de seguridad más grave detectado antes de que haya plata real detrás. Pagas: revisar si algo en main desde el 09-18 ya rompe esa migración.
- **Se agrega al BACKLOG con dueño y fecha, pero no se aplica esta semana** — Ganas: no arriesga el lanzamiento de esta semana con una migración sin ensayar. Pagas: mientras tanto, cualquier sesión autenticada puede escribir directo en ventas/devoluciones saltándose las RPC.

### PL-62 · Rescate ADR

**Más allá del caso puntual de ADR-0119: ¿qué proceso evita que una decisión estructural de arquitectura vuelva a quedar "decidida" solo en una rama que nadie fusiona?**

*Por qué:* PL-13 (00-ACTA-24-DECISIONES.md:122-126) nombra el problema pero no deja mecanismo; PL-09 reparte 4 pájaros y deja el resto libre, así que hoy nadie barre las ramas abiertas buscando ADRs estructurales colgados.

- **Barrido periódico (quincenal, dentro del objetivo que fija Felipe por PL-12): ADRs sin fusionar listados en BACKLOG con dueño (Recommended)** — Ganas: ningún ADR estructural se pierde más de 2 semanas. Pagas: alguien tiene que hacerlo — hoy no hay pájaro dueño de "ramas abiertas" (Gorrión solo cubre migraciones y unificacion).
- **Un ADR estructural nuevo no se considera "decidido" hasta que su PR está fusionado: se cambia el estado por defecto a "Propuesto"** — Ganas: PL-13 deja de necesitar excepción, el nivel 2 de la jerarquía solo contiene lo realmente fusionado. Pagas: reescribir el estado de los 72 ADR que hoy dicen "Decidido"/"Aplicado" sin estarlo en main.
- **Se deja como está: se confía en que alguien lo note al abrir el BACKLOG** — Ganas: cero proceso nuevo. Pagas: es exactamente lo que ya falló con ADR-0119 durante días con el hueco de seguridad más grave del repo.

### PL-63 · Puerta RPC

**El principio 4 de CLAUDE.md dice "una sola fuente de verdad... vía RPC", pero el mapeo encontró rutas de API con .insert/.update directo a tablas de vocabulario (app/api/productos/{etiquetas,tallas,familias,categorias,colores,patrones,tejidos}/route.ts) y componentes que escriben directo (ProductosAgrupados.tsx:103, CodigosDescuentoPanel.tsx:96,157, InsumoModales.tsx:50), mientras esos mismos vocabularios YA tienen RPC (actualizar_categoria). ¿Se cierra esta excepción o se documenta como válida?**

*Por qué:* informes-lectores.md:781: "ESCRITURA: dos formas de hacer lo mismo... Los mismos vocabularios tienen además RPC... El ADR-0145 (Colaboradores «una sola puerta de escritura») empuja en la otra dirección".

- **Se cierra: todo vocabulario pasa a escribir solo por RPC, mismo patrón que Colaboradores (ADR-0145) (Recommended)** — Ganas: integridad conceptual real — un colaborador nuevo que lee el código no encuentra dos caminos para la misma cosa. Pagas: reescribir 7 rutas de API y 3 componentes, con sus pruebas.
- **Se documenta como excepción aceptada: tablas de vocabulario sin RLS de negocio sensible pueden escribir directo** — Ganas: cero trabajo de reescritura. Pagas: la próxima persona que agregue un vocabulario nuevo no sabe cuál de los dos caminos copiar, y el patrón se sigue duplicando.

### PL-64 · Permisos x2

**lib/menu.ts promete que "ningún nodo pregunta por el rol, pregunta por un permiso" (permisosDe), pero el mapeo encontró 83 archivos que preguntan persona.rol === "lider" a mano fuera de menu.ts/AppShell.tsx/produccion-menu.ts. Cuando D-12 (4 roles) se construya, ¿se migran esos 83 archivos al mismo mecanismo, o cada uno se corrige por separado cuando D-12 llegue a su módulo?**

*Por qué:* informes-lectores.md:782: "PERMISOS: dos formas de decidir quién ve qué... Los 4 niveles de D-12 están decididos y no construidos: cuando se construyan serán 83 archivos, no una función".

- **Se migra todo a permisosDe() ANTES de construir D-12: un solo refactor, después el rol nuevo entra en un lugar (Recommended)** — Ganas: D-12 se construye una vez, en un archivo. Pagas: el refactor de 83 archivos es trabajo propio, sin ningún rol nuevo todavía — primero el terreno fácil, después el cambio.
- **Se corrige archivo por archivo, cuando D-12 llegue a ese módulo** — Ganas: no hay que tocar 83 archivos de una sola vez. Pagas: mientras D-12 se construye en fases, conviven dos mecanismos de permiso el doble de tiempo, con más chance de que alguno quede desactualizado.

### PL-65 · Un restore

**ADR-0091 deja escrito: "un solo proyecto Supabase para dos sistemas significa un solo botón de restaurar para los dos — un restore de Dynamic restaura retail entero, y viceversa". D-29 (respaldos) sigue abierta sin número real ni restauración probada. ¿Se prueba un restore real antes de que TRU opere con datos reales, o se documenta el riesgo y se sigue?**

*Por qué:* ADR-0091 §Consecuencias (líneas 141-148) marca esto como "lo que se pagó, y sigue vigente"; informes-lectores.md:312 y 327 confirman que D-29 no tiene número de PITR ni restauración probada.

- **Se prueba un restore real (rama de Supabase, PITR) antes del primer mes de TRU en vivo (Recommended)** — Ganas: el día que algo salga mal en Dynamic o retail, ya se sabe que el botón funciona y cuánto tarda. Pagas: tiempo de una sesión completa de ensayo, sin tocar producción real.
- **Se documenta el riesgo (un restore afecta a los dos sistemas) y se prueba más adelante** — Ganas: no compite con la salida de TRU esta semana (PL-01). Pagas: si algo falla en las primeras semanas, nadie sabe si el restore realmente funciona hasta que ya es tarde.

### PL-66 · Dueño puente

**informes-lectores.md:149 y :258 piden "el contrato de la frontera con Dynamic en una sola página" (funciones, vistas puente, las 53 FK) y falta decidir quién es su dueño. PL-09 reparte 14 pájaros pero Dynamic no es tabla de retail — hoy nadie responde por ese archivo. ¿Quién lo escribe y lo mantiene?**

*Por qué:* informes-lectores.md:258: "Contrato de la frontera con Dynamic en una página (funciones, vistas puente, 53 FK) y quién es dueño de ese lado." PL-09 (00-ACTA-24-DECISIONES.md:91-98) no asigna esto a ningún pájaro.

- **Gorrión (ya dueño de supabase/migrations, unificacion y el camino de SQL) suma la frontera con Dynamic (Recommended)** — Ganas: es la persona que ya toca ese tipo de archivo. Pagas: Gorrión está _libre_ hoy (PL-09), así que primero hay que resolver quién lleva ese pájaro.
- **Se crea un dueño nuevo, específico para la relación con Dynamic (no es un pájaro de retail, es la bisagra entre los dos sistemas)** — Ganas: nombra explícitamente que este contrato no es propiedad exclusiva de retail. Pagas: un pájaro más que gobernar, con 10 de 14 ya _libre_.

### PL-67 · Aviso cambio

**informes-lectores.md:149 nombra "el riesgo de que Dynamic cambie sin aviso" (por ejemplo, si fn_rol_actual() cambia su firma o public.v_planilla_pagada cambia sus columnas). Retail no tiene ninguna prueba que lo detecte hoy. ¿Se construye una?**

*Por qué:* El único chequeo existente hoy es el stub local de CI (ci.yml:135-138, 230-232), que simula a Dynamic — no prueba contra la Dynamic real, así que un cambio real en producción no lo detectaría antes de romper retail.

- **Prueba programada (cron), solo lectura, que compara la firma real de fn_rol_actual/fn_sede_actual_persona/v_planilla_pagada con lo que retail espera y avisa si difieren (Recommended)** — Ganas: un cambio en Dynamic se detecta en minutos, no cuando una tienda no puede vender. Pagas: construir y mantener el chequeo, y decidir a quién avisa.
- **Sin prueba nueva: se confía en que Dynamic (mismo dueño, Felipe) avisa antes de tocar esas funciones** — Ganas: cero trabajo. Pagas: Felipe es "factor de autobús 1" (sintesis.md:55); si el cambio lo hace otra persona en Dynamic, retail se entera cuando falla.

### PL-68 · 53 FKs

**ADR-0091 dice que las FKs de retail hacia public.personas/public.sedes (24 a sedes, 18 a personas según el ADR) son parte de lo que "se ganó" con la unificación, pero también son puntos de acoplamiento directo con Dynamic. ¿Cuentan como parte del guardarraíl de PL-07 (pregunta 1), o quedan fuera porque son estructurales y no un patrón que se pueda "centralizar"?**

*Por qué:* ADR-0091 §Consecuencias, verificadas en docs/datos/generado/retail_fks_cruzadas.json — acoplamiento real con Dynamic que PL-07 no menciona explícitamente pese a hablar del mismo tema.

- **Quedan fuera del guardarraíl: son el precio ya pagado de ADR-0091, se listan aparte como "lo que costará el día de separar", nunca se centralizan (Recommended)** — Ganas: el guardarraíl se enfoca en lo que SÍ puede crecer sin control (llamadas nuevas a funciones). Pagas: el día de separar, esas FK son trabajo garantizado, sin forma de reducirlas antes.
- **Entran también: cada FK nueva hacia public.* pasa por la misma revisión que una función nueva** — Ganas: nada de acoplamiento nuevo se cuela sin que alguien lo decida a propósito. Pagas: más fricción en cualquier migración que necesite una referencia legítima a Dynamic.

### PL-69 · Fallback ID

**Al construir el "punto único" de la pregunta 1, ¿debe diseñarse asumiendo que SIEMPRE habrá un Dynamic (propio o de otra marca) del otro lado, o debe incluir un modo "sin Dynamic" (tabla propia de personas/sedes como respaldo) para el día que otra marca use retail sin tener su propio sistema de RR.HH.?**

*Por qué:* 00-ACTA-24-DECISIONES.md, tensión #1: "PL-01 contra PL-02... solo son compatibles con PL-07. Sin el guardarraíl, son contradictorias"; y sintesis.md:27/100-101: "nadie dice si la otra marca también llevaría Dynamic".

- **Solo separar el proyecto: el punto único asume que SIEMPRE habrá un Dynamic del otro lado (Recommended)** — Ganas: diseño más simple, calza con que CAYLA seguiría usando Dynamic sin importar cuántas marcas venda el sistema. Pagas: una marca sin Dynamic no podría usar retail tal cual, quedaría fuera de alcance.
- **El punto único incluye un modo "sin Dynamic" (tabla propia de personas/sedes como respaldo)** — Ganas: retail podría venderse incluso a quien no tiene un sistema de RR.HH. propio. Pagas: reconstruir dentro de retail justo lo que la unificación de julio 2026 eliminó (ADR-0091) — la razón por la que hoy NO hay copia propia de personas/sedes.

### PL-70 · DocsV1vsV2

**docs/datos/00-MAPA.md, 01-INVARIANTES.md y 09-CONTRATOS.md describen el modelo V1 (sedes, personas, stock_almacen, contenedores) que producción reemplazó el 2026-09-12 (commit 0af2f1b) por V2 (ubicaciones, colaboradores, sububicaciones) — un integrante nuevo que empiece por ahí aprende un esquema que ya no existe. PL-14 ya decidió archivar 00-MAPA V1 a docs/historico/, pero no nombra a 01-INVARIANTES.md ni a 09-CONTRATOS.md (sus secciones de Compras, fechadas 09-19/09-20, sí describen V2 vigente). ¿Qué hacemos con estos tres archivos?**

*Por qué:* informes-lectores.md confirma que el corte V1→V2 (2026-09-12) dejó sin aviso a 00-MAPA.md, 01-INVARIANTES.md y 09-CONTRATOS.md, que siguen describiendo tablas que ya no existen en retail_filas.json. PL-14 (docs/plano/00-ACTA-24-DECISIONES.md) solo nombra 00-MAPA V1 en su lista de archivo; 01-INVARIANTES y 09-CONTRATOS quedan fuera de esa decisión.

- **Archivar completos, reescribir un 01-INVARIANTES y 09-CONTRATOS sobre V2 (Recommended)** — Ganas que nadie vuelva a confundir stock_almacen con sububicaciones; pagas escribir de cero el equivalente V2 (nadie lo ha hecho todavía, ni siquiera en esta ronda).
- **Archivar solo las secciones V1, conservar y actualizar las de Compras** — Ganas no perder el trabajo válido de ADR-0139 (reparto entre tiendas); pagas un documento mixto con partes vigentes y partes archivadas, riesgo de leer la parte equivocada.
- **Dejarlos como están con un aviso en la cabecera** — Ganas costo cero hoy; pagas que siguen apareciendo en búsquedas y se les sigue citando como 'lo ya decidido' (como pasó en esta misma tarea).

### PL-71 · CCOesquema

**D-20 y D-32 dicen que los gastos sin sede propia (sueldo de Felipe, contador, servidores, software) van a la sede corporativa CCO. En el esquema V2 real, `ubicaciones.tipo` solo admite 'tienda', 'almacen' o 'taller' (constraint ubicaciones_tipo_check) y `gastos.ubicacion_id` es NOT NULL: hoy no hay ninguna fila donde registrar ese gasto sin mentir sobre a qué tienda pertenece. ¿Cómo se modela CCO en V2?**

*Por qué:* Verificado en docs/datos/generado/retail_constraints.json:2338 (ubicaciones_tipo_check = ARRAY['tienda','almacen','taller']) y retail_columnas.json (gastos.ubicacion_id is_nullable='NO'). D-30 y D-32 (DECISIONES-2026-09-12.md) asumen que CCO existe como sede; hoy no tiene dónde vivir en el esquema real.

- **Agregar 'corporativo' al CHECK de ubicaciones.tipo y crear la fila CCO (Recommended)** — Ganas que gastos.ubicacion_id siga NOT NULL y CCO se trate igual que cualquier sede en los reportes existentes; pagas revisar cada pantalla que asume tipo IN (tienda, almacen, taller), como el menú de Producción.
- **Volver gastos.ubicacion_id nullable y agregar una columna es_corporativo** — Ganas no tocar el CHECK de ubicaciones ni arriesgar que un reporte trate a CCO como si vendiera; pagas una migración y actualizar cada consulta que hoy asume ubicacion_id no nulo.
- **No modelarlo todavía: los gastos corporativos se registran a mano en TRU y se filtran por categoría al reportar** — Ganas cero cambio de esquema; pagas que el estado de resultados de TRU (D-52a, lo primero que mira Felipe) queda inflado con gastos que no son de TRU, sin forma de separarlos.

### PL-72 · D30cuando

**D-30 dice que el estado de resultados por sede 'es un requisito central, no un lujo'. Pero PL-08 (00-ACTA-24-DECISIONES.md) ya congeló la contabilidad completa (partida doble, asientos, PLE): producción no tiene `asientos`, `cuentas_contables` ni `patrimonio_items` (0 de 77 tablas). ¿Con qué construimos D-30 mientras Urraca sigue en pausa?**

*Por qué:* docs/datos/09-CONTRATOS.md §2.2 describe el mecanismo de lectura que ya usa apps/web/lib/finanzas.ts en V1 ('los 4 estados financieros se CALCULAN sobre los sub-libros'); informes-lectores.md confirma que en V2 no existen asientos/cuentas_contables/patrimonio_items todavía, y PL-08 congela Contabilidad. D-30 sigue sin dueño de implementación.

- **Un modelo de lectura (sumar ventas, costo de lo vendido, gastos y mermas por sede), sin tabla de asientos (Recommended)** — Ganas el número esta semana con TRU en vivo, sin esperar a Contabilidad; pagas que 'cuadra por construcción', no porque cada hecho se anotó dos veces — es un resumen, no un libro contable.
- **Esperar a que exista un plan de cuentas mínimo y postear asientos reales** — Ganas un número que un contador puede auditar; pagas semanas de trabajo antes de que Felipe vea el primer resultado por sede.
- **Mostrar solo ventas y costo de lo vendido por sede (sin gastos ni CCO) como primera versión** — Ganas algo ya construible con lo que existe hoy (ventas, movimientos, costo_historial); pagas un 'resultado' que no es margen real porque no descuenta gastos operativos.

### PL-73 · CierreMes

**D-23 exige que un mes ya cerrado no acepte más escrituras. Hoy no existe ni el concepto de 'período contable' en el esquema V2 ni ninguna tabla de asientos donde aplicarlo, y `gastos` (Garza) recién empieza a llenarse con TRU en vivo. ¿El candado de cierre de mes se construye ahora sobre `gastos`/`ventas`, o espera a que exista Contabilidad formal (tras la pausa de PL-08)?**

*Por qué:* D-23 (DECISIONES-2026-09-12.md) y 09-CONTRATOS.md §2.2 ('el mes cerrado con llave... postear sobre un pasado editable es escribir en arena'); informes-lectores.md confirma que ni periodos_contables ni asientos existen en V2, y gastos va a tener filas reales esta semana con TRU.

- **Ahora, ligero: una tabla periodos_cerrados (sede, mes) que bloquea INSERT en gastos y ventas con fecha dentro de un período cerrado (Recommended)** — Ganas que el número de D-30 no cambie solo porque alguien registró un gasto de agosto en octubre; pagas construir el candado antes que el resto de Contabilidad, y decidir quién cierra el mes.
- **Esperar a Contabilidad completa (post PL-08)** — Ganas no construir dos veces el mismo candado; pagas que cualquier reporte que se muestre antes (D-30, D-52) puede cambiar solo, semanas después, sin que nadie lo note.
- **No cerrar por ahora — el volumen de 3 tiendas y un Taller no lo justifica todavía** — Ganas cero esfuerzo; pagas que el primer descuadre real (un gasto corregido de un mes ya reportado a Felipe) llega sin aviso.

### PL-74 · CerrarD45

**D-45 (método de costeo del inventario) sigue marcada '⏳ Abierta' en el acta del 2026-09-12, con la nota textual de Felipe: 'es un tema contable, no sé si es necesario ese nivel de detalle ahora'. Pero ADR-0067 (2026-09-16) ya implementó costo promedio ponderado con un ledger costo_historial, y ya corre en producción. ¿Confirmamos que D-45 quedó resuelta por ADR-0067, o sigue abierta para el contador?**

*Por qué:* DECISIONES-2026-09-12.md:247-250 y su tabla final (D-45 ⏳ abierta); docs/adr/0067-costo-de-variante-pasa-a-promedio-ponderado.md ya está en producción con costo_historial entre las 77 tablas de V2 (informes-lectores.md:309,336,667: 'el acta dice que manda y que se corrige primero').

- **Cerrar D-45 a favor de ADR-0067 (promedio ponderado) — es lo que ya corre (Recommended)** — Ganas que el acta deje de contradecir el código (hoy dice 'abierta' sobre algo ya construido y en producción); pagas nada nuevo, solo corregir el papel.
- **Confirmar con el contador antes de cerrar, y evaluar costo por lote para el Taller (D-31/D-47)** — Ganas una decisión con respaldo contable formal; pagas mantener la contradicción entre acta y ADR mientras tanto, y el riesgo de que el contador pida un método distinto con datos reales ya encima.
- **Dejarla abierta a propósito, tal como la dejó Felipe** — Ganas no comprometerte a nada; pagas seguir con acta y código diciendo cosas distintas sobre el mismo número: el costo de cada prenda vendida.

### PL-75 · CostoVisib

**D-27 decidió 'transparencia total': cualquier colaborador con sesión ve el costo de cada prenda (fn_productos.costo) y las cuentas bancarias de los proveedores. Compras ya cerró su dinero (facturas, deuda, pagos) a solo líder (ADR-0126, 2026-09-19). El costo por prenda y el banco del proveedor NO se tocaron — ADR-0134 lo pospuso 'al final del proyecto'. Con TRU en vivo esta semana y 16 colaboradores reales con sesión, ¿seguimos posponiendo, o cerramos el costo de prenda igual que se cerró Compras?**

*Por qué:* DECISIONES-2026-09-12.md D-27 (líneas 152-174) y su corrección 2026-09-17 (angosta: solo lo financiero de Compras cerró); 01-INVARIANTES.md §2 confirma que fn_productos sigue devolviendo costo a cualquiera con sesión; informes-lectores.md:169 marca esto como decisión pendiente de revisitar.

- **Cerrar el costo de prenda a solo líder ahora, igual que ADR-0126 (Recommended)** — Ganas que un colaborador no calcule el margen de CAYLA prenda por prenda con su propia sesión; pagas tocar fn_productos y cada pantalla de catálogo que hoy muestra costo.
- **Cerrar solo el banco/cuenta del proveedor (dato de un tercero), dejar el costo abierto como dice D-27** — Ganas cerrar lo más sensible con el menor cambio; pagas mantener visible cuánto le cuesta a CAYLA cada prenda a cualquiera con sesión.
- **Mantener D-27 tal cual (ambos abiertos) hasta 'el final del proyecto', como dice ADR-0134** — Ganas cero trabajo ahora; pagas que 16 colaboradores reales vean margen y datos bancarios de proveedores desde el primer día de TRU en vivo.

### PL-76 · 4PajarosV

**Tucán (Taxonomía), Golondrina (Importación), Águila (Inteligencia) y Gorrión (Plataforma) son los 4 pájaros sin ni una tabla en producción hoy (AVIARIO.md: 'sin tablas hoy'). PL-09 los trata distinto: Tucán y Golondrina quedan 'en pausa', Águila sigue sin dueño asignado, y Gorrión pasó a Felipe. ¿Qué hacemos con su modelo de datos mientras siguen así?**

*Por qué:* docs/datos/generado/AVIARIO.md líneas 15-16, 25-26 confirma 'sin tablas hoy' para los 4; 00-ACTA-24-DECISIONES.md PL-09 los trata con estados distintos (pausa vs. sin asignar vs. asignado sin tablas) sin decir qué pasa con su esquema.

- **Ninguno recibe esquema todavía; se documenta 'en pausa/sin tablas, PL-09' y se revisa cuando alguien lo retome (Recommended)** — Ganas no diseñar en el vacío (principio 7: nada se construye sin poder probarse); pagas que si Producción necesita taxonomía antes de tiempo (censo, D-25), no hay dónde apoyarse.
- **Águila y Gorrión sí reciben esquema ahora; Tucán y Golondrina quedan en pausa** — Ganas que los 3 números de Felipe (D-52) y el registro de migraciones aplicadas tengan dónde vivir; pagas construir dos módulos más con solo 2 constructores fijos.
- **Los 4 se diseñan en el papel ahora (esquema propuesto, sin construir) para no perder el criterio cuando se retomen** — Ganas no rediseñar de cero en 6 meses; pagas tiempo de diseño hoy sobre módulos que nadie va a construir esta quincena (PL-12).

### PL-77 · SububiDup

**V2 reemplazó 'un almacén por sede' (D-38, candado contenedores_un_almacen_por_sede de V1) por sububicaciones de tipo fijo (piso_venta, almacen_tienda, cuarentena) por ubicación. No hay evidencia de un candado equivalente en V2 que impida que una tienda termine con dos filas de 'almacén de tienda' (por ejemplo, un insert corrido dos veces al crear una sede). ¿Se agrega ese candado ahora?**

*Por qué:* docs/datos/01-INVARIANTES.md:67 documentaba contenedores_un_almacen_por_sede para V1; informes-lectores.md:131 confirma que V2 lo reemplazó por sububicaciones sin nombrar un candado equivalente de unicidad por tipo (solo hay FKs de pertenencia, stock_sububicacion_pertenece_fk y movimientos_sububicacion_pertenece_fk).

- **Sí: índice único (ubicacion_id, tipo) sobre sububicaciones (Recommended)** — Ganas que D-38 siga siendo cierto en V2 con su propio candado con nombre, no por casualidad; pagas una migración chica y verificar que las sububicaciones actuales no violan ya la regla.
- **No hace falta: las sububicaciones solo las crea el script de alta de sede, nunca la pantalla** — Ganas cero esfuerzo; pagas que la garantía depende de que nadie use el editor SQL o un futuro endpoint de alta de sede sin cuidado — el mismo patrón que costó el candado de personas duplicadas (ADR-0002).
- **Se decide junto con el modelo de CCO: si CCO entra como ubicación, sus sububicaciones se diseñan al mismo tiempo** — Ganas resolver los dos huecos de ubicaciones/sububicaciones en un solo cambio; pagas esperar a esa decisión para cerrar este candado.

### PL-78 · VentaCuar

**V2 tiene una sububicación 'Cuarentena' por tienda y una tabla prendas_danadas (Halcón). No hay evidencia de un candado que impida vender una prenda que está en Cuarentena o marcada como dañada — si Cuarentena cuenta como stock disponible en `registrar_venta`, se podría cobrar por una prenda rota. ¿Debe existir ese candado?**

*Por qué:* docs/datos/generado/AVIARIO.md confirma sububicaciones y prendas_danadas bajo Halcón (05); no hay ningún constraint con 'cuarentena' en el nombre en retail_constraints.json — exactamente el tipo de estado imposible que Lamport pide enumerar antes de confiar en la pantalla.

- **Sí: registrar_venta debe rechazar líneas cuyo stock salga de la sububicación Cuarentena (Recommended)** — Ganas que 'dañada' signifique dañada de verdad, no una etiqueta que la caja ignora; pagas un caso más dentro de registrar_venta, o mejor, que Cuarentena no aparezca en el buscador de venta (principio 6: eliminar el caso especial).
- **No hace falta candado: hoy el buscador de venta ya solo mira Piso de venta** — Ganas cero esfuerzo si es cierto; pagas que 'la pantalla no lo hace hoy' no es un candado — es exactamente la costumbre que 01-INVARIANTES.md advierte que no sobrevive a un editor SQL o un agente de IA.
- **Se decide junto con el flujo completo de prendas dañadas (quién decide Cuarentena, cómo sale de ahí)** — Ganas no poner un candado aislado sobre un flujo sin diseñar; pagas dejar el hueco abierto justo cuando el censo de 900 prendas puede encontrar piezas dañadas reales.

### PL-79 · ClientaDup

**Con clientes ya en producción, ¿qué impide que la misma persona (mismo DNI/RUC) termine con dos fichas de clienta distintas — una por cada sede donde compró, por ejemplo?**

*Por qué:* docs/datos/generado/AVIARIO.md confirma clientes en producción (07 Colibrí); no hay evidencia en retail_constraints.json de una restricción única sobre documento de identidad — el mismo patrón que ya costó un error real en personas (ADR-0002, 01-INVARIANTES.md:143: 'un insert corrido cuatro veces dejó una cuenta inutilizable').

- **Índice único sobre el documento de identidad de la clienta (Recommended)** — Ganas un historial de compras real por clienta sin importar en qué tienda compró, requisito de D-48; pagas decidir qué pasa con fichas duplicadas si ya existen hoy.
- **Sin candado: cada sede mantiene su propia ficha de clienta** — Ganas simplicidad si CAYLA nunca cruza compras entre tiendas para una misma clienta; pagas que la fidelización (D-48) y el historial de compras se rompen apenas alguien compra en TRU y en AQP.

### PL-80 · Respaldos

**D-29 sigue abierta: 'hay que averiguarlo y escribirlo con el número real' sobre respaldos. Retail comparte el mismo proyecto Supabase con Dynamic (planillas, datos personales) — un solo botón de restaurar afecta a los dos sistemas a la vez. Con TRU vendiendo de verdad esta semana, ¿cuánto dato se puede perder (RPO) antes de que sea un problema?**

*Por qué:* DECISIONES-2026-09-12.md D-29 y su tabla final de decisiones abiertas; informes-lectores.md:312 confirma 'un solo botón de restaurar para retail y Dynamic (ADR-0091)' y que nadie ha probado una restauración.

- **Hasta 1 día: respaldo diario, con una restauración de prueba real al menos una vez (Recommended)** — Ganas el plan más barato y razonable para el tamaño actual; pagas que perder un día de ventas de TRU en su primera semana no es reconstruible desde ningún otro sistema.
- **Minutos: point-in-time recovery de Supabase** — Ganas casi cero pérdida posible; pagas un plan superior y que restaurar retail a un punto en el tiempo arrastre también la planilla de Dynamic a ese mismo instante.
- **Decidir después de probar una restauración real en un proyecto desechable (nadie lo ha hecho nunca)** — Ganas decidir con el número real en vez de una suposición; pagas que D-29 sigue abierta unos días más justo cuando el sistema empieza a tener datos que sí importan.

### PL-81 · MovValida

**El movimientos_traslado_tiene_destino ya existe como candado en V2, pero `movimientos` ganó varias columnas de origen (venta_item_id, compra_item_id, produccion_id, cambio_id). No hay evidencia de un candado que impida llenar dos de esas columnas a la vez en la misma fila — por ejemplo, una 'salida' con venta_item_id Y compra_item_id llenos al mismo tiempo, lo que dejaría ambiguo de dónde vino de verdad el movimiento. ¿Se agrega ese candado?**

*Por qué:* informes-lectores.md:104 confirma las columnas de origen de movimientos en V2 y que movimientos_traslado_tiene_destino sí existe; no hay evidencia de un candado equivalente para las columnas de origen no-traslado — un estado imposible sin enumerar todavía, en el sentido de Lamport.

- **Sí: un check que exija exactamente una columna de origen llena según el tipo de movimiento (Recommended)** — Ganas que 'de dónde vino este movimiento' sea una pregunta que la base responde sola, nunca ambigua; pagas escribir el candado y verificar antes que ninguna fila real de producción lo viole.
- **Confiar en que la función que aplica movimientos ya llena esto bien, sin candado de tabla** — Ganas cero trabajo si es cierto hoy; pagas que la única defensa contra un editor SQL o un agente de IA que inserte distinto sea la costumbre, no la base — la misma lección que 01-INVARIANTES.md ya documentó para otros candados de V1.

### PL-82 · CajaCerra

**01-INVARIANTES.md (V1) documentaba que cajas_update permitía editar cualquier caja de la sede, cerrada o no, incluidos monto_cierre_contado y diferencia — el tercero de los tres números que Felipe mira primero (D-52c). No hay confirmación de si ese hueco se cerró en V2 (el candado de líder de ADR-0143 ya está en producción para *cerrar* la caja, pero no está claro si también bloquea *editarla* después de cerrada). ¿Se verifica y, si sigue abierto, se cierra ahora que `cajas` va a tener movimiento real de TRU?**

*Por qué:* docs/datos/01-INVARIANTES.md §2 documentó este hueco específico para V1 y lo ligó a D-52 (los tres números que Felipe mira primero); no hay evidencia en el material de este mapeo de que se haya verificado o cerrado para V2.

- **Verificar ahora contra producción y, si sigue editable, agregar el candado antes del go-live (Recommended)** — Ganas que el número de caja que Felipe reporta el lunes no pueda cambiar el martes sin dejar rastro; pagas el tiempo de verificar más, si hace falta, una migración chica.
- **Confiar en que ADR-0143 (candado de líder) ya lo resuelve y no verificar aparte** — Ganas cero esfuerzo si es cierto; pagas el riesgo de asumir que 'quién puede cerrar' y 'si se puede editar después de cerrada' son la misma regla, cuando en V1 eran candados distintos.


## Sesión 3 — Identidad y permisos (FRENTE 5) + FRENTE 6: Pantallas y principios de producto (el "estilo de la casa") (30 preguntas)

### PL-83 · Admin ahora

**¿Se construye el rol Admin en la base (colaboradores.rol) ahora, o se espera a después del go-live de TRU?**

*Por qué:* D-12 (2026-09-12) promete 4 niveles; verificado hoy contra producción (select rol, count(*) from retail.colaboradores group by rol): solo 'lider' (9) y 'colaborador' (16). ADR-0143 ya admite por escrito 'D-12 prevé cuatro niveles; hoy hay dos'. Bloque 14 (60 preguntas) ya decidió QUÉ vería Admin, no CUÁNDO construirlo en la base.

- **Ahora, antes de sumar más pantallas nuevas (Recommended)** — Ganas: colaboradores.rol admite 'admin' antes de que se acumulen más pantallas que asumen solo lider/colaborador. Pagas: una migración de esquema y su prueba en medio de la semana de salida de TRU.
- **Después del go-live de TRU, cuando exista la primera pantalla que un líder no deba ver** — Ganas: no se construye en el vacío (PL-05: registro fiel primero). Pagas: Felipe sigue siendo 'admin informal' sin candado real mientras las 8 tablas del hueco de RLS (ver 'Hueco RLS') solo dependen de RLS.
- **Nunca — simplificar D-12 a 2 niveles y retirar Admin del plano** — Ganas: el modelo queda igual a como opera hoy, sin deuda pendiente. Pagas: contradice PL-13 (D-12 manda sobre la prosa) y el Bloque 14 de la ronda de 60 preguntas, donde Felipe ya definió qué vería un Admin.

### PL-84 · Hueco RLS

**El GRANT de INSERT/UPDATE/DELETE a 'authenticated' sigue abierto HOY en ventas, venta_items, devoluciones, devolucion_items y venta_anulacion_items (verificado contra producción viva). ¿Se cierra esta semana o se deja abierto con fecha?**

*Por qué:* Confirmado hoy con consulta de solo lectura contra producción (proyecto vovjyyiafkxteijimpuy, schema retail): las 5 tablas tienen INSERT/UPDATE/DELETE otorgado a 'authenticated'. El arreglo (ADR-0119, migración 20260918190000_ventas_devoluciones_solo_rpc.sql) vive solo en origin/claude/hola-baee84, sin fusionar, 'no aplicada', y su prueba 'NO se volvió a ejecutar' tras perderse el worktree.

- **Rescatar origin/claude/hola-baee84, correr de nuevo pnpm pruebas:candado-ventas y pegar el REVOKE esta semana (Recommended)** — Ganas: cierra el hallazgo más grave de la auditoría del 2026-09-17 (ADR-0119, 16 casos con ROLLBACK). Pagas: una tarde de trabajo — rescatar archivos perdidos, reensayar y pegar SQL — en la semana de salida de TRU.
- **Dejarlo abierto 2 semanas más, confiando en que el equipo no abre la consola del navegador** — Ganas: cero fricción esta semana. Pagas: cualquier sesión autenticada puede poner estado='aprobada' en su propia devolución sin ser líder (devoluciones_write es FOR ALL) — descuadra el arqueo de cerrar_caja en silencio.
- **Pegar solo el REVOKE aislado ya, sin esperar a rescatar la rama ni repetir la prueba de 16 casos** — Ganas: una sola sentencia SQL, sin depender de recuperar archivos perdidos. Pagas: se pega sin el ensayo que PL-11 exige para SQL de alto riesgo — la misma disciplina que pide 'Ensayo SQL'.

### PL-85 · 3 tablas más

**El mismo patrón (GRANT abierto a 'authenticated') también está hoy en clientes, conteos y lotes, que ADR-0119 dejó fuera 'por no rastrear quién escribe'. ¿Se cierran en el mismo paquete o quedan aparte?**

*Por qué:* Confirmado hoy contra producción: clientes, conteos y lotes tienen el mismo GRANT de INSERT/UPDATE/DELETE a 'authenticated' que las 5 tablas de ventas/devoluciones. ADR-0119 lo nombra como 'pendiente que este ADR NO cierra' ('mismo patrón, sin rastrear').

- **Rastrear quién escribe en esas 3 (.from('clientes'), .from('conteos'), .from('lotes')) y cerrarlas en el mismo REVOKE (Recommended)** — Ganas: cierra el hallazgo completo — clientes además guarda datos personales (D-28). Pagas: más superficie que ensayar antes de pegar, en la misma ventana de riesgo que 'Hueco RLS'.
- **Solo las 5 ya auditadas; clientes/conteos/lotes quedan en el BACKLOG con dueño y fecha** — Ganas: alcance acotado, menos riesgo de romper una pantalla que hoy sí escribe directo en esas 3. Pagas: el mismo patrón de riesgo queda abierto sobre datos personales de clientas.
- **Ir a la raíz: revocar el alter default privileges de 0005_grants.sql para que ninguna tabla nueva de retail nazca abierta** — Ganas: es la solución de fondo que el propio ADR-0119 nombra y descarta 'por falta de tiempo'. Pagas: exige inventario exacto de qué escribe la app directo y decidir qué hacer con catalogo_actualizar_producto/catalogo_crear_producto, que no son security definer.

### PL-86 · 2do pegador

**PL-11 ya decidió 'Felipe + un segundo pegador nombrado', pero el pendiente #2 del acta dice que ese nombre sigue sin ponerse. ¿Quién es?**

*Por qué:* PL-11 (acta del plano, 2026-09-21): 'DECIDÍ: Felipe + un segundo pegador nombrado'. El acta lista como pendiente #2: 'Nombrar al segundo pegador de SQL — Dueño: Felipe'. Hoy Felipe fusiona 118 de 120 PR y es el único admin del repo.

- **Dany (438 commits, el otro constructor fijo del repo) (Recommended)** — Ganas: ya conoce el modelo de datos y reduce el cuello de botella real (hoy Apartar stock espera a que Felipe pegue 3 RPC). Pagas: dos llaves de producción sobre un schema compartido con Dynamic.
- **Nadie por ahora — sigue solo Felipe hasta después del go-live de TRU** — Ganas: una sola mano, cero riesgo de un SQL sin la costumbre correcta. Pagas: si Felipe no está disponible una semana, ninguna migración pendiente se aplica — el 'factor de autobús 1' que la auditoría ya nombró.
- **Rotar entre 2-3 constructores según quién construyó cada migración, con verificación cruzada** — Ganas: reparte la carga entre más personas. Pagas: más manos tocando producción sin que una sola conozca todo el estado — justo lo que PL-11 quiso evitar al pedir un pegador 'nombrado', no un grupo.

### PL-87 · Ensayo SQL

**PL-11 dice que se rompe 'si el segundo pegador aplica sin ensayo previo'. ¿Qué checklist le exigimos antes de tocar producción?**

*Por qué:* PL-11 SE ROMPE SI: 'el segundo pegador aplica sin ensayo previo: dos llaves de producción sin disciplina son peor que una'. Hoy no hay checklist escrito, solo la costumbre de sesión (ensayo con excepción que termina en ROLLBACK).

- **Checklist obligatorio para los dos (Felipe incluido): ensayo en Postgres desechable + sonda de solo lectura en producción + registro de qué se pegó y cuándo (Recommended)** — Ganas: mismo estándar para ambos, auditable, cumple D-11 literalmente. Pagas: una migración de una línea también pasa por el checklist completo.
- **Confianza: cada pegador decide su propio nivel de ensayo según el riesgo que él percibe** — Ganas: rápido para cambios triviales. Pagas: 'riesgo que él percibe' es la clase de decisión que ya costó el error de la migración 0030 (faltó el prefijo retail. al pegar en el proyecto de Dynamic).
- **Todo SQL de producción pasa primero por revisión de Felipe, aunque lo pegue el segundo pegador** — Ganas: un solo punto de control real. Pagas: vuelve a ser un cuello de botella de una sola persona, con un paso extra antes.

### PL-88 · Niveles rol

**D-12 promete 4 niveles (Admin, Líder, Integrante, Solo lectura); hoy hay 2 reales. Con el contador jalando de SUNAT (Bloque 3) y Admin sin fecha, ¿siguen siendo 4 o se revisa el número?**

*Por qué:* D-12 (2026-09-12): 4 niveles. ADR-0143 confirma que hoy hay 2. Bloque 3 de la ronda de 60 preguntas (2026-09-21): 'el contador no usa Alegra: jala todo desde SUNAT... sin rol de contador' — podría implicar que 'Solo lectura' baja de prioridad, pero Felipe no lo dijo sobre D-12 explícitamente.

- **Mantener los 4 de D-12 tal cual, aunque el contador no los pida todavía (Recommended)** — Ganas: no hay que reabrir el acta del 2026-09-12 si el contador cambia de opinión. Pagas: se sostiene una promesa escrita para un usuario que hoy no la usa.
- **Reducir a 3 (Admin, Líder, Colaborador) y retirar 'Solo lectura' de D-12** — Ganas: menos superficie que mantener, coincide con que el contador jala de SUNAT. Pagas: enmienda D-12 por escrito — PL-13 dice que el acta manda sobre la prosa, exige anotación formal.
- **Dejar los 4 escritos, pero marcar 'Solo lectura' pendiente con dueño (mismo trato de PL-08 a Contabilidad)** — Ganas: no cierra la puerta y no gasta tiempo hoy. Pagas: un pendiente más sin fecha, sumándose a los 18 de la lista de 05-SEGURIDAD.md.

### PL-89 · Líder global

**Verificado hoy: los 9 líderes tienen alcance global (ninguno acotado a una sede) — Bloque 13 ya decidió acotarlos 'después de la salida en TRU, nunca mientras el equipo trabaja'. ¿Qué fecha exacta?**

*Por qué:* Verificado hoy: los 9 líderes tienen ubicacion_asignada_id = null; fn_puede_operar_ubicacion les da acceso a cualquier ubicación porque fn_es_lider() ya es true sin mirar la sede. Bloque 13 (60 preguntas) fijó el CUÁNDO en términos relativos, no una fecha concreta.

- **Primera semana completa después del go-live de TRU (Recommended)** — Ganas: convierte 'después del go-live' en algo verificable, evitando el patrón que ya estiró la transición de Alegra ('cuando yo sienta confianza, sin criterio escrito'). Pagas: una migración más en la primera semana de operación real.
- **Sin fecha fija — se revisa cuando alguien note un problema de un líder operando la sede equivocada** — Ganas: cero trabajo hasta que haga falta. Pagas: hoy nadie vigila esta regla, el mismo patrón que dejó dormir días el hueco de ventas sin que nadie lo citara en el BACKLOG.
- **Ya, esta semana, junto con el REVOKE del hueco de ventas/devoluciones** — Ganas: cierra dos candados de permisos en la misma ventana de riesgo. Pagas: contradice lo que Felipe ya decidió explícitamente en el Bloque 13 ('nunca mientras el equipo trabaja').

### PL-90 · Cubrir sede

**D-14 dice que el permiso para que un líder cubra otra sede con fecha de vencimiento 'hoy no existe, hay que construirlo'. Verificado: no hay tabla retail.coberturas ni nada parecido. ¿Cómo se construye?**

*Por qué:* D-14 (2026-09-12): 'permiso con fecha de vencimiento — hoy no existe, hay que construirlo'. Verificado hoy: no existe ninguna tabla retail con nombre parecido a 'cobertura'. Es el pendiente #13 de 05-SEGURIDAD.md ('tamaño Medio').

- **Tabla retail.coberturas (persona_id, ubicacion_id, vence_el) + una rama en fn_puede_operar_ubicacion, con lista de coberturas activas visible (Recommended)** — Ganas: auditable, expira sola y deja historial de quién cubrió qué sede. Pagas: una tabla y una función más; hay que decidir qué pasa si vence con la caja de esa sede abierta.
- **Campo simple en colaboradores: cobertura_ubicacion_id + cobertura_vence_el, sin tabla aparte** — Ganas: más simple, una sola fila por persona. Pagas: no deja historial de coberturas pasadas y solo permite una a la vez por líder.
- **Manual: Felipe cambia el acceso a mano cuando alguien cubre otra sede y lo revierte al terminar** — Ganas: cero código nuevo. Pagas: el mismo patrón de permisos que hay que revertir a mano y que se olvida — el riesgo que el candado de estado='activo' (ya resuelto, ver 'Baja acceso') vino a evitar.

### PL-91 · Tope dscto

**Bloque 13 ya decidió 'tope de descuento por rol, más lo autoriza el líder' pero dejó los números 'para el paso de construcción'. ¿Cuáles son?**

*Por qué:* Bloque 13 (60 preguntas, 2026-09-21): 'Descuento: tope por rol, más de eso lo autoriza el líder... Topes exactos quedan para el paso de construcción, propuestos por mí y confirmados por Felipe' — invitación explícita a esta pregunta, no una decisión ya cerrada.

- **Colaborador hasta 10%, líder hasta 20%, más de eso pide OK de Felipe fuera del sistema (Recommended)** — Ganas: número redondo, fácil de explicar en el mostrador sin capacitación. Pagas: puede quedar corto en liquidación de temporada o prenda dañada, donde 20% no alcanza.
- **Colaborador hasta 5%, líder hasta 15%, con categoría aparte 'liquidación' sin tope pero con motivo obligatorio** — Ganas: más conservador con el margen del día a día, separa descuento normal de liquidación. Pagas: una categoría más que la asesora tiene que entender en el mostrador.
- **Sin tope numérico todavía — todo descuento queda registrado con quién y por qué, y se fija el número tras el primer mes con datos reales** — Ganas: no fuerza un número sin evidencia. Pagas: dinero real se descuenta sin candado durante el primer mes, justo cuando Felipe pidió medir todo desde el día uno.

### PL-92 · Baja acceso

**05-SEGURIDAD.md (2026-09-12) lista como hueco abierto que 'una colaboradora dada de baja sigue pudiendo vender'. Verificado hoy en producción: ya no es así. ¿Confirmamos y corregimos el documento?**

*Por qué:* Verificado hoy leyendo el cuerpo real de las funciones en producción (pg_proc.prosrc): fn_es_lider() y fn_ubicacion_actual_persona() ya filtran p.estado = 'activo'. 05-SEGURIDAD.md §10.4 sigue describiéndolo como pendiente — es un documento de V1 (2026-09-12) sobre una base que ya cambió a V2 el mismo día (commit 0af2f1b).

- **Sí — es una revisita: el hallazgo está resuelto en V2 (fn_es_lider y fn_ubicacion_actual_persona ya exigen estado='activo'); se corrige 05-SEGURIDAD.md (Recommended)** — Ganas: cierra un pendiente fantasma antes de que un agente nuevo intente 'arreglarlo' dos veces. Pagas: ninguno — es solo corregir el documento.
- **Confirmar el candado de base, y además que requirePersonaActual() en el front lea estado y mande a /login** — Ganas: cierra también la mitad de 'esconder el menú': la base ya bloquea escrituras pero una colaboradora de baja podría seguir viendo pantallas. Pagas: una prueba más que mantener.
- **Dejarlo como está — la base ya bloquea las escrituras, no hace falta tocar el front** — Ganas: cero trabajo. Pagas: mala experiencia (no riesgo de datos): una persona de baja sigue viendo el menú y formularios que fallan en silencio al guardar.

### PL-93 · Menú vs base

**menu.ts dice explícitamente: 'esto es solo VISIBILIDAD — el candado real vive en la base; un nodo que no se pinta no protege nada.' Antes de construir Admin/Solo lectura, ¿auditamos qué tablas dependen solo del menú?**

*Por qué:* Cita textual de apps/web/lib/menu.ts: 'esto es solo VISIBILIDAD — el candado real vive en la base (RLS, fn_puede_*, cada RPC); un nodo que no se pinta no protege nada.' Las 8 tablas del hueco de RLS hoy solo están protegidas por RLS, ninguna pantalla las esconde a propósito.

- **Sí — inventario completo: qué tabla tiene candado real (RLS+RPC) y cuál solo vive porque nadie probó a saltarse el menú, una fila por tabla con dueño (Recommended)** — Ganas: la próxima decisión de permisos se apoya en hechos verificados, no en memoria de quién escribió qué. Pagas: un día de trabajo de auditoría antes de construir nada nuevo.
- **Confiar en que RLS + RPC ya cubre lo que importa (dinero, stock, ventas) y que el menú solo cuida la experiencia** — Ganas: cero trabajo extra. Pagas: el hueco de ventas/devoluciones ('Hueco RLS') demuestra que esa confianza ya falló una vez sin que nadie lo notara en días.
- **Agregar una prueba en CI que recorra las tablas de retail y falle si alguna tiene GRANT de escritura a authenticated sin política que valide rol+sede** — Ganas: el próximo hueco de este tipo no puede volver a dormir sin que CI avise. Pagas: construir esa prueba y decidir qué tablas quedan como excepción documentada (catálogo, que escribe directo con RLS a propósito).

### PL-94 · SQL vs Admin

**¿'Poder pegar SQL en producción' (PL-11) y 'ser Admin en la app' (D-12) son el mismo círculo de confianza, o cosas separadas?**

*Por qué:* Nada en el repo liga hoy 'quién pega SQL' (acceso al SQL Editor de Supabase o al MCP) con colaboradores.rol — son candados en sistemas distintos. D-11/PL-11 nombran personas; D-12 nombra roles de negocio. Con 6 personas construyendo, es fácil asumir que son la misma lista sin haberlo decidido.

- **Separadas a propósito: el segundo pegador de SQL no tiene por qué ser Admin en la app, ni viceversa (Recommended)** — Ganas: separa 'quién opera la infraestructura' de 'quién ve todo el negocio' — un comprador futuro podría ser Admin sin tocar SQL jamás. Pagas: dos listas de confianza que mantener.
- **Unificarlas: quien pega SQL en producción también es Admin de la app** — Ganas: una sola lista de 'gente de máxima confianza'. Pagas: si el segundo pegador es alguien técnico (Dany) y no alguien que deba operar el negocio día a día, igual heredaría ver costos, márgenes y configuración.
- **No decidir todavía — no hay urgencia mientras Admin no exista en la base** — Ganas: cero trabajo ahora. Pagas: cuando se resuelva 'Admin ahora' esta pregunta vuelve igual de abierta y bloquea esa construcción.

### PL-95 · Bitácora SQL

**D-11 exige que cada SQL pegado en producción 'quede anotado: qué pegó y cuándo'. La tabla V1 pensada para esto (retail.migraciones_aplicadas) ya no existe en V2. ¿Cómo se registra hoy, con dos pegadores?**

*Por qué:* D-11 (2026-09-12): 'queda anotado... cada vez que lo hace se registra qué pegó y cuándo.' Verificado: retail.migraciones_aplicadas ya no existe en producción V2; hoy el único rastro es supabase_migrations.schema_migrations, que registra CUÁNDO pero no QUIÉN.

- **Tabla nueva retail.sql_aplicado (quién, cuándo, qué migración, resultado del ensayo) que el pegador llena antes de pegar (Recommended)** — Ganas: cumple D-11 literalmente, y con 2 pegadores ya hace falta saber quién hizo qué. Pagas: un paso manual más, que se puede saltar bajo presión — el mismo riesgo que ya rompió la disciplina de ensayo de ADR-0119.
- **Usar el propio commit + PR de GitHub como registro, sin construir nada nuevo** — Ganas: cero trabajo, ya es el precedente actual. Pagas: no distingue 'se escribió en el repo' de 'se pegó en producción' — D-11 pide específicamente lo segundo.
- **Exigir que todo SQL de producción quede pegado también como comentario en el PR correspondiente, sin tabla nueva en la base** — Ganas: un solo lugar (GitHub) donde mirar el historial completo. Pagas: no es consultable desde la propia base ni por un agente que audite en vivo contra producción.

### PL-96 · Ascender rol

**Hoy, para pasar a alguien de 'colaborador' a 'líder' (o viceversa) en retail.colaboradores, ¿existe una función, o solo un UPDATE manual por SQL?**

*Por qué:* 05-SEGURIDAD.md, matriz rol × operación: 'Dar de alta o de baja a una persona → nadie por la API — se hace en Dynamic o por SQL (D-11)'. No se encontró en el repo ninguna función que escriba retail.colaboradores.rol; el ascenso hoy exige un UPDATE manual, el mismo cuello de botella que pegar cualquier otro SQL.

- **Construir una función security definer para que solo Admin (mientras no exista, solo Felipe) cambie colaboradores.rol, con registro de quién y cuándo (Recommended)** — Ganas: ascender a alguien deja de depender de que Felipe abra el editor SQL cada vez. Pagas: una función nueva que hay que probar contra auto-ascenso.
- **Seguir por SQL a mano mientras el equipo sea chico (25 personas)** — Ganas: cero trabajo, es lo que ya pasa hoy. Pagas: cada ascenso depende de Felipe — el mismo 'factor de autobús 1' que ya aparece en pegar SQL.
- **Que el cambio de rol se haga desde Dynamic (el sistema de personal), ya que colaboradores.persona_id apunta allá** — Ganas: una sola fuente de verdad para 'quién es quién' en la empresa. Pagas: hoy colaboradores.rol es una tabla de RETAIL, no de Dynamic — moverlo cruza la frontera que PL-07 pidió mantener con guardarraíl, no abrirla más.

### PL-97 · Cajones

**7 componentes dibujan su propio velo (fixed inset-0) fuera de <Modal>: ConteoPanel.tsx:577, AppShell.tsx:523, NotaCreditoVistaRapida.tsx:82, OrdenPanel.tsx:122, PorPagarVistaRapida.tsx:74, ProveedorModal.tsx:297, ProveedorVistaRapida.tsx:64, RecepcionVistaRapida.tsx:56. ADR-0136 (docs/adr/0136-...md:78-81) los deja como 'pendiente de decidir'. ¿Qué patrón les damos?**

*Por qué:* ADR-0136 nombra solo 4 pendientes; el mapeo encontró 7-8 reales sin componente ni regla (informes-lectores.md, sección 'FRENTE: Decisiones estructurales'). Ninguna de las 24 decisiones del acta ni de la ronda de 60 preguntas lo resuelve.

- **Migrar todos a <Modal> (Recommended)** — Ganas: un solo componente, una sola regla de movimiento, cero mantenimiento duplicado (principio 2 de CLAUDE.md: integridad conceptual). Pagas: hay que ensanchar <Modal> o aceptar que un cajón se vea distinto a un modal centrado.
- **Crear <Cajon>, hermano de <Modal>, con su propio ADR** — Ganas: respeta que un cajón lateral es un patrón visualmente distinto a un modal centrado. Pagas: un componente más que mantener y una regla de movimiento más que documentar y aprender.
- **Dejarlos como excepción documentada indefinida** — Ganas: cero trabajo hoy. Pagas: cada cajón nuevo copia el patrón que tenga más a mano; ADR-0136 sigue sin cubrir ~15% de los overlays reales del sistema.

### PL-98 · RojoMax

**packages/shared/src/design-tokens.ts:73 fija MAX_ROJO_POR_PANTALLA = 2, pero nada la hace cumplir en código: Colaboradores tenía 25 filas en rojo (docs/pantallas/colaboradores.md:41, ya corregido en su rediseño). ¿Cómo se hace cumplir de ahora en adelante, para que no se repita en la próxima pantalla?**

*Por qué:* docs/pantallas/colaboradores.md sección 4 ('Estética', línea 41): 'MAX_ROJO_POR_PANTALLA = 2 se viola: cada fila lleva Quitar acceso en rojo y hay 25 filas'. Es el único hallazgo estético repetido en las dos únicas pantallas auditadas hasta ahora.

- **Prueba automática que cuente el rojo por página y falle en CI (Recommended)** — Ganas: la regla deja de depender de que alguien la recuerde, igual que ya se hizo con el aviario (ADR-0104) y el menú (ADR-0144, menu.test.ts). Pagas: hay que mantener al día la lista de clases 'rojo' si el token cambia de nombre.
- **Checklist manual en cada PR (como hoy)** — Ganas: cero código nuevo. Pagas: ya falló una vez con 25 filas fusionadas a main; CLAUDE.md global dice 'un candado en la base vale más que diez validaciones' y aquí ni siquiera hay validación.
- **Retirar el token y dejarlo a criterio caso por caso** — Ganas: más libertad para pantallas con estados de error legítimos. Pagas: se pierde la disciplina visual que hoy distingue a CAYLA (rojo = esto es grave, no decoración).

### PL-99 · Contraste

**Las dos únicas pantallas auditadas con /pantalla encontraron texto bajo el piso de contraste AA de ADR-0012: colaboradores.md:41 (tinta/45, tinta/55 a 11px) y productos-categorias.md:30 (etiqueta 'SIN PRODUCTOS' a 9px, tinta/50). ¿Se automatiza la verificación de contraste, o sigue dependiendo de que /pantalla la encuentre después de fusionar?**

*Por qué:* Dos hallazgos independientes (Colaboradores y Categorías, las únicas dos pantallas con /pantalla en main) apuntan al mismo tipo de defecto de contraste; ADR-0012 fija el piso pero ningún mecanismo lo comprueba (informes-lectores.md línea 796).

- **Prueba de contraste automática sobre los tokens de globals.css, en CI (Recommended)** — Ganas: el piso de ADR-0012 pasa de ser una regla leída a una regla que la máquina verifica, como ya pasa con el aviario y el menú. Pagas: escribir y mantener el cálculo de contraste contra la paleta real de app/globals.css.
- **Seguir dependiendo del skill /pantalla, caso por caso** — Ganas: cero trabajo hoy. Pagas: solo 2 de 48 pantallas están auditadas; el resto puede llevar meses violando el piso sin que nadie lo note.
- **Eliminar del catálogo de opacidades las combinaciones que ya se sabe que fallan (tinta/45, tinta/50)** — Ganas: hace físicamente difícil repetir el error, sin escribir una prueba nueva. Pagas: no cubre combinaciones nuevas de color y tamaño que nadie probó todavía.

### PL-100 · Cabecera

**Solo 4 de 52 page.tsx importan EncabezadoPagina (apps/web/components/ui/EncabezadoPagina.tsx); el resto arma su propia cabecera, y el mapeo encontró que 3 sesiones rediseñaron cabeceras a la vez el mismo día (Facturación, Historial, Producción). ¿EncabezadoPagina pasa a ser obligatorio para toda pantalla nueva?**

*Por qué:* informes-lectores.md línea 464: 'Tres sesiones rediseñaron cabeceras a la vez (Facturación, Historial, Producción). Falta una lista corta de piezas obligatorias'. Verificado hoy: grep confirma solo 4/52 usos reales de EncabezadoPagina.

- **Obligatorio, con una prueba que falle si un page.tsx no lo usa (Recommended)** — Ganas: una sola cabecera, un solo lugar donde arreglar el reloj de Lima o el tamaño del título (principio 2, integridad conceptual). Pagas: hay que ensanchar EncabezadoPagina para cubrir los casos que hoy resuelven a mano (p. ej. Caja, con su propio reloj).
- **Recomendado, pero no forzado** — Ganas: cada pantalla conserva libertad si su cabecera es rara. Pagas: es exactamente lo que ya pasa hoy, y ya produjo 3 rediseños simultáneos el mismo día.
- **Documentar EncabezadoPagina como una alternativa entre varias cabeceras válidas, catalogadas** — Ganas: reconoce que Facturación, Historial y Producción quizá necesitan algo distinto. Pagas: un manual con 3-4 cabeceras 'válidas' es casi tan disperso como no tener regla.

### PL-101 · ModoOscuro

**ADR-0116 (en main) dice 'sin modo oscuro'; ADR-0129 (solo en la rama claude/cayla-retail-design-system-2b3830) registra que respondiste 'sí' al modo oscuro y a radios más suaves el 2026-09-19, y ese mismo número 0129 ya está usado en main para otra decisión (Recibir mercadería). ¿Qué entra al plano?**

*Por qué:* Contradicción real entre ADR-0116 (main) y ADR-0129 (rama sin fusionar), con choque de numeración; informes-lectores.md: 'Sistema visual: main (ADR-0116... sin modo oscuro) contra ADR-0129 en la rama... (Felipe respondió sí)'.

- **Cerrado por ahora: se mantiene ADR-0116, se archiva la rama y se renumera el 0129 de main (Recommended)** — Ganas: coincide con PL-05 (fase corta, foco en salir en vivo) y evita repartir foco visual mientras TRU opera con datos de prueba. Pagas: se descarta formalmente el 'sí' que ya diste el 2026-09-19 en esa rama, hasta que se reabra.
- **Abierto: modo oscuro entra como fase futura con dueño, después de la salida en vivo** — Ganas: coincide con lo que sí aprobaste, sin construirlo ahora. Pagas: dos ADR conviviendo con estados contrarios (0116 vigente, 0129 futuro) hasta que se resuelva.
- **Se retoma ya, en paralelo a TRU** — Ganas: no se pierde el trabajo de la rama del design system. Pagas: repite el patrón que el mapeo ya marcó como riesgo: 122 de 589 commits recientes son animación/look/contraste mientras el mostrador sale con datos de prueba.

### PL-102 · DiseñoTok

**packages/shared/src/design-tokens.ts (radios 0, colores propios) contradice a apps/web/app/globals.css (radios 4-22px, la paleta Atelier que el código realmente usa). ¿Cuál manda, y qué pasa con el otro archivo?**

*Por qué:* informes-lectores.md línea 38: 'packages/shared/src/design-tokens.ts contradice apps/web/app/globals.css (radios 0 vs 4-22px, colores distintos)', repetido en la síntesis de contradicciones del mapeo.

- **globals.css manda; se borra design-tokens.ts (Recommended)** — Ganas: aplica el principio 7 del repo (antes de agregar, borra) — el código real ya usa globals.css, mantener el otro archivo solo confunde a la próxima sesión o agente que lo lea primero. Pagas: hay que revisar si algo de packages/shared realmente lo importa antes de borrarlo.
- **globals.css manda; design-tokens.ts se regenera automáticamente desde ahí** — Ganas: packages/shared sigue exportando tokens a quien los necesite fuera de apps/web, sin duplicar la fuente de verdad. Pagas: un script más que mantener y correr en CI.
- **Se conservan los dos, documentando cuál usar dónde** — Ganas: no rompe nada que hoy dependa de design-tokens.ts. Pagas: dos fuentes de verdad visual es justo el tipo de inconsistencia que el principio 2 de CLAUDE.md prohíbe.

### PL-103 · ManualUI

**Los patrones de pantalla (listado con filtros en URL, formulario con RPC + traducirError + avisar + router.refresh, modal, cajón, ruta interceptada @modal) existen y se repiten en el código, pero 'solo se aprenden leyendo ADRs' — no hay un documento único con el ejemplo canónico de cada tipo. ¿Se escribe ese manual?**

*Por qué:* informes-lectores.md línea 795 ('CÓMO SE HACE UNA PANTALLA NUEVA... Los patrones existen pero solo se aprenden leyendo ADRs') y línea 56 de la sección de decisiones estructurales ('Patrones de pantalla sin regla escrita').

- **Sí, a mano en docs/plano/, con un ejemplo real por tipo y enlace al archivo fuente (Recommended)** — Ganas: es exactamente lo que pide PL-16 del acta (la intención se escribe a mano, los hechos se generan); acorta el arranque de cada sesión nueva. Pagas: hay que mantenerlo cuando un patrón cambie (como ya pasó 3 veces con las cabeceras).
- **Se deja como está: cada sesión lee 3-4 ADR y copia el código de una pantalla parecida** — Ganas: cero trabajo hoy. Pagas: es el estado actual, y ya produjo 8 overlays distintos y 3 cabeceras rediseñadas el mismo día.
- **Se genera automáticamente listando componentes de components/ui/ y sus usos, sin narrar el porqué** — Ganas: nunca se desactualiza solo. Pagas: un catálogo sin el ejemplo canónico narrado no resuelve 'cuál patrón usar', solo 'qué componentes existen'.

### PL-104 · SinContexto

**El principio 12 de tu CLAUDE.md global exige poder responder si una persona sin formación técnica completa un flujo sin que nadie le explique, pero hoy solo lo verifica /pantalla, después de fusionar, y solo en 2 de 48 pantallas. ¿Se vuelve un paso del checklist del PR de toda pantalla nueva?**

*Por qué:* CLAUDE.md global, sección 'Antes de decir listo', punto 3 ('Persona sin contexto'); informes-lectores.md línea 471: 'falta un criterio de cuáles analizar primero' y cobertura real de 2/48.

- **Sí: el PR de toda pantalla nueva incluye una línea 'probé el flujo con alguien sin contexto: sí/no, quién' (Recommended)** — Ganas: barato, y devuelve la disciplina de principio 12 a ANTES del merge en vez de después, cuando ya está en producción. Pagas: depende de tener a alguien sin contexto disponible cada vez (hoy el equipo real son 2-3 personas).
- **Se mantiene como auditoría posterior, vía skill /pantalla, sin bloquear el merge** — Ganas: no frena el ritmo actual de fusión (mediana de 9 minutos por PR). Pagas: es el estado de hoy, y solo cubrió 2 de 48 pantallas en dos días de vida del skill.
- **Se reemplaza por una prueba automática de accesibilidad (tabulación, lectores de pantalla)** — Ganas: corre sola en CI. Pagas: mide operabilidad técnica, no si alguien ENTIENDE el flujo — no es lo mismo que principio 12 pide.

### PL-105 · Celular

**Ya decidiste diseñar el menú e Inicio primero para el celular del mostrador (memoria 2026-09-21), pero no hay ninguna regla de que una pantalla nueva se pruebe en ancho de celular antes de fusionar (no hay Playwright ni viewport de prueba en CI, confirmado: 0 archivos playwright.config en el repo). ¿Se agrega ese paso?**

*Por qué:* Confirmado en el repo: no existe playwright.config ni viewport de prueba en apps/web (búsqueda directa). La finalidad 2026-09-21 prioriza el celular del colaborador, pero ninguna decisión cubre cómo se verifica antes de fusionar.

- **Paso manual en el PR: captura en un ancho de celular real de tienda, además de escritorio, para toda pantalla de mostrador (Recommended)** — Ganas: barato, y el celular ya es la prioridad #1 según la finalidad decidida. Pagas: una captura más por PR; no atrapa bugs de interacción táctil, solo de layout.
- **Se prueba solo si la pantalla es 'de mostrador' (Vender, Caja, Cambios, Devoluciones); las de líder/back-office no lo necesitan** — Ganas: menos fricción para pantallas que casi nadie usará en celular (Producción, Compras). Pagas: hay que mantener la lista de cuáles son 'de mostrador' al día.
- **No se agrega paso nuevo; se confía en Tailwind responsive y se corrige si alguien se queja** — Ganas: cero trabajo hoy. Pagas: es lo que ya pasa, y el colaborador de mostrador es justo quien menos tiempo tiene para reportar un botón que no se ve en su celular.

### PL-106 · EstadoVacío

**productos-categorias.md (tarea #7) encontró que una categoría sin productos solo dice 'SIN PRODUCTOS' en vez de ofrecer una acción ('Crear el primer producto aquí'). ¿Se vuelve una regla general para todo estado vacío del ERP, o se corrige pantalla por pantalla cuando /pantalla lo encuentre?**

*Por qué:* docs/pantallas/productos-categorias.md, tarea #7 (línea 61): 'Marcar las categorías vacías con una acción útil (Crear el primer producto aquí) en lugar de solo sin productos... convierte estado vacío en flujo'.

- **Regla general en el manual de pantalla: todo estado vacío con una acción posible la ofrece (Recommended)** — Ganas: aplica el principio 12 (el error es del diseño) de forma sistemática, no solo donde ya se auditó. Pagas: hay que revisar cada estado vacío existente para ver si cumple, no solo los nuevos.
- **Se corrige solo donde /pantalla ya lo encontró (Categorías); el resto espera su turno de auditoría** — Ganas: cero trabajo extra hoy. Pagas: con 2/48 pantallas auditadas, el mismo defecto puede repetirse sin que nadie lo note en 46 pantallas más.
- **Se deja como decisión visual de cada pantalla, sin regla escrita** — Ganas: máxima libertad de diseño por pantalla. Pagas: es lo que ya produjo el defecto en Categorías; no hay nada que evite que se repita en la próxima pantalla con catálogo vacío.

### PL-107 · SubirLíder

**'Los 9 líderes tienen alcance global y todos salieron de un backfill Líder para todos, sin decidir persona por persona... esta pantalla no permite bajar a nadie de Líder ni subirlo. Esa decisión es tuya, no de código, y hoy solo se cambia entrando a la base' (docs/pantallas/colaboradores.md:155). ¿Se construye esa acción en la pantalla?**

*Por qué:* Cita textual de docs/pantallas/colaboradores.md:155, mencionada explícitamente como ejemplo por el propio mapeo. No está resuelta ni en el acta PL-01..24 ni en la ronda de 60 preguntas (Bloque 13 solo decide el ALCANCE por sede, no quién puede cambiar el rol).

- **Sí, visible solo para ti (no para cualquier líder), con confirmación y quedando en el historial de accesos (Recommended)** — Ganas: es la operación más sensible de la pantalla hoy y es invisible y sin rastro; el historial ya está construido (ADR-0148, tarea #3 de colaboradores.md). Pagas: una RPC nueva y una fila más en la tabla, restringida por permiso.
- **Se deja como operación de base de datos a propósito, como fricción deliberada** — Ganas: subir a Líder nunca es un clic casual. Pagas: sigues siendo tú quien tiene que entrar a pegar SQL cada vez que cambia un rol, incluso para casos simples.
- **Se construye para cualquier líder, igual que 'Quitar acceso' hoy** — Ganas: coherente con el resto de la pantalla. Pagas: cualquiera de los 9 líderes con alcance global podría crear más líderes sin tu revisión — un riesgo mayor que el que resuelve.

### PL-108 · Detalle

**El ERP ya usa la ruta interceptada @modal para el detalle de una factura de Compras y de un producto (4 slots @modal hoy), pero Colaboradores abre su detalle en un modal sin URL propia. No hay una regla escrita de cuándo un detalle merece @modal y cuándo un modal simple basta. ¿Se escribe esa regla?**

*Por qué:* Confirmado en el código: 4 slots @modal existen (compras/@modal, productos/@modal) mientras Colaboradores usa modal simple; informes-lectores.md línea 687 lista 'tabla más detalle' entre los 'patrones de pantalla sin regla escrita'.

- **Sí: @modal cuando el detalle se comparte o se recarga (una factura para el contador, un resultado de búsqueda); modal simple cuando solo tiene sentido dentro del flujo que lo abrió (Recommended)** — Ganas: describe lo que el código ya hace hoy sin decirlo — solo falta escribirlo en el manual de pantalla. Pagas: ninguno real; es documentar una práctica ya consistente.
- **Se usa @modal para todo detalle, por consistencia** — Ganas: una sola forma de abrir cualquier detalle. Pagas: convierte cada confirmación pequeña (p. ej. dar de baja a un colaborador) en una ruta nueva que hay que mantener.
- **Se usa un modal simple para todo, y @modal solo donde ya existe, sin regla para lo nuevo** — Ganas: cero trabajo hoy. Pagas: dos criterios sin nombrar conviven, y la próxima pantalla con detalle compartible (p. ej. una orden de Producción) puede tomar el camino equivocado.

### PL-109 · Cobertura

**El skill /pantalla solo analizó 2 de 48 pantallas en main (Colaboradores, Categorías) desde que existe (agregado 2026-09-19); no hay un criterio escrito de cuál analizar primero. ¿Con qué orden se prioriza de ahora en adelante?**

*Por qué:* informes-lectores.md línea 471 ('Cobertura de análisis por pantalla: solo 2 de 48... falta un criterio de cuáles analizar primero'); .claude/skills/pantalla/SKILL.md ya calcula relevancia por pantalla, según el mismo mapeo (línea 530).

- **Por relevancia dinero/stock, con el mismo criterio que ya trae el propio skill /pantalla (Recommended)** — Ganas: usa el criterio que ya existe (peso x2 a gestión, dinero y stock, frecuencia, qué se detiene si falla) en vez de inventar uno nuevo; empieza por Vender, Caja y Compras. Pagas: pantallas de bajo riesgo de dinero pero alto riesgo de confusión (como Colaboradores) quedan para después.
- **Por las pantallas que ya se están rediseñando, para no perder trabajo si el rediseño cambia algo grave** — Ganas: el análisis llega justo antes de que se congele un diseño nuevo. Pagas: depende de que /pantalla se acuerde de correr cada vez que alguien abre un rediseño, sin agenda propia.
- **Por antigüedad: las que nunca se tocaron desde el corte V1→V2** — Ganas: encuentra deuda escondida en pantallas que nadie mira. Pagas: no prioriza donde el error cuesta más (dinero, stock), sino donde hay más tiempo acumulado.

### PL-110 · PantRamas

**Hay 3 análisis /pantalla más (caja.md, vender-historial.md, productos-PENDIENTE.md) hechos en ramas que nunca se fusionaron a main (origin/claude/auditoria-pantalla-caja-883856, -historial-cc906a, audit-pantalla-producto-ddbaca). ¿Se rescatan, o se rehacen desde cero contra el código de hoy?**

*Por qué:* informes-lectores.md línea 427: '/pantalla ha analizado 2 pantallas en main... otros 3 análisis están en ramas sin fusionar'. Es pérdida de trabajo real y sin decisión, distinta de la cobertura general (pregunta anterior).

- **Se rescatan y se verifican contra el SHA actual antes de fusionarlos a docs/pantallas/ (Recommended)** — Ganas: aplica el principio 7 (antes de agregar, borra) — no hay razón de repetir el trabajo de lectura si ya existe. Pagas: hay que confirmar que el código no cambió tanto como para invalidar los hallazgos (como ya pasó con Colaboradores, vencido en un día).
- **Se rehacen desde cero** — Ganas: garantiza que el análisis calza con el código de hoy. Pagas: repite trabajo ya hecho en 3 pantallas que además tocan dinero directo (Caja).
- **Se ignoran; se prioriza analizar pantallas que aún no tienen ningún análisis** — Ganas: cubre terreno nuevo más rápido. Pagas: se pierde trabajo ya hecho sobre Caja, justamente una de las pantallas de mayor relevancia dinero/stock.

### PL-111 · TonoError

**traducirError (ADR-0022, lib/error-escritura.ts, usado en 66 archivos) traduce errores técnicos a texto para la persona, pero no hay un estándar escrito de qué debe decir ese texto. colaboradores.md encontró un texto con género fijo ('no va a poder cambiarla él mismo', línea 190) y otro que manda a un lugar equivocado ('vuelve a agregarse desde Dynamic', cuando se agrega desde esta misma pantalla, línea 213). ¿Se escribe un estándar de tono?**

*Por qué:* docs/pantallas/colaboradores.md tarea #9 (línea 120-124) y sección Estética (línea 41): dos textos reales, ya fusionados a main, que un estándar de tono habría evitado.

- **Sí, con reglas simples: siempre neutro en género, siempre dice qué hacer ahora, nunca nombra una tabla o código técnico (Recommended)** — Ganas: cuesta poco escribirlo y ya hay al menos 2 textos reales que lo violan en una sola pantalla auditada. Pagas: revisar los textos ya escritos en las otras 46 pantallas para ver cuántos más lo incumplen.
- **Se sigue revisando caso por caso cuando /pantalla lo encuentra** — Ganas: cero trabajo hoy. Pagas: con 2/48 pantallas cubiertas, la mayoría de los mensajes de error del ERP nunca pasaron por esta revisión.
- **Se delega a quien escriba cada pantalla, sin estándar central** — Ganas: máxima velocidad para escribir un mensaje nuevo. Pagas: es el estado actual, y ya produjo un mensaje que manda a la persona al lugar equivocado.

### PL-112 · IconoAyuda

**productos-categorias.md (tarea #6) encontró que el ícono de ayuda junto al título es un '!' — el mismo símbolo que en el resto del sistema significa alerta o urgencia (el chip 'Vencida' late con ese código visual, ADR-0136). ¿Se estandariza un ícono de ayuda distinto en todo el ERP?**

*Por qué:* docs/pantallas/productos-categorias.md, dimensión 'Funciones' (línea 33: 'el icono ! junto al título es la ayuda, se parece a una alerta') y tarea #6 (línea 60).

- **Sí: '?' o un tooltip como único ícono de 'esto se explica'; '!' queda reservado para alertas reales (Recommended)** — Ganas: aplica el principio 2 (integridad conceptual) — dos significados para el mismo símbolo confunden más rápido de lo que ahorra el atajo visual. Pagas: revisar si '!' se usa como ayuda en otra pantalla además de Categorías.
- **Se corrige solo en Categorías, sin regla para pantallas futuras** — Ganas: arregla el caso encontrado hoy con el menor esfuerzo. Pagas: no evita que la próxima pantalla con ayuda use '!' de nuevo.
- **Se deja: '!' sirve igual para información y para alerta porque el contexto ya lo aclara** — Ganas: cero cambios. Pagas: una colaboradora nueva en hora punta no tiene tiempo de leer el contexto antes de decidir si algo es urgente o solo informativo — justo lo que el principio 12 pide evitar.


## Sesión 4 — Frente 7 — Integraciones externas y "todo falla, todo el tiempo" (Lucode/SUNAT, padrón RENIEC/SUNAT, Dynamic, impresora térmica, Alegra, Storage, integraciones retiradas y planeadas) + FRENTE 8 — Equipo, gobierno operativo, coordinación de IA y onboarding (31 preguntas)

### PL-113 · Reintento

**Bloque 12 (60 preguntas, 21-sep) ya decidió transmisión automática al cobrar con reintento si Lucode/SUNAT caen. Hoy `apps/web/lib/lucode.ts:13-18` dice explícitamente que el reintento 'es una decisión de negocio, no de este adaptador', y `vercel.json` no tiene ningún cron configurado. ¿Quién dispara ese reintento automático?**

*Por qué:* apps/web/lib/lucode.ts líneas 13-18 (contrato del adaptador) + vercel.json sin `crons`; implementa/no contradice Bloque 12 de cayla-decisiones-60-preguntas-2026-09.md ('automática al cobrar, con reintento').

- **Job en el servidor cada pocos minutos (Recommended)** — Ganas: reintenta aunque nadie tenga la pantalla de Facturación abierta, incluso de madrugada. Pagas: un Vercel Cron nuevo que vigilar, y hay que apoyarse bien en el token de idempotencia que ya existe para no duplicar un envío.
- **Reintento mientras el navegador de la caja siga abierto** — Ganas: cero infraestructura nueva, reusa `/api/lucode/emitir`. Pagas: si la asesora cierra la pestaña o apaga la PC, el reintento se detiene con ella — deja de ser realmente automático.
- **Seguir como hoy: solo el botón manual 'Transmitir'/'Reintentar' en Facturación** — Ganas: cero riesgo de doble envío. Pagas: contradice lo ya decidido el 21-sep (automático) — alguien tiene que acordarse de abrir Facturación cada cierto tiempo.

### PL-114 · Aviso líder (elige varias)

**La misma decisión de Bloque 12 dice 'aviso al líder si pasan horas', pero el repo no tiene ningún canal de aviso construido (sin correo transaccional, sin WhatsApp, sin notificación push en `apps/web/lib`). ¿Por dónde llega ese aviso, y a las cuántas horas se dispara?**

*Por qué:* Bloque 12 de cayla-decisiones-60-preguntas-2026-09.md ('cola visible, aviso al líder si pasan horas') sin canal ni umbral definido; grep sin resultados de infraestructura de notificaciones fuera de las campañas de descuento.

- **Aviso dentro del sistema, banner o campanita al entrar (Recommended)** — Ganas: cero costo nuevo, mismo patrón que la campanita de campañas ya construida (`lib/etiqueta-campana.ts`). Pagas: si el líder de turno no abre el sistema esa tarde, no se entera hasta el día siguiente.
- **WhatsApp al líder de turno** — Ganas: llega aunque no esté frente a una pantalla. Pagas: sería la primera integración de mensajería del repo — hay que contratar y mantener un proveedor nuevo.
- **Correo al líder de turno** — Ganas: barato, sin proveedor nuevo. Pagas: en el mostrador casi nadie revisa el correo en horario de tienda — puede llegar tan tarde como un banner.

### PL-115 · Alta PSE

**El trámite de alta de Lucode como PSE tercero ante SUNAT SOL (`docs/adr/0005-facturacion-electronica-parte-en-dos.md`) seguía sin confirmación de cierre el 17-sep (`docs/AUDITORIA-2026-09-17.md`), y lo probado el 21-sep en `lucode.ts` es solo contra el sandbox, no producción real. TRU sale en vivo esta semana (PL-01). ¿Bloqueamos boletas reales de Lucode en TRU hasta confirmar el alta, o salimos igual?**

*Por qué:* docs/adr/0005-facturacion-electronica-parte-en-dos.md ('trámite pendiente, hace Felipe, no requiere código'); docs/AUDITORIA-2026-09-17.md, sección Facturación/SUNAT; apps/web/lib/lucode.ts líneas 29-53 (solo sandbox verificado).

- **Confirmar el alta ANTES de transmitir la primera boleta real en TRU (Recommended)** — Ganas: cero riesgo de transmitir sin autorización legal vigente. Pagas: si el trámite sigue pendiente, TRU sale unos días más con 'La emite Alegra' por defecto — que de todos modos ya es la decisión de Bloque 2/12.
- **Salir igual; si SUNAT rechaza por falta de alta, se ve en el mensaje de error** — Ganas: no frena nada. Pagas: un correlativo real quemado ante SUNAT sin poder transmitirlo, como ya pasó con B004-000004 y B004-000005.

### PL-116 · 2 boletas

**`docs/BACKLOG.md` (~línea 4570) confirma 2 correlativos reales ya quemados ante SUNAT sin transmitir: B004-000004 (S/655.50) y B004-000005 (S/185.30). Ya existe el botón 'Liberar sin espera' (`retail.marcar_comprobante_no_emitido`) y también se puede simplemente reintentar 'Transmitir'. ¿Qué se hace con esos dos?**

*Por qué:* docs/BACKLOG.md ~líneas 4570-4585 (comprobantes reales sin liberar, botón ya construido y sin usar).

- **Reintentar 'Transmitir' primero; si SUNAT los rechaza, recién ahí liberar (Recommended)** — Ganas: si SUNAT los acepta igual (llegaron tarde, no en falso), no se pierde el correlativo. Pagas: un reintento más antes de cerrar el caso.
- **Liberar los dos ahora mismo con 'Liberar sin espera'** — Ganas: cierra el caso hoy sin depender de que Lucode responda. Pagas: el número queda quemado para siempre ante SUNAT sin volver a intentar transmitirlo.

### PL-117 · Nota débito

**`apps/web/lib/lucode.ts:36-39` dice que `nota_debito` solo está confirmada por la documentación pública de Lucode, 'no lo confirma campo por campo', y que CAYLA no emite notas de débito hoy. ¿Se prueba contra el sandbox antes de TRU, o queda fuera de alcance hasta que haya un caso real que la necesite?**

*Por qué:* apps/web/lib/lucode.ts líneas 36-39 (comentario y catálogo MOTIVO_ND).

- **Queda fuera de alcance hasta que haya un caso real (Recommended)** — Ganas: cero esfuerzo en algo que CAYLA no usa hoy. Pagas: si algún día se necesita en caliente, un bug de forma se descubre en producción, no en sandbox.
- **Probar una nota de débito de prueba contra el sandbox esta semana** — Ganas: si hay un campo mal armado, se descubre ahora, sin presión. Pagas: tiempo de alguien en algo que no bloquea nada del go-live.

### PL-118 · Timeout 15s

**`apps/web/lib/lucode.ts:193-200` corta la llamada a Lucode a los 15 segundos. Si eso pasa en plena fila de caja, ¿qué debe ver la colaboradora en pantalla, además del loader global de ADR-0149?**

*Por qué:* apps/web/lib/lucode.ts líneas 193-200 (timeout de 15s) + regla ADR-0149 (loader global) + patrón de degradación descrito en docs/BACKLOG.md (~línea 4700).

- **El mismo loader global y, al fallar, un mensaje claro: 'Lucode no respondió, la venta ya se guardó, transmite luego desde Facturación' (Recommended)** — Ganas: la colaboradora entiende que la venta NO se perdió (principio 9) y sigue atendiendo. Pagas: nada — es solo el texto de un mensaje ya cableado con el patrón de `lib/resultado.ts`.
- **Dejar el mensaje genérico de error que ya usa cualquier otra pantalla** — Ganas: cero trabajo nuevo. Pagas: una colaboradora sin contexto técnico puede pensar que la venta se perdió y repetir el cobro (principio 12).

### PL-119 · Resolución

**El ticket imprime la resolución de autorización del PSE vía `NEXT_PUBLIC_EMISOR_RESOLUCION` (`apps/web/lib/emisor.ts`); si está vacía, esa línea simplemente no sale. `docs/BACKLOG.md` (~línea 603) la marca sin resolver. ¿Se completa esa variable antes de imprimir el primer ticket real de Lucode en TRU, o se acepta el ticket sin esa línea por ahora?**

*Por qué:* docs/BACKLOG.md ~líneas 602-603; apps/web/lib/emisor.ts (variable NEXT_PUBLIC_EMISOR_RESOLUCION).

- **Completarla antes del primer ticket real (Recommended)** — Ganas: el ticket queda completo desde el día uno, sin exponerse a una observación de SUNAT por un dato faltante. Pagas: dos minutos de Felipe buscando el número de resolución.
- **Aceptar el ticket sin esa línea por ahora** — Ganas: no frena nada esta semana. Pagas: cada ticket real de Lucode sale con un dato legal de menos hasta que alguien se acuerde de llenarlo.

### PL-120 · Cae Dynamic

**Retail resuelve la identidad de cada colaborador con `fn_persona_actual_resumen()` de Dynamic (`apps/web/lib/persona-actual.ts:6-11,42-52`); si esa función falla, la persona rebota a `/login?error=sin_persona` y no puede vender nada — sin ninguna vía alterna hoy. Como retail y Dynamic comparten el mismo proyecto Supabase desde julio (ADR-0091), una caída de Dynamic casi siempre ES una caída del propio retail. ¿Qué se hace en una tienda si eso pasa en plena hora punta?**

*Por qué:* apps/web/lib/persona-actual.ts líneas 6-11 y 42-52; docs/adr/0091-retail-vive-como-schema-dentro-de-dynamic.md; PL-07 del acta ('retail sigue dentro de Dynamic, con guardarraíl').

- **Se acepta el riesgo: si cae Supabase, se vende en papel/manual hasta que vuelva (Recommended)** — Ganas: cero construcción — es lo que ya pasaría hoy sin decirlo. Pagas: cada líder de equipo necesita saber que existe ese plan B de papel, y hoy no está escrito en ningún manual de sede.
- **Construir un modo degradado local (seguir vendiendo con la última sesión válida en caché)** — Ganas: la caja no se detiene ni un minuto. Pagas: semanas de trabajo (sincronización, conflictos de stock) para un caso raro — el mismo argumento que ya descartó ADR-0018 (sin motor de sincronización).

### PL-121 · Nombres caja

**En Caja y Compras, quién abrió/cerró/recibió se busca por `fn_nombres_personas` (Dynamic) con `exigir()` (`apps/web/lib/caja.ts:90-100`, `lib/compras.ts:600-602`) — si esa RPC falla, la pantalla entera se cae, no muestra un nombre genérico. ¿Eso es aceptable, o debe degradar cuando Dynamic no responde?**

*Por qué:* apps/web/lib/caja.ts líneas 90-100 y apps/web/lib/compras.ts líneas 600-602 (patrón exigir() de lib/resultado.ts).

- **Degradar a 'colaborador' genérico cuando Dynamic no responde (Recommended)** — Ganas: Caja y Compras siguen operando aunque Dynamic tenga un hipo — coincide con el principio 9 del repo. Pagas: un cambio chico en dos archivos (caja.ts, compras.ts) para usar `tolerar()` en vez de `exigir()`.
- **Dejarlo como está: si Dynamic falla, la pantalla se cae** — Ganas: cero trabajo. Pagas: una caída puntual de una RPC de solo nombres (no de la venta en sí) bloquea Caja completa en plena tienda.

### PL-122 · Sede 003

**ADR-0029 hace que retail ignore a propósito el campo 'inactiva' que el módulo de identidad de Dynamic le pone a la sede 003 (Tienda Lima) — retail la sigue ofreciendo igual. Pero Bloque 13 (60 preguntas) decidió lo contrario para colaboradores: 'baja automática si Dynamic la marca inactiva'. ¿Son dos reglas distintas a propósito (sede vs. persona) o hay que homogeneizarlas?**

*Por qué:* docs/datos/00-MAPA.md línea 21 (ADR-0029, sede 003 'inactiva' ignorada a propósito) vs. cayla-decisiones-60-preguntas-2026-09.md Bloque 13 ('Baja: automática si Dynamic la marca inactiva').

- **Dos reglas distintas a propósito: una sede no se apaga sola, un colaborador sí (Recommended)** — Ganas: coincide con cómo ya se comportan ambas hoy — una tienda no debe dejar de vender por un campo mal marcado del lado de Dynamic, pero un colaborador que Dynamic da de baja no debe poder seguir vendiendo. Pagas: hay que dejarlo escrito en un solo lugar (docs/datos o el plano) para que no se lea como contradicción, que es justo lo que esta pregunta encontró.
- **Revisar si el mismo criterio de la sede 003 debería aplicar también a personas** — Ganas: consistencia total entre ambos casos. Pagas: reabre una decisión de seguridad ya cerrada (Bloque 13) sin un motivo de negocio nuevo.

### PL-123 · Var. padrón

**`docs/BACKLOG.md` (~línea 4415) deja abierto desde el 10-sep si Vercel tiene realmente `PADRON_PROVEEDOR=apisnetpe_v1` (con el `_v1`) — sin eso, cada consulta de DNI/RUC en producción puede estar cayendo en silencio a 'escribir el nombre a mano' sin que nadie lo note. ¿Lo confirmamos ahora?**

*Por qué:* docs/BACKLOG.md líneas ~4415-4430 ('Lo único abierto: confirmar que Vercel tenga PADRON_PROVEEDOR=apisnetpe_v1 — con el _v1').

- **Confirmarlo ahora en Vercel (Recommended)** — Ganas: cierra en dos minutos un pendiente de 11 días, justo antes de que TRU empiece a facturar de verdad. Pagas: nada real — solo mirar una variable de entorno.
- **Dejarlo para después del go-live de esta semana** — Ganas: no interrumpe el arranque de TRU. Pagas: cada boleta con RUC puede seguir pidiendo el nombre a mano sin que se note la diferencia con una consulta automática rota.

### PL-124 · Cuota padrón

**Hoy solo hay un proveedor de padrón activo a la vez (`PADRON_PROVEEDOR`), aunque `apps/web/lib/padron.ts` ya trae tres adaptadores listos (decolecta, apisnetpe, factiliza). Si ese proveedor agota su cuota (429) a media tarde, hoy el sistema degrada a 'escribe el nombre a mano' el resto del día. ¿Vale la pena que intente automáticamente con un segundo proveedor ya programado, o se acepta esa degradación manual como suficiente?**

*Por qué:* apps/web/lib/padron.ts líneas 90-122 (tres adaptadores) y línea 195 (motivo cuota_agotada); ADR-0008 (consulta padrón DNI/RUC).

- **Aceptar la degradación manual: si se agota la cuota, se escribe el nombre a mano el resto del día (Recommended)** — Ganas: cero código nuevo — es exactamente lo que ADR-0008 diseñó a propósito. Pagas: en un día de mucha venta con factura puede haber varias RUC sin datos automáticos.
- **Reintentar automáticamente con un segundo proveedor cuando el primero devuelve 429** — Ganas: casi nunca se nota que un proveedor se quedó sin cuota. Pagas: pagar dos proveedores contratados en simultáneo para un caso que hoy no consta que haya ocurrido.

### PL-125 · Storage off

**`docs/BACKLOG.md` (~línea 4438) confirma que Supabase Storage está apagado en producción — subir foto de producto o adjunto de compra no funciona ahí, aunque el código ya lo soporta con degradación (`apps/web/lib/producto-fotos.ts`, `lib/adjuntos-compra.ts`). ¿Se enciende ahora (tiene costo mensual) o se sigue operando sin fotos/adjuntos hasta que el catálogo lo necesite de verdad?**

*Por qué:* docs/BACKLOG.md ~línea 4438-4439 ('Storage apagado en local — subir fotos de producto no funciona ahí', mismo estado confirmado para producción unas líneas antes).

- **Seguir sin Storage por ahora; el catálogo funciona igual sin fotos (Recommended)** — Ganas: cero costo nuevo mientras la prioridad es registro fiel (PL-05), no vitrina visual. Pagas: nadie puede adjuntar la factura del proveedor a una compra ni ver la foto real de un producto todavía.
- **Encenderlo ahora** — Ganas: fotos de producto y adjuntos de compra funcionan desde ya. Pagas: un costo mensual nuevo, justo en la semana en que la prioridad declarada es salir en vivo en TRU, no vitrina.

### PL-126 · Cae Alegra

**Alegra no tiene ninguna integración por API en este repo (confirmado por grep: solo aparece en comentarios y comparaciones de diseño) — es un sistema aparte que la asesora llena a mano cuando la venta dice 'la emite Alegra' (Bloque 2). Si Alegra, del lado de ellos, está caída o lenta justo ese día, ¿qué pasa con esa boleta puntual?**

*Por qué:* grep sin resultados de integración por código con Alegra (solo comentarios en apps/web/lib/emisor.ts, BoletaA4.tsx); Bloque 2 de cayla-decisiones-60-preguntas-2026-09.md ('por defecto La emite Alegra').

- **Esa venta cambia a 'la emite retail' sobre la marcha, si ya se confía en Lucode (Recommended)** — Ganas: la clienta se va con comprobante igual, sin esperar a que Alegra vuelva. Pagas: rompe el criterio 'por defecto Alegra' de Bloque 2 caso por caso, sin una regla escrita de cuándo vale la pena hacerlo.
- **Se cobra igual y la boleta de Alegra queda pendiente hasta que Alegra vuelva** — Ganas: no toca la regla de Bloque 2. Pagas: la clienta se va sin comprobante ese día, y alguien tiene que acordarse de volver a Alegra después.

### PL-127 · Pago online

**PL-08 ya decidió que canal online y contabilidad completa 'quedan pendientes con dueño' sin construirse todavía. Ninguno tiene dueño asignado hoy, y ni tarjeta (POS) ni pasarela online (Culqi no existe en código) tienen ninguna integración real. ¿Se nombra ya un dueño para investigar opciones (sin construir nada), o se deja completamente congelado hasta que haya una fecha de negocio?**

*Por qué:* docs/plano/00-ACTA-24-DECISIONES.md PL-08 ('canal online... queda pendiente con dueño; no se construye todavía'); grep sin resultados de Culqi/POS/tarjeta en código real.

- **Nombrar un dueño solo para investigar y comparar opciones, sin construir nada aún (Recommended)** — Ganas: cuando llegue el momento de decidir, ya hay opciones comparadas en vez de partir de cero. Pagas: tiempo de una persona en algo que todavía no se usa.
- **Completamente congelado, cero investigación hasta que haya fecha de negocio** — Ganas: cero distracción del foco actual (registro fiel, mostrador). Pagas: cuando se decida construirlo, se empieza de cero sin ninguna comparación previa.

### PL-128 · Onboard doc

**docs/datos/12-ONBOARDING.md (D-01: 'onboarding en un día') sigue en V1: pide explicar `stock` vs `stock_almacen` (no existe en V2) y dice 'las migraciones crean 44 tablas' (hoy son 77 tablas y vistas). ¿Qué se hace con este documento antes de que llegue el séptimo integrante?**

*Por qué:* docs/datos/12-ONBOARDING.md:29-31,49-53 describe V1 (stock_almacen, 44 tablas) pese a D-01 (DECISIONES-2026-09-12.md) prometer onboarding en un día; docs/datos/07-GOBIERNO.md §8 aún lista pantallas V1 como 'rotas hoy'.

- **Reescribirlo a V2 ahora (Recommended)** — Ganas: el día 1 enseña el sistema real, no uno que ya no existe. Pagas: horas de un constructor (hoy solo 2 fijos) escribiendo documentación en vez de código.
- **Dejarlo y corregir de palabra al onboardear** — Ganas: cero costo de escritura hoy. Pagas: el nuevo pierde su mañana con un concepto que ya confundió a gente del equipo, según el propio CLAUDE.md.
- **Reemplazarlo por una sesión de IA guiada** — Ganas: no depende de mantener un archivo aparte. Pagas: el séptimo integrante necesita Claude Code desde el minuto uno, y las dudas de negocio real las responde peor un agente que Felipe o Dany.

### PL-129 · Sin Docker

**CONTRIBUTING.md exige 'Docker Desktop corriendo' como paso 1 del entorno local, pero Docker suele estar caído. Si el séptimo integrante llega un día así, ¿cuál es el camino oficial del primer día?**

*Por qué:* CONTRIBUTING.md:17 exige Docker Desktop; las memorias 'probar-ui-sin-base-de-datos' y 'postgres-desechable-sin-docker' registran que Docker cae con frecuencia y ya hubo que improvisar un camino alterno más de una vez.

- **Postgres desechable (Homebrew) como alternativa oficial (Recommended)** — Ganas: el primer día no se cae por una herramienta ajena al negocio; ya está probado por sesiones de Claude en este repo. Pagas: mantener dos caminos de entorno local documentados en vez de uno.
- **Modo solo lectura contra producción, sin escribir nada** — Ganas: cero riesgo sobre datos reales. Pagas: no se puede cumplir 'un cambio real de punta a punta' (D-01) ese mismo día.
- **Esperar a que Docker vuelva, sin camino alterno oficial** — Ganas: un solo camino que mantener. Pagas: el día 1 completo puede perderse por infraestructura, contra la promesa explícita de D-01.

### PL-130 · Padrino

**CONTRIBUTING.md:3 dice 'somos 5 personas' pero el mapeo de git muestra que solo Danytristee y Felipe firman de forma sostenida (859 de 875 commits recientes). ¿Quién es el mentor humano del séptimo integrante en su primera semana?**

*Por qué:* CONTRIBUTING.md:3 dice 'somos 5 personas'; el mapeo de git (síntesis 2026-09-21) mide que solo Danytristee (438) y Felipe (421) firman commits de forma sostenida, y Trix-One nunca firmó uno.

- **Danytristee o Felipe, asignado antes de que llegue (Recommended)** — Ganas: alguien con contexto real responde el 'por qué se decidió así' que ningún documento cubre. Pagas: resta horas de construcción a uno de los dos únicos constructores fijos esa semana.
- **Sin mentor fijo, pregunta quien esté libre** — Ganas: cero costo asignado. Pagas: con factor de autobús cercano a 1, puede no responder nadie a tiempo.
- **Un agente de IA guía primero, humano solo si no resuelve** — Ganas: casi no consume tiempo humano. Pagas: preguntas de negocio real las contesta peor un agente que alguien que vivió la decisión.

### PL-131 · Pájaro 7mo

**PL-09 (docs/plano/00-ACTA-24-DECISIONES.md) asignó pájaros a 3 personas ya en el equipo y dejó Pelícano, Gallito, Garza y Águila sin dueño. Para alguien que todavía no llega, ¿cómo se le asigna su primer pájaro?**

*Por qué:* docs/plano/00-ACTA-24-DECISIONES.md PL-09 y su pendiente #3 dejan Pelícano, Gallito, Garza y Águila sin dueño; docs/datos/07-GOBIERNO.md §1 no dice qué pájaro recibe alguien que todavía no llegó al equipo.

- **Felipe lo asigna antes de que llegue, sobre un `_libre_` con actividad real (Recommended)** — Ganas: entra sabiendo qué construye desde el día 1, sin pasar la semana 1 'buscando qué hacer'. Pagas: si el módulo no calza con lo que sabe hacer, hay que reasignar.
- **Él mismo elige entre los `_libre_` en su primera semana** — Ganas: motivación propia sobre el módulo elegido. Pagas: puede elegir el más visible/cómodo y dejar sin dueño los que más duelen (Pelícano/Compras, Gallito/Producción).
- **No lleva pájaro propio el primer mes, solo tareas sueltas supervisadas** — Ganas: menos riesgo de tocar el núcleo sin criterio. Pagas: contradice la semana 2 de 12-ONBOARDING.md ('trabajar en tu módulo sin preguntar por dónde empezar').

### PL-132 · Acceso git

**CONTRIBUTING.md:3 dice '5 personas con acceso de escritura' pero git muestra 8 identidades de autor distintas y `main` hoy no exige PR (PL-10 pendiente de activación). ¿Con qué nivel de acceso entra el séptimo integrante el día 1?**

*Por qué:* CONTRIBUTING.md:3,50 ('somos 5', 'main sin protección') contra PL-10 (PR+CI obligatorios, activación pendiente de que Felipe, único admin de GitHub, la accione).

- **Escritura directa a `main`, igual que el resto hoy (Recommended)** — Ganas: puede pushear su primer cambio el mismo día, cumpliendo D-01. Pagas: un séptimo par de manos empujando directo a `main` mientras PL-10 (PR+CI obligatorios) sigue sin activarse.
- **Solo lectura la primera semana; escritura tras su primer PR revisado** — Ganas: nadie nuevo rompe `main` en su primer día. Pagas: contradice D-01 ('un cambio real de punta a punta' el mismo día).
- **Acceso completo pero obligado a rama + PR desde ya, como piloto de PL-10** — Ganas: prueba la disciplina de PR con el integrante más nuevo antes de exigírsela a todos. Pagas: se siente como una regla distinta solo para 'el nuevo', mientras el resto sigue empujando directo.

### PL-133 · Auto-merge

**PL-10 decidió 'revisión humana solo para lo transversal (esquema, RLS, menu.ts, AppShell)', pero Felipe hoy fusiona 118 de 120 PR (mediana 9 minutos; el PR #243 con 86 archivos en 3 minutos). Sin reabrir PL-10: para un cambio NO transversal con CI verde, ¿quién ejecuta el clic de merge?**

*Por qué:* docs/plano/00-ACTA-24-DECISIONES.md PL-10 decide 'revisión humana solo para lo transversal' sin decir quién ejecuta el merge; hallazgo del mapeo: Felipe fusiona 118 de 120 PR, mediana 9.2 min, PR #243 (86 archivos) en 3 minutos.

- **La propia sesión de IA lo fusiona si CI está verde y no toca zona transversal (Recommended)** — Ganas: descarga a Felipe de fusiones triviales sin contradecir PL-10, que ya no exige revisión humana ahí. Pagas: exige definir por escrito qué es 'transversal' con precisión — hoy son solo 4 ejemplos sueltos en la acta.
- **Solo un humano fusiona, incluso con CI verde y sin tocar zona transversal** — Ganas: ningún cambio llega a `main` sin que un humano lo haya visto, aunque sea 30 segundos. Pagas: Felipe sigue siendo el cuello de botella de 118 de 120 fusiones.
- **Autofusión total, sin distinguir transversal o no** — Ganas: máxima velocidad. Pagas: contradice PL-10 tal como está escrito: si la revisión humana es 'solo para lo transversal', implica que ahí sí hace falta un humano.

### PL-134 · Fix CLAUDE

**La acta PL deja el pendiente #6 sin dueño: 'Corregir CLAUDE.md y AGENTS.md (sedes/personas, Nubefact, cifras) — por asignar'. Son los dos archivos que lee primero el 96% de los commits asistidos por IA. ¿Puede cualquier sesión de IA corregirlos por su cuenta, sin pedir OK antes?**

*Por qué:* docs/plano/00-ACTA-24-DECISIONES.md, 'Pendientes que nacen de esta acta' #6: 'Corregir CLAUDE.md y AGENTS.md — por asignar'; docs/datos/07-GOBIERNO.md §6 documenta el costo real de que dos sesiones editen el mismo documento en paralelo sin saberlo (2026-09-12).

- **Sí, cualquier sesión lo corrige y abre PR sin pedir OK antes (Recommended)** — Ganas: se arregla ya —es reversible en minutos— y cada hora que sigue mal miente a la siguiente sesión que lo lea primero. Pagas: si dos sesiones lo corrigen a la vez puede repetirse el choque de 07-GOBIERNO.md §6 (dos sesiones escribiendo la misma documentación en paralelo).
- **Se asigna a una sola sesión con dueño nombrado antes de tocarlo** — Ganas: cero choque entre dos correcciones a la vez. Pagas: mientras nadie lo asigna, CLAUDE.md sigue enseñando sedes/personas y Nubefact a cada sesión nueva.
- **Solo Felipe lo edita, porque define el tono y vocabulario del repo** — Ganas: una sola voz para todo el repo. Pagas: es el único de los 6 pendientes de la acta sin riesgo real de dinero o esquema, y aun así se frena con el mismo cuello de botella que todo lo demás.

### PL-135 · AGENTS.md

**AGENTS.md (la copia para Codex) dice 28 tablas (CLAUDE.md dice 77), manda correr `pnpm datos:generar` a secas —el comando que CLAUDE.md prohíbe porque pisa el diccionario con la foto local— y no tiene las reglas de modales (ADR-0136) ni de loader (ADR-0149). ¿Se declara un solo agente oficial o se mantienen los dos sincronizados?**

*Por qué:* AGENTS.md:77 dice 28 tablas contra las 77 de docs/datos/generado/DICCIONARIO-RETAIL.md; AGENTS.md:166 manda `pnpm datos:generar` a secas, el comando que docs/datos/generado/COMO-REFRESCAR.md y CLAUDE.md señalan como el que pisa el diccionario con la foto local.

- **Un solo agente oficial (Claude Code); AGENTS.md pasa a 3 líneas que apuntan a CLAUDE.md (Recommended)** — Ganas: una sola fuente de verdad para cualquier sesión de IA, sin importar qué herramienta abrió el repo. Pagas: quien use Codex pierde cualquier instrucción propia de esa herramienta que hoy viva solo en AGENTS.md.
- **Ambos conviven, pero un script en CI genera AGENTS.md desde CLAUDE.md** — Ganas: neutralidad de herramienta, nunca vuelven a divergir. Pagas: construir y mantener el generador.
- **Se corrige AGENTS.md a mano ahora (28→77, quita el comando peligroso) y sigue aparte** — Ganas: arregla el riesgo más urgente hoy mismo. Pagas: vuelve a divergir en semanas, como ya pasó desde que se creó.

### PL-136 · Tablero IA

**docs/SESIONES-ACTIVAS.md nació el 2026-09-17 para evitar colisiones y volvió a fallar: 4 ramas sobre `/colaboradores` el mismo día, 'familia como tabla propia' construida dos veces (ADR-0103), y PLAN-PRODUCCION/ADR-0133 reescrito dos veces el mismo día. ¿Se refuerza el mismo mecanismo o se reemplaza?**

*Por qué:* docs/SESIONES-ACTIVAS.md:5 nace del incidente 2026-09-17 (6 colisiones de ADR, 2 migraciones con mismo timestamp, una función construida dos veces) y el mismo patrón se repitió: 4 ramas sobre /colaboradores en un día, ADR-0103, y PLAN-PRODUCCION/ADR-0133 reescrito dos veces.

- **Reforzar lo mismo: obligar a leerlo al abrir sesión (Recommended)** — Ganas: cierra el hueco real —hoy CLAUDE.md (la raíz del repo) ni siquiera lo menciona, solo manda `git status --short`— sin construir nada nuevo. Pagas: sigue dependiendo de que cada sesión lo respete; ya falló varias veces con la regla actual.
- **Reemplazarlo por `gh pr list` con etiqueta de pájaro** — Ganas: nunca queda desactualizado, GitHub lo cierra solo al fusionar el PR. Pagas: pierde el detalle de 'qué archivos toca' que hoy sí tienen las filas de SESIONES-ACTIVAS.
- **Script de reserva (`pnpm pajaro:reservar`) que bloquea el mismo pájaro a una segunda sesión** — Ganas: colisión imposible por diseño, como ADR-0034 hizo con las migraciones. Pagas: construir y mantener el script; una sesión que olvida liberar bloquea a las demás.

### PL-137 · Aviso choque

**SESIONES-ACTIVAS.md:10 dice 'si ves que alguien ya está tocando lo mismo: para y coordina, no asumas que no va a chocar', pero no dice cómo — no hay canal escrito de aviso al pájaro. ¿Cómo coordina en la práctica una sesión que detecta el choque?**

*Por qué:* docs/SESIONES-ACTIVAS.md:10 ('para y coordina, no asumas que no va a chocar') no dice canal ni plazo; no existe CODEOWNERS ni plantilla de PR en .github/.

- **Comentario en el PR de la otra sesión (o fila nueva en SESIONES-ACTIVAS) y sigue si de verdad no se solapan archivos (Recommended)** — Ganas: no frena a nadie cuando el choque es solo aparente. Pagas: exige buen juicio para saber si 'de verdad no choca' — la sesión de familias creyó eso y sí chocó (ADR-0103).
- **Se detiene por completo y espera el OK de Felipe** — Ganas: cero riesgo de duplicar trabajo. Pagas: con ~20 sesiones de IA en paralelo, Felipe se vuelve árbitro de cada choque menor.
- **Sigue igual, se resuelve recién al fusionar** — Ganas: nadie espera. Pagas: es el patrón que ya costó más caro que escribir la documentación dos veces, según 07-GOBIERNO.md §6.

### PL-138 · Límite paral

**Los archivos transversales sin pájaro (types.ts: 95 commits de 2 autores, AppShell.tsx: 41, package.json: 32, globals.css: 32, ci.yml: 28) concentran los choques reales. ¿Se limita cuántas sesiones los tocan a la vez?**

*Por qué:* Archivos con más choque medido desde 2026-09-14: packages/database/src/types.ts 95 commits (2 autores), apps/web/components/AppShell.tsx 41, package.json 32, apps/web/app/globals.css 32, .github/workflows/ci.yml 28; ninguno tiene pájaro propio en docs/datos/07-GOBIERNO.md §1.

- **Uno a la vez por archivo transversal, avisado en SESIONES-ACTIVAS (Recommended)** — Ganas: ataca el choque medido (types.ts con 95 commits de choque). Pagas: una sesión larga bloquea ese archivo para las demás mientras dura.
- **Sin límite, como hoy** — Ganas: cero fricción. Pagas: es la causa medida de 49 commits de reparación de numeración desde el 2026-09-01.
- **Dueño humano fijo por archivo transversal, revisa todo cambio ahí** — Ganas: un humano ve cada cambio al recurso más compartido. Pagas: cuello de botella nuevo sobre alguien que ya lleva varios pájaros (Felipe lleva 4 por PL-09).

### PL-139 · Limpiar tabl

**SESIONES-ACTIVAS.md:12 dice 'al día siguiente, Cerradas hoy se limpia', pero conserva filas desde el 2026-09-17 y 9 de sus 10 ramas 'activas' ya no existen en `origin`. ¿Quién limpia y con qué disparador?**

*Por qué:* docs/SESIONES-ACTIVAS.md:12 ('al día siguiente, Cerradas hoy se limpia') incumplido: filas desde 2026-09-17 siguen en 'Activas ahora', y 9 de 10 ramas 'activas' ya no existen en origin; PL-09 ya asigna Gorrión a Felipe.

- **Felipe (dueño de Gorrión, PL-09) limpia semanalmente, y cualquier sesión mueve sola una fila con rama inexistente (Recommended)** — Ganas: la limpieza deja de depender de que alguien se acuerde por su cuenta; mover una fila de estado es reversible en segundos. Pagas: una tarea semanal más sobre quien ya lleva 4 pájaros.
- **Automatizado: CI marca 'posiblemente cerrada' si la rama no existe en origin** — Ganas: nunca depende de la memoria de una persona. Pagas: construir y mantener el script de verificación.
- **Se acepta que crezca, se relee entero cada sesión como pide hoy la regla** — Ganas: cero trabajo nuevo. Pagas: ya es ilegible (39 KB, filas de miles de caracteres) y la regla de limpieza lleva semanas incumplida.

### PL-140 · Recortar doc

**docs/BACKLOG.md (5.455 líneas, 473 KB) promete en su propia cabecera 'máx. 3 ítems por cubo' y hoy tiene 307 casillas abiertas; docs/BITACORA.md (8.697 líneas, 745 KB) los tocan 568 y 664 de 1.307 commits recientes. ¿Qué política de recorte se adopta?**

*Por qué:* docs/BACKLOG.md:3-4 promete 'Máx. 3 ítems por cubo' y hoy tiene 5.455 líneas / 473 KB con 307 casillas abiertas; docs/BITACORA.md tiene 8.697 líneas / 745 KB; PL-14 ya archivó la documentación V1 con el mismo patrón que aquí se propone.

- **Archivar lo anterior al corte V2 a docs/historico/ y arrancar versiones cortas, recortadas con /backlog (Recommended)** — Ganas: vuelven a leerse en minutos; mismo patrón que PL-14 ya eligió para el resto de la documentación V1. Pagas: se pierde la continuidad de un solo archivo con todo el historial junto.
- **BITÁCORA por mes, BACKLOG recortado semanalmente con /backlog** — Ganas: BITÁCORA nunca vuelve a crecer sin tope. Pagas: BACKLOG puede seguir creciendo si nadie corre /backlog a tiempo.
- **Sacarlos del repo a GitHub Issues/Projects por pájaro** — Ganas: fin de los conflictos de merge que hoy generan. Pagas: las sesiones de IA hoy leen archivos del repo directamente, no Issues — hay que enseñarles el cambio.

### PL-141 · Examen equip

**.claude/skills/examen/SKILL.md dice literalmente 'hazle a Felipe 3 preguntas' — hoy solo se usa con él. ¿Se extiende a Danytristee, Cuervo y futuros integrantes cuando cierran su propio pájaro?**

*Por qué:* .claude/skills/examen/SKILL.md:6 dice literalmente 'hazle a Felipe 3 preguntas'; el mapeo mide que solo 2 personas construyen de forma sostenida y 96% de los commits los asiste IA, sin verificación de comprensión fuera de Felipe.

- **Sí, con quien cierre su módulo, no solo Felipe (Recommended)** — Ganas: verifica comprensión real en todo el equipo, no solo en el CEO — con solo 2 constructores fijos y 96% de commits asistidos por IA, nadie más comprueba qué entendió el otro. Pagas: reescribir la skill; examinar entre pares puede sentirse distinto que viniendo de Felipe.
- **No, se queda exclusiva de Felipe** — Ganas: cero cambio, cero fricción social. Pagas: el resto del equipo construye módulos sin que nadie verifique si entendieron el porqué de las decisiones.
- **Versión corta (2 preguntas) para el equipo, completa (3) para Felipe** — Ganas: diferencia el nivel esperado por rol. Pagas: dos versiones de la misma skill que mantener sincronizadas.

### PL-142 · Conceptos

**La skill /examen promete anotar lo que falló en 'Conceptos pendientes de enseñar' en /docs/BACKLOG.md, pero esa sección no existe hoy en el archivo (verificado por búsqueda directa). ¿Se crea o se cambia la skill?**

*Por qué:* .claude/skills/examen/SKILL.md:15-16 promete anotar en 'Conceptos pendientes de enseñar' en /docs/BACKLOG.md; una búsqueda directa sobre docs/BACKLOG.md no encuentra esa frase en ningún lado.

- **Se crea la sección ahora, con el mismo tope de 3 ítems que el resto de BACKLOG (Recommended)** — Ganas: la skill vuelve a decir la verdad la próxima vez que se corra. Pagas: un cubo más que vigilar en un archivo que ya se está recortando.
- **Se cambia la skill para anotar en BITÁCORA en vez de una sección nueva** — Ganas: no crea una sección más que mantener. Pagas: el concepto pendiente se pierde entre miles de líneas de BITÁCORA en vez de vivir en un solo lugar visible.
- **Se retira esa promesa; el examen queda solo en la conversación** — Ganas: la skill se simplifica. Pagas: contradice el principio 8 de CLAUDE.md ('nunca vive solo en una conversación de chat') y pierde su efecto de mejorar la documentación con el tiempo.

### PL-143 · Cuándo exam

**PL-03 define 'terminado' como pantalla + permiso + candado + diccionario + una sede operándolo un ciclo completo — pero no menciona verificar comprensión. ¿En qué momento se corre /examen sobre un módulo del equipo?**

*Por qué:* docs/plano/00-ACTA-24-DECISIONES.md PL-03 define 'terminado' sin mencionar verificación de comprensión; .claude/skills/examen/SKILL.md dice 'úsala al cerrar un módulo o cuando lo pida' sin fijar cuál de las dos.

- **Al cerrar un módulo según las condiciones de PL-03 (Recommended)** — Ganas: nunca se cierra un pájaro sin que alguien demuestre que entendió por qué se construyó así — engancha con la definición de 'terminado' que ya fijó PL-03. Pagas: un paso más en un ciclo de cierre que ya es largo.
- **Solo cuando alguien lo pide, sin disparador fijo, como hoy** — Ganas: cero fricción. Pagas: con PR fusionados en mediana de 9 minutos sin revisión (PL-10), es probable que nunca se agende por su cuenta.
- **Mensual, sobre un módulo que elige Felipe, esté o no cerrado** — Ganas: ritmo predecible. Pagas: puede caer sobre un módulo a medio construir, donde examinar todavía no tiene mucho sentido.


## Eliminadas por repetir algo ya decidido

- **Consumo tela** (FRENTE 1 — El negocio real: flujos de ti…): Ya decidido en memory/cayla-decisiones-60-preguntas-2026-09.md, Bloque 10 (2026-09-21): 'Costo de la prenda del Taller: automático desde los insumos consumidos en la orden (+ mano de obra del modelo + maquila real)', confirmado en Bloque 15 como parte de la Ola 2 ('Taller: costo automático + vista por negocio'). La pregunta asumía que el costo del Taller seguía tecleado a mano y preguntaba cuándo exigir el consumo real — Felipe ya decidió que se conecta y es automático.
- **Reserva CTS** (FRENTE 1 — El negocio real: flujos de ti…): La propia pregunta se plantea como 'revisita parcial de PL-08', y PL-08 (docs/plano/00-ACTA-24-DECISIONES.md) ya decidió que Contabilidad completa (partida doble, PLE, estados financieros — lo que cubriría cualquier reserva formal de gratificación/CTS/renta) queda pausada y no se construye todavía ('Urraca queda en pausa'). Su propia opción recomendada ('Nada todavía: PL-08 ya decidió que Contabilidad completa espera... coherente con lo ya decidido') confirma que no hay decisión nueva pendiente, solo repregunta lo mismo con otras palabras.
- **Solo lectura** (FRENTE 2: Glosario y vocabulario canónic…): Ya decidido en cayla-finalidad-y-plano-2026-09.md: al detallar qué vería cada rol, el propio texto usa 'Solo lectura (contador) vería solo Finanzas' — es decir, ya fija 'Solo lectura' como el término de trabajo, con 'contador' como aclaración entre paréntesis y no como el nombre que reemplaza al término técnico. La pregunta reabre exactamente esa elección ya hecha.
- **Dynamic glos** (FRENTE 2: Glosario y vocabulario canónic…): Duplica PL-15 de docs/plano/00-ACTA-24-DECISIONES.md, que ya decidió explícitamente el formato: 'DECIDÍ: glosario de 3 columnas (negocio ↔ pantalla ↔ base)'. La propia pregunta se etiqueta como 'revisita puntual de PL-15' para agregar una 4ª columna, pero el número de columnas del glosario ya es una decisión cerrada, no un hueco abierto — el lugar para anotar la trampa LIM/003 (00-MAPA.md/ADR-0097) no requiere reabrir el formato que PL-15 fijó.
- **Asesora** (FRENTE 2: Glosario y vocabulario canónic…): Ya decidido y en uso constante: cayla-decisiones-60-preguntas-2026-09.md, Bloque 5 ('Bloque 5 — asesora y desempeño'), fija explícitamente 'Cada venta lleva una asesora (referencia de quién atendió)', y el término 'asesora' se repite como palabra canónica en los Bloques 5 a 13 del mismo documento (métricas por asesora, bonificación, dotación por turno, etc.) sin ninguna duda ni alternativa planteada. No queda nada por decidir aquí.
- **Middleware** (FRENTE 3: arquitectura y el contrato con…): No repite literalmente ninguna decisión de PL-01..PL-24 ni de las dos memorias — es deuda técnica genérica de Next.js sin dueño, no una decisión sobre el contrato con Dynamic. Se descarta para respetar el tope de 16: de las 17 preguntas del banco es la que menos pertenece al frente 'arquitectura y contrato con Dynamic' (middleware.ts no interactúa con la identidad/rol/datos de Dynamic) y la de menor peso arquitectónico frente a las demás (seguridad de escritura directa en ventas, tablas huérfanas de producción, ADR de seguridad sin fusionar, guardarraíl de PL-07, restore de backups, 83 archivos de permisos duplicados), que sí exigen una decisión estructural con Ganas/Pagas real.
- **D48Puntos** (FRENTE 4: Modelo de datos e invariantes …): La pregunta asume que 'falta la mecánica' de D-48 y propone diseñar un sistema de puntos y canjes desde cero. Pero Felipe ya decidió la mecánica el 2026-09-21 (posterior al acta de D-48 que la pregunta cita): 'SIN puntos por ahora' — ficha viva con talla guardada, cumpleaños, aviso de 'llegó tu talla', ajuste de taller y cambio sin fricción; niveles, saldo a favor y referidas quedan explícitamente pospuestos a cuando haya meses de ventas con DNI y validación del contador. Ver cayla-decisiones-60-preguntas-2026-09.md, Bloque 9 ('Fidelización: ficha viva y trato, SIN puntos por ahora') y la sección 'Investigación 2026-09-21' ('Fidelización: empezar sin puntos'). El candado de saldo≥0 que la pregunta pide diseñar no aplica a una mecánica que no tiene puntos.
- **TucanEsq** (FRENTE 4: Modelo de datos e invariantes …): PL-06 (00-ACTA-24-DECISIONES.md) ya decidió que el censo físico con fecha de corte 'queda para después, cuando TRU ya esté operando', sin censo formal por ahora ('la mercadería sigue entrando poco a poco, sin censo formal'), con la fecha exacta como pendiente explícito a cargo de Felipe (tabla de pendientes de PL-06, ítem 4). Esto se confirma en cayla-decisiones-60-preguntas-2026-09.md, Bloque 1: 'Sin censo formal por ahora: la mercadería se mete poco a poco y se da boleta; se corrige sobre la marcha. Lechuza baja de prioridad.' La disyuntiva que plantea la pregunta (esperar a que se levante la pausa de Tucán/Golondrina vs. construir ya un esquema mínimo) ya no aplica: el censo no arranca ahora en ningún caso, independientemente del estado de esos dos pájaros.
- **Rol contador** (Identidad y permisos (FRENTE 5)…): Ya decidido en cayla-decisiones-60-preguntas-2026-09.md, Bloque 3 (2026-09-21): 'El contador no usa Alegra: jala todo desde SUNAT... Sin rol de contador, paquete mensual ni libros electrónicos por ahora'. Es literalmente la opción recomendada de esta pregunta ('No construirlo todavía — el contador jala de SUNAT, no entra al sistema'), ya resuelta por Felipe.
- **Config quién** (Identidad y permisos (FRENTE 5)…): Ya decidido en cayla-finalidad-y-plano-2026-09.md: tras listar qué vería Admin (incluida 'Configuración completa y Salud del sistema'), el documento cierra con 'nada de eso se construye antes de tener el rol'. Eso responde directamente 'quién las ve mientras tanto': nadie, porque no se construyen — coincide con la opción recomendada de la pregunta.
- **Vista Admin** (Identidad y permisos (FRENTE 5)…): Mismo pasaje de cayla-finalidad-y-plano-2026-09.md ('nada de eso se construye antes de tener el rol') cubre también la vista de Inicio de Admin (3 tiendas + Taller) que esta pregunta plantea construir ya con hardcode temporal — ya descartado por Felipe a favor de esperar a que el rol exista.
- **PruebaUI** (FRENTE 6: Pantallas y principios de prod…): Ya decidido en cayla-decisiones-60-preguntas-2026-09.md, Bloque 15 (cierre de la ronda, 2026-09-21): 'evidencia en navegador + suite existente, con revisión extra mía en lo crítico (dinero/candados)'. Es exactamente la respuesta a 'con qué mínimo se verifica una pantalla nueva antes de fusionar, más allá de compilar/lint' — coincide palabra por palabra con la opción recomendada de la pregunta (verificación manual con clics + captura/evidencia en navegador).
- **HoraPunta** (FRENTE 6: Pantallas y principios de prod…): Repite la disposición ya fijada en cayla-decisiones-60-preguntas-2026-09.md, Bloque 12: 'Hora punta con doble digitación: Felipe respondió «por ahora solo estamos entrando a piloto»: sin regla; se decide con lo observado'. Felipe ya declinó fijar de antemano una regla general para los choques de velocidad/candados en hora punta. Además, entre las 18 preguntas del banco es la de 'por_que' más débil: cita 'sintesis.md, sección 3... aún abierta' sin línea concreta, a diferencia de todas las demás que anclan en archivo:línea específico.
- **Series B00x** (Frente 7 — Integraciones externas y "tod…): Repite, con otras palabras, una decisión ya tomada: Bloque 12 de cayla-decisiones-60-preguntas-2026-09.md ya fija 'series propias de retail por tienda (Alegra conserva las suyas hasta apagarse; series compartidas cruzan la numeración)'. La pregunta solo pide confirmar esa misma política con los números concretos (B004/B005/B006) y que el Taller no emite, lo cual ya se desprende de D-31 — no introduce una decisión distinta pendiente.
- **Turno LIM** (Frente 7 — Integraciones externas y "tod…): Grounding débil frente al resto del banco tras quitar la duplicada: el 'por_que' se apoya sobre todo en el archivo de memoria de Felipe (no en el repo) y en un grep sin resultados de una función que aún no existe, sin ninguna línea de código concreta que sostenga el hueco — se recorta para bajar de 18 a 16 preguntas priorizando las mejor ancladas.
- **Kiosk activo** (Frente 7 — Integraciones externas y "tod…): La más débil en 'por_que' del banco: solo nombra dos archivos de documentación sin citar ninguna línea ni ruta de código concreta dentro del repo — se recorta para bajar de 18 a 16 preguntas priorizando las mejor ancladas.
- **Pegar SQL IA** (FRENTE 8 — Equipo, gobierno operativo, c…): Ya decidido: cayla-decisiones-60-preguntas-2026-09.md, Bloque 15, dice explícitamente 'Confirmó: ... ningún agente aplica SQL a producción (los agentes preparan el .sql, Felipe aprueba, el arquitecto lo aplica con ensayo)'. Esto responde casi textualmente la opción recomendada de la pregunta ('Sí cuenta, si Felipe da el OK explícito'): los agentes en segundo plano nunca pegan SQL; solo el arquitecto (esta misma sesión), con OK previo de Felipe y ensayo obligatorio, sí lo hace. La pregunta repite, con otras palabras, algo que Felipe ya confirmó.
- **Leer complet** (FRENTE 8 — Equipo, gobierno operativo, c…): El banco tenía 18 preguntas, 2 por encima del máximo de 16. No está decidida en ningún documento de referencia, pero es la de grounding más débil del lote: su 'por_que' no cita una línea exacta de CLAUDE.md (solo nombra la sección 'Ritual de sesión') y reutiliza sin evidencia propia las mismas cifras de tamaño (~14.000 líneas) que ya sustentan la pregunta 'Recortar doc', sin aportar un hueco concreto adicional del repo. Se recortó por ser la más débil, no por estar ya decidida.


## Eliminadas por solaparse entre frentes

- **CCO pantalla** (FRENTE 2: Glosario y vocabulario canónic…): Es la misma decisión que "CCOesquema" (FRENTE 4): ambas citan exactamente D-20/D-32, el constraint ubicaciones.tipo (solo tienda/almacen/taller) y gastos.ubicacion_id NOT NULL como el obstáculo para registrar el gasto de CCO. "CCO pantalla" solo pregunta 'qué palabra ve el colaborador', pero esa palabra es consecuencia directa de cómo se modele CCO — no se puede responder sin resolver primero la pregunta de FRENTE 4, que además es más completa (nombra los gastos concretos: sueldo de Felipe, contador, servidores, software) y ataca la causa, no el síntoma. Se conserva "CCOesquema" (FRENTE 4).
- **ADR0119ya** (FRENTE 4: Modelo de datos e invariantes …): Es la misma decisión que "Hueco RLS" (FRENTE 5): ambas describen el mismo hueco de seguridad —ventas, venta_items, devoluciones y devolucion_items aceptan escritura directa sin pasar por registrar_venta— con la misma urgencia (TRU en vivo esta semana), y preguntan en el fondo si se cierra ahora. "Hueco RLS" está mejor formulada: cubre una tabla más (venta_anulacion_items, verificada contra producción viva) y plantea la decisión con una alternativa concreta (cerrar esta semana vs. dejarlo abierto con fecha) en vez de un sí/no plano. Además el tema —GRANT/RLS— pertenece más al frente de permisos que al de modelo de datos. Se conserva "Hueco RLS" (FRENTE 5).
- **Ver costos** (Identidad y permisos (FRENTE 5)…): Es la misma decisión que "CostoVisib" (FRENTE 4): ambas parten de D-27 ('transparencia total') y del mismo dato (16 colaboradoras hoy, más que cuando se decidió) para preguntar si se mantiene el costo/margen visible a cualquier sesión autenticada. "CostoVisib" está mejor formulada: nombra la función exacta (fn_productos.costo), agrega el caso paralelo de las cuentas bancarias de proveedores, cita el precedente ya resuelto en Compras (ADR-0126) y el aplazamiento explícito (ADR-0134), y ofrece la alternativa concreta ('¿seguimos posponiendo, o cerramos el costo de prenda igual que se cerró Compras?'). Se conserva "CostoVisib" (FRENTE 4).
- **Dueño doc** (Frente 7 — Integraciones externas y "tod…): Es la misma decisión que "Fix CLAUDE" (FRENTE 8): ambas citan el mismo pendiente #6 de la acta PL-15 (corregir CLAUDE.md/AGENTS.md, sin dueño asignado, leídos primero por el 96% de los commits asistidos por IA). "Fix CLAUDE" encaja mejor en su frente (gobierno y coordinación de IA, que es justo el tema) y hace la pregunta más accionable —¿puede cualquier sesión de IA corregirlos por su cuenta, sin pedir OK?— en vez de la más abierta 'quién lo hace y cuándo'. Se conserva "Fix CLAUDE" (FRENTE 8).
