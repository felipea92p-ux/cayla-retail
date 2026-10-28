# ADR-0543 — Mis compras: candados de la auditoría 2026-10-27

- **Fecha:** 2026-10-27 · **Estado:** escrito en la rama `claude/audit-mis-compras-module-718e0f`; **la migración NO está en producción**:
  Felipe la pega cuando lo ordene (ver «Cómo se aplica a producción»). Migración: `supabase/migrations/20261027231000_mis_compras_auditoria_candados.sql`
  (una sola parte). Pruebas: `scripts/pruebas/compras_simple_plata.mjs` y `compras_simple_dia.mjs` (ya están en el CI; no se agregó ninguna nueva).
- **Relacionados:** ADR-0480 (Compras simple: Mis compras y Revisar compras), ADR-0195 (políticas y deadlocks: una migración de producción no
  mezcla `alter` de tablas en uso con políticas), ADR-0288 (lo que el SQL Editor agrega por su cuenta), ADR-0161 (módulos y roles),
  ADR-0362 (Fondos por rendir).

## El problema

Una auditoría de punta a punta de «Mis compras» (la compradora en el celular y «Revisar compras») encontró 24 hallazgos. Siete de ellos son
**candados abiertos en la base**: no son decisiones de negocio, son estados que el sistema no debería permitir (principio 2, «cero estados
inconsistentes») o permisos que quedaron a medias (el `revoke … from public, anon` que se olvidó de `authenticated`). Se corrigen aquí, de una
vez y sin tocar ninguna tabla ni dato. Lo demás espera la decisión de Felipe (sección «Pendiente de decisión»).

## Lo que se corrigió

| # | Qué estaba mal | Qué hace ahora | Dónde |
|---|---|---|---|
| **H1** (alta, dinero) | Confirmar plata crea una `entrega_fondo` y la guarda en `fondo_plata_anotada.movimiento_id`. Esa entrega salía en «Entregas y devoluciones» con «Anular», y `anular_movimiento_fondo` solo protegía a los cierres de ronda: quien tiene «Fondos por rendir» y no es dueña del fondo la anulaba. La anotada seguía «confirmada» sin movimiento y, como `movimiento_id` es único, no se podía volver a confirmar. | Un movimiento que una plata anotada tiene como suyo **no se anula aparte** (`P0001`, `movimiento_de_plata_anotada`, con un texto que explica qué hacer). La misma regla que ya tenían los cierres. **No se toca `fn_fondos_movimientos.puede_anular`**: `20261023143000` la parchó con un reemplazo anclado y volver a pegar esa migración (lo hace la prueba de Revisar compras) exige que su texto nuevo siga entero en la función; el botón «Anular» se sigue ofreciendo y la base lo rechaza con su frase (ocultarlo queda en el backlog). | `anular_movimiento_fondo(uuid,text)`, reemplazo anclado |
| **H2** (alta, dinero y permisos) | «Ya tenía plata» no sale de ningún banco: al confirmarla se fija `saldo_inicial` del fondo (hasta S/ 1 000 000) sin que se mueva nada ni se pida líder. | **Confirmar** una plata `ya_tenia` exige `fn_es_lider()` (la cuenta, no el responsable del combo): `42501`, `plata_ya_tenia_solo_lider`. La compradora sigue pudiendo **anotarla**; un reintento de lo ya confirmado devuelve lo mismo sin pedir líder. | `confirmar_plata_compras(uuid,numeric,uuid)`, reemplazo anclado |
| **H3** (media, permisos) | `fn_ronda_compras_texto(uuid)` y `fn_ronda_compras_de(uuid)` son `security definer` sin validar nada, y su `revoke` quitaba `public` y `anon` pero no `authenticated` (el permiso de fábrica, `0005_grants.sql`): cualquier cuenta leía por RPC la ronda, lo comprado y lo gastado de cualquier persona. | Se les quita `authenticated`. Nadie las llama desde la web (se verificó con grep en `apps/web`): las llaman `fn_mi_plata_compras`, `fn_revisar_compras` y `fn_mis_envios`, que son `security definer` y corren con el permiso de su dueño. Se sigue el patrón de sus hermanas. Las tres funciones de disparador de las rondas también. `abrir_ronda_compras` se revisó por el mismo hueco: **está bien** (valida `fn_ve_modulo('ordenes_compra')` y el responsable, y su `grant` a `authenticated` es explícito y a propósito); la prueba lo fija. | `revoke` |
| **H22** (baja) | `compra_item_recibido_antes` tenía RLS pero no el `revoke all … from anon, authenticated` de las otras tablas de Mis compras. | Se agrega. Solo la leen y escriben funciones `security definer` (se revisó cada lector). | `revoke` |
| **H11** (media-baja) | `terminar_dia_compras` y `abrir_ronda_compras` toman `compra_ronda:<persona>`; anotar una compra, un gasto o plata no. Una compra que entraba mientras la ronda se cerraba caía en la ronda recién cerrada, y el cierre ya había calculado «lo que tienes» sin ella. | Las tres toman el **mismo** candado, con la clave escrita en un solo lugar (`fn_ronda_compras_candado`). Orden: ronda primero, después el de cada operación (`compra_papel:`, `compra_gasto:`, `fondo:`); ninguna función que toma esos toma el de la ronda después, así que no hay ciclo. El que llega segundo espera; si la ronda ya se cerró, la base le dice «Abre tu ronda» en vez de meter la compra en la cerrada. | `registrar_compra_rapida` (la envoltura de 8 parámetros), `registrar_gasto_rapido`, `anotar_plata_compras` (5 parámetros) |
| **H14** (media-baja) | «Tenías al abrirla» se despeja de «tienes ahora» menos «te dieron». «Te dieron» sumaba lo anotado; «tienes» suma lo confirmado: si Compras confirmaba otro monto, la diferencia caía en «tenías». | «Te dieron» suma `coalesce(monto_confirmado, monto)`, en la ronda abierta de Mis compras y en el cuaderno de Revisar compras. `fn_mi_plata_tiene` no cambia (se verificó: lo confirmado ya entra por el saldo del fondo y lo por confirmar por lo anotado). | `fn_ronda_compras_de`, `fn_ronda_compras_cuenta` |
| **H10** (media) | `terminar_dia_compras` no era idempotente: si la respuesta se perdía y la ronda sí se cerraba, el segundo toque decía «No tienes una ronda abierta» y la pantalla «No se guardó». | Sin ronda abierta pero con una **cerrada hace menos de 2 minutos**, devuelve el resultado de ese cierre con las mismas claves de siempre (`decision`, `monto`, `fecha`, `ronda`) **más `ya_estaba: true`**; no escribe ni anota actividad otra vez. Pasados 2 minutos, el error de siempre. | `terminar_dia_compras(text)`, reemplazo anclado |

