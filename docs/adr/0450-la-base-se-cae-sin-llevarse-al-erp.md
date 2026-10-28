# ADR-0450 — Cuando la base se cae, el ERP espera y avisa; nadie sale de su sesión, y la tienda no puede dejar sin base al mostrador

- **Fecha:** 2026-10-17 · **Estado:** propuesto (el código y las pruebas están; **las dos migraciones están en producción desde el 2026-10-17 con el OK de Felipe**
  —`fn_salud` versión `20261017234815` y los topes versión `20261017234920`, registradas por `apply_migration` con la hora de aplicación— y varias piezas las enciende
  Felipe: ver «Lo que falta y es de Felipe»)
- **Relacionados:** ADR-0408 y ADR-0426 (la tienda online y sus frenos), ADR-0424 (Sentry), ADR-0425 (el Vigía de Vercel, de donde se copia el
  patrón del vigía), ADR-0149 (el loader), ADR-0410/0411 (un guardado sin respuesta), CLAUDE.md principio 9 («todo puede fallar»).

## El problema

El 17-oct la base de producción (el proyecto Supabase `cayla-dynamic`, donde vive el schema `retail`) dejó de responder y **todo el ERP sacó a
todos a la pantalla de entrada**. Hora de Lima, de los registros de Postgres y de Supavisor (`query_logs`):

| Hora | Qué dice el registro |
|---|---|
| 16:41 | `database system was not properly shut down; automatic recovery in progress` (última vez «arriba» confirmada: 16:29). Vuelve en 1 s. |
| 16:51 | Consultas canceladas por `statement timeout`: dos de la tienda (`fn_tienda_precios`, usuario `tienda_web_prod`) y una del ERP (`fn_resumen_variantes_json`, usuario `authenticator`). |
| 17:03 | Última línea que escriben Postgres, Auth y PostgREST. |
| 17:12 | Supavisor: `Connection failed {:error, :timeout}` y `ECHECKOUTFAILED` contra la base. Las consultas directas también dan timeout. |
| 17:23 | Otra recuperación automática (`not properly shut down`). |
| 17:32–17:33 | `received fast shutdown request` y arranque nuevo: alguien reinició o redimensionó el servidor. |
| 18:15 | Responde. Se mide `max_connections = 90` y `shared_buffers = 512MB` (un **Small**; antes, por ADR-0408, era un Micro de 60 conexiones). |

**Lo que NO se sabe: la causa de las dos caídas.** Ningún registro dice por qué: Postgres murió sin dejar un error (típico de un servidor al que se
le acaba la memoria, pero también de un fallo del lado de Supabase). La base pesa 110 MB: no es por datos. Lo que sí hay son tres sospechas con
evidencia parcial —consultas pesadas que ya rozaban su tiempo límite (el catálogo de la tienda llegó a 4,94 s de 5 s antes del arreglo de
`20261017171000`; `fn_resumen_variantes_json` se corta a los 8 s), un servidor chico compartido por tres sistemas (cajas, Dynamic, tienda) y el
tráfico nuevo de la tienda— y nada que separe unas de otras. Se averigua en el panel de Supabase, no en el código: ver el último apartado.

**Lo que SÍ se sabe, y es lo que este ADR arregla: por qué «nos sacó a todos» y por qué nadie se enteró.**

1. **El ERP leyó «la base no respondió» como «esta cuenta no tiene acceso».** `requirePersonaActualV2` hacía
   `if (error || !data || !data.ubicacion_id) redirect("/login?error=sin_persona")`: un error de red de `fn_persona_actual_resumen` caía en la misma
   rama que «no hay fila para esta cuenta». A todos los mandó al login con el aviso «Tu cuenta existe pero todavía no puede entrar a retail. Pide a un
   Líder que te dé de alta». Falso: la sesión seguía abierta y la cuenta seguía dada de alta.
2. **Lo mismo con la sesión.** `proxy.ts` hacía `haySesion = verificado?.claims != null`: si el access token vencía y renovarlo fallaba porque Auth
   no respondía, «no pude comprobar» se volvía «no hay sesión» y la persona iba al login. (La tienda ya distinguía los dos casos, `no_se`; el ERP no.)
3. **El login mentía.** Con Auth sin respuesta, cualquier error de `signInWithPassword` decía «Correo o contraseña incorrectos».
4. **Nadie lo preguntaba.** El único sondeo (`/auth/v1/health`, el de «Sin conexión») lo contesta el servicio de Auth sin tocar Postgres: siguió
   diciendo «bien» con la base muerta. Nos enteramos por las colaboradoras.

