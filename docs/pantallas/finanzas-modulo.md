# Módulo — Finanzas completo (`/finanzas/*`: Resumen, Gastos, Cuentas y dinero, Reportes, Impuestos, Cierre)

> Modo: completo · Fecha: 2026-10-27 · Rol/sede: líder (Felipe), todas las sedes, octubre 2026 · Datos: **real** (SELECT de solo lectura en producción, proyecto `cayla-dynamic`, sesión de líder simulada dentro de una transacción de solo lectura) + código de `origin/main`
> SHA analizado: `9466fa9bd` (origin/main al cierre). Los informes de área leyeron `28b9a9d89`; entre los dos solo cambió `caja-panel-reglas.ts` en archivos de Finanzas/Caja (ADR-0534). Si esos archivos cambian después, este análisis está vencido.
> Archivos: `apps/web/app/(app)/finanzas/**` · `apps/web/components/finanzas/**` · `apps/web/lib/{resumen-finanzas*,tres-respuestas-reglas,caja-proxima-reglas,dinero-pulso-reglas,finanzas-confianza,resultados,balance,flujo-caja*,impuestos*}` · RPC `fn_asientos`, `fn_estado_resultados`, `fn_flujo_caja_proyeccion`, `fn_flujo_disponible`, `fn_cuentas_dinero_saldos`, `fn_dinero_libro`, `fn_conciliacion_contable`, `fn_cierre_mes_estado`, `fn_finanzas_confianza`, `fn_planilla_provision`, `fn_impuestos_igv_meses` · tablas `movimientos_dinero`, `cuentas_dinero`, `saldos_iniciales`, `caja_movimientos`, `gastos`, `compras`, `diario_cerrado`
> Otra sesión tocándola: **sí**, según `docs/SESIONES-ACTIVAS.md` (Gastos —22-oct—, auditoría de Finanzas —17-oct—, caos de Finanzas —14-oct—; hay que ver cuáles siguen vivas antes de construir). Las frases de ese archivo sobre `fn_flujo_*`, `fn_estado_resultados`, `fn_cierre_mes_estado`, `fn_asientos`, `anular_venta` y `fn_impuestos_igv_meses` piden avisar antes de tocarlas.
> Otro análisis: `docs/pantallas/finanzas-resumen.md` (**vencido**: la pantalla se rehízo con El telar, ADR-0493) y `finanzas-gastos.md` (2026-10-22, vigente para Gastos). Este informe lo reemplaza para el Resumen.
> Privacidad: sin nombres, DNI ni montos atados a una persona. **Los hallazgos de permisos y de seguridad que encontró la auditoría NO están en este archivo** (el repo es público): se entregaron a Felipe solo por el chat.

## 0 · Veredicto

**El diario de Finanzas está bien hecho; lo que está mal es lo que le entra, cómo se rotulan las cifras y que tres de sus cinco números grandes se leen más firmes de lo que son.** Un solo libro derivado (`fn_asientos`) que cuadra por construcción, el depósito de efectivo al banco **no se duplica**, y el stock sube al instante con cada entrada (aunque Existencias no muestre su valor en soles): lo que te dolió es real pero no está donde lo buscabas. Donde sí hay error es en tres titulares del Resumen: «¿Cuánto tienes?» describe S/ 42.897 y suma S/ 99.570; «¿Cuánto te deja octubre?» (+S/ 13.490) **no lleva ni un sol de sueldos y mañana cambia de signo**; y «¿Cuánto debes pagar pronto?» es **100 % planilla proyectada** del mes anterior.

**Cumple su finalidad:** 5/10 (promedio de las seis dimensiones 6,3; tope 5 porque dos de las tres respuestas grandes inducen a decidir con una cifra equivocada y una frase de Cuentas y dinero suma dos veces la caja fuerte) · **Relevancia:** 9/10 — **Núcleo**

**Orden de trabajo que sale de aquí (verdad primero, diseño después, como pediste):** #1 a #4 son arreglos de cifras y de frases, sin migración casi todos; #5 y #8 son decisiones tuyas y del contador antes de tocar el diario; #7 desbloquea el Balance y el cierre de octubre; el rediseño (#10, #11) va al final con tres maquetas.

## 0b · Qué se verificó y qué no (leer antes de creer una cifra)

| Verificado | Cómo |
|---|---|
| Composición de «¿Cuánto tienes?», sueldos del mes, costo estimado, conteos de inventario, depósitos, cierres de caja, cierre de octubre, proyección de caja, el 55 % | `[producción]` SELECT del 27-oct ~14:50 hora de Lima, solo lectura |
| Reproducción del 55 %, de los S/ 121.497 y de los S/ 30.062 | `[producción]` + reproducción numérica de tres refutadores independientes |
| 9 áreas leídas por código con evidencia `archivo:línea` | `[código]` 9 agentes + 3 lentes de refutación por hipótesis (27 refutaciones) + 4 barridos de errores no sospechados + un crítico de completitud |

| **No** verificado | Por qué | Qué hacer |
|---|---|---|
| Ninguna pantalla en el navegador (1440, 1920, 375 px, oscuro, Safari) | Disco al 100 % (1,7 GiB libres) y Docker no responde | Liberar disco antes de la fase de construcción; `/multi-view-responsive finanzas` y `tema:auditar` |
| Reproducción en base local de lo que los agentes marcaron `[local-db]` | La base local estaba 83–127 migraciones atrás y Docker se colgó | Reiniciar Docker y subir la base al día; la prueba de regresión que falla primero la necesita |
| ~45 hallazgos de gravedad 1–2 de las áreas **sin escéptico propio** (A7-02, A7-05..07, A1-08, DIN-04..15, A5-01..10, A6-01..09, todo A2, los 4 barridos) | Las tres lentes cubrieron solo las 9 hipótesis | Cada tarea de abajo exige primero una prueba de regresión que falle; así se verifica al construir |
| Tiempos reales de la app | `pg_stat_statements` solo traía mis propias llamadas (296 a 635 ms cada una, una por una) | Medir con la prueba de carga de ADR-0194 |
| «Cuánto tienes» contra el extracto del banco | Nadie ha cargado extractos ni saldos de arranque | #7 |
| Mapa de sedes en el Estado de resultados | El SELECT devuelve «tienda» sin nombre de sede | Se identifica al construir #10 |

## 1 · Finalidad declarada

«Finanzas existe para que el dueño sepa, sin ser contador, cuánto tiene, cuánto debe y cuánto gana por sede, y para entregarle limpio al contador lo que declara.» Fuente: `docs/adr/0195`, `0433`, `0493`, y tus respuestas del 27-oct (prioridad: «que *Cuánto tienes* sea verdad»; ordenar por sede; una sola fuente por cifra; tienda arriba, contable abajo). ¿Docs y pantalla coinciden? **No del todo:** la pantalla promete «una sola fuente por cifra» (D2) y hoy hay 48 cifras inventariadas con **20 coincidentes, 22 dudosas y 6 que difieren en el código** (mapa de fuentes, A8).

## 2 · Objeción

