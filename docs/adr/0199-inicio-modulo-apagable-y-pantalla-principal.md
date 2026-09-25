# ADR-0199 — Inicio se vuelve un módulo apagable, y cada rol elige su pantalla principal

**Fecha:** 2026-09-25 · **Estado:** decidido por Felipe; construido en la rama `claude/self-role-assignment-fee72b`;
migración `20260925220000_inicio_modulo_y_pantalla_principal.sql` **verificada con ensayo `begin…rollback` contra
producción, sin aplicar todavía** (ver «Pendiente» abajo).

## El problema

Al cerrar ADR-0178 (Admin se reasigna su propio rol), Felipe pidió, en la misma conversación, dos cosas relacionadas:

1. Poder elegir cuál es la **pantalla principal** de un rol — a dónde aterriza esa cuenta al iniciar sesión — en vez
   de que sea siempre Inicio.
2. Que el módulo **Inicio** también se pueda asignar (encender/apagar), como cualquier otro módulo.

Revisando el código: Inicio no era de ningún módulo. Lo veía toda persona sin excepción (`lib/menu.ts`, comentario
«Una hoja sin módulo (Inicio): las personas siempre») y `modulos.test.ts` lo comprobaba a propósito. La única regla
propia era de TERMINAL (Felipe, 2026-09-21): una que vende aterriza en el mostrador, no en Inicio.

## Decisiones (Felipe, 2026-09-25)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Inicio se vuelve un módulo más** (`retail.modulos`, con su candado sí/no en Roles y accesos, como Ventas o Inventario). | Es lo que Felipe pidió textualmente: «el módulo de inicio también debería poderse asignar». |
| 2 | **Nace ENCENDIDO en los roles que ya existen** — excepción a «todo módulo nuevo nace solo para el líder» (CLAUDE.md). | Si naciera solo del líder, cada cuenta existente se quedaría sin ningún lugar donde aterrizar el mismo día que se pega la migración. Terminal Ventas no participa (ver principio 6 abajo) ni los roles archivados (`fn_rol_modulos_coherente()` lo rechaza). |
| 3 | **Cada rol elige una «pantalla principal»** (`retail.roles.pantalla_principal`, un módulo de los suyos, o NULL). | Es lo otro que Felipe pidió: no siempre Inicio. Se guarda junto con los módulos, en la misma función (`guardar_modulos_rol`, ahora con un 4.º parámetro) — son la misma pantalla, un solo guardado. |
| 4 | **Sin preferencia explícita (NULL), la web calcula sola** la primera pantalla que el rol ve, en el orden del menú. | Nunca un rol se queda sin saber a dónde ir mientras vea algo. Si eligió una y el rol deja de verla (se apaga ese módulo), vuelve sola a «automática» — nunca se guarda ni se usa una elección inválida. |
| 5 | **Un rol que se queda sin NINGÚN módulo (ni Inicio) ve una pantalla mínima «Sin acceso».** | Decisión explícita de Felipe (contra la alternativa de no dejar apagar el último módulo). Se reusó la pantalla `/sin-acceso` que ya existía para `exigirModulo()` — no se inventó una nueva. |

## Cómo se construye

- **Base** (`20260925220000_inicio_modulo_y_pantalla_principal.sql`): inserta `inicio` en `retail.modulos` (grupo
  «General», `orden` 5 — antes de Ventas); backfill de `rol_modulos` para todo rol no fijo, no archivado, salvo
  `terminal_ventas`; `alter table retail.roles add column pantalla_principal text references retail.modulos(clave)`;
  `guardar_modulos_rol` gana `p_pantalla_principal` (un parámetro más SIEMPRE crea una sobrecarga nueva junto a la
  vieja — se arma la definición nueva desde la VIVA, con conteo exacto de ocurrencias, y se borra la firma de 3
  argumentos después de crear la de 4, mismo patrón que ADR-0193 usó para sumarle `p_version_esperada`); nueva RPC
  `fn_mi_pantalla_principal()` (mismo patrón que `fn_mi_terminal`/`fn_es_admin`).
