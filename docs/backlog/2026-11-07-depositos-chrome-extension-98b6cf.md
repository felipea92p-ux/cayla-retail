## 🏧 Cuadrar las máquinas con su propio reporte (2026-11-07, ADR-0630) — rama `claude/depositos-chrome-extension-98b6cf`

- [x] Cruce de Izipay (4 códigos) y Vendemás contra el ERP desde el 28-oct (cifras fuera del repo).
- [x] Parte 1: `20261107223000` — con la caja cerrada, un líder corrige lo que no es efectivo y puede elegir la máquina; mes cerrado bloquea.
      `pnpm pruebas:corregir-pagos-caja-cerrada` 13/13 y control 2/2.
- [x] Pegada en producción el 2026-11-07 (con el OK de Felipe), después de la Fase A de ADR-0629, que ya estaba. Verificado: la función nueva está viva, `authenticated` conserva el permiso y `anon` no.
- [x] Corregidos en producción 7 cobros mal anotados (2 tarjetas en la máquina equivocada, 5 «Yape» que fueron QR de Izipay), con foto y motivo.
- [x] Depósitos rehechos con el estado de Interbank: Vendemás, uno por línea del banco (8), e Izipay del 1 al 6-nov, con la comisión real. ITF anotado y la conciliación de Interbank del 28-oct anulada (guardó un saldo de media tarde).
- [ ] A propósito sin depositar hasta confirmar cobros: Vendemás del 28 y 30-oct (el ERP tiene de más en AQP), el QR de AQP del 4-nov y el de TRU del 6-nov (traen cobros que Izipay no tiene), y el 7-nov (día abierto).
- [ ] Con el estado de BCP Empresa: el depósito de Izipay del 31-oct anotado a BCP, los traspasos de Felipe a sus Operativas y los ajustes de relleno.
- [ ] Yape de Claudia en Lima (regla de Felipe del 7-nov): cuenta de CLAURE, candado por dueño y corrección de los 8 Yapes de CLAURE.
- [ ] Parte 2: subir el Excel de Izipay, emparejar pago por pago y registrar el depósito con la comisión real (lista de actividades por aprobar).
- [ ] Parte 3: Vender aclara «QR Izipay (aunque paguen con Yape)» y «Yape al celular de la tienda».
- [ ] Decidir: un QR anotado que Izipay nunca recibió, con una venta en efectivo del mismo monto 49 min después (¿venta doble?).
- [ ] **Conocido tras la verificación del 7-nov:** la puente de Izipay quedó por debajo de lo pendiente (la tarjeta de TRU del 29-oct pasó a Vendemás y el depósito de Izipay del 31-oct, todavía a BCP, la sigue cubriendo). Se arregla al rehacer ese depósito. BCP Empresa queda en negativo hasta registrar sus entradas reales con su estado de cuenta.
- [ ] Decisión de Felipe: que `corregir_pagos_venta` avise cuando lo que saca deja un día por debajo de lo ya depositado (ADR-0630, SE ROMPE SI 1).
- [ ] Revisar un gasto bancario del 31-oct («se pasó dos veces una misma venta»): no es comisión.

### Ronda 2 (7-nov noche, con los estados de BCP Empresa y las Operativas; OK de Felipe)
- [x] BCP Empresa cruzado con su estado (cadena verificada). 16 cobros más corregidos, el depósito de Izipay de octubre anotado a BCP rehecho a Interbank por línea del banco, 9 ajustes de relleno anulados, traspasos de Felipe registrados por la cadena Interbank Empresas → Interbank Operativa → (otra cuenta BCP de Felipe) → BCP Operativa → BCP Empresa, gastos bancarios de BCP e Interbank Operativa, JetSmart como viaje de compra.
- [x] Las dos Operativas quedan iguales a su saldo real del 7-nov. Lo que no se ve (28 al 31-oct) va en dos líneas «Diferencia sin detalle» (un pase entre Operativas y un retiro de Felipe), para corregir si aparecen los movimientos.
- [x] Verificado: saldos de Interbank Empresas y BCP Empresa explicados al céntimo contra sus estados; Diario de octubre y noviembre cuadrado (0 asientos descuadrados).
- [ ] Un fondo de compras del 6-nov salió de BCP Empresa (Felipe), pero está anotado desde Interbank. Hace falta una función para cambiar la cuenta de un fondo ya confirmado (se muestra antes de pegarla). En otro fondo, una entrega del 6-nov fue a BCP Operativa y no al fondo, y lo entregado sigue sin calzar con lo anotado.
- [ ] BCP Empresa: gastos de Trujillo del 31-oct (local y almacén) y pagos del Taller anotados ahí sin línea en el estado; dos Yapes de salida del 28-oct y cargos del 29-oct al 3-nov sin explicar.
- [ ] Depósitos que siguen sin registrar a propósito (Izipay de octubre, tarjetas de LIM, QR de AQP del 4-nov y del 7-nov, Vendemás del 29 y 31-oct): los cubre el emparejador de la rama `claude/interbank-empresas-cuentas-93baab` (ADR-0629 Fase B), que reemplaza la parte 2 del ADR-0630.

