## 2026-11-05 (Taller: cerrar lo pendiente antes del rediseño, ADR-0614)
- **Actividad 1 · Revertir un cierre devuelve el costo de la prenda (migración `20261105213000`).**
  QUÉ HICE: `revertir_produccion` ahora devuelve `variantes.costo` al valor exacto de antes del cierre y deja una fila `reversion` en `costo_historial`. Si después entró otra compra u otro cierre, se rechaza.
  POR QUÉ ASÍ: un promedio ya mezclado no se puede deshacer sin inventar un número (ADR-0515); en orden inverso sí se puede.
  QUÉ SE ROMPERÍA SIN ESTO: una orden mal cerrada dejaría mal el costo de la prenda en todas las sedes, y Revertir no lo arreglaría.
  Verificado: `pruebas:produccion-revertir-costo` 11/11 y, con la migración aplicada en la base local, cierre, «ya estaba», ruta nueva, punta a punta, anulaciones, corregir compra, balance y Frescura en verde. Sin probar en el navegador: el único cambio de pantalla es una frase.
- **Actividad 2 · Primeras órdenes cerradas en producción.**
  QUÉ HICE: con la orden de Felipe, desde su cuenta, pasé OP-2, OP-3 y OP-4 al stock del Taller y cerré OP-1 con «ya estaban registradas». Son los primeros cierres reales del módulo.
  POR QUÉ ASÍ: sus prendas tenían costo cero y la tela y las tarifas ya estaban anotadas; lo que Felipe no sabe (nombres de servicios, tela de OP-5 y OP-6) no impedía cerrar estas cuatro.
  QUÉ SE ROMPERÍA SIN ESTO: seguirían sin stock del Taller ni costo real, y Eficiencia sin ninguna cifra.
  Verificado con una consulta de solo lectura: estado, entradas, stock y costo de cada orden. Quedó pendiente lo que dice el backlog.
- **Actividad 3 · Lo que se le debe a un servicio llega a Por pagar (migración `20261105221000`).**
  QUÉ HICE: `fn_servicios_por_pagar` deriva devengado menos lo documentado, se suma a la deuda de Producción y sale en Por pagar del Taller. El nombre de un servicio ahora se registra también con la orden cerrada, sin tocar el monto.
  POR QUÉ ASÍ: copiar la deuda a otra tabla daría dos verdades; derivada cambia sola con otra vuelta o una anulación. Se cuenta sin IGV porque la tarifa es sin IGV.
  QUÉ SE ROMPERÍA SIN ESTO: el Taller debería plata a quien le cose sin que ninguna pantalla de dinero lo dijera.
  Verificado: `pruebas:produccion-servicios-por-pagar` 12/12 y en el navegador local, de la lista a registrar el nombre en una orden cerrada. Sin mirar a 375 px ni en oscuro (va con el rediseño). Sin pegar en producción.
- **Actividad 4 · Pagar a un servicio con el papel que dio (migración `20261105222000`).**
  QUÉ HICE: hoja «Pagar a…» desde Por pagar: cuánto, qué papel (factura, boleta, recibo por honorarios o sin papel), y si ya se pagó o queda por pagar. Al anotar una vuelta, el aviso lleva «Ir a pagar».
  POR QUÉ ASÍ: `pagar_servicio_de_orden` usa la misma puerta de siempre (`registrar_comprobante_produccion`), así Finanzas, IGV y el flujo lo ven sin cambiar. Sin papel queda marcado y fuera de Impuestos.
  QUÉ SE ROMPERÍA SIN ESTO: habría que escribir el pago a mano en Facturas, y la deuda de la orden no se enteraría.
  Verificado: `pruebas:produccion-pagar-servicio` 16/16, reglas 9/9 y en el navegador local un pago sin papel que deja el Taller sin deuda. Sin mirar a 375 px ni en oscuro. Sin pegar en producción.
