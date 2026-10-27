# ADR-0536 — «Pregúntale a CAYLA»: la IA que te lleva al botón, y las preguntas que dicen qué construir

- **Fecha:** 2026-10-26 · **Estado:** propuesto. La visión la fijó Felipe con 10 respuestas el 2026-10-26; las tres tensiones de abajo las
  resolví yo con mi recomendación y Felipe puede cambiarlas. **Nada construido, ninguna migración, ninguna clave de API.**
- **Relacionados:** ADR-0389 (guías interactivas: el motor que se reusa), ADR-0306 (un módulo es una entrada del menú), ADR-0161 y ADR-0178
  (roles y «solo das lo que tienes»), ADR-0424 (un error lleva ids, nunca nombres; el limpiador de datos personales), ADR-0450 y principio 9
  (todo puede fallar), ADR-0149 (loader: las lecturas no bloquean), ADR-0358 (una función, una pieza: `<Cajon>`), ADR-0136 (movimiento),
  ADR-0284 (guía de foco), ADR-0350 (Formidable).

## El problema

Una colaboradora que no sabe dónde está algo hoy tiene tres salidas: preguntarle a su líder (que quizá está en otra sede), buscar a ciegas por
el menú, o no hacerlo. Las 79 guías interactivas (ADR-0389) explican cada pantalla, pero **solo sirven si ya sabes a qué pantalla ir**: nadie
abre la demo de Ventas ▸ Comprobantes para aprender a anular una boleta si no sabe que se anula ahí.

Y hay una segunda pérdida, más cara: **cada vez que alguien no encuentra algo, nadie se entera.** No sabemos qué funciones faltan, cuáles
existen pero están escondidas, qué regla del negocio nadie entendió ni qué acceso pide la gente. Felipe lo planteó así: si la IA junta todas
las preguntas, las sin solución dicen qué construir y las frecuentes dicen qué hay que mover a la vista.

## Lo que decidió Felipe (2026-10-26)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Cómo responde | **Guía viva:** el motor de las guías te lleva a la pantalla y enciende cada pieza con el velo y el cursor fantasma. |
| 2 | Dónde vive | **Botón en la cabecera + atajo de teclado** («?» fuera de un campo y ⌘/ desde cualquier lado: ⌘K ya era del buscador de la cabecera), en toda pantalla. Abre un `<Cajon>`. |
| 3 | Qué contesta | **Cómo hacer algo en el ERP · reglas del negocio · por qué el sistema hizo algo.** No lee datos de la tienda (ventas, stock). |
| 4 | ¿Actúa? | **Llena, la persona confirma:** puede escribir en los campos; el botón que guarda lo aprieta siempre la persona. |
| 5 | Sin acceso | **Dice quién puede** («eso lo hace quien tiene Inventario ▸ Existencias; pídeselo a tu líder de equipo»), y se registra. |
| 6 | ¿Sirvió? | **«¿Te sirvió? Sí / No»**, **la IA clasifica cada pregunta sola**, y **una frase opcional si dijo No** («¿Qué buscabas?»). |
| 7 | Informe | **Pantalla en el ERP + resumen cada lunes** con las 5 mejoras y su evidencia. |
| 8 | Qué se guarda | **Quién, sede, pantalla y la pregunta.** Nunca un DNI ni datos de clientes. |
| 9 | Presupuesto | **Tope de US$30 al mes**; al llegar, el asistente sigue en **modo básico** (busca en las guías, sin IA). Nunca se cae. |
| 10 | Lanzamiento | **Una sede primero**, 2-3 semanas, antes de abrirlo a todas. |

## Cómo funciona

### 1. La IA no inventa dónde hacer clic: elige de un catálogo cerrado

El riesgo número uno de un asistente así es que diga «toca el botón Anular arriba a la derecha» y ese botón no exista. Por eso **la IA nunca
escribe un selector ni describe una pantalla de memoria: elige y encadena PASOS que ya existen** en `lib/guias/pantallas/*.ts` (cada uno con su
`data-guia`, su título y su texto, vigilados por las huellas de `lib/guias.test.ts`). Su respuesta es un objeto (salida estructurada, validada
con Zod en el servidor) que solo puede nombrar guías y pasos del registro; **un ancla que no está en `GUIAS` se rechaza antes de llegar a la
pantalla**, y la respuesta cae a texto con la guía de esa pantalla. Así el asistente hereda gratis lo que ya cumple el ERP: si una pantalla
cambia, su guía cambia en el mismo PR (regla ADR-0389), y el asistente se entera solo.

