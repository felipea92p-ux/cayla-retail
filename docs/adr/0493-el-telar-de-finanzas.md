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
   **Costo conocido:** al pasar del Resumen a otra pantalla de Finanzas la barra cambia de ancho (64 rem). Se arregla cuando las demás salgan de la lista.
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
