# Pantalla — Análisis (`/gestion/analisis`)

> Modo: completo · Fecha: 2026-10-14 · Rol/sede: [líder] (Admin), Tienda TRU, escritorio ~2000 px (captura del miércoles 14-oct, 09:20 Lima) · Tipo: **tablero de decisión**; escribe un solo dato («Liquidar desde») · Dispositivo que se juzga: escritorio (Gestión no exige celular, PL-105 no la incluye)
> Datos: **real** — consultas de **solo lectura** a producción hechas por Claude con el MCP de Supabase (precedente: `inventario-movimientos.md`, `atributos.md`), agregadas y sin datos personales; el apéndice dice qué midió cada una. No se corrió la plantilla SQL entera: se preguntó lo que el análisis necesitaba.
> SHA analizado: `b1f4f4793` (= `origin/main`; la rama iba 0/0). Si cambian `gestion/analisis/page.tsx`, `components/analisis/*`, `lib/analisis-*.ts`, `lib/motor-demanda-reglas.ts` o `fn_analisis_sede`, este análisis está vencido.
> Archivos: `app/(app)/gestion/analisis/{page,loading}.tsx` · `components/analisis/{AnalisisPantalla,PestanaHoy,PestanaAcaba,PestanaQuieta,PestanaPiso,PestanaPedir,HojaConfianza,HojaLiquidarDesde,TodaviaNo,Carril,FichaPrenda}.tsx` · `lib/analisis-{datos,sede,reglas,modelo,hoy,acaba,quietas,piso,pedir,aviso,liquidar,rinde,acciones}.ts` · RPC `fn_analisis_sede`, `fn_analisis_por_llegar`, `fn_motor_demanda_preparacion`, `fn_liquidar_desde`, `guardar_liquidar_desde`, `fn_resumen_comparacion_json`, `pedir_a_otra_sede` · tablas `ventas`, `venta_items`, `movimientos`, `prendas_por_regularizar`, `parametros_analisis`, `cuadres_piso`
> Otra sesión tocándola: **casi no.** El PR #1042 (unificar, rondas 9–10, abierto) cambia `components/analisis/FichaPrenda.tsx`; el PR #808 está viejo (05-oct) y toca `lib/analisis-que-hacer.ts`, que ya no existe. Ninguna fila activa de `docs/SESIONES-ACTIVAS.md` toca Análisis (la de ADR-0392, Gestión, ya está fusionada: #1023).

## 0 · Veredicto
La pantalla está bien construida —lee en el servidor, se degrada sin caerse, es honesta con el aviso de «Datos incompletos»—, pero **hoy razona con menos de la mitad de las ventas y con un umbral que la tienda todavía no puede alcanzar**: por eso dice «Va bien» donde no sabe nada, y su ranking de «Qué pedir» premia a las categorías mejor registradas, no a las que más se venden. Lo más valioso: **el dato que le falta ya está en la base** (el 100 % de las ventas sin prenda tiene categoría, talla y color) y la pantalla no lo lee.
**Cumple su finalidad:** 5,0/10 (promedio 5,6, con tope 5: puede mandar a liquidar —rebaja, dinero— prendas que sí se venden) · **Relevancia:** 6,6/10 — **Soporte** (al borde de Núcleo por su peso en la gestión)

