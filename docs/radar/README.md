# Radar de innovación

**Último refresco:** 2026-11-13 · **Próximo:** 2026-11-16 (cada lunes, con la rutina semanal; con más de 14 días, `/innovar` avisa)

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

### 2026-11-13 — primer radar
Armado desde cero con dos investigaciones en paralelo (stack y referentes), con fuentes primarias consultadas ese día.
- **Stack:** 59 entradas (ADOPTAR 14 · PROBAR 20 · EVALUAR 20 · ESPERAR 5). La que más urge es **el parche de seguridad de Next 16.4.5/16.4.6**: el
  repo está en 16.4.1 y hay siete avisos de severidad media del 2026-11-03 (verificados en los avisos de GitHub). Postgres 18 todavía no está en
  Supabase hospedado, así que lo suyo queda en EVALUAR o ESPERAR.
- **Referentes:** 49 patrones (34 de retail y ERP · 15 de software de primer nivel; ADOPTAR 18 · PROBAR 19 · EVALUAR 9 · ESPERAR 3; 35 «ahora» y
  14 «visión»). Lo que no se pudo confirmar en la fuente primaria (Toast y NetSuite respondieron 403, algunas fuentes peruanas son secundarias)
  está marcado en cada entrada y al final del archivo.