## Decisiones

**D1 — «La base no respondió» ya no es «sin acceso» ni «sin sesión».** `lib/base-caida-reglas.ts` (`esFalloDeLaBase`, `esFalloDeAuth`):
un `fetch` que no llegó (status 0), un 429, un 500 o más, o un código 08/53/57/`PGRST000-003` (conexión, sin recursos, consulta cancelada por tiempo, el pool
de PostgREST sin conexión) es la base caída; un permiso negado (42501), una función que falta o una consulta sin fila siguen siendo respuestas de la base y
**siguen fallando cerrado** (sin fila no se entra). Conectado en `persona-actual.ts` (las dos puertas de arriba), en `proxy.ts` (`noSePudoComprobar`) y en
el login. El destino es **`/sin-base`** (`app/sin-base/page.tsx`, `components/SinBase.tsx`): «No logramos conectar con el sistema. Tu sesión sigue
abierta…», pregunta a `/api/salud` cada vez más espaciado (8 s × 1,5 hasta 60 s, ±25 % al azar para que cien aparatos no preguntan a la vez cuando la
base está más frágil), no pregunta con la pestaña escondida, y cuando responde vuelve sola a la pantalla de la que salió (`x-cayla-ruta`, que anota el
proxy; solo rutas propias, nunca otra dirección). Una API recibe un 503 (no el 401 que significa «vuelve a entrar»); una acción de servidor sigue de
largo y falla con su propio aviso, sin perder lo escrito.

**D2 — «¿Responde la base?» tiene una respuesta honesta.** `retail.fn_salud()` (`20261017225000`): `select true`, estable, `security invoker`, para
`anon`/`authenticated`/`service_role`; prueba que un proceso de Postgres aceptó la conexión del pool y corrió una consulta. `GET /api/salud` del ERP
(pública, `lib/rutas-publicas.ts`, solo esa ruta y `/sin-base`) la llama por la llave pública, con tope de 4 s y la respuesta guardada 10 s por instancia; devuelve
`{ok:true}` o `503 {ok:false, motivo}` con un motivo de una lista fija (nunca el mensaje de la base). `GET /api/salud` de la tienda corre `select 1` por la
MISMA conexión de las páginas (`base()`): si la tienda ocupó todas las suyas, también lo dice.

**D3 — Un vigía que avisa.** `.github/workflows/vigia-salud.yml` + `scripts/ci/vigia-salud.mjs` (con sus pruebas): cada 5 min pregunta a las dos
direcciones (variables `URL_SALUD_ERP` y `URL_SALUD_TIENDA` del repo); una está caída solo si fallan 3 intentos a 20 s; abre el aviso «Base o tienda sin
responder (vigía de salud)» y deja la corrida en rojo **una vez** (mientras siga caída no repite), y cuando todo vuelve lo comenta y lo cierra. Copia el patrón
del Vigía de Vercel (ADR-0425). Es lo que se tiene sin abrir una cuenta; un monitor externo se suma (ver «Lo que falta»).

**D4 — La tienda no puede dejar sin conexiones al mostrador.** `20261017230000`: a todo usuario que entra y es miembro de `tienda_web` (hoy
`tienda_web_prod`) le pone `connection limit 20`, `statement_timeout 5s` (ya lo tenía, a mano; queda en el repo) e `idle_in_transaction_session_timeout 10s`.
**El 20 sale de una medición en producción** (18:15, sin tráfico): `tienda_web_prod` ya tenía 11 conexiones abiertas (el grupo de Supavisor en modo sesión
las mantiene), `authenticator` 16, el sistema ~12, de 90. Mi primer borrador decía 12 y habría dejado a la tienda en el borde desde el primer minuto.
La prueba `pnpm pruebas:base-resiliencia` encontró otro fallo del borrador: en Postgres 16+, quien crea un rol queda como miembro suyo; **`postgres` es miembro
de `tienda_web`** (con `admin_option`, sin heredar: verificado en producción) y el bucle le habría puesto el tope al administrador. Por eso solo toma
membresías que heredan y nunca a un superusuario ni a una lista de roles de Supabase y del ERP.

