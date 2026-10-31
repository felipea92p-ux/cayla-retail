# ADR-0586 — Agregar un paso que se olvidó (ya hecho) y reabrir pasos de una orden

**Estado:** aceptada; **actividad 1 construida y probada en local** (base con `pnpm pruebas:produccion-paso-tarde` 22/22 y la web con sus pruebas); **migración `20261031002000` SIN pegar en producción**
(va antes de publicar la web). Actividades 2 a 5: decididas, sin construir · **Fecha:** 2026-10-30 · **Decidió:** Felipe (preguntas del 2026-10-30) · **Sigue a:** ADR-0566 (agregar un paso) y
ADR-0570 (correcciones con historia)

## Contexto

Felipe, el 2026-10-30, con la captura de la orden del Short Sastre Recover: «he omitido ojal y botón… permíteme reabrir los pasos con comentario o algo». La orden terminó todos sus pasos
(Ploteo, Corte, Habilitado, Costura, Planchado) y nadie anotó «Ojales y botones». El trabajo **sí se hizo** —lo hizo un servicio de afuera y cobra—; solo faltó anotarlo.

«+ Agregar un paso» (ADR-0566) existe, pero su regla 3 rechaza el paso si uno POSTERIOR ya tiene algo anotado (`paso_despues_empezado`), y lo dejó escrito como decisión de Felipe. La
regla tenía razón en su forma: el estado de cada fase se DERIVA de lo anotado (no hay columna) y lo que entra a una fase son las buenas de la anterior. Un paso que entrara vacío entre
Costura y Planchado dejaría a Planchado con 16 hechas de 0 que le entraron: se traba (`avance_excede`, `salida_excede`) y Costura pierde su candado, porque
`fn_produccion_exigir_cadena` pasaría a mirar al paso nuevo (0 usadas).

## Lo que Felipe decidió (2026-10-30, por preguntas)

1. En esta orden los ojales y botones **ya se hicieron**; solo faltó anotarlo.
2. El paso olvidado entra **en su lugar** de la ruta (entre Costura y Planchado), con el sello «Agregado tarde» y **su motivo**; los pasos de después siguen como están.
3. Además, **reabrir cualquier paso hecho, con motivo**.
4. Lo hace **solo el líder** (corrige la historia de la orden y puede cambiar su costo).
5. Lo de esta orden lo hizo **un servicio de afuera**.
6. El paso tarde entra con **todas las prendas, de un toque** (no talla por talla).
7. «Reabrir» resuelve cuatro casos: **prendas que vuelven a arreglo**, **corregir un número mal anotado**, **anotar más de lo planeado** y **desmarcar Ploteo con motivo**.
8. Si unas prendas vuelven a un paso, los pasos de después **las vuelven a esperar** (bajan y las vuelven a hacer): los números siempre cuadran.
9. Orden de trabajo: **primero la actividad 1** (destraba la orden); después 2, 3, 4 y 5, cada una mostrada antes de seguir.
10. Si unas prendas que vuelven a arreglo ya habían pasado por un servicio cobrado, **se decide cada vez** si el arreglo se cobra («¿cobra este arreglo?» al anotar su vuelta).
11. «Anotar más de lo planeado»: **sin tope para el líder, con motivo**; la tela y el costo por prenda se recalculan con las prendas reales.
12. El día del paso tarde **se pregunta, con hoy por defecto**.

## Decisión — actividad 1: `agregar_paso_tarde`

**Una función nueva, solo del líder** (`retail.agregar_paso_tarde(orden, clave, motivo, día, quién, proveedor, tarifa, fijo, mínimo, pendiente, posición)`, migración `20261031002000`). Suma
UN paso a una orden en proceso **solo cuando un paso posterior ya tiene algo anotado** —aunque esté deshecho, o sean solo prendas con falla— (si no, responde `paso_no_es_tarde`: ese paso
se agrega con «Agregar un paso» y se anota cuando se haga), y **en la misma transacción lo da por hecho con las prendas que ya pasaron por él**, talla por talla: **las que el paso
siguiente ya usó** (sus buenas y sus fallas que no se arreglan, o lo que salió a su servicio; la misma cuenta con la que `fn_produccion_exigir_cadena` protege al paso de antes). Lo que todavía
no llegó al paso siguiente no se da por hecho: se anota cuando se haga. En la orden del Short (todo hecho) son las 16; si Planchado llevara 2 de 50, serían 2. Si el paso siguiente no usó nada
(lo anotado se deshizo), el paso entra vacío. Así:

- **en el Taller**, con la regla de «Terminé» (`fn_produccion_escribir_termine`): las mismas filas que una persona anotaría, con su día real (`hecho_en`);
- **afuera**, como una salida y una vuelta de todas esas prendas, buenas: el costo del servicio se devenga como siempre (buenas × tarifa + fijo), sin una regla aparte;
- **afuera «pendiente de registrar»**: igual, y su costo sigue el de cualquier pendiente (ADR-0551).

Así la cadena queda cuadrada desde el primer instante: lo que entra a Planchado vuelve a ser lo mismo que antes, Planchado se sigue trabajando, Costura conserva su candado y la orden cierra.

Las mismas guardas de siempre: ve Producción y está en ese Taller, bloquea la fila de la orden como `cerrar_produccion` (para que un servicio no quede fuera del costo de una orden que se
cierra en el mismo instante), **`fn_es_lider()`** (`paso_tarde_solo_lider`, 42501), **motivo obligatorio** (`fn_produccion_motivo_cambio`), firma un
responsable, el candado por orden, la ruta pasa por `fn_produccion_fases_normalizar` (los mismos rechazos que al abrir), el proceso tiene que estar activo en el catálogo, un hito no se agrega
tarde (`paso_tarde_hito`) y el día no puede ser futuro ni de antes de abrir la orden (`fn_produccion_fecha_real`).