### Ronda 3 (7-nov, noche): la cuenta «BCP Maniobra»
- [x] Nueva cuenta «BCP Maniobra» (banco, abre el 28-oct): la cuenta BCP por donde Felipe pasa plata de CAYLA entre Interbank Operativa, BCP Operativa y BCP Empresa. Sus pases, el alquiler del local de TRU del 31-oct (se pagó desde ahí, por el monto real), dos reembolsos a Claudia por cosas del Taller y un gasto personal de Felipe (retiro). Queda igual a su saldo real.
- [x] Operativas exactas a su saldo real; lo que no se ve (28 y 29-oct) queda como «Diferencia sin detalle».
- [ ] BCP Empresa sigue por encima del banco: un fondo de compras (salió de BCP, anotado desde Interbank), el almacén de TRU del 31-oct (sin línea en BCP), dos Yapes de salida del 28-oct y cargos del 29-oct al 3-nov sin ubicar.
- [ ] El fondo de compras tiene una parte sin rendir (compras sin anotar o plata que sobró): preguntar a Felipe.
- [ ] Un pago a un proveedor de tela del 27-oct desde BCP Operativa no está en Compras (anterior al cuadre).

### Ronda 4 (8-nov): BCP Empresa, lo que no es del fondo
- [x] El origen del fondo de compras del 6-nov se corrigió con un pase de corrección (sale de BCP Empresa, no de Interbank).
- [x] El período de prueba de la planilla de octubre se pagó desde BCP Empresa (Felipe): sus dos salidas pasan a esa cuenta con `registrar_salidas_planilla`, y las dos líneas «Diferencia sin detalle» de las Operativas se rehicieron para que sigan iguales a su saldo real.
- [x] El alquiler del almacén de TRU se pagó desde BCP Operativa el 30-oct (constancia de Felipe), no desde BCP Empresa: gasto anulado y registrado de nuevo en esa cuenta y fecha; las líneas «sin detalle» se rehicieron otra vez. Diario cuadrado (0 descuadrados).
- [ ] Ronda 4 de compras: dos proveedores (Felipe: «Lalesh e Ivanana») cobraron por Yape directo desde BCP Empresa el 28-oct, pero la ronda los da por pagados con el fondo que salió de BCP Operativa. Falta que Felipe diga si el fondo fue el total o si esos pagos se suman a él.
- [ ] Fondo del 6-nov: lo que queda en BCP Empresa no calza con el monto del fondo por una diferencia chica.
- [ ] Pagos del Taller a Multiplaza anotados en BCP Empresa sin línea en el banco; Yapes de CLAURE de Lima y de AQP que no llegaron a BCP Empresa.
- [ ] Interbank Empresas el 6-nov: un pase a BCP Operativa y una entrega de fondo en efectivo que no están en el extracto (los vio la sesión de Interbank Empresas; preguntar a Felipe).

