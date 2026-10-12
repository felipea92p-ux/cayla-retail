# ADR-0381 — Los números se reservan al empezar, los PR se abren mirando a los demás y las pruebas de Postgres corren en tandas

**Fecha:** 2026-10-12 · **Estado:** aceptado (Felipe aprobó la lista y eligió hacer primero las tres piezas que no cambian su
forma de trabajar) · construido y probado en local; las tandas se prueban de verdad con el CI de su propio PR. El número de
este ADR salió del mecanismo que describe (`reserva/adr-0381`): el 0380 ya lo tenía una rama abierta.

## Contexto

Fusionar Liquidación (PR #940, 2026-10-10 a 10-12) costó tres días. Hubo tres causas, y ninguna era un error de nadie:

1. **El círculo de «Update branch».** El ruleset `main-protegida` exige la rama al día con `main`
   (`strict_required_status_checks_policy: true`), y eso se mantiene: es lo que deja al push a `main` no repetir las pruebas
   (ADR-0345). Pero «Pruebas de RPC contra Postgres» corría ~180 pruebas en serie, de 8 a 11 minutos, y crecía unos 3 s por
   prueba (11 pruebas el 2026-09-20, 119 el 09-29, 168 el 10-05, 180 el 10-12). Con `main` moviéndose cada pocos minutos,
   un PR que tardaba 10 minutos en ponerse verde ya estaba atrasado otra vez, y cada «Update branch» cancelaba la corrida en
   curso (`concurrency: cancel-in-progress`).
2. **Números elegidos al final.** Cada sesión elegía «el siguiente» ADR o versión de migración mirando el `main` que tenía
   delante. Dos versiones de Liquidación coincidían con Plan de campaña (20261010190000, 20261010200000) y otra con «Abrir
   producción» (20261010210000): `schema_migrations_pkey` en el CI. El ADR-0371 y después el 0375 los tomaron otras
   sesiones. Git no lo marca como conflicto porque son archivos con nombres distintos.
3. **Parches a la misma función.** Dos reemplazos anclados distintos a `retail.registrar_venta`: cada uno pasaba solo, y la
   prueba `registrar-venta-antes-de-precio-sede.mjs` tuvo que aprender a deshacerlos en orden
   (`DESHACER_POSTERIORES` / `REHACER_POSTERIORES`).

## Decisión

**1. Las pruebas de Postgres corren en 4 tandas a la vez** (`scripts/ci/pruebas-postgres.mjs`). La lista de pruebas, con el
comentario de qué vigila cada una, sale de `ci.yml` y pasa a `PRUEBAS` en ese script. El script reparte las pruebas
equilibrando por la duración medida (`pruebas-postgres-duraciones.json`, que se reescribe con `--medir <id de corrida>`) y
corre cada tanda en un job con su propia base. El check que exige el ruleset conserva su nombre: es un job final que junta
las tandas, así que no se toca el ruleset y Vercel ve lo mismo. Medido el 2026-10-12: 81 s para levantar Postgres más ~463 s de
pruebas. Con 4 tandas de ~123 s cada una, el job baja de ~9,5 min a ~4 min. Un PR «solo web» corre una tanda; uno de solo
documentos, ninguna.

**2. Los números se reservan al empezar** (`pnpm reservar adr|migracion`, `scripts/reservar/`). Una reserva es una etiqueta
anotada en el remoto (`reserva/adr-0381`, `reserva/migracion-AAAAMMDDHHMMSS`) cuyo mensaje dice qué rama es la dueña. El
remoto rechaza una etiqueta que ya existe: si dos sesiones reservan a la vez, la primera gana y la segunda prueba con el
número siguiente. El número elegido supera todo lo que hay en `main`, en las ramas remotas y en las reservas. La etiqueta
apunta al archivo vacío, no a un commit: así el checkout corto del CI (`fetch-depth: 2`) baja solo las etiquetas y no la
historia que hay detrás. `scripts/adr/numeros.mjs` y `scripts/migraciones/versiones.mjs` miran ahora las reservas: un número
nuevo de la rama que reservó **otra** rama sale en rojo, y uno sin reserva solo avisa.

**3. Todo PR se abre con `/abrir-pr`** (`.claude/skills/abrir-pr/`, regla en CLAUDE.md «Números y PR»). La skill trae main,
revisa las reservas, corre `pnpm abrir-pr:choques` (`scripts/abrir-pr/choques.mjs`), corre las pruebas que toca el cambio y
abre el PR con los choques probables escritos en su descripción. El detector compara la rama contra main y contra cada PR
abierto y clasifica lo que encuentra:
- **seguro:** el mismo número de ADR o de migración, o un número reservado por otra rama;
- **probable:** la misma función de `retail` cambiada por migración (también por `reemplazar_anclado`), o el mismo archivo de
  registro (menú, módulos, guía de foco, `menu-hoy.golden.json`, la lista `PRUEBAS`, `package.json`, los workflows).

No bloquea: el otro PR puede no fusionarse nunca. Con `--entre-prs` cruza todos los PR abiertos entre sí. El primer día
encontró a #975 repitiendo dos migraciones de #788 y a #600 con un ADR-0262 distinto al de main.

### Lo que decidió Felipe (2026-10-12)

- **Las reservas no se liberan.** Un hueco en la numeración no rompe nada, y liberar reabre la carrera que esto cierra.
- **Un número sin reserva solo avisa**, por ahora. Con un fallo duro se habrían puesto rojos de golpe los PR abiertos. Puede
  pasar a fallo duro cuando esos PR hayan salido.
- **La cola de fusión casera queda para después.** Primero se usan estas tres piezas una semana y se mide cuántas veces un PR
  tuvo que ponerse al día más de una vez. Si con el CI a ~4 minutos el círculo casi desaparece, la cola sobra: no hace falta
  la GitHub App ni cambiar el hábito de fusionar a mano. Si sigue pasando, la cola se diseña con esos datos.

### Por confirmar (de Felipe, fuera del repo)

- **Proteger las etiquetas `reserva/*`** en Settings ▸ Rules, para que no se puedan mover ni borrar. Sin esa regla, un
  `git push --force` puede pisar una reserva ajena. Es opcional.
- **Vercel ▸ Project Settings ▸ Git ▸ Deployment Checks:** confirmar si espera el CI de main. Si lo espera, nada cambia,
  porque el job que junta las tandas conserva el nombre.
- **Costo de Actions:** el repo es público, así que los minutos no se cobran. Si algún día vuelve a ser privado, las 4
  tandas multiplican por ~4 el tiempo de máquina de cada PR: en ese caso habría que bajar `TANDAS` o volver a una sola.

## Alternativas descartadas

- **Apagar «rama al día» en el ruleset.** Rompe la suposición de ADR-0345, y el choque de #642 y #643 del 2026-09-30 mostró
  qué pasa sin ella.
- **La cola de fusión oficial de GitHub.** No existe para repositorios de cuentas personales.
- **Generar 4 copias de los 180 pasos en `ci.yml`.** Es un YAML generado, frágil, que alguien terminaría editando a mano.
- **Reservar con un archivo en `main`** (un registro de números). Para reservar habría que fusionar a `main`, que es justo lo
  que tarda.
- **Que la reserva apunte a `origin/main`.** Se probó primero: leerla en el checkout corto del CI se habría bajado la historia.

## Se rompe si

- Una prueba de Postgres pasa a depender de lo que dejó otra: ahora pueden caer en tandas distintas. Hoy todas hacen ROLLBACK
  o deshacen lo suyo; las que hacen COMMIT de verdad están en `EXCLUIDAS` de `apps/web/lib/ci-paridad.test.ts`.
- Alguien renombra el job «Pruebas de RPC contra Postgres»: ningún PR se podría fusionar. Lo vigila `pruebas-postgres.test.mjs`.
- Una sesión elige el número a mano y no reserva: el candado solo avisa, y el choque vuelve a salir tarde.
- Se fusionan PR con squash con otro asunto: `alcance.mjs` reconoce «Merge pull request #N» y «… (#N)», nada más.
