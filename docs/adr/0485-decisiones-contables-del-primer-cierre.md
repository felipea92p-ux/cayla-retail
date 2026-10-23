# ADR-0485 · Las decisiones contables del primer cierre (octubre 2026)

- **Fecha:** 2026-10-22 · **Estado:** BORRADOR, puesto al día con las respuestas de Felipe del 22-oct a las decisiones 5, 15 y 16. Las 16 decisiones son de Felipe
  (22-oct-2026); este documento las deja por escrito con lo que se descartó y lo que las rompería. **Este ADR no trae código ni migración**, y nada de lo que sigue se
  pega en producción sin su OK. Quedan **dos preguntas abiertas** (decisiones 12 y 13): ver «Preguntas abiertas».
- **Número:** ADR-0485, reservado con `pnpm reservar adr` (ADR-0381). Hermanos: ADR-0482 (chequeos del cierre), ADR-0483 (mermas a la 6951) y ADR-0484 (Impuestos).
  Rama `claude/adr-decisiones-cierre-octubre`.
- **Decide:** Felipe, 2026-10-22. **Lo tributario y lo contable lo confirma el contador** (sección «Pendiente de contador»): aquí se decide qué hace
  el sistema, no qué dice la norma.
- **Complementa:** ADR-0332 (Finanzas cuenta desde una fecha), ADR-0198 (diario derivado que se congela al cerrar), ADR-0120 (`fn_asientos`),
  ADR-0417 (que el número diga la verdad), ADR-0433 (auditoría del 16-oct), ADR-0474 (costo de planilla real), ADR-0335 (activos),
  ADR-0330 / ADR-0393 / ADR-0362 (recepción y órdenes de compra), ADR-0164 (nota de venta), ADR-0368 (gasto rápido de Caja). Las decisiones 2, 9, 15 y 16 tienen sus propios
  ADR-0482 (chequeos del cierre), ADR-0483 (mermas a la 6951) y ADR-0484 (Impuestos), en ramas aparte; este los resume y no los contradice.
- **Lo que este ADR NO contiene:** cifras de ventas ni datos de personas (el repo es público). Los montos que aparecen son umbrales de la norma o medidas ya publicadas en otros ADR.

## Contexto

Octubre de 2026 es el **primer cierre real** de CAYLA en el ERP. Tres hechos lo condicionan:

1. **Septiembre no existe para Finanzas.** `parametros_finanzas.inicio_finanzas` (ADR-0332) corta el diario y el Estado de resultados en 2026-10-01: el
   primer mes que Finanzas cuenta es octubre. Al 22-oct, producción no tiene ningún mes cerrado.
2. **Un mes cerrado se queda cerrado** (ADR-0198, ADR-0433 act. 9): al cerrar se copia el diario con una huella SHA-256, y desde ahí no se puede
   registrar ni cambiar nada con fecha de ese mes. Por eso toda regla que mueva los números de octubre tiene que estar en producción **antes** de
   cerrarlo; si llega después, rige desde noviembre y octubre queda con la regla vieja para siempre.
3. **El calendario.** Ensayo propio ahora (22-oct en adelante); cierre firmado con contador/a la **semana del 2-nov**.

Las decisiones salieron de una sola conversación. Se numeran como Felipe las dio (1 a 16) y cada una trae las tres líneas de siempre: **DECIDÍ**,
**DESCARTÉ** (la alternativa real y lo que costaba) y **SE ROMPE SI** (un escenario concreto, no «escalabilidad»).

## Las 16 de un vistazo

