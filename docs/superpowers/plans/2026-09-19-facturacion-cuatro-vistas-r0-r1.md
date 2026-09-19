# Facturación en cuatro vistas — plan de implementación (R0 y R1)

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para llevar el avance.

**Objetivo:** partir `/vender/facturacion` (una página larga) en cuatro vistas por ruta —Resumen, Proformas, Comprobantes y Códigos de descuento— bajo un layout común con cabecera, pestañas de vidrio y los modales de emitir y de nueva proforma dibujados una sola vez. Esta primera entrega (R1) es solo estructura: los paneles actuales se muestran tal cual.

**Arquitectura:** un `layout.tsx` de servidor lee lo mínimo para el marco (series, tiendas, contadores de las pestañas) sin poder caerse, y se lo pasa a `FacturacionShell` (cliente), que guarda qué modal está abierto y lo comparte por contexto. Cada vista es una `page.tsx` que se protege sola (`exigirLider`) y lee lo suyo. Las reglas (mes de la URL, pestañas, contadores, vencidas) son funciones puras con prueba; el vidrio es un bloque de clases dentro de `@layer components`.

**Stack:** Next.js 16 (App Router) · React 19 · Supabase (RLS + RPC) · Tailwind v4 · vitest 4 (sin jsdom ni testing-library: solo funciones puras) · `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-09-18-facturacion-cuatro-vistas-design.md` (aprobado por Felipe el 2026-09-19). **ADR:** `docs/adr/0121-facturacion-en-cuatro-vistas-con-una-isla-de-vidrio.md` (nació como 0113). Quien ejecute este plan lee las dos cosas: el spec dice *qué* y *por qué*; este plan dice *en qué orden y con qué código*.

## Alcance de este plan

- **R0 y R1, al detalle.** R0 no toca código de producto; R1 entrega las cuatro rutas, las pestañas, la cabecera, los dos modales extraídos, el redirect y el retiro de lo viejo.
- **R2, R3 y R4, como fases** (al final). No se bajan a tareas todavía por una razón concreta, no por pereza: R2 se apoya en `CifraAnimada`, `FechaHoraLima`, `anim-sube`, `check-trazo` e `hilo-dibuja` de Atelier, que **el 2026-09-19 siguen sin estar en `main`** (la rama `claude/interface-recommendations-8ce365` ni siquiera está subida a GitHub: solo existe en un worktree local). Escribir tareas contra una API que puede cambiar al fusionarse sería inventarla. Al cerrar R1 se escribe el plan de R2 a R4 con Atelier a la vista (ver «Punto de decisión»).

## Restricciones globales

Valores copiados del spec y de `CLAUDE.md`. Todas las tareas los incluyen implícitamente.

- **Idioma y vocabulario:** español siempre (también los comentarios que documentan lógica de negocio). «colaborador/integrante», «líder de equipo/encargado de sede», «sede/tienda», «clienta». Nunca «empleado/jefe/sucursal».
- **Sin cambios de esquema, RPC ni RLS.** Ninguna tarea de R1 escribe una migración. Las RPC que ya llaman los modales (`emitir_comprobante`, `registrar_serie_comprobante`, `crear_proforma`, `convertir_proforma_a_comprobante`, `marcar_comprobante_no_emitido`) no cambian de nombre ni de parámetros.
- **Solo tokens del sistema.** «El vidrio no agrega ningún color.» Los colores salen de `--color-*`; nada de hex nuevos (los `rgb(26 26 24 / …)` y `rgb(255 255 255 / …)` de las sombras y el vidrio son el tinte del propio sistema, igual que `--shadow-*`).
- **Clases de componente nuevas → dentro de `@layer components` (ADR-0105).** `apps/web/lib/globals-capas.test.ts` falla si una regla de clase queda fuera de una capa. Fuera de capa solo quedan `body`, los `@keyframes`, la impresión y el `!important` de movimiento reducido.
- **Las variables y clases de la isla viven bajo `.tema-vidrio` (raíz del layout), no en `:root`.**
- **Sin sombra en reposo** (ADR-0012); la sombra es solo para lo que flota o para el hover.
- **Pestañas:** contenedor con padding 4 px, radio 14 px, fondo `rgb(255 255 255 / .45)`, borde `1px solid rgb(26 26 24 / .09)` y `blur(22px)`. Píldora `bg-tinta` de radio 10 px con sombra `0 8px 18px -10px rgb(26 26 24 / .75)`. Etiquetas de 14 px en minúscula (400; 600 la activa), `tinta`, y `crema` en la activa. Padding 8 × 15 px. Contadores de 10.5 px semibold. La píldora se desliza con transición de transformación y ancho, 450 ms, `--ease-cayla`.
- **Botones:** los de la cabecera miden 36 px, con padding 0 14 px, radio 10 px, 13 px peso 500 en minúscula e icono de 15 px. `primario` es `bg-tinta text-crema`. `vidrio` lleva fondo `rgb(255 255 255 / .58)`, borde `rgb(26 26 24 / .12)` y `blur(18px)`. Al pasar el mouse suben 1 px con una sombra suave. Los de fila miden 30 px, radio 8 px, 12.5 px, borde `tinta/28`, y el hover rellena de `tinta`. `fila-alerta` lleva borde y texto en `rojo-profundo` y rellena de rojo al pasar el mouse.
- **Cabecera:** eyebrow `label-cayla text-[11px] text-tinta/65` «Vender»; `h1` `font-display text-2xl`.
- **Accesibilidad:** el estado nunca va solo en color; foco visible con el estilo del sistema (`outline-rojo/60`); la píldora es decorativa (`aria-hidden`); los contadores tienen texto.
- **`exigir` donde un número equivocado es una decisión equivocada; `tolerar` en lo secundario** (`lib/resultado.ts`). Los contadores de las pestañas y los datos del marco son secundarios; las vistas usan `exigir`.
- **Tres capas de seguridad se mantienen:** pantalla (`exigirLider`), RPC y RLS. El layout no vuelve a ejecutarse al navegar entre sus hijas, así que cada `page.tsx` repite la puerta.
- **Nunca `DELETE`** en `movimientos` ni en catálogos con historial (R1 no toca datos).
- **Commits:** Conventional Commits con el dominio real como scope (`feat(facturacion): …`). **No se hace push** salvo que Felipe lo pida; antes de cualquier push se sincroniza `main` y se re-verifica el número del ADR.

## Línea base verificada el 2026-09-19

Verificado con `git` contra `origin/main` (`3a5b791c`) — re-verificar en R0 porque `main` se mueve todo el día.

| Qué | Estado |
|---|---|
| Rama de trabajo | `claude/billing-design-analysis-ee464b`, con `main` ya fusionada (0 commits detrás). Solo chocaron `BACKLOG.md` y `BITACORA.md`. |
| Atelier (ADR-0106) | **No está en `main`.** No existen `components/ui/CifraAnimada.tsx`, `components/FechaHoraLima.tsx` ni `components/ui/EncabezadoPagina.tsx`, y `globals.css` no tiene `anim-sube`, `hilo-dibuja` ni `check-trazo`. La rama no está en GitHub. |
| `panel-comercial` (ADR-0110) | **No está en `main`** (`fn_comercial_*` no aparece en sus migraciones). Vive en `origin/claude/panel-comercial`. |
| ADR | El 0113 lo reclaman otras dos ramas; `main` tiene el 0114 y el 0116; hay ramas con 0117 a 0120; el 0115 lo dejó libre la sesión de Caja. **Se toma el 0121** (libre en todas las refs ese día). |
| ADR-0105 | Vigente en `main`: clases de componente en `@layer components` + `lib/globals-capas.test.ts`. |
| Base de desarrollo | `apps/web/.env.local` del checkout principal apunta a Supabase **local** en `127.0.0.1:54421` (el stack de `cayla-retail`, el correcto para Facturación) con `LUCODE_ENTORNO=sandbox`. La verificación de R1 corre contra la base local, no contra producción. |
| `Modal` | `components/ui/Modal.tsx`: `<Modal titulo onClose ancho>{children | (cerrar) => …}</Modal>`; se monta solo cuando está abierto y anima la salida antes de llamar `onClose`. |
| `useSearchParams` | Los clientes que lo usen dentro del layout van dentro de `<Suspense>`. |
| ESLint | `eslint-config-next` con `react-hooks/set-state-in-effect` activa (el repo la desactiva línea a línea con una razón). Medir el DOM y escribir directo en el estilo, como hace `components/Ayuda.tsx`, evita el problema. |

## Convenciones para ejecutar

- **Shell.** Windows: PowerShell y Bash conviven. **`git merge` va por PowerShell** (en Bash lo bloquea el entorno). Las rutas con `(app)` se citan.
- **Preparar el árbol (una vez, en R0):** `pnpm install` desde la raíz y copiar `.env.local` (está en `.gitignore`):
  ```powershell
  Copy-Item C:\Users\danyj\cayla-retail\apps\web\.env.local apps\web\.env.local
  pnpm install
  ```
- **Probar:** una prueba `pnpm --filter web exec vitest run lib/<archivo>.test.ts`; todas `pnpm --filter web test`; tipos `pnpm --filter web typecheck`; lint `pnpm --filter web lint`.
- **Hook pre-commit** (`.githooks/pre-commit`): si el commit trae `.ts/.tsx` de `apps/web`, corre `tsc` (solo frena si el error es de un archivo del commit), **toda** la suite de vitest y `eslint` sobre los archivos del commit; un commit solo de docs no lo paga. Requiere `pnpm install`. No se salta con `--no-verify`.
- **Mensaje de commit:** PowerShell 5.1 parte las comillas dobles. Escribe el mensaje en un archivo temporal **fuera del repo** con la herramienta de escritura y usa `git commit -F <archivo-con-el-mensaje>`; el texto de cada mensaje está en la tabla «Mensajes de commit» de más abajo. Cierra el mensaje con la línea de coautoría que indique tu harness. Antes de `git add`, mira `git diff --cached --name-only`: un `git rm` previo se cuela.
- **`graphify`:** no correr `graphify update .` (ensucia ~90 archivos de `graphify-out/`). `graphify query` sí, pero deja `graphify-out/cache/last_query_stamp` modificado: restáuralo con `git checkout -- graphify-out/cache/last_query_stamp` antes de commitear.
- **Servidor de desarrollo** (nunca `preview_start` para esto: sirve otra carpeta): desde la raíz del worktree, en segundo plano,
  ```powershell
  pnpm --filter web exec next dev -p 3100
  ```
  El panel del navegador integrado tiene sus propias cookies: **Felipe tiene que iniciar sesión ahí** (`http://localhost:3100/login`) con el panel visible. Un panel oculto pinta en blanco y frena las animaciones. Si un clic no aterriza, `element.click()` por DOM.
- **Nunca se transmite (`Transmitir`) ni se emite contra producción** en las pruebas. La base local + `LUCODE_ENTORNO=sandbox` es el único entorno de escritura de R1.

## Mensajes de commit

Un commit por tarea. Primera línea = asunto; lo de abajo = cuerpo (una o dos frases: el porqué, no el qué). Ajusta el cuerpo de 0.1 y 0.2 a lo que hallaste.

| Tarea | Mensaje |
|---|---|
| 0.1 | `docs(facturacion): R0 — main sincronizada y coordinación verificada` · «Se fusiona main, se confirma que el ADR 0121 sigue libre y se deja constancia de si Atelier y panel-comercial ya entraron a main.» |
| 0.2 | `docs(facturacion): R0 — producción verificada (solo lectura)` · «Existencia de ventas.estado, definición viva de fn_ventas_del_dia, series por tienda y línea base de conteos, con las reglas de decisión del spec aplicadas.» |
| 1 | `feat(facturacion): reglas puras del mes, las pestañas y los contadores; vencida derivada en proformas` · «La cola «por enviar» no tiene filtro de mes y las proformas vencidas dejan de contar como vigentes. Nadie escribe `vencida` en la base: se deriva, como `porVencer`.» |
| 2 | `feat(facturacion): lecturas tolerantes para los contadores de las pestañas y exigirLider` · «Los contadores son datos secundarios: si su consulta falla se ocultan en vez de tumbar el marco. `exigirLider` repite la primera de las tres capas en cada página.» |
| 3 | `feat(facturacion): BotonCompacto y el bloque de vidrio de la isla en @layer components` · «El vidrio vive bajo .tema-vidrio y dentro de @layer components (ADR-0105): el candado de globals-capas sigue verde.» |
| 4 | `refactor(facturacion): EmitirComprobanteModal sale de ComprobantesPanel sin cambiar su lógica` · «Se mueve, no se reescribe. El modal se dibuja siempre y solo se oculta, para que el token de idempotencia viva tanto como antes.» |
| 5 | `refactor(facturacion): NuevaProformaModal sale de ProformasPanel sin cambiar su lógica` · «Se mueve, no se reescribe. El modal de convertir se queda en el panel: necesita la proforma de la fila.» |
| 6 | `feat(facturacion): shell, cabecera, pestañas y selector de mes (aún sin rutas)` · «Piezas del marco sin conectar todavía; la aplicación no cambia hasta el commit siguiente.» |
| 7 | `feat(facturacion): cuatro vistas por ruta bajo un layout; /vender/descuentos redirige` · «El layout lee el marco sin poder caerse; cada página repite exigirLider. Se borran VenderNav y la ruta vieja de descuentos.» |
| 8 | `docs(facturacion): cierre de R1 — ARQUITECTURA, BACKLOG y BITÁCORA` · «R1 verificada contra los nueve criterios del spec en la base local.» |

## Mapa de archivos (todo en `apps/web/` salvo que se diga)

| Archivo | Acción | Responsabilidad | Tarea |
|---|---|---|---|
| `lib/facturacion-reglas.ts` | Crear | Mes de la URL, pestañas, contadores, tiendas: funciones puras | 1 |
| `lib/facturacion-reglas.test.ts` | Crear | Pruebas de lo anterior | 1 |
| `lib/proformas-reglas.ts` | Modificar | `vencida` derivada, junto a `porVencer` | 1 |
| `lib/proformas-reglas.test.ts` | Crear | Pruebas de `marcarPorVencer` | 1 |
| `lib/comprobantes.ts` | Modificar | `getResumenPorEnviar()`; `getSeriesComprobantes` con `cache` | 2 |
| `lib/proformas.ts` | Modificar | `getResumenProformas()` | 2 |
| `lib/persona-actual.ts` | Modificar | `exigirLider()` | 2 |
| `components/ui/BotonCompacto.tsx` | Crear | El botón de la isla | 3 |
| `app/globals.css` | Modificar | Bloque de la isla dentro de `@layer components` | 3 |
| `components/EmitirComprobanteModal.tsx` | Crear | El modal de emitir, extraído sin cambiar su lógica | 4 |
| `components/ComprobantesPanel.tsx` | Modificar | Usa el modal extraído (T4); luego lo abre por contexto (T7) | 4, 7 |
| `components/NuevaProformaModal.tsx` | Crear | El modal de nueva proforma, extraído | 5 |
| `components/ProformasPanel.tsx` | Modificar | Ídem | 5, 7 |
| `lib/useFacturacionAcciones.ts` | Crear | Contexto: quién abre los modales | 6 |
| `components/FacturacionCabecera.tsx` | Crear | Título y las dos acciones globales | 6 |
| `components/FacturacionPestanas.tsx` | Crear | Pestañas de vidrio con píldora que se desliza | 6 |
| `components/SelectorMesFacturacion.tsx` | Crear | ← mes · mes · mes → (servidor) | 6 |
| `components/FacturacionShell.tsx` | Crear | Padre con estado: modales, contexto, cabecera, pestañas | 6 |
| `app/(app)/vender/facturacion/layout.tsx` | Crear | Marco de servidor que no puede caerse | 7 |
| `app/(app)/vender/facturacion/error.tsx` | Crear | Error de una vista con «Reintentar» | 7 |
| `app/(app)/vender/facturacion/page.tsx` | Reescribir | Resumen | 7 |
| `app/(app)/vender/facturacion/proformas/page.tsx` | Crear | Vista Proformas | 7 |
| `app/(app)/vender/facturacion/comprobantes/page.tsx` | Crear | Vista Comprobantes | 7 |
| `app/(app)/vender/facturacion/descuentos/page.tsx` | Crear | Vista Códigos (se mueve) | 7 |
| `app/(app)/vender/descuentos/page.tsx` | **Borrar** | Se mudó | 7 |
| `components/VenderNav.tsx` | **Borrar** | Nadie lo importa | 7 |
| `next.config.ts` | Modificar | Redirect `/vender/descuentos` → nueva ruta | 7 |
| `docs/ARQUITECTURA.md`, `docs/BACKLOG.md`, `docs/BITACORA.md`, `docs/SESIONES-ACTIVAS.md` (raíz del repo) | Modificar | Cierre documental | 8 |

## Orden y dependencias

