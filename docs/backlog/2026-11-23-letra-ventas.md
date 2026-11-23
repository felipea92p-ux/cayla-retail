# Letra y texto de Ventas — 2026-11-23

Rama `claude/letra-ventas`, apilada sobre `claude/letra-piezas-comunes` (PR #1981), que va sobre `claude/letra-escala-cerrada` (PR #1978).
Actividad 4 de las ocho mejoras de estética. ADR-0691. Sin migraciones.

## Hecho

- [x] **Letra (TSX):** 240 tamaños a mano de 72 archivos que se ven desde las pantallas de Ventas (Vender, Caja, Apartados, Cambios,
      Devoluciones, Historial, Reportes, Comprobantes) pasaron a la utilidad de su escalón. 24 botones recuperaron su interlineado
      (`leading-tight`): la utilidad de la escala se lo pisaba.
- [x] **Letra (hojas):** 65 tamaños de diez hojas pasaron a `var(--text-…)`: el cobro y las cifras de caja (`globals.css`), la persiana
      de «Caja cerrada», el gasto rápido, la comparación de Caja, el descuento de Vender, la barra de cierre, los tickets del historial
      de cierres, Comprobantes, Posventa y el atajo «/» del buscador.
- [x] **El cobro:** el nombre de cada medio ya no sale del ancho de su ficha (bajaba hasta 9 px). Va a 13 px; «Transferencia» pierde su
      espaciado bajo 132 px de ficha y pasa a «Transf.» bajo 112 px (un laptop de 1366 px, una tablet, el celular). Medido en ocho
      tamaños, de 1920 × 1080 a 360 × 800: todo cabe, sin scroll y con «Confirmar cobro» a la vista.
- [x] **Historial de cierres:** con el sello a 13 px, la duración del turno se cortaba más. Ahora el sello baja a su línea si no entran
      juntos.
- [x] **Deuda de letra:** de 2.422 a 2.117 (de 484 a 401 archivos); por debajo de 13 px, de 1.011 a 799.
- [x] **Texto:** 36 frases.

| Dónde sale | Hoy | Ahora |
|---|---|---|
| Vender ▸ hoja de la prenda | ¿La talla que pidió no está y no le sirve esperar? Anótalo para Compras. | ¿No había su talla? Anótalo para Compras. |
| Vender ▸ colores ocultos | 1130 colores ocultos (8 con stock en el almacén) | 1130 colores ocultos · 8 en almacén |
| Vender ▸ Cliente de esta venta | Opcional. Sus datos pasan solos al comprobante y la compra queda en su ficha. | Opcional. Sus datos pasan solos al comprobante. |
| Vender ▸ Registrar cliente | Solo su documento. Para ser del club, se une por su cuenta escaneando el cartel. | Solo su documento. Al club se une escaneando el cartel. |
| Vender ▸ Prenda sin registrar | La etiqueta provisional se arma mientras eliges. Almacén la registra después con estos datos. | Almacén la registra después con estos datos. |
| Vender ▸ Corregir lo anotado | Cambia categoría, talla, color o descripción si caja se equivocó. El precio, el stock y el comprobante no cambian. | El precio, el stock y el comprobante no cambian. |
| Vender ▸ venta sin internet | Sin internet: quedó guardada en este equipo y sube sola cuando vuelva la conexión. No se puede emitir comprobante todavía. | Sin internet: quedó guardada aquí y sube sola. Todavía sin comprobante. |
| Vender ▸ venta sin su comprobante | La venta quedó registrada, pero no se pudo leer su comprobante para imprimirlo. Búscala en «Ventas de hoy» o en Facturación. | La venta se registró, pero su comprobante no se pudo leer. Búscala en «Ventas de hoy» o en Comprobantes. |
| Abrir caja | Según el último cierre, en el cajón deberían estar S/ 0.00. Cuéntalo ahora: si abres con un monto que no está, cualquier faltante de hoy va a parecer tuyo. | Deberían estar S/ 0.00. Lo que falte hoy parecerá tuyo. |
| Cerrar caja, paso 1 | Cuenta el efectivo del cajón y escribe cuánto hay. Solo efectivo: tarjeta, Yape y Plin no se cuentan. | Cuenta solo el efectivo del cajón. |
| Cerrar caja, paso 2 | Escribe cuánto vas a trasladar. Lo que no traslades se queda en el cajón para el próximo turno. | (sin frase: el campo y la caja «Queda en el cajón para el próximo turno» ya lo dicen) |
| Caja ▸ Registrar gasto | ¿Sale plata del cajón y no es un gasto (un retiro, un depósito al banco)? Retiro o depósito | ¿No es un gasto? Retiro o depósito |
| Caja ▸ Registrar ingreso | Un abono de apartado o una venta no van aquí: se cobran en Apartados o en Vender. | Un abono o una venta se cobran en Apartados o en Vender. |
| Caja ▸ Registrar ingreso | ¿Sale plata del cajón y no es un gasto? | ¿Sale plata y no es un gasto? |
| Apartados ▸ Apartar, vacío (computador) | Pasa la etiqueta por la pistola. Si no la tienes, escribe el nombre o el color: la lista muestra la foto de cada prenda. | Con la pistola, o escribe su nombre o color. |
| Apartados ▸ Apartar, vacío (celular) | Toca la cámara y apunta al QR de la etiqueta. Si no la tienes, escribe el nombre o el color: la lista muestra la foto de cada prenda. | Con la cámara, o escribe su nombre o color. |
| Apartados ▸ al llegar desde el ticket | Las prendas del ticket ya están en la lista, con su descuento. Revisa y sigue con los datos del cliente. | Las prendas del ticket ya están aquí, con su descuento. |
| Apartados ▸ Entregar, vacío | Cuando alguien aparte una prenda en Tienda Lima, aparecerá aquí hasta que la recoja. | Lo que se aparte en Tienda Lima aparecerá aquí. |
| Apartados ▸ Historial | Cerrados de los últimos 30 días · los que siguen abiertos se ven siempre | Cerrados de los últimos 30 días · los abiertos, siempre |
| Devoluciones ▸ prendas en cuarentena | 3 prendas esperan en cuarentena: decide si vuelven al piso, van al Taller o se dan de baja. | 3 prendas esperan en cuarentena (el botón «Revisar en Inventario» sigue al lado) |
| Devoluciones ▸ reembolso | Opcional, y es la última opción: primero un cambio, después una nota de crédito. Déjalo vacío si no hay reembolso. | Opcional y última opción: antes, un cambio o una nota de crédito. |
| Cambios ▸ Tallas que no calzan | Prendas que se cambian seguido a otra talla, en todas las sedes. Si una va casi siempre a la talla de arriba, la horma puede estar calzando chica. | Prendas que se cambian seguido a otra talla. (lo demás, detrás del «?») |
| Historial ▸ nota al pie | Una venta no se edita ni se borra: si se anula, queda tachada y deja de sumar. Un cambio o una devolución se marca en su venta. | Una venta no se borra: anulada, queda tachada y no suma. |
| Historial ▸ búsqueda sin resultados | Se buscó en todas las fechas. Prueba con el número sin ceros (B004-31), el DNI o RUC o el nombre de la prenda. | Se buscó en todas las fechas. Prueba el número (B004-31), el DNI o la prenda. |
| Historial ▸ rango muy grande | Hay 1,000 ventas o más en este rango: acótalo (una tienda, menos días) para ver el pulso y los totales. | Hay 1,000 ventas o más: elige menos días o una tienda. |
| Historial ▸ detalle, caja ya cerrada | La caja de esta venta ya se cerró: el pago ya no se corrige aquí. El líder lo ajusta con un ingreso o egreso de caja. | La caja ya se cerró: el líder lo ajusta desde Caja. |
| Reportes ▸ mes a mes | Todavía hay un solo mes con ventas: cuando haya más, los verás aquí uno al lado del otro. | Aún hay un solo mes con ventas. |
| Reportes ▸ Empresas, vacío | Esta vista separa las ventas de una tienda donde venden dos empresas. En tu tienda todo es de una. | Esta vista es para tiendas con dos empresas. |
| Reportes ▸ Ranking, aviso | Se cobraron en caja sin elegir qué prenda era. Cuando alguien las identifique en Inventario ▸ Por regularizar, entran aquí. | Se cobraron sin elegir la prenda. Entran al identificarlas en Inventario ▸ Por regularizar. |
| Comprobantes ▸ cabecera | Pruebas: se envía al sandbox, no a SUNAT | Modo pruebas: nada llega a SUNAT |
| Comprobantes ▸ tarjeta «Pendientes de enviar» | Sin enviar, de todos los meses · la más antigua: hace 18 d. | De todos los meses · la más antigua: hace 18 d. |
| Comprobantes ▸ Por enviar | Todo lo que todavía no llegó: lo que nunca se intentó, lo que falló y lo que SUNAT rechazó. No pierden su número; si uno pasa de 1 hora, mira el error. | Cada uno conserva su número. (lo demás, detrás del «?») |
| Comprobantes ▸ Proformas | Las vigentes de cualquier mes, más las que se hicieron este mes. Las que vencen antes van primero. | Las vigentes y las hechas este mes. |
| Comprobantes ▸ Series | En qué número va cada una. El siguiente comprobante que emita la tienda sale con ese número. | El número con que sale el siguiente comprobante. |
| Comprobantes ▸ Series, falta una | Sin serie de nota de crédito: las devoluciones de esta tienda no pueden emitir su nota de crédito. | Sin serie de nota de crédito: las devoluciones no pueden emitirla. |
| Cobro ▸ nombre de un medio, ficha angosta | TRANSFERENCIA (a 9 px) | TRANSF. (a 13 px) |

- [x] Medido en 54 vistas (34 a 1440 × 900 y 20 a 375 × 812), en claro y en oscuro: 0 textos cortados nuevos, 0 desbordes; 13 vistas
      cambiaron de alto, entre −26 y +9 px.
- [x] La caja de Tienda Lima que se abrió en la base local para ver el cobro quedó cerrada por la pantalla (cuadró en S/ 0.00). No se
      registró ninguna venta, pago ni gasto.

## Pendiente

- [ ] **Que Felipe revise el tono** de las 36 frases. Tres a mirar con cuidado: «Lo que falte hoy parecerá tuyo» (Abrir caja),
      «Transf.» en el cobro (sale en fichas de menos de 112 px; a 1440 px se sigue leyendo «Transferencia») y «Modo pruebas: nada llega
      a SUNAT».
- [ ] **El aviso de cierre de caja de la cabecera** (`recordatorio-cierre.css`, 14 tamaños; el más chico, «h : min», a 9 px): no se
      tocó porque en la base local ninguna tienda tiene hora de cierre y el aviso nunca sale. Hace falta una tienda de prueba con hora
      de cierre para verlo.
- [ ] **Los gráficos** (`graficos-tiempo.css`, 12 tamaños: ejes a 10,5 px y cifras a 11): sus posiciones se calculan con esos tamaños.
      Subirlos pide revisar la geometría de `Linea` y `BarrasTiempo`. Van juntos, con Gestión y Rendimiento.
- [ ] **Los visores de cámara** (`EscanerCamara`, `EscanerBusqueda`, `ExistenciasEnCamara`, 14 tamaños): el puente no los alcanza
      porque van sobre el video. No se pueden ver sin cámara. Van con Inventario.
- [ ] **«Ventas sin registrar»** (`ventas-sin-registrar.css`, 40 tamaños): la mesa vive en Existencias. Va con Inventario.
- [ ] **Las preguntas del paso «Reemplazo» de Cambios** («¿Qué se lleva?», «¿Cuántas cambia?»): son un `<label>` en letra de lectura,
      no la etiqueta de campo del sistema. Salieron a la vista de `lib/unificar.test.ts` al usar la escala y quedaron declaradas como
      deuda de `etiqueta-campo`. Cómo se ven lo decide Felipe en `/unificar`.
- [ ] **Ya estaba, no es de este cambio:** en el cobro a 1440 × 900 con efectivo, el billete «Otro» sale cortado («Otr») y «S/79.90»
      toca los bordes de su ficha. Pide revisar los billetes de a tres por fila.
- [ ] **Ya estaba, no es de este cambio:** en el celular, el campo grande de «¿Cuánto hay en el cajón?» muestra su «0.00» mucho más
      chico que el «S/». Caja es de escritorio.
- [ ] **Textos largos que no se tocaron a propósito:** los que explican qué pasa con un comprobante ante SUNAT (anular, devolver un
      adelanto, entregar un apartado) y el reparto con CLAURE. Son de Felipe.
- [ ] **Sin abrir en pantalla:** los modales de un apartado (no hay apartados en la base local), el detalle de un cierre de caja y la
      cola sin conexión. Cambiaron de clase, no de tamaño.
- [ ] **Un candado para el texto largo:** sigue sin estar en la lista aprobada. Proponérselo a Felipe.
- [ ] **Dynamic:** queda como tarea allá. Cambiaron tres hojas de `app/estilos/vidrio/` (`vender.css`, `comprobantes.css`,
      `posventa.css`): solo el tamaño de la letra, de pantallas que son de Retail.
