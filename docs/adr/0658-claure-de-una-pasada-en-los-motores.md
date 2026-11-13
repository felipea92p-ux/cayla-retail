# ADR-0658 — CLAURE se pregunta de una pasada en el plan del piso y el plan de compra (y no se guarda lo vendido por día)

- **Fecha:** 2026-11-13 · **Estado:** construido en la rama `claude/claure-de-una-pasada`. Migración `20261113201000` **pegada en producción el 2026-11-13** (con el OK de Felipe; verificación de solo lectura: `true | true | true | 0`).
- **Nace de:** la propuesta `cambiar-de-modulo#13` del informe `/innovar` del 2026-11-13 («Lo vendido por prenda, sede y día, guardado»), aprobada por
  Felipe con la condición de no cambiar el uso. Al medirla antes de construirla, la causa resultó ser otra. La sesión que coordina la tanda eligió este
  camino con estas cifras: es técnico y cumple la misma condición.
- **Relacionados:** ADR-0560 y ADR-0583 (la regla de CLAURE, `fn_item_es_de_claure`), ADR-0622 (rendimiento medido con un año de datos; el candado
  md5), ADR-0633 (la foto del diario, el molde que #13 quería repetir), ADR-0377 (familias fuera de los motores), ADR-0194 (la copia con un año sintético).

## El problema

En producción (`pg_stat_statements`, 2026-11-13), el plan del piso tarda 908 ms de media (hasta 2,8 s) y el plan de compra 2,3 s. La propuesta #13
suponía que lo caro era recorrer las ventas en cada carga, y proponía guardarlas por prenda, sede y día con la mecánica de ADR-0633: una tabla
`ventas_por_dia` con disparadores que vencen días, un Vercel Cron que los rehace y el día de hoy en vivo.

**Medido antes de construir** sobre una copia de `main` con el año sintético de `pnpm carga:preparar`: 6 tiendas, 24.000 tallas por sede, 131.000
ventas y 263.000 líneas. Una tienda se ligó a CLAURE, como LIM en producción; en la copia de fábrica ninguna sede es de CLAURE y la pregunta sale
gratis. Se midió como líder, con RLS, con la mediana de 5 a 7 corridas intercaladas:

| Función | Hoy | Sin ninguna demanda (el techo de la tabla) |
|---|---|---|
| `fn_piso_plan_lectura`, sede de CLAURE | 613–658 ms | 378 ms |
| `fn_piso_plan_lectura`, sede sin CLAURE | 429–458 ms | 385 ms |
| `fn_plan_compra` | 1.378–1.436 ms | — |

- **El plan del piso lee solo 14 días.** Aunque no leyera ni una venta seguiría tardando ~380 ms: lo caro es armar las ~24.000 tallas de la sede
  (stock, foto y un `jsonb_agg` que se derrama a disco). La tabla le ganaría como mucho 40–50 ms.
- **Lo que pesa es `fn_item_es_de_claure` línea por línea.** Los dos motores la preguntan una vez por cada línea de venta, en todas las sedes,
  aunque solo una vende de CLAURE. Es `security definer` con `set search_path`, así que no se pliega en la consulta. Por dentro, `fn_dueno_de_la_linea`
  busca la salida de la línea en `movimientos`. El plan de compra lo hace en tres ventanas (90 días, 30 días y la campaña) sobre toda la red: en la
  copia, la de 90 días tarda 841 ms con la pregunta y 47 ms sin ella.
- **Los motores no cuentan igual.** El piso solo cuenta las ventas de tienda, resta cambios y devoluciones con tope en 0 por línea, saca la
  cuarentena liquidada y corta por día de Lima. El plan de compra cuenta todo, de cualquier canal, y corta por hora exacta (`now() - 90 días`). Una
  tabla por día no reproduce el corte por hora exacta sin calcular en vivo el día del borde, ni el tope por línea sin guardar una cifra por motor.

## Decisión

DECIDÍ: preguntar CLAURE **de una pasada**, sin tabla.

1. **`retail.fn_lineas_de_claure(desde, hasta, sede)`**: las líneas de CLAURE de una ventana, de una sede si se pide.
   - Primero junta SOLO las líneas de las sedes donde opera CLAURE, desde el día de arranque de su cuenta. A esas les pregunta el dueño con
     `fn_dueno_de_la_linea`, la misma función de siempre: la regla del dueño sigue en un solo lugar.
   - Las condiciones de sede y de fecha son la parte barata de `fn_item_es_de_claure`, escrita para muchas líneas a la vez.
   - `pnpm pruebas:lineas-de-claure` exige que las dos marquen las mismas líneas.
   - El paso que junta las líneas va `materialized`. Sin él, el planificador buscaba el dueño de las 263.000 líneas antes de filtrar: 2,2 millones de
     bloques.
   - `security definer`, sin permiso para la web (`anon` y `authenticated` no la ejecutan); solo la llaman los motores.
2. **Los dos motores cambian una sola línea por consulta.** `and not retail.fn_item_es_de_claure(vi.id, …)` pasa a
   `and vi.id not in (select … fn_lineas_de_claure(<la misma ventana>))`, con reemplazos anclados:
   - 1 en `fn_piso_plan_lectura`, con la sede, así que una sede sin CLAURE no pregunta nada;
   - 6 en `fn_plan_compra`.

   Cada ancla es un bloque exacto que dejó `20261029041000`, y `sqlDeshacer` (`scripts/pruebas/_deshacer_claure.mjs`) lo sabe deshacer.
3. **Candado md5 del cuerpo vivo, como ADR-0622.** Antes de tocar nada, cada función tiene que tener el cuerpo de `main` o el de este archivo; si no,
   aborta y dice cuál. Al final comprueba el md5 nuevo, que no quede ninguna llamada por línea y que la web no pueda llamar al ayudante.

DESCARTÉ:
- **La tabla `ventas_por_dia` (#13 como se aprobó):**
  - le gana al plan del piso como mucho ~40–50 ms, porque sin demanda la función ya tarda ~380 ms;
  - pide una tabla, disparadores en las tablas del mostrador, un Cron, una invariante y una cifra guardada por motor;
  - el corte por hora exacta del plan de compra la obligaría a calcular en vivo el día del borde.

  Queda para cuando el volumen la justifique, con estas cifras como punto de partida.
- **Copiar la regla del dueño dentro de la consulta** (la `coalesce` de `fn_dueno_de_la_linea`, como hizo ADR-0622 en `fn_vendido_por_empresa`):
  el plan de compra bajaba a 271 ms en vez de 311, pero la regla quedaba escrita en dos lugares. 40 ms no pagan ese riesgo.
- **Preguntarle a `fn_item_es_de_claure` entera por cada candidata:** la regla quedaba en un solo lugar, pero leía 145.000 bloques en ~390 ms contra
  37.000 en ~30 ms. Su `CASE` vuelve a buscar la sede en cada llamada.
- **Llevarlo a `fn_resumen_variantes_json`** (Inventario ▸ Resumen, 1,3 s): no lee ventas por día ni pregunta CLAURE por línea. Su costo es recorrer el
  libro de `movimientos` para los días con stock (ADR-0194 #8). Es otro problema.

SE ROMPE SI: `fn_item_es_de_claure` cambia su regla de sede o de fecha y nadie cambia el ayudante. Lo ataja `pruebas:lineas-de-claure`, que compara
las dos línea por línea. Si un motor nuevo lee muchas líneas de venta, usa el ayudante, no la pregunta por línea.

## Resultado (misma copia, mismo medidor, antes → después)

| Función | Antes | Después | Bloques leídos |
|---|---|---|---|
| `fn_plan_compra` (la campaña vigente) | 1.378–1.438 ms | 283–299 ms | 437.000 → 120.000 |
| `fn_plan_compra` (una campaña con ventas dentro) | ~2.040 ms | ~355 ms | 619.000 → 167.000 |
| `fn_piso_plan_lectura`, sede de CLAURE | 631 ms | 443 ms | 246.000 → 177.000 |
| `fn_piso_plan_lectura`, sede sin CLAURE | 418 ms | 407 ms | 171.000 → 168.000 |

Los bloques no dependen de la carga de la máquina. Los milisegundos sí: había otras sesiones midiendo y vale la proporción. En producción la
diferencia debería ser mayor, porque `20261101004000` midió allá hasta 100 veces más por llamada a una función `security definer`.

**Lo que sigue lento en el plan del piso** (las tallas de la sede, ~380 ms en la copia) no se toca aquí. El informe de `/innovar` ya lo derivó a la
pantalla: leer el plan del piso aparte con `<Suspense>` en Existencias.

## Cómo se comprobó

- **Salida idéntica (md5)**, función nueva contra la vieja guardada con otro nombre, en la copia de un año. Se sembró dueño por la salida del libro
  en las dos direcciones (590 movimientos) y una campaña con ventas dentro. Coinciden las 7 sedes del plan del piso y las 3 llamadas del plan de
  compra: la campaña vigente, `null` y la campaña con pasado.
- **Línea por línea**: el ayudante y `fn_item_es_de_claure` marcan las mismas líneas en 14 días, 30 días, 90 días, un año y el borde del día de
  arranque (442, 693, 693, 693 y 26 líneas, ninguna distinta).
- **`pnpm pruebas:lineas-de-claure`** (nueva, en el CI). Arma una escena con:
  - un ticket mixto, ventas antes y después del arranque, el borde del día de arranque a las 00:30 y la víspera a las 23:30;
  - una sede sin CLAURE;
  - dueño por la salida del libro en las dos direcciones;
  - una devolución, un cambio, una anotada pendiente, una regularizada y una venta anulada.

  Exige:
  - las mismas líneas en seis ventanas, y las de CLAURE con nombre;
  - el mismo md5 del plan del piso, en dos sedes, y del plan de compra, con el cambio y sin él (se deshace dentro de la transacción);
  - el control: sin CLAURE ligada a la sede, la salida cambia;
  - que la web no pueda llamar al ayudante y que la migración se pueda repegar.

  Se probó que atrapa un ayudante roto: sin la condición de la fecha de arranque, 4 de 7 casos salen en rojo.
- **Las pruebas que reaplican migraciones viejas sobre estas funciones** pasan con la migración aplicada (28 en total, entre ellas
  `motores-familias-apagadas`, `piso-plan`, `plan-compra*`, `claure-*` y `ventas-online-motores`). `claure-analisis-y-motores` ahora deshace esta
  migración antes de reaplicar `20261029041000`, igual que ya hacía con `20261104032000`.
- Se midió y probó en dos bases propias (`cayla_carga_vpd`, `cayla_vpd_pruebas`), nunca en la base `postgres` compartida.

## Cómo se pega en producción (lo hace Felipe)

1. **Una sola ejecución** de `supabase/migrations/20261113201000_claure_de_una_pasada_en_los_motores.sql` en el SQL Editor, con el texto entero.
   - Lleva una función nueva y dos `create or replace` por reemplazo anclado: sin tablas, políticas ni disparadores, así que no puede trabarse con
     la tienda (CLAUDE.md «Políticas y deadlocks»).
   - No depende de la web: se puede pegar antes o después de publicar.
   - Termina con «QUEDÓ BIEN».
   - Si el candado dice «tiene otro cuerpo en esta base», producción tiene otra versión de esa función: no se pega y se regenera desde la definición
     real.
   **Antes de pegar (solo lectura, opcional):** dice si el candado va a pasar. Tiene que dar `e573216a8ea3c47ee8fabd97d5c46619 | ff74d5a95a47e6858862666261812198 | true`:
   ```sql
   set transaction read only;
   select
     (select md5(prosrc) from pg_proc where oid = 'retail.fn_piso_plan_lectura(uuid)'::regprocedure) as piso_md5,
     (select md5(prosrc) from pg_proc where oid = 'retail.fn_plan_compra(uuid)'::regprocedure) as plan_md5,
     to_regprocedure('retail.fn_lineas_de_claure(timestamptz, timestamptz, uuid)') is null as ayudante_no_existe;
   ```
2. **Verificación de solo lectura después de pegar.** No pide sesión de líder. En una ventana de 90 días, las líneas que marca `fn_item_es_de_claure`
   y las que devuelve el ayudante tienen que ser las mismas. Tiene que dar `true | true | true | 0 | <cuántas líneas de CLAURE hubo en 90 días>`:
   ```sql
   set transaction read only;
   select
     (select md5(prosrc) from pg_proc where oid = 'retail.fn_piso_plan_lectura(uuid)'::regprocedure) = '9d9c96979c6a92f2b34f57e3563ffc66' as piso_ok,
     (select md5(prosrc) from pg_proc where oid = 'retail.fn_plan_compra(uuid)'::regprocedure) = 'b43d6631b4b0ff469ddf371d498772d2' as plan_ok,
     not has_function_privilege('authenticated', 'retail.fn_lineas_de_claure(timestamptz, timestamptz, uuid)', 'execute') as web_sin_permiso,
     (select count(*) from (
        (select vi.id from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
          where v.created_at >= now() - interval '90 days' and v.created_at < now()
            and retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
         except select l from retail.fn_lineas_de_claure(now() - interval '90 days', now()) l)
        union all
        (select l from retail.fn_lineas_de_claure(now() - interval '90 days', now()) l
         except select vi.id from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
          where v.created_at >= now() - interval '90 days' and v.created_at < now()
            and retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at))) x) as lineas_distintas,
     (select count(*) from retail.fn_lineas_de_claure(now() - interval '90 days', now())) as lineas_de_claure_90_dias;
   ```
3. Un día después, `pg_stat_statements`: la media de `fn_plan_compra` y de `fn_piso_plan_lectura` contra las de 2026-11-13 (2,3 s y 908 ms).
4. **Para volver atrás:** `node -e "import('./scripts/pruebas/_deshacer_claure.mjs').then(m => console.log(m.sqlDeshacer('20261113201000_claure_de_una_pasada_en_los_motores.sql', ['retail.fn_piso_plan_lectura(uuid)', 'retail.fn_plan_compra(uuid)'])))"`
   imprime el SQL que aplica los 7 reemplazos al revés. El ayudante puede quedarse: sin uso no cuesta nada.