```
R0 (0.1, 0.2)  →  Task 1 ─┬─→ Task 2 ────────────────┐
                          ├─→ Task 6 (necesita 1, 3, 4, 5) ─→ Task 7 ─→ Task 8
                 Task 3 ──┤                            ↑
                 Task 4 ──┤ (independientes entre sí)  │
                 Task 5 ──┘────────────────────────────┘
```

Las tareas 1, 3, 4 y 5 son independientes entre sí y se pueden repartir a subagentes distintos; la 2 necesita la 1; la 6 necesita 1, 3, 4 y 5; la 7 necesita todas; la 8 es la última. Cada tarea termina con tipos, lint y pruebas en verde y con un commit propio; hasta la 7 la aplicación se comporta como antes.

---

# R0 — Preparación (sin código de producto)

### Task 0.1: Sincronizar `main` y confirmar la coordinación

**Files:**
- Modify: `docs/BACKLOG.md` (sección «🎯 Facturación en cuatro vistas»: línea R0)
- Modify (solo si el número de ADR chocó): `docs/adr/0121-…md`, el spec, `docs/BACKLOG.md`, `docs/BITACORA.md`, `docs/SESIONES-ACTIVAS.md`

**Interfaces:**
- Consumes: nada.
- Produces: un árbol al día con `main`, el número de ADR confirmado, y la constancia de si Atelier y `panel-comercial` ya entraron.

- [ ] **Step 1: Traer `main` y ver si la rama quedó atrás**

```bash
git fetch origin
git rev-list --count HEAD..origin/main   # commits que main tiene y esta rama no
git rev-list --count origin/main..HEAD   # commits de esta rama que main no tiene
```

Si el primer número es mayor que 0, fusiona **por PowerShell**:

```powershell
git merge origin/main --no-commit --no-ff
git diff --name-only --diff-filter=U        # archivos en conflicto
```

Los conflictos esperables son `docs/BACKLOG.md` y `docs/BITACORA.md` (texto añadido por ambos lados en el mismo punto): se conservan las dos partes. Para verlo antes sin tocar el árbol: `git merge-tree --write-tree --name-only --messages HEAD origin/main`. Termina con `git commit -F <archivo>` (mensaje: «merge: fusiona main en el rediseño de Facturación»).

- [ ] **Step 2: Confirmar que el ADR 0121 sigue libre**

```bash
export MSYS_NO_PATHCONV=1
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -v 'origin/HEAD'); do
  git ls-tree -r --name-only "$b" docs/adr/ 2>/dev/null | grep -E 'adr/0121-' | grep -v 'facturacion-en-cuatro-vistas' | sed "s#^#$b: #"
done
git worktree list --porcelain | grep '^worktree ' | sed 's/^worktree //' | while read d; do ls "$d/docs/adr/" 2>/dev/null | grep -E '^0121-' | grep -v facturacion-en-cuatro-vistas | sed "s#^#$(basename "$d"): #"; done
```

Esperado: ninguna línea. Si aparece otro ADR con 0121, toma el siguiente número libre (mira también los 0122 en adelante con el mismo comando) y renombra: `git mv docs/adr/0121-… docs/adr/<nuevo>-…`, y cambia `0121` por el nuevo número en el título del ADR, en el spec (cabecera, §10 R0, §11, §14), en `BACKLOG.md`, `BITACORA.md` (dos entradas) y `SESIONES-ACTIVAS.md`.

- [ ] **Step 3: Confirmar el estado de Atelier y de `panel-comercial`**

```bash
export MSYS_NO_PATHCONV=1
for f in apps/web/components/ui/CifraAnimada.tsx apps/web/components/FechaHoraLima.tsx apps/web/components/ui/EncabezadoPagina.tsx; do
  git cat-file -e "origin/main:$f" 2>/dev/null && echo "SI  $f" || echo "NO  $f"
done
git show origin/main:apps/web/app/globals.css | grep -cE "anim-sube|hilo-dibuja|check-trazo"   # 0 = no está
git grep -l "fn_comercial_" origin/main -- supabase/migrations || echo "panel-comercial: no está en main"
git branch -r --list "origin/claude/interface-recommendations*" || true                            # vacío = Atelier no está en GitHub
```

Anota el resultado. **Si Atelier ya entró**, R2 deja de estar bloqueada: en el paso 5 dilo y, al cerrar R1, el plan de R2 a R4 se escribe sin «punto de decisión».

- [ ] **Step 4: Mirar el tablero de sesiones**

Lee `docs/SESIONES-ACTIVAS.md` (sección «Activas ahora»). Busca filas que toquen `vender/facturacion`, `ComprobantesPanel`, `ProformasPanel`, `VentasDelDiaPanel`, `CodigosDescuentoPanel`, `AppShell.tsx` o `globals.css`. Si alguien toca `globals.css` (la sesión de «Ventas visual» y la de Punto de Venta lo hacían el 2026-09-18: tokens `--color-metodo-*`), tu bloque de la Task 3 es autocontenido y va **al final del último `@layer components`, antes del bloque de movimiento reducido**; aun así, sincroniza `main` justo antes de esa tarea.

- [ ] **Step 5: Preparar el árbol y dejar constancia**

```powershell
Copy-Item C:\Users\danyj\cayla-retail\apps\web\.env.local apps\web\.env.local
pnpm install
pnpm --filter web test        # línea base: debe pasar entera antes de tocar nada
```

En `docs/BACKLOG.md`, sección «🎯 Facturación en cuatro vistas», cambia la línea R0 a `- [x]` **solo cuando también esté hecha la Task 0.2**; por ahora añade debajo, en una línea, la fecha y lo verificado en los pasos 1 a 3 (por ejemplo: «2026-09-19: `main` fusionada; ADR 0121 libre; Atelier no está en `main`; `panel-comercial` no está en `main`»).

- [ ] **Step 6: Commit (solo si cambió algo)**

```bash
git add docs/BACKLOG.md
git commit -F <archivo-con-el-mensaje>   # docs(facturacion): R0 — main sincronizada y coordinación verificada
```

---

### Task 0.2: Verificar producción (solo lectura)

**Files:**
- Modify: `docs/BACKLOG.md` (línea R0 y una nota con los hallazgos)

**Interfaces:**
- Consumes: acceso de solo lectura al proyecto de Supabase `cayla-dynamic` (el schema de retail vive dentro de él, en `retail`).
- Produces: tres hechos que fijan el diseño de R2/R3: si existe `retail.ventas.estado`, si `fn_ventas_del_dia` excluye ventas anuladas (y si tiene una sola firma), y qué series hay hoy por tienda; más la línea base de conteos para comparar con los contadores de R1.

**Regla:** este paso **solo lee**. Nada de `insert/update/delete/alter`. Cada tabla lleva el prefijo `retail.` (en el proyecto de Dynamic, `public` es el schema de Dynamic y verías `relation … does not exist`).

- [ ] **Step 1: Correr las consultas**

Usa el conector de Supabase (`execute_sql`) sobre `cayla-dynamic`. Si no está autorizado o no responde, pídele a Felipe que pegue el bloque en el SQL Editor de producción y te devuelva las filas.

```sql
-- (a) ¿existe ventas.estado y con qué valores?
select column_name, data_type
  from information_schema.columns
 where table_schema = 'retail' and table_name = 'ventas' and column_name = 'estado';

select estado, count(*) as n from retail.ventas group by estado order by estado;

-- (b) definición viva de fn_ventas_del_dia: ¿una sola firma? ¿filtra por estado?
select p.oid::regprocedure as firma, pg_get_functiondef(p.oid) as definicion
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname = 'fn_ventas_del_dia';

-- (c) series registradas por tienda y tipo
select u.nombre as ubicacion, u.tipo as tipo_ubicacion, s.tipo, s.serie, s.siguiente_numero
  from retail.series_comprobantes s
  join retail.ubicaciones u on u.id = s.ubicacion_id
 order by u.nombre, s.tipo;

-- (d) línea base: con esto se comparan los contadores de R1 (Task 8)
select estado, count(*) as n, min(created_at) as mas_antiguo
  from retail.comprobantes group by estado order by estado;

select count(*) filter (where estado = 'vigente') as vigentes,
       count(*) filter (where estado = 'vigente' and vence_at is not null and vence_at <= now()) as vencidas_derivadas
  from retail.proformas;
```

- [ ] **Step 2: Aplicar las reglas de decisión del spec (§10, R0)**

| Hallazgo | Qué se hace |
|---|---|
| (a) no existe `ventas.estado` | El comparativo «mismo día de la semana pasada» de R2 queda oculto por `tolerar` (sin comparativo, nunca uno inventado). Anótalo en BACKLOG. |
| (b) devuelve más de una fila | Hay sobrecargas duplicadas de `fn_ventas_del_dia`: **para el trabajo y avisa a Felipe** antes de seguir (una caída real de `/productos` ya pasó así). |
| (b) la definición incluye ventas anuladas (no filtra por estado) | **R2 no se cierra** hasta que se excluyan o se etiqueten. La corrección es una migración: se propone a Felipe y **espera su OK** (no se aplica sola). |
| (c) faltan series `nota_credito` en las tiendas | Es lo esperado (BACKLOG: «Pendiente real de Felipe»). La franja de series de R3 lo mostrará. Solo anótalo. |
| (d) | Guarda los números en la nota de BACKLOG con la fecha: son la verdad contra la que se compara en la Task 8. |

- [ ] **Step 3: Dejar constancia y cerrar R0**

En `docs/BACKLOG.md`, sección Facturación: marca R0 como `- [x]` y agrega una línea con la fecha y lo hallado en (a), (b) y (c), y los números de (d).

- [ ] **Step 4: Commit**

```bash
git add docs/BACKLOG.md
git commit -F <archivo-con-el-mensaje>   # docs(facturacion): R0 — producción verificada (solo lectura)
```

---

# R1 — Estructura (sin depender de Atelier)

### Task 1: Reglas puras (TDD)

**Files:**
- Create: `apps/web/lib/facturacion-reglas.ts`
- Create: `apps/web/lib/facturacion-reglas.test.ts`
- Modify: `apps/web/lib/proformas-reglas.ts`
- Create: `apps/web/lib/proformas-reglas.test.ts`

**Interfaces:**
- Consumes: `EstadoComprobante` de `./comprobantes-reglas`; `marcarPorVencer` y `ProformaFila` de `./proformas-reglas`; `HORAS_PROFORMA_POR_VENCER` (= 48) de `@cayla-retail/shared`.
- Produces (todo lo usan las tareas 2, 6 y 7):
  - `type Mes = { anio: number; mes: number }`, `NOMBRES_MES`, `esMesValido(m)`, `mesDeParametro(m, actual): Mes`, `paramDeMes(mes): string`, `mesAnterior(mes)`, `mesSiguiente(mes)`, `esMismoMes(a, b)`
  - `type ClavePestana`, `type PestanaFacturacion`, `PESTANAS`, `pestanaDeRuta(pathname): ClavePestana`, `hrefPestana(pestana, m): string`
  - `type ResumenPorEnviar = { porEnviar; rechazados; masAntiguoAt }`, `resumenPorEnviar(filas)`
  - `type ResumenProformas = { vigentes; monto; porVencer; vencidas }`, `resumenProformas(filas, ahora?)`
  - `type ConteoPestana`, `type ConteosPestanas`, `conteosDePestanas(porEnviar, proformas)`
  - `tiendasOperativas(ubicaciones)`, `ubicacionActualDe(tiendas, ubicacionIdDeLaPersona): string`
  - En `Proforma`: el campo derivado `vencida: boolean`. `ProformaFila` pasa a ser `Omit<Proforma, "porVencer" | "vencida">`.

> **Nota de alcance.** El spec lista `vencida` en R3 (la pantalla de Proformas). La *regla* entra ya en R1 porque el contador de la pestaña «Proformas» cuenta solo las vigentes que aún valen (§9), y una sola fuente de verdad evita escribirla dos veces. El panel la adopta en R3.

Los imports de estos archivos son **relativos** (`./…`): vitest corre sin configuración y no resuelve el alias `@/`.

- [ ] **Step 1: Escribir la prueba que falla — `vencida`**

`apps/web/lib/proformas-reglas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { marcarPorVencer, type ProformaFila } from "./proformas-reglas";

const AHORA = Date.parse("2026-09-19T15:00:00Z");
const HORA = 3600 * 1000;
const en = (horas: number) => new Date(AHORA + horas * HORA).toISOString();

function proforma(sobre: Partial<ProformaFila>): ProformaFila {
  return {
    id: "p1",
    ubicacion_id: "u1",
    cliente_nombre: null,
    cliente_num_doc: null,
    total: 100,
    estado: "vigente",
    comprobante_id: null,
    created_at: "2026-09-10T15:00:00Z",
    vence_at: null,
    ...sobre,
  };
}

describe("marcarPorVencer — «vencida» y «por vencer» son dos mitades distintas de las vigentes", () => {
  it("una vigente cuyo vence_at ya pasó es vencida, y no está por vencer", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(-1) })], AHORA);
    expect(p.vencida).toBe(true);
    expect(p.porVencer).toBe(false);
  });

  it("en el mismo instante en que vence ya cuenta como vencida", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(0) })], AHORA);
    expect(p.vencida).toBe(true);
    expect(p.porVencer).toBe(false);
  });

  it("una vigente que vence dentro de las 48 h está por vencer, no vencida", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(24) })], AHORA);
    expect(p.porVencer).toBe(true);
    expect(p.vencida).toBe(false);
  });

  it("una vigente que vence más allá de las 48 h no es ninguna de las dos", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(24 * 10) })], AHORA);
    expect(p.porVencer).toBe(false);
    expect(p.vencida).toBe(false);
  });

  it("sin fecha de vencimiento nunca vence", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: null })], AHORA);
    expect(p.porVencer).toBe(false);
    expect(p.vencida).toBe(false);
  });

  it("una convertida o anulada con fecha pasada no es vencida: ya no espera a nadie", () => {
    const filas = [proforma({ id: "a", estado: "convertida", vence_at: en(-5) }), proforma({ id: "b", estado: "anulada", vence_at: en(-5) })];
    for (const p of marcarPorVencer(filas, AHORA)) {
      expect(p.vencida).toBe(false);
      expect(p.porVencer).toBe(false);
    }
  });

  it("conserva el resto de la fila tal como vino", () => {
    const [p] = marcarPorVencer([proforma({ id: "z", total: 250, vence_at: en(10) })], AHORA);
    expect(p).toMatchObject({ id: "z", total: 250 });
  });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `pnpm --filter web exec vitest run lib/proformas-reglas.test.ts`
Expected: FAIL — las pruebas de `vencida` reciben `undefined` (la propiedad todavía no existe).

- [ ] **Step 3: Implementar `vencida` en `proformas-reglas.ts`**

En `apps/web/lib/proformas-reglas.ts`, en el tipo `Proforma`, agrega el campo debajo de `porVencer`:

```ts
  porVencer: boolean;
  /** Derivado, como `porVencer`: sigue «vigente» en la base —nadie escribe `vencida`,
   *  ni un cron ni un trigger— pero su `vence_at` ya pasó. Cuenta como vencida y NO
   *  como vigente: esa clienta ya no tiene el precio que se le cotizó. Se calcula en
   *  el servidor por la misma razón que `porVencer`: dos tablets con el reloj distinto
   *  no pueden ver números distintos de la misma pantalla. */
  vencida: boolean;
};
```

Cambia la definición de `ProformaFila`:

```ts
/** Fila tal como viene de la base, antes de calcularle nada. */
export type ProformaFila = Omit<Proforma, "porVencer" | "vencida">;
```

Y reemplaza el cuerpo de `marcarPorVencer` (deja intacto su comentario de cabecera):

```ts
export function marcarPorVencer(filas: ProformaFila[], ahora: number = Date.now()): Proforma[] {
  const limite = ahora + HORAS_PROFORMA_POR_VENCER * 3600 * 1000;
  return filas.map((p) => {
    const vence = p.vence_at ? new Date(p.vence_at).getTime() : null;
    // Solo una proforma vigente puede estar «por vencer» o «vencida»: una ya
    // convertida o anulada no le sirve a nadie por más cerca (o lejos) que esté su
    // fecha. Las dos mitades no se pisan: por vencer es `ahora < vence < limite`;
    // vencida es `vence <= ahora`.
    const vigente = p.estado === "vigente";
    return {
      ...p,
      porVencer: vigente && vence != null && vence > ahora && vence < limite,
      vencida: vigente && vence != null && vence <= ahora,
    };
  });
}
```

- [ ] **Step 4: Correrla y ver que pasa**

Run: `pnpm --filter web exec vitest run lib/proformas-reglas.test.ts`
Expected: PASS (7 pruebas).

- [ ] **Step 5: Escribir las pruebas de `facturacion-reglas` (fallan: el módulo no existe)**

`apps/web/lib/facturacion-reglas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  conteosDePestanas,
  esMesValido,
  esMismoMes,
  hrefPestana,
  mesAnterior,
  mesDeParametro,
  mesSiguiente,
  paramDeMes,
  PESTANAS,
  pestanaDeRuta,
  resumenPorEnviar,
  resumenProformas,
  tiendasOperativas,
  ubicacionActualDe,
} from "./facturacion-reglas";
import type { EstadoComprobante } from "./comprobantes-reglas";
import type { ProformaFila } from "./proformas-reglas";

