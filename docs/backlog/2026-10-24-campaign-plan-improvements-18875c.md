# Plan de campaña: el descuento de la campaña y la fecha límite para pedir — traspaso (2026-10-24)

Rama: `claude/campaign-plan-improvements-18875c` · ADR reservado: **0499** (el archivo aún no existe) · Migraciones reservadas: **20261024215000** (descuento) y **20261024220000** (plazo).
Aprobado por Felipe el 2026-10-24 (opción B del descuento y plazo único por campaña). **Nada de esto está en producción: cada migración espera su OK puntual.**

> **Commit de traspaso (WIP):** se subió con `--no-verify` por orden de Felipe porque el hook frena la huella de la guía de `compras.plan` (a propósito, hasta el paso 1 de «Pendiente»). El CI de esta rama estará en rojo en `lib/guias.test.ts` hasta entonces; no abras el PR antes.

## Para qué existe (lo que pidió Felipe)

El módulo Compras ▸ Plan de campaña debe servir para: (1) mapear campañas útiles o por probar, (2) proyectar, (3) asignar recursos. Del diagnóstico salió la **mejora 1**: el plan calculaba con precio de lista y no decía hasta cuándo pedir. Las mejoras 2 (Mapa del año con campañas por probar y veredicto al cerrar), el ranking por utilidad con tope, y comprar-vs-producir **no se han tocado**.

## Qué quedó hecho

| Pieza | Dónde | Estado |
|---|---|---|
| Cuenta con descuento (`cuantilCritico`, `calcular`, `margenPorPrenda`, `fraseDelMargen`) | `apps/web/lib/plan-compra-reglas.ts` | listo, con pruebas |
| Lectura y sugerido de la campaña | `apps/web/lib/plan-compra-descuento.ts` | listo |
| Fecha límite y plazo fijado | `apps/web/lib/plan-compra-plazo.ts` | listo |
| Campo «Descuento en la campaña», chips en la fila, franja de plazo | `FormularioCategoria`, `FilaCategoria`, `PlanCampana`, `ListaCategorias` | listo, visto en localhost |
| Hoja «Días para llegar» | `components/plan-compra/PlazoModal.tsx` (registrada como `aplicada` en la guía de foco) | listo, guardó en local |
| Migración del descuento (`planes_compra_lineas.descuento_pct`, `guardar_plan_compra_linea` de 12 parámetros, `fn_plan_compra_descuento`) | `supabase/migrations/20261024215000_…sql` | probada 19/19 (`pnpm pruebas:plan-compra-descuento`), **aplicada solo en local** |
| Migración del plazo (`planes_compra.dias_para_llegar` con autor, `guardar_plan_compra_plazo`, `fn_plan_compra_plazo`) | `supabase/migrations/20261024220000_…sql` | probada 11/11 (`pnpm pruebas:plan-compra-plazo`), **aplicada solo en local** |
| Maqueta interactiva | `docs/maquetas/plan-descuento-plazo-2026-10/index.html` | lista |

## Decisiones (DECIDÍ / DESCARTÉ / SE ROMPE SI)

- **Descuento guardado por categoría con sugerido de la campaña** (no leído en vivo de Etiquetas): deja registrado qué se supuso. Se rompe si la campaña cambia después y nadie abre la hoja; el aviso de diferencia (campaña ahora dice −25 %) **aún no existe** en la pantalla.
- **Lo que sobra se recupera sobre el precio de LISTA**; el descuento solo baja el margen en la campaña. Un descuento que deja el precio bajo el costo **no** es un estado imposible: se avisa, no se prohíbe.
- **Lectura aparte** (`fn_plan_compra_descuento`, `fn_plan_compra_plazo`): no se tocó `fn_plan_compra`. La web nueva solo ofrece los campos si ve `con_descuento` / `soportado`; con la base vieja el plan se calcula como antes.
- **Plazo único por campaña, fijado a mano** (14 días de fábrica = supuesto, se dice). Descartado calcularlo desde recepciones (hay 0 órdenes de compra en producción) y por proveedor/Taller. Se rompe si dos personas lo fijan a la vez (gana la última, queda firmada).
- **El sugerido es el mayor %** que alcanza a la categoría (campaña u oferta activa); no pondera por días ni tiendas. La función devuelve `dias_semana` y `solo_en` y la hoja avisa «rige solo en parte».

## Pendiente (en este orden)

1. **Paso 5 — guía interactiva.** `pnpm --filter web exec vitest run lib/guias.test.ts` falla a propósito: la huella de `compras.plan` cambió. Revisar la guía (`apps/web/lib/guias/pantallas/`), agregar pasos para el descuento, la franja y «Cambiar los días» (con `data-guia`), recorrerla con `guias:recorrer` en escritorio y a 375 px y recién entonces `pnpm --filter web guias:huella compras.plan`.
2. **Escribir `docs/adr/0499-…md`** con lo de arriba (el número ya está reservado), y el diccionario de datos si Felipe pega las migraciones.
3. **`/focus` y `/formidable`** sobre la hoja nueva y el campo de descuento; `/chaos` sobre guardar plan y guardar plazo (doble clic, dos pestañas).
4. **Aviso de deriva** en la hoja y en la fila: «la campaña ahora dice −25 %, tu plan dice −20 %» (hoy solo se ve el sugerido al abrir).
5. **Producción, solo con OK de Felipe, una por una:** ensayo revertido + huella completa (incluye `security definer`, `proconfig`, ACL; probar con `set local role authenticated`), él la pega en el SQL Editor, verificar. La del descuento exige que el md5 del cuerpo de `guardar_plan_compra_linea` sea `3d16664d66ab6c8a75d6ebd04b56052c` (igual en producción el 2026-10-24); si no, aborta sola.
6. **Abrir el PR con `/abrir-pr`** (trae main, revisa reservas, choques). No se ha abierto.
7. Decisiones de Felipe abiertas: sugerir solo el descuento que rige todos los días (hoy puede sugerir −35 % de una oferta de 4 días); si el descuento y el plazo entran en «Descargar la lista».

