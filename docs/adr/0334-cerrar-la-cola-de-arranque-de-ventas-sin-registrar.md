# ADR-0334 · Cerrar la cola de arranque: las ventas sin registrar que ya no se pueden identificar se dan por hechas, en bloque y con un líder

- **Fecha:** 2026-10-04 · **Estado:** aprobado por Felipe (opción B de tres, «ok ejecuta B»; las dos decisiones de negocio que
  faltaban —qué pasa con una devolución y hasta cuándo— las respondió con preguntas el mismo día). Construido y verificado en una base
  local propia, con los cuatro recorridos del navegador. **Las partes 1, 2 y 3 (`20261005100000`/`100`/`200`) YA están en producción** (verificado por efectos, solo lectura, el 2026-10-04 por la noche: tablas, columna, candados, políticas, `cerrar_cola_arranque` y los tres plazos del 15-oct, con 0 cierres hechos y la cola intacta: TRU 97 y AQP 170 pendientes). **Siguen sin pegar `20261005110000` (reabrir) y `20261005120000` (sugerencias).**
  El orden y las comprobaciones están en `docs/backlog/2026-10-04-unregistered-merchandise-solutions-860786.md`.
- **Pedido:** «esto es mercancía que no estaba registrada, ¿cómo quieres que regularice? Recién estamos adoptando el sistema: que exista
  alguna opción de "lo entiendo y doy por hecho / no lo sé". Analiza y dame 3 soluciones, las mejores».
- **Usa y complementa:** ADR-0179 (la venta sin registrar y su cola), ADR-0328 (decisiones 8 y 9 y actividad 5: la «limpieza de arranque»),
  ADR-0330 (la cola vive en Existencias), ADR-0280 (acciones sin combo «Responsable»), ADR-0207 (Actividad).

## El problema, con las cifras de producción (solo lectura, 2026-10-04)

| | TRU | AQP |
|---|---|---|
| Ventas sin registrar pendientes | 97 (S/ 5,670) | 170 (S/ 7,750) |
| Vencidas (más de 2 días) | 20 | 83 |
| Prendas cargadas en el sistema | 988 | **13** |
| Con **una** prenda posible (misma categoría, talla y color, con stock) | 23 | 3 |
| Con 2 o 3 prendas posibles | 13 | 0 |
| Con 4 o más (sería adivinar) | 22 | 0 |
| Con **ninguna** | 39 | 167 |

La cola no es un montón que se vacía: es un grifo. AQP pasó de 26 a 58 ventas sin registrar por día entre el 30-sep y el 3-oct, y TRU
llevaba 46 ayer y 30 hoy. «Regularizar» (elegir la prenda real) solo tiene sentido para un caso de tres:

1. **Sí está en el sistema y solo perdió la etiqueta** (TRU: unas 58 de 97 tienen candidata). «Regularizar» funciona.
2. **Todavía no está cargada** (AQP). Pedir la prenda real es pedir algo que no existe. Y hacerlo igual con «llegó nueva» es peor que
   no hacerlo: crea un movimiento de esa prenda en la tienda, y la carga inicial rechaza después cualquier prenda con historia en esa tienda
   (`carga_con_historia`, `20260926130000_alta_producto_con_stock_inicial.sql:100`). Los movimientos no se borran.
3. **Nunca se podrá saber** (la última unidad de un modelo que nadie cargó). No hay prenda a la que unirla.

La pantalla trataba los tres igual, y por eso nadie regularizaba: **236 pendientes y 0 regularizadas** (ADR-0328).

## Decisión

Un líder **cierra la cola de UNA tienda, en bloque, dentro de un plazo, con un motivo**. Las filas pasan a `cerrada_sin_prenda`: sin
prenda, sin movimiento de stock, con el dinero de la venta intacto. Antes de cerrar puede **identificar con sugerencias** las que sí
tienen una sola prenda posible. Si quien la compró devuelve una prenda cerrada, un líder la **reabre**.

**1. Un estado nuevo, no una bandera.**
DECIDÍ: `prendas_por_regularizar.estado = 'cerrada_sin_prenda'` más `cierre_id`, con candados de esquema: cerrada ⇒ trae su cierre y NO trae
prenda ni forma; el cierre tiene que ser **de la misma tienda** (clave foránea compuesta `(cierre_id, ubicacion_id)`); fuera de «cerrada»
el cierre solo sobrevive en una venta anulada.
DESCARTÉ: una columna booleana «aceptada» sobre filas que siguen `pendiente`, porque cada lector de la cola (Inicio, Observatorio, «Para hoy»,
cierre de mes, el motor del piso) tendría que acordarse de excluirla, y el que se olvide la sigue contando como trabajo por hacer.
SE ROMPE SI: un lector nuevo cuenta «todo lo que no está regularizada» como pendiente. Hoy ninguno lo hace (verificado: web y funciones SQL).

