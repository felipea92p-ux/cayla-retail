# ADR-0152 — Pedido no atendido en 1 toque: solo la captura del dato

**Fecha:** 2026-09-22
**Estado:** Aceptado e **implementado en local** (backend + pantalla mínima de verificación, sin enganchar al mostrador). Verificado con SQL
contra un Postgres real (`scripts/pruebas/pedidos_no_atendidos.mjs`), tipos y lint. **Migración sin aplicar en producción** (ver «Cómo se pega en
producción»).
**Decide:** Felipe, en la ronda de decisiones del 2026-09-21 (D-79, `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`).
**Afecta:** tabla nueva `retail.pedidos_no_atendidos`, dos funciones nuevas (`registrar_pedido_no_atendido`, `marcar_pedido_no_atendido_resuelto`),
una ruta nueva `/pedidos-no-atendidos` (pantalla de verificación, fuera del menú). **Nada existente se toca.**

## Contexto — el problema

Cuando una clienta pide un modelo o una talla que la tienda no tiene, hoy ese dato se pierde: si acaso queda en la memoria de la asesora o en un
cuaderno. D-79 lo nombra como una de las dos ideas de calidad que sí entran en esta ronda de construcción:

> **Pedido no atendido en 1 toque:** la asesora anota «pidió modelo/talla y no había»; alimenta el aviso «llegó tu talla» (D-77) y le dice al
> Taller qué cortar.

Esta pieza construye **solo la captura**. El aviso a la clienta y la señal de corte al Taller son consumidores futuros de esta misma tabla — no
nacen acá, y por eso el nombre de la RPC y de la tabla no asumen nada sobre cómo se van a leer después, solo que van a poder leerse (por
`ubicacion_id`, `producto_id`, `talla`, `resuelto`).

**Por qué no se engancha al Punto de Venta todavía.** Varias piezas de esta misma ronda tocan `PuntoDeVenta.tsx` a la vez (ver el resto de tareas
D-7x/D-8x de la ronda del 2026-09-21). Meter el botón «no había esto» ahí ahora habría significado —con alta probabilidad— un conflicto de merge
contra ese mismo archivo desde otra rama en paralelo. Se deja para una tanda posterior que junte todos los cambios del mostrador en un solo PR.
Mientras tanto, esta pieza es completa y usable por sí sola: la pantalla de verificación en `/pedidos-no-atendidos` prueba que el backend funciona
de punta a punta sin depender de que el Punto de Venta exista todavía.

## Decisión

**1. Tabla nueva, no una columna en otra tabla.** `pedidos_no_atendidos` es un documento de negocio (qué pidió, cuándo, quién atendió, si ya se
resolvió) — el mismo criterio que ya usa `apartados` (ADR-0141) frente a un simple contador. Vive fuera del núcleo (`productos`/`variantes`/
`stock`/`movimientos`, principio 1 del repo): no mueve stock, no es un movimiento, es una señal de demanda insatisfecha.

**2. `producto_id` NULLABLE + `descripcion_libre`, con un CHECK que exige al menos uno.** La clienta puede pedir un modelo que SÍ está en catálogo
(`producto_id`) o algo que CAYLA no tiene registrado — una prenda de otra marca, algo que ni se diseña todavía (`descripcion_libre`). Un pedido sin
ninguno de los dos no es un dato: es ruido que nadie podría convertir en un aviso ni en una orden de corte. El CHECK vive en la tabla, no solo en la
RPC (Lamport: «si no puedes describir el estado inválido, no entiendes el sistema» — un `insert` que lograra saltarse la RPC, hoy imposible por los
`revoke`, tampoco podría dejar la fila sin sentido).

**3. `talla` en texto libre, sin FK a un catálogo de tallas.** La asesora anota lo que la clienta dijo («M», «38», «grande») en el momento, sin
tener que resolver primero si esa talla existe en el vocabulario cerrado del modelo — más aún cuando el modelo ni siquiera está en catálogo
(`descripcion_libre`). Es 1 toque, no un formulario con validaciones cruzadas.

**4. `clienta_id` SIN FK por ahora.** `retail.clientas` la crea otra tarea de esta misma ronda; verificado el 2026-09-22 contra `origin/main` fresco
que esa tabla todavía no existe ahí. La columna queda declarada (para que la firma de la RPC no cambie cuando `clientas` aterrice) pero sin
`references`, con un comentario en la migración explicando exactamente qué `alter table ... not valid` correr después.

**5. Candado de ubicación, no de líder.** Cualquier colaborador —líder o integrante— puede anotar y resolver, en la ubicación que
`fn_puede_operar_ubicacion` le permite operar. A diferencia de cerrar caja o ajustar stock (D-13, solo líder), anotar que faltó una talla es
exactamente el tipo de dato operativo que hoy ya carga un integrante sin supervisión — restringirlo a líder solo garantizaría que la mitad de las
veces nadie lo anote.

**6. Dos RPC, orden del candado distinto y a propósito.** `registrar_pedido_no_atendido` recibe `p_ubicacion_id` como parámetro: el candado va
PRIMERO, antes de mirar si el producto existe (mismo criterio que exige la ronda de candados del 2026-09-21,
`20260921120000_candado_de_lider_caja_y_ajuste.sql`). `marcar_pedido_no_atendido_resuelto` solo recibe el id del pedido: no hay forma de saber a
qué ubicación pertenece sin leer la fila primero, así que el candado va DESPUÉS del `select ... for update` — mismo orden que ya usa
`liberar_apartado` (`20260920160000_apartar_stock.sql`) por la misma razón.