Lo que falta para eso es un concepto nuevo, el **recorrido**: hoy una guía es de UNA pantalla y el motor se niega a tocar un enlace a otra
ruta (`motivoParaNoTocar`: «lleva a otra pantalla»). Un recorrido es una lista de tramos `{ ruta, pasos }`, y **el motor navega él mismo entre
tramos** (con el router, como hace `?demo=1` hoy), sin tocar el enlace. «¿Cómo anulo una boleta?» se vuelve: tramo 1 en la pantalla donde se
buscan los comprobantes (enciende el buscador), tramo 2 en el detalle (enciende el «⋯» y explica «Anular», sin tocarlo).

### 2. Dos pasadas, para gastar poco

El catálogo de guías pesa ~680 KB de código: mandarlo entero en cada pregunta sería lento y caro. Entonces:
1. **Preselección local, sin costo:** con la pregunta normalizada (`normalizar` de `lib/guias/reglas.ts`), se buscan las ~5 guías más parecidas
   por título, resumen y texto de sus pasos, más el mapa del menú (`lib/menu.ts`) para saber qué módulo abre cada ruta.
2. **La IA solo ve esas 5 guías** (sus pasos en forma compacta: id, ancla, título, texto), las reglas de tienda que toquen y los módulos que ve
   la cuenta. Las instrucciones fijas van con caché de prompt.

Modelos: **`claude-haiku-5-5` para responder** (rápido, la persona está parada en la tienda) y **`claude-sonnet-5-5` para el informe del lunes**
(lee cientos de preguntas, una vez por semana). La llamada sale **solo del servidor** (`app/api/asistente/route.ts`, como `app/api/padron`), con
`ANTHROPIC_API_KEY` en Vercel; la clave nunca llega al navegador. La petición lleva `x-espera: no`: mientras la IA piensa, el cajón dice
«Buscando…» con su hilo, sin el loader de pantalla completa (ADR-0149).

### 3. Qué viaja a la IA y qué no

Viaja: la pregunta (ya limpiada), la ruta donde está la persona (sin `?…`, `sinConsulta`), las claves de los módulos que ve y si es líder.
**No viaja:** su nombre, la sede por nombre, montos, clientes. La pregunta pasa por `limpiarDatosPersonales` (`lib/errores-reglas.ts`, el
mismo de ADR-0424) antes de salir **y** antes de guardarse: un DNI, un celular o un RUC escrito en la pregunta queda como «[número]».

### 4. Qué responde, según el caso

| Caso | Lo que ve la persona |
|---|---|
| Hay recorrido y la cuenta ve sus módulos | Una línea («Te llevo a Comprobantes») y arranca la guía viva. |
| Hay recorrido pero la cuenta NO ve el módulo | «Eso lo hace quien tiene <módulo>; pídeselo a tu líder de equipo.» No la lleva ni le muestra la pantalla. |
| Regla del negocio escrita | La regla en dos líneas, con su fuente. |
| Regla que no está escrita | «Eso no lo tengo escrito; pregúntale a tu líder.» **Nunca inventa una regla.** |
| «¿Por qué no me deja…?» | Explica el bloqueo si el mensaje o el código de error está en el catálogo de errores; si no, lo dice y lo registra. |
| La función no existe | «Eso todavía no se puede hacer en CAYLA.» Queda marcada para el informe. |

Toda respuesta termina con «¿Te sirvió? Sí / No»; con No, una caja opcional «¿Qué buscabas?».

### 5. El informe del lunes

Un vigía de GitHub Actions (como `vigia-salud.yml`) llama cada lunes a las 7:00 de Lima a `app/api/asistente/informe` con un secreto. **Las
cifras salen de SQL** (cuántas veces, qué sedes, qué pantallas, cuántos «No»); la IA solo agrupa preguntas parecidas y redacta. Cada una de las
**5 mejoras** dice qué tipo es —**función nueva · mover a la vista · escribir una regla · dar un acceso · capacitar a alguien**—, cuántas
preguntas la sostienen, de qué sedes, y **cita los ids de esas preguntas**; el servidor descarta una mejora que cite un id que no existe (la
misma idea del catálogo cerrado: la IA no puede inventar evidencia). La pantalla las muestra con un enlace a las preguntas.

