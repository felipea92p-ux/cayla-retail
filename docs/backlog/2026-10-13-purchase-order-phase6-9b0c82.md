## Compras ▸ fase 6 de las órdenes de compra: fondo por rendir y gastos del viaje (2026-10-13) — rama `claude/purchase-order-phase6-9b0c82`

ADR-0362 (decisiones 16, 20, 26, 29, 30, 32–35, 46, 54–57 y 65–76). Lista de 8 actividades aprobada por Felipe el 2026-10-13; el
2026-10-14 la de contabilidad se partió en dos y quedaron 9 (decisión 73). PR #1055
(borrador). Con la autorización de Felipe de esa noche, cada actividad se sube y sus migraciones se pegan en producción al cerrarla (no se
fusiona).

- [x] Actividad 1 · base del fondo y Compras ▸ Fondos por rendir (`20261013181000`, `20261013182000`). En producción.
- [x] Actividad 2 · pagar desde «Mi fondo» (`20261013212000`). En producción.
- [x] Actividad 3 · gastos del viaje (`20261013221000`, `20261013222000`). En producción.
- [x] Actividad 4 · «Tu fondo» en Órdenes de compra y en el Inicio (`20261013231000`). En producción.
- [x] Actividad 5 · rendición (`20261013233000`, `234000` —bucket y políticas, solas— y `235000`): rendir, aprobar (faltante asumido →
  6599 o deuda → 1419), devolver o retirar, lo rendido congelado y las fotos de los gastos del viaje. En producción.
- [ ] Felipe (actividad 5, provisional): un sobrante no se rinde; 1419 y 6599 hasta el contador; la dueña puede retirar su rendición; el
  tablero cuenta el faltante dentro de «Gastó». La deuda se ve y, desde la actividad 7, se salda cuando la persona devuelve la plata.
- [x] Actividad 6 · lo «no deducible» (`20261014002000`, decisiones 55, 56, 57, 68 y 70): la regla de la bancarización y el tope de la
  planilla de movilidad (parámetro tributario con vigencias, en Configuración ▸ Impuestos; vacío hasta el contador), el aviso en todas
  las formas de pagar a un proveedor y la marca en la rendición, «Traerla costó» y los pagos de un comprobante. En producción.
- [ ] Felipe (actividad 6, provisional): en «Pagar juntos» el aviso dice «hasta S/ X» si no todos los comprobantes son grandes; la persona
  del tope es quien registró la planilla; un comprobante con nota de crédito se mira por su total original. El tope de la planilla lo
  tiene que fijar el contador (mientras no haya, nada se marca por la planilla).
- [x] Actividad 7 · saldar la deuda de un faltante (`20261014145000`, decisiones 54 y 71): «Registrar su pago» en Fondos por rendir (lo
  registra quien recibe la plata; la más vieja primero; se anula con su motivo) y la 1413 y la 1419 por dos caminos en «¿Cuadra?» del
  Balance. En producción. Nada de descontar del sueldo (71).
- [ ] Felipe (actividad 7, provisional): la deuda se paga a un banco, una caja fuerte o al líder (no a un cajón); una deuda no se perdona
  desde el sistema después de aprobada.
- [x] Actividad 8 · el IGV (`20261014153000`, decisiones 56, 70 y 72): la factura con RUC de un gasto del viaje va al crédito fiscal (la
  hoja dice cuánto IGV se descuenta, o por qué no) y el IGV de lo pagado en efectivo o desde un fondo se pierde en el mes del PAGO, igual
  en Impuestos (crédito, «Para revisar», registro de compras y resumen para el contador), el Diario (64 contra 4011) y el Balance. En
  producción; ningún mes ya declarado cambió (en producción no había IGV perdido en ningún mes).
- [ ] Felipe y el contador (actividad 8, provisional): el IGV perdido va a la 64; el ticket no da crédito; la factura de un gasto del
  viaje va al registro sin razón social si ningún proveedor tiene su RUC; con nota de crédito, la proporción se calcula sobre el total
  original de la factura.