**2. Cerrar es un evento, no cientos de clics.**
DECIDÍ: una función, `cerrar_cola_arranque(tienda, corte, motivo, nota)`, solo de cuenta de líder, que deja **un registro**
(`cierres_cola_arranque`: quién, cuándo, hasta qué venta, cuántas, cuántos soles, por qué) y **una** línea en Actividad.
DESCARTÉ: (A) un botón «lo doy por hecho» en cada fila, porque con 58 ventas por día en AQP se vuelve el camino fácil, no tiene dueño ni
fecha de fin, y deja la cola sin significado. (C) «que la carga o el conteo la cierre solos», porque depende de eventos que aún no
ocurren (AQP no cargó; el piso de TRU no está cuadrado) y deja 267 filas en el limbo; además lo que nunca tuvo prenda no se cierra jamás.
SE ROMPE SI: se cierra y la cola vuelve a crecer sin plazo. Por eso el cierre tiene plazo (decisión 4) y el grifo (cargar AQP) sigue siendo trabajo del equipo.

**3. Se cierra solo lo que el líder vio.**
DECIDÍ: la hoja manda `corte` = la venta pendiente más nueva que se le mostró, tal cual la devolvió la base (con microsegundos), y la función
cierra `vendido_en <= corte`. Lo que se venda después sigue pendiente. Las filas se bloquean en orden de id y se cierra exactamente ese conjunto.
DESCARTÉ: cerrar «todo lo pendiente ahora», porque una venta que entra mientras el líder lee la hoja quedaría cerrada sin que nadie la viera;
y pasar el corte por `Date` de JavaScript, que corta a milisegundos y habría dejado la venta más nueva fuera.
SE ROMPE SI: un reloj adelantado manda un `corte` en el futuro: la función lo rechaza (`cola_corte_invalido`).
LIMITACIÓN CONOCIDA (revisión independiente, 2026-10-04): «solo lo que el líder vio» es «solo lo vendido hasta el corte». Una fila REABIERTA conserva su
`vendido_en` antiguo, así que si otro líder la reabre justo entre que esta hoja se cargó y se confirmó, el cierre la vuelve a tomar (y la persona que
quería devolverla vuelve a chocar con «prenda_cerrada_sin_prenda»). No es un estado inválido ni mueve stock o dinero, el registro del cierre y
Actividad dicen la cifra verdadera (el aviso de éxito también: lee la cifra que cerró la base) y se deshace reabriéndola otra vez. La solución estricta
—que la hoja mande cuántas filas vio y la base rechace si cambió (`p_filas_esperadas`)— obliga a reemplazar `cerrar_cola_arranque`, que ya está en
producción, por una función de otra firma; se dejó fuera por un caso que exige dos líderes en la misma ventana de segundos (Felipe, 2026-10-04: «dejarlo documentado»).