### Ronda 5 (8-nov, tarde): una sola sesión, fondo en cero
- [x] Las dos sesiones del cuadre se juntaron en esta (Felipe: «crucen info y queden con una sola»); la de Interbank Empresas pasó su traspaso y dejó de escribir.
- [x] Ronda 4 de compras: la devolución volvió a BCP Operativa (Yape del 29-oct). Se registró con `devolver_fondo` con la fecha real y el token del cierre, y el cierre quedó resuelto. Desde la pantalla no se podía: el fondo es del mismo líder que recibe y `recibir_cierre_compras` fecha la devolución hoy.
- [x] Pase BCP Empresa → BCP Operativa del 30-oct (está en los dos extractos al mismo minuto).
- [x] Liquidaciones de octubre: una parte salió de BCP Empresa y no de Interbank Operativa (se parte el pago con `registrar_pago_de_planilla`).
- [x] Recibos por honorarios: el grupo de Interbank salió de Interbank Operativa el 29-oct (voucher); el de BCP salió el 29-oct y el 3-nov, y uno de sus recibos no salió de BCP Empresa: queda por pagar hasta saber de dónde salió.
- [x] Pase de Interbank Empresas a Interbank Operativa del 28-oct («lo dejé en mi cuenta», Felipe).
- [x] Sueldo de Felipe no transferido en la planilla: préstamo suyo a CAYLA el 29-oct y devolución hoy desde BCP Operativa (Plin). El gasto de planilla se cuenta una sola vez.
- [x] Yape a un proveedor del 6-nov sin papel: compra «POR EDITAR · Jeans» a un proveedor nuevo, para TRU. El fondo de compras quedó en 0.
- [ ] Ronda 4: dos papeles se pagaron por Yape desde BCP Empresa y la ronda los da por pagados con el fondo. Falta saber de dónde salió la plata de la ronda (un cargo de BCP Operativa del 28-oct y un pago de BCP Maniobra a Claudia de ese día son candidatos).
- [ ] BCP Operativa: un cargo del 28-oct, un depósito en efectivo del 29-oct y Yapes chicos no están en el ERP; noviembre trae entradas que no tienen línea en el banco de donde salen (emparejamientos del 6-nov). Un pago de período de prueba no salió de BCP Empresa.
- [ ] Interbank Empresas: lote de Vendemás del 31-oct, lote de Izipay del 2-nov y QR sin venta.
- [ ] Diseño (para revisar el módulo de compras): el fondo a nombre del líder que compra y recibe a la vez; la devolución sin fecha; `fn_fondo_saldo` no descuenta los papeles por completar (dos saldos distintos del mismo fondo); la plata anotada queda enlazada a movimientos anulados; la excepción de Admin es una variable de sesión que cualquiera puede fijar (no versionar el detalle).

### Ronda 6 (8-nov, noche): ronda 4, emparejamientos y depósitos de máquina
- [x] Ronda 4: la entrega del fondo se partió (una parte antes del corte y dos Yapes directos a proveedores desde BCP Empresa el 28-oct). El fondo sigue en 0.
- [x] Dos pases del 6-nov hechos a mano para emparejar saldos, sin línea en ningún extracto: anulados, y la línea «sin detalle» de las Operativas se rehízo para que no se muevan.
- [x] Interbank Empresas: lote de Vendemás del 31-oct (una venta de AQP pasó por Izipay; una seña y un cambio de AQP se cobraron con Vendemás aunque dicen Yape), lote de Izipay del 2-nov (Izipay pagó unos céntimos menos que su panel: reclamar) y un QR del 30-oct.
- [ ] Interbank Empresas: una entrega de fondo «en efectivo» del 6-nov con origen imposible, tres QR del 28-oct sin venta y un QR del 29-oct cruzado entre tiendas.
- [ ] BCP Empresa: Yapes de CLAURE en Lima (esperan la cuenta «Yape de Claudia»), cobros por Yape de AQP que no llegaron, pagos del Taller sin línea en el banco, un pago de período de prueba y la diferencia del fondo del 6-nov.
- [ ] Faltan: una RPC para corregir el medio y la cuenta de un pago de apartado o de cambio, y un tipo de «ingreso» para QR sin venta.

### Ronda 7 (8-nov, noche): el fondo «en efectivo» del 6-nov
- [x] La entrega de fondo «en efectivo» del 6-nov era plata que Felipe le pidió prestada a una persona del equipo, no de Interbank Empresas. Como es plata anotada ya confirmada, la base no deja anularla: se compensó con un préstamo en esa cuenta el mismo día, y su devolución se registró hoy desde BCP Maniobra. La deuda de préstamos vuelve a 0.
- [x] Período de prueba, la parte sin banco: salió de BCP Operativa (Yape a la encargada de AQP para que le pague a quien dejó la empresa), no de BCP Empresa. Las líneas «sin detalle» de las Operativas se rehicieron. BCP Empresa se aleja del banco por esto: el exceso lo explican los cobros por Yape que no llegaron.
- [x] Ploteos del Taller desde el 28-oct: figuraban pagados desde BCP Empresa sin estar en su extracto. Felipe: lo del Taller ya se pagó antes, por fuera. Se compensó con una línea de apertura por pago (aporte), en las mismas fechas. Lo que queda de BCP Empresa sobre el banco son los cobros por Yape que no llegaron y la diferencia del fondo del 6-nov.
- [ ] Diseño: una plata anotada confirmada con la cuenta equivocada no tiene cómo corregirse (ni anular ni cambiar la cuenta); y el préstamo solo modela al dueño, no a otra persona que presta. Tampoco hay función para corregir la cuenta o la fecha de un pago del Taller.