**D5 — El catálogo público en caché: auditado, ya estaba.** Se esperaba que la tienda consultara la base por cada visitante; no es así. Todas las lecturas
públicas (catálogo, ficha, portada, looks, tiendas, ayuda, beneficios del Club) pasan por `unstable_cache` + `"use cache"` y se comparten 30 s a 5 min entre
visitas e instancias (ADR-0426, `lib/catalogo-servidor.ts`, `lib/compartido-servidor.ts`); lo que toca la base por persona son las cuentas, la bolsa y
«Separar», que son lo que debe tocarla. Si la base cae con una copia guardada, el diseño de la caché de Next es servirla vieja mientras reintenta (**no se probó con una caída real**: entra
en la prueba de carga); con la caché fría y la base muerta, «no se pudo cargar» con reintento. No se cambió nada del catálogo. Lo que falta para escalar está en
«Plan de lanzamiento».

**D6 — El tamaño del servidor es decisión de Felipe y ya cambió.** El 17-oct a las 17:33 la base arrancó con 90 conexiones y 512 MB de `shared_buffers` (un
Small). No lo hizo este trabajo. Se deja escrito porque **cambia las cuentas de D4** y de «Plan de lanzamiento».

## Lo que se descartó

- **Otra pantalla de error / un `error.tsx` para la caída:** el error de una pantalla no sabe si la base cayó o si la consulta falló sola; la decisión se toma
  donde se lee la respuesta (`persona-actual.ts`, `proxy.ts`) y la pantalla es una sola, `/sin-base`.
- **Cambiar `sondearLaBase` (el de «Sin conexión») para que use `/api/salud`:** habría cambiado qué dice el aviso de arriba y cuándo (ADR-0210/0411), con pruebas y
  comportamientos que hoy funcionan. Queda anotado en el backlog; no era lo que se rompió.
- **Una función de `anon` que ya existe (`fn_club_textos_legales`) en vez de `fn_salud`:** funcionaría hoy sin migración, pero ata el sondeo a una pantalla del
  Club que mañana puede retirarse. Costo aceptado: hay que pegar una migración de una línea antes de encender el vigía.
- **La llave de servicio en una ruta pública** para leer una tabla: la llave más poderosa en la puerta más expuesta.
- **Tope por el pooler solamente (Supavisor):** se configura en el panel, no queda en el repo ni lo prueba el CI, y no protege de una conexión directa.
- **Guardar la última copia buena del catálogo en la memoria de cada instancia** para servirla cuando la base cae: la caché de datos debería ya servirla vieja
  mientras reintenta; agregarlo era una segunda capa sin una caída medida que la justifique. Si la prueba de carga muestra que no lo hace, se agrega.
- **Subir el `statement_timeout` de la tienda:** el 15-oct se vio qué pasa (una página que tarda 24 s en vez de fallar).

## Cómo se verifica

- `pnpm --filter web test` (560 archivos): `base-caida-reglas.test.ts` (reglas), `persona-actual-base-caida.test.ts` (corre `requirePersonaActualV2` de verdad con la base
  y Next de mentira: 8 casos, la caída espera y lo que sí es «sin acceso» sigue siéndolo), `base-caida-cableado.test.ts` (que siga conectado: proxy, persona, login),
  `salud-reglas.test.ts`, `rutas-publicas.test.ts`. **Comprobado quitando la corrección:** sin ella, 4 de esas pruebas fallan (la base caída manda a `/login?error=sin_persona`).
- `pnpm --filter tienda test` (`salud.test.ts`, `candados.test.ts`), `pnpm typecheck`, `pnpm lint`, `pnpm knip`, `pnpm knip:produccion`.
- `pnpm pruebas:base-resiliencia` (13 comprobaciones contra el Postgres local: `fn_salud` y los topes, sin tocar a nadie más, idempotentes, sin usuario no fallan).
- `node --test scripts/ci/vigia-salud.test.mjs` (14).
- **En el navegador (2026-10-17, ERP local):** con la URL de Supabase apuntando a un puerto muerto y una cookie de sesión vencida, `GET /caja?dia=…` responde 307 a
  `/sin-base?desde=%2Fcaja%3Fdia%3D…`; `GET /api/aterrizaje` responde 503 con `codigo: base_no_responde` y `Retry-After`; `/login` con esa sesión no redirige; `/api/salud`
  responde `503 {"ok":false,"motivo":"no_responde"}` en 0,15 s. Con la base viva y `fn_salud` aplicada (temporal, ya quitada del Postgres local): `/api/salud` → `200 {"ok":true}` en 79 ms, y
  `/sin-base?desde=/caja` vuelve solo a `/caja`.