**4. La salida de emergencia nace cerrada y expira.**
DECIDÍ: `cola_arranque_plazo` (una fila por tienda, último día inclusivo en hora de Lima). Sin fila no hay botón. Las tres tiendas arrancan
con el **15-oct** (Felipe: «todos los días vamos a subir todo, máximo hasta el 15»). Reabrir NO exige plazo.
DESCARTÉ: una fecha dentro de `ubicaciones` o de la configuración de empresa, porque son tablas del núcleo y ADR-0328 (actividad 4) ya prevé una
«fecha de cierre de la carga inicial por sede»; cuando exista, esta tabla se une a ella. Y una pantalla para editar el plazo (se dejó fuera: un
cambio de fecha es una migración de una línea; si pesa, es una actividad aparte).
SE ROMPE SI: AQP no termina su carga el 15-oct. Se amplía con una migración.
NOTA DE ARRANQUE LIMPIO: en producción las tiendas ya existían cuando se pegó la migración y recibieron su plazo; en un arranque limpio (CI, local)
`seed.sql` crea las tiendas DESPUÉS de las migraciones y la siembra no ve ninguna. Por eso `seed.sql` siembra sus propios plazos (hoy + 30 días) y
cada prueba asegura el suyo: una prueba no puede depender de en qué orden se llenó la base (así falló el CI de PR #800 la primera vez).

**5. Una venta cerrada sigue bloqueada para cambios y devoluciones; la salida es reabrir.**
DECIDÍ: `fn_exige_prenda_regularizada` rechaza cambios y devoluciones de una fila `pendiente` **o** `cerrada_sin_prenda` (con mensaje propio:
«pide a un líder que la reabra»). `reabrir_prenda_cerrada` devuelve la fila a `pendiente` (suelta su cierre; el registro del cierre no se
toca: dice lo que se aceptó ese día), solo líder, con motivo y una línea en Actividad. Reabrir es **solo desde la cuenta personal de un líder**:
una terminal de caja no puede, ni con un líder identificado en ella (los permisos los decide la cuenta, no el combo «Responsable»).
DESCARTÉ: (i) dejar la cerrada definitiva, porque unas 13 a 25 clientes podrían volver dentro del plazo de devolución y el mostrador se quedaba
sin salida; (ii) que el botón «Regularizar» funcione sobre una fila cerrada, porque si un conteo ya corrigió el stock de esa prenda, regularizar
después la descontaría otra vez.
SE ROMPE SI: se reabre una prenda cuyo stock ya corrigió un conteo y se regulariza como «ya estaba registrada»: doble descuento. La hoja de
reabrir lo avisa; la base no puede saberlo (el conteo no recuerda de qué venta salió la diferencia). También: se reabre una venta cerrada
porque «la prenda aún no estaba cargada» para una devolución: regularizarla crea historial de esa prenda en la tienda y la carga inicial rechaza
luego una prenda con historia (`carga_con_historia`). Es inevitable (una devolución mete la prenda a la tienda), así que la hoja de reabrir lo
dice cuando el motivo del cierre fue ese, y si la prenda ya se cargó después, lo correcto es «Llegó nueva». Las ventas cerradas se leen SIN ventana
de fechas (son pocas y no crecen): con la ventana del historial, una venta cerrada de hace más de un mes dejaba de tener botón para reabrirla.

**6. Identificar con sugerencias: la base propone, el líder confirma.**
DECIDÍ: UNA sola definición de «candidata» (acordada con la sesión del rediseño de Inventario, ADR-0328). `fn_candidatas_de_venta(tienda)` es la base,
de lectura para quien opera la tienda: todas las parejas (venta pendiente, prenda) con misma categoría, talla y color y al menos 1 unidad disponible fuera
de cuarentena y sin lo apartado; dice además si la prenda es «limpia» (toda unidad que tiene en la tienda es libre). `fn_cola_arranque_candidatas`
(solo líder) queda encima: solo las ventas con **exactamente una** prenda posible, esa prenda «limpia», sin proponer más ventas que unidades.
`regularizar_prendas_sugeridas` aplica las parejas que el líder marcó, **todas o ninguna**, cada una por `regularizar_prenda` («ya estaba registrada»),
toma los candados en el orden de ADR-0190 (cola → prendas → stock) antes de su bucle y, si una pareja falla, nombra la venta. Las casillas nacen
sin marcar (Felipe, 2026-10-04: confirmar sin mirar no puede ser un clic; «Marcar todas» es un gesto deliberado). Rechaza una pareja que no calce o sea de otra tienda.
DESCARTÉ: aplicar las sugerencias sin que alguien las mire: una sola candidata no es certeza. Si la prenda vendida nunca se cargó, la candidata
es OTRA prenda que sigue colgada y quedaría con 1 de menos (ADR-0328, decisión 9: «por eso confirma una persona»). Proponer también las de 2 o 3
candidatas en bloque: elegir sería adivinar (el modal de una venta suelta SÍ puede mostrarlas todas para que la persona elija, leyendo la base común).
Corregir `regularizar_prenda` para que descuente solo de filas libres: es de otra sesión (ADR-0328, #788 lo parcha por ancla); por eso la propuesta
en bloque se limita a prendas «limpias» y no depende de cuál fila elija esa función.
SE ROMPE SI: alguien vendió la última unidad de esa prenda mientras se revisaba. La pareja falla, no se aplica ninguna, la hoja lo explica
y vuelve a buscar. Y si #788 cambia cómo `regularizar_prenda` elige la fila: la propuesta «limpia» sigue siendo válida (es más estricta).

**7. No se inventa un costo.**
DESCARTÉ: ponerle a las cerradas un costo promedio por categoría. Esas ventas quedan con costo 0 (la línea sigue en la variante «Cargo especial»):
el margen sale inflado en lo que se cierre así, y es mejor que se vea a que se llene con un número que parece real. El cierre de mes de Finanzas
hoy no las nombra: queda abierto (abajo).

## Contrato para quien escriba el motor del piso (`lib/piso-plan.ts`, ADR-0328 decisión 2)

**La velocidad cuenta las ventas `pendiente` Y las `cerrada_sin_prenda`.** Ninguna de las dos mueve stock, así que no se cuentan dos
veces (a diferencia de una `regularizada`, que ya tiene su salida `venta` en `movimientos`). Si solo se cuentan las pendientes, cerrar la cola
de AQP la deja «ciega» justo cuando más vende sin registrar. El filtro es `estado in ('pendiente', 'cerrada_sin_prenda')`.

**Regla de orden (acordada con la sesión del rediseño de Inventario, 2026-10-04):** su `fn_piso_plan_lectura` contará las dos al fusionarse. **No cerrar la cola de AQP
antes de que el motor del piso cuente las cerradas**: si el motor solo contara pendientes, la velocidad de AQP caería a 0 ese día. Hoy no hay ese motor (Frescura y Análisis ven
1 de cada 141 ventas de AQP), así que cerrar antes no pierde nada que exista; el riesgo aparece al fusionar el motor, y el PR que se fusione segundo comprueba el contrato.

## Cómo se verifica

- `pnpm pruebas:cola-arranque`: 44 casos SQL con ROLLBACK (todo-o-nada, solo líder, plazo inclusivo, corte, cerrada bloqueada, anular,
  estados imposibles, lectura por tienda, reabrir, sugerencias) y la **prueba de mutación**: se rompió a propósito cada candado (el filtro del
  corte, el tope por stock, la exclusión de cuarentena, la validación de la pareja, el estado que acepta reabrir, que reabrir suelte el cierre)
  y la prueba falló cada vez.
- `BASE_DESECHABLE=1 pnpm pruebas:cola-arranque-concurrencia`: 3 carreras con COMMIT real (dos cierres a la vez; regularizar mientras se cierra;
  dos líderes confirmando la misma sugerencia). No va en el CI: deja datos confirmados.
- Vitest: reglas puras (`lib/cola-arranque-reglas.test.ts`, que además compara las listas de motivos con las de la migración) y la suite entera.
- En el navegador (base local propia, Chrome sin ventana): el líder ve los tres botones, elige tienda y motivo, cierra, ve las filas «Cerradas»,
  reabre una y desmarca una sugerencia; **una colaboradora no ve ningún botón** y sí ve las cerradas con su motivo.

## Revisión independiente (2026-10-04, antes de pegar `110000` y `120000`)

Cinco lentes (seguridad, integridad y concurrencia, pegado en producción, web, negocio) y un escéptico por hallazgo, solo lectura y con bases desechables:
21 agentes, 13 hallazgos confirmados y 3 descartados. **Seguridad: ninguno.** Los que importaron, y qué se hizo:

| Hallazgo | Qué se hizo |
|---|---|
| Lo que se propone no siempre se puede aplicar (prenda con unidad apartada o en cuarentena: `regularizar_prenda` puede elegir esa fila y el lote entero falla) | `120000`: la propuesta en bloque solo toma prendas «limpias»; el error del lote nombra la venta; 6 casos de prueba |
| El lote no tomaba los candados en el orden de ADR-0190 (deadlock posible contra una venta de caja) | `120000`: cola → prendas → stock antes del bucle; verificado con la definición de la función |
| El aviso de error de las sugerencias mandaba a «Llegó nueva» (opción que esa hoja no tiene) y no volvía a buscar | Texto propio, y vuelve a buscar las sugerencias |
| El aviso de éxito del cierre decía la cifra que vio la hoja, no la que cerró la base | Lee la cifra del registro del cierre |
| El plazo nunca se le decía a la persona (el botón desaparecía) | Línea con el plazo de cada tienda sobre la tabla |
| Reabrir una venta cerrada por «aún no cargada» lleva a crear historial de esa prenda | La hoja lo avisa; ver decisión 5 |
| Las ventas cerradas de hace más de un mes no se podían reabrir (ventana del historial) | Las cerradas se leen sin ventana |
| «una cliente»: texto con género | Lenguaje neutro (web y migración `110000`) |
| Una fila reabierta puede volver a entrar a un cierre abierto en otra pestaña | Limitación documentada en la decisión 3 (arreglo estricto cambia la firma de una función ya en producción) |

Quedaron fuera por no ser defectos: Enter en la nota (el botón dice el conteo y exige motivo), «Reintentar» sin las migraciones 4 y 5, y el cuerpo del PR
(el revisor leyó una versión anterior).

## Lo que queda abierto

- **Finanzas ▸ Cierre de mes** no nombra las ventas cerradas sin costo (excluye la variante «Cargo especial»). Tarea aparte con su decisión contable.
- **Actividad** anota la regularización bajo «Recibir» (`fn_actividad_regularizar`), aunque la cola vive en Existencias desde ADR-0330. Tarea aparte.
- **El conteo «de arranque»** (ADR-0328, actividad 15) aún no existe. Las cerradas que eran de una prenda del sistema dejan esa prenda con 1 unidad
  de más hasta contarla; con un conteo normal ese descuadre se vería como pérdida. **Cerrar TRU después de cuadrar su piso** (ADR-0328, actividad 3).
- **El modal «Regularizar prenda»** (el de siempre) sigue sin guía de foco (`pendiente` en el registro desde antes). Lo toca la otra sesión de ADR-0328.
- «Nadie regulariza su propia venta salvo el líder» y la categoría sugerida desde la descripción (el resto de la actividad 5 de ADR-0328) siguen
  con esa sesión. Aquí solo el líder confirma sugerencias y cierra.