### Cuenta con Claudia en Lima (9-nov): tres soluciones, espera la conversación con Claudia
- [x] Flujo real (Felipe): en Lima el Yape es el número de Claudia y va a CLAURE, fuera de los balances de CAYLA; el QR y la tarjeta van a CAYLA y lo de CLAURE se le debe; el efectivo de las dos marcas cae en el cajón y Claudia se lleva lo suyo al cerrar («traslado a Claudia»); lo que no alcanza se acumula.
- [x] Verificado contra el extracto: los Yapes de CLAURE de Lima desde el 28-oct no llegaron a BCP Empresa; las marcas de «revisado» de esos días se pusieron sin extracto. Un Yape de CAYLA de Lima entró en realidad por el QR de Izipay.
- [x] Diagnóstico: la deuda con Claudia tiene tres cifras distintas (pantalla, Diario, Balance). La pantalla no cuenta el efectivo de CLAURE, así que un traslado a Claudia la dejaría negativa; el Diario sí lo cuenta.
- [x] (Resuelto el 9-nov: queda la 3, recortada; ver la sección siguiente.) Felipe elegía entre: 1) «Una sola caja» (en Lima todo pago con celular entra por el QR de la tienda y Claudia cobra lo suyo al cierre; necesita que Claudia acepte), 2) «Puente y cruce semanal» (su Yape anotado en una cuenta de paso de CAYLA y cruzado cada domingo; mientras tanto suma en CAYLA) y 3) «Su Yape, su cuenta» (cuenta de CLAURE fuera de todo lo de CAYLA, con descuento diario; la obra más grande). Las tres comparten el núcleo: un solo libro con Claudia que incluye el efectivo, el cierre que pregunta cuánto se lleva y ajustes solo del Admin.
- [ ] Esta rama nunca se subió: la migración de corregir pagos con caja cerrada (ADR-0630) está en producción pero no en main. Antes de cualquier migración nueva que toque `corregir_pagos_venta`, abrir su PR (hay que traer main, que trae una skill protegida).

### Cuenta con Claudia en Lima (9-nov, después): regla final y decisiones de Felipe
- [x] Regla: en Lima, lo de CLAURE por Yape o Plin se paga al número de Claudia y queda fuera de CAYLA; lo de CAYLA por celular va por el QR de Izipay o al número de CAYLA. La cuenta se decide por el dueño de lo que se cobra, no solo por la sede, y la pantalla de cobro dice qué número dar. Trujillo y Arequipa no cambian. Quedan descartadas «Una sola caja» y «Puente y cruce»; queda «Su Yape, su cuenta», recortada.
- [x] Medido contra el detalle de Izipay y los extractos: casi todos los «Yapes» de CAYLA en Lima fueron QR. Uno no llegó a Izipay ni al banco (casi seguro al número de Claudia) y otro está por confirmar con el extracto de Interbank.
- [x] Decisiones: un ticket mixto con Yape son dos pagos; CAYLA asume el IGV de todo lo de CLAURE (ya no se le descuenta) y lleva una línea acumulada contra las facturas de compra a nombre de CAYLA; la plata de CAYLA que llegó al Yape de Claudia se descuenta de su cuenta; las notas de venta de CLAURE quedan a criterio de la tienda; cada una devuelve lo suyo; una venta que no se registró se registra con boleta si la tienda recuerda qué fue; Claudia sigue cerrando la caja de Lima, con estado de cuenta a Felipe y ajustes solo suyos.
- [ ] Con el contador: que CAYLA sea el comprador real de las facturas (si no, el crédito fiscal se puede caer; un contrato de consignación o comisión lo ordena), y que esas facturas cubren solo el margen.
- [ ] Con Claudia y su app de Yape: qué Yapes le llegaron, si se llevó lo que faltó en el cierre del 28-oct y qué se vendió con las dos tarjetas sin venta del 24-oct.
- [ ] Construir: un ADR nuevo que enmienda el ADR-0560; la cuenta de CLAURE fuera del libro, los saldos, el Balance y el Diario de CAYLA; el cobro de Lima por dueño, con dos pagos en el mixto; la línea del IGV asumido; el cierre que pregunta cuánto se lleva Claudia; y corregir lo ya registrado.
- [x] Lista de construcción aprobada por Felipe (9-nov), sin el aviso al teléfono: el estado de cuenta queda solo en pantalla. El IGV de CLAURE deja de descontarse desde ya, para todo lo vendido desde el arranque de su cuenta; la actualización de ADR-0560 que trae el PR #1728 («hasta la primera factura nada cambia») se alinea con esto en la actividad de la cuenta única. Si la clienta ya pagó todo a un solo número, se anota lo que pasó. Claudia corrige sus errores con la caja abierta y nunca se lleva más de lo que se le debe.