## Las tres tensiones, resueltas

### Tensión 1 — «Llena, la persona confirma» contra «la demo nunca guarda»

El piloto de hoy escribe **ejemplos** sacados de la pantalla; lo que pidió Felipe es escribir **datos de verdad** (el número de boleta que la
persona dijo). Eso es nuevo y no puede abrir una puerta a un monto o un stock mal escrito (principio 2).

**Decisión:** una acción nueva del piloto, `rellenar`, con tres candados:
1. **Solo lo que la persona escribió en su pregunta.** Si preguntó «¿cómo anulo la boleta B001-482?», puede escribir «B001-482» en el buscador.
   Si no lo dijo, no rellena nada: no adivina.
2. **Solo en campos que lo declaran** (`data-asistente="rellenable"`), lista blanca y no lista negra: un campo nuevo nace sin rellenar. De
   entrada: buscadores (`<Buscador>`), el texto de un motivo y los combos de una opción de texto. **Nunca:** `CampoMonto`, `PasoCantidad`, nada de
   un comprobante (SUNAT), el combo «Responsable» (elegirlo ES la firma, ADR-0162) ni una casilla de confirmación. Lo vigila una prueba como las
   de `lib/guias.test.ts`: `data-asistente` en uno de esos componentes hace fallar el CI.
3. **Guardar sigue prohibido igual que hoy:** `motivoParaNoTocar` no cambia. El campo rellenado queda marcado «Lo escribió CAYLA · revísalo»
   hasta que la persona lo toca.

### Tensión 2 — un botón en la cabecera contra «dárselo por rol»

Por ADR-0306 el botón de la cabecera **no es un módulo** (es una ayuda, como «Demo»), y `lib/modulos.test.ts` no admite otro módulo fuera del
lateral. Meterlo como módulo para el piloto rompería esa regla por un motivo pasajero.

**Decisión:**
- **El botón lo ve toda cuenta de una sede con el asistente encendido.** El piloto se prende y apaga **por sede**, con un interruptor en
  Configuración ~~que solo cambia un líder (`fn_es_lider()`)~~ **que cambia quien ve Configuración** (`fn_puede_configurar()`: el líder o
  el módulo «configuracion» en su rol; Felipe 2026-10-27, al construirlo: «los líderes solo supervisan visualmente», así que no se suma un
  candado de líder nuevo y quién lo cambia se decide en Roles y accesos), guardado en una tabla nueva y chica (`retail.asistente_sedes`), no
  en una columna de `ubicaciones` (es una tabla que la tienda usa: tocarla es la receta del deadlock de ADR-0195).
- **La pantalla del informe sí es un módulo** («Lo que pregunta tu equipo»), una entrada del lateral que **nace solo para el líder** (regla
  ADR-0161): migración con su `insert into retail.modulos`, `CLAVES_MODULO`, su nodo en `lib/menu.ts` y `exigirModulo`. Propongo el grupo
  Gestión; se confirma al construirla.
- En una terminal (cuenta compartida), la pregunta se firma con el responsable del combo (`fn_actor_persona_id(true)`), como todo lo que guarda.

### Tensión 3 — las reglas del negocio no están escritas para una IA

Para contestar «¿cuántos días hay para un cambio?», la IA tiene que leer esa regla en algún lado. Hoy está repartida entre
`docs/datos/15-COMO-OPERA-CAYLA.md`, los ADR y el código. Mandarle eso entero a la IA la haría inventar (mezcla lo decidido con lo
descartado y lo viejo).

**Decisión:** un archivo único y corto, `apps/web/lib/asistente/reglas-de-tienda.ts`: una lista de reglas, cada una con su id, la pregunta
típica, la respuesta en lenguaje de tienda (dos líneas como máximo) y su **fuente** (el ADR, o «Felipe, fecha»). **Lo escribe Claude a partir de
lo que ya está decidido, y cada regla entra solo con el OK de Felipe.** Lo que no está en el archivo, la IA no lo sabe y lo dice. Las preguntas
de reglas que no estaban se vuelven, en el informe, «escribir una regla»: el archivo crece con lo que la gente de verdad pregunta, no con lo que
imaginamos. Para el «por qué», lo mismo: un catálogo de los códigos de error que las funciones de la base ya lanzan (`venta_sin_precio`,
`sin_precio`…) con su explicación, que empieza por los 20 más vistos.

## Datos (propuesta: nada creado todavía)