**7. Pantalla mínima, ruta nueva, fuera del menú.** `/pedidos-no-atendidos`: lista los pendientes de la sede de quien mira (con `resuelto = false`
primero) y un botón «Marcar resuelto» por fila. No está en `lib/menu.ts` — se abre solo por URL directa, a propósito, para poder probarla a mano sin
prometerle a nadie un flujo terminado. `menu.test.ts` no exige lo contrario: solo comprueba que TODA ruta que el árbol declara tenga página, nunca
que toda página esté en el árbol.

## DECIDÍ / DESCARTÉ / SE ROMPE SI

**DECIDÍ:** tabla nueva `pedidos_no_atendidos`, fuera del núcleo, con RLS por ubicación y dos RPC `security definer` como única puerta de
escritura.
**DESCARTÉ:** guardarlo como una nota dentro de `movimientos` (reutilizar el `nota` de un movimiento cualquiera). Costo concreto: un pedido no
atendido no mueve stock —no hay `variante_id` real cuando la clienta pidió algo fuera de catálogo—, y `movimientos` es append-only con un `tipo`
cerrado (ADR-0050); forzar un tipo nuevo ahí para algo que no afecta el conteo físico habría sido el mismo error que ADR-0141 ya evitó para
`apartados`.
**SE ROMPE SI:** con cientos de pedidos por sede al mes, alguien quiere reportar tendencias por talla/modelo sin que el índice parcial
(`ubicacion_id, created_at where resuelto = false`) ayude — ese día hace falta un índice adicional sobre `producto_id`/`talla`, no antes: hoy (3
tiendas, tráfico de mostrador) sería optimizar sin datos.

**DECIDÍ:** el candado es de ubicación (`fn_puede_operar_ubicacion`), no de rol (`fn_es_lider`).
**DESCARTÉ:** exigir líder, igual que cerrar caja o ajustar stock (D-13). Costo concreto: en una tienda con una sola persona en el mostrador en ese
momento, si no es líder, el dato simplemente no se anota — y ESE es justo el dato que D-79 quiere capturar siempre, no solo cuando hay una líder
presente.
**SE ROMPE SI:** el día que el aviso «llegó tu talla» (D-77) empiece a mandar mensajes reales a una clienta usando `clienta_id`, hay que revisar si
ESE paso (no este) necesita un candado más estricto — anotar el pedido y avisarle a la clienta son dos decisiones de negocio distintas.

**DECIDÍ:** `clienta_id uuid` sin FK, con el `alter table ... not valid` documentado en la migración para cuando `clientas` exista.
**DESCARTÉ:** esperar a que la otra tarea de `clientas` se fusione primero, y bloquear esta hasta entonces. Costo concreto: las dos tareas son de la
misma ronda y corren en paralelo por diseño (para no bloquearse una a otra); esperar habría significado que ninguna de las dos IDEAS DE CALIDAD DE
D-79 avance esta ronda.
**SE ROMPE SI:** alguien pega esta migración en producción, la de `clientas` llega semanas después, y nadie corre el `alter table ... not valid`
del comentario — la columna seguiría aceptando cualquier uuid sin verificar que exista una clienta real. No rompe nada hoy (nada la escribe todavía
salvo lo que la RPC recibe tal cual), pero es deuda explícita, no silenciosa.

## Cómo se pega en producción (lo hace Felipe o el arquitecto, DESPUÉS de revisar)

Un solo archivo: `supabase/migrations/20260922190000_pedidos_no_atendidos.sql`. Con el prefijo `retail.` agregado a mano en cada tabla (o
`set search_path to retail, public;` al principio) al pegarlo en el SQL Editor del proyecto `cayla-dynamic` — nunca en el archivo del repo. Es
re-ejecutable (`create table if not exists`, `create or replace function`).

Si para entonces `retail.clientas` ya existe en producción, agregar además:

```sql
alter table retail.pedidos_no_atendidos
  add constraint pedidos_no_atendidos_clienta_id_fkey
  foreign key (clienta_id) references retail.clientas (id) not valid;
alter table retail.pedidos_no_atendidos validate constraint pedidos_no_atendidos_clienta_id_fkey;
```

## Cómo lo verificas tú

- `pnpm pruebas:pedidos-no-atendidos` (Postgres local): registrar con producto de catálogo, registrar con descripción libre, falla si no viene
  ninguno de los dos, candado de ubicación, marcar resuelto y que no se pueda resolver dos veces.
- En el navegador: abrir `/pedidos-no-atendidos` con una sesión real — se ve la lista de pendientes de tu sede y el botón «Marcar resuelto» la
  saca de la lista.
- `pnpm typecheck` y `pnpm lint` en verde.

## Qué se rompería sin esto

Sin la tabla, D-79 no tiene dónde aterrizar: el aviso «llegó tu talla» y la señal de corte del Taller (las dos siguientes piezas que D-79 promete)
no tendrían de dónde leer «qué pidieron y no hubo». Sin el CHECK de la base, un bug futuro en la pantalla del mostrador podría dejar pedidos vacíos
que ensucien esa misma lectura más adelante.

## Lo que este ADR NO toca (queda para después, a propósito)

- El botón «no había esto» dentro de Vender/`PuntoDeVenta.tsx` — la tanda que junta los cambios del mostrador de esta ronda.
- El aviso «llegó tu talla» a la clienta (D-77) y la señal de qué cortar en el Taller — los dos consumidores futuros de esta tabla.
- La FK real de `clienta_id` — depende de que la tarea de `retail.clientas` de esta misma ronda se fusione y se aplique en producción.