| # | Decisión | Cuándo se construye |
|---|---|---|
| 1 | Régimen MYPE Tributario; pago a cuenta del 1 % | Ya rige como parámetro; lo firma el contador |
| 2 | IGV 2026 = 15,5 % + IPM 2,5 % = 18 % | **Antes del cierre de octubre** (una nota); construido en la rama de Impuestos, SQL por pegar |
| 3 | El sueldo del Taller es costo de producción | Después del motor de costo de recepción, con su propio ADR |
| 4 | Costo de un fardo: precio del papel por modelo; si no, proporcional al precio de venta | Con el motor de costo de recepción |
| 5 | Diferencias de cantidad y de monto en la recepción: se registran, se avisan a la encargada (incluso centavos) y nunca bloquean | Con el motor de costo de recepción |
| 6 | Dos listas: «recibido sin comprobante» y «comprobante sin recibir» | Pronto; es solo lectura y no mueve octubre |
| 7 | Depreciación desde el mes de uso | **Antes del cierre de octubre** |
| 8 | Costo de un activo: sin IGV con factura; con IGV sin factura | **Antes del cierre de octubre** |
| 9 | Mermas y pérdidas de inventario a la cuenta 6951 | **Antes del cierre de octubre** |
| 10 | Nota de venta: se deja como está y se mide con un tablero diario | Pronto; es solo lectura y no mueve octubre |
| 11 | Estado de resultados por tienda: hasta el resultado directo | Pronto; presentación, no mueve octubre |
| 12 | Gasto rápido de Caja desde S/ 100 lo aprueba un líder | ADR-0433 punto 7 (actividad 12, sin construir) |
| 13 | Planilla: lo que todavía falta | Se anota hoy; cada concepto entra al medirse |
| 14 | Primer cierre = octubre: ensayo ahora, firma la semana del 2-nov | Calendario |
| 15 | Alerta al llegar a 250 UIT del año calendario (S/ 1 375 000), contando lo registrado en el sistema; la tarjeta de 300 UIT pasa al año calendario | Construida en la rama de Impuestos (SQL por pegar); no mueve octubre |
| 16 | Chequeos nuevos del cierre: se miden por el MES que se cierra; octubre avisa, desde noviembre bloquean (también la factura con mercadería en camino) | **Antes del cierre de octubre** |

---

## 1 · Régimen: MYPE Tributario, con pago a cuenta del 1 %

**DECIDÍ:** CAYLA tributa en el **Régimen MYPE Tributario (RMT)**. El pago a cuenta de renta es el **1 %** de los ingresos netos del mes (ventas sin IGV
menos notas de crédito) **mientras lo acumulado del año no pase 300 UIT**. Los tres parámetros que ya existen en `parametros_tributarios` (`regimen = rmt`,
`renta_pago_cuenta = 0,01`, `umbral_uit = 300`) quedan como están; siguen marcados «por confirmar» hasta que el contador los firme. El aviso de acercarse al
límite es la decisión 15.

**DESCARTÉ:**
- *Régimen General:* libros completos desde el primer sol y pago a cuenta por coeficiente; sin un motivo declarado, es más trabajo contable por el mismo negocio.
- *Régimen Especial (RER):* su tope de ingresos anuales es muy bajo para un negocio con tres tiendas y un Taller; no es una opción real.

**SE ROMPE SI:** las ventas del año pasan 300 UIT: desde el mes siguiente el pago a cuenta sube y Finanzas seguiría calculando 1 %, subestimando lo que hay que
pagar. O si el contador resuelve que el ejercicio anterior ya dejó a CAYLA por encima (ADR-0417 lo dejó abierto) y el 1 % no aplica desde enero.

## 2 · El IGV de 2026 es 15,5 % + 2,5 % de IPM = 18 % (Ley 32387)

**DECIDÍ:** donde el sistema o un documento explique el IGV de 2026, dice **«IGV 15,5 % + IPM 2,5 % = 18 %»** (Ley 32387). **Nunca «16 + 2».** El **total** que se
cobra y se declara sigue en 18 %: ningún comprobante, margen ni crédito fiscal cambia. Lo que cambia es el texto: la nota de la fila `igv` de
`parametros_tributarios` dice hoy «IGV 16 % + IPM 2 %» (`20260924235000_finanzas_plan_de_cuentas_y_categorias_gasto.sql`, línea 94) y se corrige con una fila
nueva de esa misma nota (la tabla solo agrega; gana la más reciente), **antes de cerrar octubre**. La rama de Impuestos además guarda el reparto por año (`igv_general` e
`igv_ipm`, Ley 32387) solo como referencia: ningún cálculo las lee y el total sigue en 0,18.

**DESCARTÉ:**
- *Dejar «16 + 2»:* no mueve un número, pero cualquier nota o explicación al contador queda falsa para 2026, y el reparto entre IGV e IPM se mueve cada año
  mientras el total sigue en 18 %.
- *Modelar dos tasas (IGV 15,5 y IPM 2,5) con su propia lógica:* dos piezas nuevas para un total que se usa entero en cada cálculo.

