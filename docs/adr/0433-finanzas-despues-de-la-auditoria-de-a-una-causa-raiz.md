# ADR-0433 · Finanzas después de la auditoría del 16-oct: se arregla de a una causa raíz, y el dinero espera el OK de Felipe

- **Fecha:** 2026-10-16 · **Estado:** en construcción. Tanda 1, actividad 1 hecha **y en producción** desde el 2026-10-16 con el OK de
  Felipe: migración `20261016211000` (versión de producción `20261016212808`) y los datos de las cuatro cajas
  (`pegar-en-produccion-caja-fondo-2026-10.sql`). Rama `claude/finanzas-auditoria-arreglos`.
- **Pedido:** Felipe, 2026-10-16: «estoy seguro que hay varios errores», analizar el módulo con todas las herramientas y revisar las maquetas
  de un colega. Salió una auditoría de solo lectura (433 agentes: 35 revisores por eje, ~355 escépticos que intentaron refutar cada hallazgo,
  un crítico de huecos y una síntesis) contra `main` + producción. 30 causas raíz (G01–G30); lo que salió limpio y lo que no se pudo
  verificar está en el informe, que **no vive en el repo** porque trae hallazgos de seguridad.
- **Decisiones de Felipe** (por pregunta, 2026-10-16):
  1. Lo confirmado se arregla **de a una causa raíz**; lo que toque dinero, permisos, migraciones o SUNAT pide su OK antes de escribir.
  2. El medidor de confianza deja el porcentaje y pasa a **la lista de lo que falta** (los pesos 30·20·15·10·10·10·5 no tienen base
     estadística y un mes de datos no sostiene una cifra de dos dígitos; ADR-0214).
  3. CAYLA tributa en **Régimen MYPE Tributario** y **lo declara el contador**: Impuestos apoya al contador, no declara.
  4. **El margen debe ser el real**: se calcula sobre las ventas con costo conocido y dice sobre qué parte de lo vendido (hoy ~38 %); lo
     estimado queda aparte como «costo pendiente».
  5. Los costos cargados en el sistema **traen IGV** (total de la factura): ADR-0417 decisión 2 (todo costo sin IGV, con rastro) se
     aplica, antes midiendo con 10 productos contra su factura.
  6. «Hoy tienes S/ …» se muestra **provisional**, con la lista de lo que falta cargar; el IGV y la renta a cuenta **entran** a la
     proyección de caja.
  7. Un **gasto rápido de caja pide revisión del líder desde S/ 100**.
  8. **Cada encargado ve solo su tienda** en Finanzas; el consolidado y la planilla, solo líder/Admin.
- **Plan (tanda 1, antes del primer cierre ~1-nov, 14 actividades, un commit cada una):** 1 cajas cerradas con fondo coherente · 2 montos con
  coma · 3 QR como entrada en el Flujo · 4 proyección honesta · 5 medir la base de IGV del costo · 6 costos sin IGV con rastro · 7 margen
  real con cobertura · 8 cada encargado ve su tienda · 9 un mes cerrado se queda cerrado · 10 abonos de apartado por día de pago · 11 boleta
  dada de baja deja de contar · 12 gasto rápido con revisión desde S/ 100 · 13 cascada del Resumen sin doble conteo · 14 medidor como lista.
  Tanda 2, fuera hasta nueva aprobación: cargadores que confunden error con vacío, seguridad menor, Interbank y «por depositar», Taller al
  diario, crédito fiscal sin validar al emisor, topes de los pagos de planilla y SUNAT, observabilidad y documentación, maquetas al día.
- **PR #1127:** ya está fusionado en `main` (16-oct 19:23 UTC) y sus tres migraciones en producción; no se parte, quedan PR de seguimiento.

## Actividad 1 · Una caja cerrada cuadra su fondo (G01)

**El problema.** Una caja cerrada guarda tres números que se pertenecen: lo contado, lo trasladado y lo que dejó en el cajón. ADR-0186 dice
que el fondo «se calcula, nunca se escribe», pero nada en el esquema lo exigía. El 16-oct alguien regularizó a mano un traslado de S/ 700
de Trujillo (8-oct) sin tocar el fondo: quedó en 977.20 en vez de 277.20, el cajón se infló en 700 y el Diario asentó un «faltó al abrir» de 700
en la 6599 contra Resultados de octubre. Segundo hilo: `archivar_caja_prueba` dejaba congelado en la caja real siguiente el «esperado» de
una caja que ya no contaba (Arequipa: 0.00 en vez de 300.00), y el Diario leía ese número mientras el Flujo leía el fondo en vivo.