- **`retail.asistente_preguntas`** (una fila por pregunta, sin `DELETE`): cuándo, la cuenta, la persona (`fn_actor_persona_id(true)`), la sede,
  la ruta, la pregunta limpiada, el tipo de respuesta, la **clasificación** (resuelta · existe pero escondida · no existe · error del sistema ·
  sin acceso · regla sin escribir · fuera de tema), el módulo que hacía falta, el recorrido (jsonb), el modelo, los tokens y el costo en
  dólares; y, una sola vez, `sirvio` y la frase. RLS encendido sin políticas: se escribe y se lee por funciones `security definer`.
- **`retail.asistente_informes`:** la semana, las 5 mejoras (jsonb, con los ids que citan), el modelo y su costo.
- **`retail.asistente_sedes`:** qué sedes tienen el asistente encendido y desde cuándo.
- **El tope:** el costo del mes de Lima es la suma de `costo_usd`. El servidor la mira antes de llamar a la IA; con US$30 alcanzados, el
  asistente pasa a modo básico hasta el día 1.

## Modo básico (cuando la IA no está)

Si se llegó al tope, la API no responde en 8 s, o falta la clave, **el asistente no se cae**: con la misma preselección local de la pasada 1,
muestra las 3 guías más parecidas («Esto puede ayudarte: Comprobantes, Devoluciones…») y arranca la que la persona elija. La pregunta se guarda
igual, marcada «sin IA», y cuenta en el informe. Es el principio 9: se pierde la puntería, no el servicio.

## Lo que NO hace

- **No lee datos de la tienda** («¿cuánto vendí hoy?», «¿hay talla M?»): Felipe lo dejó fuera. La IA no recibe ninguna herramienta que lea la
  base ni que escriba en ella; su única salida es el objeto validado.
- **No guarda, no cobra, no anula, no ajusta.** Rellena, como mucho, lo que la persona dijo, en un campo que lo permite.
- **No conversa largo:** una pregunta, una respuesta; si no sirvió, se puede repreguntar.
- **No reemplaza la oferta de guías por pantalla** (ADR-0389): convive con ella.

## Riesgos y cómo se cubren

- **Pasos inventados** → catálogo cerrado y validación en el servidor (arriba).
- **Alguien escribe «ignora tus instrucciones y…»** → la IA no tiene con qué hacer daño: sin herramientas, la salida se valida y, en el peor
  caso, muestra un texto raro que queda registrado.
- **Costo** → tope mensual, modelo chico para responder, preselección local y caché de prompt. El costo real por pregunta se mide en la
  actividad 2, con tokens de verdad, antes de prender una sede.
- **Que responda mal sin que nadie lo note** → una **evaluación fija**: 40 preguntas reales de tienda con su recorrido esperado
  (`apps/web/lib/asistente/evaluacion/`), que se corre a mano antes de cambiar el prompt o el modelo. En el CI corre solo la parte sin red (el
  esquema, la preselección, los candados), porque llamar a la API en cada PR costaría.
- **Que la gente no pregunte por miedo** → se guarda quién pregunta (decisión 8) para poder capacitar, pero la pantalla del informe muestra
  persona solo al líder, y nunca se usa para calificar a nadie. Si eso cambia, lo decide Felipe.

## Lo que decidí al construir (Felipe puede cambiarlo)

- **Atajo: «?» fuera de un campo y ⌘/ (Ctrl+/) desde cualquier lado** (actividad 1). ⌘K ya era del buscador de la cabecera.
- **La búsqueda sin IA recorta las terminaciones de las palabras** («anulo», «anular», «anulada» son la misma) en vez de comparar las
  primeras letras: con cuatro letras, «talla» empataba con «taller» y «compras» con «comprobante» (`lib/asistente/preseleccion.ts`).
- **La IA piensa al esfuerzo más bajo** (`effort: "low"`), sin reintentos y con 8 s de tope. Medido en local el 2026-10-26 con 10
  preguntas: ~2 s (la primera, 4–5 s) y **~US$0,0013 por pregunta** (~11 000 tokens de entrada, ~100 de salida). Con el tope de US$30
  alcanzan unas 23 000 preguntas al mes.
- **Un tramo muestra UN paso, el que responde**, con lo que necesita abierto: su propio `preparar` o, si no tiene, el del último paso
  de antes que lo tenía (el que abrió la hoja donde vive). Al terminarlo, el recorrido sigue en la pantalla del siguiente tramo o
  termina; si la persona sale, lo que faltaba se olvida. La demo entera de la pantalla sigue en «Demo» y en «Otras demos» del cajón.