## 1 · Finalidad declarada
«Que quien decide en una tienda (encargada o líder) vea, de **su** tienda y **por modelo**, qué se acaba, qué no se vende, qué nunca salió al piso y qué pedir, con un botón al flujo que ya existe para cada respuesta, sin sugerir cantidades, y avisando cuando las cifras pueden fallar». Fuente: ADR-0357 (decisiones 1, 2, 3 act., 7 y 12; `docs/adr/0357-analisis-v4-cuatro-preguntas.md:50,67,104-109,160,226-233`), ADR-0392:26 (el grupo Gestión: «¿Qué hago hoy?»). No se usó la captura.
**¿Docs y pantalla coinciden?** En lo construido, sí. Difieren en: (a) ADR-0357 dice «cuatro preguntas» y hay **cinco pestañas** (Hoy es la quinta; `ARQUITECTURA.md:564` dice cinco y `:598` vuelve a decir cuatro); (b) ADR-0392:26 dice grano «prenda» y que decide «quien atiende», cuando la decisión 12 mide **por modelo** y ADR-0392 decisión 4 deja a la Integrante sin Análisis; (c) **las dos decisiones de Felipe del 12-oct** sobre esta pantalla (el ritmo por los días de la prenda en el piso y «liquidar» contra la vara de su categoría) **no están en ningún ADR ni en el código**. Manda el código para lo construido; las del 12-oct están pendientes de escribirse (#3).

## 2 · Objeción
1. **«Va bien» en verde donde la pantalla no puede saber nada.** «¿Qué no se mueve?» dice «Nada lleva 15 días sin venderse» con el chip «Va bien» `[visto]`. Es aritmética, no una buena noticia: TRU vende en el ERP desde el **30-sep** `[producción]`, así que ninguna prenda del piso puede llevar más de **14 días** sin venderse (la máxima medida hoy: 14) `[producción]`, y «Liquidar desde» está en **15** `[producción: parametros_analisis]`. El carril no puede tener filas hasta que la tienda cumpla 15 días. Y lo dice bajo un aviso que reconoce que solo 46 de cada 100 ventas tienen su prenda: **un veredicto verde con datos que el propio aviso declara incompletos** (`PestanaHoy.tsx:73,203`) `[código]`.
2. **Razona con el 46 % de las ventas, y el 54 % que falta no está repartido parejo.** De 652 líneas vendidas en TRU, **347 no tienen prenda**: 306 ya se cerraron sin prenda (`prendas_por_regularizar.estado = 'cerrada_sin_prenda'`, no vuelven nunca) y 41 siguen pendientes `[producción]`. En AQP es peor: 371 de 392 (5 % con prenda) `[producción]`. Lo visible por categoría en TRU (30 días) va de **82 % (Corsets) a 33 % (Vestidos), y es 0 % en Shorts, Aretes, Pulseras, Relojes, Lentes, Collares y Anillos** `[producción]`. Consecuencias concretas:
   - **«Qué pedir» ordena por calidad del registro, no por demanda.** El titular «Capas y Corsets y 6 tipos más no llegan a Navidad» `[visto]` nombra justo a las dos categorías mejor registradas (71 % y 82 %). **Faldas**: con lo visible, sus 49 unidades duran ~92 días y «llegan»; con todas sus ventas (22, no 8) duran ~33 días y **no llegan** a Navidad, que está a 72 días `[producción + cálculo con la regla de analisis-pedir.ts:165]`. **Shorts** no aparece: 16 vendidos, 0 con prenda, para la pantalla «no se vende».
   - **«No se vende» va a mandar a liquidar lo que sí se vende.** Los 5 modelos de Shorts tienen 18 unidades en TRU y ninguna venta con prenda `[producción]`: cuando su piso cumpla 15 días entran a «Liquidar» (`analisis-reglas.ts:111-116`), que lleva a Etiquetas a poner rebaja `[código: analisis-acciones.ts:67-71]`. Se venden a ~1 por día. **Esto es dinero (margen), por eso el tope 5.**
   - **El dato para corregirlo ya existe:** las 718 ventas sin prenda de TRU y AQP tienen **categoría, talla y color** registrados en `prendas_por_regularizar` (100 %) `[producción]`. `fn_analisis_sede` no las lee (`where l.variante_id <> c_centinela`) `[producción]`.
3. **Las decisiones del 12-oct no se aplicaron, y lo que siguen midiendo está torcido en la misma dirección.** El ritmo se divide entre los días que la **tienda** lleva vendiendo (`analisis-reglas.ts:75-76`, `analisis-pedir.ts:148`), no entre los que la prenda estuvo colgada; medido el 12-oct en una sesión anterior (no se repitió hoy), eso infla la cobertura ~2,9× en TRU `[doc: decisión del 12-oct]`. Sumado al 46 % de registro, **todo lo que dice «cuánto dura» sale largo**: avisa tarde de lo que se acaba y temprano de lo que «no se mueve». «Liquidar» sigue siendo un número fijo (15) cuando Felipe decidió medirlo contra la vara de su categoría, que ya existe en Frescura (`frescura-reglas.ts:1530`, `varaQueJuzgo`) `[código]`. Y **el carril «Vigílalas» está muerto**: exige `30 ≤ días < liquidarDesde`, imposible con 15 (`analisis-reglas.ts:113`), y ninguna prueba lo cubre por debajo de 30 `[código]`.
4. **Dos pantallas del mismo grupo juzgan lo mismo con dos varas.** «Frescura del piso» (al lado, en Gestión) juzga una prenda quieta contra el ritmo de **su categoría**; Análisis ▸ No se vende, contra **15 días para todo** `[código]`. La misma blusa puede estar «fresca» en una y «para liquidar» en la otra. Una de las dos está mal: por la regla de Felipe (memoria del 12-oct y ADR-0208), la de Análisis.
5. **«Ver qué falta» promete lo que no se puede hacer.** El botón dice «Registrar 347 sin prenda» (cuenta 30 días: `TodaviaNo.tsx:30-39`, `analisis-aviso.ts:39-47`) `[código + producción]`, pero en Por regularizar solo hay **41**: las otras 306 ya se cerraron. Y no dice cuándo se va el aviso: aunque desde hoy todo se cobre con su prenda, la regla pide 14 días seguidos sobre el 90 % (`motor-demanda-reglas.ts:24`); el mejor caso es el **28-oct**. TRU iba al 64 % ayer (18 de 28) `[producción]`.

Trade-off honesto: nada de esto rompe stock ni escribe dinero por sí solo; la pantalla **orienta** decisiones de dinero (comprar, rebajar, mandar). Con el aviso arriba, una líder atenta desconfía; una encargada nueva, no.

## 3 · Lo que está bien y no se toca
- **Lee todo en el servidor y se degrada sin caerse.** Nueve lecturas en `Promise.all`; cada falla se vuelve una frase en `fallas` y la pantalla dice «… Lo demás está al día» (`analisis-datos.ts:55-72,119`; `AnalisisPantalla.tsx:277-281`) `[código]`. Si falla «Liquidar desde», usa 60 (`analisis-liquidar.ts:17`). Es el principio 9 bien aplicado.
- **El «hoy» y los días son de Lima y salen de la base** (`fn_hoy_lima()`, `at time zone 'America/Lima'` en toda `fn_analisis_sede`) `[producción]`.
- **`fn_analisis_sede` en producción es la última del repo** (trae `ultima_venta`, de `20261010120000`), `security definer` con `search_path` fijo, devuelve `null` sin acceso, y excluye la centinela, los productos de prueba y las familias fuera de los motores (ADR-0377) `[producción]`.
- **El aviso «Datos incompletos» es honesto y exacto**: 305 de 652 = 46,8 % → «46 de cada 100» (`Math.floor`, `analisis-aviso.ts:53-57`) `[producción + código]`. Que la pantalla diga que puede fallar es lo correcto; el problema es lo que dice debajo (objeción 1).
- **`guardar_liquidar_desde`** firma con `fn_actor_persona_id(true)`, toma la fila `for update`, valida 1–999 y deja antes/después en `configuracion_historial` `[producción]`. El historial funciona: 60→30 y 30→5 el 07-oct, 5→15 el 10-oct.
- **Cada respuesta lleva a su flujo y nunca sugiere cantidades** (decisión 7): Compras, Producción, Traslados, Etiquetas, Bajar al piso, Existencias, Movimientos (`analisis-acciones.ts`) `[código]`.
- **Reglas puras con pruebas** (`analisis-*.test.ts`, catorce archivos) y la prueba de base `scripts/pruebas/analisis_lecturas.mjs` `[código]`. Sin hex sueltos, sin `Math.random`, divisiones protegidas `[código]`.
- **Movimiento dentro de lo permitido** (ADR-0136 act. 2026-10-06 (b)): se arma una vez y se apaga con `prefers-reduced-motion` `[doc]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 6 | Coherente con los tokens, pero el rojo se gasta: 5 «Ya no hay» + 2 «Urgente» + la cifra de la pestaña, contra un tope de 2 | `[visto]`, `analisis.css:32`, `design-tokens.ts:73` |
| Lógica de negocio | 3,5 | «Va bien» sin poder saberlo; ritmo con el 46 % de las ventas; decisiones del 12-oct sin aplicar; «Vigila» muerto | `[producción]`, `analisis-reglas.ts:75,113` |
| Arquitectura | 7 | Lectura en servidor, degradación por pieza, RPC seguras; lee dos RPC que nadie usa y no aprovecha `prendas_por_regularizar` | `analisis-datos.ts:96,112`, `[producción]` |
| Funciones | 5,5 | Las 5 pestañas funcionan; «Registrar 347» promete 306 de más; «Vigílalas» nunca aparece; falta usar la categoría de lo vendido sin prenda | `TodaviaNo.tsx:30-39`, `[producción]` |
| Utilidad | 4,5 | Una encargada nueva confía en el verde, no sabe qué hacer con 5 «Ya no hay» y se pierde en «Capas y Corsets y 6 tipos más» | `[visto]`, escenario abajo |
| Conexión con el ERP | 7 | Bien enganchada a los flujos; desconectada de Frescura (otra vara), del Plan de campaña (otra fecha) y de la carga inicial | `[código]`, `[producción]` |

**Promedio:** (6 + 3,5 + 7 + 5,5 + 4,5 + 7) / 6 = **5,6 → tope 5** (puede orientar una rebaja sobre prendas que se venden: objeción 2).

### 4.1 Estética
- (a) **Coherencia CAYLA:** solo tokens; cabecera `EncabezadoPagina` con sede, fecha y título de 46 px; pestañas en vidrio con la píldora oscura (decisión de `/unificar`) `[visto]`. **El rojo dejó de ser señal:** «urg» pinta `--color-rojo-profundo` (`analisis.css:32`) y la captura tiene al menos 8 piezas en ese tono (5 «Ya no hay», 2 chips «Urgente», la cifra 22) `[visto]`; `MAX_ROJO_POR_PANTALLA = 2` (`packages/shared/src/design-tokens.ts:73`). Existencias y Frescura ya lo tratan como un presupuesto (`lib/existencias-para-hoy.ts:14`, `lib/frescura-pantalla.ts:29`) `[código]`: Análisis es la que se sale.
- **Dos veces lo mismo:** el chip «Datos incompletos» junto a las pestañas y el aviso grande debajo dicen lo mismo `[visto]` (ley 8, quitar antes de agregar).
- **El titular de «¿Qué pedir?»** parte «Capas y / Corsets» en dos líneas de serif grande y sigue con «y 6 tipos más»: dos «y» seguidas que se leen como «Capas y Corsets y 6» `[visto]` (`PestanaHoy.tsx:101-119`, `tipoCorto` en `analisis-pedir.ts:203`).
- **El esqueleto miente:** `loading.tsx:1,20` dibuja 4 pestañas y la pantalla tiene 5 `[código]`.
- (b) Tono y marca: lenguaje de tienda («Cómpralas», «Mándalas», «Bájalas al piso») `[visto]`. (c) Heurísticas: la tarjeta «¿Qué no ha salido al piso?» aparece con borde de foco o hover `[visto]` (no se pudo comprobar cuál es: `[no verificable]`).

### 4.2 Lógica de negocio
- **«Va bien» sin poder saberlo** (objeción 1). Ninguna decisión escrita dice qué debe decir la tarjeta cuando la tienda es más nueva que el umbral; ADR-0357 decisión 2 sí dice que las cifras abren «con los datos de hoy y un aviso fijo», pero no que una tarjeta pueda dar un veredicto verde bajo ese aviso.
- **Ritmo con el 46 %** (objeción 2). ADR-0357:84 reconoce el costo («Se está acabando puede quedarse corto, No se vende puede marcar como quieta una prenda vendida sin registrar»), pero **no midió que el faltante tiene categoría**, ni que hay 7 categorías al 0 %. Ninguna D-nn cubre usar `prendas_por_regularizar` en un motor.
- **Decisiones del 12-oct sin aplicar** (objeción 3): ritmo por los días de la prenda en el piso, «liquidar» contra la p90 de su categoría con `varaQueJuzgo`, `liquidar_desde` pasa a respaldo. `analisis-reglas.test.ts:62-71` fija la regla vieja `[código]`. Ningún ADR las registra: hay que escribirlas antes de construirlas (principio 8).
- **«Vigílalas» muerto** con `liquidarDesde ≤ 30` (`analisis-reglas.ts:113`) `[código]`. `liquidar_desde` cambió 3 veces en 4 días (60 → 30 → 5 → 15) `[producción]`: con cada cambio por debajo de 30 el carril desaparece sin que nadie lo note.
- **«Qué pedir» contra un 25-dic fijo y a ritmo plano** (`proximaNavidad`, `analisis-pedir.ts:32-35`) `[código]`. R-19 dice que diciembre vende ×1,59–2,30 en TRU (`docs/datos/15-COMO-OPERA-CAYLA.md:277-283`) `[doc]`, y Compras ▸ Plan de campaña (ADR-0349) ya mide contra campañas `[doc]`. Dos pantallas responden «qué comprar» contra fechas distintas (#5).
- **La carga inicial no existe para Análisis.** TRU está en carga hasta el **18-oct**, AQP hasta el 21 y LIM hasta el 31 (`ubicaciones.carga_inicial_hasta`) `[producción]`; ningún archivo de Análisis la lee `[código: grep vacío]`. Los «14 días» de los 74 modelos que «nunca salieron al piso» son, casi seguro, la carga del 30-sep `[inferido]`.
- **«Nunca salió al piso» con el piso nunca cuadrado:** TRU tiene **0 cuadres de piso** `[producción]`. La regla (`analisis-reglas.ts:58`) cuenta lo que no tiene movimiento al piso; si alguien colgó sin registrar (ya pasó: ADR-0306), la prenda aparece aquí estando colgada.
- **Referentes** (de memoria, no verificado): Shopify Analytics y Lightspeed muestran «sell-through» y «days of cover» **con la base de la cifra a la vista** y separan «sin datos suficientes» de «sano»; NetSuite marca un ítem como «insufficient history» antes de recomendar. Pasa el filtro de 3 tiendas: decir «todavía no se puede saber» es gratis y le sirve hoy.

### 4.3 Arquitectura
- **Cadena:** `page.tsx:19` (`exigirModulo("analisis")`, y `puede(persona,"analizar")` o redirige a `/inventario`) → `getAnalisis` (`analisis-datos.ts:55-72`) → 9 lecturas en paralelo → `armarPrendas` / `armarModelos` (`analisis-modelo.ts:132-175`) → pestañas `[código]`.
- **Estados imposibles:** la pantalla solo escribe `parametros_analisis` (una fila, `id = true`, RLS sin políticas, se escribe solo por `guardar_liquidar_desde`) `[producción]`. No puede dejar el inventario en un estado imposible. `pedir_a_otra_sede` (desde «o pedir a…») es la RPC de Traslados, con sus candados `[código]`.
- **Permisos:** `fn_analisis_sede` exige `fn_tiene_acceso_retail()` y `fn_puede_analizar()` y **no la sede**: quien analiza lee las tres tiendas `[producción]`. Es la decisión 8 de ADR-0357, no un hueco. `guardar_liquidar_desde` cambia **un valor para las tres tiendas** y lo puede tocar cualquiera con el módulo (no solo el líder) `[producción]`: decisión 5, escrita; el riesgo es que se mueva sin que nadie avise (pasó 3 veces en 4 días).
- **Lecturas de sobra:** `datos.conteo` (2 RPC: `fn_conteos_resumen`, `fn_nombres_personas`) y `sabeUltimaVenta` se calculan y nadie los lee (`analisis-datos.ts:96,108,112`) `[código]`.
- **Fechas:** «Te pidieron y no había» toma el día con `creadoEn.slice(0,10)` (`analisis-datos.ts:117`): día UTC; después de las 19:00 de Lima muestra el día siguiente `[código]`. «Lo que más rinde» usa el reloj del servidor (`analisis-rinde.ts:19`) y el resto, la fecha de la base `[código]`.
- **Volumen:** TRU hizo 652 líneas en 14 días `[producción]` → ~17 000 por tienda al año → ~150 000 en 3 años y 3 tiendas. `fn_analisis_sede` recorre **toda la historia** de ventas de la tienda (por `ultima_venta`) y se llama **una vez por tienda** en cada carga (`analisis-sede.ts:31`). Hoy es nada; a 150 000 líneas sigue siendo aceptable si `venta_items(venta_id)` y `ventas(ubicacion_id)` tienen índice `[no verificable: no se midió el plan]`. No hace falta tocarlo ahora.
- **Caída externa:** no depende de SUNAT ni de apis.net.pe. Si una RPC no responde, se degrada así: dice cuál falló y muestra lo demás, **sin perder ningún dato** (no escribe nada salvo «Liquidar desde») `[código]`. Una sola excepción: si falla `getUbicaciones` (`exigir`, `ubicaciones.ts:26`), la pantalla entera cae a `error.tsx` `[código]`.

### 4.4 Funciones
- **Existen y funcionan:** las 5 pestañas; buscador en el navegador (sin URL, ADR-0357; acepta `?q=` desde Compras, ADR-0372); hoja «Liquidar desde» con historial; «Pedir a otra sede»; botones a 7 flujos; aviso y hoja de confianza `[código]`.
- **A medias o fantasma:** «Registrar 347 sin prenda», cuando solo 41 se pueden registrar (objeción 5); el carril «Vigílalas», que con 15 no aparece nunca; «¿Qué no se mueve?» con «Va bien», que no puede ser otra cosa mientras la tienda tenga menos días que el umbral.
- **Faltan para cumplir la finalidad:** usar la categoría, la talla y el color de lo vendido sin prenda (#1); decir «todavía no se puede saber» (#2); la vara por categoría (#3).
- **Sobran:** la lectura del último conteo (2 RPC sin uso); el chip «Datos incompletos», que repite el aviso.

### 4.5 Utilidad — escenario
**Una encargada nueva de TRU abre Análisis el miércoles a las 9:20, antes de abrir la tienda.**
1. Ve «Datos incompletos» dos veces y un «Urgente» rojo. No sabe si eso es grave o normal: duda.
2. «¿Qué se acaba?»: cinco filas, las cinco «Ya no hay» en rojo `[visto]`. Lo que todavía se puede salvar (los modelos a los que les quedan 2 o 3 días) **no aparece**, porque los agotados van primero y la tarjeta corta en 5 (`ordenSeAcaba`, `analisis-reglas.ts:129-131`). Se equivoca: cree que ya llegó tarde a todo.
3. «¿Qué no se mueve?» → «Va bien». Se queda tranquila: **se equivoca**, la pantalla no lo sabía.
4. «¿Qué pedir?» → «Capas y Corsets y 6 tipos más no llegan a Navidad». No sabe cuáles son los 6; para saberlo cambia de pestaña. Si le preguntan por Faldas o Shorts, la pantalla no las nombra.
5. Toca «Ver qué falta» → «Registrar 347 sin prenda» → Por regularizar le muestra 41. **Se pierde**: no sabe dónde están las otras 306.
Cada error es del diseño, no de la capacitación.

### 4.6 Conexión con el ERP
Ver la sección 6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 9 | Es el tablero de «qué hago hoy» del grupo Gestión: comprar, mandar, rebajar, colgar. Indirecto bajo: consume datos, casi no los crea. |
| Dinero y stock que toca | ×1 | 7 | No mueve stock ni cobra, pero orienta compras, traslados y rebajas, y cambia un parámetro de las tres tiendas. |
| Frecuencia y personas que la usan | ×1 | 5 | Líder y encargadas con el módulo, a diario o semanal `[inferido: no se midió el uso]`; la Integrante no la ve (ADR-0392, decisión 4). |
| Qué se detiene si falla | ×1 | 3 | Si cae, ninguna venta ni traslado se detiene: las decisiones se toman a ojo. |

Relevancia = (2·9 + 7 + 5 + 3) / 5 = **6,6 — Soporte**.

## 6 · Conexión con el ERP
- **Aguas arriba:** Vender (`ventas`, `venta_items`; la centinela de ADR-0179), Cambios y Devoluciones (restan de la línea), Existencias (`fn_existencias_base`, ADR-0270), Bajar al piso (`movimientos` hacia `piso_venta`), Compras (`compra_item_reparto_resumen`), Traslados (en tránsito), Catálogo (categorías, `fn_origen_producto`, precios por sede), el motor de demanda (`fn_motor_demanda_preparacion`). **Desconectado de:** `prendas_por_regularizar` (que tiene categoría, talla y color de 718 ventas) y `ubicaciones.carga_inicial_hasta`.
- **Aguas abajo:** Compras (`/compras/nueva?prov=`), Producción (`/produccion/ordenes?nueva=`), Traslados (`/inventario/traslados/nuevo?lineas=…`), Etiquetas (`/etiquetas-de-precio?variantes=…`), Bajar al piso, Existencias, Movimientos, Frescura, Plan de campaña, Por regularizar, Cuadrar y Conteo (`analisis-acciones.ts`, `TodaviaNo.tsx:38-52`). Lo único que escribe, `parametros_analisis.liquidar_desde`, solo lo lee Análisis.
- **Pájaro dueño y vecinos:** ADR-0392:31 y el módulo 13 dicen **Águila (13)**, pero `AVIARIO.md:25` le da a Águila solo `actividad`, y `parametros_analisis` es de **Halcón (05)** (`AVIARIO.md:149`). Los dos figuran «libres» en `07-GOBIERNO.md:37`. Vecinos: Halcón (`stock`, `movimientos`, `cuadres_piso`), Lechuza (`conteos`), Colibrí (`ventas`, `prendas_por_regularizar`), Pelícano (`compra_items`), Loro (`productos`, `variantes`, `categorias`). En el menú: Frescura, Plan del piso y Rendimiento.
- **Externos:** ninguno. No llama a SUNAT, Lucode ni apis.net.pe. Depende de `public.personas` solo por la puerta de acceso (`fn_tiene_acceso_retail`): sin ella devuelve `null` y la pantalla lo dice.

## 7 · Las 12 tareas, por importancia

### #1 · [Reconstruir] Lo vendido sin prenda cuenta por tipo, talla y color
- **Dónde:** `fn_analisis_sede` (migración nueva: un bloque `sin_prenda` por categoría, y por categoría × talla × color, desde `prendas_por_regularizar` con `estado in ('pendiente','cerrada_sin_prenda')`, en la misma ventana de 30 días) → `lib/analisis-sede.ts`, `lib/analisis-pedir.ts:142-169` (`alcancePorTipo` suma lo vendido sin prenda de su tipo) y `lib/analisis-reglas.ts:111-116` (`grupoDe`: un modelo cuya categoría, talla y color tienen ventas sin prenda en la ventana **no pasa a «Liquidar»**; pasa a «Puede haberse vendido sin registrar»).
- **Por qué en este puesto:** es lo único de la lista que puede **mandar a rebajar prendas que se venden** (Shorts: 16 vendidos, 0 con prenda, 18 en stock) y que **cambia qué se compra para Navidad** (Faldas pasa de «llega» a «no llega»). Y es barato: el dato ya está, al 100 %, en las dos tiendas `[producción]`. Sin esto, todo lo demás de esta lista sigue razonando con el 46 %.
- **Cómo lo verificas tú:** en TRU, «Qué pedir» muestra Faldas con 22 vendidas en 30 días (no 8) y la nombra entre las que no llegan; Shorts aparece en «Qué pedir» con su ritmo; ningún modelo de Shorts aparece en «No se vende» ▸ Liquidar. Consulta: `select count(*) from retail.prendas_por_regularizar where estado in ('pendiente','cerrada_sin_prenda')` debe ser igual a la suma de `sin_prenda` que devuelve la RPC.
- **Esfuerzo / dependencias:** M · migración + RPC: **espera tu OK** (CLAUDE.md: RPC y regla de liquidación). Antes que #3.
- **DECIDÍ:** usar `prendas_por_regularizar` solo donde la pregunta es por **tipo** («Qué pedir») o como **freno** («no la liquides todavía»), nunca para inventar el ritmo de un modelo: la venta sin prenda dice «una falda talla M negra», no cuál falda. **DESCARTÉ:** escalar el ritmo de cada modelo por el % de registro de su categoría (×1/0,36 en Faldas), porque reparte las ventas perdidas a ciegas entre modelos que quizás no se vendieron, y una prenda sin ninguna venta seguiría en cero. **SE ROMPE SI:** una tienda registra la categoría equivocada en la venta sin prenda (vende un short y anota «Faldas»): el freno protege la prenda equivocada. Hoy no hay cómo saberlo; el riesgo es menor que liquidar a ciegas.

### #2 · [Corregir] Ninguna tarjeta dice «Va bien» cuando no puede saberlo
- **Dónde:** `components/analisis/PestanaHoy.tsx:73,203` (el estado y el texto vacío de «¿Qué no se mueve?») y la misma lógica para «¿Qué se acaba?»; regla pura nueva en `lib/analisis-hoy.ts` (`puedeJuzgarQuietas(diasDeVentas, liquidarDesde)`) con su prueba.
- **Por qué en este puesto:** es el error que la encargada **sí** comete (escenario, paso 3) y el arreglo es solo web. Mientras la tienda lleve menos días vendiendo que el umbral, la tarjeta debe decir «Todavía no se puede saber: tu tienda lleva 14 días vendiendo en el ERP y se juzga desde los 15» con el chip «Para saber» (pizarra), nunca «Va bien». Y, mientras el aviso de datos incompletos esté arriba, ninguna tarjeta queda en verde: a lo sumo «Sin señales con lo registrado».
- **Cómo lo verificas tú:** hoy en TRU, la tarjeta dice «Todavía no se puede saber» en pizarra; en una base local con una tienda de 40 días y datos completos, vuelve a decir «Va bien». Prueba: `analisis-hoy.test.ts` con `diasDeVentas = 14, liquidarDesde = 15`.
- **Esfuerzo / dependencias:** S · ninguna.

### #3 · [Reconstruir] Aplicar las dos decisiones del 12-oct: ritmo por los días en el piso y «liquidar» contra la vara de su categoría
- **Dónde:** `lib/analisis-reglas.ts:75-76` (divisor = días que la prenda estuvo colgada, desde `salioAlPiso`, con tope 30; ya viaja en el payload, `analisis-tipos.ts`), `lib/analisis-pedir.ts:148`, `lib/analisis-reglas.ts:111-116` (`liquidar` cuando los días sin venderse pasan la p90 de su categoría según `varaQueJuzgo`, `frescura-reglas.ts:1530`, con su cascada mes → CAYLA → hoy; `liquidar_desde` queda de respaldo), `analisis-reglas.test.ts:62-71` (fija lo viejo: se reescribe), ADR-0357 (actualización nueva **antes** del código).
- **Por qué en este puesto:** resuelve la objeción 4 (dos varas en el mismo menú) y resucita «Vigílalas» (el segundo escalón también pasa a la vara). Va después de #1 porque sin las ventas sin prenda la vara de la categoría también sale corta.
- **Cómo lo verificas tú:** la misma prenda sale «quieta» en Frescura y en «No se vende», o en ninguna de las dos; con `liquidar_desde = 15`, el carril «Vigílalas» tiene filas cuando corresponde; un modelo colgado hace 4 días con 2 ventas muestra un ritmo de ~0,5 por día, no de 0,13.
- **Esfuerzo / dependencias:** L · después de #1; **antes de construir, confirma que las dos decisiones siguen en pie** (son del 12-oct y no están escritas).
- **DECIDÍ:** reusar `varaQueJuzgo` de Frescura tal cual, sin copiarla, para que las dos pantallas no puedan volver a separarse. **DESCARTÉ:** subir `liquidar_desde` a un número «más realista» (30 o 45), porque medido el 12-oct un número fijo marca **0 prendas** en las 17 categorías: nada en CAYLA tarda tanto si se va a vender. El problema no es el número, es que sea uno solo. **SE ROMPE SI:** una categoría tiene menos de `VENTAS_PARA_JUZGAR_SOLA = 10` ventas en la tienda y en CAYLA: cae a la vara de hoy, que con una tienda de 15 días es casi ruido. La cascada de Frescura ya lo dice en pantalla; Análisis tiene que decirlo igual.

### #4 · [Corregir] «Ver qué falta» dice lo que se puede arreglar, y cuándo se va el aviso
- **Dónde:** `components/analisis/TodaviaNo.tsx:30-39`, `lib/analisis-aviso.ts:39-47,85-89` (`pasoParaHablar`); el conteo de pendientes de `prendas_por_regularizar` (`estado = 'pendiente'`), ya lo lee Por regularizar.
- **Por qué en este puesto:** hoy promete «Registrar 347» y la pantalla de destino tiene 41 (escenario, paso 5). Debe decir: «Registrar 41 pendientes · 306 ya se cerraron sin prenda: esos días no vuelven». Y la fecha honesta: «Si desde hoy cobras todo con su prenda, el aviso se va el 28 de octubre» (14 días seguidos sobre el 90 %, `motor-demanda-reglas.ts:24`). La misma regla la usa Frescura (`pasoParaHablar` es compartida): se arregla en las dos.
- **Cómo lo verificas tú:** en TRU el botón dice 41 y Por regularizar muestra 41; la fecha cambia sola si mañana se cobra un día bajo el 90 %.
- **Esfuerzo / dependencias:** S · ninguna.

### #5 · [Replantear] «Qué pedir»: ¿contra un 25 de diciembre fijo o contra la campaña de Compras?
- **Dónde:** `lib/analisis-pedir.ts:32-35` (`proximaNavidad`) y `:142-169`; `components/analisis/PestanaPedir.tsx`; Compras ▸ Plan de campaña (ADR-0349, `lib/plan-compra*.ts`).
- **Por qué en este puesto:** dos pantallas responden «qué comprar» contra dos fechas y dos ritmos (Análisis: 25-dic a ritmo plano; Plan: la campaña, con su plan por categoría). Una está mal. Decide Felipe; el detalle está en la sección 8.
- **Cómo lo verificas tú:** una vez decidida, «Qué pedir» y el Plan de campaña dicen lo mismo de la misma categoría el mismo día.
- **Esfuerzo / dependencias:** decisión: S · construir: M (B) o S (C). Después de #1 (si no, las dos pantallas comparten un ritmo con el 46 %).
- **DECIDÍ:** que la decisión es tuya y no se construye nada antes. **DESCARTÉ:** dejar las dos como están, porque el 13-oct el Plan tenía 0 de 45 categorías con plan (`docs/pantallas/compras-plan-prompt-maestro.md:6`) y Análisis ya le está diciendo a la tienda qué comprar con otra vara: cuando el Plan se llene, van a discrepar a la vista. **SE ROMPE SI:** se elige B y no hay ninguna campaña cargada: «Qué pedir» queda sin fecha. B necesita caer a Navidad cuando no hay campaña.

### #6 · [Corregir] El rojo vuelve a ser señal, y «¿Qué se acaba?» muestra lo que todavía se salva
- **Dónde:** `lib/analisis-hoy.ts:48-51` (`textoDiasQueQuedan`: «Ya no hay» en `urg`), `analisis.css:32`, `PestanaHoy.tsx:73,176-198`, `ordenSeAcaba` (`analisis-reglas.ts:129-131`).
- **Por qué en este puesto:** 8 rojos contra un tope de 2 (Existencias y Frescura ya lo cumplen), y la tarjeta más urgente gasta sus 5 filas en lo que ya se perdió. Propuesta: una línea «5 ya no hay →» (lleva al filtro) y las 5 filas para lo que se acaba en 1 a 14 días, más urgente primero; el rojo queda solo para el chip de la tarjeta.
- **Cómo lo verificas tú:** en TRU la tarjeta muestra los modelos con 1–3 días y una línea con los agotados; contando en la captura, 2 rojos o menos.
- **Esfuerzo / dependencias:** S · ninguna. Que «agotado» pese menos que «se acaba en 2 días» es una decisión de negocio: si prefieres al revés (lo perdido primero), queda solo el arreglo del rojo.

### #7 · [Corregir] «Nunca salió al piso» dice en qué se basa: carga inicial y piso sin cuadrar
- **Dónde:** `lib/analisis-piso.ts:29-32` (`diasEnAlmacen`), `PestanaPiso.tsx`, `PestanaHoy.tsx` (la tarjeta); `fn_motor_demanda_preparacion` ya trae si el piso está cuadrado; leer `ubicaciones.carga_inicial_hasta` (lectura simple, sin RPC nueva si `getUbicaciones` la trae).
- **Por qué en este puesto:** TRU tiene **0 cuadres de piso** y está en carga hasta el 18-oct `[producción]`: los 74 modelos «con 14 días en almacén» son, casi seguro, la carga del 30-sep, y alguno puede estar colgado sin registrar. La pestaña debe decir «Según lo registrado: el piso de esta tienda todavía no se cuadró» con su botón a Cuadrar, y «En carga inicial hasta el 18-oct» mientras dure.
- **Cómo lo verificas tú:** en TRU la tarjeta y la pestaña muestran las dos notas; después del primer cuadre, la del piso desaparece.
- **Esfuerzo / dependencias:** S · ninguna.

### #8 · [Corregir] El titular de «¿Qué pedir?» se lee de un golpe
- **Dónde:** `PestanaHoy.tsx:101-119`, `analisis-pedir.ts:203` (`tipoCorto`).
- **Por qué en este puesto:** «Capas y / Corsets y 6 tipos más» `[visto]` se lee como una sola lista rara. Propuesta: «8 tipos no llegan a Navidad» como titular y «Capas, Corsets y 6 más» debajo; el número primero (ley 2: una pregunta, una respuesta).
- **Cómo lo verificas tú:** captura a 1440 y 1920 px: el titular en una línea, sin dos «y» seguidas.
- **Esfuerzo / dependencias:** S · después de #1 (los tipos que nombra cambian).

### #9 · [Eliminar/fusionar/conectar] Quitar lo que repite o nadie usa
- **Dónde:** el chip «Datos incompletos» (`AnalisisPantalla.tsx:342-350`): sale cuando el aviso grande está a la vista y queda solo como atajo a `HojaConfianza` si el aviso se pliega; la lectura del último conteo (`analisis-datos.ts:96,112`: 2 RPC por carga) y `sabeUltimaVenta` (`:108`); `TodaviaNo.tsx:38-52`, que repite a mano los enlaces de `pasoParaHablar`.
- **Por qué en este puesto:** ley 8 (quitar antes de agregar) y 2 lecturas menos en cada carga; no cambia ninguna decisión.
- **Cómo lo verificas tú:** en la red del navegador, ya no aparecen `fn_conteos_resumen` ni `fn_nombres_personas` al abrir Análisis; en pantalla, «Datos incompletos» se lee una sola vez.
- **Esfuerzo / dependencias:** S · ninguna.

### #10 · [Corregir] Cinco detalles que mienten poco pero mienten
- **Dónde:** (a) `analisis-datos.ts:117`: el día de «Te pidieron y no había» en UTC → `hoyLima`/`fechas-lima.ts`; (b) `analisis-pedir.ts:474-476`: «Todavía no hay 90 días…» cuando «Lo que más rinde» viene vacío por permisos (`fn_resumen_comparacion` exige operar la sede); (c) `PestanaQuieta.tsx:95,104`, `analisis-hoy.ts:131`, `analisis-quietas.ts:180`: «más de X días» y «más de un mes» con una regla que es «≥» y un umbral de 15; (d) `loading.tsx:1,20`: 4 pestañas en vez de 5; (e) `rebaja_de_100` en `fn_analisis_sede` cuenta las líneas de la centinela (si su categoría responde «sí» a `fn_categoria_entra_a_motores`).
- **Por qué en este puesto:** cada uno es chico; juntos son la diferencia entre una pantalla en la que se confía y una que «a veces dice cosas raras».
- **Cómo lo verificas tú:** (a) un pedido anotado a las 20:00 sale con su día; (c) con umbral 15, el texto dice «15 días o más»; (d) el esqueleto tiene 5 pestañas.
- **Esfuerzo / dependencias:** S (e: M, es SQL: con tu OK).

### #11 · [Mejorar] Pasar `/chaos` y `/formidable` con una encargada real
- **Dónde:** `docs/chaos/README.md` (Análisis no tiene fila, aunque guarda «Liquidar desde»), `docs/formidable/README.md:22` («sin probar: solo medido (rapido)»); la hoja `HojaLiquidarDesde.tsx` (un valor para las tres tiendas que cambió 3 veces en 4 días).
- **Por qué en este puesto:** CLAUDE.md las exige al cerrar una pantalla que guarda; las dos están pendientes desde el 07-oct. Lo que importa de chaos aquí: dos personas cambiando «Liquidar desde» a la vez, y un valor fuera de rango pegado.
- **Cómo lo verificas tú:** fila de Análisis en los dos tableros, con fecha y resultado.
- **Esfuerzo / dependencias:** M · después de #1–#4 (no tiene sentido calificar lo que va a cambiar).

### #12 · [Mejorar — bajo valor / opcional] Poner los documentos al día
- **Dónde:** ADR-0357 (dos decisiones 11 y dos 12; la 1, la 9 y la 12 vieja sin tachar; «cuatro preguntas»); `ARQUITECTURA.md:586,598`; `docs/datos/modulos/13-…` (describe V1 y cita `rotacion.ts`, borrado); el id de la guía `inventario.resumen` (`lib/guias/pantallas/gestion.ts:9-10`); el dueño en AVIARIO (Águila o Halcón).
- **Por qué en este puesto:** al final porque no cambia nada de lo que ve la tienda; pero es lo que hace que la próxima sesión repita la investigación (como pasó el 12-oct).
- **Cómo lo verificas tú:** `grep -n "cuatro" docs/adr/0357*.md ARQUITECTURA.md` sin coincidencias que se refieran a las pestañas; ADR-0357 sin números repetidos.
- **Esfuerzo / dependencias:** S · ninguna. **bajo valor / opcional:** no cambia decisiones.

## 8 · Estrategia alternativa — «Qué pedir» (decide Felipe, tarea #5)
| | **A · Como está** | **B · Contra la campaña** | **C · Fuera de Análisis** |
|---|---|---|---|
| Qué es | Por tipo, contra el 25-dic, a ritmo plano de los días de la tienda | Por tipo, contra la campaña activa o la próxima de `plan_compra` (ADR-0349), con el factor de temporada (R-19: ×1,59–2,30 en TRU en diciembre) y el enlace a su fila del Plan; sin campaña, cae a Navidad | La tarjeta de Hoy dice «8 tipos no llegan» y lleva a Compras ▸ Plan; la pestaña sale |
| Ganas | Nada que construir; funciona sin Compras | Una sola respuesta a «qué comprar» en todo el ERP; diciembre deja de subestimarse | Ley 8: una pregunta, un lugar; menos código |
| Pagas | Dos varas para lo mismo; diciembre se subestima ~2× | M de trabajo; depende de que el Plan tenga campañas cargadas (el 13-oct: 0 de 45 categorías con plan) | Quien no ve Compras (una encargada sin ese módulo) pierde la vista entera |

Mi recomendación: **B**, porque el Plan de campaña ya es la herramienta de compra y Análisis es quien le dice a la tienda qué falta: una sola vara evita que discrepen a la vista. Pero cuesta trabajo y depende de que el Plan se llene; decides tú.

## 9 · Referentes de ERP y futuro
De memoria, **no verificado**:
- **Shopify Analytics / Lightspeed:** «days of cover» y «sell-through» por producto, con la ventana de cálculo escrita junto a la cifra, y «insufficient data» en vez de una cifra cuando hay poca historia. Lo aplicable hoy ya está en #2 y #4.
- **NetSuite / Odoo (reabastecimiento):** punto de pedido por ítem con estacionalidad. **Futuro:** con 3 tiendas y 15 días de historia no hay estacionalidad propia que medir; R-19 (las hojas de cierre) es lo más cercano y ya entra en la alternativa B.
- **Odoo (forecast por categoría):** pronosticar por categoría cuando el ítem tiene poca historia. Es la idea de #1 llevada más lejos (repartir la demanda de la categoría entre sus modelos): **futuro**, solo cuando haya más de 8 semanas de datos con prenda.

## 10 · Fuera de esta pantalla
**Los accesorios no están en el catálogo, así que casi ninguna venta suya puede tener prenda.** Lentes de sol, Pulseras y Relojes tienen **0 productos** (46 ventas sin prenda entre las dos tiendas que ninguna regularización puede arreglar: no hay a qué asignarlas); Aretes, Anillos y Collares tienen 1 o 2 productos para **69** ventas sin prenda `[producción]`. En total, **115 ventas** de accesorios sin prenda. Esto le quita datos a **todos** los motores (Análisis, Frescura, Plan del piso, Producción, el Plan de campaña), y ninguna mejora de pantalla lo compensa. Es la causa raíz más barata de atacar: cargar los accesorios al catálogo (aunque sea con un modelo por tipo y su talla «Estándar») sube el registro de TRU varios puntos al día siguiente. El análisis de Producción (`docs/pantallas/produccion.md`, objeción 1) y el de Existencias (`docs/pantallas/inventario.md`, #1) chocan con el mismo problema: **es una tarea raíz, no tres**. La conversación que importa no es de código, es con las tiendas: AQP cobró el 13-oct con prenda solo 7 de 23 líneas.

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:gestion-analisis]` #1 Lo vendido sin prenda cuenta por tipo, talla y color (`prendas_por_regularizar` en `fn_analisis_sede`; freno a «Liquidar») — M · RPC, con OK de Felipe
- [ ] `[pantalla:gestion-analisis]` #2 Ninguna tarjeta dice «Va bien» cuando la tienda no puede saberlo — S
- [ ] `[pantalla:gestion-analisis]` #3 Aplicar las decisiones del 12-oct: ritmo por días en el piso y liquidar con `varaQueJuzgo` (ADR-0357 primero) — L
- [ ] `[pantalla:gestion-analisis]` #4 «Ver qué falta»: 41 pendientes, no 347, y la fecha en que se va el aviso (también Frescura) — S
- [ ] `[pantalla:gestion-analisis]` #5 Decidir «Qué pedir»: Navidad fija, campaña del Plan o fuera de Análisis — decisión
- [ ] `[pantalla:gestion-analisis]` #6 El rojo a 2 por pantalla; «¿Qué se acaba?» muestra primero lo que se salva — S
- [ ] `[pantalla:gestion-analisis]` #7 «Nunca salió al piso» avisa de la carga inicial y del piso sin cuadrar — S
- [ ] `[pantalla:gestion-analisis]` #8 Titular de «¿Qué pedir?»: el número primero — S
- [ ] `[pantalla:gestion-analisis]` #9 Quitar el chip repetido y las 2 RPC del conteo que nadie usa — S
- [ ] `[pantalla:gestion-analisis]` #10 Cinco detalles: día UTC, mensaje de permisos, «más de», esqueleto de 4 pestañas, rebaja con centinela — S
- [ ] `[pantalla:gestion-analisis]` #11 `/chaos` y `/formidable` con una encargada real — M
- [ ] `[pantalla:gestion-analisis]` #12 ADR-0357, ARQUITECTURA, módulo 13, id de la guía y AVIARIO al día — S, bajo valor
- [ ] `[raíz:ventas-sin-prenda]` Cargar los accesorios al catálogo (Lentes, Pulseras, Relojes: 0 productos; 115 ventas de accesorios sin prenda, 46 sin nada a qué asignarlas) — afecta a Análisis, Frescura, Plan del piso, Producción y Plan de campaña

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Sede · fecha · hora, título, frase | `EncabezadoPagina` | bien | `[visto]` |
| Cabecera | «Busca una prenda» | Filtra en el navegador, sin loader | bien | `[visto]`, ADR-0357 |
| Pestañas | HOY · SE ESTÁ ACABANDO 22 · NO SE VENDE 0 · NUNCA SALIÓ AL PISO 74 · QUÉ PEDIR | Cambian de vista | ajustar: «0» con un umbral que la tienda no alcanza (#2) | `[visto]`, `[producción]` |
| Pestañas | Chip «Datos incompletos» | Abre la hoja de confianza | sobra mientras el aviso está a la vista (#9) | `[visto]` |
| Aviso | «Solo 46 de cada 100 ventas tienen su prenda» + «Ver qué falta» | Aviso fijo + «Todavía no» | bien el aviso; ajustar el botón de destino (#4) | `[producción]`, `TodaviaNo.tsx:30-39` |
| Hoy | «¿Qué se acaba?» (5 × «Ya no hay») | Top 5 por días que quedan | ajustar: lo salvable primero, menos rojo (#6) | `[visto]`, `analisis-reglas.ts:129` |
| Hoy | «¿Qué no se mueve?» «Va bien» | Quietas desde el umbral | ajustar: no puede saberlo (#2) | `[visto]`, `[producción]` |
| Hoy | «¿Qué no ha salido al piso?» (14 días) | Almacén sin piso | ajustar: carga inicial y piso sin cuadrar (#7) | `[visto]`, `[producción]` |
| Hoy | «¿Qué pedir?» barras + Navidad + titular | Alcance por tipo contra el 25-dic | ajustar: datos (#1), vara (#5), titular (#8) | `[visto]`, `analisis-pedir.ts:32` |
| Hoy | «Qué hacer hoy» (CÓMPRALAS) | Flujo de caminos con cintas | bien (decidido por Felipe); hoy solo un camino porque «No se vende» está vacío | `[visto]`, ADR-0357:41 |
| No se vende | «Liquidar desde» + «Guardar para todos» | Un valor para las tres tiendas | bien la RPC; falta chaos (#11); «Vigílalas» muerto (#3) | `[producción]`, `analisis-reglas.ts:113` |
| Lateral | Gestión ▸ Análisis | Entrada de menú (ADR-0392) | bien | `[visto]` |

## Apéndice · Lo que se consultó en producción (solo lectura, 2026-10-14)
1. Funciones de Análisis en `retail` con su md5; cuerpo de `fn_analisis_sede`, `fn_liquidar_desde`, `guardar_liquidar_desde`, `fn_puede_analizar` (security definer y `search_path`).
2. `parametros_analisis.liquidar_desde` (15) y su historial en `configuracion_historial` (sin `hecho_por`).
3. Por tienda: ventas completadas, primera venta, líneas, líneas de la centinela, `carga_inicial_hasta`.
4. Por tienda y día: líneas y líneas de la centinela.
5. `prendas_por_regularizar` por tienda, estado y forma; cuántas tienen categoría, talla y color; si la línea regularizada deja de ser centinela (sí).
6. TRU: piso/almacén libres, variantes y modelos que nunca tocaron el piso, días máximos sin venderse en el piso (14), modelos que cruzarían el umbral, `cuadres_piso` (0).
7. TRU, 30 días: unidades con y sin prenda por categoría; stock por categoría; productos de catálogo en las categorías al 0 %.

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-10-14 | completo | 5,0 (prom. 5,6, tope 5) | 6,6 — Soporte | — (primer análisis de la v4; el de `/inventario/resumen` no existía en `docs/pantallas/`) |