DECIDÍ:
- Un **candado diferido** (disparadores de restricción en `caja_traslados` y `cajas`, que se miran al confirmar, como una llave foránea):
  una caja cerrada real con fondo escrito cumple contado = fondo + trasladado. Vuelve a leer la caja al confirmar (un disparador diferido
  recibe la fila del evento, no la última), así `cerrar_caja` escribe en el orden que quiera. Cierra el estado imposible por esquema, no por
  una validación de pantalla (principio 2).
- `archivar_caja_prueba` recalcula, con la regla de `abrir_caja`, lo esperado por la primera caja real posterior, y deja un motivo si la
  apertura ya no coincide (el candado `caja_apertura_explica_diferencia` lo exige).
- Los datos de hoy no se tocan en la migración: van en un script aparte, idempotente, con su vista previa y sus comprobaciones.
- La invariante **INV-21** de `/chaos` vigila lo que ya estaba o lo que se cuele por una puerta nueva.

DESCARTÉ:
- **Un disparador que recalcule `monto_fondo`:** esconde la discrepancia en vez de decirla y reescribe en silencio una columna que alguien
  tecleó; el rechazo con mensaje obliga a regularizar completo.
- **Que el Diario lea el fondo anterior en vivo** (como `fn_flujo_lineas`): toca `fn_asientos_dinero_y_caja`, muy parchada por ancla, para
  corregir UNA fila; el recálculo al archivar corrige la causa y deja el Diario como está.
- **Una RPC `regularizar_traslado_de_caja` con pantalla:** hoy ocurre una vez al mes a mano; sin pantalla que la llame sería una función
  sin llamador. Si se vuelve rutina, se hace.

SE ROMPE SI:
1. Se agrega un camino nuevo que escriba `caja_traslados` o el cierre de una caja sin respetar contado = fondo + trasladado: el candado lo
   rebota al confirmar, con el mensaje de qué corregir.
2. Una prueba o un script confirma una caja cerrada con datos a medias dentro de una transacción de una sola sentencia: el candado se mira al
   confirmar, no por sentencia.
3. Se quiere regularizar un traslado de una caja cuya siguiente ya abrió: hay que corregir también el esperado de la siguiente (el mensaje lo dice).

**Verificado.** `scripts/pruebas/caja_fondo_coherente.mjs` (9 casos, ROLLBACK): 5 fallaban antes de la migración y los 9 pasan después; pegada
dos veces, sin error. 60 suites que tocan cajas contra una copia de la base local con las migraciones de `main`: las mismas 10 fallan con y
sin esta migración (estado y fechas de la base compartida), 50 pasan. `node --test scripts/chaos/*.test.mjs` 31/31 y la autoprueba de `/chaos`
detecta la INV-21.

**En producción (2026-10-16).** Sonda de solo lectura (md5 de `archivar_caja_prueba` igual al que reemplazaba, 0 disparadores, 1 caja
incoherente), ensayo en un solo lote que termina en excepción (2 disparadores, 0 incoherentes, octubre mejoraba en aperturas S/ 581.10, nada
quedó guardado), aplicación y verificación: md5 de las dos funciones iguales a los de local, los dos disparadores diferidos, 0 cajas
incoherentes, fondo de Trujillo 277.20, esperado de Trujillo 277.20, esperado de Arequipa 118.90.
**Arequipa, decidido por Felipe** («todo está cuadrado al día de hoy, registra el traslado»): los 181.10 que faltaban en la apertura del 1-oct
se registraron como un traslado a la caja fuerte de Arequipa (en la caja real anterior, 285b6d7c, fechado un minuto antes de que abriera la
siguiente; su fondo pasa de 300.00 a 118.90), no como faltante: la caja fuerte pasa de 2065.84 a 2246.94 y la suma de «sobró/faltó al abrir»
de octubre pasa de −734.50 a −153.40 (Trujillo −700 desaparece; Arequipa +118.90 desaparece). **Pendiente, sin inventar cifras:** Felipe
mencionó también «el depósito a cuenta»; falta el monto, la fecha y la cuenta para registrarlo.

