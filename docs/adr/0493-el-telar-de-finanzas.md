# ADR-0493 — El telar de Finanzas: una barra común para los seis submódulos y cada uno con su forma

- **Fecha:** 2026-10-23 · **Estado:** aceptado. Felipe eligió «El telar de Finanzas» mirando la maqueta y aprobó la lista de 11
  actividades y sus decisiones a, b, c, f y g el mismo día («aprueba a todos y que tenga en cuenta esa barra»). Rama
  `claude/finanzas-gastos-maquetas-6b9a9b`.
- **Relacionados:** ADR-0195 (Finanzas: este ADR reemplaza su «Ajuste de diseño al spike» para lo que se dibuja de nuevo), ADR-0136
  (movimiento, con la excepción de abajo), ADR-0358 (una función, una pieza), ADR-0220 (la cabecera única), ADR-0169 y ADR-0336 (tokens y
  modo oscuro), ADR-0389 (guías), ADR-0433 (el alcance de Finanzas, que no se toca aquí).
- **Maqueta:** `docs/maquetas/finanzas-telar-2026-10/` (rama `claude/finanzas-redesign-filters-d154a4`; publicada en
  https://claude.ai/artifact/7sesZaQD3Z2Bi5wB2hVhng). Diagnóstico de Gastos y sus 13 hallazgos: `docs/maquetas/finanzas-v3-2026-10/gastos/`.

## El problema

Felipe (2026-10-23): Finanzas está «muy básico y poco entendible», tiene filtros que no funcionan, le faltan vueltas y **debe poder
separarse siempre por sede**. Cada uno de los seis submódulos tenía su selector de sede («Ver», `?ver=`), y cada uno con su propio valor por
defecto: Gastos abría en la sede donde trabaja la persona y el Resumen, en todas. Al pasar de uno al otro, la sede cambiaba sola. En Gastos,
además, el selector solo aparecía para el líder (`persona.rol === "lider"`), mientras que la base también da todas las sedes a quien tiene
Configuración, Cierre de mes o CAYLA Global. Esa persona veía «Tienda Lima» y no podía cambiarla.

## Lo que se decidió

1. **Una mesa de mando, montada una sola vez** en `app/(app)/finanzas/layout.tsx` (`components/finanzas/telar/MesaDeMando.tsx`), fija bajo la
   cabecera del ERP. Arriba van las pestañas de los submódulos que la cuenta ve (salen de las hijas de Finanzas en `lib/menu.ts`: la barra y el
   lateral nunca muestran submódulos distintos), «Te toca» y «Registrar gasto». Abajo, los **hilos de sede** y el mes (`<SelectorMes>`).
2. **La sede y el mes viven en la URL**: `?sede=todas|empresa|<id de ubicación>` y `?mes=AAAA-MM`. Al cambiar de submódulo viajan solo esos
   dos; en la misma pantalla se conservan sus demás parámetros. «todas» y el mes de hoy no se escriben. La regla es pura y tiene su prueba
   (`lib/finanzas-telar-reglas.ts`). **Transición:** cada página lee la sede con `sedeDeLaUrl(sp)`, donde `?ver=` gana sobre `?sede=` mientras
   cada submódulo conserve su selector viejo; la barra siempre quita `?ver=`, así que los dos funcionan. Sin ninguno de los dos, «todas»: la
   barra y la pantalla dicen lo mismo. Cada sesión de Finanzas saca su selector viejo cuando llega a su submódulo (decisión f).
3. **Quién elige la sede lo dice la base, no el rol** (decisión c): `veFinanzasDeTodoDe(persona)`, la misma pregunta que
   `fn_ve_finanzas_de_todo`. Quien no ve todo tiene un solo hilo: el suyo. Gastos ya lo usa; los demás submódulos lo adoptan al enchufarse.
   El candado real sigue en cada función de la base.
4. **Cada sede es un hilo de color**, y los cinco son **tokens de color de dato** (decisión a): `--color-sede-tru`, `-aqp`, `-lim`, `-tal` y `-emp`,
   en `globals.css`, en el oscuro de `tema.css` y en `.papel-fijo`, con los valores de la maqueta. Empresa va rayada (es de todos). Como la
   tabla `ubicaciones` no tiene código, `colorDeSede()` asigna el color por ciudad o tipo. Una sede que no reconoce (una tienda nueva, un
   almacén) queda «otra», en taupe, y **nunca toma el color de otra sede**. El nombre de la sede va siempre escrito junto a su color.
5. **Cada submódulo pone en su pantalla tres piezas comunes**, pasándoles solo sus datos:
   - la cabecera única (`<EncabezadoPagina>`, ADR-0220) con `<RespuestaTelar>` a la derecha: la pregunta del submódulo y la cifra grande;
     `valor={null}` dice que no se pudo leer;
   - el **orillo** (`<Orillo>`): la tira que reparte la cifra entre las sedes, donde cada tramo elige su sede;
   - el **dock** (`<DockTelar>`, solo escritorio): hasta cuatro acciones con su tecla. En el celular, lo de abajo sigue siendo la Isla.

   **Finanzas deja `<CabeceraPantalla>` y usa la misma cabecera que el resto del ERP:** este ADR actualiza ADR-0195 y la regla
   «La cabecera de una pantalla» de ADR-0358.
6. **«Te toca»** junta los pendientes de los seis submódulos en un cajón (`<Cajon>`), con primero los del submódulo donde se está. Los lee
   `GET /api/finanzas/te-toca?sede=`, sin loader: el layout no recibe la URL y no se vuelve a pintar al cambiar de sede. Cada submódulo suma su
   `pendientesDe…` (`lib/finanzas-te-toca-reglas.ts`), con su propio `try`: si uno falla, la lista sale «incompleta» y no tumba a los demás
   (principio 9). Ningún pendiente inventa una regla, porque cada uno sale de una cifra que su pantalla ya muestra.
7. **Sin un ⌘K propio de Finanzas.** El ERP ya tiene el buscador global (⌘K) en su cabecera (`BuscadorGlobal`); dos ⌘K chocarían por la misma
   tecla y romperían «una función, una pieza». Las acciones de cada submódulo van en el dock.
8. **«Registrar gasto» desde cualquier submódulo** lleva a Gastos con la hoja abierta (`?registrar=1`, que Gastos quita apenas abre la hoja).
   En Gastos no aparece en la barra, porque su cabecera ya lo trae.

## El movimiento de Finanzas (excepción de ADR-0136, decisión b)

Felipe la aprobó acotada a lo de la maqueta: los hilos que crecen bajo la sede elegida, el orillo que se teje al entrar y se reacomoda al
cambiar de sede, la cifra de la respuesta que cuenta, el dock que sube y, en cada submódulo, su gráfico propio (el retazo y el calendario de
Gastos, los frascos, la biblioteca, la balanza y el mapa del cierre). Las reglas: **todo corre una sola vez, con `--ease-cayla`, sin rebote ni
bucle** (salvo las señales que ADR-0136 ya admite) y con `prefers-reduced-motion` todo queda quieto. El CSS vive en `app/estilos/telar.css`.

## Lo que se descartó

- **Seguir con un selector de sede por submódulo**, aunque fuera el mismo dibujado seis veces: cada uno guardaba su sede, y la sede volvía a
  cambiar sola al pasar de uno al otro.
- **Leer la sede en el layout y pasarla a cada página:** un layout de Next no recibe la URL ni se vuelve a pintar al navegar dentro de él.
- **Migrar todo Finanzas de una vez:** la barra llega primero a los seis y cada sesión enchufa su submódulo encima, sin que nadie edite la
  pantalla de otro.

## Cómo se verifica

`lib/finanzas-telar-reglas.test.ts`, `lib/gastos-telar-reglas.test.ts`, `lib/finanzas-te-toca-reglas.test.ts`, `lib/tema-tokens.test.ts` (los
tokens nuevos en los tres lugares) y las guías: las 14 de Finanzas explican la barra (`...TELAR`). En el navegador, a 1440 y a 375 px: elegir
Lima en Gastos y pasar a Resumen la conserva, y Resumen muestra Tienda Lima; Te toca abre el cajón y «Clasificar» lleva a la pestaña de salidas
de caja; «Registrar gasto» desde Resumen abre la hoja en Gastos.

## Actualización 2026-10-24 — El Resumen contesta también «¿me alcanza?»

Con el Resumen ya en El telar (#1311), Felipe pidió ver qué faltaba y qué sobraba (`docs/pantallas/finanzas-resumen.md`, spikes en
`docs/maquetas/finanzas-v3-2026-10/resumen-siguiente/`). Se construyeron cinco piezas, solo web, sin migración, cada una en su commit:

1. **«Tu caja en las próximas dos semanas»** (`lib/caja-proxima-reglas.ts`). La línea del saldo día por día contra el mínimo de caja y la frase de cuándo
   baja o que aguanta; en celular, tres cifras y una barra. Mirando una sede solo separa lo que se separa (su efectivo, lo que se espera cobrar de ella y
   lo que sale de ella). El saldo de cada día se arma con las mismas piezas con que la base arma sus bloques y **tiene que cuadrar con el de Dinero ▸ Flujo**;
   si no cuadra, usa solo los bloques y lo dice. Lectura propia de `fn_flujo_caja_proyeccion` (`getFlujoProximo`): la de `fn_resumen_finanzas` recorta los
   cobros (`- 'cobros'`) y solo trae el flujo mirando CAYLA entera.
2. **«¿Puedo fiarme de este número?»** (`Confianza.tsx`). El medidor pasó de una tarjeta al fondo a una franja bajo la respuesta: «Seguro al N %» y, a un toque,
   lo que falta. Se quitó el arco. La lista «no revisado» de «Hoy te toca» **se queda**: dice qué partes de la lista no pudo leer la cuenta, que es otra pregunta.
3. **«¿Ya pagaste el mes?»** (`lib/equilibrio-mes-reglas.ts`). Reemplaza a «ventas contra la meta»: cuánto hay que vender para pagar TODO el mes (gastos ÷ margen),
   cuánto va vendido y desde qué día se cubrió. Todo sin IGV; lo de Caja se convierte con la proporción del propio período.
4. **«Lo que más se movió desde el mes pasado»** (`lib/resumen-cambios-reglas.ts`), rubro por rubro contra el mismo tramo del mes pasado; la lista suma exactamente
   lo que cambió lo que te deja el mes.
5. **«De cada S/ 100 que vendes»** (`lib/de-cada-cien-reglas.ts`): la frase va en la respuesta y los cien cuadros a un toque bajo el recorrido.

**Un solo número para la caja (Felipe, 2026-10-26: «deja los dos, pero que digan el mismo número»).** El aviso «bajo tu mínimo de caja» de «Hoy te toca» y la tarjeta
cuentan el mismo hecho con el mismo día y el mismo monto: el punto más bajo de las dos semanas (`masBajo`, `alinearAvisoDeCaja`). Antes el aviso miraba el cierre de cada
bloque semanal (−S/ 36,467) y la tarjeta el día (−S/ 41,522); y una caída dentro de la semana, que el bloque no ve, tenía tarjeta pero no aviso. Ahora el aviso también nace.
Mismo tono en los dos: rojo solo si la plata no alcanza (negativo), ámbar si baja del mínimo sin llegar a negativo.

**DECIDÍ:** la caja vive también en el Resumen, con una lectura propia que usa el mismo cálculo de Dinero. **DESCARTÉ:** recalcular el saldo en el navegador con
otra regla, porque habría dos números distintos para «cuánto me queda el 31»; y repartir los bancos por sede con un porcentaje, porque es inventar un dato (D-32).
**SE ROMPE SI:** una cuenta ve el Resumen y no Dinero (la pieza se oculta, no muestra S/ 0), o si la base cambia cómo arma los bloques (la prueba de «cuadra con
los bloques» pasa a usar solo los bloques y lo dice).

**Lo que se descartó a propósito:** mostrar la meta por día de cada sede como la «meta del mes» (`fn_rendimiento_serie` termina en hoy, así que solo cubre hasta hoy; en
el equilibrio solo entra la meta del mes del presupuesto) y un equilibrio sin gastos registrados (`motivoSinEquilibrio` lo corta y manda a Gastos). Los cien cuadros son
una pieza nueva: si Felipe quiere que sea la de la familia «proporción de cien», entra a `docs/unificar/` en su ronda; hoy es local del Resumen.

## Actualización 2026-10-26 (b) — La compra de una campaña en el Resumen (decidido por Felipe)

Spike y contrato con el Plan de campaña en `docs/maquetas/finanzas-v3-2026-10/resumen-campana/`. Decidido:

1. **La compra de una campaña NO es un gasto: es plata comprometida** (inventario hasta que se vende; NIC 2 y el Balance del ERP). Entra al Resumen por un bloque propio y por la caja, nunca dentro de «Te deja».
   La publicidad de la campaña, la comisión de tarjeta y el descuento sí son gasto de campaña.
2. **Se puede ocultar con un interruptor por campaña y uno general** (opción A). Por defecto todo se ve. Va firmado y no borra nada. Apagado el general, la caja no cuenta lo que aún no se pidió.
3. **Se guarda en el plan cómo se piensa pagar: una lista de (fecha, %)**, con autor y hora; la base exige que sume 100 %. Se guardan los pagos y no las tandas con forma de pago, para que un cambio de la pantalla del Plan no mueva la caja.
4. **En la caja la compra sale con IGV** (el crédito fiscal vuelve en la declaración siguiente). Lo vio primero la sesión del Plan; este spike no lo había contado.

**DECIDÍ:** el Resumen lee la campaña a través de un contrato del Plan y no ofrece nada hasta que la base lo confirme (la «marca soportado» del ADR-0499). **DESCARTÉ:** que el Resumen calcule la compra por su cuenta desde
las órdenes y el plan: dos fuentes para «cuánto vamos a comprar». **SE ROMPE SI:** el Plan y Finanzas llaman distinto al mismo concepto («Compromiso de compra» contra «Compras de campaña»): el nombre se elige mirando y es uno solo.

## Actualización 2026-10-26 (c) — El Resumen abre con tres respuestas, sin huecos, y la inversión en mercadería (construido, tras bandera)

Construido sobre la demo que Felipe aprobó (`docs/maquetas/finanzas-v3-2026-10/resumen-demo/`):

1. **Tres respuestas arriba** (`lib/tres-respuestas-reglas.ts` → `TresRespuestas.tsx`, con `TarjetaCifra`): ¿cuánto tienes?, ¿cuánto debes pagar pronto? y ¿cuánto te deja este mes? Ninguna calcula plata: repiten la cifra de la caja (`cajaProxima`),
   de `debesPronto` y de la respuesta del mes, y el estado de la caja se dice con las mismas palabras que «Tu caja» (`estadoDeCaja`, una sola fuente). **El Resumen ya no pone `RespuestaTelar` en su cabecera** (es la única
   excepción de las seis pantallas: su respuesta ahora son tres tarjetas).
2. **Ancho completo solo para el Resumen**, con el marcador `data-ancho-completo` de ADR-0462 y no sacando `/finanzas` de `CON_TOPE_DE_ANCHO`: las otras cinco pantallas se revisan a lo ancho una por una.
   **Costo conocido:** al pasar del Resumen a otra pantalla de Finanzas la barra cambia de ancho (64 rem). Se arregla cuando las demás salgan de la lista. **(Superado el mismo día por la actualización d: Finanzas entera salió de la lista.)**
3. **Sin huecos:** la caja y «Hoy te toca» miden lo mismo; el recorrido, el equilibrio y los cambios van en columnas pegadas (`columns-[34rem]`; el navegador corta donde quedan más parejas) y en una columna en angosto.
4. **Inversión en mercadería, tras bandera** (`lib/inversion-mercaderia-reglas.ts`, `lib/inversion-mercaderia.ts`, `InversionMercaderia.tsx`, `AjustesResumen.tsx`). No es un gasto: sale de la caja el día que se paga.
   Cada sol del plan está en UNA etapa (pagado, pedido sin pagar, falta pedir) y la caja solo suma **lo que falta pedir** (lo pedido ya está en Por pagar: contarlo dos veces es el error). `cajaProxima` acepta la compra como capa
   aparte y mira seis semanas cuando la hay. Las formas de pagar (tu plan, todo junto, dos tandas, a plazo) se comparan mirando la caja; **elegir una es mirar, no guarda nada**. «La mejor mezcla» solo la lleva una que no depende
   del proveedor, no deja la caja en negativo y llega a tiempo con 70 % o más; si ninguna cumple, no recomienda (la caja cuenta «Todo junto» para mostrar el daño). Mirando una sola sede no se dibuja: es de CAYLA entera.
5. **«Qué se ve»:** un ícono junto al mes (la barra ya es de una sola fila; no cabe «debajo»), solo en el Resumen, que abre una hoja con los interruptores. Visibilidad por campaña = **tres estados** (decidido por Felipe la tarde del 2026-10-26, y mandan en todo Finanzas): «se hará» (Resumen, flujo y Escenarios), «solo en Escenarios» y «no mostrarla».
   El Resumen lee solo «se hará» (`seVeEnElResumen`); la columna la crea el Plan.

**DECIDÍ:** que el lector de la inversión sea una sola función (`getInversionMercaderia`) que hoy devuelve «esta base aún no lo trae» y que, en desarrollo y con `?inversion=ejemplo`, devuelva cifras de ejemplo; **en producción el Resumen no ofrece nada**.
**DESCARTÉ:** llamar a una función de la base que todavía no existe (daría un error en cada carga) y guardar las elecciones de «Qué se ve» en la base sin que el Plan tenga su columna. **SE ROMPE SI:** el Plan entrega la lista de pagos en otro formato
(`leerInversion` descarta lo que no entiende, nunca inventa un monto) o si dos campañas se pagan el mismo día y alguien espera verlas por separado (la caja las suma).

**Interino a propósito:** las elecciones de «Qué se ve» (interruptor general, por campaña, contar en la caja, IGV) viven en el navegador (`localStorage`), no en la base. Cuando el Plan guarde «se ve en el Resumen» y el interruptor general,
`useAjustesResumen` cambia por esa lectura y las reglas no se tocan. **Las pestañas «Lo que dice la historia» y «Cuánto cuesta»** de la demo están construidas, pero **solo existen si el Plan entrega esos datos** (campos opcionales `historia` y `costos` de la campaña; `leerInversion` los descarta si vienen a medias). Sin ellos, el cuadro de la campaña muestra solo «Cuándo compro»; el Resumen no calcula nada de eso por su cuenta (solo suma «lo que te deja» con lo que el Plan entrega).

## Actualización 2026-10-26 (d) — Todo Finanzas a ancho completo y la barra de sede pegada a la cabecera (Felipe)

Felipe, mirando las cinco pantallas a ~2000 px: «que todos usen la pantalla al completo y no solo un espacio reducido», y «la barra de sede más arriba, no quiero espacios sin usar». Lo que se hizo:

1. **`/finanzas` sale de `CON_TOPE_DE_ANCHO`** (`components/AppShell.tsx`, y de `CON_TOPE_HOY` en `lib/ancho-completo.test.ts`). Resumen, Gastos, Cuentas y dinero, Reportes, Impuestos y Cierre de mes comparten un solo ancho: pasar de una
   a otra ya no mueve el título (la prueba del grupo «finanzas» lo vigila, como las de Producción, Clientes y Tienda web). El marcador `data-ancho-completo` del Resumen sobra y se quitó (ya solo lo escriben el Inicio de almacén, el Observatorio y Aventurero).
2. **La barra sube a donde se queda fija.** El `<main>` deja 6 rem sobre el contenido (5 en celular) y la barra se queda fija a 3,75 rem: en reposo había 28 px de aire sobre ella que desaparecían al bajar la página. Un margen negativo (`-2.25rem`
   desde 640 px, `-1.25rem` en celular, `app/estilos/telar.css`) la hace nacer en su lugar fijo: ni salta ni deja hueco. Medido en 1440 px: de y = 88 a y = 60 (la cabecera mide 63).
3. **Una sola fila hasta 1280 px.** Con el tope fuera, el «Registrar gasto» de la fila ya no se cae en 1440 px, pero a 1280 seguía bajando a una segunda fila (+43 px). Las reglas «solo íconos» ahora preguntan por el ancho de la propia barra
   (`container: mesa / inline-size`) y no por el de la ventana: bajo 1050 px la barra deja solo los íconos de «Te toca» y «Registrar gasto»; bajo 1190 px se esconde el dicho («Viendo las cuatro sedes juntas», que también vive en su `title`)
   porque con menos de ~150 px se queda en un hilo de 40 px. Ambas medidas salen de sumar las piezas: sedes 513 + mes 211 + «Te toca» 127 + «Registrar gasto» 151 + 3 huecos de 12 = 1038 px.
4. **No se tocó** lo que cada pantalla hace dentro de su ancho: los gráficos con medida propia (la balanza del IGV a 680 px, la cascada del Reportes a 640 px) siguen centrados en su columna; abrirlos a lo ancho es una decisión de diseño de cada pantalla.

**DECIDÍ:** sacar Finanzas entera de la lista de deuda de ancho en vez de mantener la excepción del Resumen y revisar las cinco pantallas «una por una». **DESCARTÉ:** la excepción por pantalla (`data-ancho-completo` en cada una), que dejaba a la persona
viendo la barra cambiar de ancho cada vez que cambiaba de submódulo y obligaba a cada pantalla nueva de Finanzas a acordarse de pedirlo. **SE ROMPE SI:** una pantalla de Finanzas trae un bloque que no se llena a 1920 px y deja un hueco grande
(se ve en la captura a lo ancho, no en la prueba), o si una pieza nueva se suma a la fila de la barra sin sumar su ancho a los 1038 px de arriba (volvería a dos filas a 1280 px).

## Actualización 2026-10-30 — «En qué se va» de Gastos deja el retazo por los hilos, con su desglose (Felipe, eligiendo mirando)

Felipe, sobre una captura de Gastos: «ese gráfico inicial es horrible y muestra todo de mala manera, no se entiende». Se armaron siete maquetas
en `docs/maquetas/gastos-grafico-2026-10/` (ronda 1: A · Hilos, Anillo, Río de días; ronda 2: A2 · Hilos con memoria, A3 · Lo que pesa,
A4 · Mosaico de 100) y eligió **la A2 con el desglose de la A3**, y para elegir la sede dentro del desglose, **la 3 · Columna** (entre
píldoras, el hilo en grande y columna). Lo que quedó (`components/finanzas/gastos/HilosGastos.tsx`, reglas en `lib/gastos-hilos-reglas.ts`):

1. **Un ranking que se lee de arriba abajo.** Cada categoría es una fila: su hilo partido por sede (`<BarraApilada>`, a la escala de la mayor,
   con los colores de sede de este ADR), la rayita de dónde estaba el mes anterior, la píldora de cuánto subió (ámbar) o bajó (verde), el
   monto y su línea de los últimos meses (`<Sparkline>`). Junto al título, la frase de lo que más subió y lo que más bajó (solo entre las
   categorías que pesan el 4 % o más). La cifra grande de la cabecera suma su chip «▲ 15 % vs septiembre».
2. **Los meses de antes se leen con el resumen que ya existe** (`fn_gastos_panel`, uno por mes, en paralelo, `page.tsx`): sin migración. Solo
   se piden los meses que empiezan desde el inicio de Finanzas (ADR-0332), y **un mes sin un solo gasto no se compara**: es un mes que no se
   registró, no uno barato (sin esa regla, septiembre de 2026 hacía decir «nuevo» a todo y la línea partía de cero). La línea se dibuja con
   tres meses seguidos o más; un hueco la corta. Si un mes no responde, el aviso de arriba lo dice y el gráfico sale sin comparar.
3. **Tocar una fila abre su desglose debajo** (tocar un color del hilo la abre ya en esa sede): a la izquierda, las sedes en columna con su monto
   y su parte, y la hoja clara con el hilo rojo que se desliza a la elegida; a la derecha, cada gasto (día, en qué, a quién, sede, monto) del
   más grande al más chico, con las filas de `<Tabla>` (`fila-cayla`, su hilo y su «›»), seis a la vista y «Ver N más». Un gasto abre su hoja;
   «Ver en la tabla» deja la lista de abajo con esa categoría **y esa sede** (filtro nuevo `sede` en `FiltrosLista`, con su píldora).
4. **Movimiento** (el gráfico propio del telar, en la excepción de arriba): las filas entran en cascada, el hilo crece tramo a tramo, al
   cambiar de sede las filas se deslizan a su nuevo puesto (FLIP) y los hilos se reacomodan desde donde estaban; el desglose se despliega y
   la marca de la sede se desliza. Una vez, sin rebote ni bucle; quieto con `prefers-reduced-motion`.

**DECIDÍ:** la columna de sedes como **botones que quedan presionados** (`aria-pressed`), no como pestañas: filtra la lista de al lado, no
cambia de sección. Es la forma que Felipe eligió mirando, aparte de la píldora de filtro (`pildora-cayla`) que /unificar fija para filtrar:
queda como excepción decidida de esta pieza, no como una forma nueva para el resto del ERP. **DESCARTÉ:** las tarjetas de sede de la
primera versión del desglose (no le gustaron), las píldoras y «el hilo en grande» (opciones 1 y 2), atenuar las demás filas al pasar el
mouse (bajaba su texto por debajo de 4.5:1) y una RPC nueva por mes (el resumen de siempre ya trae lo sumado por categoría). **SE ROMPE SI:**
la lista del mes deja de traer todos los gastos (el desglose y el hilo salen de ella, `fn_gastos_lista` sin tope) o si `fn_gastos_panel`
deja de devolver `por_categoria` (se pierde la comparación, sin caerse).

## Actualización 2026-10-30 (b) — «Cuándo» de Gastos deja el calendario por el ritmo del mes (Felipe, eligiendo mirando)

Felipe pidió lo mismo para «Cuándo». Cuatro propuestas en `docs/maquetas/gastos-cuando-2026-10/` (C1 · Calendario fino, C2 · El ritmo del
mes, C3 · Día por día, C4 · La lluvia), sobre lo que hacen Copilot Money, Tiller y otras apps de finanzas (el mes contra el anterior el mismo
día, y hacia dónde va). Eligió **la C2, «pero que se lea mejor el texto, ya que en distintos tamaños se llega a tapar por la línea»**. Lo que
quedó (`components/finanzas/gastos/RitmoGastos.tsx`, reglas en `lib/gastos-ritmo-reglas.ts`), a todo el ancho bajo «En qué se va»:

1. **El ritmo con `<Linea>`, la pieza única** (ADR-0358): lo gastado sumado día a día en tinta; el mes anterior **a la misma altura** en taupe
   punteado (sus gastos uno por uno, `getGastos` del mes anterior en `page.tsx`, con la misma regla de los hilos: solo desde el inicio de
   Finanzas, y un mes sin gastos no se compara); desde hoy, el «si sigue así». Junto al título, «A hoy llevas S/ X: S/ Y más que septiembre a
   esta altura»; en un mes cerrado, el mes entero contra el anterior.
2. **«Si sigue así» = un día normal cada día que falta + lo que ya se sabe que viene.** Un día normal es lo gastado sin los gastos que vienen
   de un fijo ni los saltos, repartido en los días que pasaron (un alquiler no hace creer que cada día se gastan miles). Lo que viene: los
   fijos del mes sin registrar en su fecha (el atrasado, mañana), en puntos huecos sobre la línea, y un gasto anotado con fecha de más
   adelante, en su día.
3. **Los saltos grandes con su nombre** («Alquileres · 3 al 5 oct S/ 6,600»): los gastos de 6 % o más de lo más alto del mes, juntos si son de
   la misma categoría en días cercanos, tres como mucho.
4. **Tocar un día** (o una nota, o con ← → y Enter: la línea es un deslizador) **abre debajo lo que se gastó ese día**, gasto por gasto y del
   más grande al más chico, como el desglose de «En qué se va» (seis a la vista y «Ver N más»); en un día que no llega, el fijo que falta.
   «Ver en la tabla» deja la lista de abajo con ese día (el filtro `dia` que ya existía).

**Lo que se lee mejor (el pedido de Felipe), en `<Linea>` y para todas sus pantallas** (`lib/linea-textos-reglas.ts`, con pruebas que recorren
200 casos al azar): las notas van en una **franja sobre el gráfico**, con un hilo punteado hasta su punto, nunca encima de un trazo (se prueban
todas las combinaciones de fila y lado; si no caben en dos filas, todas pasan a su nombre corto); **la cifra del último punto** se queda en su
lugar de siempre salvo que choque con un trazo, y entonces busca el primer hueco alrededor; **las cifras del final se separan** si caen juntas;
y **todo texto sobre el dibujo lleva un borde del color del fondo** (`--linea-fondo`, papel de fábrica) que corta la línea que pase detrás.
Medido en la maqueta: en las seis vistas de sede y once anchos (300 a 1920 px), ningún texto toca una línea desde 350 px de gráfico.

**DECIDÍ:** que la mejora de lectura viva en `<Linea>` y no en Gastos: es la pieza única de la línea, y Caja, Rendimiento, el plan de campaña y
las demás la reciben sin cambiar nada donde hoy no hay choque (comprobado en Finanzas ▸ Resumen: su cifra se queda donde estaba). Y que la
línea comparada sea **el mes anterior a la misma altura**, no su promedio: es la pregunta que se contesta de un vistazo. **DESCARTÉ:** la C1
(el calendario arreglado, en la columna angosta: no dice si se va más rápido que el mes pasado), la C3 (barras por día) y la C4 (gotas por
gasto), que Felipe vio y no eligió; la mediana de un día como ritmo (en un mes con pocos gastos da cero y no proyecta nada); y una RPC que sume
por día (la lista del mes ya trae cada gasto). **SE ROMPE SI:** `fn_gastos_lista` del mes anterior deja de responder (se calla la comparación,
sin caerse: el aviso de arriba lo dice) o `fn_gastos_fijos_mes` deja de traer `fecha_esperada` (los fijos caerían mañana).

## Actualización 2026-10-30 (c) — Gastos compara a la misma altura, dice de qué está hecho el «si sigue así» y acorta «En qué se va» (Felipe, los 3 cambios de /formidable)

`/formidable` midió las dos secciones nuevas (`docs/formidable/finanzas-gastos.md`) y una prueba ciega las recorrió. Felipe aprobó sus tres
cambios («Sí, los 3»):

1. **En el mes en curso, todo compara a la misma altura.** El chip de la cifra grande, la píldora ▲/▼ y la rayita de cada categoría y la frase
   de «En qué se va» comparaban lo gastado hasta hoy contra el mes anterior **entero**, mientras «Cuándo» comparaba al mismo día: el 10 de
   octubre, con los datos de ejemplo, el chip decía «▼ 28 %» y «Cuándo», «S/ 157 menos a esta altura», y «Transporte ▼ 51 %» cuando a la
   misma altura había subido 75 %. Ahora, en el mes en curso, todos usan lo que el mes anterior llevaba al mismo día (`mesAEstaAltura`, sobre la
   lista del mes anterior que «Cuándo» ya lee) y lo dicen («▲ 6 % vs septiembre a esta altura», «dónde iba septiembre a esta altura»); en un mes
   cerrado, el mes entero, como antes. La línea de meses de cada categoría llega hasta el mes anterior (el mes a medias era un punto que
   siempre bajaba) y necesita tres meses cerrados.
2. **El «si sigue así» dice de qué está hecho**, a todo ancho bajo el gráfico (antes solo en el angosto): «un día normal (S/ 186) por cada día
   que falta, más S/ 210 de 2 fijos por confirmar» (el nombre del chip de la cifra grande: la segunda ciega encontró tres nombres para lo mismo) y, si hay, lo ya anotado para después. La ciega no sabía si el cierre contaba los fijos.
3. **«En qué se va» muestra las 6 categorías más grandes** y «Ver N más» (`<FilasDeMas>`, en una segunda lista; con 7 u 8 se ven todas), su
   frase dice «entre lo que más pesa» (la de «▲ 75 %» a la vista, de una categoría chica, la contradecía) y una categoría que redondea a cero dice
   «menos de 1 %». «Cuándo» sube ~193 px a 1440 y ~254 px a 375, medido.

En el mismo análisis se arreglaron tres defectos de lo construido ese día: «Cuándo» de un mes sin gastos, el globito que saltaba a «hoy» al tocar
el gráfico (en el teléfono quedaba pegado) y las lecturas para comparar, que esperaban a las del mes.

**DECIDÍ:** sacar el mes a medias de la línea de meses en vez de marcarlo «a hoy»: `<Sparkline>` no sabe dibujar un punto distinto, y una marca no
evita que la línea baje. **DESCARTÉ:** quitar el chip de la cifra grande (ya no contradice a «Cuándo» y la ciega lo usó a los 5 segundos) y
abreviar «a esta altura» (a 1024 px el chip pasa a una segunda fila, +30 px; se acepta). **SE ROMPE SI:** la lista del mes anterior no se lee:
en el mes en curso ya no hay contra qué comparar y el chip, las píldoras y la rayita se callan (no vuelven a comparar contra el mes entero).

## Actualización 2026-10-30 (d) — La lista de Gastos va por día, como el extracto del banco (Felipe, eligiendo mirando)

**Qué cambió.** Felipe miró cuatro propuestas para la lista de la pestaña «Gastos» (`docs/maquetas/gastos-lista-2026-10/`: L1 por día, L2
primero lo que pide algo, L3 la tabla depurada, L4 por tamaño) y eligió **L1 · Por día**. La tabla de 8 columnas (fecha, gasto, categoría ·
cuenta, sede, comprobante, cómo se pagó, monto, estado) se va; queda `ExtractoGastos` (`components/finanzas/gastos/`, reglas en
`lib/gastos-extracto-reglas.ts`):

1. **Por día, del más nuevo al más viejo**, cada día con `<SeparadorDia>` (la pieza decidida, ADR-0358): «Hoy · viernes 30 de octubre» y, a la
   derecha, lo que se fue y en cuántos gastos, sin los anulados. Se pega bajo la mesa de mando al bajar (la mesa también va pegada y cambia de
   alto: `ExtractoGastos` la mide y se lo pasa en `--separador-tope`). La tarjeta recorta con `overflow: clip` y no `hidden`, que rompería el pegado.
2. **Cada fila dice qué fue** (y el proveedor) y debajo **en qué, cómo se pagó y su comprobante**; la sede, con su color, solo cuando se ven varias.
   El IGV y el «perdido» siguen bajo el monto, como decidió Felipe el 2026-10-14. La cuenta contable sale de la fila: sigue en la hoja del gasto.
3. **Solo se marca lo que no es normal**, una marca por fila: anulado; lo que falta pagar (vencido en rojo, como en Por pagar; ámbar si vence en
   7 días o menos; pizarra si hay tiempo); y **sin comprobante desde S/ 300** (`UMBRAL_SIN_COMPROBANTE`, regla de dinero de Felipe, 2026-10-30): por
   debajo están el mototaxi, el baño y los útiles, que nunca traen factura, y marcarlos haría que la marca deje de verse. La marca dice su porqué
   (el IGV que se recuperaría, cuánto falta y cuándo vence) al lector y al pasar el mouse.
4. **Lo chico que se repite el mismo día** (mismo nombre, sede, categoría y forma de pago; cada uno bajo S/ 50 y sin marca) va en una fila con el
   globito de cuántas veces y lo que sumó, y se abre en su lugar (`<FilasDeMas>`).
5. **Se ven los últimos 5 días**; el resto, con «Ver los N días de antes» (`<BotonVerMas>`). Con cualquier filtro puesto (buscar, un día, una categoría, una sede o el comprobante) se ven todos; si los de
   antes serían uno solo, también.

Buscador, filtros, píldoras de lo filtrado, pie y la hoja del gasto no cambian: migrar cambió cómo se ve, no qué hace.

**DECIDÍ:** el separador decidido (versalitas de 11 px) en vez del serif de la maqueta, porque `<SeparadorDia>` es la única pieza del día en el ERP. Y el porqué de la marca va en el `title` y en el texto del lector, no en una frase a la vista. **Corregido el mismo día (/formidable):** decía que la frase estaba en la hoja del gasto, a un toque, y no está; ponerla ahí es uno de los 3 cambios que esperan el OK de Felipe. **DESCARTÉ:** juntar
lo repetido por nombre solamente (un «Baño» del cajón y otro por Yape se leerían como pagados igual) y esconder los anulados (un gasto nunca se
borra de la vista). **SE ROMPE SI:** la mesa de mando deja de llamarse `.mesa-telar`: el separador se pega bajo la cabecera y queda tapado por la mesa.

## Actualización 2026-10-30 (e) — Lo que pide algo no se esconde, y «sin comprobante» es un solo número (Felipe, los 3 cambios de /formidable)

`/formidable` de la lista por día (`docs/formidable/finanzas-gastos.md`): la primera prueba ciega no lo logró al primer intento porque la única
factura vencida estaba tras «Ver los días de antes»; el porqué de cada marca solo se veía con el mouse; y arriba se avisaba «21 sin comprobante»
mientras la lista marcaba 1. Felipe aprobó los tres cambios (el tercero toca cómo se avisa del IGV, una regla de dinero):

1. **«Ver los días de antes» dice lo que esconde** que pide algo, con el tono de su marca: «1 vencida» (rojo, con su punto que late, la
   excepción de ADR-0136 para «Vencida»), «N vencen esta semana» y «N sin comprobante» (ámbar). Una factura vencida es vieja por definición:
   casi siempre cae en los días de antes.
2. **La hoja del gasto abre con la marca de la fila y su porqué** (`avisoDelGasto`, el mismo texto de la fila en un `<Aviso>`), con «Ir a Por
   pagar» si la cuenta tiene el módulo `por_pagar`, y «Pago» en pasado si ya venció (`pagoACredito`). En el celular la acción baja bajo el
   texto, como el aviso de Plan del piso (la pieza `Aviso` no cambia).
3. **«Sin comprobante» se cuenta igual en todas partes:** el chip de la cifra, la bandeja y «Te toca» cuentan lo de S/ 300 o más
   (`sinComprobanteGrande` sobre `pideComprobante`, la misma regla de la marca) y dicen el IGV que se recuperaría con factura; lo chico sin
   papel (el mototaxi, el baño) ya no es una alarma. «Ver cuáles» pone el filtro nuevo «Sin comprobante, de S/ 300 o más»; «Sin comprobante» a
   secas sigue en el filtro. «Te toca» lee la lista del mes junto al panel, en la misma vuelta.

La segunda ciega lo logró al primer intento (leyes 6,4 → 7,6).

**DECIDÍ:** contar lo grande sin papel con la lista del mes que la pantalla ya lee, y no con `fn_gastos_panel`, para no partir la regla de los
S/ 300 entre el código y la base sin una migración. **DESCARTÉ:** poner «· 1 ya venció» en la tarjeta «Por pagar de gastos» contando con la lista
del mes (la tarjeta suma la deuda de todos los meses: el número saldría falso con una vencida de un mes anterior) y leerlo de
`fn_por_pagar_consolidado` (exige el módulo Cuentas y dinero). Queda pendiente de una migración que haga que `fn_gastos_panel` devuelva las vencidas.
**SE ROMPE SI:** la lista del mes no responde: el chip y la bandeja no avisan lo sin comprobante (la pantalla ya dice que una parte no
respondió) y «Te toca» se marca incompleto.

## Actualización 2026-10-31 — la bandeja de Gastos es una pila (Felipe, la 03 del benchmark visual)

Felipe miró las 8 propuestas de `docs/maquetas/gastos-benchmark-2026-10/` y pidió aplicar todas menos la 02 y la 07. Esta es la 03:

1. **La bandeja de «lo que falta revisar» es una pila** (`components/finanzas/GastosPulso.tsx`, reglas en `lib/gastos-pila-reglas.ts`).
   Arriba, la cosa más vieja, y bajo ella asoman una o dos capas (las que siguen). Una salida de caja se resuelve en la tarjeta misma:
   el sistema ya propone qué fue (`sugerenciaParaEgreso`); si es un gasto, se elige la categoría (y «qué se pagó» llega con la nota del
   cajón); quién lo hace va en la tarjeta; y «Listo». Un activo, o un gasto con boleta o factura, abre el registro completo. Un gasto fijo
   sigue con su botón «Registrar», que abre la hoja ya armada.
2. **«Listo» es al instante** (excepción de ADR-0149, act. 2026-10-31): la tarjeta se va 56 px a la izquierda y se apaga (360 ms), la
   siguiente sube desde atrás (360 ms), el número de «Te faltan N» rueda (`CifraAnimada`) y la barra se llena; si la base dice que no,
   la tarjeta vuelve con lo elegido. Al vaciarla, «Todo revisado» con el visto que se dibuja (`<Vacio>`). Una vez, sin rebote ni bucle.
3. **Una sola regla para clasificar una salida** (`lib/clasificar-egreso.ts`): la pila y la hoja «¿Qué fue esta salida?» guardan con la
   misma validación y la misma función de la base; la guía de foco de la tarjeta sale de esa misma regla y una prueba exige que coincidan
   en todos los casos (`lib/gastos-pila-reglas.test.ts`).
4. **La pila no se reordena bajo el dedo** (Copilot lo corrigió en marzo de 2026): va por fecha, la salida más vieja primero.
5. **Un gasto va con su marca** (`useIntento("registrar_gasto")`, en la pila y en la hoja de siempre): si se corta la red, la tarjeta vuelve
   con «No sabemos si se guardó», «Revisar si se guardó» y «Volver a intentar», que manda la MISMA marca (la base no lo duplica). Con eso
   `GastosPanel` salió de la deuda de `lib/intento-reglas.test.ts`. Mientras un gasto de la pila va en camino, «Listo» espera (una marca
   por vez): un doble clic manda una sola llamada.

**DECIDÍ:** la tarjeta de arriba en papel con su línea (los campos y las píldoras en hueso con borde se ven encima) y las capas de atrás
en hueso; un solo combo de responsable por tarjeta, que conserva lo elegido de una tarjeta a la otra. **DESCARTÉ:** sugerir la categoría
(es la propuesta 6 de la pasada funcional, aparte) y resolver un gasto fijo en la tarjeta (pide medio de pago y comprobante: la hoja).
**SE ROMPE SI:** `sugerenciaParaEgreso` deja de proponer, o la bandeja recibe las cosas en otro orden (la pila se reordenaría).