**SE ROMPE SI:** cambia el **total** (no el reparto): entonces sí hay que sumar una vigencia nueva y revisar las copias fijas de 0,18 en la web
(por ejemplo `IGV_TASA` en `lib/registro-contable.ts`). Y si la fila nueva se intenta pegar con octubre ya cerrado, `fn_exigir_vigencia_sin_meses_cerrados`
(ADR-0433 act. 9) la puede rebotar: por eso va antes.

## 3 · El sueldo del personal del Taller es costo de producción, no gasto administrativo

**DECIDÍ:** la planilla del Taller entra al **costo de la prenda producida** (inventario de producto terminado) y **pasa a costo de ventas cuando la prenda se
vende**. Deja de ser gasto del mes. Se construye **después del motor de costo de recepción** y **con su propio ADR**: hay que definir qué personas son de
producción, a qué cuenta va (clase 9, 21, 71) y cómo se reparte entre las prendas de un lote. **Mientras tanto, octubre queda como ADR-0474:** toda la planilla en
la cuenta 62.

**DESCARTÉ:**
- *Dejarlo como gasto administrativo (hoy):* el margen bruto de lo producido sale inflado, y el gasto del mes incluye sueldos de prendas que todavía no se
  vendieron: el resultado sube y baja con el ritmo de venta, no con el negocio.
- *Repartir un porcentaje fijo de la planilla a producción:* inventa un número que nadie mide.

**SE ROMPE SI:** el Taller produce mucho menos de lo que puede (parado, sin tela, sin pedidos): cargar el sueldo entero a pocas prendas infla su costo y el
inventario queda valorado por encima de lo que vale (la NIC 2 manda llevar a gasto del periodo lo pagado por capacidad sin usar). O si el personal del Taller
hace también arreglos o muestras que no son una prenda producida.

## 4 · Costo de un fardo: el precio del papel por modelo; si no, proporcional al precio de venta

**DECIDÍ:** el costo de cada prenda de un fardo sale **del precio que dice el papel (factura o nota de venta) por modelo**, cuando el papel lo trae. Cuando solo
trae un total del fardo, ese total (**sin IGV si hay factura**, ADR-0417 decisión 2) se reparte entre los modelos **en proporción a su precio de venta ×
cantidad**. El costo se **sella al cerrar la recepción** (hoy lo fija `cerrar_conteo_envio`, ADR-0393) y no se recalcula al leer (ADR-0417 decisión 1).

**DESCARTÉ:** *total ÷ unidades, plano.* Una casaca y un polo costarían lo mismo: el margen por modelo sale falso, y el aviso de costo atípico se dispara
con los modelos baratos y se calla con los caros.

**SE ROMPE SI:** un fardo mezcla líneas con márgenes muy distintos (stock viejo liquidado junto a lo nuevo): el reparto proporcional le da el mismo margen
porcentual a todo el fardo, y el margen **por modelo** deja de decir algo (el del fardo entero sí es real). Y si el precio de venta cambia o entra a campaña
antes de cerrar la recepción: el reparto usa el precio de lista vigente al cerrar, no el de campaña. Los gastos de traer el fardo (flete, carretilla) siguen
fuera del costo de la prenda (ADR-0362 decisión 20) hasta que el contador diga otra cosa.

## 5 · Recepción: toda diferencia se registra y se avisa, y no bloquea recibir

**DECIDÍ:** toda diferencia de **cantidad** y de **monto** entre el papel o la guía y lo que llega **se registra, se avisa a la encargada de sede y no bloquea la
recepción**. **Sin tolerancia y sin umbral: se avisa toda diferencia, incluso de centavos** (Felipe, 22-oct). Ninguna se descarta sin quedar escrita. Las diferencias
de cantidad ya viven en `despacho_diferencias` (la deuda de «Nos debe», ADR-0393); las de monto son nuevas: comparan el papel registrado con el costo del lote.

**DESCARTÉ:**
- *Bloquear hasta resolver:* la mercadería ya está en la puerta con el fardo abierto; un bloqueo empuja a meter el stock por atajos (el «Ajustar stock» de
  reposición que ADR-0330 midió), y la diferencia se pierde.
- *Una tolerancia (±x %) o un monto mínimo para avisar:* lo que no se ve se acumula, y a fin de mes nadie sabe cuánto fue. Felipe lo quitó: se avisa todo.