- **Un tramo espera hasta 8 s a que su pieza esté a la vista** antes de arrancar: una guía entera empieza con la bienvenida y le da
  tiempo a la pantalla; un tramo salta directo y, en una pantalla recién abierta, el botón todavía no estaba.
- **«Sin acceso» lo escribe el sistema, no la IA** (actividad 4): la IA solo ve el título, el resumen y los títulos de los pasos de hasta
  3 pantallas de módulos que el rol no tiene, y si una responde, la frase sale de `textoSinAcceso` («Eso se hace en Por pagar (Compras ▸
  Historial de compras), y tu rol todavía no lo tiene. Pídeselo a tu líder de equipo…»). Así nunca explica cómo se hace algo de una
  pantalla ajena. Una pantalla sin módulo (depende de la sede o de un permiso) no entra en esa lista.
- **Rellenar empieza solo con el `<Buscador>`** (actividad 6), no con el motivo ni los combos que nombraba la tensión 1: buscar no guarda
  nada, y es lo que la gente pregunta con un dato («la boleta B001-482», «la Blusa Emma»). Sumar otro campo lo decide Felipe y lo
  vigila `lib/asistente-rellenable.test.ts` (lista blanca, con `campos.tsx`, el monto, la cantidad, la casilla y el responsable vetados).
  El dato solo se escribe en un paso donde la guía ya escribía un ejemplo, si aparece TAL CUAL en la pregunta (`rellenoValido`): un
  DNI llega como «[número]» y nunca se rellena. Viaja entre pantallas en el almacenamiento de la pestaña, nunca en la dirección (puede
  ser el nombre de un cliente). Al terminar ese tramo no se vacía lo escrito ni se cierra lo abierto: sigue la persona.
- **Reglas de tienda y errores** (actividad 7): la IA elige una regla o un error por su id y el texto lo pone el sistema (la respuesta
  aprobada, o la misma frase de `lib/error-escritura.ts` que ve la pantalla). Una regla que no está escrita se contesta «Eso no lo tengo
  escrito todavía. Pregúntale a tu líder de tienda» y queda anotada. **Felipe aprobó el 2026-10-27** 10 de las 13 del borrador; sacó el
  tope de descuento y el cierre de caja («los líderes solo supervisan visualmente»), y pidió que una devolución no necesite aprobación.
  Esa queda en borrador: hoy `aprobar_devolucion` exige líder y la regla contradiría la pantalla hasta que el sistema cambie.
- **Un tramo no cuenta como demo vista entera**: la guía queda como ofrecida y su oferta de la primera vez no vuelve a salir.
- **El interruptor por sede** (actividad 8, migración `20261027163000_asistente_sedes.sql`): una sede sin fila está **apagada**, así que el
  asistente nace apagado en todas y alguien enciende la del piloto en Configuración ▸ Tiendas y caja (una tarjeta más, entre el WhatsApp
  y la carga inicial, con el mismo responsable y el mismo «se guarda solo»; al lado, lo gastado en el mes contra el tope). Entran las
  tres clases de sede, no solo tiendas: el almacén y el taller también preguntan. **En CAYLA Global el botón sale si alguna sede lo tiene**
  (quien supervisa el piloto lo prueba desde ahí). Si la base no responde o todavía no tiene la función, el botón sale **apagado**: el
  piloto es de una sede y nadie gasta sin querer. `/api/asistente` también lo pregunta y contesta 403 a una sede apagada, aunque alguien la
  llame sin el botón. Apagar no borra la fila (queda desde cuándo corrió) y cada cambio va a `configuracion_historial`.
