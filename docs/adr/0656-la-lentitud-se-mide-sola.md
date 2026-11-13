# ADR-0656 — La lentitud se mide sola: el vigía de rendimiento en la base y el presupuesto de bloques en el CI

- **Fecha:** 2026-11-13 · **Estado:** PR #1821. `20261113194000_vigia_de_rendimiento.sql` **pegada en producción el 2026-11-13**
  (con la orden de Felipe) y verificada: el md5 de las dos funciones es el de la rama, y la primera foto dio `"ok": true`.
- **Nace de:** `/innovar` sobre «Cambiar de módulo tarda en cargar» (`docs/innovacion/2026-11-13-cambiar-de-modulo.md`), propuestas
  **cambiar-de-modulo#5** («Vigía de rendimiento en la base») y **cambiar-de-modulo#14** («Presupuesto de rendimiento en el CI»).
  Felipe las aprobó el 2026-11-13.
- **Relacionados:** ADR-0632 (el vigía diario de invariantes: el molde), ADR-0622 (rendimiento medido con un año de datos), ADR-0194
  (la prueba de carga), ADR-0381 (las tandas de Postgres en el CI), ADR-0648 (minutos de CI y de Vercel), ADR-0654 (el cronómetro del
  clic: cuánto espera la persona; este ADR mide qué le cuesta a la base).

## El problema

Cambiar de módulo tarda de 1 a 3 s, y la medición del 2026-11-13 mostró que lo lento es lo que hace cada consulta, no la máquina. Pero
esa medición se hizo pegando a mano `scripts/rendimiento/diagnostico-produccion.sql`, que muestra lo acumulado por `pg_stat_statements`
desde su último reinicio. Dos huecos:

1. **No hay historia.** El reinicio del cambio de plan borró todo lo anterior. Nadie puede decir «`fn_productos_facetas` tardaba 882 ms y
   desde el pegado de anoche tarda 140», ni ver que algo se volvió lento la semana pasada.
2. **Nada frena una función lenta antes de llegar.** ADR-0622 encontró 6 funciones de más de 8 s que llegaron a producción sin aviso. Una
   sesión puede volver correlativa a `fn_mis_modulos` sin querer: el PR sale verde y cada página carga 30 ms más.

## Decisión

### 1. El vigía (#5): una foto horaria de `pg_stat_statements`, con restas

DECIDÍ:
- **Tres tablas nuevas en `retail`:** `rendimiento_corridas` (una fila por foto, con el tramo que cubre), `rendimiento_fotos` (por función o
  tabla de retail y por rol: llamadas, ms total y media, filas, bloques compartidos y de disco) y `rendimiento_estado` (lo que decía
  `pg_stat_statements` en la foto anterior, consulta por consulta, para restar). RLS encendido sin políticas: solo se tocan por funciones
  `security definer`.
- **`fn_foto_rendimiento()` guarda DIFERENCIAS, nunca reinicia nada.** La base la comparte CAYLA Dynamic, que también mira
  `pg_stat_statements`: un `pg_stat_statements_reset()` nuestro le borraría su historia. Las restas se hacen **consulta por consulta**
  (`userid:queryid:toplevel`), no por nombre: `pg_stat_statements` tira las consultas poco usadas cuando se llena (en local había 4.983 de
  5.000 y 819 tiradas desde el reinicio), y una suma por nombre bajaría sola. Una consulta cuenta **entera** (no se resta) si: se arrancó
  de cero (no había foto anterior o `stats_reset` cambió), no estaba en la foto anterior, empezó a contar en otro momento (`stats_since`,
  Postgres 17) o tiene menos llamadas que antes.
- **Qué cuenta:** solo lo que pide una pantalla o un trabajo (`toplevel`), de los roles de las apps (no `postgres` —el SQL Editor y las
  migraciones— ni los `supabase_*`), y solo lo que lee o escribe (`select`, `with`, `insert`, `update`, `delete`, `call`): un
  `create or replace function retail.x(` no es una llamada a `x`. **El nombre:** la primera función de retail que llama la consulta (así
  llama PostgREST a una RPC) o, si no llama ninguna, la primera tabla de retail que lee o escribe (así lee Existencias el `stock` con sus
  embebidos). **Solo nombres y números**: el texto de la consulta nunca se guarda (la prueba lo comprueba sobre las columnas).