**SE ROMPE SI:** los avisos por centavos entrenan a la encargada a ignorarlos (el mismo riesgo que ADR-0393 nombró para los pendientes). Es un riesgo que Felipe
aceptó con esta decisión; la salida, si pasa, es medir cuántos avisos nacen y cuántos se abren antes de poner cualquier umbral. Y si lo registrado no se lee, el chequeo
de la decisión 16 (envíos con diferencia) lo vuelve visible al cerrar.

## 6 · Mercadería sin comprobante y comprobante sin mercadería: dos listas a la vista

**DECIDÍ:** dos listas visibles, cada fila con su **antigüedad en días**: **«Recibido sin comprobante»** (la mercadería llegó, no hay papel) y **«Comprobante sin
recibir»** (hay factura o boleta registrada, la mercadería no llegó). **Sin cuenta puente y sin asientos en dos pasos.** El stock entra al contar (ADR-0330,
ADR-0393) y la deuda nace al registrar el papel (ADR-0362 decisión 9: el comprobante no bloquea).

**DESCARTÉ:** *una cuenta puente* («mercadería por recibir», «facturas por recibir»): dos asientos por cada hecho que deben cancelarse entre sí. Si una mitad
no llega, queda un saldo en la puente del que nadie sabe el origen, y quien opera la tienda no lleva contabilidad.

**SE ROMPE SI:** a fin de mes hay mucha mercadería recibida sin papel: el inventario está en el almacén pero la deuda con el proveedor no está en el Balance
(activo y pasivo quedan cortos a la vez). La lista lo muestra, el Balance no; el ajuste lo hace el contador a mano. **Solo «comprobante sin recibir» entra a los
chequeos del cierre** (decisión 16): recibir sin papel es normal en Gamarra y no se convierte en bloqueo.

## 7 · Activos fijos: se deprecia desde el mes de uso

**DECIDÍ:** la depreciación empieza **en el mes de uso**, no en el siguiente. El **mes de uso es el mes de `fecha_adquisicion`**; no se agrega un campo nuevo.
Hoy `fn_meses_depreciados` cuenta desde el mes siguiente a la compra; pasa a contar ese mes. Antes de cerrar octubre. Coincide con el Reglamento de la Ley del
Impuesto a la Renta (art. 22 c, ADR-0335) y quita uno de los dos apartamientos que ADR-0335 dejó anotados (≈ S/ 190–220 sobre la lista del Taller).

**DESCARTÉ:**
- *Dejar el mes siguiente:* libros y fisco no coinciden y el contador tiene que corregir cada mes.
- *Un campo «fecha de puesta en uso» por activo:* un dato más que alguien tiene que llenar y mantener, y de los 33 activos cargados solo se conoce la fecha de
  compra.

**SE ROMPE SI:** un activo llega un mes y se instala en otro (una máquina industrial): se deprecia antes de usarse. Ahí sí hace falta una fecha de uso editable; el
contador decide si compensa. O si se cambia la regla **después** de cerrar octubre: el diario congelado no cambia (la huella lo delata) y el activo se depreciaría
distinto a partir de noviembre que en el libro de octubre. La depreciación de apertura de los 33 cargados (`depreciacion_apertura`) se mide y se alinea al construir.

## 8 · Costo de un activo: sin IGV si hay factura; con IGV si no la hay

**DECIDÍ:** el costo de un activo es el **precio sin IGV cuando hay factura** (ese IGV es crédito fiscal) y el **precio con IGV cuando no hay factura** (boleta, nota
de venta o sin comprobante): ese IGV no se recupera y es parte del costo (NIC 16). **Los 33 activos cargados no tuvieron factura: su costo lleva IGV y no se toca.**
Esto reemplaza, solo para las compras nuevas con factura, la regla del 4-oct («el total pagado, con IGV», ADR-0335).

**DESCARTÉ:**
- *Siempre con IGV (la regla de antes):* donde hay factura, el mismo IGV queda como costo del activo y como crédito fiscal: se cuenta dos veces y la depreciación
  deducible sale sobrestimada.
- *Siempre sin IGV:* una compra sin factura dejaría el IGV sin lugar (ni crédito ni costo).

**SE ROMPE SI:** una factura de activo se paga en efectivo por S/ 2 000 o más y SUNAT no deja usar el IGV como crédito (el sistema ya mide ese «IGV perdido»,
ADR-0362, `fn_igv_perdido`): ese IGV pasa a ser costo y el activo tiene que llevarlo. O si la factura es de un emisor no válido (crédito fiscal sin validar al emisor:
tanda 2 de ADR-0433).

