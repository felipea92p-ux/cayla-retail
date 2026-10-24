# ADR-0499 — Plan de campaña: la cuenta con el descuento de la campaña y la fecha límite para pedir

- **Fecha:** 2026-10-24 · **Estado:** construido y probado en local; **las dos migraciones (`20261024215000` y `20261024220000`) NO están en producción**: cada una espera el OK
  puntual de Felipe, una por una (ver «Cómo se pega en producción»). La web nueva con la base vieja no ofrece ni el campo de descuento ni «Cambiar los días» y calcula como antes.
  Faltan, en este orden: `/focus`, `/formidable` y `/chaos` sobre las dos hojas nuevas, y el aviso de deriva (ver «Lo que NO cubre»).
  El número de este ADR y las versiones de las migraciones están reservados para la rama `claude/campaign-plan-improvements-18875c` (`pnpm reservar`).
- **Continúa a:** [ADR-0349](0349-plan-de-campana.md) (el modelo del vendedor de diarios) y [ADR-0372](0372-plan-de-campana-barra-de-rango-paso-a-paso-y-exportar.md).
- **Relacionados:** ADR-0496 (las ofertas de una campaña), ADR-0486 (campañas por sede), ADR-0302 (el descuento de campaña es exacto), ADR-0195 (políticas y deadlocks),
  ADR-0161 y ADR-0387 (el módulo es la llave), ADR-0284 (guía de foco), ADR-0389 (guías interactivas).
- **Maqueta:** `docs/maquetas/plan-descuento-plazo-2026-10/index.html`. Aprobada por Felipe el 2026-10-24: descuento guardado por categoría y plazo único por campaña.

## El problema

El Plan de campaña sirve para tres cosas: mapear qué campañas conviene hacer, proyectar cuánto comprar y asignar recursos. De su diagnóstico salieron dos agujeros, los dos en lo que
decide cuánto dinero se compromete:

1. **Calculaba con el precio de lista.** En una campaña se vende con descuento (Navidad −20 %, Cyber −30 %). Con el descuento queda menos por prenda, así que quedarse corto duele
   menos y conviene comprar un poco menos; y si el descuento se come todo el margen, la campaña pierde plata en esa categoría y **nadie lo veía**. Además el plan no dejaba escrito
   QUÉ descuento se supuso, que es el problema de origen de ADR-0349: «nadie puede revisar después qué se supuso».
2. **No decía hasta cuándo pedir.** Una campaña falla antes por pedir tarde que por pedir mal. El plan decía «compra 40 prendas» pero no «y pídelas antes del 12/11 para que estén en
   las tiendas el día que empieza». Ese número de días es de la campaña (Navidad pide antes que un Día de la Madre con un proveedor local) y no vivía en ninguna parte.

## Lo que se decidió

1. **El descuento se guarda por categoría** (`planes_compra_lineas.descuento_pct`, `numeric(5,2)`, 0 por defecto, de 0 a menos de 100), con **lo que sugiere la campaña** a su lado.
   - Entra en la cuenta así: lo que se pierde por cada prenda que faltó es el precio **con descuento** menos el costo (`cuantilCritico`, `lib/plan-compra-reglas.ts`).
   - **Lo que sobra se recupera sobre el precio de LISTA**, porque se vende después de la campaña: el descuento no entra en lo que cuesta sobrar.
   - Si el descuento se come todo el margen, lo que se pierde por faltar es 0, el cuantil es 0 y se compra cerca del escenario flojo.
   - `0` = precio de lista: todo plan de antes queda igual, sin tocarlo.
2. **Un descuento que deja el precio por debajo del costo NO es un estado imposible: se avisa, no se prohíbe.** Una liquidación puede perder margen a sabiendas. La hoja lo dice con todas
   sus letras («no deja ganancia sobre el costo») y la fila de la tabla muestra «no deja ganancia». La base solo cierra lo que no tiene sentido: negativo, 100 % o más, o escribir sin pasar por la función.
3. **El sugerido de la campaña es el MAYOR % que alcanza a la categoría** (`fn_plan_compra_descuento`): entre el descuento de siempre de la etiqueta (por sus categorías) y sus ofertas
   activas que tocan las fechas del plan (ADR-0496). No pondera por días ni por tiendas: si la oferta rige solo martes y jueves o solo en una tienda, la función devuelve
   `dias_semana` y `solo_en`, y la hoja avisa «rige solo en parte». Las prendas marcadas a mano (sin categoría) no cuentan.
4. **Lectura aparte, sin tocar `fn_plan_compra`.** Esa función ya lleva diez filtros de familias y parches anclados; el descuento y el plazo se leen con dos funciones nuevas, como
   `fn_plan_compra_propuesta` y `fn_plan_compra_pedido`. Cada una devuelve una marca (`con_descuento`, `soportado`): **la web nueva solo ofrece el campo si la ve**, y con la base vieja el plan se calcula como antes.