## En producción (2026-10-17, con el OK de Felipe) y lo que falta

**Hecho.** (1) `retail.fn_salud()` (`20261017225000`, versión registrada `20261017234815`): comprobada por dentro (estable, `security invoker`, `search_path` vacío, `select true`, solo
`anon`/`authenticated`/`service_role`, ninguna por «PUBLIC», una sola firma) y por fuera: `POST /rest/v1/rpc/fn_salud` con la llave pública responde `true`, HTTP 200. (2) Los topes
(`20261017230000`, versión `20261017234920`): `tienda_web_prod` quedó con `connection limit 20`, `statement_timeout=5s` e `idle_in_transaction_session_timeout=10s`; `postgres`, `authenticator`,
`authenticated`, `anon`, `service_role`, `supabase_admin` y `tienda_web` siguen exactamente igual; la tienda tenía 13 conexiones y sigue respondiendo (`/inicio` 200). La migración se
pegó con el texto final del archivo (la cabecera dice que se pegó). No se pegó nada más.

**Falta, de Felipe, en este orden:**

1. ~~Pegar `20261017225000_fn_salud.sql`~~ — hecho (arriba). La web que la llama entra con el PR; **fusionarlo** es el siguiente paso, y las rutas `/api/salud` y `/sin-base` salen con él.
3. **Poner las dos variables del repo** (Settings ▸ Secrets and variables ▸ Actions ▸ pestaña **Variables**): `URL_SALUD_ERP` (la ruta del ERP terminada en `/api/salud`) y
   `URL_SALUD_TIENDA` (`https://tienda.cayla.pe/api/salud`). Sin ellas el vigía no hace nada. Probar con Actions ▸ Vigía de salud ▸ Run workflow (con «ensayo»).
4. ~~Pegar `20261017230000_tienda_web_topes_de_conexion.sql`~~ — hecho (arriba). Queda **ajustar el 20 con datos**: `select usename, count(*) from pg_stat_activity group by 1 order by 2 desc` en
   un día normal y durante la prueba de carga (hoy la tienda usa ~13 y el ERP, por PostgREST, llegó a 31 con 62 de 90 en total).
5. **Una regla en Sentry** (no hay forma de hacerla desde el código): Alerts ▸ Create alert ▸ Issues ▸ «Failed to fetch» con `message contains vovjyyiafkxteijimpuy.supabase.co`,
   «más de 10 eventos en 5 minutos» → correo a Felipe. Es la forma de enterarse desde el lado de las personas.
6. **Un monitor externo** (UptimeRobot, Better Stack o similar; su plan gratis alcanza) sobre las dos direcciones `/api/salud`, cada minuto, con aviso al teléfono. GitHub puede atrasar
   un trabajo programado varios minutos y no manda mensajes al celular.
7. **Averiguar la causa:** panel de Supabase ▸ Reports ▸ Database, entre 16:30 y 17:35 del 17-oct: CPU, memoria, **«Disk IO % consumed»** (los servidores chicos tienen un presupuesto de IO que se
   agota y los vuelve lentos hasta que se caen) y conexiones por rol; y preguntarle a soporte de Supabase por el reinicio de las 16:41 y las 17:23 (ellos ven si fue memoria o su hardware).
8. **Dynamic** (`cayla-dynamic`, otro repositorio) comparte la base y casi seguro tiene el mismo problema de «te saca al login»; este trabajo no lo toca.

## Plan de lanzamiento: elasticidad cuando la tienda se abra a todas las clientas

Primero, lo que hay que decir con franqueza: **una base Postgres no se estira sola.** La elasticidad real se construye poniendo, delante de ella, capas que absorban
el pico y topes que decidan quién espera. Hoy el ERP, Dynamic y la tienda comparten UNA base de 90 conexiones: lo que más protege al mostrador no es un servidor más grande
sino que lo público nunca llegue hasta ella. En orden de lo que más gana:

**Antes de abrir (imprescindible)**

