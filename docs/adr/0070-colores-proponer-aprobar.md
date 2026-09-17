# ADR-0070 — Colores: cualquiera propone, un Líder aprueba

**Fecha:** 2026-09-16
**Estado:** Construido y probado parcialmente (ver "Cómo se verificó" — con un límite
real, explicado ahí). Producción: pendiente de que Felipe pegue
`docs/datos/SQL-PENDIENTE-PRODUCCION-2026-09-16-colores.sql`.
**Afecta:** `retail.colores` (columnas y RLS nuevas), `apps/web/app/api/productos/colores/route.ts`,
`apps/web/components/ColoresLista.tsx`. Módulo 02 · Loro.

## El problema

Agregar un color al vocabulario cerrado (`/productos/colores`, ADR-0072) exigía Líder
— RLS (`colores_write_lider`) y el propio API route lo bloqueaban igual. El censo
físico corre esta semana (16 al 20 de septiembre) con 16 colaboradores de tienda recién
dados de alta (BITÁCORA 2026-09-16): quien escanea una prenda de un color que falta no
puede seguir contando — tiene que avisar a un Líder y esperar.

## Decisión

DECIDÍ: un solo mecanismo, no dos. Cualquiera con sesión propone un color y queda
**usable al instante** (nunca frena el censo); cualquiera de los Líderes actuales lo
aprueba después, sin urgencia. El estado real (`pendiente`/`aprobado`) no lo decide el
cliente ni el API route — lo decide un trigger (`retail.fn_colores_estado_trigger`) que
mira `retail.fn_es_lider()` en el momento del insert. RLS se relaja para INSERT
(cualquier autenticado) y se mantiene igual de estricta para UPDATE (solo Líder,
`colores_update_lider`), así que aprobar, editar y desactivar siguen siendo lo mismo de
siempre.

DESCARTÉ: una pantalla de "fusionar" dos colores duplicados. `colores_clave_unica`
(ADR-0024) ya hace imposible que "azul" y "azul " convivan como dos filas — una
propuesta duplicada choca limpio contra el color que ya existe, con el mensaje que
`error-escritura.ts` ya traduce. No hay nada que fusionar porque el duplicado nunca
llega a existir.

DESCARTÉ: un nivel de rol nuevo ("admin" por encima de Líder). Felipe decidió
2026-09-16 que cualquiera de los 9 Líderes actuales aprueba — no hace falta tocar
`retail.colaboradores.rol` (`check (rol in ('lider','colaborador'))`, `0016`).

SE ROMPE SI: alguien propone spam de colores basura — hoy no hay forma de "rechazar",
solo de desactivar uno por uno (mismo camino que ya existe). Con 16 colaboradores
nuevos y sesión abierta, es un riesgo bajo pero real; si aparece, la salida es un
límite de propuestas pendientes por persona, no construida en esta pasada.

## Cómo se hace cumplir

- `retail.colores` gana `estado` (`pendiente`/`aprobado`, default `aprobado` — los 32
  colores de hoy no cambian), `propuesto_por`, `aprobado_por`, `aprobado_en`.
- `retail.fn_colores_estado_trigger()` (`before insert or update`): en un INSERT, fija
  `estado` según si quien inserta es Líder (`retail.fn_es_lider()`) — ignora lo que
  mande el cliente. En un UPDATE que transiciona a `aprobado`, sella quién y cuándo.
- RLS: `colores_insert_autenticado` (`auth.role() = 'authenticated'`, mismo patrón que
  `colores_select`) reemplaza la mitad de `colores_write_lider` que cubría INSERT;
  `colores_update_lider` (`retail.fn_es_lider()`, mismo patrón que
  `productos_write_lider`) cubre UPDATE. Sin política de DELETE, como ya era.

## Cómo se verificó

**Verificado de verdad, contra producción, en una transacción que termina en
ROLLBACK (nunca COMMIT):** la lógica del trigger. Impersonando a Felipe (Líder) con
`request.jwt.claim.sub`, un color nuevo nace `aprobado`, con `aprobado_por`/`aprobado_en`
sellados. Impersonando a Angie Chávez (Colaboradora real de Tienda TRU, una de las 16
dadas de alta hoy), el mismo insert nace `pendiente`, sin aprobar, y con `propuesto_por`
apuntando a ella. Una segunda vuelta como Felipe lo aprueba y sella su firma.

**Límite real, dicho sin adornos:** la conexión de este MCP de Supabase conecta como
`postgres` con `rolbypassrls = true` — **pasa por encima de RLS siempre**, sin
excepción. Confirmar que `colores_update_lider` bloquea de verdad a una Colaboradora
que intente aprobar su propio color (vía UPDATE directo, no por el API route) no se
pudo probar por este canal: cualquier intento se ve permitido sin que eso diga nada
sobre si RLS lo habría dejado pasar. La sintaxis de las dos políticas nuevas es idéntica,
palabra por palabra, a la de `colores_select`/`productos_write_lider` — ya viven en
producción y las usa toda la app hoy — pero es una inferencia por patrón, no una
prueba end-to-end de esta política puntual. **Falta: alguien con una cuenta de
Colaborador real (una de las 16) entra a `/productos/colores`, propone un color, y
confirma en el navegador que no puede editarlo/aprobarlo — solo un Líder puede.**

`tsc --noEmit`, `eslint` y los 266 tests existentes, en verde (ninguno cubre este
flujo nuevo — no hay prueba automatizada de esto todavía, mismo hueco que el resto del
módulo, D-25).