const SEPTIEMBRE_2026 = { anio: 2026, mes: 9 };

describe("mes de la URL", () => {
  it("lee un mes válido, con o sin cero a la izquierda", () => {
    expect(mesDeParametro("2026-08", SEPTIEMBRE_2026)).toEqual({ anio: 2026, mes: 8 });
    expect(mesDeParametro("2026-8", SEPTIEMBRE_2026)).toEqual({ anio: 2026, mes: 8 });
    expect(mesDeParametro("2026-12", SEPTIEMBRE_2026)).toEqual({ anio: 2026, mes: 12 });
  });

  it("un valor inválido cae al mes actual en vez de enrollarse al año siguiente", () => {
    for (const malo of ["2026-13", "2026-00", "2026-0", "hola", "", "2026", "2026-9-1", undefined, null]) {
      expect(mesDeParametro(malo, SEPTIEMBRE_2026)).toEqual(SEPTIEMBRE_2026);
    }
  });

  it("esMesValido es la misma puerta", () => {
    expect(esMesValido("2026-9")).toBe(true);
    expect(esMesValido("2026-13")).toBe(false);
    expect(esMesValido(null)).toBe(false);
  });

  it("escribe el mes sin cero a la izquierda, como los enlaces que ya existían", () => {
    expect(paramDeMes({ anio: 2026, mes: 9 })).toBe("2026-9");
  });

  it("mes anterior y siguiente cruzan el cambio de año", () => {
    expect(mesAnterior({ anio: 2026, mes: 1 })).toEqual({ anio: 2025, mes: 12 });
    expect(mesAnterior({ anio: 2026, mes: 9 })).toEqual({ anio: 2026, mes: 8 });
    expect(mesSiguiente({ anio: 2026, mes: 12 })).toEqual({ anio: 2027, mes: 1 });
    expect(mesSiguiente({ anio: 2026, mes: 9 })).toEqual({ anio: 2026, mes: 10 });
  });

  it("compara meses", () => {
    expect(esMismoMes({ anio: 2026, mes: 9 }, SEPTIEMBRE_2026)).toBe(true);
    expect(esMismoMes({ anio: 2025, mes: 9 }, SEPTIEMBRE_2026)).toBe(false);
  });
});

describe("pestañas", () => {
  const por = (clave: string) => PESTANAS.find((p) => p.clave === clave)!;

  it("son cuatro, en el orden en que se dibujan", () => {
    expect(PESTANAS.map((p) => p.clave)).toEqual(["resumen", "proformas", "comprobantes", "descuentos"]);
  });

  it("cada ruta cae en su pestaña, con o sin barra final", () => {
    expect(pestanaDeRuta("/vender/facturacion")).toBe("resumen");
    expect(pestanaDeRuta("/vender/facturacion/")).toBe("resumen");
    expect(pestanaDeRuta("/vender/facturacion/proformas")).toBe("proformas");
    expect(pestanaDeRuta("/vender/facturacion/comprobantes/")).toBe("comprobantes");
    expect(pestanaDeRuta("/vender/facturacion/descuentos")).toBe("descuentos");
  });

  it("una ruta desconocida o que solo comparte el prefijo cae en Resumen", () => {
    expect(pestanaDeRuta("/vender/facturacion/otra")).toBe("resumen");
    expect(pestanaDeRuta("/vender/facturacion/proformas-viejas")).toBe("resumen");
  });

  it("solo Proformas y Comprobantes conservan el mes", () => {
    expect(hrefPestana(por("proformas"), "2026-8")).toBe("/vender/facturacion/proformas?m=2026-8");
    expect(hrefPestana(por("comprobantes"), "2026-8")).toBe("/vender/facturacion/comprobantes?m=2026-8");
    expect(hrefPestana(por("resumen"), "2026-8")).toBe("/vender/facturacion");
    expect(hrefPestana(por("descuentos"), "2026-8")).toBe("/vender/facturacion/descuentos");
  });

  it("sin mes, o con uno inválido, el enlace no lo arrastra", () => {
    expect(hrefPestana(por("proformas"), null)).toBe("/vender/facturacion/proformas");
    expect(hrefPestana(por("comprobantes"), "2026-13")).toBe("/vender/facturacion/comprobantes");
  });
});

describe("resumenPorEnviar — la cola de SUNAT", () => {
  const fila = (estado: EstadoComprobante, created_at: string) => ({ estado, created_at });

  it("cuenta pendiente y rechazado; enviado, aceptado, anulado y no_emitido no", () => {
    const r = resumenPorEnviar([
      fila("pendiente", "2026-09-19T10:00:00Z"),
      fila("pendiente", "2026-09-18T08:00:00Z"),
      fila("rechazado", "2026-09-17T09:30:00Z"),
      fila("enviado", "2026-09-01T00:00:00Z"),
      fila("aceptado", "2026-08-01T00:00:00Z"),
      fila("anulado", "2026-08-02T00:00:00Z"),
      fila("no_emitido", "2026-08-03T00:00:00Z"),
    ]);
    expect(r).toEqual({ porEnviar: 3, rechazados: 1, masAntiguoAt: "2026-09-17T09:30:00Z" });
  });

  it("el más antiguo sale de la cola, no de un comprobante ya cerrado más viejo", () => {
    const r = resumenPorEnviar([fila("aceptado", "2020-01-01T00:00:00Z"), fila("pendiente", "2026-09-19T10:00:00Z")]);
    expect(r.masAntiguoAt).toBe("2026-09-19T10:00:00Z");
  });

  it("compara instantes reales aunque las fechas vengan con distinto huso", () => {
    // 10:00-05:00 son las 15:00Z; 14:00Z es más antiguo. Comparado como texto ganaría el primero.
    const r = resumenPorEnviar([fila("pendiente", "2026-09-19T10:00:00-05:00"), fila("pendiente", "2026-09-19T14:00:00Z")]);
    expect(r.masAntiguoAt).toBe("2026-09-19T14:00:00Z");
  });

  it("sin nada en la cola: ceros y sin fecha", () => {
    expect(resumenPorEnviar([])).toEqual({ porEnviar: 0, rechazados: 0, masAntiguoAt: null });
  });
});

describe("resumenProformas — lo que sigue valiendo", () => {
  const AHORA = Date.parse("2026-09-19T15:00:00Z");
  const en = (horas: number) => new Date(AHORA + horas * 3600 * 1000).toISOString();
  const p = (sobre: Partial<ProformaFila>): ProformaFila => ({
    id: "x",
    ubicacion_id: "u",
    cliente_nombre: null,
    cliente_num_doc: null,
    total: 100,
    estado: "vigente",
    comprobante_id: null,
    created_at: "2026-09-10T15:00:00Z",
    vence_at: null,
    ...sobre,
  });

  it("separa las que valen, las que están por vencer y las que ya vencieron", () => {
    const r = resumenProformas(
      [
        p({ total: 100, vence_at: en(24) }), // vale y está por vencer
        p({ total: 200, vence_at: en(24 * 10) }), // vale
        p({ total: 30, vence_at: null }), // vale, sin fecha
        p({ total: 50, vence_at: en(-24) }), // vigente en la base, pero ya vencida
        p({ total: 999, estado: "convertida", vence_at: en(-1) }), // ya no cuenta
        p({ total: 999, estado: "anulada", vence_at: en(24) }), // ya no cuenta
      ],
      AHORA
    );
    expect(r).toEqual({ vigentes: 3, monto: 330, porVencer: 1, vencidas: 1 });
  });

  it("el monto no arrastra el error de coma flotante", () => {
    expect(resumenProformas([p({ total: 0.1 }), p({ total: 0.2 })], AHORA).monto).toBe(0.3);
  });

  it("sin proformas: todo en cero", () => {
    expect(resumenProformas([], AHORA)).toEqual({ vigentes: 0, monto: 0, porVencer: 0, vencidas: 0 });
  });
});

describe("conteosDePestanas", () => {
  const cola = (porEnviar: number, rechazados: number) => ({ porEnviar, rechazados, masAntiguoAt: null });
  const proformas = (vigentes: number) => ({ vigentes, monto: 0, porVencer: 0, vencidas: 0 });

  it("sin datos (la consulta falló) o en cero no dibuja ningún contador", () => {
    expect(conteosDePestanas(null, null)).toEqual({});
    expect(conteosDePestanas(cola(0, 0), proformas(0))).toEqual({});
  });

  it("Comprobantes en ámbar cuando hay algo por enviar", () => {
    expect(conteosDePestanas(cola(3, 0), null).comprobantes).toEqual({ valor: 3, tono: "ambar", texto: "por enviar a SUNAT" });
  });

  it("Comprobantes en rojo si SUNAT rechazó alguno", () => {
    expect(conteosDePestanas(cola(3, 1), null).comprobantes).toMatchObject({ valor: 3, tono: "rojo" });
  });

  it("Proformas en neutro, contando solo las vigentes que aún valen", () => {
    expect(conteosDePestanas(null, proformas(2)).proformas).toEqual({ valor: 2, tono: "neutro", texto: "vigentes" });
  });

  it("cada contador falla por separado", () => {
    expect(conteosDePestanas(null, proformas(2))).not.toHaveProperty("comprobantes");
    expect(conteosDePestanas(cola(1, 0), null)).not.toHaveProperty("proformas");
  });
});

describe("tiendas", () => {
  const ubicaciones = [
    { id: "t1", tipo: "tienda" },
    { id: "a1", tipo: "almacen" },
    { id: "k1", tipo: "taller" },
    { id: "t2", tipo: "tienda" },
  ];

  it("solo las tiendas emiten: ni un almacén ni el Taller tienen serie", () => {
    expect(tiendasOperativas(ubicaciones).map((u) => u.id)).toEqual(["t1", "t2"]);
  });

  it("preselecciona la tienda de la persona; si no es una tienda operativa, la primera; sin tiendas, vacío", () => {
    const tiendas = tiendasOperativas(ubicaciones);
    expect(ubicacionActualDe(tiendas, "t2")).toBe("t2");
    expect(ubicacionActualDe(tiendas, "a1")).toBe("t1");
    expect(ubicacionActualDe([], "t2")).toBe("");
  });
});
```

- [ ] **Step 6: Correrlas y ver que fallan**

Run: `pnpm --filter web exec vitest run lib/facturacion-reglas.test.ts`
Expected: FAIL — «Failed to resolve import "./facturacion-reglas"».

- [ ] **Step 7: Escribir `facturacion-reglas.ts`**

`apps/web/lib/facturacion-reglas.ts`:

```ts
// Reglas puras de Facturación (ADR-0121): ni Supabase ni `next/headers`, para poder
// probarlas sin levantar nada — mismo criterio que `proformas-reglas.ts`. El reloj
// entra por parámetro; nada lee `Date.now()` escondido adentro.
import type { EstadoComprobante } from "./comprobantes-reglas";
import { marcarPorVencer, type ProformaFila } from "./proformas-reglas";

/* ------------------------------ El mes ------------------------------ */

export type Mes = { anio: number; mes: number };

export const NOMBRES_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"] as const;

const PARAMETRO_MES = /^\d{4}-(0?[1-9]|1[0-2])$/;

/** ¿Es un `?m=` que vale la pena obedecer? Mes 1-12 explícito: un `2026-13` con el regex
 *  viejo pasaba la validación y `Date.UTC` lo enrollaba en silencio a enero del año
 *  siguiente, mientras el título seguía mostrando «undefined 2026». */
export function esMesValido(m: string | null | undefined): m is string {
  return !!m && PARAMETRO_MES.test(m);
}

/** El mes que pide la URL; con un valor ausente o inválido, el mes actual. */
export function mesDeParametro(m: string | null | undefined, actual: Mes): Mes {
  if (!esMesValido(m)) return actual;
  const [anio, mes] = m.split("-").map(Number);
  return { anio, mes };
}

/** Cómo se escribe un mes en la URL: `2026-9`, sin cero a la izquierda. Así ya vivían los
 *  enlaces guardados; `mesDeParametro` acepta las dos formas. */
export function paramDeMes({ anio, mes }: Mes): string {
  return `${anio}-${mes}`;
}

