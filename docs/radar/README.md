# Radar de innovación

**Último refresco:** 2026-11-16 · **Próximo:** 2026-11-23 (cada lunes, con la rutina semanal; con más de 14 días, `/innovar` avisa)

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