## Actividad 2 · Los lectores de monto de Finanzas entienden la coma decimal (G07)

**El problema.** ADR-0419 (act. b) daba por hecho que los lectores de monto de Finanzas ya aceptaban la coma, y no era cierto: cuatro hacían
`.replace(/,/g, "")` y «648,50» se guardaba como S/ 64 850 (Registrar gasto, depósitos entre cuentas, saldo inicial de cuenta, topes de
presupuesto, fondos de tienda, saldos de arranque), y el de Por pagar leía «1,299» como 1.30 y aceptaba «1e3» y «0x10». Nada avisaba: solo
frenaba el tope de S/ 1 000 000.

DECIDÍ: los cuatro (`parsearMonto` de gastos y de configuración, `leerMontoArranque`, `parseMonto` de Por pagar) y el saldo del banco de
Cuentas y dinero delegan en `leerMontoPlata` (`lib/monto-plata-reglas.ts`), conservando cada contrato (vacío = 0 o `null`, `NaN` en Por pagar,
mensajes). Una sola regla en vez de cinco; «12.500» y «1e3» ya no se adivinan, se piden de nuevo.
DESCARTÉ: dejar cada lector con su propia regla y parcharles la coma (cinco reglas que vuelven a divergir), y tocar `limpiarMonto` del gasto y el
ingreso rápido, que normalizan mientras se teclea y tienen su contrato escrito (ADR-0368).
SE ROMPE SI: un lector nuevo vuelve a borrar comas: `lib/monto-lectores.test.ts` (tabla de 19 casos × 4 lectores y un candado de archivo sobre
los de Finanzas) lo nombra; una línea legítima se exime con `// coma-fija: <motivo>` (hoy dos: la tasa de impuestos y la clave de búsqueda de
notas de crédito). **Fuera de esta actividad, anotado:** Compras (`orden-compra-alta.ts`, `plan-compra-reglas.ts`) tiene sus propios lectores;
y el signo de un saldo inicial (G08) es otra decisión.
**Verificado.** La prueba nueva falló con 42 casos antes del cambio y pasa 78/78 después; con una mutación (volver a borrar comas en gastos) cae con
16. `tsc` limpio, eslint limpio, Knip limpio, vitest completo 532 archivos / 160 287 pruebas.

## Actividad 3 · El QR entra en el Flujo (G05)

**El problema.** `fn_flujo_lado` manda a «sale» todo lo que no reconoce. Cuando 20261002130000 sumó el QR como medio de cobro (hoy el 21 % de lo
cobrado) nadie lo anotó en la lista de «entra»: cayó en «sale» con signo POSITIVO. Medido en producción (`fn_flujo_caja_real` del 1 al 16 de octubre):
«Salió» −10 257.86 donde lo real es −2 948.90, «Entró» 47 651.66 donde lo real es 60 858.42, y los «días de caja» del Resumen salen 87 en vez de ~52.
La identidad del saldo seguía en cero porque los dos errores se compensaban.

DECIDÍ: el QR entra a la lista de «entra» de `fn_flujo_lado` (una función, la misma; `fn_flujo_lineas` ya emitía la categoría `qr`), y la web le da su
rótulo y su lugar entre los medios. La defensa de fondo es una guarda en la suite `flujo_caja`: recorre los medios que acepta `venta_pagos` (el CHECK)
y exige que cada uno entre por «entra»; un medio nuevo sin su lugar falla en el CI, no en la pantalla del líder.
DESCARTÉ: una lista cerrada con un lado «desconocido» (que propone el informe): pediría un cuarto lado en `fn_flujo_caja_real`, la proyección y tres
lectores de la web, y una categoría desconocida quedaría fuera de entró, salió y ajustes sin que nada la nombre, que es peor que mal clasificada.
SE ROMPE SI: se agrega un medio de cobro y no se actualiza `fn_flujo_lado`: la guarda lo dice. **No incluye** `pago_planilla` y `pago_sunat` (siguen
cayendo en «entre cuentas», hoy 0 filas): clasificarlos como «sale» sin tocar la proyección contaría dos veces la planilla (la proyección ya le suma
la de Dynamic a la salida diaria); van con la proyección, en la actividad 4.
**Verificado.** Suite `flujo_caja` 60/60 con la migración, y 4 de los 60 casos (los nuevos) fallan sin ella; las suites vecinas pasan igual que antes
(`pedidos_web_entregar` y `redondeo_efectivo` fallan igual con y sin la migración, por el estado de la base local). vitest 160 288 pruebas, `tsc` y Knip limpios.