## 9 · Mermas y pérdidas de inventario: cuenta 6951

**DECIDÍ:** las mermas y pérdidas de inventario se asientan en la **cuenta 6951** (PCGE 2019, gastos por desvalorización de existencias: mercaderías; **el contador
la confirma**). Hoy `fn_asientos` las lleva a la **659** (reglas `merma_*` y `anulacion`, ADR-0120). **Cambia la cuenta, no el resultado:** la línea «Mermas» del
Estado de resultados suma la cuenta nueva donde hoy suma la 659, y el margen bruto da lo mismo. Los faltantes de caja (6599) y el redondeo (6598) no cambian. Antes de
cerrar octubre: un mes cerrado congela la cuenta con la que se asentó.

**DESCARTÉ:**
- *Dejarlas en la 659 (otros gastos de gestión):* una merma no es un gasto de gestión, y el contador la reclasificaría cada mes.
- *Una cuenta por tipo de pérdida (merma natural, daño, robo):* más cuentas sin que el negocio decida distinto; el motivo ya vive en `movimientos`.

**SE ROMPE SI:** queda la 659 escrita a mano en algún lugar (hoy: `lib/resultados-reglas.ts` y las migraciones del plan de cuentas, del
diario y de «Pérdidas, una sola definición»; `lib/registro-contable.ts` la nombra en un mapa viejo que ningún cálculo lee, y el ADR de mermas lo deja sin tocar): la merma saldría duplicada o en «otros» y el margen bruto se movería sin avisar. Por eso la prueba compara el Estado de
resultados de un mes de ensayo antes y después, y exige la misma cifra.

## 10 · Nota de venta: se deja como está y se mide

**DECIDÍ:** la nota de venta (ADR-0164: documento interno, sin IGV, serie por tienda, nunca a SUNAT) **se deja como está**. Se **mide** con un **tablero diario de las
notas de venta**: cuántas, en qué tienda, qué día y por qué monto, y cuántas siguen sin boleta, visible para el líder. Impuestos ya cuenta esa cifra por mes (bloque `revisar`
de `fn_impuestos_panel`); el tablero la abre por día y por tienda. **Sin libro aparte:** una venta con nota de venta es una venta de la empresa y está
en el diario como cualquier otra. Cómo se declara lo decide el contador.

**DESCARTÉ:**
- *Un libro interno aparte, o que la nota no sume a los ingresos declarables:* dos verdades de las ventas. Lo que el sistema muestra dejaría de ser lo que se
  declara. No se planea ni se construye.
- *Prohibirla ya:* sin saber cuánto se usa no se sabe si es un caso raro o la rutina, y la tienda seguiría vendiendo a mano. Primero se mide.
- *Convertirla en boleta:* ya descartado en ADR-0164 (3A: se anula la venta y se vende de nuevo con boleta).

**SE ROMPE SI:** el tablero muestra una proporción alta durante semanas y nadie actúa: se vuelve un número que se mira sin consecuencia. Con ese dato Felipe y el
contador deciden si la nota queda solo como documento previo a la boleta, emitida desde «Cobrar».

## 11 · Estado de resultados por tienda: hasta el resultado directo

**DECIDÍ:** el Estado de resultados de una tienda llega **hasta su resultado directo**: ventas, costo de lo vendido, mermas y los gastos de **esa** tienda. **Los
gastos centrales (administración, Taller, lo que no es de una tienda) no se prorratean:** quedan en una columna «Central». La suma de los resultados directos más
la columna central da el consolidado, y una prueba lo comprueba.

**DESCARTÉ:** *prorratear los gastos centrales (por ventas o por integrantes):* la tienda «pierde» o «gana» según una regla de reparto que alguien eligió, y el
número cambia cada vez que cambia la regla. ADR-0198 ya dejó fuera un Balance por tienda por la misma razón.

**SE ROMPE SI:** el resultado directo se lee como si fuera la utilidad de la tienda. La pantalla lo dice con su nombre («resultado directo») y muestra la columna
central al lado. O si un gasto central se registra con la tienda de quien lo paga y no con la que lo causa: baja el directo de esa tienda sin que sea suyo.

## 12 · Gasto rápido de Caja: desde S/ 100 lo aprueba un líder