- **`ms_max` es un récord.** `pg_stat_statements` solo guarda el máximo desde que empezó a contar, así que el máximo de UNA hora no se
  puede saber. `ms_max` es el máximo nuevo de esa hora si alguna llamada superó todo lo anterior de su consulta, y queda vacío si no:
  lo que se guarda es exacto, y lo que no se sabe no se inventa.
- **El dueño lee las consultas de todos.** `postgres` es miembro de `pg_read_all_stats` (por `pg_monitor`). **Comprobado en local antes
  de construir:** dentro de la función, la llave de servicio ve las 4.983 consultas con su texto; directo, 4.981 ocultas
  («`<insufficient privilege>`»). La prueba lo vuelve a comprobar como control en cada corrida.
- **Un Vercel Cron cada hora, a los 7 minutos** (`/api/salud/rendimiento`, `CRON_SECRET`, llave de servicio), como el vigía de
  invariantes. Si una hora no corre, la foto siguiente cubre las dos (su `desde` lo dice) y no se pierde nada salvo que
  `pg_stat_statements` se reinicie en medio.
- **`fn_rendimiento_antes_despues(p_desde, p_nombre, p_ventana)`**: la media de ms y de bloques por llamada antes y después de un
  pegado, ponderada por llamadas, con 7 días a cada lado de fábrica. Una foto que cruza el momento del pegado no entra en ningún lado
  (mezclaría lo viejo con lo nuevo). Sin `p_nombre`, todas, de la que más le costó a la base hacia abajo. La lee el Admin, la llave de
  servicio o el SQL Editor.

DESCARTÉ:
- **GitHub Actions con la clave de la base** (como sugiere la documentación de muchos monitores): el repo es público y sus registros de
  Actions también (ADR-0632 ya lo descartó por lo mismo).
- **`pg_cron`:** el repo no lo usa y tres decisiones lo descartaron; la casa programa con Vercel Cron.
- **Guardar los acumulados y restar al leer:** con las consultas que `pg_stat_statements` tira y recrea, la resta por nombre da negativos
  o números chicos falsos. La resta tiene que hacerse al tomar la foto, consulta por consulta.
- **Guardar también lo que va dentro de una función** (`toplevel = false`): con `track = top` (lo que tiene la base) no existe, y si
  existiera contaría dos veces lo que ya está en el tiempo de la función que lo llama.
- **La lente «se volvió lenta» en el Observatorio**, en este PR: era opcional, y una pantalla nueva arrastra las reglas de interfaz del
  repo (`/milimetro`, `/formidable`, guía, modo oscuro). Primero que junte historia; la lente va en el backlog.

SE ROMPE SI: el trabajo programado deja de correr (se borra `CRON_SECRET`) y nadie lo nota, porque todavía no hay lente que diga «el vigía
no corre»; o Supabase cambia `pg_stat_statements.track` a `all` (las funciones anidadas aparecerían como llamadas propias de su nombre,
aunque siguen fuera porque no son `toplevel`); o alguien llama `pg_stat_statements_reset()` cada pocos minutos (la foto lo nota, pero
pierde lo de entre la última foto y el reinicio).

### 2. El presupuesto (#14): bloques leídos por función de entrada de módulo, en una tanda del CI

DECIDÍ:
- **Bloques, no milisegundos.** Los milisegundos cambian con la máquina y con lo ocupada que esté; los bloques de 8 kB que toca una
  consulta no. Una consulta que pierde su índice o se vuelve correlativa lee muchos más. La prueba de la mutación lo muestra: volver
  correlativa a `fn_mis_modulos` la llevó de 109 a 1.044 bloques y solo de 1 a 4 ms en ese volumen.