1. **La prueba de carga de noche, con las tiendas cerradas** (ya aprobada por Felipe en ADR-0408). Subir de 10 a 100 y a 300 visitantes simultáneos sobre portada, catálogo y ficha, **a la vez que alguien opera
   Vender y Caja en el ERP**: lo que se mide es la interferencia. Pasa si: p95 < 1,5 s, cero errores, CPU de la base < 60 %, `tienda_web_prod` por debajo de su tope, y las ventas del ERP no se enlentecen.
   Con Supabase ▸ Reports abierto en otra pantalla.
2. **Topes puestos y medidos** (D4) y el aviso de caída encendido (D3 y los puntos 5–6 de arriba). Sin eso, el lanzamiento se vive a ciegas.
3. **Lanzar en olas, no de golpe.** Un WhatsApp a las ~100 primeras del Club, esperar una hora mirando los números, luego 300, luego todas; nunca un mensaje a toda la lista, y no en la hora
   punta de las cajas. Una campaña masiva de una sola vez es el pico que ningún tamaño de servidor absorbe sin avisar.
4. **Un interruptor de «tienda en pausa»** que muestre una página fija sin tocar la base (mantenimiento), para apagarla en un segundo si algo sale mal, sin depender de que la base conteste.
   Verificar si Configuración ▸ Tienda web ya lo tiene; si no, es lo primero que se pide.
5. **El captcha (D10 de ADR-0426) antes de abrir «Crear mi cuenta»**: es la puerta que manda correos y consulta el DNI, la que un robot castiga primero. Felipe crea la cuenta de Cloudflare Turnstile.
6. **Reglas de límite por dirección en Vercel Firewall** sobre `/entrar`, `/crear-cuenta`, `/auth/*` y `/api/*` (y el filtro de robots que trae), para que un robot no le cueste conexiones a la base.
7. **Sentry en la tienda** (hoy solo lo tiene el ERP, ADR-0424) y las mediciones de Vercel: sin ellos no se ve qué le pasa a una clienta en su celular.

**Para que de verdad se estire (decisiones de arquitectura, de Felipe)**

8. **Que lo público no toque la base del ERP.** Publicar el catálogo como una copia (un archivo por tienda en Vercel Blob/Storage o en el proyecto de clientes), regenerada cada 1–5 min o cuando cambia la
   Vitrina; la tienda se arma desde esa copia y la base solo recibe lo que de verdad es de una persona: crear cuenta, bolsa, «Separar». Con eso, mirar el catálogo cuesta 0 consultas sea cual sea el
   tráfico. Es la medida de mayor efecto; la desventaja (precio y stock con 1–5 min de atraso al mirar) ya se aceptó a 30 s, y «Separar» vuelve a revisar en la base.
9. **El modelo de conexiones.** Hoy la tienda usa el pooler en **modo sesión** (5432), donde cada conexión del cliente ocupa una de la base mientras dura: el techo es el tamaño del grupo (11 ya abiertas sin
   tráfico). El **modo transacción** (6543) multiplica ese techo; ADR-0408 midió que con `postgres.js` 5 de 10 consultas se colgaban. Vale una prueba con el driver `pg` (`max: 1` por instancia) dentro de la
   prueba de carga: si funciona, es la mayor ganancia de concurrencia sin pagar más.
10. **Separar los dos mundos si crece:** una réplica de lectura (según el plan y el tamaño del servidor: confirmarlo en Supabase) para el catálogo, o un proyecto Supabase propio de la tienda, con el ERP publicándole su catálogo. Solo si 8 no alcanza.
11. **Que el servidor tenga margen:** Small hoy; Medium (más memoria y CPU dedicada) si la prueba de carga pasa de ~60 % de CPU, y copias con recuperación a un punto en el tiempo (PITR) antes de abrir: una caída
    sin aviso debe perder segundos, no horas (confirma si el plan y el tamaño actuales la permiten).
12. **Colas para lo que escribe en un pico:** si un lanzamiento hace que 200 personas aparten la misma prenda a la vez, «Separar» ya es una función corta con candado de fila; vigilar con el vigía y con
    `pg_stat_activity` esa noche. Si hiciera falta, una cola (a pedido) con «estás en la fila» antes que un error.

## Lo que sigue (backlog de este ADR)

`docs/backlog/2026-10-17-sistema-no-funciona-1cbb6e.md`: refrescar el diccionario de datos cuando `fn_salud` esté en producción; el `fn_resumen_variantes_json` que pasa de 8 s (la única
consulta del ERP vista en los cortes de las 16:51); el ruido de Sentry por `Failed to fetch` del auth del navegador mientras la base está caída; `sondearLaBase`.