## Actividad 4 · La proyección de caja dice con qué se apoya (G05, G06)

**El problema.** «¿Me alcanza?» decía «Hoy tienes S/ 57 mil» y «~86 días de caja» sin una advertencia, con cuatro errores a la vez: los cobros de la
tienda sin meta eran lo cobrado en 8 semanas ÷ 8 aunque solo hubiera 2 o 3 de cada día (~S/ 7 400 por semana contra ~26 000 reales); «lo que sale» no traía
el IGV ni el pago a cuenta de renta; los pagos de planilla y de SUNAT (0 filas hoy) caían en «entre cuentas»; y nada decía que el punto de partida es
provisional (las cuentas arrancaron en 0 el 25-sep, con 0 facturas de proveedor y un mes de historia).

DECIDÍ (Felipe, 2026-10-16: «Hoy tienes» provisional con la lista de lo que falta; el IGV entra porque no incluirlo es confuso):
- **Cobros por fechas reales y con contracción** (lente 4 de /rigor): el promedio de cada día de la semana se divide entre los días de ESE día que pasaron
  desde que la tienda empezó a vender (tope de 8 semanas) y se contrae hacia el promedio diario de la tienda: (suma + 2 × diario) ÷ (días + 2). Con 8 días
  pesa 80 % lo suyo; con 1, 33 %. Con menos de 4 días dice `promedio_corto`. Una tienda con un solo cobro de S/ 800 proyecta 342.86 ese día y 76.19 los
  demás, y la semana vuelve a sumar 800: ni extrapola un día atípico ni pierde plata.
- **IGV y pago a cuenta de renta** del mes en curso, lo acumulado hasta hoy (una cota que sube con lo que falte vender), el día 15 del mes siguiente
  (no hay RUC ni calendario de SUNAT cargados; la ventana real es del 12 al 22). La línea de IGV es EXACTAMENTE el `a_pagar` que dice Impuestos. Si la cuenta
  no ve Impuestos, la proyección sigue sin ellos y lo dice (`incluye_impuestos`): se degrada, no se cae (lente 5).
- `pago_planilla` → «planilla» y `pago_sunat` → «impuestos» en el Flujo real, y fuera del «día normal» de la salida diaria (la planilla ya se suma aparte).
- La base dice con qué se proyecta (`historia_dias`, `saldo_inicial_declarado`, `hay_facturas_de_proveedor`, `incluye_impuestos`) y da UN veredicto,
  `dias_de_caja_confiable` (28 días de ventas y algún saldo declarado). La web marca «provisional», lista lo que falta con su enlace
  (`FaltanProyeccion`, la misma pieza en el Flujo y en Cuentas y dinero) y no pinta en verde «dentro del mínimo» mientras tanto.
DESCARTÉ: ocultar las cifras hasta tener saldos (la pantalla quedaría vacía en plena migración y no empujaría a completar); tomar el IGV del mes anterior como
proxy (septiembre es casi nada frente a octubre); dividir entre 8 con un aviso (sigue subestimando ~3.5 veces).
SE ROMPE SI: se pega la web antes que la migración (los campos nuevos llegan vacíos y la web no inventa: no dice «provisional»); un IGV de otro vencimiento
que no sea el día 15 (hoy es un punto medio); se vuelve a ver un mes cerrado… (no aplica: la proyección mira hacia adelante).
**Verificado.** `flujo_caja` 75/75 (12 casos nuevos o corregidos fallaban sin la migración: 7b, 7c, 10b, 10c y 11); 13 suites vecinas (las que re-pegan sus
migraciones sobre la proyección y el flujo incluidas) pasan; `lib/flujo-caja-reglas.test.ts` y `lib/dinero-pulso-reglas.test.ts` (los literales viejos son
«base vieja»: no dicen nada); la guía de Cuentas y dinero y la del Flujo dicen «provisional» y sus huellas se aceptaron tras revisarlas. vitest 160 297, `tsc`
y Knip limpios. **No verificado en el navegador:** la base local compartida no tiene la migración (probé la función y la regla pura); queda para el pase final.
