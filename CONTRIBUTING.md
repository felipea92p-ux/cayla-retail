# Cómo colaborar en CAYLA Retail

Somos 5 personas con acceso de escritura al repo (Felipe + Danytristee, Trix-One,
CuervoCayla, ColibriCayla). Esta guía es el flujo para que cada quien avance su parte en
su propia máquina, sin pisar el trabajo de los demás, y lo junte seguido — no una vez al
final.

## 1. Entorno local — un stack por persona, nadie comparte base de datos

Cada quien levanta su propio Postgres local, aislado en su máquina, con Docker. Nadie
necesita pedirle nada a nadie: es 100% autocontenido.

```bash
git clone https://github.com/felipea92p-ux/cayla-retail.git
```

1. Docker Desktop corriendo.
2. `pnpm install` — activa de paso el hook de [.githooks/pre-commit](.githooks/pre-commit)
   (tipos + tests + lint solo de lo que estás commiteando, ~19s).
3. `cp supabase/0000_local_stub_dynamic.sql.example supabase/migrations/0000_local_stub_dynamic.sql`
   — imita lo mínimo de Dynamic que retail necesita para resolver identidad (ver
   [ADR-0033](docs/adr/0033-stub-local-de-dynamic-para-poder-desarrollar-sin-red.md)).
   **Este paso es nuevo y es una sola vez** — el archivo destino queda fuera de git a
   propósito (nunca debe poder colarse en un copy/paste al SQL Editor de producción),
   así que cada quien lo genera localmente desde la plantilla, igual que `.env.local`.
4. `npx supabase start` — Postgres 17 + Auth + API + Studio en los puertos fijos de
   [supabase/config.toml](supabase/config.toml) (54421 API / 54422 DB / 54423 Studio —
   nadie los elige a mano). Aplica todas las migraciones de `supabase/migrations/`
   (con el stub del paso 3 ya adentro) y corre `supabase/seed.sql`.
5. `cp apps/web/.env.example apps/web/.env.local` y pegar ahí lo que imprime
   `npx supabase status`.
6. `pnpm dev` → entra en `http://localhost:3000` con `felipe@cayla.local` / `cayla-local`
   (líder) o `micaela@cayla.local` / `cayla-local` (integrante, para probar que RLS
   realmente acota por ubicación).
7. Si algo se ve raro y no tiene explicación de código: `pnpm local:donde` antes de
   sospechar un bug. Diagnostica en segundos si estás hablando con el stack de este repo
   o, por accidente, con el de `cayla-dynamic` (si también lo tenés clonado en la misma
   máquina — ver la tabla de puertos en [README.md](README.md)).

Para volver la base a cero en cualquier momento: `npx supabase db reset`. Es una
operación normal y esperada, no un último recurso — el estado local nunca es la fuente
de verdad de nada, `supabase/migrations/` + `seed.sql` sí.

**Qué no funciona en local:** subir fotos de producto (Storage apagado a propósito, ver
ADR-0010). Todo lo demás que exista en V2 (catálogo, ventas, caja, cambios,
facturación) funciona igual que en producción.

## 2. GitHub — rama por tarea, nunca directo a `main`

`main` tiene un ruleset (`main-protegida`) que impide borrarla y reescribir su historia y,
desde el 2026-09-25, exige los dos checks del CI para fusionar (punto 4). Antes de eso un
PR en rojo se fusionaba igual: pasó ese día con el #397 (el detalle está en
`.github/workflows/ci.yml`). Los choques que ya pasaron (migraciones `0054` duplicadas,
19-sep; renumeración `0057`→`0059`, 12-sep) tienen la misma causa: nadie vio el trabajo
del otro antes de que aterrizara en `main`.

1. **Rama por tarea.** Las sesiones de Claude Code ya lo hacen solas
   (`claude/<tema>-<hash>`). Para trabajo humano directo: `<usuario>/<dominio>-<tema>`
   (ej. `trix/facturacion-anulacion`), mismo espíritu que el scope de los commits.
2. **`git fetch origin && git merge origin/main` (o rebase) al ABRIR la sesión de
   trabajo, no solo antes de pushear.** `main` se mueve varias veces por hora — pasó en
   vivo mientras se escribía este documento (`0af2f1b` → `b93ffee` en menos de una
   hora). Empezar sobre una base vieja es la forma más cara de duplicar trabajo (pasó
   con el conector de Lucode, 5-sep, y con el censo construido dos veces, 11-sep).
3. **Abrir PR contra `main` al cerrar un paso verificable** (principio 7 de CLAUDE.md) —
   no al final del proyecto, al final de cada paso chico. Esto es lo que reemplaza
   "juntar todo al final": integración seguida, con historial visible, no un merge
   gigante y sorpresivo.
4. **`main` exige los dos checks del CI antes de fusionar** (activo desde el 2026-09-25):
   `Tipos, lint y pruebas` y `Pruebas de RPC contra Postgres` (`.github/workflows/ci.yml`),
   en el ruleset `main-protegida` (Settings ▸ Rules). No tiene excepciones, ni para el
   administrador. Si hay que cambiarlo, lo hace quien tenga permiso de administrador en
   GitHub; este es el comando con el que se activó:
   ```bash
   gh api -X PUT repos/felipea92p-ux/cayla-retail/rulesets/23629061 --input - <<'EOF'
   {
     "name": "main-protegida",
     "target": "branch",
     "enforcement": "active",
     "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
     "rules": [
       {"type": "deletion"},
       {"type": "non_fast_forward"},
       {"type": "required_status_checks", "parameters": {
         "strict_required_status_checks_policy": false,
         "do_not_enforce_on_create": false,
         "required_status_checks": [
           {"context": "Tipos, lint y pruebas"},
           {"context": "Pruebas de RPC contra Postgres"}
         ]
       }}
     ]
   }
   EOF
   ```
   Un PR abierto antes del 2026-09-25 reporta el check de Postgres con su nombre viejo
   («piloto, no bloquea») y queda trabado hasta que trae `main`. `strict` va en `false` a propósito: con `main` moviéndose
   varias veces por hora, exigir la rama al día obligaría a correr el CI otra vez en cada
   fusión. Si aparecen choques entre dos PR que pasan cada uno por su lado, se sube a `true`.

## 3. Migraciones nuevas — con timestamp, no con el próximo número a ojo

Desde hoy (ver [ADR-0034](docs/adr/0034-migraciones-nuevas-nacen-con-timestamp-no-con-el-proximo-numero.md)):

```bash
npx supabase migration new nombre_descriptivo
```

Nunca se elige a mano el "próximo número libre" — con 5 personas escribiendo en paralelo
eso es lo que ya chocó dos veces. El timestamp hace el choque imposible por diseño, no
por disciplina. `0001`-`0010` (las migraciones del corte V2) no se tocan ni se renumeran.

Las migraciones se escriben **con** el prefijo `retail.` en cada tabla y función (o con
`set search_path = retail, public, extensions;` al inicio): desde el corte V1→V2
(2026-09-12) el Postgres local también vive en `retail`, así que el mismo archivo corre en
local, en CI y en producción (ver CLAUDE.md §"Cómo aplicar SQL a producción"). Escribirlas
sin prefijo ya rompió una migración (#345 → #346).

## 4. Antes de cada commit

`pnpm install` deja activado un hook de git que revisa tipos, tests y lint — solo de los
archivos que estás commiteando (~19s). Errores en archivos ajenos a tu commit avisan
pero no bloquean: en este repo casi siempre hay más de una persona trabajando a la vez.