**La web tiene que seguir a la base** (lo hace otra parte del mismo trabajo, no esta migración): tratar `ya_estaba: true` como éxito, no como
error; mostrar los textos de `movimiento_de_plata_anotada` y `plata_ya_tenia_solo_lider`; y no ofrecer «Confirmar» de una plata «Ya tenía» a
quien no es líder.

## Por qué así

- **Reemplazos anclados, no `create or replace` con otro cuerpo.** Las ocho funciones tocadas ya tienen varias capas de migraciones encima
  (la ronda, el pago, el banco de la plata). Reescribirlas enteras desde una definición vieja habría pisado esas capas. Cada ancla se verificó
  contra la definición que resulta de aplicar, en orden, todas las migraciones del repo (por script: una aparición exacta de cada ancla), y
  ninguna se detiene si ya está hecha. Los inserts quedan DESPUÉS de las líneas que pegan las migraciones anteriores, para que volver a pegar
  una vieja siga encontrando su texto.
- **H1 sin excepción, ni para el líder.** Es la misma regla de los cierres. Hoy no hay forma de «deshacer» una plata confirmada (ver H5 abajo):
  que la lista ofreciera un «Anular» que la deja rota era peor que no ofrecer nada.
- **H2 solo en la confirmación.** La compradora ya anota «ya tenía» desde su celular (decisión de ADR-0480); lo que no debe poder hacer
  cualquiera con «Revisar compras» es fijar el saldo inicial de un fondo. El líder es el escalón que ya existe (ADR-0161); no se inventó otro.
- **H10 con 2 minutos.** Basta para un corte de red y un reintento, y no deja que un cierre de ayer se devuelva como si fuera de ahora.

## Descarté

- **H19** (el céntimo de redondeo de `completar_papel_compra` va en una sola unidad): repartirlo entre unidades cambia el costo con que
  ya entraron prendas a la tienda y exige reescribir un bloque grande de una función con tres capas encima. Sin Postgres a mano para
  probarlo, el riesgo no vale un céntimo por prenda. Queda como estaba.
- **H20** (los habituales usan `min(costo)` y la rama «comprado» no filtra `estado = 'activo'`): «el último costo» de un modelo no está
  definido cuando sus tallas cuestan distinto, y filtrar activos quita de la lista algo que la compradora sí compró. Es una decisión
  de negocio disfrazada de arreglo.
- **Cambiar `devolver_fondo`** para pedir líder en la devolución de plata «ya tenía»: queda como decisión de Felipe (la devolución sale
  del fondo hacia un banco que elige Compras; cambiarla afecta a todos los fondos, no solo a Mis compras).