5. **El plazo es UN número por campaña, fijado a mano** (`planes_compra.dias_para_llegar`, de 1 a 365; `NULL` = sin fijar). La fecha límite es el inicio de la campaña menos esos días
   (`plazoDePedido`, `lib/plan-compra-plazo.ts`) y dice una de cinco cosas: a tiempo, justo (7 días o menos), tarde, «ya empezó» (cuándo llegaría un pedido de hoy) o «terminó».
   - Sin fijar, la pantalla usa **14 días de fábrica, el mismo supuesto del punto de reorden cuando no hay historia, y lo dice**: «es un supuesto, todavía sin historia de recepciones».
   - Fijarlo queda **firmado**: quién y cuándo (`plazo_actualizado_por/en`), como el tope de inversión (B2). Nunca un número sin autor (CHECK).
   - **Solo avisa: nunca impide guardar un plan ni hacer un pedido.** La franja de arriba (`Aviso`) y un chip por fila con compra pendiente.
6. **Quién puede:** fijar el plazo lo hace quien tiene el módulo «Plan de campaña» (ADR-0387), firmado por el responsable del combo (`fn_actor_persona_id(true)`, ADR-0161). El descuento
   se guarda con la misma función de siempre (`guardar_plan_compra_linea`), así que hereda sus permisos. No hay módulo nuevo: son piezas de adentro de una pantalla (ADR-0306).

```
DECIDÍ:     guardar el descuento SUPUESTO en cada categoría del plan (con el sugerido de la campaña al lado), en vez de leer el de Etiquetas en vivo cada vez que se abre.
DESCARTÉ:   leerlo en vivo de Etiquetas: el plan cambiaría de números solo, sin que nadie lo toque, y de nuevo nadie podría decir qué se supuso cuando se pidió. Descartada
            también una sola cifra por campaña: Casacas puede tener −25 % y Pantalones nada, y un solo número haría comprar mal una de las dos.
SE ROMPE SI: la campaña sube de −20 % a −25 % DESPUÉS de que alguien armó el plan y nadie vuelve a abrir esa categoría: el plan sigue calculando con −20 % y nada lo avisa.
            Hoy la hoja solo muestra el sugerido al abrirla; el aviso de deriva («la campaña ahora dice −25 %, tu plan dice −20 %») está pendiente y es parte de esta mejora.
```

```
DECIDÍ:     un plazo único por campaña, fijado a mano, con 14 días de supuesto que la pantalla llama supuesto.
DESCARTÉ:   calcularlo desde las recepciones: en producción hay 0 órdenes de compra (2026-10-24) y un promedio de dos recepciones se vería más preciso de lo que es. Descartado
            también un plazo por proveedor o por Taller: un proveedor lento o la producción propia tardan distinto, pero eso es otra decisión y no se esconde dentro de ésta.
SE ROMPE SI: una categoría se produce en el Taller (2 meses) y otra llega de un proveedor local (5 días) en la misma campaña: el plazo único dice «a tiempo» para la que ya
            no llega. También si dos personas lo fijan a la vez: gana la última y queda firmada ella, y la pantalla muestra quién lo fijó, así que no pasa en silencio.
```

```
DECIDÍ:     leer descuento y plazo con dos funciones nuevas (`fn_plan_compra_descuento`, `fn_plan_compra_plazo`) y una marca que la web exige ver.
DESCARTÉ:   meterlos dentro de `fn_plan_compra`: tocar una función con diez parches anclados por dos campos nuevos arriesga el plan de todas las campañas, y el orden de
            publicación se volvería obligatorio (web y base a la vez) en vez de «da igual».
SE ROMPE SI: alguien renombra `con_descuento` o `soportado` y la web deja de ver la marca: el campo desaparece de la hoja sin ningún error (el plan se calcula como antes, que es lo seguro, pero la mejora «se apaga» callada).
```

## Estados imposibles que la base no deja existir

Un descuento negativo o de 100 % o más (CHECK `planes_compra_lineas_descuento_rango`) · un plazo de cero, negativo o de más de 365 días (`planes_compra_plazo_rango`) · un plazo sin quién lo fijó
ni cuándo (`planes_compra_plazo_con_autor`) · escribir cualquiera de los dos sin pasar por su función (las tablas tienen RLS sin políticas) · dos versiones de `guardar_plan_compra_linea` a
la vez (la migración borra la de 11 parámetros y crea la de 12 en la misma transacción: dos sobrecargas confundirían a PostgREST). Dos personas que guardan descuentos distintos
para la misma categoría no se pisan: el descuento entra en la comparación de versión de B4.

## Concurrencia, caída y persona sin contexto