- **La pantalla del informe** (actividad 9, migración `20261027182000_asistente_preguntas_equipo.sql`): Gestión ▸ **«Preguntas del
  equipo»** (`/gestion/preguntas`, módulo `preguntas_equipo`). El nombre del ADR, «Lo que pregunta tu equipo», no cabía en el lateral; queda
  como la frase de la cabecera. **Muestra quién preguntó** (Felipe 2026-10-27, elegido entre «solo la sede» y «con el nombre»), y por eso:
  el cajón del asistente avisa antes de escribir («Tu líder ve lo que preguntas, para mejorar CAYLA»), y el módulo es **«solo personas»**
  como Rendimiento y Actividad (una terminal compartida no revisa lo que preguntan las demás; se suma a `fn_exigir_rol_de_terminal` con un
  reemplazo anclado). Nace sin rol (ADR-0161). Cada cuenta ve la sede que mira; el líder o el Admin, cualquiera con el selector, y todas
  juntas en CAYLA Global; quien tiene el módulo sin ser líder, solo la suya. Las cifras las cuenta SQL sobre todo el mes y la lista trae las
  300 más recientes. Arriba, cinco cifras (las que filtran se rellenan al tocarlas); después, «Dónde las llevó» y «Accesos que piden»; abajo,
  la lista a todo el ancho con sus píldoras (a 1440 px, una columna al costado partía las preguntas a media palabra). «Sin respuesta» se lee
  como «Regla sin escribir», «Error sin explicar» o «No existe en CAYLA» según lo que preguntaba. Las 5 mejoras del lunes (actividad 10) se
  suman a esta misma pantalla.
- **El informe del lunes** (actividad 10, migración `20261027183000_asistente_informes.sql`, ruta `/api/asistente/informe`): **lo arma un
  trabajo programado de Vercel** (`vercel.json`, los lunes a las 7:00 de Lima) y no un vigía de GitHub Actions como decía «Cómo funciona»:
  el cron de Vercel entra con `CRON_SECRET` y la llave de servicio, que ya están en producción, y no pide un secreto nuevo. Informa la
  semana anterior completa (lunes a lunes de Lima). **La IA no ve ids ni sedes**: ve «p1», «p2»… y lo que se respondió; el servidor descarta
  las citas que no están en la lista y **la base vuelve a rechazar el informe entero** si una cita no es una pregunta de esa semana. Cuántas
  preguntas sostienen una mejora y de qué sedes se calcula al leer, de las citas. **Una semana, un informe**: correrlo otra vez devuelve el
  mismo sin llamar a la IA. Si el lunes no salió, el líder lo arma con un botón en la pantalla (la misma lógica, con su sesión). Una semana
  sin preguntas se anota sin IA. Lo que cuesta entra al tope de US$30 (`fn_asistente_gasto_del_mes` lo suma). Lo ve solo quien ve todas las
  sedes (el líder o el Admin), porque junta las preguntas de toda CAYLA. Medido en local el 2026-10-27 con 8 preguntas: 4 mejoras, ~1 800
  tokens de entrada y ~570 de salida, **US$0,009**.
- **La evaluación fija** (actividad 11, `apps/web/lib/asistente/evaluacion/`): 40 preguntas con lo que se acepta; el CI corre la parte sin red
  (cada id existe y la búsqueda local deja la guía esperada entre las 5 que ve la IA) y `pnpm --filter web asistente:evaluar` corre la IA contra
  el ERP local. La primera pasada encontró que **la búsqueda solo ofrecía las entradas exactas del menú**: desde ahí también ofrece las pantallas
  que cuelgan de una entrada sin pedir un id y son del mismo módulo (las 5 que piden otro, en `PIDEN_OTRO_MODULO`, con una prueba que lee cada
  página), y las de la cabecera con su módulo (`pantallasDelAsistente`). Con eso, 4 equivalencias de tienda y 3 ajustes a las instrucciones,
  pasó de 35 a **38 de 40**.

## Acompañar una tarea (Felipe 2026-10-27, segunda vuelta)

**El problema.** Felipe probó el asistente y pidió más que una demo larga: «Quiero vender un short mom color rojo talla S» tiene que llevarte
paso a paso hasta los métodos de pago y la boleta; las guías tenían «mucho texto pequeño que nadie lee»; y la pregunta llega con faltas
(«kiero bender»). Una respuesta que te deja en el botón de Cobrar sin decir qué sigue no ayuda en una venta de verdad.

**Lo que eligió Felipe** (dos preguntas, 2026-10-27): **la persona hace los clics y CAYLA la guía** (no un piloto que vende solo), con **una
barra fija abajo, como un GPS**.

**Cómo quedó.**
- **La IA arma la tarea** (`pasos` en la salida estructurada): hasta 10 pasos en orden, cada uno un paso de una guía con su `data-guia`, con una
  orden de 2 a 8 palabras con los datos de la persona («Toca Negro · talla M en la lista»). El servidor no le cree (`lib/asistente/tarea.ts`,
  `revisarTarea`): solo pasos de las guías que vio, con ancla, sin repetir, y menos de 2 pasos no es tarea (queda el recorrido de siempre).