- **Un `drop function` + `create function` o una política nueva** para el candado: habría mezclado `alter`/políticas con tablas en uso
  (ADR-0195). Todo es `create or replace`, `revoke` y reemplazos de funciones.

## Pendiente de decisión de Felipe (no se tocó nada)

- **H4** — el monto de un gasto («Gasté en otra cosa») no se puede editar después de anotarlo.
- **H5** — anular compras, gastos y plata anotados: hoy el estado `anulado` se lee en 8 funciones y nadie lo escribe; no hay forma de
  corregir una anotación equivocada (por eso H1 no ofrece alternativa más que avisar al líder).
- **H6** — restar de «tienes» lo ya devuelto sin recibir.
- **H7** — el monto del papel corregido hacia abajo por Compras.
- **H8** — el IGV de las facturas anotadas desde el celular.
- **H9** — la privacidad del depósito de los vouchers (`retail-gastos-viaje`, carpeta `plata/`).
- **H12** — poder cerrar la ronda con prendas sin mandar (hoy lo frena solo la pantalla).
- **H15, H18, H23, H24** — decisiones de negocio listadas en el informe de la auditoría (no se detallan aquí porque no cambian la base de
  esta migración).
- **`devolver_fondo` y «ya tenía»** (arriba), **H19** y **H20** (arriba).

## Cómo se aplica a producción

**Nada se pega sin que Felipe lo ordene.** Una sola parte, en el SQL Editor de producción, **después de `20261026174000`** (la última de Mis
compras): solo funciones, permisos y un `revoke` de tabla; ni `alter table`, ni políticas, ni `drop trigger`, así que no toma los candados de
`auth` y `storage` y no hay que partirla (ADR-0195). Lleva `set lock_timeout = '3s'` y es idempotente: se puede pegar dos veces. Cada reemplazo
anclado se detiene sin cambiar nada si la función en producción no es la esperada; si eso pasa, **no se «arregla» el ancla a ojo**: se regenera
desde la definición real (`pg_get_functiondef`).

Antes de pegar, mirar en producción (solo lectura) que existan las ocho funciones, y que `anular_movimiento_fondo` ya traiga la guarda de los
cierres (`20261023143000`). Después de pegar, verificar:

```sql
select has_function_privilege('authenticated', 'retail.fn_ronda_compras_de(uuid)', 'execute');      -- f
select has_function_privilege('authenticated', 'retail.fn_ronda_compras_texto(uuid)', 'execute');   -- f
select has_table_privilege('authenticated', 'retail.compra_item_recibido_antes', 'select');         -- f
select position('ya_estaba' in pg_get_functiondef('retail.terminar_dia_compras(text)'::regprocedure)) > 0;                   -- t
select position('movimiento_de_plata_anotada' in pg_get_functiondef('retail.anular_movimiento_fondo(uuid,text)'::regprocedure)) > 0;  -- t
select position('plata_ya_tenia_solo_lider' in pg_get_functiondef('retail.confirmar_plata_compras(uuid,numeric,uuid)'::regprocedure)) > 0;  -- t
```

Después, refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`): hay una función nueva, `fn_ronda_compras_candado(uuid)`. La web que
lee `ya_estaba` puede publicarse antes o después: sin la clave, el segundo toque sigue cayendo en el error de hoy.

## Cómo se ve mal hecho

Un `drop`/`create` de `anular_movimiento_fondo` desde una definición vieja (pisaría la guarda de los cierres y la de la rendición); un
`for update` en `terminar_dia_compras` en lugar del candado (no cubre la compra que entra: es otra fila); quitar el `revoke` de `authenticated`
porque «la web no llama a esas funciones directo»; o devolver `ya_estaba` sin mirar el tiempo (un cierre de hace una hora se vería como el de
ahora).

## Qué se probó y qué no

- **Probado sin base:** que cada ancla aparece exactamente una vez en la definición que resulta de aplicar, en orden, todas las migraciones
  del repo (script de simulación), que los ocho reemplazos son idempotentes, los candados de migraciones del repo (`migraciones:pg-temp`,
  `migraciones:sin-drop-trigger`, `migraciones:versiones`, la reserva) y las pruebas del CI que leen migraciones.
- **NO probado contra Postgres** (el contenedor de Docker no respondió): las pruebas nuevas de `compras_simple_plata.mjs` (H1, H2, H11) y
  `compras_simple_dia.mjs` (H3, H10, H11, H14, H22) están escritas y sin correr. Las corre el job «Pruebas de RPC contra Postgres» del CI;
  si alguna sale roja, es la primera que hay que mirar.