- **Un volumen chico, fijo y con forma de verdad** (`scripts/rendimiento/presupuesto-volumen.sql`): 3 tiendas (las 2 de la semilla y una
  más), 2.000 productos × 6 tallas-color = 12.000 variantes con código, su stock (todo en el piso, uno de cada cuatro también en el
  almacén) con su entrada en `movimientos`, ~3.000 ventas con líneas, pagos, boleta y salida, una caja por tienda y día, 1.500 clientes.
  Ids por `md5`, sin `random()`. **Las ventas van del primer día de hace dos meses al último del mes en curso**, aunque haya días que aún
  no llegan: así «este mes» siempre está lleno y «los últimos 30 días» siempre tienen 30 días, y lo que lee una función no cambia con el
  día del mes. Se carga con los disparadores apagados (como `scripts/carga/`) dentro de una transacción que se deshace, y se analiza con
  una muestra que cubre cada tabla entera (con la muestra al azar de siempre, el plan podría cambiar de una corrida a otra).
- **18 medidas:** las seis funciones del marco (`lib/persona-actual.ts`) como líder y como colaboradora, y `fn_productos_facetas`,
  `fn_productos_listado`, `fn_piso_plan_lectura`, `fn_resumen_variantes_json`, `fn_stock_por_sede_json` y `fn_resumen_finanzas` como el
  líder, con los parámetros con que entra la pantalla. Cada una se llama una vez para calentar y dos con `explain (analyze, buffers)`, y
  se queda el menor.
- **`vacuum` de toda la base antes de medir.** Un ROLLBACK no borra lo que insertó: las filas quedan muertas hasta el próximo vacuum, y la
  medida las leería. Medido: tres corridas seguidas sin vacuum daban 145 mil, 208 mil y 230 mil bloques para `fn_productos_facetas`, y
  `fn_mis_modulos` iba de 78 a 118 por lo que otras pruebas dejan en `rol_modulos`. Con el vacuum, tres corridas dan cifras idénticas.
  En el CI importa igual: las pruebas que corrieron antes en la misma tanda dejan filas muertas, y cuáles son cambia con el reparto.
- **Frena** si una función lee más del 25 % sobre su presupuesto y al menos 20 bloques más (por debajo es ruido de una función chica),
  si una falla, si una no tiene presupuesto o si sobra un presupuesto. **Leer mucho menos no frena:** avisa para aceptar el número nuevo
  y que la mejora quede protegida.
- **El presupuesto se acepta con un comando**, como `guias:huella`: `pnpm rendimiento:aceptar`. El bueno sale del CI, cuya base es limpia
  (migraciones + semilla): `pnpm rendimiento:aceptar -- --desde-ci <id de la corrida>` lo lee del registro. En local la base es compartida
  y suele tener productos de otras sesiones: ahí la comparación informa y no frena, y aceptar se niega salvo con `--forzar`.
- **Una prueba más en `PRUEBAS`** de `scripts/ci/pruebas-postgres.mjs` (`pnpm pruebas:presupuesto-rendimiento`), que el reparto pone en
  la tanda que va más corta. Su parte pura (qué frena, la forma del script, que mida las funciones que de verdad llama el marco) corre en
  `apps/web/lib/presupuesto-rendimiento.test.ts`.

DESCARTÉ:
- **Milisegundos con tolerancia:** en los runners de GitHub varían más del 25 % entre corridas; frenaría por ruido y se aprendería a
  ignorarlo.
- **El año de datos de `scripts/carga/` en cada PR:** minutos de CI por PR (ADR-0648) y una base aparte que el job no arma.
- **Una base aparte para medir (`create database … template postgres`)**: necesita que nadie esté conectado a `postgres`, y en el CI están
  PostgREST, Auth y Realtime; en local, las demás sesiones.

SE ROMPE SI: el volumen deja de reproducir la forma real (una función empieza a leer algo que el volumen no tiene: entonces su cifra es
chica y no protege); o una sesión cambia el marco (`persona-actual.ts`) y no actualiza `MEDIDAS` (la prueba de la web lo pide); o alguien
acepta un presupuesto más alto sin mirar por qué subió.