- **Actividad 5 · «Llegó una compra» (migración `20261105223000`).**
  QUÉ HICE: una sola hoja para lo que se le compró a un proveedor: varias líneas de un mismo papel, por metro, kilo o rollo, con su rinde corregible, y cómo se paga. `registrar_compra_de_insumos` deja un comprobante y un lote por línea, todo o nada. La hoja vieja quedó solo para «Saldo inicial».
  POR QUÉ ASÍ: reutiliza las dos funciones de siempre. El factor de kilos a metros sale de la ficha y se puede corregir, y queda escrito en la nota del lote.
  QUÉ SE ROMPERÍA SIN ESTO: una factura con varios colores no cabía en el camino corto, y comprar por kilo obligaba a convertir de memoria.
  Verificado: `pruebas:produccion-llego-una-compra` 12/12, la compra de una línea 23/23, reglas en verde y en el navegador local 100 kg a S/ 18: 333 m a S/ 5.4054, factura de S/ 2,124 y la nota «100 kg × 3.33 m/kg». Sin mirar a 375 px ni en oscuro. Sin pegar en producción.
- **Actividades 6 y 7 · Regularizar lo que ya entró (migración `20261105225000`).**
  QUÉ HICE: en cada lote, «Decir a quién» completa el proveedor de una compra vieja y el lápiz de un lote usado ajusta lo que queda. En una factura S/P, «Llegó el papel» pone su tipo, número y total reales.
  POR QUÉ ASÍ: el ajuste baja como merma, que el lote y el libro ya saben contar, sin tocar lo que entró ni lo recibido de la factura. Completar el proveedor no crea deuda: no se sabe si se debe.
  QUÉ SE ROMPERÍA SIN ESTO: esos datos solo se arreglaban con SQL a mano o anulando, y una compra ya recibida no se puede anular.
  Verificado: `pruebas:produccion-regularizar-lotes` 16/16, reglas en verde y en el navegador local: 15 m → 12 m como merma de 3 m, y S/P-000001 → F002-88 con S/ 118 de total y el lote con su documento nuevo. «Decir a quién» se probó en la base, no con clics. Sin mirar a 375 px ni en oscuro. Sin pegar en producción.
- **Actividades 8 y 9 · Tope de corte y paso incompleto (migración `20261105232000`).**
  QUÉ HICE: el tope de cortar de más pasó del 10 % a 3 prendas por talla y color, como decidió Felipe el 16-oct. La actividad 9 no llevó código: «Terminé» con prendas perdidas ya cierra un paso incompleto con su motivo desde ADR-0570.
  POR QUÉ ASÍ: un porcentaje da margen de sobra en un plan grande y casi nada en uno chico; la regla vive en una sola función.
  QUÉ SE ROMPERÍA SIN ESTO: un plan de 200 por talla seguiría dejando cortar 20 de más sin avisar.
  Verificado: `pruebas:produccion-tope-de-corte` 4/4, avances 29/29, «Terminé» con falla 21/21, cierre 20/20 y corte con su tela 20/20. Sin pegar en producción.
- **Actividad 10 · Anular con tela cortada (migración `20261105233000`).**
  QUÉ HICE: una orden con tela ya cortada no se anula por la puerta de siempre: la hoja pide qué se hace con lo cortado y por qué. «Se usa en otra orden» pasa la tela y su costo a esa orden; «Se liquida» y «Se bota» la dejan fuera del estante, con su costo en la orden anulada. Los avíos siempre vuelven.
  POR QUÉ ASÍ: es lo que Felipe decidió el 16-oct (P-05). Sale del libro de insumos de siempre, sin tablas nuevas. El candado está en la base, no en la pantalla.
  QUÉ SE ROMPERÍA SIN ESTO: el estante diría tener metros que ya están cortados, y el costo de lo perdido desaparecería.
  Verificado: `pruebas:produccion-anular-tela-cortada` 12/12; anulaciones 18/18, cierre 20/20, devolución 10/10, tela al cortar 16/16, tela 14/14, Frescura 260/260; y en el navegador local, OP-378 pasó su tela a OP-379. Sin mirar a 375 px ni en oscuro. Sin pegar en producción.
- **Actividades 11 y 12 · Datos al abrir y cambiar una orden abierta (migración `20261105234000`).**
  QUÉ HICE: la orden guarda si es reposición o novedad, a qué tienda va, si es urgente y quién aprobó la muestra; se ve en su ficha y «Urgente» sale en la lista. «Cambiar cantidades» sube, baja o suma tallas con motivo, sin bajar de lo cortado, y queda en la historia.
  POR QUÉ ASÍ: son decisiones de Felipe del 16-oct (P-28, P-29, P-34, P-35). Todo opcional, para no frenar al Taller: solo informan y no reparten stock ni deciden prioridades.
  QUÉ SE ROMPERÍA SIN ESTO: si el pedido cambiaba, había que anular la orden o seguir con un plan falso.
  Verificado: `pruebas:produccion-datos-y-plan` 13/13, las de Producción que dependen, la web completa (166,455 pruebas), y en el navegador local OP-379 de 10 a 15 prendas. Ahí se vio un error, ya corregido: la historia lo titulaba «Restauró»; quedó cubierto solo en parte por pruebas, porque el título no se volvió a mirar en el navegador. Sin mirar «Datos» con clics, 375 px ni oscuro. Sin pegar en producción.