- [x] Finanzas ▸ Gastos dice «Sin comprobante» (y «Sin proveedor») en un gasto del viaje con factura, junto a su IGV: `fn_gastos_lista`
  solo mira `compras` y el papel vive en `gastos_viaje`. Viene de la actividad 3. Lo arregló la sesión «Finanzas ▸ Gastos: el papel real
  del gasto del viaje» (`5ce8bb965`, traído con cherry-pick) y su migración `20261014164000` está en producción con el OK de Felipe.
- [x] Finanzas ▸ Gastos llamaba «IGV descontable» a un IGV perdido por pagar sin banco: lo hizo la sesión «Decir en Gastos cuándo el IGV
  de una factura se perdió» (chip `task_9e4c3306`) con lo que Felipe eligió el 2026-10-14, y entró con cherry-pick (`a079c035d`): la
  decisión 76 del ADR, la migración `20261014174000` y `pruebas:gastos-igv-perdido`.
- [x] Producción: `20261014174000` pegada con el OK de Felipe (2026-10-14 ~14:14, como `20261014191419`): el ancla de `fn_gastos_panel`
  contada antes (una vez, huella `c8b2c412…`) y, después, las tres funciones con la misma huella y los mismos permisos que el banco. Los 3
  cambios de `/formidable` de Gastos y la tarjeta que nunca dice un negativo (Felipe los aprobó en esa sesión) entraron con cherry-pick
  (`4ba53b3a5`), sin cambios en la base.
- [x] Hoja del gasto del viaje (decisión 74, Felipe 2026-10-14): solo la orden desde la que se abrió; las demás con «+ Agregar otra
  orden» (el combo con buscador) y cada una con su «×». Probado en el banco a 1280 y 375 px, con el teclado (Enter elige, Escape vuelve
  al botón sin cerrar la hoja) y abriéndola desde la lista (ninguna orden: «+ Agregar una orden»).
- [x] Al menos una orden (decisión 75, Felipe 2026-10-14): la «×» sale solo con dos o más órdenes; abierta desde la lista, la orden es lo
  que falta; la base frena un gasto sin orden (`20261014170000`, `gasto_viaje_sin_orden`). Pruebas de base: gastos-viaje 12/12 (con el
  rechazo), igv-fase6 4/4, no-deducible 5/5 y deuda-fondo 4/4 (ahora registran sus gastos con una orden).
- [x] Producción: `20261014170000` pegada con el OK de Felipe (2026-10-14 ~11:35, como `20261014163520`): ancla contada antes (una vez) y,
  después, `registrar_gasto_viaje` con la misma huella que el banco y los mismos permisos.