- **Lo fijo no se le pide a la IA, se completa en el servidor** (`completarTarea`, `CIERRES`): una venta siempre termina en «Revisa y
  confirma tú el cobro», pasando por quién atiende, Cobrar, cómo paga y Boleta o Factura, cada uno insertado en su lugar aunque la IA lo
  saltara. Y en Vender, si la tarea busca, se elige **en la lista del buscador** (cada fila es un color y una talla): los pasos de la tarjeta
  o de su hoja de tallas no aparecen por ese camino y la guía se quedaba esperando. El color y la talla salen de la pregunta tal como los
  escribió la persona (`ordenDeLaLista`), porque la IA a veces dejaba uno afuera. Para el celular se agregan la lupa (el buscador vive tras ella)
  y «Ver ticket» (el ticket vive en la barra de abajo).
- **El Acompañante** (`components/asistente/Acompanante.tsx`, montado una vez en `AppShell` con el asistente encendido): un anillo que respira
  alrededor de la pieza **sin taparla** (se toca a través), y la barra de abajo (la Isla, `BarraDeAbajo`, dentro de `DismissableLayer.Branch`
  para que tocarla no cierre la hoja de cobro) con la orden en letra de 19 px, «¿Por qué?» (el texto de la guía, que ya existe y está vigilado),
  «Saltar» y la ×. Pasa solo: cuando la persona toca un control de la pieza; cuando aparece o se enciende una pieza de más adelante (la hoja de
  cobro al abrirse, Cobrar al entrar la prenda); cuando un campo tiene lo escrito 1,6 s; o cuando la pieza de este paso no existe en esta
  pantalla y una de más adelante ya se puede usar (la lupa en escritorio, «quién atiende» en una cuenta personal). La barra sube arriba si la
  pieza está en el borde de abajo. La tarea viaja en la pestaña (`sessionStorage`, 20 min), así sigue al cambiar de pantalla, con «Llévame».
- **Nunca hace un clic ni guarda.** Lo único que escribe es el nombre de la prenda en el buscador `rellenable` (la lista blanca de la
  actividad 6). El último paso, confirmar el cobro, lo confirma la persona.
- **Faltas de ortografía** (`preseleccion.ts`): la búsqueda local compara también por cómo suena (b/v, c/s/z, k/qu, h muda, ll/y) y por
  distancia de edición, con la mitad del peso de una coincidencia exacta; la IA recibe la pregunta tal cual y se le dice que la entienda.
- **Sin pensamiento.** Con el pensamiento de fábrica de Haiku 5.5, una tarea de 6 pasos escribía ~1 500 tokens y tardaba 7,5 s, al borde del
  tope de 8 s (fallaba una de cada dos). Con `thinking: {type: "disabled"}` (válido en Haiku 5.5 con esfuerzo `low`) salen ~450 tokens en ~5 s.

**Verificado** en el ERP local con la cuenta de la terminal de Tienda Lima, a 1440 y a 375 px: «kiero bender una blusa emma color negro
talla m, me paga con yape y quiere boleta» llega, tocando una sola cosa por paso, hasta «Revisa y confirma tú el cobro» con Yape y Boleta
marcados (9 pasos en el celular, 7 en escritorio). Para encender Cobrar en local hubo que crear un momento la asistencia de Dynamic
(`public.marcajes`, que la base local no tiene), y se quitó al terminar.

**La evaluación** (50 preguntas, 10 de ellas con faltas) con la IA sin pensamiento: **49 de 50**. La que fallaba, «¿Como mando ropa a la
tienda de trujiyo?», iba siempre a Mis compras (su guía dice «lo que mandas a la tienda»): una línea en las instrucciones dice que mover ropa
entre sedes es un traslado, y desde ahí va a Nuevo traslado, con su tarea de 5 pasos hasta «Enviar la caja».

