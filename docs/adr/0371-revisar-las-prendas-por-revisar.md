# ADR-0371 — Revisar las prendas pendientes: la cola «Por revisar» y el rechazo que no deja nada colgado

- **Fecha:** 2026-10-10
- **Estado:** construido y verificado en local; **falta pegar la migración en producción y publicar la web (en ese orden)**.
  Migración `supabase/migrations/20261010170000_revisar_productos_pendientes.sql` (solo funciones: una parte, sin políticas).
- **Pedido y decisiones de Felipe (2026-10-10, por AskUserQuestion):**
  1. **Alcance:** «cola en Productos, sin aviso en la ficha». La cola es una vista de Catálogo ▸ Productos; Editar producto solo lleva una insignia.
  2. **Rechazar:** «bloquear hasta anular la orden». Rechazar se niega con una orden de producción en proceso o con stock.
- **Complementa:** ADR-0099 (alta al vuelo: proponer/aprobar), ADR-0361 (el Taller crea modelos que nacen `pendiente`), ADR-0292 (`producto_origen`),
  ADR-0306 (un módulo es una entrada del menú), ADR-0358 (una función, una pieza). **Reabre** la decisión del 2026-10-02 de quitar el aviso de
  Editar producto (ver «Contexto»).

## Contexto

Un producto nace `estado_alta = 'pendiente'` cuando lo crea quien no edita el catálogo (`productos_estado_alta_biut`): la alta al vuelo del
conteo (`censo_crear_variante`, ADR-0099) y, desde el ADR-0361, el «Modelo nuevo» de la orden de producción del Taller. La base sabe aprobarlo o
rechazarlo —`revisar_producto_censo`— pero **ninguna pantalla la llamaba**: el ADR-0361 lo dejó anotado como «hueco conocido».

Hay una razón por la que no había pantalla, y esta decisión no puede ignorarla. **El 2026-10-02 Felipe pidió quitar** el aviso «Pendiente de
revisar» con Aprobar/Rechazar de Editar producto (`RevisarAltaBanner`): «no me sirve». Ese día también se quitó el filtro que escondía las prendas
pendientes en Existencias, así que hoy una prenda pendiente **se trata como cualquier otra** en todas las pantallas. La bitácora no dice por qué no
servía; lo que sí dice es que «rechazar» se asimilaba a «descontinuar en la ficha». **No son lo mismo**, y eso es lo que esta decisión corrige:

| | Descontinuar (ficha) | Rechazar (`revisar_producto_censo`) |
|---|---|---|
| Se puede deshacer | Sí (Reactivar) | **No**: `cambiar_estado_productos` responde `rechazado_no_reactivable` y la ficha no ofrece «Activo» |
| El nombre queda libre (`productos_nombre_unico…`) | No | Sí (el índice ignora los rechazados) |
| Qué mira antes de hacerlo | Nada | Hasta hoy, nada |
| Qué pasa con una orden de producción abierta | Sigue | **Sigue, y al cerrarse mete stock a una prenda descontinuada y no reactivable**: `cerrar_produccion` no mira `productos.estado` |

Producción tiene hoy **0 productos pendientes** (161 aprobados; consulta de solo lectura del 2026-10-10): el problema es **latente**, se activa cuando
salga el «Modelo nuevo» del Taller y la cuenta del Taller no edite el catálogo.

## Decisión

1. **La cola vive en Catálogo ▸ Productos, no en la ficha** (decisión de Felipe). `/productos/por-revisar` (`app/(app)/productos/por-revisar/`,
   `components/PorRevisarLista.tsx`): una fila por prenda, la más vieja primero, con **quién la propuso, desde qué sede o terminal nació**
   (`producto_origen`, ADR-0292), sus **variantes** (tallas, colores), su **precio**, su stock y sus órdenes en proceso. Sin costos (son de quien ve el
   dinero). Aprobar y Rechazar abren la misma hoja (`components/RevisarProductoHoja.tsx`, un `<Modal variante="hoja">`) con el combo «Responsable»
   (ADR-0161). **No es un módulo nuevo** (ADR-0306): lo ve quien ve Productos y edita el catálogo, igual que la base lo exige; sin él, vuelve a la lista.
