# ADR-0586 — Agregar un paso que se olvidó (ya hecho) y reabrir pasos de una orden

**Estado:** aceptada; **actividad 1 construida y probada en local** (base con `pnpm pruebas:produccion-paso-tarde` 22/22 y la web con sus pruebas); **migración `20261031002000` YA en producción** (comprobado el 2026-10-31 en solo lectura: `agregar_paso_tarde` tiene la misma huella que en local y los dos CHECK de `produccion_cambios` ya aceptan `paso_tarde`)
(va antes de publicar la web). **Actividad 2 construida y probada en local** (migración `20261031160000` SIN pegar en producción; ver «Actualización 2026-10-31»). Actividades 3 a 5: decididas, sin construir · **Fecha:** 2026-10-30 · **Decidió:** Felipe (preguntas del 2026-10-30) · **Sigue a:** ADR-0566 (agregar un paso) y
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

- **Actividad 2 — Desmarcar Ploteo, solo el líder y con motivo.** Construida el 2026-10-31: ver «Actualización 2026-10-31 — actividad 2».
- **Actividad 3 — «Corregir lo anotado» a un toque desde el paso.** Abre la corrección que ya existe (ADR-0570, con motivo). Queda para quien opera el Taller, no solo el líder: la objeción
  de 2026-10-30 (que la colaboradora que se equivocó no tenga que esperar al líder para arreglar su propio dato) va con esta actividad, para que Felipe la confirme al verla.
- **Actividad 4 — Prendas que vuelven a arreglo.** El líder elige el paso, las tallas y cuántas; bajan en ese paso y en todos los de después (filas contrarias, nada se borra), que las vuelven a
  esperar. Si un paso de después era un servicio ya cobrado, al anotar su vuelta la hoja pregunta «¿cobra este arreglo?».
- **Actividad 5 — Anotar más de lo planeado.** Solo en el primer paso que cuenta prendas (donde nacen): el líder pasa el tope de plan + 10 %, sin otro tope y con motivo; la tela y el costo por
  prenda se recalculan con las prendas reales.

## Actualización 2026-10-31 — actividad 2: quitar la marca de Ploteo, solo un líder y con motivo (`20261031160000`)

Hasta hoy había dos caminos para quitar la marca de Ploteo, y los dos los usaba cualquiera que opera el Taller: «Deshacer» en el paso (`deshacer_marca_fase`, sin motivo y sin entrada en la
historia de cambios) y el lápiz de la historia (`eliminar_anotacion_orden`, con motivo y «Restaurar»). Quitar la marca cambia la orden de verdad: Ploteo vuelve a «por hacer» y, si lo hacía un
servicio, su fijo sale del costo de la orden.

**Decisiones de Felipe (preguntas del 2026-10-31):**
1. Quitar la marca: solo un líder, con motivo, por un solo camino (el de la historia).
2. **Restaurar** una marca quitada: también solo el líder (deshace su decisión). **Volver a marcar** sigue abierto a quien opera: el día que el plano sí se hace, lo marca quien lo hizo. Eso
   significa que una integrante puede dejar Ploteo «hecho» otra vez después de que un líder lo quitó; entra como una marca nueva, con su nombre y su hora, y lo que el líder decidió queda
   en la historia con su motivo. Si Felipe quiere que eso también sea del líder, es otra decisión.
3. Se puede quitar **aunque Corte ya haya empezado**: el Taller ya puede cortar sin Ploteo marcado (ADR-0400, tensión abierta), así que no queda nada imposible, y un ploteo marcado por error
   no tiene que quedarse para siempre con su costo.
4. Quien no es líder ve en el paso de Ploteo marcado «Si se marcó por error, un líder puede quitar la marca.» y, en la historia, «Restaurarla es de un líder.» bajo una marca quitada.
5. **Tablet del Taller:** Felipe eligió que, desde una tablet del Taller, valga elegir a un líder de turno en «Responsable». **Esa tablet no existe ni puede existir hoy:** una terminal solo se
   crea en una tienda (`20260923040000`, `23514`) y en producción las 6 terminales están en tiendas y ninguna ve Producción (consultado el 2026-10-31). No se escribió ese camino (sería
   código que no corre y una prueba que tendría que saltarse el candado de las terminales). **Regla para el día que se habilite una tablet en el Taller:** el candado de quitar y restaurar
   la marca acepta, además de una cuenta de líder, una terminal SIN firma de respaldo cuyo responsable elegido en el combo sea un líder activo de turno en esa sede (la firma de respaldo de
   ADR-0454 no cuenta: firma siempre a nombre de la misma persona sin elegir a nadie). Mientras no se sume, falla cerrado: el líder entra con su cuenta.

**Lo que se construyó:**
- **Base (`20261031160000`):** en la rama de la marca de `eliminar_anotacion_orden` y de `restaurar_anotacion_orden`, `fn_es_lider()` o `42501 marca_solo_lider` (reemplazos anclados sobre la
  función viva; quitar o restaurar un «Terminé» no cambia). `deshacer_marca_fase` se borra: esconder su botón no alcanzaba, estaba abierta a `authenticated`.
- **Web:** el paso de Ploteo marcado ofrece «Quitar la marca» solo al líder (abre la misma hoja con motivo que el lápiz de la historia, `CambioConMotivoModal`); la marca viva sale de
  `marcaVivaDeFase`. En la historia, el lápiz y el «Restaurar» de una marca son solo del líder. `MarcarFaseModal` queda solo para marcar.
- **Pruebas:** `produccion_ploteo.mjs` pasa al camino con motivo y suma L1–L4 (la integrante marca pero no quita ni restaura; sí corrige su «Terminé»; el líder quita con Corte avanzado y el fijo
  sale de la orden); `produccion_correcciones.mjs` carga también `20261031160000` y su S4 vigila que el candado siga una sola vez.

- **DECIDÍ:** el candado en la rama de la marca de las dos funciones que ya dejan historia, y borrar el camino viejo.
- **DESCARTÉ:** (a) quitarle el permiso a `deshacer_marca_fase` y dejarla: un segundo camino esperando que alguien le devuelva el `grant`; (b) el candado al inicio de
  `eliminar_anotacion_orden`: frenaría también corregir un «Terminé», que la actividad 3 deja para quien opera; (c) escribir ya el camino «tablet + líder en el combo»: no puede correr hoy;
  (d) frenar si Corte ya empezó: un ploteo marcado por error quedaría para siempre, con su costo.
- **SE ROMPE SI:** alguien vuelve a pegar `20261029173000` entera en producción: le quita el candado a las dos funciones (lo vigila S4 de `produccion_correcciones`, que carga las dos), o se
  habilita una tablet en el Taller sin sumar la regla de arriba.
- **Producción:** `20261031160000` SIN pegar. Una parte, re-ejecutable; va ANTES de publicar la web (la web nueva ya no llama a `deshacer_marca_fase`; la vieja sí, y entre el pegado y la
  publicación su «Deshacer» responde con un error unos minutos). Las dos anclas se comprobaron contra la función viva de producción el 2026-10-31 (una sola vez cada una).