- **Web:** `lib/modulos.ts` (nuevo `ClaveModulo` «inicio», grupo «General»); `lib/menu.ts` (el nodo Inicio declara
  `modulo: "inicio"`; una TERMINAL sigue su regla propia — `terminalVeInicio` — independiente de este candado;
  `aterrizajeDe` reescrito: la pantalla elegida si el rol todavía la ve, si no la primera que ve en el orden del
  árbol, si no `/sin-acceso`); `lib/persona-actual.ts` (`pantallaPrincipal` en `PersonaActualV2`, vía la RPC nueva,
  con el mismo `try/catch` implícito de las demás — si la base aún no tiene la función, `null`, nada cambia);
  `app/(app)/page.tsx` (le pasa `pantallaPrincipal` a `aterrizajeDe`); `lib/roles-reglas.ts` (`RolVista.pantallaPrincipal`,
  `pantallasElegibles`, `pantallaPrincipalValida` — la autocorrección si el módulo elegido se apaga);
  `components/RolesPanel.tsx` (selector nativo «Pantalla principal», mismo patrón de `<select>` que `MediosDePago.tsx`;
  borrador propio, mismo mecanismo que el de módulos — incluida la corrección local ADR-0193, `GuardadoLocal` ganó
  `pantallaPrincipal`); `components/ColaboradoresPanel.tsx` (el aviso «solo Inicio» se renombró a «sin módulos»: ya no
  es cierto que un rol con 0 módulos vea Inicio).
- **Compatibilidad:** si la web se publica antes de pegar la migración, `fn_mi_pantalla_principal()` no existe →
  `pantallaPrincipal` queda `null` → nada cambia. **Al revés no**: si la migración se pega y la web vieja sigue
  llamando a `guardar_modulos_rol` con 3 argumentos, PostgreSQL resuelve igual contra la firma nueva (el 4.º
  parámetro tiene `DEFAULT NULL`) — sin romper. El riesgo real es el opuesto: la web nueva llama a
  `guardar_modulos_rol` con 4 argumentos con nombre; si la migración TODAVÍA no está pegada, esa llamada falla (no
  existe una función con esa firma). **Por eso la migración tiene que pegarse antes de publicar esta rama**, no al
  revés.

## Lo que se rompería sin esto

Un rol sin el módulo Inicio se quedaría viendo el tablero de Inicio igual (código muerto: el candado nuevo no
tendría efecto), o peor, la pantalla de aterrizaje no tendría a dónde mandarlo y caería en un estado indefinido. Y
seguiría sin poder elegirse una pantalla principal distinta de Inicio, que era la mitad del pedido de Felipe.

## Verificación

`pnpm --filter web exec vitest run`: 138 archivos, 89.194 pruebas en verde (incluye 2 pruebas nuevas de
`aterrizajeDe` con `pantallaPrincipal`, la regla «un módulo nuevo nace solo del líder» con la excepción de Inicio
documentada, y los ajustes a las fotos del menú que asumían Inicio incondicional). `tsc --noEmit` y `eslint` en
verde. La migración se ensayó con `begin…rollback` contra producción (proyecto `cayla-dynamic`, schema `retail`):
seis roles reales verificados uno por uno (Líder sin fila propia por ser `fijo`, Integrante y el rol a medida
«Gestión & Visión» con Inicio encendido, Terminal Ventas sin él, Terminal Almacén con él, y el rol archivado
«Administrador» correctamente excluido). **No se verificó con clics en el navegador**: este worktree no tiene sesión
propia y `preview_start` no puede apuntar a un worktree (siempre levanta el servidor del checkout principal) — habría
exigido symlinks propios de `node_modules`, copiar `.env.local` y una ruta de prueba sin login (`docs/datos/` no
aplica aquí; ver memoria de sesión «probar-ui-en-worktree-sin-login»). Queda pendiente que Felipe lo abra una vez
pegada la migración.

## Pendiente

- **Pegar la migración `20260925220000` en producción** — quedó bloqueada por el clasificador de modo automático
  («Production Deploy»): esta sesión no pudo aplicarla, solo ensayarla. Sin esto, el «Guardar» de Roles y accesos se
  rompe en cuanto se publique la web de esta rama (ver «Compatibilidad» arriba) — **la migración va antes que el
  deploy de la web, no al revés**.
- Verificación con clics reales en el navegador (ver arriba).
- El selector «Pantalla principal» valida contra el MÓDULO elegido (no contra sub-permisos ni contra la ubicación del
  que mira): un caso angosto y poco probable —elegir un módulo de Producción como principal para un rol que hoy
  trabaja parado en una tienda— podría aterrizar en una puerta que la ubicación actual no muestra. No se resolvió a
  propósito (CAYLA es 3 tiendas + 1 taller, no vale la pena la complejidad de mirar también la ubicación); si aparece
  en la práctica, se revisa.
