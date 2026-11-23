# Radar de innovación

**Último refresco:** 2026-11-23 · **Próximo:** 2026-11-30 (cada lunes, con la rutina semanal; con más de 14 días, `/innovar` avisa)

El radar es la memoria de «lo último» que usa `/innovar` (ADR-0651): lo que salió en el stack del ERP y lo que hacen hoy los mejores, cada cosa
con su fuente, su fecha y un anillo que dice qué tan lista está **para CAYLA** (3 tiendas + 1 taller), no para el mundo en general. Existe para
que cada corrida de `/innovar` no pague una investigación web entera y para que dos corridas digan lo mismo.

| Archivo | Qué tiene |
|---|---|
| [`stack.md`](stack.md) | Novedades de Next.js, React, PostgreSQL, Supabase, Vercel, TypeScript, Zod, Tailwind, herramientas, la plataforma web y la IA |
| [`referentes.md`](referentes.md) | Patrones de los referentes: retail y ERP para el **qué** (Shopify POS, Square, Lightspeed, Odoo, NetSuite…) y software de primer nivel para el **cómo** (Linear, Stripe, Vercel, Apple…) |

## Cómo se lee

**Anillos** (los del radar de ThoughtWorks, aterrizados a este volumen):
- **ADOPTAR**: maduro, encaja ya en este stack y cuesta poco. `/innovar` puede proponerlo en «Ahora».
- **PROBAR**: vale un piloto acotado en una pantalla o un módulo.
- **EVALUAR**: vigilar y entender, sin construir.
- **ESPERAR**: inmaduro o no conviene a este volumen. El porqué queda escrito para no reabrirlo cada semana.

**Horizonte** (en los referentes): `ahora` se construye con el stack actual en días o semanas; `visión` es una apuesta de meses o depende de
algo externo.

**Lo que no es:** una lista de cosas que hay que hacer. Una entrada en ADOPTAR dice que la herramienta está lista, no que CAYLA la necesite: la
propuesta concreta, con su escenario de negocio, la arma `/innovar` y la decide Felipe en `docs/innovacion/README.md`.

## Cómo se refresca

`/innovar radar` (a mano o desde la rutina semanal de cada lunes). El método y los dos prompts de investigación están en
`.claude/skills/innovar/referencia/radar.md`. Cada refresco agrega su sección al tope del registro de abajo.

## Registro de cambios