export function mesAnterior({ anio, mes }: Mes): Mes {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

export function mesSiguiente({ anio, mes }: Mes): Mes {
  return mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
}

export function esMismoMes(a: Mes, b: Mes): boolean {
  return a.anio === b.anio && a.mes === b.mes;
}

/* ---------------------------- Las pestañas ---------------------------- */

export type ClavePestana = "resumen" | "proformas" | "comprobantes" | "descuentos";

export type PestanaFacturacion = { clave: ClavePestana; etiqueta: string; ruta: string; conMes: boolean };

const RUTA = "/vender/facturacion";

/** Las cuatro vistas, en el orden en que se dibujan. `conMes`: solo Proformas y
 *  Comprobantes viven en un mes; Resumen es «hoy» y Códigos no tiene tiempo. */
export const PESTANAS: readonly PestanaFacturacion[] = [
  { clave: "resumen", etiqueta: "Resumen", ruta: RUTA, conMes: false },
  { clave: "proformas", etiqueta: "Proformas", ruta: `${RUTA}/proformas`, conMes: true },
  { clave: "comprobantes", etiqueta: "Comprobantes", ruta: `${RUTA}/comprobantes`, conMes: true },
  { clave: "descuentos", etiqueta: "Códigos de descuento", ruta: `${RUTA}/descuentos`, conMes: false },
];

/** La pestaña que le toca a una ruta. Una ruta desconocida cae en Resumen (la base). El
 *  prefijo tiene que terminar en `/` o en el fin: `/proformas-viejas` no es Proformas. */
export function pestanaDeRuta(pathname: string): ClavePestana {
  const limpia = pathname.replace(/\/+$/, "");
  const hallada = PESTANAS.find((p) => p.clave !== "resumen" && (limpia === p.ruta || limpia.startsWith(`${p.ruta}/`)));
  return hallada?.clave ?? "resumen";
}

/** El enlace de una pestaña. Solo las dos que viven en un mes llevan `?m=`, y solo si el
 *  de la URL actual es válido: así el mes se conserva entre Proformas y Comprobantes sin
 *  arrastrar basura. */
export function hrefPestana(pestana: PestanaFacturacion, m: string | null | undefined): string {
  return pestana.conMes && esMesValido(m) ? `${pestana.ruta}?m=${m}` : pestana.ruta;
}

/* ------------------- Lo que esperan de SUNAT y de la clienta ------------------- */

export type ResumenPorEnviar = { porEnviar: number; rechazados: number; masAntiguoAt: string | null };

/** «Por enviar» = `pendiente` + `rechazado`, de cualquier tipo y SIN filtro de mes: es una
 *  cola, no un historial (un `pendiente` de hace tres semanas sigue esperando). `enviado`
 *  no cuenta: ya está en manos de SUNAT y no hay nada que hacer. */
export function resumenPorEnviar(filas: { estado: EstadoComprobante; created_at: string }[]): ResumenPorEnviar {
  const cola = filas.filter((f) => f.estado === "pendiente" || f.estado === "rechazado");
  // Se comparan instantes, no texto: `10:00-05:00` son las 15:00Z, y como texto ganaría
  // a `14:00Z` aunque sea más nuevo.
  const masAntiguo = cola.reduce<string | null>((min, f) => (min === null || Date.parse(f.created_at) < Date.parse(min) ? f.created_at : min), null);
  return { porEnviar: cola.length, rechazados: cola.filter((f) => f.estado === "rechazado").length, masAntiguoAt: masAntiguo };
}

export type ResumenProformas = { vigentes: number; monto: number; porVencer: number; vencidas: number };

/** Las proformas vigentes de la base, separadas en las que siguen valiendo y las que ya
 *  vencieron. Nadie escribe `vencida`: sin esta separación una «vigente» de hace un mes
 *  contaría como plata por cobrar. `vigentes` y `monto` son solo las que aún valen;
 *  `porVencer` es un subconjunto de esas; `vencidas` va aparte. */
export function resumenProformas(filas: ProformaFila[], ahora: number = Date.now()): ResumenProformas {
  const vigentes = marcarPorVencer(filas, ahora).filter((p) => p.estado === "vigente");
  const alDia = vigentes.filter((p) => !p.vencida);
  return {
    vigentes: alDia.length,
    monto: Math.round(alDia.reduce((suma, p) => suma + Number(p.total), 0) * 100) / 100,
    porVencer: alDia.filter((p) => p.porVencer).length,
    vencidas: vigentes.length - alDia.length,
  };
}

/* ------------------------ Contadores de las pestañas ------------------------ */

export type ConteoPestana = { valor: number; tono: "neutro" | "ambar" | "rojo"; texto: string };
export type ConteosPestanas = Partial<Record<ClavePestana, ConteoPestana>>;

/** Lo que cada pestaña muestra como contador. Sin dato (`null`: la consulta falló) o en
 *  cero no se dibuja nada: un contador que miente es peor que ninguno, y un «0» no le pide
 *  nada a nadie. `texto` es lo que lee un lector de pantalla: el número solo no dice qué
 *  cuenta. */
export function conteosDePestanas(porEnviar: ResumenPorEnviar | null, proformas: ResumenProformas | null): ConteosPestanas {
  const conteos: ConteosPestanas = {};
  if (porEnviar && porEnviar.porEnviar > 0) {
    conteos.comprobantes =
      porEnviar.rechazados > 0
        ? { valor: porEnviar.porEnviar, tono: "rojo", texto: "por enviar a SUNAT, con rechazados" }
        : { valor: porEnviar.porEnviar, tono: "ambar", texto: "por enviar a SUNAT" };
  }
  if (proformas && proformas.vigentes > 0) {
    conteos.proformas = { valor: proformas.vigentes, tono: "neutro", texto: "vigentes" };
  }
  return conteos;
}

/* ------------------------------- Las tiendas ------------------------------- */

/** Solo las tiendas emiten comprobantes: ni un almacén ni el Taller (tipo `taller` desde
 *  2026-09-15) tienen serie ni mostrador. */
export function tiendasOperativas<T extends { tipo: string }>(ubicaciones: T[]): T[] {
  return ubicaciones.filter((u) => u.tipo === "tienda");
}

/** La tienda que se preselecciona en los modales: la de la persona si es una tienda
 *  operativa; si no, la primera; `""` si no hay ninguna. */
export function ubicacionActualDe<T extends { id: string }>(tiendas: T[], ubicacionIdDeLaPersona: string): string {
  return (tiendas.find((u) => u.id === ubicacionIdDeLaPersona) ?? tiendas[0])?.id ?? "";
}
```

- [ ] **Step 8: Correr todo y ver que pasa**

Run: `pnpm --filter web exec vitest run lib/facturacion-reglas.test.ts lib/proformas-reglas.test.ts`
Expected: PASS (todas).

- [ ] **Step 9: Tipos y lint**

Run: `pnpm --filter web typecheck` y `pnpm --filter web lint`
Expected: sin errores. El campo nuevo `vencida` no rompe a nadie: `Proforma` solo lo produce `marcarPorVencer` y lo consumen `ProformasPanel` y `lib/proformas.ts`.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/facturacion-reglas.ts apps/web/lib/facturacion-reglas.test.ts apps/web/lib/proformas-reglas.ts apps/web/lib/proformas-reglas.test.ts
# feat(facturacion): reglas puras del mes, las pestañas y los contadores; vencida derivada en proformas
git commit -F <archivo-con-el-mensaje>
```

---

### Task 2: Lecturas del marco y `exigirLider`

**Files:**
- Modify: `apps/web/lib/comprobantes.ts`
- Modify: `apps/web/lib/proformas.ts`
- Modify: `apps/web/lib/persona-actual.ts`

**Interfaces:**
- Consumes (Task 1): `resumenPorEnviar`, `type ResumenPorEnviar`, `resumenProformas`, `type ResumenProformas`.
- Produces (usadas por la Task 7):
  - `getResumenPorEnviar(): Promise<ResumenPorEnviar | null>` en `@/lib/comprobantes`
  - `getResumenProformas(): Promise<ResumenProformas | null>` en `@/lib/proformas`
  - `getSeriesComprobantes` sigue siendo `() => Promise<SerieComprobante[]>`, ahora con `cache` (una vez por petición)
  - `exigirLider(): Promise<PersonaActualV2>` en `@/lib/persona-actual`

> **Nota de nombres.** El spec habla de una sola `getConteosFacturacion()`. Aquí son dos lecturas, una por tabla, cada una en el archivo de su dominio (`comprobantes.ts` lee `comprobantes`; `proformas.ts` lee `proformas`); el layout las junta. Hace lo mismo con menos acoplamiento y cada una falla por separado, que es lo que el spec pide («sin contador»).

No hay prueba nueva: la regla ya está probada en la Task 1 y estas funciones son lectura de servidor (`lib/` nunca escribe). Se verifican con tipos aquí y contra la base en la Task 8.

- [ ] **Step 1: `getResumenPorEnviar` y `cache` en `lib/comprobantes.ts`**

En `apps/web/lib/comprobantes.ts`, actualiza los imports de arriba:

```ts
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { exigir, tolerar } from "@/lib/resultado";
import { resumenPorEnviar, type ResumenPorEnviar } from "@/lib/facturacion-reglas";
import type { Comprobante, EstadoComprobante, SerieComprobante, VentaDelDia } from "@/lib/comprobantes-reglas";
```

Reemplaza la declaración de `getSeriesComprobantes` para envolverla en `cache` (el layout y la vista Comprobantes la piden en la misma petición; `getUbicaciones` ya funciona así):

```ts
// `cache`: el layout de Facturación la pide para el modal de emitir y la vista
// Comprobantes para su tabla, en la misma petición — se lee una sola vez.
export const getSeriesComprobantes = cache(async (): Promise<SerieComprobante[]> => {
  const supabase = await createClient();
  // Sin series, la pantalla avisa "esta ubicación no tiene serie configurada" y nadie
  // puede emitir. Si eso sale de una consulta fallida en vez de la realidad, se manda a
  // Felipe a configurar algo que ya estaba configurado.
  const resSeries = await supabase
    .from("series_comprobantes")
    .select("id, ubicacion_id, tipo, serie, siguiente_numero")
    .order("tipo");
  return exigir(resSeries, "las series de comprobantes") as SerieComprobante[];
});
```

Agrega al final del archivo:

```ts
/** Cuántos comprobantes esperan un envío a SUNAT ahora mismo, para el contador de la pestaña.
 *  SIN filtro de mes: son una cola, no un historial. `null` si la consulta falla: es un dato
 *  secundario (`tolerar` — sin contador, nunca uno inventado); la lista de verdad, que sí
 *  usa `exigir`, vive en la vista Comprobantes. */
export async function getResumenPorEnviar(): Promise<ResumenPorEnviar | null> {
  const supabase = await createClient();
  const res = await supabase.from("comprobantes").select("estado, created_at").in("estado", ["pendiente", "rechazado"]);
  const { datos } = tolerar(res, "los comprobantes por enviar");
  return datos ? resumenPorEnviar(datos as { estado: EstadoComprobante; created_at: string }[]) : null;
}
```

- [ ] **Step 2: `getResumenProformas` en `lib/proformas.ts`**

En `apps/web/lib/proformas.ts`, cambia los imports:

```ts
import { createClient } from "@/lib/supabase/server";
import { exigir, tolerar } from "@/lib/resultado";
import { marcarPorVencer, type ProformaFila } from "@/lib/proformas-reglas";
import { resumenProformas, type ResumenProformas } from "@/lib/facturacion-reglas";
```

Agrega al final:

```ts
/** Las proformas vigentes de hoy, sin filtro de mes (son una cola de trabajo, no un
 *  historial — ver `getProformasMes`), resumidas para el contador de la pestaña. `null` si
 *  la consulta falla (`tolerar`: sin contador, nunca uno inventado). */
export async function getResumenProformas(): Promise<ResumenProformas | null> {
  const supabase = await createClient();
  const res = await supabase.from("proformas").select(COLUMNAS_PROFORMA).eq("estado", "vigente");
  const { datos } = tolerar(res, "las proformas vigentes");
  return datos ? resumenProformas(datos as ProformaFila[]) : null;
}
```

- [ ] **Step 3: `exigirLider` en `lib/persona-actual.ts`**

Al final de `apps/web/lib/persona-actual.ts` (`redirect` ya está importado arriba):

```ts
/** Pantallas de líder (Facturación, Códigos de descuento…): un integrante vuelve al inicio.
 *  Es la primera de las tres capas —pantalla, RPC, RLS— y cada `page.tsx` la repite: un
 *  layout no vuelve a ejecutarse al navegar entre sus hijas, así que no puede ser la única
 *  puerta. `requirePersonaActualV2` va con `cache`, así que layout y página comparten la
 *  misma lectura de la persona. */
export async function exigirLider(): Promise<PersonaActualV2> {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");
  return persona;
}
```

- [ ] **Step 4: Tipos y lint**

Run: `pnpm --filter web typecheck` y `pnpm --filter web lint`
Expected: sin errores. Si TypeScript se queja del cast de `datos` en `getResumenPorEnviar`, es porque el tipo generado de `estado` es más estrecho o más ancho de lo esperado: el cast `as { estado: EstadoComprobante; created_at: string }[]` es el mismo recurso que ya usa `getComprobantesMes`.

- [ ] **Step 5: Pruebas**

Run: `pnpm --filter web test`
Expected: todo en verde (nada de esta tarea cambia lo probado).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/comprobantes.ts apps/web/lib/proformas.ts apps/web/lib/persona-actual.ts
# feat(facturacion): lecturas tolerantes para los contadores de las pestañas y exigirLider
git commit -F <archivo-con-el-mensaje>
```

---

### Task 3: `BotonCompacto` y el bloque de vidrio de la isla

**Files:**
- Create: `apps/web/components/ui/BotonCompacto.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/lib/globals-capas.test.ts` (ya existe; es el candado de ADR-0105)

**Interfaces:**
- Consumes: nada de otras tareas. Tokens del sistema: `--color-tinta`, `--color-crema`, `--ease-cayla`, `--shadow`; utilidades `ease-cayla`, `outline-rojo/60`; el `@keyframes cayla-hilo-barrido` que ya existe.
- Produces (Task 6 y Task 7):
  - `BotonCompacto` (default no: export nombrado) con props `ButtonHTMLAttributes<HTMLButtonElement> & { variante: "primario" | "vidrio" | "fila" | "fila-alerta"; icono?: ReactNode; cargando?: boolean }`
  - clases CSS `.tema-vidrio`, `.vidrio-cayla`, `.pestanas-vidrio`, `.pestanas-vidrio__pildora`, y los atributos `data-medido` / `data-listo` que `FacturacionPestanas` escribe sobre `.pestanas-vidrio`.

> **Por qué `BotonCompacto` y no una variante de `Boton`.** `Boton` es compartido por toda la app y su tipografía es otra (versalitas con seguimiento). Tocarlo movería cada pantalla. El spec (§2, ajuste a) ya lo decidió así.

- [ ] **Step 1: Línea base del candado**

Run: `pnpm --filter web exec vitest run lib/globals-capas.test.ts`
Expected: PASS (2 pruebas). Es la línea base antes de tocar el CSS.

- [ ] **Step 2: Crear `BotonCompacto.tsx`**

`apps/web/components/ui/BotonCompacto.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

/* ====================================================================
   BotonCompacto · el botón de la isla de vidrio de Facturación (ADR-0121)

   Por qué existe aparte de `Boton` (ui/campos.tsx): `Boton` lo usa toda la app y
   habla en versalitas con seguimiento de 11 px; la isla habla en minúscula de 13 px
   y en dos alturas. Cambiar `Boton` movería cada pantalla, así que este es propio.

   Cuatro variantes, todas medidas contra el spec (§7):
   - `primario`   36 px · tinta sobre crema. La acción de la pantalla.
   - `vidrio`     36 px · blanco translúcido con desenfoque. La acción secundaria.
   - `fila`       30 px · borde fino; el hover rellena de tinta. Acción dentro de una fila.
   - `fila-alerta` 30 px · rojo profundo; el hover rellena de rojo. Lo que exige actuar.
   (`fila` y `fila-alerta` las estrenan las vistas de R2 y R3.)

   `cargando` no es solo texto: el hilo barre mientras algo está en vuelo, igual que en
   `Boton`, para que quien está en el mostrador sepa que el sistema NO se colgó.
   ==================================================================== */

export type VarianteBotonCompacto = "primario" | "vidrio" | "fila" | "fila-alerta";

const BASE =
  "relative inline-flex shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap font-medium outline-none " +
  "transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-cayla " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60 " +
  "disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0";

const VARIANTE: Record<VarianteBotonCompacto, string> = {
  primario: "h-9 rounded-[10px] bg-tinta px-3.5 text-[13px] text-crema hover:-translate-y-px hover:shadow",
  vidrio: "vidrio-cayla h-9 rounded-[10px] px-3.5 text-[13px] text-tinta hover:-translate-y-px hover:shadow",
  fila: "h-[30px] rounded-[8px] border border-tinta/28 px-3 text-[12.5px] text-tinta hover:bg-tinta hover:text-crema",
  "fila-alerta":
    "h-[30px] rounded-[8px] border border-rojo-profundo px-3 text-[12.5px] text-rojo-profundo hover:border-rojo hover:bg-rojo hover:text-crema",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante: VarianteBotonCompacto;
  /** Un icono de `lucide-react`; el botón lo deja en 15 px. Pásalo con `aria-hidden`. */
  icono?: ReactNode;
  cargando?: boolean;
};

export function BotonCompacto({ variante, icono, cargando = false, className = "", children, type = "button", ...props }: Props) {
  return (
    <button {...props} type={type} disabled={props.disabled || cargando} className={`${BASE} ${VARIANTE[variante]} ${className}`}>
      {icono}
      {children}
      {cargando && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
          <span className={`block h-full w-1/3 rounded-full [animation:cayla-hilo-barrido_1.1s_linear_infinite] ${variante === "primario" ? "bg-crema" : "bg-rojo"}`} />
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Agregar el bloque de la isla a `globals.css`**

En `apps/web/app/globals.css`, inserta este bloque **inmediatamente antes** del comentario que empieza con `/* Accesibilidad: quien pidió menos movimiento ve el resultado, no el viaje.` (el ancla es ese texto, no un número de línea: el archivo se mueve). Todo va dentro de `@layer components`, o el candado de ADR-0105 falla.

```css
/* ==================================================================
   La «isla» de vidrio de Facturación (ADR-0121).

   Vidrio = superficie translúcida con desenfoque. No agrega ningún color: solo blanco
   translúcido y tinta sobre el crema de siempre. Vive bajo `.tema-vidrio` (la raíz del
   layout de /vender/facturacion) y NO en `:root`: llevarlo a otras pantallas sería mover
   variables del sistema, y esa es otra decisión.

   Rendimiento: el desenfoque cuesta en las tablets de las tiendas. Se limita a las
   tarjetas de arriba (R2), al contenedor de pestañas y a los botones «vidrio». Si se
   nota, se baja `--vidrio-blur` acá, sin tocar ningún componente.

   Movimiento: la transición de la píldora es de `transform`/`width`, y la regla global de
   movimiento reducido (`transition-duration: 1ms !important`, al final del archivo) ya la
   apaga sola.
   ================================================================== */
@layer components {
  .tema-vidrio {
    --vidrio-blur: 18px;
  }

  .vidrio-cayla {
    background: rgb(255 255 255 / var(--vidrio-alfa, 0.58));
    border: 1px solid rgb(26 26 24 / var(--vidrio-borde, 0.12));
    -webkit-backdrop-filter: blur(var(--vidrio-blur, 18px));
    backdrop-filter: blur(var(--vidrio-blur, 18px));
  }

  /* Pestañas: un contenedor de vidrio con una píldora negra que se desliza bajo la
     etiqueta activa. La píldora la coloca `FacturacionPestanas` midiendo el DOM y
     escribiendo `--pildora-x` y `--pildora-w` sobre este mismo elemento (sin estado de
     React, como `Ayuda.tsx`: el primer cuadro ya sale bien puesto). */
  .pestanas-vidrio {
    --vidrio-alfa: 0.45;
    --vidrio-borde: 0.09;
    --vidrio-blur: 22px;
    position: relative;
    display: inline-flex;
    max-width: 100%;
    gap: 2px;
    padding: 4px;
    border-radius: 14px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .pestanas-vidrio__pildora {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 0;
    width: var(--pildora-w, 0px);
    transform: translateX(var(--pildora-x, 0px));
    border-radius: 10px;
    background: var(--color-tinta);
    box-shadow: 0 8px 18px -10px rgb(26 26 24 / 0.75);
    opacity: 0;
    pointer-events: none;
  }

  /* Hasta que la píldora está medida (el primer cuadro, antes de hidratar), la pestaña
     activa se pinta a sí misma: así nunca hay un cuadro con la etiqueta en crema sobre
     el vidrio, ilegible. */
  .pestanas-vidrio:not([data-medido]) [aria-current="page"] {
    background: var(--color-tinta);
  }

  .pestanas-vidrio[data-medido] .pestanas-vidrio__pildora {
    opacity: 1;
  }

  /* La transición se habilita recién después de la primera pintura: la píldora nace en su
     lugar y solo se desliza cuando cambia la pestaña. */
  .pestanas-vidrio[data-listo] .pestanas-vidrio__pildora {
    transition:
      transform 450ms var(--ease-cayla),
      width 450ms var(--ease-cayla);
  }
}

```

- [ ] **Step 4: El candado de capas sigue verde**

Run: `pnpm --filter web exec vitest run lib/globals-capas.test.ts`
Expected: PASS. Si falla listando `.tema-vidrio` (u otra) es que quedó fuera del `@layer components`: revisa las llaves del bloque.

- [ ] **Step 5: Tipos y lint**

Run: `pnpm --filter web typecheck` y `pnpm --filter web lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ui/BotonCompacto.tsx apps/web/app/globals.css
# feat(facturacion): BotonCompacto y el bloque de vidrio de la isla en @layer components
git commit -F <archivo-con-el-mensaje>
```

La verificación visual de esta tarea ocurre en la Task 8 (el botón y las pestañas se ven recién montados en las rutas).

---

### Task 4: Extraer `EmitirComprobanteModal` (refactor puro)

**Files:**
- Create: `apps/web/components/EmitirComprobanteModal.tsx`
- Modify: `apps/web/components/ComprobantesPanel.tsx`

**Interfaces:**
- Consumes: `Modal` (`@/components/ui/Modal`), `Boton/CampoMonto/CampoSelect/Segmentado` (`@/components/ui/campos`), `ConsultaDocumento`, `avisar`, `traducirError`, `createClient` (cliente), `ETIQUETA_TIPO`, `tipoDocumentoDeCliente`, `SerieComprobante`, `TipoComprobante`.
- Produces (Task 6): `EmitirComprobanteModal({ abierto, onCerrar, series, ubicaciones, ubicacionActualId })` con `abierto: boolean`, `onCerrar: () => void`, `series: SerieComprobante[]`, `ubicaciones: { id: string; nombre: string }[]`, `ubicacionActualId: string`.

**Regla de la tarea: no cambia ninguna línea de lógica.** Ni el token de idempotencia, ni la cuenta del IGV, ni la RPC, ni los textos. Se **mueve** código. Después de esta tarea `ComprobantesPanel` sigue abriendo el modal por su cuenta y la pantalla se comporta exactamente igual (los modales pasan al shell recién en la Task 7).

**Por qué el modal se dibuja siempre y solo se oculta.** El token que evita quemar un número si se corta la red (`tokenEmision`) vive en un `useRef` que hoy dura lo que dura el panel. Si el modal se montara solo al abrirse, cada apertura nacería con un token nuevo y reintentar tras un corte ya no reusaría el anterior. Por eso los hooks viven arriba, siempre montados, y `if (!abierto) return null;` va después.

- [ ] **Step 1: Crear el componente extraído**

`apps/web/components/EmitirComprobanteModal.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SerieComprobante, TipoComprobante } from "@/lib/comprobantes-reglas";
import { ETIQUETA_TIPO, tipoDocumentoDeCliente } from "@/lib/comprobantes-reglas";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoSelect, Segmentado } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

type Ubicacion = { id: string; nombre: string };

// Extraído de `ComprobantesPanel` (ADR-0121) SIN cambiar su lógica: el token de
// idempotencia, la cuenta del IGV y la RPC son los de siempre. Lo dibuja
// `FacturacionShell` una sola vez, para que lo abran la cabecera y los botones de cada
// vista.
//
// Se dibuja SIEMPRE y solo se muestra u oculta (`abierto`), en vez de montarse y
// desmontarse: el token de idempotencia y la última ubicación/tipo elegidos viven en este
// componente, y con el modal montado solo al abrirse cada apertura nacería con un token
// nuevo — reintentar tras un corte de red ya no reusaría el anterior y podría quemar un
// segundo número.
export function EmitirComprobanteModal({
  abierto,
  onCerrar,
  series,
  ubicaciones,
  ubicacionActualId,
}: {
  abierto: boolean;
  onCerrar: () => void;
  series: SerieComprobante[];
  ubicaciones: Ubicacion[];
  ubicacionActualId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Idempotencia (hueco 1, GRAVE): un mismo token sobrevive reintentos del
  // formulario — si la respuesta se corta después de que el servidor ya
  // reservó el correlativo, reintentar con el mismo token no quema un
  // segundo número. Se renueva solo tras un Emitir exitoso (mismo patrón que
  // PuntoDeVenta.tsx con registrar_venta).
  const tokenEmision = useRef<string>(crypto.randomUUID());

  const [ubicacionId, setUbicacionId] = useState(ubicacionActualId);
  const [tipo, setTipo] = useState<TipoComprobante>("boleta");
  const [total, setTotal] = useState(0);
  const [clienteNumDoc, setClienteNumDoc] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  // Estado imposible eliminado por diseño: el tipo de documento NO es un estado
  // aparte que pueda contradecir al tipo de comprobante — se deriva de él. Antes,
  // tipear un DNI y luego cambiar a Factura dejaba "factura + dni", y la venta se
  // caía recién al apretar Emitir, con la clienta esperando en el mostrador.
  const clienteTipoDoc = tipoDocumentoDeCliente(tipo, clienteNumDoc);

  // Serie que le toca a la combinación elegida en el modal de emisión. Es
  // derivado puro de props + estado que ya existían: no consulta nada nuevo.
  const serieDelComprobante = series.find((s) => s.ubicacion_id === ubicacionId && s.tipo === tipo);

  // Igual que el `cerrarModal` de antes: limpia lo tipeado y NO la ubicación ni el tipo
  // (la siguiente boleta suele ser de la misma tienda).
  function cerrar() {
    setTotal(0);
    setClienteNumDoc("");
    setClienteNombre("");
    onCerrar();
  }

  async function onEmitir(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    // IGV incluido en el total (19.83% del total = IGV, práctica estándar
    // cuando el precio ya lo incluye) — la desagregación exacta por línea
    // queda para cuando esto se conecte a `ventas` (ver nota al pie).
    const igv = Math.round((total - total / 1.18) * 100) / 100;
    const subtotal = Math.round((total - igv) * 100) / 100;
    const { error } = await supabase.rpc("emitir_comprobante", {
      p_ubicacion_id: ubicacionId,
      p_tipo: tipo,
      p_subtotal: subtotal,
      p_igv: igv,
      p_total: total,
      p_cliente_tipo_doc: clienteTipoDoc,
      p_cliente_num_doc: clienteNumDoc || undefined,
      p_cliente_nombre: clienteNombre || undefined,
      p_token: tokenEmision.current,
    });
    if (error) {
      avisar.error(traducirError(error, "emitir el comprobante"));
      setLoading(false);
      return;
    }
    setLoading(false);
    tokenEmision.current = crypto.randomUUID();
    avisar.exito(`${ETIQUETA_TIPO[tipo]} emitida`, { detalle: "Aparece en la lista; transmítela a SUNAT desde la fila." });
    cerrar();
    router.refresh();
  }

  if (!abierto) return null;

  return (
    <Modal titulo="Emitir comprobante" ancho="max-w-md" onClose={cerrar}>
      {(cerrarAnimado) => (
        <form onSubmit={onEmitir} className="mt-5 space-y-2">
          {/* Ubicación y tipo son las dos decisiones que determinan el correlativo,
              así que van juntas y arriba de él: se leen como los dos diales
              que mueven la cifra de abajo. */}
          <div className="grid gap-x-5 sm:grid-cols-2">
            <CampoSelect
              etiqueta="Ubicación"
              valor={ubicacionId}
              onValor={setUbicacionId}
              opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
            />

            <Segmentado
              etiqueta="Tipo"
              valor={tipo}
              onValor={(t) => {
                setTipo(t);
                setClienteNumDoc("");
                setClienteNombre("");
              }}
              opciones={[
                { valor: "boleta", texto: ETIQUETA_TIPO.boleta },
                { valor: "factura", texto: ETIQUETA_TIPO.factura },
              ] as const}
            />
          </div>

          {/* El número que se va a reservar, antes de reservarlo. Es lo más
              importante del formulario: un correlativo es irreversible y hasta
              ahora solo se veía DESPUÉS de emitir, en la tabla. El dato ya
              llegaba en `series`; lo único que faltaba era mostrarlo.
              La `key` fuerza el remontaje para que la cifra se re-asiente
              cuando cambia la ubicación o el tipo — así el ojo nota que cambió. */}
          <div className="rounded-xl border border-sand bg-papel px-5 py-4">
            <p className="label-cayla text-[11px] text-tinta/65">Se va a reservar el número</p>
            {serieDelComprobante ? (
              <p
                key={`${serieDelComprobante.serie}-${serieDelComprobante.siguiente_numero}`}
                className="font-display anim-asentar mt-1.5 text-[1.75rem] leading-none tabular-nums text-tinta"
              >
                {serieDelComprobante.serie}
                <span className="text-tinta/65">-</span>
                {String(serieDelComprobante.siguiente_numero).padStart(6, "0")}
              </p>
            ) : (
              <p className="anim-asentar mt-1.5 text-xs leading-relaxed text-ambar">
                {ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "Esta ubicación"} todavía no tiene serie
                de {ETIQUETA_TIPO[tipo].toLowerCase()} registrada. Regístrala antes de emitir.
              </p>
            )}
          </div>

          <CampoMonto
            etiqueta="Total (incluye IGV)"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            value={total || ""}
            onChange={(e) => setTotal(Number(e.target.value))}
          />

          <ConsultaDocumento
            tipo={tipo === "factura" ? "ruc" : "dni"}
            obligatorio={tipo === "factura"}
            numero={clienteNumDoc}
            onNumero={setClienteNumDoc}
            nombre={clienteNombre}
            onNombre={setClienteNombre}
          />

          {/* La nota va acá abajo y no arriba: explica qué pasa DESPUÉS de
              apretar Emitir, así que se lee junto al botón que lo provoca. */}
          <p className="border-l-2 border-ambar/50 pl-3 text-xs leading-relaxed text-tinta/75">
            Esto reserva el número oficial y guarda el comprobante — todavía no lo manda a
            SUNAT. Queda &ldquo;Pendiente de enviar&rdquo; hasta que aprietes
            &ldquo;Transmitir&rdquo; en la lista de abajo, que es lo que lo envía.
          </p>

          <div className="flex gap-2 pt-3">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrarAnimado}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" className="flex-1" cargando={loading}>
              {loading ? "Emitiendo…" : "Emitir"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Sacar de `ComprobantesPanel.tsx` lo que se mudó**

En `apps/web/components/ComprobantesPanel.tsx`:

1. **Imports.** Quita `useRef` de la línea de `react` (queda `import { useState } from "react";`), quita `tipoDocumentoDeCliente` del import de `@/lib/comprobantes-reglas` (queda `ESTADO_ESTILO, ESTADO_ETIQUETA, ETIQUETA_TIPO`), quita `ConsultaDocumento`, y quita `CampoMonto` y `Segmentado` del import de `@/components/ui/campos` (quedan `Boton, CampoSelect, CampoTexto`). Agrega:
   ```ts
   import { EmitirComprobanteModal } from "@/components/EmitirComprobanteModal";
   ```
2. **Estado y lógica.** Borra: el `useRef` `tokenEmision` con su comentario de idempotencia; el bloque «Formulario de emisión» (`ubicacionId`, `tipo`, `total`, `clienteNumDoc`, `clienteNombre`, `clienteTipoDoc` y su comentario); `serieDelComprobante` con su comentario; y la función `onEmitir` completa. **Conserva** `loading` (lo sigue usando el formulario de serie), el bloque «Formulario de serie» y `onRegistrarSerie`.
3. **`cerrarModal`** queda así (ya no reinicia lo del formulario de emisión):
   ```ts
   function cerrarModal() {
     setModal(null);
     setSerieTexto("");
     setSerieNumero("");
   }
   ```
4. **JSX.** Borra el bloque completo `{/* ==================== Modal: emitir comprobante ==================== */}` … `{modal === "emitir" && ( … )}` y en su lugar pon:
   ```tsx
      <EmitirComprobanteModal
        abierto={modal === "emitir"}
        onCerrar={() => setModal(null)}
        series={series}
        ubicaciones={ubicaciones}
        ubicacionActualId={ubicacionActualId}
      />
   ```
   El tipo de `modal` no cambia todavía (`"emitir" | "serie" | "anular" | "liberar" | null`) y el botón «Emitir comprobante» sigue con `onClick={() => setModal("emitir")}`.

- [ ] **Step 3: Tipos y lint**

Run: `pnpm --filter web typecheck` y `pnpm --filter web lint`
Expected: sin errores. ESLint marca como error los imports sin uso: si queda alguno de los que debían salir, sale acá.

- [ ] **Step 4: Verificar que la pantalla actual se comporta igual**

Con el servidor de desarrollo levantado y la sesión de líder de Felipe en el panel (ver «Convenciones»): abre `http://localhost:3100/vender/facturacion`, aprieta «Emitir comprobante», cambia Ubicación y Tipo (el número que se va a reservar cambia con ellos), escribe un total, aprieta «Cancelar» (sale con animación) y vuelve a abrirlo: el total y el cliente están vacíos, la ubicación y el tipo conservan lo último que elegiste. **Cómo verificas tú:** es el mismo modal de antes, sin diferencias visibles. Si la base local está arriba, emite una boleta de prueba y comprueba que aparece en la lista.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/EmitirComprobanteModal.tsx apps/web/components/ComprobantesPanel.tsx
# refactor(facturacion): EmitirComprobanteModal sale de ComprobantesPanel sin cambiar su lógica
git commit -F <archivo-con-el-mensaje>
```

---

### Task 5: Extraer `NuevaProformaModal` (refactor puro)

**Files:**
- Create: `apps/web/components/NuevaProformaModal.tsx`
- Modify: `apps/web/components/ProformasPanel.tsx`

**Interfaces:**
- Consumes: `Modal`, `Boton/CampoMonto/CampoSelect/CampoTexto`, `avisar`, `traducirError`, `createClient` (cliente).
- Produces (Task 6): `NuevaProformaModal({ abierto, onCerrar, ubicaciones, ubicacionActualId })` con `abierto: boolean`, `onCerrar: () => void`, `ubicaciones: { id: string; nombre: string }[]`, `ubicacionActualId: string`.

Misma regla que la Task 4: se mueve código, no se cambia lógica. El modal «Convertir a comprobante» **se queda** en `ProformasPanel` (necesita la proforma de la fila).

- [ ] **Step 1: Crear el componente extraído**

`apps/web/components/NuevaProformaModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

type Ubicacion = { id: string; nombre: string };

// Extraído de `ProformasPanel` (ADR-0121) SIN cambiar su lógica. Lo dibuja
// `FacturacionShell` una sola vez, para que lo abran la cabecera y el botón de la vista
// Proformas. Igual que `EmitirComprobanteModal`, se dibuja siempre y solo se muestra u
// oculta: lo último elegido (la tienda) vive acá.
export function NuevaProformaModal({
  abierto,
  onCerrar,
  ubicaciones,
  ubicacionActualId,
}: {
  abierto: boolean;
  onCerrar: () => void;
  ubicaciones: Ubicacion[];
  ubicacionActualId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [ubicacionId, setUbicacionId] = useState(ubicacionActualId);
  const [total, setTotal] = useState(0);
  const [clienteNombre, setClienteNombre] = useState("");
  const [venceEnDias, setVenceEnDias] = useState(7);

  // Igual que el `cerrarModal` de antes: limpia lo tipeado y NO la tienda elegida.
  function cerrar() {
    setTotal(0);
    setClienteNombre("");
    setVenceEnDias(7);
    onCerrar();
  }

  async function onCrear(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const igv = Math.round((total - total / 1.18) * 100) / 100;
    const subtotal = Math.round((total - igv) * 100) / 100;
    const venceAt = new Date(Date.now() + venceEnDias * 24 * 3600 * 1000).toISOString();
    const { error } = await supabase.rpc("crear_proforma", {
      p_ubicacion_id: ubicacionId,
      // Sin catálogo de ítems en esta pantalla todavía (mismo nivel de detalle
      // que "Emitir comprobante" hoy: un total, no líneas) — se guarda como un
      // solo ítem para no inventar una estructura que nadie lee todavía.
      // `precio_unitario`, no `precio`: es la forma que espera emitir_comprobante()
      // cuando convertir_proforma_a_comprobante() reenvía estos items (0010) — con
      // el nombre viejo, Lucode recibía un precio undefined en cada línea.
      p_items: [{ descripcion: "Venta", cantidad: 1, precio_unitario: total }],
      p_subtotal: subtotal,
      p_igv: igv,
      p_total: total,
      p_cliente_nombre: clienteNombre || undefined,
      p_vence_at: venceAt,
    });
    if (error) {
      avisar.error(traducirError(error, "crear la proforma"));
      setLoading(false);
      return;
    }
    setLoading(false);
    avisar.exito(`Proforma de S/ ${total.toFixed(2)} creada`, { detalle: `Vence en ${venceEnDias} ${venceEnDias === 1 ? "día" : "días"}.` });
    cerrar();
    router.refresh();
  }

  if (!abierto) return null;

  return (
    <Modal titulo="Nueva proforma" onClose={cerrar}>
      <form onSubmit={onCrear} className="mt-5 space-y-2">
        <CampoSelect
          etiqueta="Ubicación"
          valor={ubicacionId}
          onValor={setUbicacionId}
          opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
        />

        <CampoTexto
          etiqueta="Cliente (opcional)"
          value={clienteNombre}
          onChange={(e) => setClienteNombre(e.target.value)}
          placeholder="Nombre de la clienta"
        />

        <CampoMonto
          etiqueta="Total (incluye IGV)"
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder="0.00"
          value={total || ""}
          onChange={(e) => setTotal(Number(e.target.value))}
        />

        <CampoTexto
          etiqueta="Vigente por (días)"
          type="number"
          min="1"
          required
          value={venceEnDias}
          onChange={(e) => setVenceEnDias(Number(e.target.value))}
        />

        <div className="flex gap-2 pt-3">
          <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" className="flex-1" cargando={loading}>
            {loading ? "Guardando…" : "Guardar proforma"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Sacar de `ProformasPanel.tsx` lo que se mudó**

En `apps/web/components/ProformasPanel.tsx`:

1. **Imports.** Quita `CampoMonto`, `CampoSelect` y `CampoTexto` del import de `@/components/ui/campos` (queda `Boton, Segmentado`). Agrega:
   ```ts
   import { NuevaProformaModal } from "@/components/NuevaProformaModal";
   ```
2. **Estado y lógica.** Borra el bloque «Formulario de creación» (`ubicacionId`, `total`, `clienteNombre`, `venceEnDias`) y la función `onCrear` completa. **Conserva** `loading` (lo sigue usando «Convertir»), el bloque «Formulario de conversión» y `onConvertir`.
3. **`cerrarModal`** queda así (solo lo de la conversión):
   ```ts
   function cerrarModal() {
     setModal(null);
     setClienteNumDoc("");
     setConvertirNombre("");
     setTipo("boleta");
   }
   ```
4. **JSX.** Borra el bloque `{/* ==================== Modal: crear proforma ==================== */}` … `{modal === "crear" && ( … )}` y en su lugar pon:
   ```tsx
      <NuevaProformaModal
        abierto={modal === "crear"}
        onCerrar={() => setModal(null)}
        ubicaciones={ubicaciones}
        ubicacionActualId={ubicacionActualId}
      />
   ```
   El tipo de `modal` no cambia todavía y el botón «Nueva proforma» sigue con `onClick={() => setModal("crear")}`.

- [ ] **Step 3: Tipos y lint**

Run: `pnpm --filter web typecheck` y `pnpm --filter web lint`
Expected: sin errores.

- [ ] **Step 4: Verificar que la pantalla actual se comporta igual**

En `http://localhost:3100/vender/facturacion`: «Nueva proforma» abre el modal; cambia Ubicación, escribe cliente y total, «Cancelar» lo cierra; al reabrir, cliente y total están vacíos, «Vigente por» vuelve a 7 y la ubicación conserva lo elegido. **Cómo verificas tú:** igual que antes. Con la base local arriba, guarda una proforma y comprueba que aparece en la tabla; «Convertir» de una vigente sigue abriendo su modal.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/NuevaProformaModal.tsx apps/web/components/ProformasPanel.tsx
# refactor(facturacion): NuevaProformaModal sale de ProformasPanel sin cambiar su lógica
git commit -F <archivo-con-el-mensaje>
```

---

### Task 6: Las piezas del marco (todavía sin rutas)

**Files:**
- Create: `apps/web/lib/useFacturacionAcciones.ts`
- Create: `apps/web/components/FacturacionCabecera.tsx`
- Create: `apps/web/components/FacturacionPestanas.tsx`
- Create: `apps/web/components/SelectorMesFacturacion.tsx`
- Create: `apps/web/components/FacturacionShell.tsx`

**Interfaces:**
- Consumes (tareas 1, 3, 4, 5): `PESTANAS`, `pestanaDeRuta`, `hrefPestana`, `esMesValido`, `NOMBRES_MES`, `mesAnterior`, `mesSiguiente`, `paramDeMes`, `esMismoMes`, `type Mes`, `type ConteosPestanas`, `type ConteoPestana` (Task 1); `BotonCompacto` (Task 3); `EmitirComprobanteModal` (Task 4); `NuevaProformaModal` (Task 5).
- Produces (Task 7):
  - `useFacturacionAcciones(): { abrirEmitir: () => void; abrirProforma: () => void }` y `AccionesFacturacionContext` en `@/lib/useFacturacionAcciones`
  - `FacturacionShell({ conteos, series, tiendas, ubicacionActualId, children })` con `conteos: ConteosPestanas`, `series: SerieComprobante[] | null`, `tiendas: { id: string; nombre: string }[] | null`, `ubicacionActualId: string`, `children: ReactNode`
  - `SelectorMesFacturacion({ ruta, mes, actual })` con `ruta: string`, `mes: Mes`, `actual: Mes` (componente de servidor)
  - `FacturacionCabecera()` y `FacturacionPestanas({ conteos })`

Nada de esto se usa todavía: la aplicación no cambia hasta la Task 7. Aquí se valida con tipos y lint.

> **Dos decisiones de diseño.** (1) El contexto vive en `lib/useFacturacionAcciones.ts` y no dentro del shell para evitar un ciclo de imports (el shell importa la cabecera, y la cabecera necesita el hook). (2) `SelectorMesFacturacion` es de **servidor**: el spec lo listaba como cliente, pero solo pinta enlaces y no necesita estado ni hooks; las dos vistas con mes lo dibujan con el mes que ya resolvieron.

- [ ] **Step 1: El contexto**

`apps/web/lib/useFacturacionAcciones.ts`:

```ts
"use client";

import { createContext, useContext } from "react";

// Quién puede abrir los modales de Facturación (ADR-0121): la cabecera y los botones de
// cada vista. Los modales los dibuja `FacturacionShell` una sola vez, así que las vistas no
// los tienen: le piden al shell que los abra. Vive en su propio archivo para que el shell
// (que importa la cabecera) y la cabecera (que necesita el hook) no formen un ciclo.
export type AccionesFacturacion = {
  abrirEmitir: () => void;
  abrirProforma: () => void;
};

export const AccionesFacturacionContext = createContext<AccionesFacturacion | null>(null);

export function useFacturacionAcciones(): AccionesFacturacion {
  const acciones = useContext(AccionesFacturacionContext);
  if (!acciones) throw new Error("useFacturacionAcciones solo se puede usar dentro de <FacturacionShell>.");
  return acciones;
}
```

- [ ] **Step 2: La cabecera**

`apps/web/components/FacturacionCabecera.tsx`:

```tsx
"use client";

import { FileText, Plus } from "lucide-react";
import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { useFacturacionAcciones } from "@/lib/useFacturacionAcciones";

// Cabecera de Facturación. En R1: el título y las dos acciones globales. La línea viva
// (fecha y hora, «actualizado hace…») y el buscador llegan con las vistas que los usan (R2).
export function FacturacionCabecera() {
  const { abrirEmitir, abrirProforma } = useFacturacionAcciones();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Vender</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Facturación</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BotonCompacto variante="vidrio" icono={<FileText aria-hidden strokeWidth={1.75} />} onClick={abrirProforma}>
          Nueva proforma
        </BotonCompacto>
        <BotonCompacto variante="primario" icono={<Plus aria-hidden strokeWidth={1.75} />} onClick={abrirEmitir}>
          Emitir comprobante
        </BotonCompacto>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Las pestañas**

`apps/web/components/FacturacionPestanas.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { esMesValido, hrefPestana, PESTANAS, pestanaDeRuta, type ConteoPestana, type ConteosPestanas } from "@/lib/facturacion-reglas";

// Contador de cada pestaña. Ámbar = hay algo por enviar; rojo = SUNAT rechazó alguno;
// neutro = solo informa. El texto va como `sr-only` (y como `title`) porque el número solo
// no dice qué cuenta, y el color solo no alcanza.
const TONO_CONTEO: Record<ConteoPestana["tono"], string> = {
  neutro: "bg-tinta/10 text-tinta",
  ambar: "bg-ambar/15 text-ambar-profundo",
  rojo: "bg-rojo/15 text-rojo-profundo",
};

// Las cuatro vistas de Facturación. La URL es la fuente de verdad (son enlaces: «atrás» del
// navegador funciona y una vista se puede compartir); la activa lleva `aria-current`.
// Usa `useSearchParams` para conservar `?m=` entre Proformas y Comprobantes, y por eso el
// shell la envuelve en <Suspense>.
export function FacturacionPestanas({ conteos }: { conteos: ConteosPestanas }) {
  const pathname = usePathname();
  const m = useSearchParams().get("m");
  const activa = pestanaDeRuta(pathname);
  const mes = esMesValido(m) ? m : null;
  const nav = useRef<HTMLElement>(null);

  // La píldora se coloca midiendo el DOM y escribiendo la posición en variables CSS del
  // propio <nav>. Se escribe directo en el estilo y no en estado (mismo patrón que
  // `Ayuda.tsx`): en `useLayoutEffect` el primer cuadro ya sale bien puesto, sin parpadeo
  // ni re-render, y no dispara `react-hooks/set-state-in-effect`.
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const colocar = () => {
      const activo = el.querySelector<HTMLElement>('[aria-current="page"]');
      if (!activo) return;
      el.style.setProperty("--pildora-x", `${activo.offsetLeft}px`);
      el.style.setProperty("--pildora-w", `${activo.offsetWidth}px`);
      el.dataset.medido = "";
    };
    colocar();
    // Las fuentes web y el ancho de la ventana cambian el ancho de las etiquetas.
    const observador = new ResizeObserver(colocar);
    observador.observe(el);
    return () => observador.disconnect();
  }, [activa, conteos]);

  // La transición se habilita recién después de la primera pintura: la píldora nace en su
  // lugar y solo se desliza cuando cambia la pestaña.
  useEffect(() => {
    const cuadro = requestAnimationFrame(() => {
      if (nav.current) nav.current.dataset.listo = "";
    });
    return () => cancelAnimationFrame(cuadro);
  }, []);

  return (
    <nav ref={nav} aria-label="Vistas de Facturación" className="vidrio-cayla pestanas-vidrio">
      {/* Decorativa: la información está en las etiquetas y en `aria-current`. */}
      <span aria-hidden className="pestanas-vidrio__pildora" />
      {PESTANAS.map((p) => {
        const esActiva = p.clave === activa;
        const conteo = conteos[p.clave];
        return (
          <Link
            key={p.clave}
            href={hrefPestana(p, mes)}
            aria-current={esActiva ? "page" : undefined}
            className={`relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-[15px] py-2 text-[14px] leading-5 outline-none transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60 ${
              esActiva ? "font-semibold text-crema" : "font-normal text-tinta"
            }`}
          >
            {p.etiqueta}
            {conteo && (
              <span
                title={`${conteo.valor} ${conteo.texto}`}
                className={`rounded-full px-1.5 py-[3px] text-[10.5px] font-semibold leading-none tabular-nums ${
                  esActiva ? "bg-crema/15 text-crema" : TONO_CONTEO[conteo.tono]
                }`}
              >
                {conteo.valor}
                <span className="sr-only"> {conteo.texto}</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: El selector de mes (servidor)**

`apps/web/components/SelectorMesFacturacion.tsx`:

```tsx
import Link from "next/link";
import { esMismoMes, mesAnterior, mesSiguiente, NOMBRES_MES, paramDeMes, type Mes } from "@/lib/facturacion-reglas";

const ENLACE =
  "label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo";

// El mes de las vistas Proformas y Comprobantes: ← mes anterior · mes actual · mes siguiente →.
// Es de servidor a propósito: solo pinta enlaces con el mes que la página ya resolvió, no
// necesita estado. Resumen es «hoy» y Códigos no tiene tiempo, así que no lo llevan.
// Nunca hay «mes siguiente» desde el mes actual: no hay nada que ver en el futuro.
export function SelectorMesFacturacion({ ruta, mes, actual }: { ruta: string; mes: Mes; actual: Mes }) {
  const previo = mesAnterior(mes);
  const siguiente = mesSiguiente(mes);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`${ruta}?m=${paramDeMes(previo)}`} className={ENLACE}>
        ← {NOMBRES_MES[previo.mes - 1]}
      </Link>
      <p className="font-display px-1 text-lg text-tinta">
        {NOMBRES_MES[mes.mes - 1]} {mes.anio}
      </p>
      {!esMismoMes(mes, actual) && (
        <Link href={`${ruta}?m=${paramDeMes(siguiente)}`} className={ENLACE}>
          {NOMBRES_MES[siguiente.mes - 1]} →
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 5: El shell**

`apps/web/components/FacturacionShell.tsx`:

```tsx
"use client";

import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import type { SerieComprobante } from "@/lib/comprobantes-reglas";
import type { ConteosPestanas } from "@/lib/facturacion-reglas";
import { AccionesFacturacionContext } from "@/lib/useFacturacionAcciones";
import { avisar } from "@/components/ui/Avisos";
import { EmitirComprobanteModal } from "@/components/EmitirComprobanteModal";
import { NuevaProformaModal } from "@/components/NuevaProformaModal";
import { FacturacionCabecera } from "@/components/FacturacionCabecera";
import { FacturacionPestanas } from "@/components/FacturacionPestanas";

type Tienda = { id: string; nombre: string };

// El marco de /vender/facturacion (ADR-0121): cabecera, pestañas y los dos modales que se
// abren desde cualquier vista. Es el padre con estado (molde de ADR-0043): guarda cuál
// modal está abierto y les da a las vistas, por contexto, la forma de abrirlos. Los
// modales se dibujan UNA vez acá — y siempre montados (ver `EmitirComprobanteModal`),
// fuera de `.tema-vidrio`, para que su overlay cubra la ventana y no un contenedor.
//
// `series` y `tiendas` llegan `null` cuando el layout no pudo leerlas (son datos del marco,
// `tolerar`: si fallan, el marco sigue vivo). Sin ellas no hay número que reservar ni tienda
// que elegir, así que el modal no se abre y se avisa en vez de dejar un formulario roto.
export function FacturacionShell({
  conteos,
  series,
  tiendas,
  ubicacionActualId,
  children,
}: {
  conteos: ConteosPestanas;
  series: SerieComprobante[] | null;
  tiendas: Tienda[] | null;
  ubicacionActualId: string;
  children: ReactNode;
}) {
  const [modal, setModal] = useState<"emitir" | "proforma" | null>(null);
  const cerrar = useCallback(() => setModal(null), []);

  const abrirEmitir = useCallback(() => {
    if (!series || !tiendas) {
      avisar.error("No se pudieron cargar las series de comprobantes", { detalle: "Recarga la página: sin ellas no se puede emitir." });
      return;
    }
    setModal("emitir");
  }, [series, tiendas]);

  const abrirProforma = useCallback(() => {
    if (!tiendas) {
      avisar.error("No se pudieron cargar las tiendas", { detalle: "Recarga la página para crear una proforma." });
      return;
    }
    setModal("proforma");
  }, [tiendas]);

  const acciones = useMemo(() => ({ abrirEmitir, abrirProforma }), [abrirEmitir, abrirProforma]);

  return (
    <AccionesFacturacionContext.Provider value={acciones}>
      <div className="tema-vidrio space-y-6">
        <FacturacionCabecera />
        {/* `useSearchParams` (en las pestañas) exige un <Suspense>. Como el layout es
            dinámico nunca llega a mostrarse el respaldo; `null` basta. */}
        <Suspense fallback={null}>
          <FacturacionPestanas conteos={conteos} />
        </Suspense>
        {children}
      </div>

      {series && tiendas && (
        <EmitirComprobanteModal abierto={modal === "emitir"} onCerrar={cerrar} series={series} ubicaciones={tiendas} ubicacionActualId={ubicacionActualId} />
      )}
      {tiendas && <NuevaProformaModal abierto={modal === "proforma"} onCerrar={cerrar} ubicaciones={tiendas} ubicacionActualId={ubicacionActualId} />}
    </AccionesFacturacionContext.Provider>
  );
}
```

- [ ] **Step 6: Tipos y lint**

Run: `pnpm --filter web typecheck` y `pnpm --filter web lint`
Expected: sin errores ni avisos. Si `react-hooks/set-state-in-effect` o `react-hooks/refs` protestara por `nav.current.dataset` dentro de un efecto, no es un falso positivo que se apague con un comentario a ciegas: escribir en el DOM desde un efecto es justo el patrón de `Ayuda.tsx`; si aun así lo marca, agrega `// eslint-disable-next-line <regla> -- <razón concreta>` en esa línea y nada más (así lo hace el repo).

- [ ] **Step 7: Pruebas**

Run: `pnpm --filter web test`
Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/useFacturacionAcciones.ts apps/web/components/FacturacionCabecera.tsx apps/web/components/FacturacionPestanas.tsx apps/web/components/SelectorMesFacturacion.tsx apps/web/components/FacturacionShell.tsx
# feat(facturacion): shell, cabecera, pestañas y selector de mes (aún sin rutas)
git commit -F <archivo-con-el-mensaje>
```

---

### Task 7: Las cuatro rutas, el redirect y el retiro de lo viejo

Es el «cambio de llave»: a partir de aquí `/vender/facturacion` es el layout con cuatro vistas. Todo lo anterior era aditivo o refactor; esto conecta las piezas y borra lo viejo.

**Files:**
- Create: `apps/web/app/(app)/vender/facturacion/layout.tsx`
- Create: `apps/web/app/(app)/vender/facturacion/error.tsx`
- Rewrite: `apps/web/app/(app)/vender/facturacion/page.tsx`
- Create: `apps/web/app/(app)/vender/facturacion/proformas/page.tsx`
- Create: `apps/web/app/(app)/vender/facturacion/comprobantes/page.tsx`
- Create: `apps/web/app/(app)/vender/facturacion/descuentos/page.tsx`
- Delete: `apps/web/app/(app)/vender/descuentos/page.tsx`
- Delete: `apps/web/components/VenderNav.tsx`
- Modify: `apps/web/components/ComprobantesPanel.tsx`
- Modify: `apps/web/components/ProformasPanel.tsx`
- Modify: `apps/web/next.config.ts`

**Interfaces:**
- Consumes: todo lo producido en las tareas 1 a 6.
- Produces: las cuatro URLs `/vender/facturacion`, `/proformas`, `/comprobantes`, `/descuentos` (bajo `/vender/facturacion`) y el redirect `/vender/descuentos → /vender/facturacion/descuentos`.

- [ ] **Step 1: El layout (el marco que no puede caerse)**

`apps/web/app/(app)/vender/facturacion/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { exigirLider } from "@/lib/persona-actual";
import { getResumenPorEnviar, getSeriesComprobantes } from "@/lib/comprobantes";
import { getResumenProformas } from "@/lib/proformas";
import { getUbicaciones } from "@/lib/ubicaciones";
import { conteosDePestanas, tiendasOperativas, ubicacionActualDe } from "@/lib/facturacion-reglas";
import { FacturacionShell } from "@/components/FacturacionShell";

// Facturación electrónica — rescatada de producción (2026-09-12, ver
// supabase/migrations/0010_facturacion.sql). Reserva comprobantes con correlativo oficial y
// los transmite a SUNAT por Lucode (PSE) desde la misma pantalla; anular es un tercer paso
// aparte. Toda la pantalla es de líder: emitir, transmitir y anular mueven documentos
// legales. `exigirLider` es la primera de las tres capas (pantalla, RPC, RLS) y CADA
// `page.tsx` la repite: este layout no vuelve a ejecutarse al navegar entre las vistas.
//
// EL MARCO NO PUEDE CAERSE. Si este layout revienta, el error sube al layout de arriba y se
// lleva la cabecera y las pestañas con él — justo lo que `error.tsx` promete que NO pasa
// cuando falla una vista. Por eso lo que lee acá (series, tiendas, contadores) es del marco:
// si falla, se oculta (`null`) y se registra en el log, no se propaga. Las vistas, que sí
// muestran plata, leen con `exigir` y sí revientan hacia `error.tsx`.
const opcional = <T,>(lectura: Promise<T>): Promise<T | null> =>
  lectura.catch((error) => {
    console.error("Facturación: no se pudo leer un dato del marco:", error);
    return null;
  });

export default async function FacturacionLayout({ children }: { children: ReactNode }) {
  const persona = await exigirLider();

  const [ubicaciones, series, porEnviar, proformas] = await Promise.all([
    opcional(getUbicaciones()),
    opcional(getSeriesComprobantes()),
    getResumenPorEnviar(), // ya devuelven `null` si fallan (`tolerar`)
    getResumenProformas(),
  ]);

  const tiendas = ubicaciones ? tiendasOperativas(ubicaciones) : null;

  return (
    <FacturacionShell
      conteos={conteosDePestanas(porEnviar, proformas)}
      series={series}
      tiendas={tiendas ? tiendas.map(({ id, nombre }) => ({ id, nombre })) : null}
      ubicacionActualId={tiendas ? ubicacionActualDe(tiendas, persona.ubicacionId) : ""}
    >
      {children}
    </FacturacionShell>
  );
}
```

- [ ] **Step 2: El error de una vista**

`apps/web/app/(app)/vender/facturacion/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { BotonCompacto } from "@/components/ui/BotonCompacto";

// Barrera de error de UNA vista de Facturación. Vive dentro del layout, así que la
// cabecera y las pestañas siguen ahí y las otras vistas siguen funcionando. Con `exigir()`
// lanzando (lib/resultado.ts), esto es lo que ve la Encargada cuando una consulta de plata
// falla: dice qué hacer, no qué pasó, y no muestra ningún número — preferimos no enseñar
// uno equivocado.
export default function ErrorDeVista({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Vista de Facturación caída:", error);
  }, [error]);

  return (
    <div className="card-cayla anim-entrada mx-auto max-w-md p-8 text-center">
      <p className="label-cayla text-[11px] text-rojo">No se pudo cargar</p>
      <h2 className="font-display mt-2 text-xl text-tinta">Esta vista no está mostrando datos</h2>
      <p className="mt-3 text-sm text-tinta/75">
        Algo falló al traer la información y no mostramos nada a propósito: preferimos no enseñarte un número equivocado.
        Las otras vistas siguen funcionando.
      </p>
      <p className="mt-2 text-sm text-tinta/75">Suele ser un corte momentáneo de conexión. Reintenta; si sigue igual, avisa a Felipe.</p>
      <div className="mt-6 flex justify-center">
        <BotonCompacto variante="primario" onClick={reset}>
          Reintentar
        </BotonCompacto>
      </div>
      {error.digest && (
        <p className="mt-5 text-xs text-tinta/65">
          Código: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Resumen (la ruta base)**

Reemplaza **todo** el contenido de `apps/web/app/(app)/vender/facturacion/page.tsx`:

```tsx
import { exigirLider } from "@/lib/persona-actual";
import { getVentasDeHoy } from "@/lib/comprobantes";
import { VentasDelDiaPanel } from "@/components/VentasDelDiaPanel";

// Resumen = hoy. En R1 muestra el panel de ventas de hoy tal cual; R2 lo reemplaza por las
// tarjetas de vidrio y la actividad de hoy (con el hilo del comprobante).
export default async function ResumenPage() {
  await exigirLider();
  // Sin ubicación: un líder ve las ventas de todas las tiendas del día, que es justo lo que
  // pidió ("todo lo que se vendió hoy") — un integrante vería solo la suya igual, aunque acá
  // nunca entra (la pantalla entera es líder-only).
  const ventasHoy = await getVentasDeHoy();
  return <VentasDelDiaPanel ventas={ventasHoy} />;
}
```

- [ ] **Step 4: Proformas**

`apps/web/app/(app)/vender/facturacion/proformas/page.tsx`:

```tsx
import { exigirLider } from "@/lib/persona-actual";
import { getProformasMes } from "@/lib/proformas";
import { mesActualLima, mesLimaUTC } from "@/lib/fecha-lima";
import { mesDeParametro } from "@/lib/facturacion-reglas";
import { ProformasPanel } from "@/components/ProformasPanel";
import { SelectorMesFacturacion } from "@/components/SelectorMesFacturacion";

// El modal de «Nueva proforma» ya no vive en el panel sino en el shell (que ya tiene las
// tiendas): esta vista solo lee las proformas del mes.
export default async function ProformasPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await exigirLider();
  const { m } = await searchParams;
  const actual = mesActualLima();
  const mes = mesDeParametro(m, actual);
  const { desde, hasta } = mesLimaUTC(mes.anio, mes.mes);

  const proformas = await getProformasMes(desde, hasta);

  return (
    <div className="space-y-6">
      <SelectorMesFacturacion ruta="/vender/facturacion/proformas" mes={mes} actual={actual} />
      <ProformasPanel proformas={proformas} />
    </div>
  );
}
```

- [ ] **Step 5: Comprobantes**

`apps/web/app/(app)/vender/facturacion/comprobantes/page.tsx`:

```tsx
import { exigirLider } from "@/lib/persona-actual";
import { getComprobantesMes, getSeriesComprobantes } from "@/lib/comprobantes";
import { getUbicaciones } from "@/lib/ubicaciones";
import { mesActualLima, mesLimaUTC } from "@/lib/fecha-lima";
import { mesDeParametro, tiendasOperativas, ubicacionActualDe } from "@/lib/facturacion-reglas";
import { ComprobantesPanel } from "@/components/ComprobantesPanel";
import { SelectorMesFacturacion } from "@/components/SelectorMesFacturacion";

export default async function ComprobantesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const persona = await exigirLider();
  const { m } = await searchParams;
  const actual = mesActualLima();
  const mes = mesDeParametro(m, actual);
  const { desde, hasta } = mesLimaUTC(mes.anio, mes.mes);

  // `getSeriesComprobantes` y `getUbicaciones` van con `cache`: el layout ya las pidió en
  // esta misma petición y acá no se leen otra vez.
  const [comprobantes, series, ubicaciones] = await Promise.all([getComprobantesMes(desde, hasta), getSeriesComprobantes(), getUbicaciones()]);
  const tiendas = tiendasOperativas(ubicaciones);

  return (
    <div className="space-y-6">
      <SelectorMesFacturacion ruta="/vender/facturacion/comprobantes" mes={mes} actual={actual} />
      <ComprobantesPanel comprobantes={comprobantes} series={series} ubicaciones={tiendas} ubicacionActualId={ubicacionActualDe(tiendas, persona.ubicacionId)} />
    </div>
  );
}
```

- [ ] **Step 6: Códigos de descuento (se mueve)**

`apps/web/app/(app)/vender/facturacion/descuentos/page.tsx`:

```tsx
import { exigirLider } from "@/lib/persona-actual";
import { getCodigosDescuento } from "@/lib/codigos-descuento";
import { getUbicaciones } from "@/lib/ubicaciones";
import { CodigosDescuentoPanel } from "@/components/CodigosDescuentoPanel";

// Tanda 3 del diagnóstico de Venta y Caja (2026-09-15); desde ADR-0121 vive como la cuarta
// vista de Facturación (antes era `/vender/descuentos`, que ahora redirige). Líder-only: un
// código de descuento cambia cuánto se cobra en toda la tienda — mismo criterio que el
// resto de Facturación (`exigirLider` como primera de las tres capas: pantalla, RLS de la
// tabla, y la propia registrar_venta que valida el código al cobrar).
export default async function DescuentosPage() {
  await exigirLider();

  const [codigos, ubicaciones] = await Promise.all([getCodigosDescuento(), getUbicaciones()]);
  // Distinto a las otras vistas a propósito: un código puede acotarse a cualquier sede que
  // venda, no solo a las tiendas que emiten comprobantes.
  const ubicacionesOperativas = ubicaciones.filter((u) => u.tipo !== "almacen");

  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta/65">Crea, apaga y revisa la vigencia. Un código usado nunca se borra — es historia.</p>
      <CodigosDescuentoPanel codigos={codigos} ubicaciones={ubicacionesOperativas} />
    </div>
  );
}
```

- [ ] **Step 7: Borrar lo viejo**

```powershell
git rm "apps/web/app/(app)/vender/descuentos/page.tsx"
git rm apps/web/components/VenderNav.tsx
```

Comprueba antes que nadie importa `VenderNav` (`git grep -n VenderNav -- apps` debe devolver solo el propio archivo) y que ningún enlace apunta ya a `/vender/descuentos` fuera del redirect (`git grep -n "vender/descuentos" -- apps` debe quedar sin resultados tras el paso 8).

- [ ] **Step 8: El redirect**

En `apps/web/next.config.ts`, agrega esta entrada al arreglo que devuelve `redirects()`, después de la de `/productos/etiquetas`:

```ts
      // Facturación en cuatro vistas (ADR-0121, 2026-09): los códigos de descuento pasaron a
      // ser la cuarta pestaña de Facturación. `permanent: false` por la misma razón que los
      // otros alias: un redirect permanente queda cacheado en cada navegador y no hay forma
      // de limpiarlo del lado del cliente.
      { source: "/vender/descuentos", destination: "/vender/facturacion/descuentos", permanent: false },
```

- [ ] **Step 9: Los paneles abren los modales por contexto**

En `apps/web/components/ComprobantesPanel.tsx`:

1. Agrega el import y quita el del modal:
   ```ts
   import { useFacturacionAcciones } from "@/lib/useFacturacionAcciones";
   ```
   y borra `import { EmitirComprobanteModal } from "@/components/EmitirComprobanteModal";`.
2. Cambia el tipo del estado: `useState<"serie" | "anular" | "liberar" | null>(null)` (ya no existe `"emitir"`).
3. Al inicio del componente, junto a `const router = useRouter();`, agrega `const { abrirEmitir } = useFacturacionAcciones();`.
4. Borra el elemento `<EmitirComprobanteModal … />` del JSX (lo dibuja el shell).
5. En el botón de la sección «Comprobantes»: `<Boton peso="primario" onClick={abrirEmitir}>` (antes `onClick={() => setModal("emitir")}`).

En `apps/web/components/ProformasPanel.tsx`:

1. Agrega `import { useFacturacionAcciones } from "@/lib/useFacturacionAcciones";` y borra `import { NuevaProformaModal } from "@/components/NuevaProformaModal";`.
2. Cambia el tipo del estado: `useState<{ convertir: Proforma } | null>(null)` (ya no existe `"crear"`).
3. Junto a `const router = useRouter();`, agrega `const { abrirProforma } = useFacturacionAcciones();`.
4. Borra el elemento `<NuevaProformaModal … />` del JSX.
5. En el botón «Nueva proforma»: `onClick={abrirProforma}` (antes `onClick={() => setModal("crear")}`).
6. **Quita lo que el panel deja de usar.** Sin el modal, `ubicaciones` y `ubicacionActualId` ya no se usan en `ProformasPanel`: quítalas de la firma y del tipo de props (queda `{ proformas }: { proformas: Proforma[] }`) y borra el `type Ubicacion = { id: string; nombre: string };` que quedó sin uso. ESLint marca las tres cosas como variables sin uso, y la página de Proformas (Step 4) ya no se las pasa.

- [ ] **Step 10: Tipos, lint y pruebas**

Run: `pnpm --filter web typecheck`, `pnpm --filter web lint`, `pnpm --filter web test`
Expected: todo en verde. Un error típico aquí: un import sin uso que quedó en un panel, o un `modal === "emitir"` que sobrevivió.

- [ ] **Step 11: Humo rápido en el navegador**

Con el servidor de desarrollo y la sesión de líder: abre las cuatro URLs (`/vender/facturacion`, `/proformas`, `/comprobantes`, `/descuentos`, todas bajo `/vender/facturacion`), comprueba que cargan, que «Emitir comprobante» y «Nueva proforma» abren su modal desde cualquiera de ellas (cabecera y botón de cada vista) y que `http://localhost:3100/vender/descuentos` te lleva a la nueva ruta. La verificación completa contra los nueve criterios es la Task 8.

- [ ] **Step 12: Commit**

```bash
git add -A apps/web/app apps/web/components apps/web/next.config.ts
git diff --cached --name-only     # revisa: 4 rutas nuevas + layout + error + paneles + next.config + 2 borrados
# feat(facturacion): cuatro vistas por ruta bajo un layout; /vender/descuentos redirige
git commit -F <archivo-con-el-mensaje>
```

---

### Task 8: Verificación de aceptación de R1 y cierre documental

**Files:**
- Modify: `docs/ARQUITECTURA.md`, `docs/BACKLOG.md`, `docs/BITACORA.md`, `docs/SESIONES-ACTIVAS.md`
- Modify (solo si aprendiste algo que cambia la decisión): `docs/adr/0121-…md`

**Interfaces:**
- Consumes: R1 completa (tareas 1 a 7) y la línea base de la Task 0.2 (d).
- Produces: R1 cerrada y verificada, y la pregunta a Felipe sobre Atelier.

**Contra qué base se verifica.** `apps/web/.env.local` apunta a Supabase local con `LUCODE_ENTORNO=sandbox`, así que se comprueba contra la base local. R1 no toca esquema; en producción no hay nada que pegar. Si la base local está caída, se verifica todo lo que no necesita datos y se dice explícitamente qué quedó sin comprobar.

- [ ] **Step 1: Comprobar la base y levantar el servidor**

```powershell
pnpm local:donde          # qué stacks de Supabase local están arriba, con qué puertos, y cuál declara este repo
pnpm --filter web exec next dev -p 3100
```

**Antes de fiarte de cualquier resultado, mira `local:donde`:** en esta máquina conviven dos stacks de Supabase local, el de `cayla-retail` (API 54421) y el de `cayla-dynamic` (API 54321). Apuntar al equivocado **no explota**: el de Dynamic también tiene un schema `retail` (la foto de producción unificada), así que el catálogo y las ventas responden con normalidad, y lo que falla son las tablas construidas después de la unificación, como `comprobantes` — o sea, justo Facturación. Si `.env.local` apunta al 54321, cámbialo al 54421 y reinicia el servidor antes de probar nada. Si Docker está caído, verifica lo que no necesita datos y di explícitamente qué quedó sin comprobar.

Felipe inicia sesión como **líder** en el panel del navegador integrado (`http://localhost:3100/login`).

- [ ] **Step 2: Los nueve criterios de aceptación (spec §10, R1)**

| # | Criterio | Cómo se comprueba | Esperado |
|---|---|---|---|
| 1 | Las cuatro URLs cargan y el lateral marca «Facturación» | Abre cada una. En consola: `document.querySelector('nav[aria-label="Vistas de Facturación"] [aria-current="page"]')?.textContent` | La pestaña correcta en cada URL; en el lateral, «Facturación» resaltada en las cuatro |
| 2 | Atrás y adelante entre pestañas | Navega Resumen → Proformas → Comprobantes; `history.back()` dos veces; `history.forward()` | La pestaña activa y la píldora siguen a la URL en cada paso |
| 3 | `/vender/descuentos` redirige (307) | `curl.exe -sI http://localhost:3100/vender/descuentos` | `307` y `location: /vender/facturacion/descuentos` |
| 4 | Los contadores coinciden con la base y se ocultan si su consulta falla | Compara el número de «Comprobantes» con `select count(*) from public.comprobantes where estado in ('pendiente','rechazado')` en la base local, y el de «Proformas» con las vigentes que aún no vencieron (`select count(*) from public.proformas where estado='vigente' and (vence_at is null or vence_at > now())`). **En la base local las tablas viven en `public`** (sin prefijo `retail.`, que solo existe en producción). Para «se ocultan»: rompe a propósito el nombre de la tabla en `getResumenPorEnviar` (por ejemplo `"comprobantes_x"`), recarga y mira que la pestaña queda **sin** contador y sin error; **revierte** | Coinciden; sin contador cuando falla; la vista sigue cargando |
| 5 | Un error en una vista no tumba la cabecera | Pon `throw new Error("prueba de error de vista");` como primera línea del cuerpo de `proformas/page.tsx`, abre `/vender/facturacion/proformas`; después **revierte** con `git checkout -- "apps/web/app/(app)/vender/facturacion/proformas/page.tsx"` | Sale la tarjeta «Esta vista no está mostrando datos» con «Reintentar»; la cabecera y las pestañas siguen; la pestaña Resumen funciona |
| 6 | «Emitir comprobante» y «Nueva proforma» abren su modal desde cualquier pestaña y la emisión conserva su token | Ábrelos desde la cabecera en las cuatro pestañas y desde el botón de Comprobantes/Proformas. **Token:** compara `EmitirComprobanteModal.tsx` con `ComprobantesPanel.tsx` tal como era antes de la Task 4 (`git log --oneline -- apps/web/components/ComprobantesPanel.tsx` te da el hash del commit de la Task 4; `git show <hash>~1:apps/web/components/ComprobantesPanel.tsx`): `tokenEmision` sigue siendo un `useRef` inicializado una vez y se renueva solo tras un Emitir exitoso. Con la base local arriba, emite una boleta de prueba (nunca «Transmitir» sin confirmar `LUCODE_ENTORNO=sandbox`) | Los dos modales abren desde todas; la boleta aparece en Comprobantes; sin diferencias de lógica |
| 7 | El mes se conserva entre Proformas y Comprobantes | Abre `/vender/facturacion/proformas?m=2026-8`, pulsa la pestaña Comprobantes; luego Resumen; luego Comprobantes de nuevo | Comprobantes conserva `?m=2026-8`; Resumen y Códigos no llevan `m`; sin `m` se ve el mes actual |
| 8 | Un integrante es redirigido | Con una sesión de rol **integrante** (pide la cuenta de prueba a Felipe o usa la del seed local) abre `/vender/facturacion` y `/vender/facturacion/descuentos` | Las dos te llevan a `/` |
| 9 | Con Tab se llega a las pestañas y el foco se ve | Con el teclado, Tab hasta las pestañas; en consola `getComputedStyle(document.activeElement).outlineStyle` | Cada pestaña recibe foco y muestra un contorno visible (`outline-rojo/60`) |

- [ ] **Step 3: Medir lo aprobado (no fiarse del CSS escrito)**

En la consola del panel, con `/vender/facturacion` abierta:

```js
const px = (e, p) => getComputedStyle(e)[p];
const tabs = [...document.querySelectorAll('nav[aria-label="Vistas de Facturación"] a')];
console.table(tabs.map((a) => ({ texto: a.firstChild.textContent, size: px(a, "fontSize"), peso: px(a, "fontWeight"), mayus: px(a, "textTransform"), padding: px(a, "padding") })));
const nav = document.querySelector('nav[aria-label="Vistas de Facturación"]');
console.log({ radio: px(nav, "borderRadius"), padding: px(nav, "padding"), blur: px(nav, "backdropFilter"), fondo: px(nav, "backgroundColor"), borde: px(nav, "border") });
const pil = nav.querySelector(".pestanas-vidrio__pildora");
console.log({ radio: px(pil, "borderRadius"), ancho: px(pil, "width"), transicion: px(pil, "transitionDuration"), sombra: px(pil, "boxShadow") });
// Solo en Resumen (`/vender/facturacion`): ahí los únicos botones con estos textos son los dos de la cabecera.
console.table([...document.querySelectorAll("button")].filter((b) => /Emitir comprobante|Nueva proforma/.test(b.textContent)).map((b) => ({ texto: b.textContent.trim(), alto: px(b, "height"), radio: px(b, "borderRadius"), size: px(b, "fontSize"), peso: px(b, "fontWeight"), padding: px(b, "padding") })));
```

Esperado (spec §7): etiquetas de **14px**, peso **400** (la activa **600**), `text-transform: none`, padding **8px 15px**; contenedor de radio **14px**, padding **4px**, `blur(22px)`; píldora de radio **10px** con transición de **0.45s**; botones de **36px** de alto, radio **10px**, **13px**, peso **500**, padding **0 14px**. Cualquier diferencia se corrige en `globals.css` o en el componente, no se acepta.

- [ ] **Step 4: Ver el resultado y ajustar**

Toma capturas del panel visible a 1620 px y a 1024 px de ancho (`resize_window`; vuelve a `desktop` al terminar) y a 375 px (las pestañas deben desplazarse en horizontal dentro de su contenedor, sin desbordar la página). Compara con el look aprobado (spec §7 y ADR-0121). Con «movimiento reducido» activado en el sistema, la píldora salta sin deslizarse. Verifica también la primera pintura: recarga con `Ctrl+Shift+R` y comprueba que la pestaña activa nunca aparece con la etiqueta en crema sobre el vidrio (ilegible).

- [ ] **Step 5: Construir (opcional pero recomendado)**

Run: `pnpm --filter web build`
Detecta lo que `next dev` no muestra: un `<Suspense>` faltante para `useSearchParams`, rutas duplicadas o un import de servidor arrastrado al cliente. Necesita las variables de `.env.local`. Si no se puede correr, dilo en el cierre.

- [ ] **Step 6: Documentación**

1. **`docs/ARQUITECTURA.md`:** en el bloque de rutas, sustituye las dos primeras líneas del punto de `/vender/facturacion` (las que empiezan «- `/vender/facturacion` → `lib/comprobantes.ts` → `ComprobantesPanel.tsx` →» y «  RPCs `emitir_comprobante` …») por:
   ```
   - `/vender/facturacion/**` (layout + cuatro vistas por ruta, ADR-0121): `layout.tsx` lee
     series, tiendas y los contadores de las pestañas y los pasa a `FacturacionShell.tsx`, que
     dibuja la cabecera, las pestañas y —una sola vez— los modales «Emitir comprobante» y
     «Nueva proforma». Vistas: Resumen → `VentasDelDiaPanel.tsx`; `proformas/` →
     `ProformasPanel.tsx`; `descuentos/` → `CodigosDescuentoPanel.tsx` (antes
     `/vender/descuentos`, que redirige); `comprobantes/` → `lib/comprobantes.ts` →
     `ComprobantesPanel.tsx` →
     RPCs `emitir_comprobante` (reserva serie+correlativo, `for update`) y
   ```
   El resto del punto no cambia. (La línea que aún dice que Nubefact está «planeado» —es Lucode— se corrige en R4.)
2. **`docs/BACKLOG.md`:** en la sección Facturación, marca `- [x]` en R1 y agrega una línea con la fecha y lo verificado. Anota como pendientes conocidos, con su porqué: (a) hasta R3 la tarjeta «Pendientes de enviar» del panel de Comprobantes sigue contando `pendiente`+`enviado` **del mes**, mientras el contador de la pestaña cuenta `pendiente`+`rechazado` **sin mes** (definición del spec §9): no es un error de R1; (b) hasta R3 la tarjeta «Proformas vigentes» cuenta también las vencidas.
3. **`docs/BITACORA.md`:** tres líneas en el formato de las entradas vecinas: qué se cerró (R1: estructura), qué se verificó y cómo (los nueve criterios, contra la base local), y qué se lleva Felipe (lo que sorprendió al construir; por ejemplo, si la medición del CSS reveló una diferencia con lo escrito).
4. **`docs/SESIONES-ACTIVAS.md`:** actualiza la fila de esta sesión (R1 hecha; R2 espera a Atelier) o muévela a «Cerradas hoy» si se pausa.

- [ ] **Step 7: Commit del cierre**

```bash
git add docs/ARQUITECTURA.md docs/BACKLOG.md docs/BITACORA.md docs/SESIONES-ACTIVAS.md
git diff --cached --name-only
# docs(facturacion): cierre de R1 — ARQUITECTURA, BACKLOG y BITÁCORA
git commit -F <archivo-con-el-mensaje>
```

- [ ] **Step 8: Punto de decisión — parar y preguntar**

R1 no depende de Atelier; R2 sí. Antes de escribir el plan de R2 a R4, **verifica de nuevo** si Atelier ya está en `main` (Task 0.1, paso 3). Si **no** está, para y pregúntale a Felipe, con la recomendación primero:

1. **Esperar** a que Atelier entre a `main` (recomendada si Atelier está cerca de mergearse: R2 se apoya en sus nombres reales, sin adivinar).
2. **Apoyarse en la rama de Atelier** (fusionarla a esta rama): adelanta R2 pero ata este trabajo a una rama que hoy ni siquiera está subida a GitHub y cuyo ADR-0106 choca con el de «colores».
3. **Duplicar lo mínimo** (`CifraAnimada`, `FechaHoraLima`, las clases de movimiento) dentro de la isla: R2 no espera a nadie, pero queda código repetido que después hay que unificar.

Nada de esto se decide solo. **No hay push** hasta que Felipe lo pida.

---

# Fases siguientes (R2 a R4)

Se bajan a tareas **al cerrar R1**, en un plan aparte (`docs/superpowers/plans/…-r2-r4.md`), con la API real de Atelier a la vista. Lo que ya está decidido y no se vuelve a discutir (todo del spec):

| Fase | Entra | Aceptación (spec §10) | Depende de |
|---|---|---|---|
| **R2 — Resumen** | `TarjetaKpiVidrio`, `ActividadDeHoy`, `HiloComprobante`, `lib/useTransmitir.ts`, comparativos (`lib/ventas-comparativo.ts`), franja de proformas (`ResumenProformas`), línea viva y leyenda, y el buscador de la cabecera (`useFacturacionBusqueda` + `coincide`). Reglas puras (§6): `enlazarVentasConComprobantes`, `etapasDelHilo`, `tonoVendidoHoy`/`tonoPorEnviar`, `comparativoHastaEstaHora`, `antiguedad`, `ventanaHastaEstaHora`, `coincide`. Movimiento (§8). | Las cifras de las tarjetas coinciden con las filas; el comparativo usa la misma medida en ambos lados; *Transmitir* en una fila (sandbox) hace avanzar el hilo, cambia el chip y baja el contador con el color de la tarjeta; un rechazo la pone en rojo con su motivo; un aceptado de prueba se ve distinto de uno real; sin ventas hoy hay un estado vacío con texto; con movimiento reducido se ve el resultado sin el viaje. | **Atelier en `main`** (`CifraAnimada`, `FechaHoraLima`, `anim-sube`, `check-trazo`, `hilo-dibuja`); resultados de R0 (`ventas.estado`, `fn_ventas_del_dia` sin anuladas); las tarjetas de `TarjetaKpiVidrio` estrenan `@property --kc` dentro de la isla (`@layer components` y candado de ADR-0105). |
| **R3 — Comprobantes y Proformas** | Tarjetas nuevas con las definiciones del §9 (`resumenMontos`: «Monto facturado» = aceptados en producción, sin baja en trámite), chips y botones compactos (`fila`, `fila-alerta`), la franja de series faltantes (`seriesFaltantes`), la regla `vencida` ya escrita en R1 aplicada al panel (orden: vigente por vencer, vigente, vencida, convertida, anulada; 4.ª tarjeta «Vencidas») y la búsqueda local. | «Monto facturado» solo suma aceptados de producción; se ve qué series faltan; una proforma vencida no cuenta como vigente y se ve como tal; la tabla y las tarjetas móviles muestran lo mismo. | R1. Comparte `globals.css` con la sesión de «Ventas visual»: sincronizar `main` antes de tocarlo. |
| **R4 — Códigos y cierre** | La pestaña Códigos con su búsqueda, la pasada de responsive, accesibilidad y movimiento reducido, y la documentación del §14 (ARQUITECTURA con la línea de Nubefact→Lucode, `docs/datos/modulos/08-facturacion-sunat.md`, ADR-0121 ajustado, BACKLOG, BITÁCORA). | Ver §10 y §13 del spec. | R2 y R3. |

**Quedan fuera** (spec §3): emitir desde la fila de una venta sin comprobante; columna «Productos» en proformas; contador en el menú lateral y «en vivo» por polling; búsqueda de comprobantes sin límite de mes; consultar el estado de un comprobante `enviado` (integración con Lucode: confirmar con Felipe antes); cambios de esquema/RPC/RLS (única excepción condicionada: una migración de `fn_ventas_del_dia` si R0 la exige, con el OK de Felipe); llevar el vidrio a otros módulos, modo oscuro y el `EncabezadoPagina` de Atelier.

---

# Autorrevisión contra el spec

| Spec | Cubierto por |
|---|---|
| §4.1 rutas, layout, redirect, `exigirLider` en cada página, borrado de `VenderNav` | Tareas 2, 6, 7 |
| §4.2 datos por vista (layout con `tolerar`; vistas con `exigir`; mes solo en Proformas y Comprobantes) | Tareas 1, 2, 7 |
| §4.3 modales globales (molde de ADR-0043), modales extraídos sin cambiar su lógica | Tareas 4, 5, 6 |
| §5 componentes de R1: `BotonCompacto`, `FacturacionShell`, `FacturacionCabecera`, `FacturacionPestanas`, `SelectorMesFacturacion` | Tareas 3, 6 |
| §6 reglas puras: `marcarPorVencer` con `vencida` (8) | Task 1. Las demás (1 a 7, 9, 10) son de R2 y R3 |
| §7 vidrio, pestañas, botones, cabecera, accesibilidad, responsive | Tareas 3, 6, 8 (medición) |
| §8 movimiento de la píldora y movimiento reducido | Tareas 3, 6, 8 |
| §9 definiciones de contadores («por enviar», «vigentes que aún valen») | Tareas 1, 2, 8 (compara contra la base) |
| §10 R0 y R1 con sus nueve criterios de aceptación | R0 y Task 8 |
| §11 coordinación (Atelier, `panel-comercial`, Ventas visual, paleta de pago, ADR) | Task 0.1 |
| §12 riesgos (producción ≠ repo, transmitir contra producción, contadores viejos, conflictos en `globals.css`) | Tareas 0.2, 8; «Convenciones» |
| §13 verificación (tipos, lint, pruebas, navegador con el panel visible) | Cada tarea y Task 8 |
| §14 documentación | Task 8 (ARQUITECTURA, BACKLOG, BITÁCORA, SESIONES-ACTIVAS); el resto en R4 |

**Desviaciones respecto al spec (todas de implementación, ninguna de diseño):** (1) `getConteosFacturacion()` se parte en dos lecturas, una por tabla; (2) `SelectorMesFacturacion` es de servidor; (3) el contexto de los modales vive en `lib/useFacturacionAcciones.ts`; (4) la regla `vencida` entra en R1 (la usa el contador de la pestaña) y el panel la adopta en R3; (5) el bloque de CSS incluye `.pestanas-vidrio` (el spec solo nombra «el bloque de la isla») y usa `@layer components` por ADR-0105, que entró a `main` después de escribirse el spec.

**Riesgos que este plan ya cubre:** el candado de ADR-0105 (Task 3, pasos 1 y 4); el token de idempotencia al extraer el modal (Task 4, encabezado); un layout que revienta y se lleva el marco (Task 7, paso 1); la píldora sin parpadeo en la primera pintura (Task 3, CSS `:not([data-medido])`); contadores que difieren temporalmente del panel hasta R3 (Task 8, paso 6); ADR renumerado (Task 0.1, paso 2); emitir o transmitir contra producción (Convenciones).
