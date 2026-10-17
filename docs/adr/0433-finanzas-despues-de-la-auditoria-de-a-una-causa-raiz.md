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
**En producción (2026-10-16, con el OK de Felipe).** Versión `20261016215831`; md5 de `fn_flujo_lado` igual al de local; «Salió» del 1 al 16 de octubre pasó de 10 557 a 2 949 y «Entró» de 48 578 a 62 084, descuadre 0.
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
**En producción (2026-10-16, con el OK de Felipe).** Versión `20261016215857`, tras sonda (md5 de las tres funciones iguales a las que se anclaron) y un ensayo en un lote que termina en excepción; md5 de las tres funciones iguales a los de local, `fn_flujo_lado` sin permiso para `authenticated`. Medido como líder: cobro de la primera semana proyectada 7 424 → 26 036, días de caja 90 → 53 (`confiable` = falso: 16 días de historia y ningún saldo declarado), IGV de octubre hasta hoy S/ 9 322 y renta S/ 518 el 15 de noviembre.
**Verificado.** `flujo_caja` 75/75 (12 casos nuevos o corregidos fallaban sin la migración: 7b, 7c, 10b, 10c y 11); 13 suites vecinas (las que re-pegan sus
migraciones sobre la proyección y el flujo incluidas) pasan; `lib/flujo-caja-reglas.test.ts` y `lib/dinero-pulso-reglas.test.ts` (los literales viejos son
«base vieja»: no dicen nada); la guía de Cuentas y dinero y la del Flujo dicen «provisional» y sus huellas se aceptaron tras revisarlas. vitest 160 297, `tsc`
y Knip limpios. **No verificado en el navegador:** la base local compartida no tiene la migración (probé la función y la regla pura); queda para el pase final.

## Actividad 8 · Una sola regla de «quién ve todas las tiendas y la empresa» (G16)

**El problema.** Dos funciones hermanas que leen el MISMO diario decidían distinto quién ve «todo». ADR-0253 (Felipe, 2026-09-28) dijo que quien tiene Configuración,
Cierre de mes (y, desde ADR-0275, CAYLA Global) ve las finanzas «todo, como el líder», y la migración `20260928220000` lo aplicó a `fn_asientos`,
`fn_diario_ubicaciones`, `fn_campanas_reporte`, `fn_presupuesto_vs_real`… pero dejó con `fn_es_lider()` a `fn_diario`, `fn_estado_resultados`, `fn_balance_por_tienda`,
`fn_balance_general` y `fn_gastos_fuera_de_lo_normal`. Quien cierra el mes congela el diario ENTERO (la empresa incluida) pero, al abrir el mes cerrado, `fn_diario` le
deja fuera las líneas de la empresa (`null = any(…)` es nulo), el Estado de resultados no le muestra «De la empresa» ni el consolidado, y el Balance por tienda mide la
utilidad de UNA sola tienda (le pasa `v_ubics[1]`). Números distintos para el mismo mes según quién mira, sin ningún error. La web agravaba lo mismo: preguntaba
`persona.rol === "lider"`, otra regla. Hoy no se nota (el rol «Producción» tiene Cierre de mes, 1 persona activa, y ningún mes está cerrado); se nota en cuanto se cierre el
primero, y la actividad 9 —que hace que el Estado de resultados lea el diario congelado— lo necesita resuelto.

DECIDÍ (cumple una decisión que Felipe ya tomó en ADR-0253; no es una decisión nueva):
- **Un solo predicado, `fn_ve_finanzas_de_todo()`, en las cinco funciones** (`20261017010000`, reemplazos anclados sobre la definición viva; si el ancla no aparece exactamente
  una vez, la migración aborta; idempotente). Para el LÍDER nada cambia. Para un rol con Configuración, Cierre de mes o CAYLA Global, el Estado de resultados trae las mismas
  unidades que el líder (tiendas, «De la empresa», consolidado), el diario congelado trae las mismas líneas y el Balance por tienda mide cada tienda igual.
- **Un encargado con solo «Reportes financieros» sigue viendo SOLO su tienda** (`fn_diario_ubicaciones()` le devuelve su sede) y recibe 42501 al pedir otra, en cada una de
  las funciones (casos C de la prueba).
- **En la web, la misma pregunta una sola vez:** `veFinanzasDeTodo(rol, modulos)` (`lib/modulos.ts`) espeja la función de la base y una prueba la cruza con la ÚLTIMA migración que
  la define (`lib/modulos.test.ts`: si alguien le suma un módulo a la base y no a la web, falla). El Estado de resultados la usa en vez de `rol === "lider"`.