**Cualquier tarea, no solo vender (Felipe 2026-10-27, tras ver el PR #1404: «lo de venta era un ejemplo, eso debe ser así para todo»).**
- **Pantallas que se abren desde otra.** Editar producto (`/productos/[id]/editar`) no tiene entrada en el menú: se abre tocando una
  prenda y «Editar». La IA ahora recibe esas pantallas (`pantallasQueSeAbrenDesde`, en `<se_abren_desde>`, solo para los pasos de una
  tarea, nunca para un tramo), las que cuelgan con un id de una candidata, menos las que piden otro módulo (`PIDEN_OTRO_MODULO`, que su
  prueba ahora calcula también para las de id). El Acompañante no ofrece «Llévame» a una pantalla así: se llega con el paso anterior.
- **Los puentes** (`lib/asistente/puentes.ts`): cómo se abre cada pantalla con id desde su madre (Productos: busca, toca la prenda, toca
  Editar). La IA suele saltarlos o ponerlos desordenados; el servidor los deja en su orden, antes del primer paso de la pantalla con id.
  La búsqueda de la IA se conserva si trae el nombre; si no, se usa el que dio en otra parte de su respuesta (tal cual de la pregunta).
  `puentes.test.ts` falla si una guía o un paso del mapa deja de existir.
- **Toda tarea termina guardando.** `pasoGuarda` reconoce el paso que guarda por el nombre de su pieza (`….guardar`, `….confirmar`,
  `….enviar`, `….registrar`, el pie de una hoja…); la IA lo ve marcado `[guarda]`. Si cortó antes, se agrega el que guarda después de su
  último paso; si guardó una hoja («Agregar» de Agregar color, que solo suma a la tabla) y la pantalla guarda aparte, se agrega también el
  de la pantalla. Editar producto explicaba su guardado sobre un texto: tiene un ancla nueva en el botón de verdad
  (`editar.barra-guardar`, paso opcional de su guía, `PASO_QUE_GUARDA`).
- **Verificado** a 1440 y 375 px con la cuenta de Felipe: «quiero agregar un color a la blusa catalina siete» va de Inicio a Productos,
  busca, abre la prenda, entra a Editar, abre Agregar color, elige, suma (la fila «Crudo · NUEVA») y termina en «Revisa y guarda tú los
  cambios» con «Revisar y guardar» encendido, sin guardar nada. La venta de siempre, otra vez, llega a confirmar el cobro.

- **Otras tareas, por la API** (cuenta de Felipe): cambiar el precio de una prenda (6 pasos, de buscarla a «Revisar y guardar»),
  registrar un gasto (7, hasta su botón de registrar), crear un cliente (5, hasta «Registrar») y un cambio de talla (5, hasta confirmar).
- **La evaluación** con estas instrucciones: 49 de 50. La que fallaba («¿Dónde veo cómo cambió el precio de una prenda?») elegía como
  destino el Historial de una prenda, que se abre desde otra: ahora ese tramo va a Productos, su pantalla madre (3 de 3).

**Lo que aprendí del Acompañante al probarlo con una tarea larga.**
- La foto de «qué había a la vista» se toma cuando aparece la pieza del paso, no cuando el paso empieza: tras tocar «Editar», la pantalla
  nueva todavía carga y lo que aparece al cargar no es que la persona avanzó (saltaba hasta «guardar»).
- En una pieza con varios botones manda el principal (el de enviar o el último): el pie de una hoja trae «Cancelar» siempre encendido.
- «Cancelar», «Descartar», «Cerrar» o «Volver» no avanzan el paso.
- El dato del buscador se reintenta hasta 3 veces si el campo queda vacío (una pantalla que termina de armarse lo borraba).

**El diseño del resaltado (Felipe 2026-10-27: «se ve muy pobre y feo si solo es una línea roja»).** El Acompañante habla el idioma de las
guías interactivas (ADR-0389): un velo suave con un recorte alrededor de la pieza, filo rojo, el halo que respira y la onda que sale una
vez al llegar, más una **etiqueta pegada a la pieza** con el número del paso en rojo y la orden, con su pico hacia ella
(`app/estilos/acompanante.css`). El velo no bloquea nada (todo se toca a través), se aparta si hay una lista abierta encima y sigue a la
pieza cuadro a cuadro sin pasarse. La barra de abajo sigue siendo el GPS. Sin rebote; se apaga con `prefers-reduced-motion`.

**Lo que no está.** Los cierres fijos existen solo para Vender; las demás tareas (un cambio, un traslado) siguen lo que propone la IA, revisado.

## Producción

Las cuatro migraciones del asistente se aplicaron el 2026-10-27 (ver el backlog). La `ANTHROPIC_API_KEY` está en Vercel y la sede del piloto
la elige Felipe en Configuración ▸ Tiendas y caja. La segunda vuelta (Acompañar) no tiene migración.
