# ADR-0037 — shadcn/ui entra a CAYLA sin gastar el rojo sagrado

**Fecha:** 2026-09-11
**Estado:** Configurado y verificado (compilación de tokens); ningún componente instalado
todavía — a pedido explícito de Felipe, esta sesión solo deja la base lista.
**Afecta:** `apps/web/app/globals.css`, `apps/web/components.json`, `apps/web/lib/utils.ts`,
`apps/web/package.json`

## Contexto

Felipe pidió configurar shadcn/ui con los colores del sistema ya existente. El repo no
tenía shadcn (sin `components.json`, sin `cn()`, sin `class-variance-authority`) — todo el
kit de UI es propio (`components/ui/campos.tsx`: `<Boton>`, `<Campo>`, `<Desplegable>`)
sobre los tokens de `globals.css` (`--color-rojo/crema/tinta/sand/papel`).

shadcn no trae paleta: lee un puñado de nombres semánticos (`background`, `primary`,
`accent`, `destructive`, `ring`, …) y cualquier componente que se instale después con
`npx shadcn add <lo-que-sea>` se pinta solo con lo que esos nombres apunten.

## La decisión

**`primary` es tinta, no rojo.** El brandbook dice "rojo, acento sagrado, máx. 2 por
pantalla", y `<Boton peso="primario">` ya lo respeta: `bg-tinta`, no `bg-rojo`. Si `primary`
de shadcn fuera rojo, cada componente nuevo pintaría rojo por defecto — el presupuesto del
acento se gastaría en el primer componente que alguien jale, sin que nadie lo decidiera a
propósito.

Mapeo completo, calcado de patrones que el propio kit ya usa (no inventado):

| Token shadcn | Apunta a | Por qué |
|---|---|---|
| `background` / `foreground` | crema / tinta | el fondo y texto de toda la app |
| `card` / `popover` | papel | mismo tono que `.card-cayla` |
| `primary` | tinta (fondo), crema (texto) | igual que `<Boton primario>` |
| `secondary` / `muted` | sand | fondos neutrales, igual que bordes/recuadros del sistema |
| `muted-foreground` | tinta-60 | texto secundario, ya definido para eso |
| `accent` (hover neutral de menús/listas) | sand | igual que `hover:bg-tinta/[0.03]` de `Desplegable` — el rojo no se gasta en pasar el mouse |
| `destructive` | rojo-profundo | dos rojos por diseño desde ADR-0012: `rojo` se mueve/reacciona (foco, hilo), `rojo-profundo` es cuerpo fijo — "borrar" pide el que no se confunde con el foco |
| `border` / `input` | sand | mismo borde que `.card-cayla` y los campos |
| `ring` (foco de teclado) | rojo | igual que `focus-visible:outline-rojo/60` de `<Boton>` |

**Sin `--radius` propio.** shadcn normalmente deriva `sm/md/lg/xl` de una sola variable.
CAYLA ya tiene su propia escala progresiva (`--radius-sm/md/lg/xl/2xl`, ADR-0012) con una
razón concreta: un control chico con el radio de una tarjeta grande se ve deformado. Las
utilidades `rounded-sm/md/lg/xl` de Tailwind ya resuelven solas contra esos tokens — no
había nada que agregar.

**Sin modo oscuro.** El brandbook es una sola paleta ("tres colores, no más, nunca más");
un `.dark` sería inventar una segunda identidad que nadie pidió.

**Configuración manual, no `npx shadcn init`.** El CLI pregunta si puede reescribir
`globals.css`, y ese archivo tiene 300+ líneas de identidad y comentarios de decisiones ya
tomadas (radios, sombras, animación). Escribir el puente a mano evita el riesgo de que el
CLI lo reformatee o le borre contexto.

## Consecuencias

- Ningún componente existente cambia: `<Boton>`, `<Campo>`, `<Desplegable>` siguen iguales.
  El puente es aditivo — nombres nuevos apuntando a colores que ya existían.
- El día que haga falta un componente que el kit propio no cubre (tabla, combobox con
  búsqueda, calendario), `npx shadcn add <componente>` lo trae ya pintado con la identidad
  CAYLA, sin retocar colores a mano.
- Queda sin decidir (no bloquea nada hoy): si un componente shadcn debería reemplazar una
  pieza ya construida a mano (ej. `Desplegable` propio vs. `Select` de shadcn) — se decide
  caso por caso cuando aparezca la necesidad real, no de antemano.

## Cómo se verificó

No se pudo verificar renderizando una página real: el entorno no tiene `.env.local`
(pre-existente, no de esta sesión — bloquea cualquier ruta porque `proxy.ts` exige
`NEXT_PUBLIC_SUPABASE_URL`). En su lugar se compiló `globals.css` con PostCSS +
`@tailwindcss/postcss` fuera de Next, forzando con `@source inline(...)` la generación de
las clases (`bg-primary`, `bg-destructive`, `ring-ring`, `border-border`, etc.) y se
inspeccionó el CSS resultante: cada una encadena correctamente hasta el color CAYLA
esperado (ej. `.bg-primary { background-color: var(--color-primary) }` →
`--color-primary: var(--color-tinta)` → `--color-tinta: #1a1a18`). `tsc --noEmit` y
`eslint` sobre los archivos nuevos, limpios. El script de verificación fue un archivo
temporal, borrado antes de cerrar — no queda en el repo.

**Lo que falta ver con los ojos:** el primer componente real instalado (`npx shadcn add
button`, por ejemplo) en el navegador, cuando haga falta uno.