**DECIDÍ:** un gasto rápido de Caja de **S/ 100 o más** queda **por aprobar** por un líder. Es la misma decisión del punto 7 de ADR-0433 (actividad 12, **todavía sin
construir**); aquí se confirma el umbral. El gasto se registra y la plata sale del cajón al momento; queda «por revisar» hasta que el líder lo apruebe. **Pregunta abierta
(la única de esta decisión):** si la aprobación del líder va **después** de sacar la plata (lo que el borrador asume, como el punto 7 de ADR-0433) o **antes**. Es otro
diseño según la respuesta; ver «Preguntas abiertas». No se construye hasta que Felipe la conteste.

**DESCARTÉ:**
- *Aprobación previa que frene el gasto:* la caja está en la tienda; si el líder no está, el gasto se paga igual desde otro bolsillo o no se registra, que es lo que
  ADR-0368 quiso quitar.
- *Aprobar todos:* pierde la rapidez del gasto rápido; los S/ 0.80 del baño volverían a no registrarse.

**SE ROMPE SI:** un gasto se parte en dos de S/ 99 para quedar bajo el umbral: el control mide por persona y por día, no por registro. O si los «por revisar» se
acumulan sin que ningún líder los abra; después puede sumarse al chequeo del cierre.

## 13 · Planilla: lo que todavía falta

**DECIDÍ:** el costo de planilla de octubre se cierra con lo que mide ADR-0474 (bruto + EsSalud + provisiones) y con **esta lista escrita y a la vista del
contador**: **feriados** (triple pago), **seguros** (vida ley, SCTR, EPS) y **otros conceptos** (bonificación extraordinaria del 9 %, vacaciones truncas,
utilidades). Cada concepto entra **solo cuando se mide contra el dato que Dynamic realmente trae**, no por una tasa supuesta en retail.

**DESCARTÉ:**
- *Estimar cada concepto en retail con tasas fijas:* inventa un costo que no es el de la póliza real y deja dos planillas que divergen (D-33: retail LEE la
  planilla de Dynamic, no la duplica).
- *Esperar a tenerlo todo para cerrar:* el primer cierre quedaría sin fecha.

**SE ROMPE SI:** estos conceptos pesan en un mes (varios feriados trabajados, el mes en que se pagan las utilidades): el resultado de octubre sale optimista y se
corrige tarde. **Advertencia abierta:** sumar la «bonificación extraordinaria del 9 %» como concepto aparte podría **contarla dos veces**, porque ADR-0474 dice que
`provision_total` **ya la trae**. Antes de sumarla hay que verificarlo contra el dato que Dynamic trae (ver «Preguntas abiertas»).

## 14 · El primer cierre es octubre 2026: ensayo propio ahora, firma la semana del 2-nov

**DECIDÍ:** el primer cierre real es **octubre de 2026**. **Ensayo propio desde ya:** se corre `fn_cierre_mes_estado` sobre octubre, se revisan el Estado de
resultados, el Balance y las listas de este ADR, **sin cerrar**. El **cierre firmado** se hace con contador/a la **semana del 2-nov**. Lo que mueva los números de octubre
(decisiones 7, 8 y 9) y lo que el cierre necesita para existir (2 y 16) se pega antes de ese cierre.

**DESCARTÉ:**
- *Cerrar octubre «de práctica» y reabrirlo:* queda en la historia un cierre y una reapertura con motivo que el contador va a leer, y mientras esté cerrado el
  candado por fecha impide registrar cualquier cosa de octubre.
- *Esperar al contador para mirar los números por primera vez:* el primer cierre se vuelve el ensayo y se congela con errores que se habrían visto antes.

**SE ROMPE SI:** el contador no puede esa semana y el cierre se corre a mediados de noviembre: octubre sigue abierto y sigue aceptando registros con fecha de
octubre, y el ensayo ya revisado queda viejo. Se rehace el ensayo la víspera del cierre.

## 15 · Alerta al llegar a 250 UIT del año calendario, y la tarjeta de 300 UIT al año calendario