- **El candado es estructural, no una lista** (`scripts/pruebas/finanzas_alcance_coherente.mjs`, caso A1): ninguna función que reparta el alcance con `fn_diario_ubicaciones()`
  puede preguntar `fn_es_lider()` por su cuenta. Así lo encontró: `fn_gastos_fuera_de_lo_normal` era una quinta hermana que el informe no listaba.
DESCARTÉ: arreglar solo las tres funciones del informe (la quinta seguía igual y una futura hermana volvería a nacer con `fn_es_lider()`); un predicado nuevo `fn_alcance_finanzas()` (ya
existe uno con el significado exacto; otro nombre es otra cosa que mantener); llevar también a `fn_resumen_finanzas` y `fn_por_pagar_consolidado` (no leen el diario ni usan
`fn_diario_ubicaciones()`; es otra decisión de Felipe y queda en el backlog).
EFECTO QUE HAY QUE NOMBRAR (lo midió la revisión adversarial): `fn_presupuesto_vs_real` y `fn_presupuesto_propuesta` leen `fn_estado_resultados`; para quien ve todo, «Presupuesto vs real» deja de
mostrar en cero el gasto real de la empresa y de CAYLA, y «Proponer desde el promedio» recibe la línea de la empresa (caso B5b). Medido en producción (solo lectura, 2026-10-16): un solo rol tiene
alguno de los tres módulos —Cierre de mes—, con 1 persona y 0 terminales.
NO CAMBIA, a propósito: `fn_exigir_lider_balance()` —«el Balance de CAYLA entera y sus saldos de arranque los ve el líder»— sigue siendo solo del líder (no entró en ADR-0253); por eso la
página del Balance y las de Presupuesto y Campañas conservan su `esLider` (en las dos últimas mezcla el alcance con el enlace a Configuración, que exige ese módulo; separar las dos
cosas queda para el seguimiento).
SE ROMPE SI: una migración futura vuelve a crear una de estas funciones copiando su texto de un archivo VIEJO del repo (le devuelve `fn_es_lider()`; el caso A1 y los B/E lo atrapan); se
agrega un módulo a `fn_ve_finanzas_de_todo()` sin sumarlo a `MODULOS_QUE_VEN_TODO_FINANZAS` (lo atrapa la prueba cruzada).
**Verificado.** `pnpm pruebas:finanzas-alcance`: 24 verificaciones, 7 fallan sin la migración (A1, A2, B2, B3, B4 y los dos del mes CERRADO, E1 y E2: el síntoma real del informe) y las 24
pasan con ella; las 13 suites vecinas (balance, cierre de mes, estado de resultados, presupuesto, resumen, roles…) dan lo mismo con y sin la migración (3 fallos que ya existían en la base local
y no son de este cambio: `cierre_mes` G, `redondeo_efectivo` y `roles_cobertura_modulos`); vitest 160 826 pruebas, `tsc`, ESLint y Knip limpios; prueba de mutación de la web (quitar un módulo de
`MODULOS_QUE_VEN_TODO_FINANZAS` rompe la prueba cruzada). **No verificado en el navegador:** el rol «Producción» no tiene cuenta de prueba local; queda para el pase final.

## Actividad 9 · Un mes cerrado se queda cerrado (G09)

**El problema.** Cerrar un mes congela su diario (`diario_cerrado`) y le saca una huella: es lo que el contador recibe. Tres grietas dejaban que ese número cambiara DESPUÉS, o que un
registro se colara sin que nadie lo supiera. (1) El Estado de resultados leía el diario VIVO (`fn_asientos`) y no el congelado (`fn_diario`, que ya existía y solo usaba el Balance): lo que cambiara
en el diario vivo de un mes cerrado —una planilla corregida en Dynamic, un cambio por fuera del sistema— movía el Estado de un mes que el contador ya tiene, y el Balance y el Estado del mismo mes dejaban de
cuadrar entre sí. (2) `archivar_caja_prueba` y `guardar_parametro_tributario` (el IGV y el tope de la planilla de movilidad rigen hacia atrás) cambiaban el diario vivo de un mes cerrado sin pasar por el
candado de mes. (3) El candado (`fn_exigir_mes_abierto`) miraba `periodos` con la foto de la sentencia que lo llama y sin ningún cerrojo compartido con `cerrar_periodo` (que sí toma `cierre_mes:<mes>`):
un gasto con fecha del mes que se cierra, registrado mientras el cierre se confirmaba, pasaba el candado y quedaba FUERA del diario congelado. **Reproducido con confirmaciones reales** en una copia
desechable de la base (dos sesiones; sin el arreglo): el gasto de noviembre se guardó, el diario congelado quedó con 0 líneas y el vivo con 2; con el arreglo, el gasto esperó, vio el mes cerrado y se
rechazó con «Noviembre 2024 de Tienda Trujillo está cerrado» (0 gastos guardados).

