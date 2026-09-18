# ADR-0074 — CI suma un job piloto que prueba las RPC contra Postgres real

**Fecha:** 2026-09-17
**Estado:** Aplicado en el código (`.github/workflows/ci.yml`, job `pruebas-postgres`).
Sin confirmar en un runner real todavía — esta sesión no pusheó, así que nadie lo vio
correr en GitHub Actions.
**Afecta:** `.github/workflows/ci.yml`. Revisita ADR-0066 y ADR-0026.

## Contexto

ADR-0066 (2026-09-16) decidió a propósito que `scripts/pruebas/*.mjs` no corrieran desde
`pnpm test`/CI: "cada PR futuro saldría rojo por Docker, no por el código" — con solo
`registrar_cambio.mjs` existiendo en ese momento. Un día después, con
`registrar_venta.mjs` recién agregado (22 escenarios, la RPC más tocada del repo) y ya 4
scripts en total (`caja:verificar`, `registrar-cambio`, `aprobar-devolucion-caja`,
`registrar-venta`) cubriendo justo las RPC que mueven stock y dinero real, Felipe pidió
evaluar si ya era momento de revisitarlo — ADR-0066 mismo lo había anticipado: "se
revisita si el volumen de RPCs por probar lo justifica".

## Decisión

**DECIDÍ: sumar un job nuevo (`pruebas-postgres`) a `ci.yml`, ni dejarlo fuera ni
convertirlo directo en gate obligatorio.** Levanta el stack local real (`npx supabase
start`, con el stub gitignored de Dynamic copiado primero — `CONTRIBUTING.md` §1,
ADR-0033) y corre los 4 scripts existentes, cada uno como paso independiente (mismo
patrón `if: always() && steps.X.outcome == 'success'` que ya usa el job `verificar` para
tipos/lint/pruebas — un push malo trae el diagnóstico completo de una vez, no de a uno).

**El job entero lleva `continue-on-error: true`.** Ninguna corrida real lo vio funcionar
en un runner de GitHub Actions todavía — solo en el Postgres local de cada quien. La
mecánica (Docker-in-Docker, tiempo de arranque del stack completo de Supabase — no solo
Postgres, también Auth/Storage/Kong —, memoria disponible del runner) no se puede
confirmar sin verla correr de verdad, y `main` hoy no exige ningún check para mergear de
todos modos (`CONTRIBUTING.md` §2, protección de rama todavía sin activar) — así que no
hay ningún gate real que este job pudiera romper por accidente. Se saca esa línea con 2-3
corridas verdes reales.

**`migraciones:verificar` se dejó afuera, a propósito — es otra decisión.** Por diseño
"informa, no bloquea" (ADR-0026: sale siempre con código 0). Meterlo a este job no
agregaría ninguna señal de pasa/no pasa, solo ruido en los logs. Revisitar eso implica
decidir primero qué lo convierte en fallo, que ADR-0026 dejó explícitamente para después
— no se decidió acá.

## Consecuencias

- CI probablemente pasa de ~1-2 min a varios minutos más para el job nuevo (dos jobs
  corren en paralelo, no en serie, así que el tiempo total de espera de un push es el del
  más lento de los dos, no la suma). No se midió un número real todavía.
- Mientras `continue-on-error: true` siga puesto, un fallo real de cualquiera de los 4
  scripts (un bug de verdad en `registrar_venta`, por ejemplo) se ve en los logs del job
  pero NO bloquea el merge — sigue dependiendo de que alguien lo mire, el mismo problema
  que tenía `pnpm build` antes del 2026-09-09 (cabecera de `ci.yml`). Es la contrapartida
  aceptada a cambio de no arriesgar un push real de Felipe contra una mecánica todavía sin
  probar en el runner de verdad.
- Esta sesión no pusheó — el primer dato real de si esto funciona llega recién cuando la
  rama toque GitHub Actions. Queda anotado en BACKLOG.