2. **Cómo se entra:** en Productos, un `<Aviso tono="atencion">` «N prendas por revisar · Revisar», **solo si N > 0 y solo a quien edita el catálogo**,
   como el de «prendas sin temporada» (ADR-0246). Se pensó como tarjeta de cifra, pero esa pantalla no tiene fila de cifras: una sola tarjeta sería
   huérfana. **Si la lectura falla o la función aún no existe, no se muestra nada** (nunca un «0» que diga que no hay).
3. **Editar producto lleva una insignia, no un aviso:** `<Chip tono="ambar">Pendiente de revisión</Chip>` junto al código, sin botones (su `title` dice
   dónde se revisa). Es lo que Felipe eligió; el aviso con botones que quitó no vuelve.
4. **Rechazar se niega si tiene una orden en proceso o stock — en la base** (principio 2: el diseño, no la validación after-the-fact).
   `revisar_producto_censo` (misma firma, `returns void`):
   - `con_ordenes_abiertas`: hay una `producciones.estado = 'en_proceso'` del producto → «anula esa orden en Producción»;
   - `con_stock`: `sum(stock.cantidad) > 0` → «ajusta su stock a 0 en Existencias» (el stock sale por `movimientos`, principio 4; nunca se «borra»);
   - **Aprobar nunca se bloquea.** Con cualquiera de los dos, la hoja ofrece aprobar y, con stock, descontinuar en la ficha (reversible).
   - Es **idempotente** (aprobar dos veces, rechazar dos veces: no falla ni duplica la línea de Actividad); revisar en el sentido contrario una ya revisada
     dice `ya_revisada` y **quién ganó**; y pregunta el permiso con su propia frase (`sin_permiso`, 42501) en vez del mensaje «solo un líder» del
     disparador (que desde ADR-0160 ya no es solo del líder).
   - La web **adelanta** las dos condiciones (`bloqueoDeRechazo`): la hoja explica el bloqueo en vez de pedir confirmar algo que va a fallar y lleva a
     Producción o a Existencias si la cuenta ve ese módulo. La **prueba de paridad** (`lib/revisar-productos-reglas.test.ts`) lee la migración y falla si
     la base cambia una condición o un `hint` que la web no conoce.
5. **Nada se borra.** Rechazar sigue siendo `estado = 'descontinuado'` (disparador, `productos_rechazado_descontinuado_check`); la fila, sus variantes y
   su historia quedan. La Actividad ya anota «propuso … · por aprobar» y «aprobó/rechazó …» (20261002234500): no se tocó.
6. **Dos lecturas, una función.** `fn_productos_por_revisar(p_limite, p_desde)` (prefijo `fn_`: la web la trata como lectura y no abre el loader),
   `security definer`, solo quien edita el catálogo (42501 si no), con `total` para paginar (25 por página; hasta 200 por llamada). Excluye los datos
   de prueba (D-54). Devuelve el prefijo y la familia de la categoría y un color para dibujar la miniatura sin foto como en todo el ERP (ADR-0333).

## Alternativas descartadas

- **Reponer el aviso con Aprobar/Rechazar en Editar producto** (lo pedido en la tarea): es lo que Felipe quitó. Se le preguntó y eligió la cola.
- **Que nada nazca pendiente** (el Taller y el conteo crean aprobado): cero pantallas, pero se pierde toda revisión de altas hechas por quien no edita
  el catálogo, y es un cambio de esquema en producción que afecta censo y Taller a la vez.
- **«Dejar rechazar y avisar»** y **«rechazar solo si no tiene nada colgado»** (movimientos incluidos): la primera deja stock y órdenes sobre una prenda
  muerta que nadie notará hasta un conteo; la segunda casi nunca dejaría rechazar un modelo del Taller con muestra ya cortada.
- **Bloquear en `abrir_produccion` y `cerrar_produccion`** (que una orden no se abra ni se cierre sobre una prenda descontinuada): cerraría la carrera
  de abajo, pero toca las funciones del Taller que cambia la rama del ADR-0361 y excede esta decisión. Queda en el backlog.
- **Aprobar en bloque** (marcar varias y aprobar): útil si un censo deja cientos pendientes; hoy hay 0 en producción y es una decisión de negocio
  (¿se aprueba sin mirar?). Queda en el backlog con el disparador «más de ~25 pendientes a la vez».
- **Borrar las filas rechazadas** (principio: nunca borrar datos): descartado de entrada.

## Consecuencias

