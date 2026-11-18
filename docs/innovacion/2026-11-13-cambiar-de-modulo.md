# Innovar · Cambiar de módulo tarda en cargar — 2026-11-13

- **Alcance:** la navegación entre módulos del ERP (Existencias, Productos, Vender, Finanzas, Inicio…) · **Modo:** profundo
- **SHA analizado:** `2139ab7e8` (origin/main; avanzó a `9dfd8167a` durante la corrida sin tocar los archivos verificados) · **Radar usado:** 2026-11-13
- **Corrieron:** miradas A B C D + escéptico, con medición en producción (solo lectura) antes de empezar
- **Resultado:** 20 propuestas (16 Ahora · 4 Visión) · 15 fusionadas en otras · 2 descartadas · 2 derivadas · 3 que se les escaparon a las miradas y encontró el escéptico

## Qué es y qué problema resuelve hoy

Cuando una vendedora o la encargada toca otro módulo del menú, la pantalla nueva tarda de 1 a 3 segundos o más. Desde ADR-0628, el clic se ve
al instante (un esqueleto con el nombre del módulo), pero eso no hace más rápido el módulo. Felipe subió el plan de Supabase y siguió igual.
**La medición de hoy explica por qué:**
- La base lee el 100 % desde memoria y de 120 conexiones solo 2 están trabajando.
- El plan Medium, según la documentación de Supabase, sigue siendo CPU compartida: compra memoria, no núcleos.
- Lo lento es **lo que hace cada consulta**, no la falta de máquina.

## Lo medido (pg_stat_statements, ~22 h desde el reinicio del 2026-11-12 17:16 UTC; Postgres 17.6)

| Qué | Media | Dónde |
|---|---|---|
| Lectura de `stock` con todo el catálogo embebido (PostgREST, por páginas de 1.000) | 716 ms | Existencias, Traslados, Bajar al piso, Cuadrar |
| `fn_productos_facetas` · `fn_productos_listado` · `fn_productos_posibles_duplicados` | 882 · 716 · 501 ms | Catálogo ▸ Productos |
| `fn_piso_plan_lectura` | 908 ms (máx 2,8 s) | Inventario, plan del piso |
| `fn_resumen_variantes_json` | 1,3 s | Inventario ▸ Resumen |
| `fn_resumen_finanzas` | 4,5 s (máx 6,9 s) | Finanzas ▸ Resumen |
| `fn_plan_compra` | 2,3 s | Compras |
| Las 6 RPC de identidad del marco (`fn_mis_modulos` 34 ms la mayor) | 7–34 ms c/u | cada render del servidor |
| `campanas_firma` (sondeo de precios cada 10 s por pestaña) | 21 ms | es la RPC más llamada |
| `tienda_catalogo` · `tienda_probador` (tienda web, **la misma base**) | 470 · 728 ms | es lo que más tiempo total le cuesta a la base |

## Ahora — lo que se construye con el stack de hoy

| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| cambiar-de-modulo#1 | Encender la foto del diario que ya está en producción | Felipe | ADR-0633 (propio) | 4 | S | Media | 2,8 |
| cambiar-de-modulo#2 | El tamaño del cómputo, decidido con datos (Medium compra memoria, no CPU) | Felipe | Supabase, cómputo | 3 | S | Media | 2,1 |
| cambiar-de-modulo#3 | La copia del catálogo no se tira con cada publicación | vendedora | Next.js, llaves de caché | 3 | S | Media | 2,1 |
| cambiar-de-modulo#4 | Stock delgado + catálogo ya guardado: Existencias sin la lectura de 716 ms | vendedora, encargada | Next.js 16.4, «extract and pass» | 4 | M | Alta | 2,0 |
| cambiar-de-modulo#5 | Vigía de rendimiento: una foto horaria de pg_stat_statements y el antes/después de cada pegado | Felipe | Supabase pg_stat_statements | 4 | M | Alta | 2,0 |
| cambiar-de-modulo#6 | El cronómetro del clic: cuánto tarda cada módulo, en cada sede | Felipe | Next.js instrumentation-client | 5 | M | Media | 1,75 |
| cambiar-de-modulo#7 | El menú trae el módulo mientras el mouse se posa sobre él | todos | Vercel v0 con Next 16.4, instant.page | 2 | S | Media | 1,4 |
| cambiar-de-modulo#8 | Una sola pieza «copia por versión» para vocabularios y Productos | encargada, Felipe | Next.js partial prefetching | 4 | M | Media | 1,4 |
| cambiar-de-modulo#9 | Las reglas por fila, en una forma que Postgres pueda meter en la consulta | todos | PostgreSQL, inlining | 4 | L | Alta | 1,33 |
| cambiar-de-modulo#10 | «¿Dónde más hay?» se pregunta al abrir la prenda, no al entrar | vendedora, encargada | Shopify POS | 3 | M | Media | 1,05 |
| cambiar-de-modulo#11 | La tienda web rearma su catálogo solo si algo cambió | cliente, vendedora | HTTP ETag (RFC 9110) | 3 | M | Media | 1,05 |
| cambiar-de-modulo#12 | Existencias en vivo parcha cantidades en vez de rehacer la pantalla | encargada | Next.js router.refresh | 3 | M | Media | 1,05 |
| cambiar-de-modulo#13 | Lo vendido por prenda, sede y día, guardado para los motores | encargada, Felipe | Citus, tablas de resumen | 4 | L | Media | 0,93 |
| cambiar-de-modulo#14 | Presupuesto de rendimiento en el CI: bloques leídos por RPC | Felipe | RegreSQL, pgsql-hackers | 4 | L | Media | 0,93 |
| cambiar-de-modulo#15 | «Quién eres» una vez por sesión, no por clic ni por precarga | vendedora, encargada | Next.js, sesión en el shell | 2 | M | Media | 0,7 |
| cambiar-de-modulo#16 | La foto del diario también por día dentro del mes en curso | Felipe | Citus, agregación incremental | 2 | M | Baja | 0,4 |