DECIDÍ (Felipe, 2026-10-16: aprobada la actividad 9 de la tanda 1, antes del primer cierre):
- **El Estado de resultados lee `fn_diario`** (reemplazo anclado de una línea, `20261017012000`): un mes abierto sale idéntico (`fn_diario` llama a `fn_asientos`); uno cerrado, de su foto. Los contadores
  de «prendas y mermas sin costo» siguen vivos A PROPÓSITO: son avisos de qué falta cargar, no cifras del cierre. La web marca «cerrado» bajo cada columna cerrada (`fn_periodos_mes`) con una nota
  («no cambian aunque después se corrija algo; se reabre en Cierre de mes»), y «De dónde sale» lee la misma foto, así que las líneas detrás de una cifra son las de la cifra.
- **El candado de mes toma el cerrojo compartido del cierre** (lente 5 de /rigor, resiliencia): `fn_exigir_mes_abierto` pasa de STABLE a VOLATILE y, antes de mirar `periodos`, toma
  `pg_advisory_xact_lock_shared('cierre_mes:<mes>')` de cada mes cerrable del rango (solo meses ya terminados, tope 120; una venta de hoy no paga nada). Así quien registra espera a que termine un cierre
  en marcha, y un cierre espera a quien está registrando. **Lo que cambió el diseño:** ser VOLATILE no es un detalle: una función STABLE lee con la foto de la sentencia que la llamó, de modo que aun
  tomando el cerrojo habría seguido viendo `periodos` sin el cierre confirmado. Con VOLATILE la lectura que sigue al cerrojo toma una foto nueva.
- **`archivar_caja_prueba` pasa por el candado** con las fechas de la caja (el cierre de una caja y su diferencia entran al diario por su fecha); **`guardar_parametro_tributario` rechaza una vigencia
  del IGV o del tope de planilla que alcance un mes cerrado** (`fn_exigir_vigencia_sin_meses_cerrados`, errcode `P0001`, hint `periodo_cerrado`). La UIT, el régimen y el pago a cuenta no entran al diario y
  no se guardan. Un re-guardado del mismo valor ya confirmado sigue siendo un no-op.
- **Dynamic puede volver a congelar períodos ya pagados** (hasta 7 versiones en 7 semanas; la vista toma siempre la última): `14-DYNAMIC.md` §7.1 decía lo contrario y se corrigió; el chequeo «huella» del
  cierre ya lo avisa sin bloquear y su texto ya no culpa solo a Dynamic.
DESCARTÉ: `FOR SHARE` sobre `periodos` (bloquea filas que el cierre también actualiza); un cerrojo por cada mes de una vigencia de IGV desde 2011 (180 cerrojos por una acción rara de Configuración); bloquear
a Dynamic (no es nuestro sistema: se avisa); recomputar la huella viva dentro de `cerrar_periodo` tras congelar (el chequeo «huella» ya lo hace después, y el cerrojo cierra la carrera que lo motivaba).
SE ROMPE SI: una vigencia retroactiva se guarda en el mismo instante en que se cierra el mes (el cerrojo no cubre los parámetros; el chequeo «huella» lo avisaría); una migración futura vuelve a crear
`fn_exigir_mes_abierto` como STABLE (la prueba de dos sesiones, D1 y D2, lo atrapa); alguien registra con una fecha de un mes cerrado a través de una vía que no pasa por un `fn_candado_*` (el candado de mes
solo cubre lo que lo llama).
**Verificado.** `pnpm pruebas:finanzas-mes-cerrado`: 16 verificaciones (el Estado de resultados no cambia una cifra tras una deriva en el diario vivo; archivar una caja de un mes cerrado y las vigencias retroactivas se
rechazan, las de un mes abierto o futuro no; y DOS SESIONES reales entrelazadas, con `lock_timeout`, en las dos direcciones, más el control de que un gasto de HOY no espera): 9 fallan sin la migración y las 16
pasan con ella; la carrera con confirmaciones reales en una base desechable, arriba. **No verificado en el navegador:** la base local compartida no tiene la migración; queda para el pase final (un mes cerrado en
Reportes ▸ Estado de resultados).