1. **No es un problema de cuentas sino de «qué entra al libro y cómo se llama».** Arreglar la contabilidad sin arreglar la entrada (conteos, mercadería sin papel, planilla de Dynamic, comisión de máquina, saldos de arranque) deja el mismo número equivocado con otro nombre.
2. **«¿Cuánto tienes?» es un número que nadie puede comparar con la realidad hoy**: ningún banco tiene saldo de arranque (0 de 2) ni está conciliado (0 de 2). Lo que muestra es *movimiento desde que se empezó a anotar*. Hasta cargar arranque y un extracto, ninguna fórmula nueva lo vuelve verdad.
3. **«¿Cuánto te deja octubre?» es hoy una cifra que cambia de signo por un detalle de calendario**, no por el negocio: el Resumen corta el 1→hoy y la provisión de sueldos solo entra si el período termina dentro del corte. Mañana (28-oct) termina.
4. **Tu sospecha del depósito acierta a medias:** el depósito no se duplica en el libro (se conserva el total). La inflación real que hubo entre el 8 y el 16-oct (S/ 700 en una tienda y S/ 181,10 en otra, ya corregidas) fue por ingresos de caja sin contraparte y por un traslado regularizado a mano, y hoy la frena un candado. Lo que **sí** duplica hoy es una **frase** (#3).

## 3 · Lo que está bien y no se toca

- **El diario derivado `fn_asientos`:** cada asiento cuadra (1.866 asientos en las cuatro unidades, 0 descuadrados en octubre) y nadie escribe asientos a mano `[producción]`; el Estado de resultados, el Cierre y el Balance leen de la misma casa `[código A4]`.
- **El depósito atómico:** 7 depósitos vigentes por S/ 20.693,70; el diario saca exactamente eso del efectivo (101) y lo mete al banco (104), sin duplicar `[producción]`. 0 duplicados por monto/día/cuenta y 0 por número de voucher.
- **Los candados de dinero:** efectivo no negativo en cajón y caja fuerte, mes cerrado que no se mueve, montos con tope, `anular_venta` que rechaza lo que no corresponde `[código]`; 0 cajas cerradas que no cuadren su fondo `[producción]`.
- **Egresos de caja:** los 186 egresos reales registrados (S/ 2.800, todos de octubre; la gran mayoría gasto rápido «Otro», el resto retiros e insumos) están **todos clasificados**; 0 sin clasificar `[producción]`. Gastos registra rápido: 5 toques desde Caja `[código A2]`.
- **SUNAT/Lucode no tumba nada:** la venta, la caja, el diario, el Estado de resultados y el Resumen no leen `comprobantes`; Impuestos sí y degrada con aviso `[código H12]`.
- **El Resumen ya tiene piezas buenas que reusar:** `fn_resumen_finanzas` devuelve cada parte como `ok / sin_permiso / falla / no_aplica` y nunca pinta un cero en lugar de un dato que falta `[código A1]`; los títulos-pregunta funcionan.
- **El stock sube al instante con cada entrada** (cada movimiento actualiza el stock y la base lo valoriza como stock × costo para el Balance), y el costo de lo vendido sale sellado en la venta `[código A7]`. Lo que falta es que la pantalla de Existencias **muestre** ese valor en soles (A7-14, tarea S del apéndice).

## 4 · Las seis dimensiones

Puntajes por submódulo (de los 9 informes) y promedio del módulo:

| Dimensión | Resumen | Gastos | Dinero | Reportes | Impuestos / Cierre | Ventas→Fin. | **Módulo** | Hallazgo principal |
|---|---|---|---|---|---|---|---|---|
| Estética | 7 | 7 | 7 | 6 | 7 / 6 | 6 | **6,5** | Dos cabeceras y dos selectores de mes: Cierre y los seis reportes aún no pasaron al telar |
| Lógica de negocio | 4,5 | 6,5 | 5 | 6 | 6 / 8 | 8 | **6,0** | El Resumen titula con cifras que no dicen lo que suman |
| Arquitectura | 6 | 7 | 7,5 | 8 | 6 / 8 | 7 | **7,0** | Mejor parte; la fragilidad es la cadena de ~25 parches por ancla sobre `fn_asientos` |
| Funciones | 6 | 6 | 6 | 6 | 6 / 6 | 7 | **6,0** | Faltan: «¿Por qué?», tablero por sede, Estado de cambios en el patrimonio |
| Utilidad (persona sin contexto) | 5 | 6,5 | 5,5 | 5 | 6 / 7 | 6 | **5,6** | «Provisional» y «Seguro al N %» no dicen de qué ni qué falta |
| Conexión con el ERP | 5,5 | 7 | 6,5 | 7 | 6 / 6 | 8 | **6,5** | Lo que no entra: Taller, mercadería sin papel, comisión de máquina, pago real de planilla y de SUNAT |

Promedio **6,3**; tope **5** por la cifra que cambia de signo (#2) y la frase que suma dos veces (#3).

### Estética `[código]`
Tokens limpios (0 hex, 0 `rgba`, 0 `bg-white` en `components/finanzas`). Dispar: `CabeceraPantalla` en Cierre y reportes contra `<EncabezadoPagina>` en el telar; tres formas de «la respuesta»; texto de SVG escalado a 7–10 px; `finanzas.css` de 2.728 líneas con 54 menciones de `fin-pulso-*` casi sin uso. `[no visto]`: nada se midió en navegador.

### Lógica de negocio
- **«Cuánto tienes»** `[producción]`: 99.569,56 = bancos 37.648,50 + **por abonar 56.146,12 (56 %)** + caja fuerte 3.640,64 + cajón 1.607,90 + fondo 500,00 + por rendir 26,40. El texto dice «cajones, cajas fuertes y bancos» (suma 42.897,04). Solo hay **un** abono de máquina registrado (S/ 10) frente a S/ 55.435 cobrados con tarjeta/QR en octubre: casi todo «por abonar» probablemente ya cayó al banco real, así que el sistema muestra el banco de menos y «por abonar» de más por el mismo monto `[inferido]`.
- **«Cuánto te deja»** `[producción]`: diario consolidado 1→27-oct = +13.490,18; mes entero = +12.562,79 (resta el desgaste de S/ 927,39). **Planilla en el diario = 0 en ambos.** Provisión de Dynamic (período 28-sep → 28-oct): «hasta hoy» devuelve **0 filas**; «mes entero» devengado **41.717,28**, al cierre 43.107,86. Reportes (mes entero) incluye esa provisión según el código; el Resumen no `[código A1-01]`.
- **Costo de lo vendido** `[producción]`: 42,7 % de lo vendido (S/ 45.984 de 107.770; 982 de 2.205 prendas) lleva costo **estimado**; 315 ventas por S/ 14.561 en una tienda son «prenda sin registrar».
- **Mermas** `[producción]`: S/ 9.599 (10,5 % de lo vendido): conteo S/ 8.017 + merma a mano S/ 1.582. El conteo físico de octubre dio **faltantes −221 u (−S/ 8.017) que sí entran al resultado y sobrantes +804 u (+S/ 21.232) que no entran a ningún asiento**; más 400 ajustes de «reposición» por +617 u (S/ 20.535) también sin asiento.
- **Diferencias de caja** `[producción]`: 24 de 54 cierres reales (44 %) cerraron con diferencia (faltantes S/ 1.558, sobrantes S/ 142); el diario las lleva como S/ 1.620 netos de «otros gastos» (6599) en octubre.
- **Planilla** `[producción]`: Dynamic pagó 3 períodos (S/ 35.320 · 26.930 · 30.062 netos = 92.312); retail registró **0** pagos de planilla. El último período pagado terminó el 27-sep, antes de `inicio_finanzas` (1-oct), así que no está en el libro por diseño.
- **Cierre de octubre** `[producción]`: 5 bloqueantes en «CAYLA entera»: las 3 cajas abiertas de hoy (una por tienda) y las prendas «por regularizar» (188 en AQP y 178 en TRU; LIM, 0). Avisos: 4 de los 5 fijos de AQP sin confirmar (alquiler, luz, agua, celular) y la planilla. El diario cuadra en las cuatro unidades.
- **Una regla escrita no se cumple:** la mermas a la cuenta 6951 estaba «NO PEGAR hasta el OK del contador» y el diario de producción **ya la usa** (`fn_asientos` contiene `6951` y ya no `659`) `[producción]`: o ya tuvo el OK y falta quitar la advertencia de la cabecera, o se pegó sin él.

### Arquitectura
`fn_resumen_finanzas` reúne las partes; `fn_estado_resultados` corre cuatro veces por carga del Resumen, el flujo dos, Por pagar tres `[código A1-13]` (a 3 tiendas + taller no importa: mis llamadas sueltas tardaron 296–635 ms). Riesgos de estructura: el texto vivo de `fn_asientos` no es el del archivo (25+ parches por ancla), y dos conjuntos distintos de «tienes» (con y sin fondos/archivadas) conviven. Caída externa: **SUNAT/Lucode** → el libro no cambia y Impuestos avisa; **Dynamic** → si una cuenta no ve la planilla, «¿Cuánto debes?» puede decir «Nada por vencer» en verde (gravedad 2 solo para esa cuenta, depende de cuántas haya); se degrada así: «sin planilla» y sin perder datos `[código H12]`.

### Funciones
Existen y funcionan: Resumen con tres respuestas, caja a 2 semanas, Gastos con fijos y activos, Cuentas y dinero (depósito, retiro, abono de máquina), seis reportes, IGV mensual, cierre por unidad. **Fantasma:** botones de sede que no filtran en cinco pantallas; la «Isla» del celular que el código promete y no existe. **Faltan:** «¿Por qué?» en las tres respuestas, tablero por sede, Estado de cambios en el patrimonio, comisión automática de la máquina, reparto de un gasto entre sedes. **Sobran:** el segundo selector de mes, el segundo «Ver», una tarjeta de confianza aparte.

### Utilidad
Una administrativa que abre el Resumen: lee «Cuánto tienes S/ 98.721» y lo toma por lo que hay en cajones y bancos; lee «Seguro al 55 %» como «55 % de probabilidad». Duda en «Provisional» (¿qué falta?), «Te deja» (¿antes o después de sueldos?), «sobre», «balanza». Si se equivoca, el fallo es del diseño: cuatro voces (tú, nosotros, yo, tercera persona) y los números firmes con letra chica. No se hizo prueba ciega con personas reales.

### Conexión con el ERP
Ver sección 6.

## 5 · Relevancia

| Criterio | Peso | Puntaje | Por qué |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 10 | Es la única pantalla donde el dueño decide pagos, compras y cierres; alimenta Plan de campaña y el contador |
| Dinero y stock que toca | ×1 | 10 | Todo el dinero: cajas, bancos, IGV, planilla |
| Frecuencia y personas | ×1 | 8 | Líder diario; administración y contador mensual |
| Qué se detiene si falla | ×1 | 8 | El cierre de mes, Impuestos y la decisión de compra; no se detienen ventas ni caja |

Relevancia = (2·10 + 10 + 8 + 8) / 5 = **9,2 → 9** — **Núcleo**.

## 6 · Conexión con el ERP

- **Aguas arriba:** Ventas (`registrar_venta`, pagos con cuenta sellada), Caja (cierre, gasto rápido, depósito, traslado), Compras (facturas y papeles), Inventario (conteos, ajustes, mermas), Dynamic (planilla, solo lectura), SUNAT/Lucode (comprobantes, solo Impuestos). **Lo que no llega o llega tarde:** comisión de la máquina (entra cuando alguien digita el abono), mercadería sin papel (26 líneas, S/ 1.400) y la carga inicial (S/ 84.105: no está en el diario porque tampoco hay saldos de arranque), pago real de planilla y de SUNAT (a mano), Taller (insumos, pagos y producción fuera del diario: hoy 0 pagos y 0 órdenes terminadas, así que aún no duele), cargas sociales.
- **Aguas abajo:** Plan de campaña (caja y meta), Inicio del líder, Impuestos y el paquete del contador, Observatorio, Cierre de mes (congela el diario).
- **Pájaro dueño y vecinos:** `fn_asientos` es dueña del libro; vecinos Compras (D9 sin terminar), Producción (Taller fuera) y Caja (diferencias).
- **Externos y qué pasa si caen:** SUNAT/Lucode → «se degrada así: el libro sigue, Impuestos avisa, no se pierde la venta»; Dynamic → «sin planilla, con el aviso en la tarjeta de caja»; Supabase → `/sin-base`.

## 7 · Las 12 tareas, por importancia

> Ninguna se construye sin tu OK. Las que tocan `fn_asientos`, `fn_flujo_*`, `fn_estado_resultados`, `fn_cierre_mes_estado`, `anular_venta`, `fn_impuestos_igv_meses` o la regla de alcance **avisan antes y parchan por ancla** (su texto vivo no es el del archivo). Toda migración se reserva con `pnpm reservar migracion` y se pega en producción solo con tu OK. Si el congelamiento del 28-oct 18:00 → 2-nov 12:00 existe (su única fuente es el encabezado de `finanzas-resumen.md`), nada de esto se empuja antes de preguntarte.

### #1 · Corregir — «¿Cuánto tienes?» que diga lo que suma (tu prioridad #1)
- **Estado:** hecho en la rama el 2026-10-27, commit `2d5316e46` (sin empujar ni PR). Solo el desglose del texto de la tarjeta: bancos, cajas y cajones aparte de lo que las máquinas todavía no depositan y de los fondos, y solo si las partes suman el titular. En producción las partes suman el titular exacto (S/ 99.395,96 = 42.942,94 + 56.426,62 + 26,40). Queda pendiente la definición única de «tienes» en la base (migración) y el chip «Aproximado».
- **Dónde:** `lib/tres-respuestas-reglas.ts:47` (el texto) · `lib/caja-proxima-reglas.ts:325` · `retail.fn_flujo_disponible` (`20260925160000_finanzas_flujo_de_caja.sql:79-82`) · `fn_cuentas_dinero_saldos` · el chip «Provisional».
- **Por qué en este puesto:** es lo primero que lees y lo que más decide. `[producción]` el titular junta bancos, cajas, **S/ 56.146 por abonar** (lo que las máquinas aún no depositan, 56 %), fondos y por rendir bajo el nombre «cajones, cajas fuertes y bancos». Y `fn_flujo_disponible` no distingue archivadas ni tipo (solo excluye `tarjeta_credito`) mientras que Cuentas y dinero ▸ «¿Dónde está mi plata?» sí: hoy difieren en **S/ 500** (el fondo). Sin esto, cada decisión de pago parte de un titular que sobrestima lo que tienes a mano.
- **Qué cambia:** el titular dice la suma de lo que nombra y debajo «+ S/ 56 mil que te deben las máquinas»; el conjunto de «tienes» se define **una vez, en la base**, y Resumen y Dinero lo usan; el chip pasa a «Aproximado» y dice qué falta («arrancaron en 0: bancos 0 de 2»). 
- **Cómo lo verificas tú:** el número grande = la suma de las partes que su texto nombra; Resumen y Cuentas y dinero muestran la misma cifra al mismo instante; tocando el chip ves «Falta: saldo de arranque de 2 bancos».
- **Esfuerzo / dependencias:** M · ninguna para el desglose; que sea *verdad* depende de la #7.

### #2 · Corregir — «¿Cuánto te deja octubre?» con el mismo rango y los sueldos del período
- **Estado:** hecho en la rama el 2026-10-27, commit `0d3032c32` (sin empujar ni PR). La provisión de sueldos se pide hasta el último día del mes (`tramoDeSueldos`); en producción el rango viejo devolvía 0 filas y el nuevo 5 filas por S/ 42.552,75, así que el Resumen pasa de +S/ 13.533 a unos −S/ 29.020. Además el mes pasado solo se compara si lleva sueldos igual (`mesPasadoComparable`), porque septiembre se pagó antes del inicio de Finanzas. No se vio en el navegador.
- **Dónde:** `app/(app)/finanzas/resumen/page.tsx:30,36` (`tramoDelMes` → 1 a hoy) · `lib/resumen-telar-reglas.ts:143-148` · `lib/resultados.ts:20-31` · `20261022164000_planilla_costo_real_con_cargas.sql:174` (`fecha_fin between`) · `ResumenFinanzas.tsx:114-121` (descarta la provisión que sí pidió) · contraste: `reportes/page.tsx:21-28` (mes entero).
- **Por qué en este puesto:** `[producción]` hoy +13.490; con los sueldos que el propio sistema ya calcula (41.717 devengado, 43.108 al cierre) el mes está en **≈ −S/ 28 a −30 mil**. «Hasta hoy» devuelve cero filas porque el período (28-sep → 28-oct) termina mañana: el día 28 la cifra cae de golpe esa cantidad y el último día vuelve a bajar por el desgaste. Afecta también «De cada S/ 100 te quedan», «¿Ya pagaste el mes?» (dirá «ya pagaste todo» a mitad de mes), el costo del Taller y de Empresa.
- **Cómo lo verificas tú:** **mañana 28-oct por la mañana** abre el Resumen (hoy dice +13.490) y luego Reportes ▸ Estado de resultados: con el arreglo ambos dicen lo mismo hoy y mañana, y la cifra no salta el día 28. Predicción a contrastar: sin el arreglo, el Resumen del 28 cae a unos −28 mil.
- **Esfuerzo / dependencias:** S–M · decisión tuya de una línea: sueldos **devengados hasta hoy** (prorrata, ya existe `hoy_estimado`/`devengado`) o **al cierre** (todo el período). Recomiendo devengado, con la nota «los cierra Dynamic el 28».

### #3 · Corregir — La frase «Si depositas lo guardado en cajas fuertes…» suma dos veces
- **Estado:** hecho en la rama el 2026-10-27, commit `a4f322348` (sin empujar ni PR). La frase dice ahora que lo guardado ya cuenta en el saldo y que depositarlo solo lo pasa al banco; la prueba que fijaba el error quedó corregida.
- **Dónde:** `lib/dinero-pulso-reglas.ts:73-89` y su prueba (usa un saldo de solo bancos, 28.280, que no es el que viene de la base).
- **Por qué en este puesto:** gravedad 1 (el número que lees al decidir depositar está mal) y esfuerzo S. `[código]` la proyección parte de `fn_flujo_disponible`, que **ya incluye** las cajas fuertes, y la frase les suma `guardado` otra vez: «quedas en saldo + G». Hoy hay S/ 3.640,64 en cajas fuertes `[producción]`, así que esa frase sumaría esa cifra por segunda vez `[inferido: no vi la pantalla]`. Depositar no cambia el total; la frase promete que sube.
- **Cómo lo verificas tú:** Cuentas y dinero ▸ «¿Me alcanza?» con plata en una caja fuerte: la frase no suma esa plata de nuevo, o no existe; el total antes y después de registrar un depósito es el mismo.
- **Esfuerzo / dependencias:** S · ninguna. Se puede hacer primero.

### #4 · Corregir — «Debes pagar pronto» y la proyección: la planilla de verdad, y todo lo que vence
- **Dónde:** `lib/resumen-finanzas-reglas.ts:340-355` (`debesPronto`) · `lib/tres-respuestas-reglas.ts:58-73` · CTE de planilla de `fn_flujo_caja_proyeccion` · `20261016002000_pago_planilla_y_sunat.sql` · `PorPagarConsolidado.tsx:367`.
- **Por qué en este puesto:** `[producción]` **Por pagar devuelve 0 filas** (las 9 compras vigentes son al contado y ninguna tiene saldo), así que los S/ 30.062 son **solo** la planilla proyectada y valen exactamente el neto del período anterior (S/ 30.062,23). El período en curso devenga 41.717–43.108; en la proyección a 14 días salen 30.062 de planilla y 12.268 de fijos, 0 de vencimientos y 0 de impuestos. La tarjeta enlaza a Por pagar, que dice «la planilla no está en esta lista». Además Dynamic pagó S/ 92.312 netos y retail no tiene registrado **ningún** pago de planilla: cuando Dynamic pague octubre (≈ S/ 43 mil), si nadie lo registra, saldrá del banco real y no del del sistema.
- **Cómo lo verificas tú:** «¿Por qué?» en «Debes pagar pronto» lista de qué está hecho (planilla neta, alquileres y servicios, impuestos, deudas) con sus montos; cuando un período pasa a pagado en Dynamic aparece «Registrar el pago» ya prellenado.
- **Esfuerzo / dependencias:** M · tras la #2 (comparten la fuente de planilla). **Decisión tuya** (Ganas/Pagas): «Debes» como caja neta a las personas (S/ 30 mil) o como costo real con cargas (S/ 38–43 mil); recomiendo mostrar las dos con nombre («Neto a pagar» y «Costo de planilla»).

### #5 · Corregir — Conteo físico: la mitad negativa entra al resultado, la positiva no
- **Dónde:** regla de merma de `fn_asientos` (`20261004220000_perdidas_una_sola_definicion.sql:526-555`; `20261023012000_mermas_a_la_cuenta_6951.sql`) · `fn_perdida_razon`.
- **Por qué en este puesto:** `[producción]` en octubre hubo 640 ajustes de conteo: **faltantes −221 u / −S/ 8.017 → merma en el resultado; sobrantes +804 u / +S/ 21.232 → ningún asiento; neto +583 u / +S/ 13.214**. Más 400 ajustes de «reposición» (+617 u, S/ 20.535) sin asiento. El mes lleva S/ 9.599 de mermas (10,5 % de lo vendido). Según cómo se trate la primera vuelta de conteos, el resultado de octubre queda **S/ 8 a 21 mil mejor o peor** que hoy. No es una cifra «mal sumada»: es una política que nadie decidió.
- **Cómo lo verificas tú:** Reportes ▸ Estado de resultados, línea «Mermas»: tras tu decisión cambia por el monto elegido y Reportes ▸ Balance cuadra la cuenta 201.
- **Esfuerzo / dependencias:** M · toca `fn_asientos` → **siempre decide Felipe** (con el contador); no antes de la #7.
- **DECIDÍ:** proponer **(B)** tratar el primer conteo como regularización de la carga inicial (se asienta contra patrimonio, no contra el resultado) y, desde ahí, merma neta con rastro. **DESCARTÉ:** (A) netear siempre sobrante contra faltante sin distinguir la primera vuelta, porque esconde pérdidas reales que sí hay en el piso; y (C) dejarlo como está y decirlo, porque el resultado queda sesgado a la baja justo cuando el stock inicial se está corrigiendo. **SE ROMPE SI:** la carga inicial tenía errores de unidades (se contó de más): un conteo que «encuentra» 804 unidades no es ganancia, es corrección; tratarlo como ingreso inflaría octubre.

### #6 · Mejorar — Reemplazar «Seguro al 55 %» por «Qué falta para que octubre sea firme»
- **Dónde:** `components/finanzas/Confianza.tsx` · `lib/finanzas-confianza.ts:60-246` · `fn_finanzas_confianza` (`20261015235000_finanzas_confianza.sql`) · se dibuja en `ResumenFinanzas.tsx:150-159` (la tarjeta delgada bajo las tres respuestas; **solo existe en el Resumen**).
- **Por qué en este puesto:** respondes a tu pregunta de dónde está y si sirve. `[producción]` reproduce el 55 (54,7): costo 17,2/30 · fijos 12/20 · facturas 7,5/15 · saldos 0/10 · tarjeta 10/10 · sueldos 8/10 · banco 0/5. Es un puntaje de **completitud con pesos escogidos a ojo**, no una probabilidad; cae justo en el borde de «medio» (con 54 se enciende «Provisional», con 55 se apaga), califica una sola de las tres cifras (la de «te deja»), cuenta cantidades y no soles, y no es comparable entre cuentas (la pieza de sueldos sale del denominador si la cuenta no ve Dynamic). Lo que más falta, en soles: **S/ 45.984 de lo vendido con costo estimado**, 188 prendas por regularizar, 0 de 2 bancos con arranque, 0 de 2 conciliados, 9 lotes sin factura.
- **Qué cambia:** sin porcentaje; tres estados **Firme / A medias / Con huecos**; lista ordenada por soles en juego, cada fila con su botón y a qué cifra afecta; cada tarjeta lleva su propio chip con el motivo; «Provisional» pasa a **una sola definición** (D11) y dice cuál falta. Texto de apoyo: «Mientras diga “Con huecos”, no decidas compras ni pagos con este número».
- **Cómo lo verificas tú:** abre el Resumen: no hay %; dice «Con huecos» con las filas de arriba y sus soles, y cada una lleva al lugar donde se arregla.
- **Esfuerzo / dependencias:** M · puede ir antes de la #7; gana valor después de #1 y #2.

### #7 · Reconstruir — Saldos de arranque y «banco según el extracto» (conciliación graduada)
- **Dónde:** `fn_fecha_de_arranque()` (= la fecha mínima de `fn_saldos_iniciales_vigentes()`) · `fn_conciliacion_contable` · `SaldosArranqueModal.tsx` · `ConfiguracionCuentas.tsx` · `fn_cierre_mes_estado` (chequeos, `20260925180000:488-540`) · `BalancePanel.tsx`.
- **Por qué en este puesto:** `[producción]` **no hay ni un saldo de arranque**: `fn_fecha_de_arranque()` es NULL y `fn_conciliacion_contable` devuelve **una sola fila: «Saldos de arranque · falta · bloquea»** → el Balance no puede dibujarse. Bancos: 0 de 2 con arranque, 0 de 2 conciliados; la caja fuerte no admite arranque; el único `saldo_inicial ≠ 0` es un fondo de S/ 500. Y el Cierre **no mira** esa conciliación `[código A5-04]`: octubre se podría congelar con el Balance bloqueado y sin que nada avise. Sin esto, «Cuánto tienes» no se puede comparar con un banco, el Balance no existe, y el Estado de cambios en el patrimonio (#12) no tiene de dónde partir.
- **Qué cambia:** (1) **sin código, esta semana:** cargar con tu contador los saldos de arranque (bancos, cajas fuertes, deudas, capital, IGV a favor) a 1-oct; (2) con código: que la caja fuerte pueda declarar con cuánto empezó, que cada cuenta tenga «Saldo según el banco hoy» + diferencia visible (manual hoy, CSV más adelante) y que el Cierre **avise** (no bloquee, D15) si el Balance no se puede dibujar.
- **Cómo lo verificas tú:** Reportes ▸ Balance se dibuja o dice una sola cosa que falta; cada banco muestra «sistema S/ X · banco S/ Y · diferencia S/ Z»; «saldos 0 de 2» pasa a «2 de 2» en la lista de #6.
- **Esfuerzo / dependencias:** L (la parte de código M) · decisión del contador sobre la fecha y el capital.
- **DECIDÍ:** arranque manual con extracto y diferencia visible por cuenta. **DESCARTÉ:** importar extractos de banco ahora, porque cada banco trae su formato, hay 2 bancos y 4 sedes y el mantenimiento cuesta más que el valor mientras el volumen sea de 3 tiendas; y descartado también «cuadrar» llevando la diferencia a una cuenta de ajuste automática, porque esconde el error en vez de mostrarlo. **SE ROMPE SI:** se carga el arranque con fecha equivocada: los saldos de todos los meses siguientes se corren y la huella de un mes ya cerrado deja de coincidir (barrido CON-03).

### #8 · Replantear — «Prenda etiquetada = egreso por conciliar con Compras» (tu D9)
- **Dónde:** `fn_asientos` (sin regla de entrada, `20260925130000:631-636`) · `fn_bal_causas_mercaderia` · `fn_bal_por_recibir` (`20260925170000_finanzas_balance.sql:386`) · `fn_finanzas_confianza` (`20261015235000:87-91`) · `resumen_sin_comprobante` · `proveedor_prendas_compradas_y_vendidas`.
- **Por qué en este puesto:** tu sospecha era correcta a medias. El stock **sí** sube al instante con cada entrada y la base lo valoriza; lo que no ve la entrada es el diario, Por pagar, el Flujo y el Resumen hasta que exista el papel, y la pantalla de Existencias no muestra el valor en soles (A7-14, tarea S aparte: una tarjeta «Valor del stock» desde `fn_bal_stock`, que responde directo a tu «debe estar en Existencias en tiempo real»). `[producción]`: 26 líneas sin papel (37 u, S/ 1.400), la carga inicial (S/ 84.105) y `compra_papeles` vacío (Compras simple todavía no se usa). Además hay un hallazgo del equipo rojo: `fn_bal_por_recibir` **no suma** el vínculo nuevo de Compras simple (`compra_item_recibido_antes`), así que cada papel completado deja un «por recibir» fantasma (−S/ 378 en una prueba de un refutador).
- **Cómo lo verificas tú:** Resumen/Cierre muestran «Mercadería recibida por conciliar: S/ X (N prendas)» con botón a Compras; al completar un papel la cifra baja y el Balance cuadra 201 sin diferencia.
- **Esfuerzo / dependencias:** L · decisión A/B/C tuya y del contador; no antes de la #7. Paso 1 es S y no necesita decisión (parchar `fn_bal_por_recibir` y el predicado «sin factura» en las tres funciones, con una prueba que complete un papel y exija que 201 cuadre).
- **DECIDÍ:** el diseño de A7 por pasos: (1) corregir los lectores; (2) bloque de **lectura** «por conciliar» sin asiento nuevo; (3) asiento de provisión (cuenta 4219 «por conciliar», sin vencimiento y **no** deuda) solo con tu OK y el del contador. **DESCARTÉ:** (a) Cr 4211 «facturas por pagar no emitidas» —los tres refutadores lo tumbaron: CAYLA paga 97 % al contado, más del 30 % llega sin factura (ADR-0111) y completar el papel paga el mismo día; esa cuenta crecería para siempre e inflaría «Cuánto debes» con deuda ya pagada—; (b) contar la mercadería como **gasto** del Estado de resultados, porque el costo ya se reconoce al vender y duplicaría. **SE ROMPE SI:** una compra se completa en un mes ya cerrado (la base la rechaza y queda fuera para siempre, A7-11) o si el Taller opera sin estar en el diario (el Balance sigue bloqueado, A7-05).

### #9 · Corregir — La proyección de caja honesta (H6)
- **Dónde:** `fn_flujo_caja_proyeccion` (`20261016215000_flujo_proyeccion_honesta.sql:115-150`) · `lib/caja-proxima-reglas.ts:96-101,317-320` · `hay_facturas_de_proveedor` (basta 1 fila) · `CajaProxima.tsx`.
- **Por qué en este puesto:** `[producción]` la cuenta cuadra exacto: 98.721 + 65.105 − 42.330 = 121.497. De lo que entra, **S/ 64.040 (98,4 %) es META** (38 filas) y S/ 1.065 es ritmo propio; lo cobrado de verdad en los últimos 14 días fue S/ 58.223 (la meta está ~10 % por encima). Sale solo planilla (30.062) y fijos (12.268): 0 vencimientos, 0 impuestos, 0 reposición, 0 comisión. Los tres refutadores corrigieron mi hipótesis: **el exceso viene sobre todo de costos no registrados (D9/D11), no del ritmo**; lo que sí queda con gravedad 2: el IGV del mes anterior no existe en la proyección de los días 1 a 15 de cada mes, el chip verde «Te alcanza» junto a «Provisional» contradice ADR-0433 y `hay_facturas_de_proveedor` se enciende con una sola factura.
- **Cómo lo verificas tú:** la tarjeta muestra la meta **y** «con tu ritmo de las últimas 2 semanas: S/ …»; con «Provisional» el chip es pizarra, no verde; del 1 al 15 aparece el IGV del mes anterior.
- **Esfuerzo / dependencias:** M · después de #4 (planilla) y #8 (reposición).

### #10 · Replantear — Ordenar la empresa por sede (tu queja 1)
- **Dónde:** `components/finanzas/telar/MesaDeMando.tsx:62-80` · `lib/finanzas-telar-reglas.ts:78-82,169` · `app/(app)/finanzas/{cierre,reportes/flujo,reportes/escenarios,reportes/campanas}/page.tsx` (no leen `sedeDeLaUrl`) · `fn_resumen_finanzas(p_ubicacion_id)` · `fn_estado_resultados` por unidad.
- **Por qué en este puesto:** es la parte de «no me ordena la empresa» que ninguna cifra corrige. `[código A9]` la barra dice «Viendo solo Lima» en cinco pantallas que muestran toda CAYLA; el Cierre abre septiembre mientras la barra dice octubre y desde la barra **no se puede llegar a octubre**; mirando una sede, «te deja» no lleva su parte del Taller ni de Empresa; ninguna pantalla compara sedes de un vistazo. `[producción]` en octubre una tienda concentra el **69 % de lo vendido** (S/ 63.138 de 91.389: por su número de asientos es TRU), otra el 30 % (AQP) y una casi no vende (S/ 665: LIM, 19 asientos) `[inferido por asientos]`.
- **Cómo lo verificas tú:** eliges una sede y cada pantalla dice «aquí filtra por sede / una a la vez / solo toda CAYLA» y los botones que no aplican se apagan; un tablero «CAYLA por sede» muestra, una tarjeta por sede, vendió · costó · te deja · caja, con una fila «De la empresa» aparte.
- **Esfuerzo / dependencias:** L · decisión tuya de reparto + decidir quién es «alguien de administración» (detalle de alcance: solo por el chat).
- **DECIDÍ:** cada ruta declara su alcance y la barra lo dice; costos compartidos de Taller y Empresa en su fila sin repartir; repartir por regla (ventas o personas) solo cuando tú la elijas. **DESCARTÉ:** (a) repartir costos de la empresa a las sedes por defecto, porque inventa un número que nadie decidió y podría empujar a juzgar mal a una tienda nueva; (b) un tablero por sede desde cero, porque la base ya entrega todo por sede. **SE ROMPE SI:** una sede tiene menos de 3 personas en planilla (el costo desaparece por la regla de privacidad con Dynamic: hoy la menor tiene 3, justo en el borde, A7-06) o si CLAURE comparte caja y diario en Lima y no se decide cómo separarlo.

### #11 · Mejorar — Una sola cara y un solo idioma (tus quejas 3 y 4)
- **Dónde:** `CierreMes.tsx:95-114` y los seis reportes (`CabeceraPantalla` + su propio selector) · `components/finanzas/telar/*` · `telar.css:175-199` (dock oculto bajo 1024 px) · textos de `lib/tres-respuestas-reglas.ts`, `finanzas-confianza.ts`.
- **Por qué en este puesto:** respeta tu orden «verdad primero, diseño después»: con las cifras arregladas, el rediseño no maquilla. `[código A9]` dos cabeceras, dos selectores de mes, cuatro voces, ningún «¿Por qué?» en las tres respuestas, dock invisible y sin Isla a 375 px (35 % del uso). `[no medido]`: todo viene de leer CSS.
- **Qué cambia:** Cierre y reportes al telar (`<EncabezadoPagina>`, `<RespuestaTelar>`), un solo selector de sede y de mes, «¿Por qué?» a un toque con lo contable abajo, una voz («tú»), Isla del celular, **tres maquetas tocables** para que elijas mirando (`docs/maquetas/finanzas-replanteo-2026-10/`), después `/unificar`, `/focus`, `/guia` y `/formidable` por submódulo.
- **Cómo lo verificas tú:** capturas a 1440, 1920 y 375 px contra `docs/maquetas/finanzas-2026-09/`; abrir Cierre y Flujo y ver que la barra dice lo mismo que la pantalla.
- **Esfuerzo / dependencias:** L · después de #1 a #6.

### #12 · Mejorar — Estado de cambios en el patrimonio neto *(bajo valor / pedido tuyo)*
- **Dónde:** nada existe; los ingredientes ya están en el diario (cuentas 50, 52, 591, reglas `aporte` y `retiro`); `lib/balance.ts`.
- **Por qué en este puesto:** lo pediste explícitamente (D16) pero hoy vale poco: sin saldos de arranque parte de cero y octubre solo trae 2 retiros por S/ 2.812,10. Gravedad 4. Se arma con una función derivada y una séptima pestaña de Reportes, sin tabla nueva.
- **Cómo lo verificas tú:** Reportes ▸ nueva pestaña «Patrimonio»: capital inicial + aportes + resultado − retiros = capital final, y cuadra con el Balance.
- **Esfuerzo / dependencias:** M · no antes de la #7 y del OK del contador sobre qué cuentas lo forman.

## 8 · Estrategia alternativa

**Hoy:** el Resumen empieza por CAYLA entera con tres respuestas y una franja de confianza.
**Alternativa:** empezar por **una tarjeta por sede** (vendió · costó · te deja · caja) con tres estados por cifra —Firme / A medias / Con huecos— y la lista de «qué falta» en soles, con el consolidado como suma visible de las tarjetas.

| | Ganas | Pagas |
|---|---|---|
| **Alternativa** | Ordena la empresa por sede (queja 1), la verdad se ve en soles y no en un %, y cada sede sabe qué le falta | Hay que decidir el reparto de lo compartido (Taller y Empresa); rediseña el Resumen y toca Cierre, Flujo y Escenarios; tres maquetas y tu elección |
| **Pantalla actual (con #1–#6)** | Rápida; las cifras quedan verdad sin rediseñar | La queja de «no me ordena la empresa» sigue; la barra de sede sigue diciendo cosas que la pantalla no cumple |

Esta sección **no cambia el orden de las 12 ni se da por decidida**: la tarea #10 existe para que decidas.

## 9 · Referentes y futuro

Del documento de investigación que tú aportaste (diseño híbrido de libro propio, comparación con 12 ERP): lo que pasa el filtro «¿le sirve a 3 tiendas y 1 taller hoy?» y **ya existe** en CAYLA, y no se toca: un solo diario con muchas vistas, la sede como dimensión y no como cuenta, bloqueo de períodos por capas (unidad y consolidado), proyección de caja a 6 semanas. Lo que **sí** aporta algo hoy: (1) conciliación bancaria **graduada** (primero «saldo según el banco» + diferencia, luego CSV): es la #7; (2) separar «a mano / tiempo real» para saber qué cifra es de qué hora (D10); (3) costos compartidos como fila propia hasta que se decida el reparto (#10); (4) Estado de cambios en el patrimonio derivado (#12); (5) el SIRE como verdad fiscal contra la que se compara Impuestos, con el contador. **Futuro, no entra en las 12:** borradores de IA que firma una persona, enlaces entre unidades con eliminaciones, importar extractos por banco, detracciones/ITAN/CTS y compras en moneda extranjera (preguntas al contador). `[no verificado]`: lo que describo de los ERP grandes viene del documento que aportaste y de memoria, no lo comprobé en sus productos.

## 10 · Fuera de esta pantalla

**Las ventas «sin prenda» y el costo estimado nacen en el mostrador, no en Finanzas.** El 42,7 % de lo vendido en octubre (S/ 45.984) lleva costo estimado y 315 ventas por S/ 14.561 en una sola tienda se cerraron como «prenda sin registrar»; además 366 prendas por regularizar (188 en AQP, 178 en TRU) hoy bloquean el cierre. Ningún arreglo de Finanzas hará firme el resultado mientras se sigan vendiendo prendas que no están registradas: eso es lo que de verdad une tu sospecha («todo producto etiquetado debe verse como egreso y en Existencias en tiempo real») con el número que ves. Es trabajo de Ventas/Inventario/Compras (el módulo de Compras que `[colaborador]` aún no termina), no de las 12.

## 11 · Antes de cerrar octubre (carga mínima, sin código)

Hoy: 5 bloqueantes y sin arranque. En orden: (1) cerrar las 3 cajas abiertas de hoy; (2) regularizar las prendas por regularizar (188 en AQP y 178 en TRU); (3) confirmar los fijos que faltan (4 en una tienda: alquiler, luz, agua, celular); (4) cargar los saldos de arranque con tu contador (#7); (5) registrar el pago de planilla cuando Dynamic lo haga; (6) decidir qué es el conteo físico (#5) **antes** de congelar el diario, porque el cierre congela lo que haya; (7) revisar los comprobantes rechazados de SUNAT. Lo que no esté al cierre queda congelado en octubre.

## 12 · Decisiones que esperan a Felipe

1. **Conteo físico** (#5): ¿el primer conteo es regularización de la carga inicial o es pérdida?
2. **«Debes pagar pronto»** (#4): ¿caja neta, costo real, o las dos con nombre?
3. **Sueldos del mes en «te deja»** (#2): ¿devengado hasta hoy o al cierre del período?
4. **Quién es «alguien de administración»**: líder o rol nuevo (afecta #10; detalle de permisos, solo por el chat).
5. **Reparto de Taller y Empresa a las sedes** (#10): sin reparto, por ventas o por personas.
6. **D15 contra ADR-0482:** «cerrar con advertencias» choca con los cuatro chequeos que pasan a frenar el 1-nov-2026.
7. **Congelamiento 28-oct → 2-nov:** ¿existe? (única fuente: el encabezado de `finanzas-resumen.md`).
8. **La migración de mermas a la cuenta 6951** ya está en producción: ¿tuvo el OK del contador? Si sí, se quita la advertencia de su cabecera.
9. Preguntas para el **contador** (aparte): cuentas nuevas 4219 y 6951, IGV congelado al cerrar, detracciones, ITAN, SIRE, cargas de planilla.

## 13 · Líneas propuestas para el backlog

- [ ] `[pantalla:finanzas-modulo]` #1 «¿Cuánto tienes?» dice lo que suma y una sola definición en la base — M
- [ ] `[pantalla:finanzas-modulo]` #2 «¿Cuánto te deja?» con el mismo rango y los sueldos del período — S–M
- [ ] `[pantalla:finanzas-modulo]` #3 Frase «Si depositas lo guardado…» (suma doble) — S
- [ ] `[pantalla:finanzas-modulo]` #4 «Debes pagar pronto» y proyección con la planilla devengada y todo lo que vence — M
- [ ] `[pantalla:finanzas-modulo]` #5 Conteo físico: sobrantes y faltantes (decisión Felipe + contador) — M
- [ ] `[pantalla:finanzas-modulo]` #6 «Seguro al 55 %» → «Qué falta para que octubre sea firme» — M
- [ ] `[pantalla:finanzas-modulo]` #7 Saldos de arranque y banco según extracto; el Cierre avisa si el Balance no se dibuja — L
- [ ] `[pantalla:finanzas-modulo]` #8 Mercadería «por conciliar» (D9): paso 1 `fn_bal_por_recibir` y predicado único — L (paso 1: S)
- [ ] `[pantalla:finanzas-modulo]` #9 Proyección de caja honesta (meta y ritmo propio, IGV del mes anterior, chip) — M
- [ ] `[pantalla:finanzas-modulo]` #10 Ordenar por sede: alcance por pantalla y tablero por sede — L
- [ ] `[pantalla:finanzas-modulo]` #11 Una sola cara y un solo idioma (telar en Cierre y reportes, «¿Por qué?», celular) — L
- [ ] `[pantalla:finanzas-modulo]` #12 Estado de cambios en el patrimonio neto (bajo valor / pedido) — M

## Apéndice A · Lo que no entró en las 12 (queda en el backlog por área, sin escéptico propio)

Gravedad: 1 estado imposible · 2 dato malo en silencio · 3 pantalla confusa · 4 feo pero seguro. Los hallazgos de permisos y seguridad **no** están aquí.

| ID | Gravedad | Qué | Estado |
|---|---|---|---|
| DIN-02 | 2 → latente | «Depósito bancario» anotado en Caja baja el total hasta clasificarlo; `[producción]` hoy hay 0 | latente; avisa mal («no cuentan en ningún número») |
| DIN-03 | 1 → latente | Ingresos de caja sin contraparte inflan el cajón; `[producción]` hoy 0 (hubo S/ 700 y S/ 181,10 el 8–16 oct, ya corregidos) | candado diferido lo frena |
| A7-01 | 1* → 2 | Pago de planilla de Dynamic nunca baja del banco aquí; hoy 0 pagos registrados; el de septiembre cae antes de `inicio_finanzas` | se concreta en noviembre (≈ S/ 43 mil) |
| A5-04 | 2 | Se puede congelar un mes cuyo Balance no cuadra; hoy el Balance está «bloqueado por arranque», no por «no cuadra» | #7 |
| A1-08 | 2 | Mirando una sede, «te deja» no lleva su parte de Taller ni Empresa y «debes» no lleva planilla | #10 |
| A2-02 | 2 | Comisión de la máquina sin sede ni devengo; `[producción]` ningún abono registrado salvo uno de S/ 10, así que la comisión no está en el resultado | pendiente de decisión (D8) |
| A2-04 / A2-06 / A2-07 | 2 | No-efectivo sin cuenta posible; IGV fijo al 18 %; no se puede repartir un gasto entre sedes | área Gastos |
| A5-01..A5-10 | 2 | Crédito de IGV subestimado sin señal; pago de SUNAT sin mes; no se congela el IGV; tres lecturas paralelas del crédito | área Impuestos |
| A6-01..A6-09 | 2 | Devolución parcial: el diario saca el valor entero y la caja solo lo reembolsado; cambio o devolución en otra sede; «ventas» se calcula de 5 maneras | área Ventas→Finanzas |
| A7-04 | 2 | Tres lectores de «sin factura» se equivocan para siempre en Compras simple; `[producción]` hoy coinciden (9 y 9) | #8 paso 1 |
| A7-06 | 2 | Una sede con menos de 3 personas desaparece de Finanzas sin aviso; `[producción]` hoy la menor tiene 3 | #10 |
| A7-10 | 2 | El costo de la prenda con factura puede traer el IGV adentro (razón ~1,18) | decisión tuya; `[no verificado en producción]` |
| A7-14 | 4 | Existencias no muestra el stock en soles (tarjeta «Valor del stock» desde `fn_bal_stock`) | S; responde a tu «en Existencias en tiempo real» |
| A7-11 | 2 | El Cierre no avisa de compras por completar; `compra_papeles` está vacío hoy | #8 |
| CON-01 | 1 por estructura | Una venta anulada entra a una caja que otro líder cierra a la vez: la caja queda con «diferencia» falsa | reproducido por un barrido en base local; probabilidad baja con 3 cajas por día; sin escéptico |
| CON-02 | 1 por estructura | «Efectivo entregado al líder» (por rendir) puede quedar bajo cero | ídem |
| CON-03 / CON-04 | 2 | El Balance de un mes cerrado cambia si se reabre uno anterior; un gasto fijo se duplica con un reintento | `[producción]` hoy 29 fijos activos |
| B-SQL-02..04, 06 | 2 | Devolución parcial; la cuenta contable la decide el medio y no la cuenta sellada; «Cuánto tienes» cambia según el módulo Caja de quien mira; IGV de adelantos de apartado | por construir |
| PR-01..03, 06, 07 | 2 | Ninguna prueba exige que mover plata entre cuentas deje igual el total; pruebas verdes que afirman lo contrario de D1–D20; sin prueba de «factura anulada no deja pagos»; sin prueba de cordura de la proyección | entran con cada tarea |
| R01 / R03 | 2 | El Balance no se dibuja si algo no cuadra (causa hoy: arranque faltante) y el resultado dice «Ganó» sobre un costo en gran parte estimado | #6, #7 |
| 375 px | 3–4 | Estado de resultados de 860 px sin columna fija; calendario de «Qué debes» con letra de ~6,7 px; CSV con `;` abre en una columna en Excel peruano | `[no medido en navegador]` |

## Inventario de elementos (Resumen, lo de tu captura)

| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Respuesta 1 | «¿Cuánto tienes?» S/ 98.721 | `fn_flujo_disponible(hoy)` | **ajustar** (#1) | `[producción]` 99.570 al momento: 42.897 + 56.146 por abonar + 500 + 26 |
| Respuesta 2 | «¿Cuánto debes pagar pronto?» S/ 30.062 | planilla proyectada | **ajustar** (#4) | `[producción]` = neto de septiembre; Por pagar 0 filas |
| Respuesta 3 | «¿Cuánto te deja octubre?» S/ 13.327 | `fn_estado_resultados` 1→hoy | **ajustar** (#2) | `[producción]` 13.490; sin sueldos 41.717 |
| Frase | «de cada S/ 100 te quedan S/ 15» | reparto sobre el resultado | bien, hereda #2 | 13.490 / 91.389 = 14,8 % |
| Franja | «Seguro al 55 %» + «6 cosas por revisar» | checklist ponderado de 7 piezas | **reemplazar** (#6) | `[producción]` 54,7 reproducido |
| Orillo | Barra de colores por sede | ventas netas sin IGV por tienda | bien; aclarar «sin IGV» | `[código A1-12]` |
| Caja | «Tu caja en las próximas dos semanas» 98 mil → 121.497 | proyección con META | **ajustar** (#9) | `[producción]` 98,4 % meta |
| Aviso | «Hoy te toca: falta registrar Celular AQP» | fijo sin confirmar | bien | Cierre de AQP: 4 fijos faltan |
| Dock | Pagar facturas · IGV del mes · Cierre de mes · Reportes | atajos | **ajustar**: no existe bajo 1024 px | `[código A1]` |

## Historial

| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-10-27 | completo (módulo entero, 9 áreas + equipo rojo + SELECT de producción) | 5/10 | 9/10 Núcleo | Primer análisis del módulo (`finanzas-resumen.md` queda vencido). Construidas en la rama, sin empujar: #3, #2 y #1 (esta última solo el desglose del texto). |