**La marca vive en la historia, no en una columna:** una fila en `produccion_cambios` con la acción nueva `paso_tarde` (los dos CHECK de la tabla se amplían: `fase_id` obligatorio, `pone_ids`
con las filas que escribió, nada quitado), con el motivo, quién lo hizo y con cuántas prendas. La web ya recibe toda la historia de la orden (`fn_produccion_cambios_de_orden`): de ahí salen
el chip «Agregado tarde» del paso y la entrada «Agregó Ojales y botones tarde · 16 prendas ya hechas · Afuera con … · Por qué: …». También queda en Actividad (`produccion_paso_tarde`).

**En la pantalla** (`AgregarPasoModal`): al líder, `pasosAgregables(…, { esLider })` le ofrece el paso marcado «se agrega tarde». La pantalla decide «tarde» con la misma regla que la base
(`pasoPosteriorEmpezado` mira también lo anotado y deshecho, por la línea de tiempo) y cuenta las prendas igual (`prendasQueYaPasaron`). La hoja dice con cuántas prendas entra, pide el día («¿Cuándo volvió?» si es afuera) y el motivo (dos atajos y texto libre), no ofrece «Prometido para» ni
«Deshacer» (el paso ya tiene su trabajo anotado y `quitar_paso_orden` no lo acepta), y la guía de foco suma esos dos campos. Quien no es líder lo ve apagado, con «un líder puede agregarlo ya
hecho». La página pide la lista de servicios también cuando hay un paso que agregar.

DECIDÍ: una función aparte, solo del líder, que agrega Y anota en la misma transacción; la marca en `produccion_cambios`.
DESCARTÉ: (a) levantar `paso_despues_empezado` en `agregar_paso_orden` con un motivo: el paso entraría con 0 y la cadena se rompe (Planchado con más de lo que le entró, Costura sin candado);
(b) sumarle `p_motivo` a `agregar_paso_orden`: cambia su firma, deja dos funciones con el mismo nombre y rompe las suites que la llaman por posición (`produccion_ploteo`,
`produccion_catalogo_de_procesos`); (c) una columna `agregada_tarde` en `produccion_fases`: un `alter` sobre una tabla en uso y otra fuente de verdad de lo que la historia ya dice; (d) pedir las
cantidades talla por talla: más lento, y la base igual las acota; (e) dar por hechas TODAS las buenas del paso anterior (la primera versión, corregida por la revisión del 2026-10-30): con
Costura en 50 y Planchado en 2 anotaba 48 prendas que no pasaron por el paso y, afuera, un costo que no se puede anular porque Planchado ya usó parte de esa vuelta; (f) anular la orden y
abrirla de nuevo: pierde la historia y la tela descontada.
SE ROMPE SI: alguien anota en Planchado en el mismo instante en que el líder agrega el paso tarde: el candado por orden los turna. O alguien pasa la orden al stock en ese instante: las dos
bloquean la fila de la orden y se turnan. O el paso siguiente tiene prendas «en arreglo»: no se cuentan como usadas (no ocupan lugar, como en `fn_produccion_exigir_cadena`); cuando vuelvan
buenas, se anotan en el paso tarde como en cualquier otro. O alguien quiere agregar tarde un
paso que hoy no está en el catálogo («Otro proceso…»): sigue frenado; se da de alta primero en Servicios y tarifas.

Lo que NO hace: no reabre ni corrige pasos (actividades 2 a 5). La fila de la vuelta guarda cuándo se anotó (su `created_at`) y el día real va en las filas de avance (`hecho_en`), igual que
en «Terminé»; la historia lo dice en la entrada del paso tarde («volvió el mié 28 oct»). Queda fuera, como hallazgo aparte: `agregar_paso_orden` (ADR-0566) tampoco mira las prendas con falla al
decidir si un paso de después empezó; la pantalla ya manda ese caso al camino tarde, pero una llamada directa a esa función podría dejar un paso vacío antes de uno con fallas.

## Lo que sigue (decidido, sin construir)

- **Actividad 2 — Desmarcar Ploteo, solo el líder y con motivo.** Hoy `deshacer_marca_fase` lo hace cualquiera, sin motivo; pasa al camino de «Quitar la marca» (`eliminar_anotacion_orden`,
  con historia) y exige `fn_es_lider()`.
- **Actividad 3 — «Corregir lo anotado» a un toque desde el paso.** Abre la corrección que ya existe (ADR-0570, con motivo). Queda para quien opera el Taller, no solo el líder: la objeción
  de 2026-10-30 (que la colaboradora que se equivocó no tenga que esperar al líder para arreglar su propio dato) va con esta actividad, para que Felipe la confirme al verla.
- **Actividad 4 — Prendas que vuelven a arreglo.** El líder elige el paso, las tallas y cuántas; bajan en ese paso y en todos los de después (filas contrarias, nada se borra), que las vuelven a
  esperar. Si un paso de después era un servicio ya cobrado, al anotar su vuelta la hoja pregunta «¿cobra este arreglo?».
- **Actividad 5 — Anotar más de lo planeado.** Solo en el primer paso que cuenta prendas (donde nacen): el líder pasa el tope de plan + 10 %, sin otro tope y con motivo; la tela y el costo por
  prenda se recalculan con las prendas reales.