- Un líder ve de un vistazo qué prendas propuso quién y desde dónde, y decide sin abrir la ficha. Rechazar ya no puede dejar un estado imposible
  (una orden o stock colgando de una prenda rechazada).
- **Orden de despliegue: la migración primero.** Si la web sale antes, el aviso de Productos no aparece (la lectura falla → `null`) y
  `/productos/por-revisar` dice «todavía no está activa en la base de datos»; no se cae. Con la web publicada y la función vieja, Aprobar y Rechazar
  funcionarían sin los bloqueos de la base (la hoja igual los adelanta con lo que lee, pero la lectura no existe sin la migración).
- La insignia y el aviso salen solos al aprobar o rechazar: no hay estado que mantener aparte.

## Se rompe si

- **Se abre una orden DESPUÉS de rechazar.** `abrir_produccion` no mira `productos.estado`: una orden nueva sobre una prenda ya rechazada no se
  frena. La ventana es la de un líder rechazando justo cuando el Taller abre una orden sobre ese mismo modelo. Dentro del rechazo, la carrera sí está
  cerrada: bloquea la fila del producto y las variantes (`for update`, que choca con el `for key share` de una orden que se está abriendo) y la prueba
  lo mide con dos sesiones.
- `producciones.estado` cambia de vocabulario (`en_proceso`) o `stock.cantidad` deja de ser la existencia física: los dos bloqueos miran eso.
- `fn_puede_editar_catalogo()` cambia de significado: la cola y la revisión usan esa función; la web decide con `puede(persona, "editarCatalogo")`.
- Alguien quita el prefijo `fn_` de `fn_productos_por_revisar`: el loader bloquearía la pantalla al leer (`espera-reglas.ts`).
- Se vuelve a poner un aviso con botones en la ficha sin releer el «no me sirve» del 2026-10-02.

## Cómo se verifica

- **Base** — `pnpm pruebas:revisar-productos` (cableada en el CI; 36 comprobaciones, todo con `ROLLBACK`): la cola trae quién/dónde/variantes/precio/stock/
  órdenes; orden por antigüedad; prueba, aprobadas y rechazadas fuera; página y `total`; sin costo; aprobar (firmada, activa, línea en Actividad);
  rechazar limpia (descontinuada, firmada, no borra); rechazar con una o dos órdenes y con stock (singular y plural); aprobar con ambas sí; anulada
  la orden o con el stock en 0, pasa; idempotencia, `ya_revisada`, `no_existe`, `datos_incompletos`; `sin_permiso` en lectura y revisión (a Micaela se le
  quitan Productos y Atributos dentro de la transacción: el seed local da a «Integrante» todos los módulos); `anon` sin ejecución; la migración se
  puede pegar dos veces; y **la carrera con dos sesiones** (una orden en vuelo hace esperar al rechazo ≥ 1,5 s y ninguna sesión deja nada escrito).
  **Comprobada por mutación:** con el stock y las órdenes sin chequear y el permiso apagado en la base, fallan 9 comprobaciones.
- **Reglas puras** — `lib/revisar-productos-reglas.test.ts` (19 pruebas): lectura de filas (tallas en su curva, números que llegan como texto),
  textos, `bloqueoDeRechazo`, mensajes de la base, y la paridad con la migración.
- **Navegador** (Postgres local, cuenta Admin): la cola con quién/desde dónde/variantes/precio y las miniaturas por categoría; Rechazar de una prenda con
  stock → hoja de bloqueo; con una orden en proceso → hoja de bloqueo con «Ver las órdenes»; Rechazar de una limpia → advertencia de que es permanente →
  aviso de éxito, la base queda `rechazado + descontinuado` firmado y Actividad anota «rechazó …»; Aprobar → «aprobó …»; la carrera humana (otra
  persona rechaza mientras la hoja está abierta) → «ya se revisó: quedó rechazada», la hoja se cierra y la lista se refresca; el aviso en Productos; la
  insignia en Editar producto; 375 px sin desborde (botones de 44 px de alto en celular); modo oscuro. `pnpm --filter web tema:auditar` con las tres hojas
  como escenarios: **0 hallazgos solo en oscuro**.
- **No verificado:** con datos reales de producción (hoy no hay pendientes), con una cuenta de terminal sin responsable, ni con `/chaos` (doble clic,
  pestaña vieja) ni `/formidable`. El doble clic está cubierto en la base por la idempotencia, no en la pantalla.