- **Actividad 13 · Los avíos se descuentan solos al cerrar (migración `20261106003000`).**
  QUÉ HICE: al pasar al stock, cada avío declarado baja lo que faltaba (por prenda × buenas), el lote más antiguo primero, y entra al costo de la orden. La hoja lo avisa.
  POR QUÉ ASÍ: ADR-0570 pedía «al terminar el paso que los usa», pero la base no sabe qué paso usa cada avío: al cerrar, el estante y el costo quedan iguales sin agregar una configuración más. Si no alcanza, no frena: la prenda ya está hecha.
  QUÉ SE ROMPERÍA SIN ESTO: el estante diría tener botones ya cosidos y el costo saldría sin ellos, como le pasó a OP-2.
  Verificado: `pruebas:produccion-avios-al-cerrar` 7/7 y las de cierre, avíos, tela, costo atípico, cinco pasos y ruta nueva. Sin mirar la frase nueva de la hoja en el navegador. Sin pegar en producción.
- **Actividad 14 · Las tres etapas de una prenda (migración `20261106004000`).**
  QUÉ HICE: un modelo en producción ya no sale en Productos, Vender, Apartados, Cambios, Buscar, Existencias ni la tienda web; terminado en el Taller sale solo en Existencias y Análisis; al llegar a una tienda sale en todo, solo.
  POR QUÉ ASÍ: es la decisión 8 de ADR-0551. La etapa se deriva de la orden, el stock y los movimientos, y lo ocultado nunca tiene stock en una tienda: no puede frenar una venta. Si la lectura falla, se muestra.
  QUÉ SE ROMPERÍA SIN ESTO: la colaboradora busca una prenda que todavía es tela y no entiende por qué no hay ninguna.
  Verificado: `pruebas:produccion-etapas-de-prenda` 15/15, las vecinas de Productos, Análisis, Existencias, tienda web y vitrina, la web completa (166,460 pruebas), Knip, y en el navegador local un modelo que no aparecía en Productos ni Buscar hasta darle stock en Trujillo. Vender no se pudo mirar con la caja cerrada: lo cubren la prueba de la regla y la misma función de Buscar. Sin pegar en producción.
- **Actividad 15 · Se retira el cajón de órdenes antiguas.**
  QUÉ HICE: borré seis componentes y las reglas que solo ellos usaban; cada orden se abre en su página, y los enlaces viejos `?orden=` llevan a ella.
  POR QUÉ ASÍ: en producción las 7 órdenes ya tienen pasos: el cajón solo servía para las de antes de los pasos, y ya no hay ninguna.
  QUÉ SE ROMPERÍA SIN ESTO: el rediseño habría tenido que cargar con dos maneras de ver una orden.
  Verificado: la web completa (166,433 pruebas), tipos, Knip y Knip de producción; en el navegador local la lista enlaza a `/produccion/ordenes/OP-000379`.
- **Actividad 16 · Prueba completa y entrega.**
  QUÉ HICE: corrí 70 suites de la base, la web completa, las 10 guías del Taller en el navegador y `/chaos` en la base; dejé el mapa para el rediseño.
  POR QUÉ ASÍ: el rediseño parte de reglas verificadas y sabe qué no tocar.
  QUÉ SE ROMPERÍA SIN ESTO: un cambio visual podría llevarse una regla de dinero sin que nadie lo note; `produccion_ploteo` estaba en rojo por el tope de corte y lo habría encontrado el CI.
  Verificado: 70 de 70 suites (dos solo pasan sin las órdenes de prueba locales que dejé, porque cuentan todas las órdenes: se comprobó quitándolas dentro de una transacción), 166,433 pruebas web, Knip y las 10 guías. `/chaos`: 0 estados imposibles, las invariantes limpias y la base local restaurada idéntica.