- [ ] Actividad 9 · cierre: `tema:auditar`, `guias:recorrer`, `/chaos` con plata y `/formidable`.
  - [x] `tema:auditar` (2026-10-14, banco `cayla-oc`, `localhost:3048`): Fondos por rendir y sus cuatro hojas, Órdenes de compra con la hoja
    del gasto del viaje (y su combo abierto) y «Rendir», una orden con «Traerla costó», Impuestos, Gastos, Configuración (con el tope de la
    planilla) y el Inicio, como líder; el Inicio y Órdenes de compra como integrante. **0 hallazgos solo en oscuro.** Heredados del claro,
    ninguno de la fase 6: las campañas pasadas de Configuración ▸ Tiendas y caja, el cargador global y la nota de un título de grupo
    (tarea aparte `task_16231c3d`). Los escenarios nuevos quedan en `tema/escenarios/registro.mjs`; «Revisar» una rendición va solo por id
    (necesita una por aprobar).
  - [x] `guias:recorrer` (2026-10-14, banco, como líder): Fondos por rendir, Órdenes de compra, una orden, Impuestos, Gastos, el Inicio y
    Configuración en escritorio, y las de Compras y el Inicio a 375 px: cada paso encontró su pieza, ninguna escribió en la base y no
    quedó nada abierto. Capturas miradas; el paso de los movimientos de Fondos ahora se titula como su sección («…y pagos de deuda»).
  - [x] `/chaos` con plata (2026-10-14, banco `cayla-oc`, semilla 1014, 12 del núcleo + 8 sorteados; tablero en `docs/chaos/README.md`,
    informe local en `.chaos/`). Resistieron el doble clic, recargar al guardar, la red cortada, el Tab, cerrar a mitad del guardado, los
    permisos de la API y 11 carreras entre dos cuentas sobre el mismo fondo (y una ráfaga de 8 sesiones): el candado por persona los pone
    en fila y las invariantes del fondo quedan limpias. El banco quedó idéntico a su foto.
  - [ ] Felipe: los hallazgos de `/chaos` (ninguno se arregló todavía):
    - [ ] (g1) `entregar_fondo` y `registrar_gasto_viaje` guardan un monto «NaN» que llega por la API, y un NaN deja en NaN el fondo, la
      caja de origen, la 1413 y el Diario. No es solo de la fase 6 (`registrar_movimiento_dinero` también). Arreglo de raíz: candado en
      las tablas de dinero, como `ventas_montos_validos` (migración).
    - [ ] (g1) Mismo token con otro contenido: si la respuesta se pierde y la persona corrige el monto antes de reintentar, la base guarda
      lo primero y la hoja anuncia lo nuevo (Entregar: guardó S/ 40 y dijo S/ 90; Rendir: guardó 380 sin faltante y ella había corregido a
      350). Las cinco funciones del fondo no usan «el token sigue al contenido» (`fn_intento_con_huella`, 20261013200000).
    - [ ] (g2) La coma decimal: «1299,50» se lee S/ 129,950.00 y «150,5», S/ 1,505.00 en Entregar y en el gasto del viaje (`leerMonto` borra
      las comas; también lee «1e3» y «0x10»). Decidir si se cambia para todos (Caja lo usa) o solo para el fondo.
    - [ ] (g2) Fechas de 1900 aceptadas en entregar, devolver y el gasto del viaje (solo se frena la futura). Falta la regla del piso.
    - [ ] (g2) Por la API: 3 decimales redondeados en silencio en entregar y devolver, un carácter invisible como texto y el motivo de
      anular una entrega sin largo máximo.
    - [ ] (g3) El tope de la planilla con red lenta: dos cambios seguidos pueden quedar en el orden equivocado (quedó 50 tras escribir 55,5).
    - [ ] (g4) El gasto del viaje de una orden de otra tienda propone el cajón de la sede de arriba y la base lo rechaza con «Es de otra
      tienda que la caja que lo paga»; y errores crudos de Postgres por la API (montos enormes).
    - [ ] Un hallazgo de seguridad: ver el chat del 2026-10-14 (no se versiona).
  - [ ] `/formidable`.
- [x] Tabla «Quién tiene plata» de Fondos por rendir a 1024 px con el menú abierto: la arregló otra sesión (las tres tablas deciden por
  el ancho de su tarjeta) y entró con cherry-pick (`caa9daf90`); verificado aquí a 1024 y 1280 px con el menú abierto (0 px de desborde).
- [ ] Felipe: lo marcado *provisional* en el ADR (la acción `gasto_viaje_registrar` soltada del combo «Responsable»; cuándo se propone
  «Mi fondo»; de dónde sale y a dónde vuelve la plata de un fondo; «Tu fondo» no sale en el Observatorio del Admin).
- [ ] Felipe: **«Lo recibí»** (la compradora confirma en su tarjeta que recibió la plata; sin confirmar, al líder le aparece «sin
  confirmar»). Está en el mapa de módulos (`docs/compras/ordenes-de-compra-2026-10/mapa-de-modulos.md`, paso 2) pero no en la lista de 8
  actividades: no se construyó. Pediría guardar quién y cuándo confirmó cada entrega.