### 2026-11-23
Refresco semanal (rutina del lunes): dos investigaciones en paralelo limitadas a lo publicado desde el 2026-11-16, más una mirada de solo lectura a
Vercel, Sentry y Supabase. Ninguna versión nueva de `next` (16.4.6 sigue siendo `latest`) ni aviso para next, react, @supabase/*, typescript, turbo,
tailwindcss ni `@sentry/nextjs`.

- **Avisos de seguridad que tocan versiones del repo** (confirmados en la base de avisos de npm el 2026-11-23; todos de desarrollo o de build, ninguno
  corre en producción):
  - nuevo: **GHSA-qxg6-89mg-rqv8** (moderado) en `@vitest/mocker` `<4.1.12`: el arreglo mínimo de vitest sube de 4.1.11 a **4.1.12** (el repo
    está en 4.1.10).
  - nuevo: cinco avisos de **vite 8.0.0–8.1.5** (el repo resuelve 8.1.5, por vitest): GHSA-587h-7wmj-h5pm (alto, solo Windows),
    GHSA-rq7h-c2jc-7f22, GHSA-r825-w8mm-5pxw, GHSA-698v-4r3x-3vcv (moderados) y GHSA-9jrq-w75r-8gcw (bajo). Llega el arreglo (8.1.6) al subir
    vitest a 4.1.12.
  - siguen abiertos: zod 3.25.76 (GHSA-mrhx-c7xc-m3w5, alto) y vitest 4.1.10 (GHSA-82fw-gwwq-j7x9). En indirectas de build: `js-yaml`, `fast-uri`,
    `glob` y `minimatch` (vía eslint, typescript-eslint y el plugin de webpack de Sentry).
- **Stack** (60 entradas: ADOPTAR 16 · PROBAR 20 · EVALUAR 19 · ESPERAR 5):
  - ↑ **`ensureStatic`**, de PROBAR a ADOPTAR, por el cruce con Vercel (abajo).
  - ↑ **Animaciones guiadas por scroll**, de EVALUAR a PROBAR: Baseline «recién disponible» desde octubre (Firefox 159). Corrige el radar anterior.
  - **PostgreSQL 19** salió GA el 2026-11-19; sigue en ESPERAR porque Supabase hospedado no ofrece ni PG18.
  - **Vercel Workflows**: Workflow SDK 5, listo para producción y en todas las regiones (también `gru1`). Mismo anillo.
  - **Branching de Supabase**: fusionar a producción exige un token con alcance propio desde el 2026-11-12 (fuente secundaria).
  - Versiones al día: supabase-js 2.119.2, CLI de Supabase 3.3.0, Sentry 11.16.0, vitest 5.1.1, turbo 2.11.13, knip 6.48.0, pnpm 12.23.0; TypeScript 7.1
    RC sin salir; MCP sin especificación nueva.
- **Referentes** (52 patrones: ADOPTAR 19 · PROBAR 21 · EVALUAR 10 · ESPERAR 2):
  - nuevo: **52 · Ventas cortadas por atributo de la prenda (tejido, color, talla) sin contar doble** (PROBAR, ahora; Shopify Analytics y Sidekick,
    17-nov). Encajaría en Análisis.
  - nuevo: **53 · Congelar el mostrador en temporada alta: solo arreglos** (ADOPTAR, ahora; Shopify POS 11.18/11.19 solo con arreglos hasta fin de año).
    Para Vender, Caja, Cambios y Devoluciones en diciembre; la ventana la decide Felipe.
  - ↑ **50 · Código de producto SUNAT por categoría**, de EVALUAR a PROBAR: faltan 39 días para el 1-ene-2027 y el paso barato (guardar el código por
    categoría sin enviarlo a Lucode) no tiene riesgo. Que viaje en el comprobante espera al contador, a Lucode y a Felipe. El Catálogo 25 volvió a la
    versión 14 (fuentes secundarias).
  - Corregidos, mismo anillo: 5 (Square imprime etiquetas desde el equipo de mano), 12 (Odoo 20, fuente secundaria), 15, 20, 25, 27, 37, 46 (Apple:
    guía de tacto en Mac, respalda no esconder nada solo tras el hover) y 49.
- **Lo que se vio en producción** (últimos 7 días, solo lectura):
  - **Tienda (Vercel):** los fallos por leer la hora durante el prerender crecieron de cientos a **más de doce mil en la semana** (sobre todo la ficha
    de prenda y «arma tu look»), más fallos de `fetch` rechazados al terminar el prerender en las páginas fijas (tiendas, cambios, club, privacidad).
    Es justo lo que `ensureStatic` frena en el build: por eso sube a ADOPTAR.
  - **ERP (Vercel):** sigue dominando el refresco de sesión vencido en el `proxy` (ruido de sesiones viejas); además unas 20 esperas agotadas del PSE,
    tiempos agotados de consulta en Tráfico de la tienda web, Ventas sin registrar y Proveedores, y un aviso diario del vigía de invariantes (una
    regla leve). Ninguna novedad del stack los arregla.
  - **ERP (Sentry):** dominan los «Failed to fetch» del navegador en Vender, Productos y Caja, hacia la base y hacia un servicio local del equipo de la
    sede; son cortes de red que ya cubre ADR-0411. La tienda sigue sin proyecto propio en Sentry.
  - **Configuración:** Node 24.x en el ERP; Postgres 17.6 en producción; el asesor de salud de Supabase no marca nada.
  - Ninguna propuesta del tablero de innovación pasa a `vencida` esta semana.
- **Límites:** desde esta sesión no abrieron changelog.shopify.com, squareup.com, elperuano.pe, postgresql.org, supabase.com ni vercel.com, y la API de
  avisos de GitHub respondió 403; lo de ahí viene del resumen del buscador (marcado como fuente secundaria) y los avisos se confirmaron en la base de
  npm, que replica la de GitHub.

### 2026-11-16
Refresco semanal (rutina del lunes): dos investigaciones en paralelo limitadas a lo publicado desde el 2026-11-13, más una mirada de solo lectura a
Vercel, Sentry y Supabase. Semana tranquila en el stack: ninguna versión mayor ni aviso nuevo para `next@16.4.6`, `react@19.2.4`, supabase-js,
`@sentry/nextjs@10.76.2` ni pnpm 12.4.1.

- **Avisos de seguridad que tocan versiones del repo** (no son de esta semana, pero el radar del 13 no los tenía; confirmados en la base de avisos de
  npm el 2026-11-16): **zod 3.25.76** cae en GHSA-mrhx-c7xc-m3w5 (alto, `<4.6.6`, sin parche para 3.x: agotamiento de memoria al validar
  colecciones grandes con restricciones) y **vitest 4.1.10** en GHSA-82fw-gwwq-j7x9 (moderado, solo máquinas de desarrollo; se corrige con 4.1.11).
- **Stack** (60 entradas: ADOPTAR 15 · PROBAR 20 · EVALUAR 20 · ESPERAR 5):
  - nuevo: **CLI de Supabase v3** (EVALUAR): local por defecto y confirmación antes de tocar lo hospedado. El CI fija 2.118.0, pero un
    `npx supabase` sin versión ya baja v3.
  - ↑ **Zod 4**, de PROBAR a ADOPTAR, por el aviso de arriba.
  - ↑ **`ensureStatic`**, de EVALUAR a PROBAR, por el cruce con Vercel (abajo).
  - **Parche de Next 16.4.5**: adoptado en el repo el 2026-11-13 (16.4.6).
  - **Cache Components**, corregido: el radar del 13 decía que el repo no lo usaba, y `apps/tienda` lo tiene encendido desde ADR-0432. Sigue en
    PROBAR para el ERP.
  - Fechas y versiones al día en PostgreSQL 19 (GA prevista el 2026-11-19, fuente secundaria), TypeScript 7.1 beta, supabase-js, Sentry 10.x,
    Vitest, Turborepo y la IA.
- **Referentes** (50 patrones: ADOPTAR 18 · PROBAR 19 · EVALUAR 11 · ESPERAR 2):
  - nuevo: **50 · Código de producto SUNAT por categoría** (EVALUAR, ahora). SUNAT llevó al 1-ene-2027 el rechazo por código de producto faltante;
    no está claro si alcanza a la ropa. Fuentes secundarias: hay que confirmarlo con el contador y con Lucode.
  - nuevo: **51 · El carrito web del cliente, visible en el mostrador** (EVALUAR, visión; Shopify POS 11.14).
  - salió: **36 · Local-first**, fundido en el 10 (vender sin internet), que era lo único aplicable a este volumen. El número queda reservado.
  - Corregidos, mismo anillo: 1, 3 y 22 (Lightspeed pasó de «próximamente» a beta por invitación, y Squaremates es la entrada por defecto del
    panel de Square), 25 (calendario SUNAT 2027) y 39 (Notion deshace a nivel de API).
- **Lo que se vio en producción** (últimos 7 días, solo lectura):
  - **Tienda (Vercel):** el error más repetido es el del valor inestable (la hora) leído durante el prerender en catálogo, ficha de prenda, inicio
    y looks, cientos de veces por semana, más cortes por el tope de 60 s. Es lo que `ensureStatic` atraparía en el build, y por eso subió.
  - **ERP (Vercel):** lo más frecuente sigue siendo el refresco de sesión vencido en el `proxy`, que es ruido de sesiones viejas. Además, tiempos
    agotados de consulta en Finanzas ▸ Resumen y en Proveedores, y unos pocos cortes del PSE. Ninguna novedad del stack los arregla. Van al tablero
    de innovación (el vigía de rendimiento ya está en curso), no al radar.
  - **ERP (Sentry):** dominan los «Failed to fetch» del navegador contra la base (etiquetas, rótulos, productos, vender). Son cortes de red de las
    sedes que ya cubre ADR-0411.
  - La tienda no tiene proyecto propio en Sentry.
  - **Configuración:** Node 24.x y región `gru1` en los dos proyectos. Postgres 17 en producción (Postgres 18 sigue sin estar en Supabase
    hospedado: confirmado en su documentación).
  - Ninguna propuesta del tablero de innovación pasa a `vencida` esta semana.
- **Límites:** desde esta sesión no abrieron nextjs.org, react.dev, supabase.com, postgresql.org, vercel.com, linear.app ni
  changelog.shopify.com. Lo de ahí viene del resumen del buscador y está marcado como fuente secundaria donde corresponde.

### 2026-11-13 — primer radar
Armado desde cero con dos investigaciones en paralelo (stack y referentes), con fuentes primarias consultadas ese día.
- **Stack:** 59 entradas (ADOPTAR 14 · PROBAR 20 · EVALUAR 20 · ESPERAR 5). La que más urge es **el parche de seguridad de Next 16.4.5/16.4.6**: el
  repo está en 16.4.1 y hay siete avisos de severidad media del 2026-11-03 (verificados en los avisos de GitHub). Postgres 18 todavía no está en
  Supabase hospedado, así que lo suyo queda en EVALUAR o ESPERAR.
- **Referentes:** 49 patrones (34 de retail y ERP · 15 de software de primer nivel; ADOPTAR 18 · PROBAR 19 · EVALUAR 9 · ESPERAR 3; 35 «ahora» y
  14 «visión»). Lo que no se pudo confirmar en la fuente primaria (Toast y NetSuite respondieron 403, algunas fuentes peruanas son secundarias)
  está marcado en cada entrada y al final del archivo.