## Actividad 10 · Cada pago de un apartado se asienta el día en que entró la plata (G02)

**El problema.** Un apartado se separa con un adelanto y, antes de entregarse, la clienta puede abonar más. El diario (`fn_asientos`) asentaba TODO el adelanto —incluidos los abonos de días o meses
después— el día de la separación y con el total de hoy (`separaciones.adelanto`); el Balance (`fn_bal_anticipos`), igual. Un abono de marzo aparecía en febrero; el diario de febrero CAMBIABA cuando la clienta
abonaba (un mes cerrado divergía de su foto por una operación normal y el chequeo «huella» se ponía en rojo); la caja, el banco y el IGV quedaban mal fechados, y Cuentas y dinero (por fecha del pago) decía
otra cosa. En producción hay UN apartado, `APT-TRU-0006` (separado el 9-oct, pagos de 30.00 el 9, 30.00 el 14 y 29.90 el 15-oct): el diario asentaba 89.90 el 9-oct y nada el 14 ni el 15. Todo dentro de
octubre y sin mes cerrado, por eso nadie lo vio.

DECIDÍ (Felipe, 2026-10-16: aprobada la actividad 10 de la tanda 1; no cambia la política contable, solo la fecha):
- **Un asiento por pago**, con la fecha en que entró (`separacion_pagos.created_at`, hora de Lima): 101/104/105 al debe, 122 y 4011 al haber, con el IGV de ESE pago a la tasa de ESE día
  (`fn_igv_de_adelanto`). El origen de cada línea sigue siendo la separación (el enlace «De dónde sale» no cambia).
- **Los céntimos se redondean por pago, y todo lo que reversa usa la MISMA suma** (lente 1 de /rigor: una igualdad entre dos conjuntos de líneas que debe valer a la fracción): la devolución y la venta que
  aplica el adelanto al entregar usan `fn_igv_de_la_separacion` (la suma de los IGV de sus pagos); si no, el 4011 quedaría huérfano por un céntimo (33.33 + 36.67: 5.08 + 5.59 = 10.67 contra los 10.68 que da
  redondear el total). Si la venta aplica solo una parte, la parte proporcional.
- **El Balance suma lo recibido hasta el corte** (`fn_bal_anticipos`), no el total de hoy, y sigue excluyendo lo devuelto o aplicado antes del corte.
- **Qué pasa con producción:** la migración (`20261017014000`) mueve las líneas de `APT-TRU-0006` del 9 al 14 y 15-oct (mismo mes: ningún total mensual cambia) y su IGV pasa de 13.71 a 13.72 (un céntimo,
  por redondear por pago).
DESCARTÉ: dejar el asiento en la fecha de la separación y «corregir» al cerrar (la foto de un mes cerrado seguiría divergiendo); guardar la fecha del primer pago y sumar los abonos como ajuste (dos fuentes
de verdad para lo mismo); mover aquí el 4011 a la entrega.
**PENDIENTE DEL CONTADOR (no se decide aquí; ADR-0399):** hoy el diario asienta el IGV de cada adelanto (4011) el día que entra, como cuando cada abono emitía su comprobante de anticipo. Desde ADR-0399 un
apartado nuevo NO emite comprobante: la boleta sale una sola vez, al entregar, por el total. Si el contador dice que el IGV nace al entregar y no al cobrar el adelanto, el 4011 de los apartados nuevos se mueve a
la entrega: es otra migración, con su decisión. Esta corrige la FECHA, no la política.
SE ROMPE SI: se altera `separacion_pagos.created_at` a mano (las fechas son el dato); `separaciones.adelanto` deja de ser la suma de sus pagos (`fn_verificar_separaciones` lo vigila); una migración futura
vuelve a crear `fn_asientos` copiando su texto de un archivo viejo (revierte el asiento por pago: la prueba lo atrapa).
**Verificado.** `pnpm pruebas:finanzas-apartados-por-pago`: 16 verificaciones con las RPC reales (`separar_prendas`, `abonar_separacion`, `registrar_devolucion_separacion`, `entregar_separacion`), 7 fallan sin la
migración y las 16 pasan con ella; `fn_asientos` y `fn_bal_anticipos` tenían la misma huella en local y en producción (f2e74089… y b7fc4c42…), así que los reemplazos anclados caben en producción. **No verificado en
el navegador:** la base local compartida no tiene la migración.