**DECIDÍ:** el sistema avisa cuando las ventas netas del año calendario (sin IGV, menos notas de crédito, **de enero a hoy**) llegan a **250 UIT: S/ 1 375 000** con la UIT
de 2026 (S/ 5 500). Es el 83 % del límite de 300 UIT y deja tiempo para hablar con el contador **antes** de que cambie el pago a cuenta. Se suma al ámbar de Impuestos
desde el 60 %, que no cambia. **La alerta suma lo registrado en el sistema** (los comprobantes del ERP) y la pantalla lo dice: «El aviso cuenta lo registrado en el sistema: puede quedar
por debajo de la cifra real.» No se exige cargar nada más (Felipe, 22-oct). **La tarjeta del límite de 300 UIT de Impuestos pasa de 12 meses móviles al año calendario** (la norma mide el
ejercicio), para que la tarjeta y la alerta hablen de lo mismo; en enero las dos vuelven a cero solas. El aviso es un parámetro (`aviso_umbral_uit`, por año), no una cifra en el código.
Está construido en la rama de Impuestos (SQL por pegar, con su propio ADR-0484).

**DESCARTÉ:**
- *Dejar la tarjeta en 12 meses móviles y solo el aviso en año:* dos cifras para una norma en la misma pantalla, y en enero la tarjeta arrastraría diciembre.
- *Avisar a las 300 UIT:* ya es tarde; el pago a cuenta cambia desde el mes siguiente.
- *Sumar una fuente que no sea el registro del sistema para completar el acumulado:* Felipe decidió que la alerta cuenta lo registrado; un monto de otra fuente sería una segunda verdad.

**SE ROMPE SI:** hay ventas del año que no están en el sistema: el acumulado queda corto y el aviso llega tarde, sin error (por eso la pantalla lo dice siempre). Existe un ajuste
opcional por año (`ventas_previas_erp`, sin IGV, en soles, vale 0 si no se carga) para el caso en que el contador dé otra cifra; si ese monto ya está en los comprobantes, se cuenta dos veces.

## 16 · Los chequeos nuevos del cierre se miden por el mes que se cierra: octubre avisa, desde noviembre bloquean

**DECIDÍ:** cuatro chequeos nuevos en `fn_cierre_mes_estado`: **(a)** envíos con diferencia sin resolver, **(b)** conteos de inventario abiertos, **(c)** sobrantes de
traslado sin resolver, **(d)** facturas de compra con la mercadería todavía sin recibir o en camino (el «comprobante sin recibir» de la decisión 6). **Se miden por el MES que
se cierra, no por el día en que se cierra** (Felipe, 22-oct): el cierre de **octubre solo avisa** (se guarda en `periodo_cierres.avisos` y no impide cerrar), aunque se haga el
2-nov; **desde el cierre de noviembre bloquean**, y **una factura de compra con mercadería en camino SÍ frena el cierre desde noviembre**. La fecha de corte vive en un solo
parámetro, no escrita en cuatro funciones, y `cerrar_periodo` vuelve a medir los que bloquean (la pantalla no decide, como en los chequeos de hoy).

**DESCARTÉ:**
- *Bloquear desde octubre:* es el primer mes con el ERP completo y los cuatro chequeos tienen con qué salir rojos por cosas de arranque; el primer cierre quedaría
  esperando limpieza en vez de congelarse.
- *Avisar siempre:* un aviso que nunca bloquea se aprende a ignorar.
- *Cortar por la fecha del día en que se cierra:* bloquearía justo el cierre de octubre, que se hace en noviembre.

**SE ROMPE SI:** al cerrar noviembre aparece un rojo por una factura del último día del mes cuya mercadería llega después del cierre (es el costo que Felipe aceptó), o por una diferencia
vieja que nadie puede resolver (el proveedor ya no existe). La salida normal es registrar la recepción o cerrar la línea a propósito (cuenta como resuelta, como en el ADR de los
chequeos), nunca mover la fecha de corte; para la diferencia que nadie puede resolver hace falta una resolución con motivo y firma, no un botón de saltarse el bloqueo.

---

## Pendiente de contador

Nada de esto lo decide el sistema ni este ADR. Se lleva a la reunión del cierre (semana del 2-nov):

1. **Régimen y pago a cuenta** (1): RMT y 1 %; si el ejercicio anterior cambia el coeficiente o la tasa de 2026; que el límite de 300 UIT se mide por el ejercicio (el año
   calendario, como quedó en la decisión 15); qué cambia al pasarlo (tasa, libros).