## Visión — las apuestas grandes

| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| cambiar-de-modulo#17 | Avisos de la base en vez de sondeos cada 10 s (Broadcast from Database) | vendedora | Supabase Realtime | 2 | M | Media | 0,7 |
| cambiar-de-modulo#18 | Reabrir Cache Components con Partial Prefetching, ruta por ruta | todos | Next.js 16.4 | 4 | XL | Media | 0,56 |
| cambiar-de-modulo#19 | Vender abre con el catálogo de la tienda ya en el equipo (IndexedDB) | vendedora | Lightspeed, Shopify POS | 4 | XL | Media | 0,56 |
| cambiar-de-modulo#20 | La identidad viaja en el token (Custom Access Token Hook) | todos | Supabase Auth hooks | 4 | XL | Baja | 0,32 |

## Detalle de cada propuesta

### cambiar-de-modulo#1 · Encender la foto del diario que ya está en producción · Ahora · 4 · S · Media
- **Hoy:** ADR-0633 construyó la foto del diario por mes y está pegada en producción, con sus disparadores y su Vercel Cron. Pero el interruptor
  `usar_foto_diario` nació en `false` (`supabase/migrations/20261109182000_foto_del_diario_leer.sql:23`) y el paso «Encender el interruptor» sigue
  sin marcar (`docs/backlog/2026-11-09-foto-del-diario-cb64df.md:11`). Por eso `fn_resumen_finanzas` sigue en 4,5 s.
- **Propuesta:** cumplir las dos condiciones que el propio ADR fijó (una reconstrucción con rehechas > 0 y una corrida del vigía con INV-29
  limpia), encender el interruptor y medir con el log `finanzas_resumen_ms` (`lib/resumen-finanzas.ts:59`). Volver atrás = apagarlo, sin migración.