## Cosas que muerden

- `pnpm pruebas:plan-compra` reproduce migraciones viejas y en la base local falla (planes repetidos por etiqueta); `plan_compra_historia` falla 3 casos por ventas de otras sesiones. Son datos de la base compartida, no de estos cambios. Agregué un `drop function` de la firma de 12 parámetros después de B4 en `scripts/pruebas/plan_compra.mjs` para que en el CI no haya dos sobrecargas: **razonado, no corrido**.
- La base local es compartida con otras sesiones: quedó un plan demo **«Demo descuento CAYLA (borrar)»** (id `471aa331-90f8-44c2-8990-5fcacae04680`, con su etiqueta y una oferta «Martes y jueves de Casacas»). Otra sesión lo archivó. Bórralo al terminar.
- Un botón que dice «Volver a…» a mano rompe `lib/unificar.test.ts` (lo vigila la regla de «Volver»): por eso el botón se llama «Usar el supuesto de 14».
- No hay `node_modules` listos en un worktree nuevo ni `.env.local`: copiar `apps/web/.env.local` del checkout principal. El puerto 3010 suele estar ocupado: `preview_start` con `cayla-retail-dev` asigna otro (esta vez 3013). Usar `localhost`, no `127.0.0.1`.
- En el panel del navegador, con una hoja abierta la captura sale a medias; verificar con texto/DOM.

## Cómo verificar en 5 minutos

```bash
pnpm pruebas:plan-compra-descuento && pnpm pruebas:plan-compra-plazo      # 19/19 y 11/11 (ROLLBACK)
cd apps/web && npx vitest run lib/plan-compra && npx tsc --noEmit -p .    # 335+ pruebas, tipos limpios
pnpm knip && pnpm knip:produccion                                          # sin código muerto nuevo
```
Pantalla: `/compras/plan?plan=<id del plan demo>` → franja de plazo, «Cambiar los días», y en la hoja de Casacas el campo «Descuento en la campaña».

## Prompt maestro para continuar en otra cuenta

> Estás en el repo cayla-retail (ERP de CAYLA: Next.js + Supabase con RLS, schema `retail`). Lee `CLAUDE.md` y `docs/backlog/2026-10-24-campaign-plan-improvements-18875c.md` completo antes de tocar nada. Trabaja en la rama `claude/campaign-plan-improvements-18875c` (haz `git fetch` y `git log -5` para ver dónde quedó; si trabajas en otro worktree, `pnpm install`, copia `apps/web/.env.local` del checkout principal).
>
> Contexto: continúa la **mejora 1 del Plan de campaña** (descuento de la campaña en el cálculo + fecha límite para pedir), ADR-0499 reservado, migraciones 20261024215000 y 20261024220000 escritas y probadas pero **solo aplicadas en la base local**. Felipe ya aprobó el diseño; **producción espera su OK puntual, migración por migración**: nunca pegues SQL en producción ni lo apliques con el MCP sin un OK nuevo, y antes haz ensayo revertido y la huella completa. No abras PR sin `/abrir-pr`.
>
> Hazlo en este orden, un paso verificable a la vez: (1) pon al día la guía interactiva de `compras.plan` (la huella falla a propósito), córrela con `guias:recorrer` en escritorio y a 375 px, y acepta la huella después; (2) escribe `docs/adr/0499-…md` (DECIDÍ/DESCARTÉ/SE ROMPE SI, como los demás ADR del Plan); (3) corre `/focus`, `/formidable` y `/chaos` sobre la hoja del descuento y la del plazo; (4) agrega el aviso de deriva «la campaña ahora dice X %, tu plan dice Y %»; (5) cuando Felipe lo ordene, prepara producción.
>
> Reglas que no se negocian: español y vocabulario de CAYLA (colaborador, sede, cliente); solo tokens de color de `apps/web/app/globals.css` (nada de hex); usa las piezas existentes (`Aviso`, `Chip`, `Boton`, `Modal`, `CampoGuiado`), no inventes otras; toda hoja con campos lleva guía de foco; cada respuesta lleva El trabajo, La objeción y Lo que no pidió, y cada decisión estructural lleva DECIDÍ / DESCARTÉ / SE ROMPE SI; antes de decir «listo», responde concurrencia, caída externa y persona sin contexto. Las migraciones llevan prefijo `retail.` y se pegan sin tocar; una migración no mezcla `alter` de tablas en uso con políticas. Al cerrar: una entrada de bitácora en `docs/bitacora/AAAA-MM-DD-<tema>.md`, nunca en `docs/BITACORA.md`.
>
> Primero dime en cinco líneas qué entendiste y qué vas a hacer, y espera mi confirmación para el paso (1).
