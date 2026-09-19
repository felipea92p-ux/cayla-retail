# ADR-0103 — Familia deja de ser un CHECK fijo, pasa a tabla sin proponer/aprobar

**Fecha:** 2026-09-18
**Estado:** Construido y verificado en local. Producción: pendiente de que
Felipe pegue el SQL correspondiente.
**Afecta:** `retail.categorias` (FK nueva `categorias_familia_fk`), tabla
nueva `retail.familias`, `CategoriasLista.tsx`, `packages/shared/src/enums.ts`
(`Familia` pasa de unión fija a `string`), pantalla nueva `/productos/familias`.

## El problema

`categorias.familia` es un `CHECK constraint` de 6 valores hardcodeados
desde `20260912235500_vocabulario_cerrado.sql`. Agregar una familia nueva
(ej. si CAYLA suma una línea de negocio) exigía una migración y un deploy.
Felipe pidió una pantalla para hacerlo él mismo (BACKLOG, "Familias y
categorías", 2026-09-17), sin depender de una sesión de desarrollo cada vez.

## La colisión

Esta misma tarea se construyó en paralelo, sin saberlo, en dos sesiones
distintas: esta (`claude/arreglemos-esto-079019`) y `claude/fix-old-stuff-0192ff`
("Arreglemos lo viejo"). Cada una copió un molde distinto de los que ya
existen en el repo para "agregar un valor nuevo a una lista cerrada".
Detectado por el tablero `docs/SESIONES-ACTIVAS.md` (que existe justo para
esto, desde el incidente del 2026-09-17). Comparadas las dos versiones con
Felipe en vivo, decidió quedarse con esta.

## Las dos opciones que se compararon

**Esta sesión — `familias.codigo` texto, sin proponer/aprobar (elegida):**
copia el molde de `retail.categorias` (líder-only, `for all`, sin flujo de
aprobación). `codigo` es un texto estable ('indumentaria', 'calzado'...),
autogenerado del nombre por un trigger (`fn_familias_generar_codigo`) solo
cuando no se manda uno explícito. `categorias.familia` sigue siendo la
misma columna de texto de siempre, con un candado nuevo (`categorias_familia_fk`)
en vez de una migración de tipo.

**La otra sesión — `familias.id` uuid, con proponer/aprobar/rechazar:**
copia el molde de `retail.tejidos`/`retail.patrones` (cualquiera con sesión
propone, un líder aprueba). Cambia `categorias.familia` (texto) a
`categorias.familia_id` (uuid): dropea la columna vieja, migra los datos
con backfill 1:1, y tiene que dropear+recrear `retail.actualizar_categoria`
porque cambió el tipo de un parámetro de posición fija.

## DECIDÍ

Quedarme con la versión de esta sesión: tabla `retail.familias` con
`codigo text` como clave estable, sin proponer/aprobar, líder-only —
mismo patrón que ya usa `retail.categorias`.

## DESCARTÉ

La versión con `familia_id uuid` y proponer/aprobar, porque:

1. **Cambia el tipo de una columna que usa medio repo.** `categorias.familia`
   se lee como texto en `packages/shared` (`Familia`/`FAMILIAS`), en las
   rutas de API, y en la RPC `actualizar_categoria`. Migrar a uuid obliga a
   tocar cada uno de esos sitios solo para guardar una clave subrogada que
   nadie necesita — `'accesorios'` ya es una clave estable y legible.
2. **El flujo de proponer/aprobar no tiene dueño real.** Agregar una
   familia no es una tarea operativa de piso de venta como sí lo es un
   color o una talla nuevos durante el censo — es una decisión de marca.
   La última vez que se tocó (ADR-0096, 2026-09-17) exigió investigar cómo
   la nombran Zara/H&M/Hermès/Ralph Lauren antes de decidir, no algo que un
   colaborador resuelve con un clic al catalogar una prenda. Construir un
   "cualquiera propone" para algo que en la práctica decide Felipe solo,
   después de días de investigación, es maquinaria sin uso real (principio
   7 de CLAUDE.md global: antes de agregar, borra).
3. La propia sesión que construyó la otra versión, al ver esta
   comparación, coincidió en que el argumento de "no es vocabulario
   operativo" era más sólido que el suyo.

## SE ROMPE SI

El día de mañana Felipe decide que un encargado de sede (no líder) debería
poder sugerir una familia nueva sin su aprobación previa — ahí sí habría
que migrar al mecanismo de proponer/aprobar que usa Colores/Tallas. Hoy no
es el caso: cada vez que se tocaron familias fue una decisión suya,
investigada, nunca una propuesta de piso.

## Cómo se hace cumplir

- `familias_write_lider` (RLS, `for all`) — solo un líder inserta/edita/
  desactiva, igual que `categorias_write_lider`.
- `fn_familias_desactivar_candado` — no se puede desactivar una familia con
  categorías activas colgando (mismo candado que ya tenía `categorias`
  frente a productos).
- `categorias_familia_fk` — un código que no exista en `retail.familias`
  se rechaza al guardar la categoría, con mensaje traducido
  (`error-escritura.ts`, huella `categorias_familia_fk`).

## Cómo se verificó

`npx supabase db reset` limpio. Contra Postgres local: insertar una
categoría con familia inexistente falla por FK; agregar una familia nueva
con solo el nombre autogenera el código (`Hogar y Decoración` →
`hogar_y_decoracion`); desactivar una familia en uso falla con el mensaje
esperado; desactivar una sin uso funciona. En el navegador, como líder:
`/productos/familias` (tarjetas, agregar/editar/desactivar/reactivar) y
`/productos/categorias` (selector de familia ya lee de la tabla, no del
arreglo fijo). `pnpm typecheck`, `pnpm lint` y los 297 tests, en verde
—incluida la regeneración real de `packages/database/src/types.ts` contra
Postgres local (el primer commit de esta rama lo dejó con un stub a mano
porque Docker estaba apagado por RAM; se reemplazó apenas volvió a estar
arriba, sin diferencias funcionales).