- **El momento que mejora:** Felipe abre Finanzas ▸ Resumen a fin de mes mientras las tiendas venden; los meses cerrados se leen guardados.
- **Cómo lo hacen los mejores:** es una decisión propia ya aprobada (ADR-0633, 2026-11-09).
- **DECIDÍ** encender lo ya construido antes de construir algo encima (#16) · **DESCARTÉ** la foto por día primero: construye sobre algo que no se usa
  · **SE ROMPE SI** una tabla nueva alimenta el diario sin su disparador `diario_vence`: la foto sirve una cifra vieja hasta las 4:00 (INV-29 lo detecta).
- **Primer paso:** solo lectura en producción: `select usar_foto_diario from retail.parametros_finanzas` y el último log de `finanzas_foto_diario`.
- ⚠ Toca lo delicado (cifras de dinero): espera el OK de Felipe.
- **Veredicto del escéptico:** la encontró él; ninguna mirada la vio.

### cambiar-de-modulo#2 · El tamaño del cómputo, decidido con datos · Ahora · 3 · S · Media
- **Hoy:** se subió el cómputo pensando en la velocidad. El máximo de 120 conexiones corresponde a Medium. Las lecturas salen 100 % de memoria.
- **Propuesta:** escribir la regla en el backlog de ADR-0622 («Tamaño del cómputo»):
  1. Medium, como Small, es CPU compartida: compró memoria, no velocidad.
  2. No subir a Large (CPU dedicada) mientras las 5 funciones más caras sigan como están.
  3. Una vez arregladas, con 14 días del vigía (#5), evaluar si se puede volver a Small.
- **El momento que mejora:** fin de mes, cuando llega el cargo de Supabase: se decide con una cifra y no «por si acaso».
- **Cómo lo hacen los mejores:** Supabase: «hasta Medium, CPU compartida; desde Large, vCPU dedicadas» ([fuente](https://supabase.com/docs/guides/platform/compute-and-disk), consultada 2026-11-13).
- **DECIDÍ** quedarse en el tamaño actual hasta arreglar las consultas · **DESCARTÉ** bajar ya: el pico de memoria del 2026-11-09 cortó funciones
  de Finanzas · **SE ROMPE SI** se vuelve a Small con la foto del diario apagada y la primera carga de Finanzas en un día de cierre manda la base a swap.
- **Primer paso:** Felipe confirma en Supabase ▸ Settings ▸ Compute el tamaño actual y mira Reports ▸ Database (CPU y memoria de las últimas 24 h).
- **Veredicto del escéptico:** se queda con cambios (fuente verificada).

### cambiar-de-modulo#3 · La copia del catálogo no se tira con cada publicación · Ahora · 3 · S · Media
- **Hoy:** `getCatalogo` guarda el catálogo con la llave `[versión de la base, VERCEL_GIT_COMMIT_SHA]` (`apps/web/lib/catalogo-v2.ts:100`). Se
  publica ~6 veces por hora (ADR-0422): cada publicación vacía la copia y la primera visita de cada sede lee el catálogo entero en vivo.
- **Propuesta:** cambiar el commit por una «versión de forma» (una constante que sube solo cuando cambia `VarianteCatalogo` o su `select`),
  con una prueba que falle si cambia el select sin subirla. Y un log de acierto/fallo de la copia.
- **El momento que mejora:** la primera vendedora que abre Vender después de cada publicación deja de esperar el catálogo entero.
- **Cómo lo hacen los mejores:** llaves de caché por forma de dato, no por versión del código (Next.js `unstable_cache`; sin fuente verificada en esta corrida).
- **DECIDÍ** versión de forma explícita con prueba · **DESCARTÉ** quitar el commit sin más: una copia con la forma vieja rompería Vender (por eso se
  puso) · **SE ROMPE SI** alguien agrega un campo y no sube la versión: la prueba debe comparar la forma contra la constante.
- **Primer paso:** un log `catalogo_copia` con acierto/fallo durante una semana.
- **Veredicto del escéptico:** la encontró él. Es la base de #4, #8 y #19.

### cambiar-de-modulo#4 · Stock delgado + catálogo ya guardado · Ahora · 4 · M · Alta
- **Hoy:** `getStockPorUbicacion` (`apps/web/lib/inventario-v2.ts:94-130`) pide el stock con variante, talla, color, producto, categoría, fotos y
  códigos de barras embebidos, por páginas (`lib/resultado.ts:90`): 716 ms de media. Cada página rearma los embebidos y la RLS de 8 tablas.
- **Propuesta:** «cantidades frescas ⨝ descripción guardada». Por un lado, la lectura delgada que ya usa la caja (`getDisponibleEnSede`,
  `inventario-v2.ts:196`, 111 ms medidos); por otro, `getCatalogo()`. Se unen en memoria por `variante_id` y `FilaStock` no cambia de forma.
  Si una variante con stock no está en la copia, se lee en vivo solo esa. Llega a Existencias, Traslados ▸ Nuevo, Bajar al piso, Cuadrar y
  `/api/conteo/prendas`.
- **El momento que mejora:** la encargada de AQP entra a Existencias para ver si queda la blusa en M antes de pedirla a Lima.
- **Cómo lo hacen los mejores:** Next.js 16.4, «extract and pass»: separar lo que cambia por petición de lo que se guarda
  ([fuente](https://nextjs.org/docs/app/guides/optimizing-prefetching), 2026-10-06). El patrón ya funciona en la caja: «de ~0,9 s a ~0,2 s, medido 2026-09-23».
- **DECIDÍ** reusar la copia por versión y leer fresco solo las cantidades · **DESCARTÉ** cachear la lectura pesada con la huella de stock como
  llave: cambia con cada venta y metería cantidades en una caché compartida · **SE ROMPE SI** la copia se vacía en cada publicación (#3 va antes).
- **Primer paso:** una rama con la unión y una prueba que compara fila por fila la salida vieja y la nueva contra la base local.
- ⚠ Toca lo delicado (lee stock, no lo escribe): espera el OK de Felipe.
- **Veredicto del escéptico:** se queda con cambios. Absorbe a la propuesta C4, que hacía lo mismo desde la base con una RPC única: queda como
  alternativa si la unión en memoria no basta.

### cambiar-de-modulo#5 · Vigía de rendimiento en la base · Ahora · 4 · M · Alta
- **Hoy:** `scripts/rendimiento/diagnostico-produccion.sql` se pega a mano y muestra solo lo acumulado desde el último reinicio. El reinicio del
  cambio de plan borró todo lo anterior: no hay historia para comparar.
- **Propuesta:** el molde de ADR-0632.
  - Tabla `retail.rendimiento_fotos` con fecha, función, llamadas, ms y bloques.
  - `retail.fn_foto_rendimiento()` `security definer`, llamada por un Vercel Cron cada hora; guarda **diferencias** contra la foto anterior y no
    resetea nada, porque la base la comparte Dynamic.
  - Una lente «se volvió lenta» en el Observatorio y el antes/después de cada pegado.
- **El momento que mejora:** Felipe pega una migración a las 10 p. m. y al día siguiente ve «882 → 140 ms desde el pegado».
- **Cómo lo hacen los mejores:** Supabase recomienda `pg_stat_statements` e `index_advisor` ([fuente](https://supabase.com/docs/guides/database/extensions/pg_stat_statements), consultada 2026-11-13).
- **DECIDÍ** foto horaria de diferencias, disparada como el vigía de invariantes · **DESCARTÉ** GitHub Actions con la clave de la base: ADR-0632
  ya lo descartó (repo público) · **SE ROMPE SI** el dueño de la función no puede leer `pg_stat_statements` de otros roles (se comprueba primero).
- **Primer paso:** en local, la consulta 1 del diagnóstico dentro de una función `security definer`, para confirmar el permiso.
- **Veredicto del escéptico:** se queda tal cual.

### cambiar-de-modulo#6 · El cronómetro del clic · Ahora · 5 · M · Media
- **Hoy:** nadie mide cuánto tarda cambiar de módulo desde la silla de la vendedora. `apps/web/instrumentation-client.ts:27-29` exporta
  `onRouterTransitionStart` vacío; las cifras de ADR-0628 salieron a mano. El rastreo de Sentry está apagado (`lib/errores-reglas.ts:120`).
- **Propuesta:** en tres pasos.
  - **Paso 0:** ordenar hoy las rutas por duración en Vercel Observability, que ya las mide.
  - **Paso 1:** llenar el gancho con `experimental.instrumentationClientRouterTransitionEvents` (Next 16.3+, entrega la ruta como patrón y no
    lleva datos de nadie). El fin se marca cuando se desmonta `EsqueletoPantalla`. Se registra `{ruta, ms}` como ya se hace con `finanzas_resumen_ms`.
  - **Paso 2:** guardarlo por hora en la base y verlo en el Observatorio como «p75 por módulo y sede», con un tope por módulo.
- **El momento que mejora:** sábado 7 p. m. en AQP, «el sistema está lento»: Felipe ve si es Existencias, el wifi o la base.
- **Cómo lo hacen los mejores:** Next.js instrumentation-client ([fuente](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client), 2026-07-28).
  Speed Insights mide LCP, no «hasta que llegó el módulo», y su desglose por ruta es de pago.
- **DECIDÍ** medición propia con el gancho de Next y el esqueleto de ADR-0628 · **DESCARTÉ** solo Speed Insights · **SE ROMPE SI** una pantalla no
  usa `EsqueletoPantalla` y la medición nunca cierra (lleva tope de 15 s, como ADR-0628).
- **Primer paso:** el paso 0, hoy mismo, sin código.
- ↻ Las trazas de servidor de Sentry (fase posterior) cambian ADR-0424; el cronómetro del navegador no.
- **Veredicto del escéptico:** se queda con cambios. Absorbe a A10, D2, D4 y D8.

### cambiar-de-modulo#7 · El menú trae el módulo mientras el mouse se posa sobre él · Ahora · 2 · S · Media
- **Hoy:** las filas del menú son `<Link>` sin `prefetch` (`components/AppShell.tsx:372, 425, 632`). Como no hay Cache Components, Next solo
  precarga hasta el esqueleto: el viaje al servidor empieza con el clic.
- **Propuesta:** una fila que recibe el mouse 65 ms o más, el foco o `pointerdown` pasa a `prefetch={true}`, con el destino ya armado por
  `hrefConSedeYMes` (`AppShell.tsx:223`). Una sola precarga en curso, solo filas del menú, y `staleTimes.static: 30`.
- **El momento que mejora:** mientras la mano lleva el mouse a «Existencias», la pantalla ya se está armando.
- **Cómo lo hacen los mejores:** v0 con Next 16.4, precarga por intención ([fuente](https://nextjs.org/blog/improving-navigation-experience-in-v0-with-nextjs-16-4), 2026-10-16); instant.page.
- **DECIDÍ** precargar por intención y solo el menú · **DESCARTÉ** precargar todo lo visible: ~20 filas × (6 RPC + módulo), y v0 vio 2,9× más peticiones
  · **SE ROMPE SI** la precarga usa otra URL que el clic (sin `?sede=&mes=`) y la base paga el módulo dos veces.
- **Primer paso:** solo en Caja, medido con #6.
- **Veredicto del escéptico:** se queda con cambios. Ahorra ~0,3 s; rinde más después de #4. Absorbe a B5 y A9.

### cambiar-de-modulo#8 · Una sola pieza «copia por versión» · Ahora · 4 · M · Media
- **Hoy:** la copia por versión vive solo en `getCatalogo`. Los vocabularios se leen en vivo en cada visita, en decenas de lugares (categorías 27,
  colores 17, familias 15, marcas 12…), a ~48 ms cada select. Productos paga en cada entrada facetas (882 ms) y duplicados (501 ms).
- **Propuesta:** sacar `lib/copia-por-version.ts` (`copiaPorVersion(nombre, llaves, leer)`). La llave es siempre lo que la base dice que cambió,
  más cada dato de la cuenta que la función lee. Empezar por `fn_productos_posibles_duplicados` y los vocabularios.
- **El momento que mejora:** Felipe entra a Productos tres veces en la mañana; la segunda y la tercera no recalculan los parecidos.
- **Cómo lo hacen los mejores:** Next.js 16.4 ([fuente](https://nextjs.org/docs/app/guides/adopting-partial-prefetching), 2026-10-06).
- **DECIDÍ** que la llave la dé la base · **DESCARTÉ** `revalidateTag` al guardar (lo del backlog de ADR-0622): 231 archivos llaman `.rpc()` desde el
  navegador, más el SQL Editor y Dynamic; esa etiqueta nunca se invalidaría · **SE ROMPE SI** la llave no lleva la sede o «ve dinero» y una cuenta
  ve una cifra de otra.
- **Primer paso:** guardar los duplicados con la llave de versión y medir el acierto una semana.
- **Veredicto del escéptico:** se queda con cambios. `fn_catalogo_version` no cubre familias, tejidos ni patrones, y las facetas dependen del stock
  de la red (acertarán poco en horario de tienda). Absorbe a C6.

### cambiar-de-modulo#9 · Reglas por fila que Postgres pueda meter en la consulta · Ahora · 4 · L · Alta
- **Hoy:** casi toda función de retail lleva `security definer` y `set search_path`, y Postgres no puede meter esas funciones dentro de una
  consulta: las ejecuta aparte, una vez por fila. El repo ya lo midió tres veces en producción, con mejoras de 13× a 100×
  (`20261101004000`, `20261031161000`, `20261030170000`). `fn_mis_modulos` llama a `fn_es_lider` y `fn_mi_rol_id` por cada módulo.
- **Propuesta:** dos capas, escritas una vez y vigiladas en el CI.
  - La **puerta** (la que llama la web) sigue `security definer`.
  - La **regla** (lo que se evalúa por fila) es SQL `stable`, sin esos ajustes, con nombres calificados.
  - Un vigía del CI revisa `pg_proc`.
- **El momento que mejora:** antes de que llegue una prenda, la base ya gastó 30–50 ms en decidir qué módulos ves.
- **Cómo lo hacen los mejores:** PostgreSQL, inlining de funciones SQL ([fuente](https://wiki.postgresql.org/wiki/Inlining_of_SQL_functions), consultada 2026-11-13); guía de RLS de Supabase.
- **DECIDÍ** convención + vigía, porque el patrón se escapó tres veces arreglándolo a mano · **DESCARTÉ** quitar `security definer` en masa · **SE ROMPE SI**
  una regla sin definer lee `public.personas` de Dynamic y responde «sin acceso» a toda la tienda.
- **Primer paso:** en una transacción de solo lectura, una `fn_mis_modulos` en `pg_temp` que calcule la identidad una vez, comparando tiempo y salida.
- ⚠ Toca permisos: espera el OK de Felipe.
- **Veredicto del escéptico:** se queda con cambios. Cita el ítem del backlog de ADR-0622 sobre `fn_item_es_de_claure`.

### cambiar-de-modulo#10 · «¿Dónde más hay?» al abrir la prenda · Ahora · 3 · M · Media
- **Hoy:** Vender (`app/(app)/vender/page.tsx:77`) y Existencias (`lib/inventario-v2.ts:293`) traen el stock de toda la red al entrar
  (`fn_stock_por_sede_json`, 223 ms, máximo 549).
- **Propuesta:** la red se pregunta al abrir el detalle de la prenda, con `x-espera: no`, y se guarda mientras la pantalla está abierta.
- **El momento que mejora:** al abrir la caja nadie pregunta por otras sedes; la pregunta llega cuando un cliente pide una talla que no hay.
- **Cómo lo hacen los mejores:** Shopify POS muestra el stock de otras ubicaciones en el detalle del producto ([fuente](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/inventory-management/products/searching-for-products)).
- **DECIDÍ** la pregunta bajo demanda · **DESCARTÉ** seguir trayéndola y achicarla en la base · **SE ROMPE SI** un filtro de Existencias usa la red
  sin abrir prenda (revisar con `grep -rn enRed`).
- ⚠ Toca stock (lectura): ya está en «Decisiones de Felipe» del backlog de ADR-0622 (ADR-0194 #7).
- **Veredicto del escéptico:** se queda tal cual.

### cambiar-de-modulo#11 · La tienda web rearma su catálogo solo si algo cambió · Ahora · 3 · M · Media
- **Hoy:** `apps/tienda/lib/catalogo-servidor.ts:10-28` guarda `tienda_catalogo` 30 s por sede y lo vuelve a pedir aunque nada haya cambiado:
  es lo que más CPU total le cuesta a la base que comparte con el ERP.
- **Propuesta:** `retail.tienda_catalogo_version(p_sede)`, una huella corta que reúne:
  - el último cambio de stock de las sedes web;
  - `campanas_firma`, que ya existe;
  - un número de versión de catálogo y precios que sube con un disparador;
  - la hora de inicio o fin de la próxima campaña.
  El catálogo pesado se rearma solo si la huella cambió.
- **El momento que mejora:** sábado al mediodía, la base deja de rearmar el catálogo web dos veces por minuto y le queda CPU a la caja.
- **Cómo lo hacen los mejores:** validación condicional HTTP (ETag, RFC 9110).
- **DECIDÍ** una huella que se compara, no una copia que se guarda: respeta el descarte de `20261031161000` · **DESCARTÉ** una réplica de lectura:
  cuesta otra máquina y la consulta sigue siendo de 470 ms · **SE ROMPE SI** una campaña empieza a una hora fija sin escribir nada y la huella no la ve.
- **Primer paso:** solo lectura, contar cuántas veces por hora habría cambiado la huella la semana pasada. Si es más de ~60/h, no vale el riesgo.
- ⚠ Toca precios: espera el OK de Felipe.
- **Veredicto del escéptico:** se queda con cambios. Absorbe a B7 y D6.

### cambiar-de-modulo#12 · Existencias en vivo parcha cantidades · Ahora · 3 · M · Media
- **Hoy:** desde ADR-0603, `components/InventarioPanel.tsx:311` usa `useRefrescoEnVivo`. Cada venta, reposición o ajuste de otra caja de la sede
  llama a `router.refresh()` (`lib/useRefrescoEnVivo.ts:35`), que rehace toda la pantalla en el servidor: unos 3 s de base cada vez.
- **Propuesta:** al llegar el aviso, releer solo las cantidades (la lectura delgada de #4) y parchar las filas en memoria; `router.refresh()`
  queda para cuando cambia el catálogo.
- **El momento que mejora:** sábado en TRU, Existencias abierta en el almacén mientras el mostrador vende una prenda por minuto.
- **DECIDÍ** parchar en el cliente · **DESCARTÉ** juntar más los refrescos: cada uno sigue costando la pantalla entera · **SE ROMPE SI** el cambio no
  es una cantidad (una talla nueva): ese caso cae al refresco de hoy.
- **Primer paso:** un log `existencias_refresco_en_vivo` para contar los refrescos por hora y sede.
- **Veredicto del escéptico:** la encontró él.

### cambiar-de-modulo#13 · Lo vendido por prenda, sede y día, guardado · Ahora · 4 · L · Media
- **Hoy:** el plan del piso (908 ms), el plan de compra (2,3 s), Inventario ▸ Resumen (1,3 s) y la demanda de Productos recorren las ventas
  línea por línea en cada carga y preguntan en cada una si es de CLAURE.
- **Propuesta:** `retail.ventas_por_dia` (variante, sede, día, unidades). Los días cerrados se guardan con la mecánica de ADR-0633 y el día de
  hoy se calcula en vivo; la venta del mostrador no escribe nada extra. El interruptor de familia (ADR-0377) se aplica al leer, no al guardar.
- **El momento que mejora:** la encargada abre el plan del piso a las 9 a. m. y no espera hasta 3 s.
- **Cómo lo hacen los mejores:** tablas de resumen incrementales ([Citus](https://www.citusdata.com/blog/2018/06/14/scalable-incremental-data-aggregation/), 2018).
- **DECIDÍ** días cerrados guardados + hoy en vivo · **DESCARTÉ** un disparador por línea vendida: suma una escritura a `registrar_venta` · **SE ROMPE SI**
  el interruptor de la familia queda congelado en la tabla.
- **Primer paso:** en `cayla_carga`, reescribir solo la demanda de `fn_piso_plan_lectura` y comparar por md5 con la función viva.
- ⚠ Toca stock y motores: espera el OK de Felipe.

### cambiar-de-modulo#14 · Presupuesto de rendimiento en el CI · Ahora · 4 · L · Media
- **Hoy:** ninguna prueba del CI mide rendimiento. ADR-0622 encontró 6 funciones de más de 8 s que llegaron a producción sin aviso.
- **Propuesta:** `scripts/rendimiento/presupuesto.mjs` + `presupuesto.json` en una tanda propia de `scripts/ci/pruebas-postgres.mjs`. Sobre un
  volumen chico, con semilla y forma real, mide los **bloques leídos** de cada RPC de entrada de módulo, con 25 % de tolerancia. El presupuesto
  se acepta con un comando, como `guias:huella`.
- **El momento que mejora:** una sesión vuelve correlativa a `fn_mis_modulos` sin querer y el PR sale rojo antes de sumar 30 ms a cada página.
- **Cómo lo hacen los mejores:** RegreSQL ([fuente](https://boringsql.com/posts/regresql-testing-queries/), 2026).
- **DECIDÍ** bloques, no milisegundos (los runners varían) · **DESCARTÉ** la carga de un año en cada PR (minutos de CI, ADR-0648) · **SE ROMPE SI** el
  volumen chico no reproduce la forma real.

### cambiar-de-modulo#15 · «Quién eres» una vez por sesión · Ahora · 2 · M · Media
- **Hoy:** `requirePersonaActualV2` (`lib/persona-actual.ts:133-138`) hace 6 RPC en cada petición. La pagan los `layout.tsx` de 54 de los 60
  módulos y cada precarga de un enlace del menú.
- **Propuesta:**
  1. `retail.fn_mi_sesion()` con las 6 respuestas en una, calculando la identidad una vez (ya en el backlog de ADR-0622).
  2. Solo con OK de Felipe, guardarla 60 s por sesión.
  3. Solo si un EXPLAIN confirma que los ~48 ms de un SELECT chico son la identidad, resolverla una vez por petición.
- **El momento que mejora:** de Vender a Existencias diez veces en una tarde: ~40–60 ms menos cada vez y ~38.000 llamadas al día menos.
- **DECIDÍ** 60 s de vida, porque el candado real sigue en cada RPC · **DESCARTÉ** una cookie firmada · **SE ROMPE SI** a una integrante le quitan un
  módulo y lo sigue viendo 60 s en el menú (la RPC que guarda la frena igual).
- ⚠ Toca permisos: espera el OK de Felipe.
- **Veredicto del escéptico:** baja a impacto 2. Es el peaje, no el plato fuerte: Next no rehace el layout compartido al navegar. Absorbe a C2 y a la parte de `fn_mis_modulos` de C1.

### cambiar-de-modulo#16 · La foto del diario también por día · Ahora · 2 · M · Baja
- **Propuesta:** extender ADR-0633 a los días ya terminados del mes en curso; solo las reglas aditivas por día.
- **Primer paso:** después de #1, medir. Si `fn_resumen_finanzas` baja de 1 s, esta no hace falta.
- ↻ Cambia ADR-0633 punto 1 («el mes en curso nunca tiene foto»). ⚠ Dinero. Absorbe a A8.

### cambiar-de-modulo#17 · Avisos de la base en vez de sondeos · Visión · 2 · M · Media
- **Hoy:** `components/PreciosEnVivo.tsx` pregunta cada 10 s por pestaña (`campanas_firma` es la RPC más llamada) y `useStockEnVivo` igual en
  Vender, Cambios y Apartados.
- **Propuesta:** un disparador por sentencia avisa por Broadcast a un tema privado por sede, y el sondeo queda como respaldo cada 60 s.
- **Cómo lo hacen los mejores:** Supabase Broadcast from Database ([fuente](https://supabase.com/docs/guides/realtime/broadcast)).
- ↻ Cambia el alcance que Felipe cerró en ADR-0603 (solo Punto de venta, Existencias y Caja). **SE ROMPE SI** se toca la publicación compartida con
  Dynamic sin identidad de réplica (el incidente de ADR-0603).

### cambiar-de-modulo#18 · Reabrir Cache Components con Partial Prefetching · Visión · 4 · XL · Media
- **Hoy:** ADR-0028 lo archivó porque el menú depende del rol y el build fallaba.
- **El argumento nuevo** (Next 16.4, [fuente](https://nextjs.org/docs/app/guides/adopting-partial-prefetching), 2026-10-06):
  - lo que sale de `cookies()` entra al App Shell por sesión;
  - una ruta bloqueada pasa a ser aviso de desarrollo, no error de build;
  - `export const instant = false` deja una ruta como hoy.
  - Next 17 lo hará obligatorio, y `apps/tienda` ya lo usa (ADR-0432).
- **Propuesta:** encender con todas las rutas en `instant = false` y adoptar una sola de lectura (Gestión ▸ Análisis) como piloto. Activity
  conservaría la pantalla anterior (lo que ADR-0628 hace a mano).
- **Corrección del escéptico:** `'use cache: private'` **no** guarda en el servidor entre peticiones, solo en el navegador. No ahorra las 6 RPC por
  clic; el valor está en el App Shell y en volver atrás sin recargar.
- ↻ Cambia ADR-0028 y ADR-0628, y toca ADR-0149. **SE ROMPE SI** una función con `'use cache'` lee una tabla con RLS por sede y la copia llega a
  otra sede, o en una terminal compartida Activity conserva el estado al cambiar de cuenta. Absorbe a A7 y A5.

### cambiar-de-modulo#19 · Vender abre con el catálogo ya en el equipo · Visión · 4 · XL · Media
- **Propuesta:** el recorte que ADR-0018 / ADR-0013 Fase 2 ya decidieron, solo para Vender. Catálogo, precios, campañas y el disponible de la sede
  van en IndexedDB y se ponen al día con un cursor. `registrar_venta` sigue siendo el árbitro.
- **Condición de ADR-0018:** medir antes. Se empieza solo si #6 muestra que Vender pasa de 1,5 s en el p75.
- **Cómo lo hacen los mejores:** Lightspeed, Shopify POS (catálogo local).

### cambiar-de-modulo#20 · La identidad viaja en el token · Visión · 4 · XL · Baja
- **Propuesta:** un Custom Access Token Hook agrega al JWT persona, sede, rol, líder, admin y módulos. El marco los lee con `getClaims()` y las
  políticas de lectura con `auth.jwt()`; lo que guarda o da permisos sigue preguntando en vivo.
- **Cómo lo hacen los mejores:** Supabase, RBAC con custom claims ([fuente](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)).
- ↻ Cambia ADR-0161 y ADR-0178, y el hook es uno solo para el proyecto compartido con Dynamic: es decisión de Felipe con Dynamic.
- **SE ROMPE SI** el hook falla un lunes a las 9:00 y nadie de retail ni de Dynamic puede entrar. Absorbe a B6.

## Para otras skills
- `skill-optimizacion-ui-ux-perf`:
  - **Existencias en dos tiempos** (prioridad alta): el plan del piso (908 ms) y las lecturas en serie de `app/(app)/inventario/page.tsx:117, :140,
    :182` pasan a `<Suspense>`. La lista bajaría de ~3 s a ~1,2–1,5 s (estimado).
  - **Productos con la lista primero:** las facetas (882 ms) entran después.
  - `leerTodas` repite los embebidos en cada página.
- `/rigor`: confirmar con EXPLAIN si los ~48 ms de un SELECT de 20 filas son la identidad de la RLS.
- `skill-evaluacion-observabilidad`: fijar `dataCollection` antes de subir a Sentry v11.
- `/revision`: cerrar los pendientes del backlog de ADR-0622.

## Descartadas (para que nadie las vuelva a proponer)
| Propuesta | Por qué no |
|---|---|
| Traza `traceparent` de punta a punta, del clic hasta Postgres | No es para este volumen, y la fuente pone en duda unirla con los registros de Postgres |
| Pasar a Postgres 18 | Es un recordatorio, no una acción: la versión la decide el proyecto compartido con Dynamic |

## Lo que no se miró
- Los cuerpos de `fn_observatorio`, `fn_rendimiento_serie`, las funciones de Finanzas fuera del Resumen y `tienda_probador`.
- Si Dynamic ya tiene un gancho de token o un `db_pre_request`, y si Supabase deja cambiar `track_functions` (hoy `none`).
- La integración de Supabase con Sentry, y las fuentes de `router.refresh` y `unstable_cache` (#3, #12), que no se releyeron.
- Ninguna propuesta se probó en local ni en producción: los ahorros son estimados sobre lo medido.