## Números

En local, con el volumen: las funciones del marco leen de 0 a 77 bloques; `fn_productos_listado` ~4 mil; `fn_stock_por_sede_json` ~3 mil;
`fn_resumen_finanzas` ~70 mil; `fn_piso_plan_lectura` ~90 mil; `fn_resumen_variantes_json` ~94 mil; `fn_productos_facetas` ~150 mil.
La prueba entera tarda ~6 s. El vigía: ~1.000 filas al día (las funciones y tablas usadas en cada hora), del orden de 40 MB al año; no se
borra nada (revisar al año: compactar a diario lo de más de 90 días).

## Lo construido

| Pieza | Archivo |
|---|---|
| Tablas y funciones del vigía | `supabase/migrations/20261113194000_vigia_de_rendimiento.sql` |
| Prueba en Postgres (23 casos, con control del permiso y mutación comprobada) | `scripts/pruebas/vigia_rendimiento.mjs`, `pnpm pruebas:vigia-rendimiento` |
| Trabajo programado | `apps/web/app/api/salud/rendimiento/route.ts`, `vercel.json`, `lib/rutas-cron.ts` |
| Lectura de la respuesta y prueba de la ruta | `apps/web/lib/vigia-rendimiento-reglas.ts`, `vigia-rendimiento-ruta.test.ts` |
| El presupuesto | `scripts/rendimiento/presupuesto.mjs`, `presupuesto-volumen.sql`, `presupuesto.json`; `pnpm pruebas:presupuesto-rendimiento`, `pnpm rendimiento:aceptar` |
| Su parte pura | `apps/web/lib/presupuesto-rendimiento.test.ts` |

## Cómo se pega (Felipe)

1. **Antes, solo lectura**, en el SQL Editor de cayla-dynamic: `select pg_has_role('postgres', 'pg_read_all_stats', 'member');` → `true`.
   Si sale `false`, no se pega: el vigía no podría leer el texto de las consultas de la web y no sabría de qué función son.
2. `20261113194000_vigia_de_rendimiento.sql` en UNA sola parte, el archivo entero. No tiene `create policy`, `drop trigger` ni `alter` de
   tablas en uso; trae su `set lock_timeout = '3s'`; todo con `retail.`; ningún `select … into` dentro de comillas simples. Se puede
   volver a pegar. Para deshacerla: `drop function` de `fn_foto_rendimiento` y `fn_rendimiento_antes_despues`, y `drop table` de
   `rendimiento_fotos`, `rendimiento_corridas` y `rendimiento_estado`.
3. **Verificar por efectos:** `select retail.fn_foto_rendimiento();` → `"ok": true` y `"arranco_de_cero": true` (la primera cubre desde
   el reinicio). Después la toma el cron cada hora.

## Cómo se lee

```sql
-- ¿Corre? Las últimas fotos y lo que cubrió cada una.
select id, hecha_en, desde, arranco_de_cero, consultas from retail.rendimiento_corridas order by id desc limit 5;

-- Lo que más le costó a la base en las últimas 24 h.
select nombre, tipo, rol, sum(llamadas) as llamadas, round(sum(ms_total) / sum(llamadas), 1) as ms_media, round(sum(ms_total)) as ms_total
  from retail.rendimiento_fotos where hasta > now() - interval '24 hours'
 group by 1, 2, 3 order by ms_total desc limit 20;

-- El antes y el después de un pegado (hora de Lima), de una función o de todas.
select * from retail.fn_rendimiento_antes_despues('2026-11-14 22:00-05', 'fn_productos_facetas');
select * from retail.fn_rendimiento_antes_despues('2026-11-14 22:00-05');
```

## Lo que queda

- La lente «se volvió lenta» y «el vigía no corre» en el Observatorio del Admin (con `/milimetro` y las demás reglas de interfaz).
- Entender por qué `fn_resumen_finanzas` lee en el CI unas 5 veces lo que lee en la base local (el presupuesto se aceptó del CI, corrida 43508089266).
- Compactar las fotos de más de 90 días cuando pasen de un año.
