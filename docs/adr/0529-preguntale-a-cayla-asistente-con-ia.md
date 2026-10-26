# ADR-0529 — «Pregúntale a CAYLA»: la IA que te lleva al botón, y las preguntas que dicen qué construir

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
  Configuración que solo cambia un líder (`fn_es_lider()`), guardado en una tabla nueva y chica (`retail.asistente_sedes`), no en una columna de
  `ubicaciones` (es una tabla que la tienda usa: tocarla es la receta del deadlock de ADR-0195).
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

## Producción

Nada todavía. Cuando toque: las migraciones esperan el OK de Felipe (cambio de esquema en producción), la `ANTHROPIC_API_KEY` la pone Felipe en
Vercel, y la sede del piloto la elige Felipe.