2. **Mermas** (9): cuenta 6951 y si los faltantes de conteo y los desmedros van aparte.
3. **Depreciación** (7): desde el mes de uso, y las vidas útiles que el sistema ya trae.
4. **Costo del activo** (8): sin IGV con factura, con IGV sin ella, y el IGV perdido por pago en efectivo.
5. **Costo de producción** (3, 4): la planilla del Taller al costo de la prenda; el reparto de un fardo por precio de venta relativo; si el flete de llegada entra
   al costo (ADR-0362 decisión 20 dice que la NIC 2 lo pone dentro).
6. **Mercadería sin papel a fin de mes** (6): cómo quiere el ajuste del Balance.
7. **Notas de venta** (10): cómo se tratan en la declaración.
8. **Planilla** (13): feriados, seguros, utilidades y el régimen laboral (REMYPE) que fija cuánto se provisiona de gratificación, CTS y vacaciones.
9. **Cuenta de EsSalud y beneficios** (ADR-0474): hoy todo va a la 62; él dice si se reparte en 621, 627 y 629.
10. **IGV 15,5 % + IPM 2,5 %** (2): confirma la redacción para 2026.

## Qué no cambia

- **El núcleo de inventario** (`productos`, `variantes`, `stock`, `movimientos`) y `movimientos` como registro que solo se agrega.
- **Lo que se cobra y se declara:** el IGV total sigue en 18 %; ningún comprobante, SUNAT/Lucode ni margen cambia por este ADR.
- **Septiembre no existe para Finanzas** (ADR-0332) y **ningún mes está cerrado**; un mes cerrado se queda cerrado.
- **La planilla de octubre** sigue como ADR-0474 (todo en la 62) hasta el ADR de la decisión 3.
- **Los 33 activos y los costos ya cargados** no se reescriben.
- **La nota de venta** sigue igual (ADR-0164); solo se mide.
- **Producción:** este ADR no pega nada. Cada construcción (migraciones, dinero, permisos) pide el OK de Felipe, y cada migración lleva el prefijo `retail.` y se parte
  en partes si mezcla `alter` de tablas en uso con políticas (ADR-0195).

## Cómo se verifica (cuando se construya)

- **7 y 8:** una compra del día 15 deprecia una cuota en su mes; una factura de activo queda sin IGV y una boleta con IGV; una factura pagada en efectivo por S/ 2 000
  o más lleva el IGV al costo.
- **9:** el Estado de resultados de un mes de ensayo da la misma cifra de mermas y de margen bruto antes y después; no queda un `659` literal para mermas.
- **11:** la suma de los resultados directos de las tiendas más la columna central es igual al consolidado.
- **15:** la tarjeta de 300 UIT y el aviso de 250 UIT leen la misma cifra (el año calendario de los comprobantes); con el reloj puesto en enero, lo de diciembre ya no suma.
- **16:** un cierre de octubre con un chequeo rojo avisa y cierra, aunque se haga ya entrado noviembre; el mismo caso en noviembre bloquea, también la factura con mercadería en camino.
- **El ensayo (14):** `fn_cierre_mes_estado` sobre octubre sin cerrar, con el aviso o el bloqueo de cada chequeo a la vista.

## Lo que sale de escribirlo

- **La alerta de 250 UIT (15) no podía disparar a tiempo con el cálculo de antes:** `fn_impuestos_panel` medía 12 meses móviles. La causa raíz se corrige pasando la tarjeta y la alerta al año
  calendario de lo registrado en el sistema; está construido en la rama de Impuestos.
- **«Desde noviembre» (16) tenía dos lecturas** (por el mes que se cierra o por la fecha en que se cierra). Felipe eligió la primera el 22-oct.
- **Tres decisiones (7, 8 y 9) mueven los números de octubre y dos más (2 y 16) tienen que existir antes de cerrar:** esas cinco tienen plazo, la firma del cierre.
  Las demás pueden ir después sin dejar a octubre con una regla distinta.

## Preguntas abiertas

1. **Decisión 12 · Gasto rápido de Caja desde S/ 100:** ¿el líder aprueba **después** de sacar la plata (el borrador lo asume, como el punto 7 de ADR-0433) o **antes**? Con «antes», el gasto
   espera al líder y la tienda puede quedarse sin quien apruebe; con «después», la plata ya salió y la aprobación es un control de revisión.
2. **Decisión 13 · Bonificación extraordinaria del 9 %:** ¿entra como concepto aparte? ADR-0474 dice que `provision_total` **ya la trae**; sumarla aparte podría contarla **dos veces**. Se
   verifica contra el dato que Dynamic realmente trae antes de construir nada.