- **Concurrencia.** Descuento: la versión de B4 lo cubre. Plazo: es un solo número, gana la última escritura y queda firmada (un control de versión sería más ceremonia que el dato). Un segundo envío
  mientras el primero viaja (doble clic, Enter repetido) no sale, y fijar el plazo es idempotente: repetirlo tras un corte de red deja lo mismo.
- **Caída externa.** Nada llama a la red. Si la lectura del descuento falla, la web calcula con 0 % y lo dice, nunca inventa un descuento; si falla la del plazo, usa el supuesto de 14
  días y lo dice, nunca esconde la fecha límite. Con la base vieja, ninguno de los dos campos se ofrece.
- **Persona sin contexto.** La franja habla en fechas («Pedir antes del 12/11»), no en días; la hoja del plazo muestra la fecha que resulta MIENTRAS se escribe, y la del descuento dice
  cuánto se gana por prenda con y sin él. Las dos hojas tienen su guía de foco (`camposDelPlazo`, y `descuento` en `camposDelPlan`) y la demo del Plan las explica (cinco pasos nuevos en `compras.plan`).

## Cómo se pega en producción (solo con el OK de Felipe, una por una)

Cada migración va en UNA parte: un `alter table` de una tabla chica (0 líneas y 5 planes en producción el 2026-10-24), dos funciones, **sin políticas ni `drop trigger`** (ADR-0195), con
`lock_timeout` de 3 s y escritas para pegarse dos veces sin cambiar nada. El orden entre ellas da igual.

1. **`20261024215000` (descuento).** Reemplaza `guardar_plan_compra_linea`. **Se niega a aplicar** si el md5 del cuerpo vigente no es `3d16664d66ab6c8a75d6ebd04b56052c` (el de producción el 2026-10-24):
   significa que otra sesión la parchó y esta migración se escribió contra un cuerpo viejo. Antes de pegarla: ensayo en una transacción revertida y huella completa (cuerpo, `security definer`, `proconfig`, ACL),
   probando con `set local role authenticated`, porque el ensayo corre como dueño y no ve los permisos (aprendizaje del 2026-10-24).
2. **`20261024220000` (plazo).** Columna y dos funciones nuevas: no hay nada que reemplazar ni anclar.
3. Después de cada una: leer lo que quedó en la base y comparar con el local. Al terminar, refrescar el diccionario de datos (`docs/datos/generado/COMO-REFRESCAR.md`); mientras no estén en producción, viven en el backlog como «no está en producción».

## Cómo se verificó

- `pnpm pruebas:plan-compra-descuento` → **19/19** y `pnpm pruebas:plan-compra-plazo` → **11/11**, contra el Postgres local con ROLLBACK (incluye las puertas: rol `authenticated`, sin el módulo → `42501`, `anon` no ejecuta, una sola `guardar_plan_compra_linea`).
- `npx vitest run lib/plan-compra` → **342** pruebas en 9 archivos (la cuenta con descuento, la fecha límite, el sugerido, la guía), y los tipos limpios.
- La guía: `guias:recorrer` en escritorio y a 375 px en oscuro, con la huella de `compras.plan` aceptada tras revisar cada control nuevo.
- **Sin cubrir:** una categoría con oferta real (en la base local las categorías recorridas no tienen descuento), el camino «no deja ganancia» en el navegador y `pnpm pruebas:plan-compra`, que reproduce migraciones viejas y falla en la base local compartida por datos de otras sesiones (no por estos cambios).

## Lo que NO cubre (y queda abierto)

- **El aviso de deriva** (paso 4 de esta mejora): hoy el sugerido se ve solo al abrir la hoja de la categoría. Mientras no exista, el segundo bloque `SE ROMPE SI` de arriba sigue vigente.
- **Las otras mejoras del diagnóstico** no se tocaron: el Mapa del año con campañas por probar y su veredicto al cerrar, el ranking por utilidad con tope y comprar-vs-producir.
- **El sugerido pondera nada:** una oferta de 4 días de −35 % se sugiere como −35 %. Decisión de Felipe pendiente: sugerir solo el descuento que rige todos los días.
- **«Descargar la lista»** no lleva todavía el descuento ni el plazo. Decisión de Felipe pendiente.
- **Un proveedor o el Taller con otro plazo** (ver el segundo bloque de arriba).
- **El pie de la hoja «Días para llegar» se desborda a 375 px:** «Usar el supuesto de 14» queda cortado y, en escritorio, «Guardar plazo» baja a una segunda fila. Es un hallazgo del recorrido de la guía,
  a corregir en `/formidable` antes del PR.
- **Sin historia de recepciones no se puede sugerir el plazo.** Cuando haya órdenes de compra recibidas, la pantalla podría proponerlo SIN tocar esta tabla.
