# APLICADA — antes fue una propuesta (2026-09-19)

> **Estado:** Felipe la confirmó el 2026-09-19 (incluido `titular_cuenta`; la visibilidad por rol queda para el final del proyecto) y se aplicó
> en producción como `20260919173940 proveedores_cci_y_billetera`. La decisión vive ahora en `docs/adr/0134-proveedores-cci-yape-plin-y-titular.md`
> y el SQL en `supabase/migrations/20260919170000_proveedores_cci_y_billetera.sql`. Este documento se conserva como el análisis previo
> (lo que se encontró y por qué se decidió así); donde difiera de la migración, manda la migración.

# (Texto original) PROPUESTA — requería confirmación de Felipe antes de aplicar

**CCI y Yape/Plin por proveedor** · redactada 2026-09-19 · solo lectura del repo: no se aplicó SQL, no se creó migración.
Contexto: la maqueta `comprobantes-vivo.html` muestra en «Registrar pago» la cuenta del proveedor con banco, cuenta, CCI y
Yape/Plin. Hoy la base solo tiene `banco` y `cuenta_bancaria`; lo demás no tiene dónde vivir.

## 0. Lo que encontré (estado real, no supuesto)

1. `retail.proveedores` (producción, ~2–4 filas) tiene 12 columnas: las de pago son `banco`, `cuenta_bancaria` (texto libre,
   sin CHECK; los comentarios de `20260918120000` lo dicen a propósito), `forma_pago_preferida` (CHECK: transferencia/yape/plin/
   efectivo/deposito/otro), `plazo_credito_dias` y `telefono`. Fuente: `DICCIONARIO-RETAIL.md:1521`.
2. **La UI ya trata `cuenta_bancaria` como CCI sin que nada lo garantice**: la ficha dice «CCI …»
   (`compras/proveedores/[id]/page.tsx:71`), el botón dice «Copiar CCI» (`ProveedorAcciones.tsx:47`) pero el formulario pide
   «Número de cuenta o CCI» (`ProveedorModal.tsx:193`). Un número de cuenta local (10–14 dígitos) se rotularía «CCI».
3. **`telefono` hace doble oficio mal rotulado**: es el WhatsApp del contacto, pero `PagoJuntosModal.tsx:192` lo muestra como
   «Yape / Plin». Pagar por Yape al celular equivocado no se revierte.
4. Quien paga es solo el líder: `fn_puede_registrar_compras()` = `fn_es_lider()`; `/compras` redirige a quien no lo es.
5. Visibilidad hoy: `proveedores_select` = cualquier sesión; `proveedores_write_lider` = `fn_es_lider()`. Es la decisión D-27
   (`DECISIONES-2026-09-12.md:152`), acotada el 2026-09-17 (ADR-0094) solo para lo financiero. **Pendiente abierto** en
   `BACKLOG.md:493` («cuenta bancaria es dato de pago… decisión a reconsiderar»). Y en `origin/main` está ADR-0126 (aún sin pegar
   en producción): el dinero de Compras pasa a solo-líder, con lo que **los números de cuenta serán lo único de pagos que quede
   abierto a todos**. Esta propuesta no resuelve eso (ver §3), pero conviene que Felipe lo vea junto.
6. `compras_resumen` / `listar_compras` ya arrastran `proveedor_telefono/banco/cuenta_bancaria`
   (`20260918202000…sql:115,171`) y `types.ts` los tipa, pero **ninguna pantalla los lee** (grep en `apps/`: 0 usos).
   Ampliarlas sería tocar vistas y una RPC de retorno tipado por nada: no se hace (§4).
7. `packages/shared` no tiene Zod de proveedores (grep: 0). No se inventa uno: la validación va en la RPC y en helpers puros.
8. `fn_proveedores()` se recreó 7 veces en 5 días (drop + create) y `registrar/actualizar_proveedor` ya tuvieron un bug de
   sobrecarga doble (`20260918071000:100-111`). Es la zona más frágil del módulo.
9. **CLAUDE.md está desfasado respecto a la práctica**: dice que las migraciones van sin `retail.`, pero las de proveedores
   escriben `retail.` en cada objeto o abren con `set search_path = retail, public, extensions;`. Sin uno de los dos, `create
   function fn_x()` caería en `public` incluso en local. La propuesta usa el `set search_path` (ver §5).

## 1. Columnas nuevas (4) — todo en `retail.proveedores`

| Columna | Tipo / candado | Por qué (y por qué no más) |
|---|---|---|
| `cci` | `text`, `CHECK ~ '^[0-9]{20}$'` | El CCI peruano son 20 dígitos exactos; es lo único que sirve para transferir entre bancos, que es la forma real de pagar en Gamarra. Se guarda **solo dígitos** (la RPC quita espacios y guiones). No se valida el dígito de control por banco: no hay algoritmo público único, y el banco lo rechaza al transferir. |
| `celular_billetera` | `text`, `CHECK ~ '^9[0-9]{8}$'` | El celular al que se yapea/plinea. **Separado de `telefono`** (WhatsApp): suelen ser distintos y confundirlos es plata mal enviada. Nombre neutro (`celular_billetera`, no `yape_celular`) porque sirve a las dos apps. |
| `billeteras` | `text[]`, solo `yape`/`plin`, 1 o 2 elementos, `NULL` = ninguna | Dice **qué app abrir**. Es necesaria: `forma_pago_preferida` solo guarda una preferencia y no cubre «tiene Yape y Plin». Con CHECK de coherencia: hay celular ⇔ hay al menos una billetera (principio 2: no puede existir un celular sin saber de qué app, ni una app sin número). |
| `titular_cuenta` | `text`, largo 2–120, opcional | Lo que la app del banco/Yape muestra antes de confirmar. Es el control anti-error más barato: quien paga compara el nombre en pantalla con este. Un solo titular para CCI y billetera. Muchos proveedores son personas con negocio: `nombre` («Textiles Rosita») no coincide con el titular. |

**Se descarta `tipo_cuenta`** (ahorros/corriente): una transferencia por CCI no lo necesita y la app del banco lo resuelve solo.
**Se descarta un índice único sobre `cci`**: un mismo dueño puede tener dos fichas legítimas; se detecta con la consulta de
duplicados de §6, no con un candado que bloquee.
Sin `tenant_id` (CLAUDE.md, nota de arquitectura).

## 2. `cuenta_bancaria` existente: convive, no se toca

- **No se borra, no se renombra, no se le pone CHECK** (podría haber datos que no cumplan). Pasa a significar, en los
  comentarios y en la UI: «número de cuenta del banco (depósito en ventanilla o mismo banco)». El interbancario vive en `cci`.
- **Backfill seguro y determinista** (solo copia; nunca inventa): si `cuenta_bancaria` contiene *solo* dígitos/espacios/guiones
  y, sin ellos, son exactamente 20 dígitos, es un CCI sin ambigüedad (ninguna cuenta local de banco peruano tiene 20) → se
  copia a `cci`. Todo lo demás queda sin tocar y sale en la lista de «revisar a mano» (§6).
- **`telefono` NO se copia a `celular_billetera`**: adivinar un destino de dinero es peor que dejarlo vacío. Con 2–4 fichas,
  Felipe/un líder las carga a mano en un minuto. Consecuencia visible y deseada: el modal de pago deja de rotular `telefono`
  como «Yape / Plin» y lo llama «WhatsApp».
- Tras el backfill un CCI queda en dos columnas. La UI lo resuelve sin migrar más: muestra `cuenta_bancaria` solo si su versión
  «solo dígitos» difiere de `cci`. Anular la copia vieja (`update … set cuenta_bancaria = null where = cci`) es opcional y
  **decisión de Felipe**; no se propone hacerlo ahora (no borrar datos con historial).

## 3. Visibilidad y RLS

- **Lectura: igual que `banco`/`cuenta_bancaria` (D-27, `proveedores_select` a cualquier sesión). Escritura: solo líder** por
  `proveedores_write_lider` y por la RPC nueva, que exige `fn_es_lider()` (patrón de `registrar/actualizar_proveedor`).
  No se agrega ninguna política: la tabla ya tiene RLS y las columnas nuevas heredan las dos.
- **No se cierra la lectura ahora**, aunque quien paga es solo el líder y sería gratis en UX. Razón técnica concreta: RLS es por
  fila; para esconder columnas habría que hacer `revoke select (col)` a `authenticated`, y **`compras_resumen` es
  `security_invoker` y lee `p.cuenta_bancaria`** con ese mismo rol → se rompería el detalle de compras para todos, líder
  incluido. La alternativa limpia es una tabla aparte solo-líder (o las columnas fuera de la vista), lo que mueve también
  `banco`/`cuenta_bancaria`: es la decisión de `BACKLOG.md:493`, de Felipe, y afecta más de un módulo. **Regla que sí se deja
  escrita:** las 5 columnas de pago (`banco`, `cuenta_bancaria`, `cci`, `celular_billetera`, `titular_cuenta`) se cierran
  juntas o ninguna; esta propuesta no agrava la clase de exposición, solo la hace 2 columnas más ancha.
- Integridad (lo que de verdad daña: desviar pagos cambiando un CCI): solo líder escribe, la RPC es `security definer` con
  `revoke … from public, anon`. **Riesgo residual real: no hay bitácora de cambios de cuenta** (ver §7).

## 4. Cambios en RPC, consultas, TypeScript y UI (lista para la fase de implementación)

**Base** (una migración, §5):
1. Tabla: 4 columnas + 5 CHECK + comentarios + backfill.
2. **RPC nueva `guardar_cuentas_proveedor(uuid, text, text, text[], text)`**, líder-only, reemplazo completo de los 4 campos
   (`NULL` = vaciar). **Deliberadamente NO se cambian `registrar_proveedor` / `actualizar_proveedor`**: ya tienen 9/10
   parámetros, y agregar parámetros con `create or replace` deja dos sobrecargas vivas (bug ya vivido). Un propósito, una RPC
   (principio 3); la validación vive en un solo lugar. `banco` y `cuenta_bancaria` siguen guardándose por `actualizar_proveedor`.
3. `fn_proveedores()`: `drop` + `create` con las 4 columnas al final del `RETURNS TABLE` (hoy 24) y en `select`/`group by`.
   Necesario porque el editor de la lista (`ProveedoresPanel` → `borradorDe`) parte de esa fila. **`fn_proveedores_resumen()` no
   se toca** (su `select * from fn_proveedores()` toma columnas por nombre; se verifica con una llamada).
4. **No se tocan** `compras_resumen`, `listar_compras`, `registrar_proveedor`, `actualizar_proveedor`.

**Web / TypeScript** (rutas relativas a `apps/web/`; ninguna cambia de comportamiento antes de que la base tenga las columnas):
- `lib/proveedores.ts`: sumar `cci`, `celular_billetera`, `billeteras: string[] | null`, `titular_cuenta` a `Proveedor` y a
  `ProveedorFicha`, y al `select` de `getProveedor` (línea ~136).
- `lib/proveedores-reglas.ts` (+ `proveedores-reglas.test.ts`): helpers puros `normalizarCci`, `normalizarCelular` (quita
  `+51`, espacios, guiones), `enmascarar` («•••• 1234», para «Ver completos») y `cuentaLocalVisible(cuenta, cci)`.
- `components/ProveedorModal.tsx`: `Borrador`/`borradorDe`/`BORRADOR_VACIO`, y un bloque «Cómo pagarle»: Banco, Cuenta, CCI,
  celular con casillas Yape/Plin, Titular. Al guardar: `actualizar_proveedor` (o `registrar_proveedor`) y luego
  `guardar_cuentas_proveedor`. Si la segunda falla, el proveedor ya quedó guardado: aviso «Se guardó el proveedor, pero no las
  cuentas; reintenta desde Editar» (no hay pérdida de datos). Corregir el placeholder de «Cuenta bancaria».
- `components/CuentasProveedor.tsx` (nuevo, extrae `DatoCopiable` de `PagoJuntosModal.tsx:359`): un solo bloque de solo lectura
  con filas «CCI», «Cuenta», «Yape/Plin 9•• ••• 321», «Titular», cada una con «Copiar» y «Ver completos». Lo usan las tres
  pantallas de abajo (una fuente, no tres copias).
- `components/PagoJuntosModal.tsx`: `DatosPagoProveedor` suma `cci`, `celularBilletera`, `billeteras`, `titular`; reemplaza
  «Cuenta o CCI» y «Yape / Plin = telefono» (líneas 190–192) por `<CuentasProveedor>`; `telefono` se rotula «WhatsApp».
  El método inicial ya sale de `formaPagoPreferida` (línea ~78); no cambia.
- `app/(app)/compras/por-pagar/page.tsx` (líneas 62–73): llenar los campos nuevos en `datosProveedores`. Además pasar `datos`
  a `PagoDesdeUrl` (línea 181) construyéndolo también para `abrirPago.proveedorId`, que hoy puede no estar en la página.
- `components/CompraDetallePanel.tsx` (`PagoDesdeUrl`/`PagoModal`, ~148): recibir `datos?: DatosPagoProveedor` y mostrar
  `<CuentasProveedor>` sobre «Medios de pago» (es el bloque que muestra la maqueta en el pago individual). **No** ampliar
  `CompraResumen`: los datos llegan por `por-pagar/page.tsx`.
- `components/CompraFormV2.tsx` (~333) y `app/(app)/compras/nueva/page.tsx` (línea 20): un chip ámbar «Sin CCI cargado» cuando
  `formaPagoPreferida` es transferencia/deposito y no hay `cci` ni `cuenta_bancaria` (idem «Sin Yape/Plin» para yape/plin). Solo
  aviso, no bloquea: registrar el comprobante no depende de tener la cuenta.
- `compras/proveedores/[id]/page.tsx` (68–73): chips «CCI …1234», «Yape 9•• ••• 321», «Titular …»; `telefono` → chip
  «WhatsApp». `components/ProveedorAcciones.tsx`: botones «Copiar CCI» (copia `cci`, ya no `cuenta_bancaria`), «Copiar cuenta»,
  «Copiar Yape/Plin».
- `packages/database/src/types.ts`: regenerar (Row/Insert/Update de `proveedores`, retorno de `fn_proveedores`, args de la RPC
  nueva). Sin Zod (§0.7).
- Prueba: `scripts/pruebas/proveedores_cuentas_pago.mjs`, calcado de `compras_indicadores.mjs`: CHECKs rechazan (23514), líder
  guarda, integrante recibe error, normalización de `+51 987 654 321`, vaciar con `NULL`, `fn_proveedores()` y
  `fn_proveedores_resumen()` siguen respondiendo.
- Docs al cerrar: ADR nuevo (número libre tras 0126; verificar), `BACKLOG`, `BITACORA`, `docs/datos/05-SEGURIDAD.md §9`,
  `06-DATOS-PERSONALES.md:133`, `modulos/09-compras-y-proveedores.md`, y `pnpm datos:generar:produccion` **después** de pegar.

## 5. SQL borrador

### (a) Archivo del repo — `supabase/migrations/20260919170000_proveedores_cci_y_billetera.sql`
*(no creado; el timestamp debe ser mayor que el último de `origin/main`, hoy `20260919161000` — revisar antes de nombrarlo)*

```sql
-- ============================================================================
-- Proveedores: CCI, Yape/Plin y titular de la cuenta
--
-- EL PROBLEMA. Pagar a un proveedor exige un destino inequívoco. Hoy solo hay
-- `cuenta_bancaria` (texto libre que la pantalla rotula «CCI» aunque pueda ser
-- una cuenta local) y `telefono` (el WhatsApp, que el modal de pago rotula «Yape»).
-- Un destino mal rotulado es plata enviada al lugar equivocado y no se revierte.
--
-- DECISIÓN. Cuatro columnas nuevas, con candado de formato. `cuenta_bancaria` NO se
-- toca (queda como «cuenta local»). `telefono` NO se copia a la billetera: no se
-- adivina un destino de dinero. Visibilidad igual que banco/cuenta_bancaria (D-27).
-- Escritura por RPC solo-líder; `registrar/actualizar_proveedor` no cambian de firma.
-- ============================================================================
set search_path = retail, public, extensions;

-- ---------- 1. columnas ----------
alter table proveedores
  add column if not exists cci text,
  add column if not exists celular_billetera text,
  add column if not exists billeteras text[],
  add column if not exists titular_cuenta text;

-- ---------- 2. candados (soltar y poner: re-ejecutable) ----------
alter table proveedores
  drop constraint if exists proveedores_cci_formato,
  drop constraint if exists proveedores_celular_billetera_formato,
  drop constraint if exists proveedores_billeteras_validas,
  drop constraint if exists proveedores_billetera_coherente,
  drop constraint if exists proveedores_titular_largo,
  add constraint proveedores_cci_formato
    check (cci is null or cci ~ '^[0-9]{20}$'),
  add constraint proveedores_celular_billetera_formato
    check (celular_billetera is null or celular_billetera ~ '^9[0-9]{8}$'),
  add constraint proveedores_billeteras_validas
    check (billeteras is null
           or (cardinality(billeteras) between 1 and 2 and billeteras <@ array['yape', 'plin']::text[])),
  -- un celular sin saber de qué app, o una app sin número, no puede existir
  add constraint proveedores_billetera_coherente
    check ((celular_billetera is null) = (billeteras is null)),
  add constraint proveedores_titular_largo
    check (titular_cuenta is null or char_length(titular_cuenta) between 2 and 120);

comment on column proveedores.cci is
  'Código de Cuenta Interbancario: 20 dígitos, solo números. Para transferir desde otro banco.';
comment on column proveedores.celular_billetera is
  'Celular (9 dígitos, sin +51) al que se yapea/plinea. Distinto de `telefono` (el WhatsApp del contacto).';
comment on column proveedores.billeteras is
  'Qué app tiene ese celular: {yape}, {plin} o {plin,yape}. NULL si no hay billetera; va de la mano con celular_billetera.';
comment on column proveedores.titular_cuenta is
  'Nombre que muestra el banco/Yape al pagar; quien paga lo compara antes de confirmar.';
comment on column proveedores.cuenta_bancaria is
  'Número de cuenta del banco (depósito o mismo banco), texto libre. El interbancario vive en `cci`. Dato de un tercero (D-27).';

-- ---------- 3. backfill: solo copia lo inequívoco (20 dígitos = CCI); idempotente ----------
update proveedores
   set cci = regexp_replace(cuenta_bancaria, '[ -]', '', 'g')
 where cci is null
   and cuenta_bancaria ~ '^[0-9 -]+$'
   and regexp_replace(cuenta_bancaria, '[ -]', '', 'g') ~ '^[0-9]{20}$';

-- ---------- 4. escritura: una RPC, solo líder, reemplazo completo (NULL = vaciar) ----------
create or replace function guardar_cuentas_proveedor(
  p_proveedor_id uuid,
  p_cci text default null,
  p_celular_billetera text default null,
  p_billeteras text[] default null,
  p_titular_cuenta text default null
) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_cci text := nullif(regexp_replace(coalesce(p_cci, ''), '[\s.-]', '', 'g'), '');
  v_cel text := nullif(regexp_replace(coalesce(p_celular_billetera, ''), '[^0-9]', '', 'g'), '');
  v_bil text[];
  v_titular text := retail.fn_texto_o_null(p_titular_cuenta);
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede editar las cuentas de un proveedor.';
  end if;
  if v_cel ~ '^51[0-9]{9}$' then v_cel := substr(v_cel, 3); end if;  -- «+51 987…» → «987…»
  if v_cci is not null and v_cci !~ '^[0-9]{20}$' then
    raise exception 'El CCI tiene que ser de 20 dígitos. Si solo tienes el número de cuenta, va en «Cuenta».';
  end if;
  if v_cel is not null and v_cel !~ '^9[0-9]{8}$' then
    raise exception 'El celular de Yape/Plin tiene que ser de 9 dígitos y empezar con 9.';
  end if;
  select array_agg(distinct lower(b) order by lower(b)) into v_bil from unnest(coalesce(p_billeteras, '{}')) b;
  if v_bil is not null and not (v_bil <@ array['yape', 'plin']) then
    raise exception 'Solo se aceptan Yape o Plin.';
  end if;
  if v_cel is not null and v_bil is null then
    raise exception 'Indica si ese celular es Yape, Plin o ambos.';
  end if;
  if v_cel is null and v_bil is not null then
    raise exception 'Escribe el celular de la billetera, o quita Yape/Plin.';
  end if;
  if v_titular is not null and char_length(v_titular) not between 2 and 120 then
    raise exception 'El titular tiene que tener entre 2 y 120 caracteres.';
  end if;

  update proveedores
     set cci = v_cci, celular_billetera = v_cel, billeteras = v_bil, titular_cuenta = v_titular
   where id = p_proveedor_id;
  if not found then
    raise exception 'Ese proveedor ya no existe. Recarga la pantalla.';
  end if;
end;
$$;

revoke all on function guardar_cuentas_proveedor(uuid, text, text, text[], text) from public, anon;
grant execute on function guardar_cuentas_proveedor(uuid, text, text, text[], text) to authenticated;

-- ---------- 5. lectura: fn_proveedores() trae las 4 columnas nuevas ----------
-- NO se escribe a ojo: el cuerpo es el de producción HOY (pg_get_functiondef), no el del repo.
-- Cambios exactos sobre `20260918218000_saldo_a_favor_lecturas.sql`:
--   · RETURNS TABLE(...): agregar al final  , cci text, celular_billetera text, billeteras text[], titular_cuenta text
--   · select: agregar al final              , p.cci, p.celular_billetera, p.billeteras, p.titular_cuenta
--   · group by: agregar al final            , p.cci, p.celular_billetera, p.billeteras, p.titular_cuenta
-- Con `drop function` primero (cambia el RETURNS) y, después del create, los mismos
-- `revoke all … from public, anon` + `grant execute … to authenticated` que ese archivo.
drop function if exists fn_proveedores();
-- create function fn_proveedores() … (cuerpo de producción + los 3 cambios de arriba)
```

### (b) Cómo pegarla en producción (SQL Editor del proyecto Dynamic)
1. **Antes de escribir el cuerpo de `fn_proveedores()`**, leer la definición real:
   `select pg_get_functiondef('retail.fn_proveedores()'::regprocedure);` y partir de ella (memoria del proyecto: nunca de un
   archivo del repo). Si difiere de `218000`, manda producción.
2. Pegar **con `retail.` explícito**, no confiando solo en `set search_path`: `BACKLOG.md:~490` documenta que el Editor no
   siempre comparte sesión entre sentencias. Mínimo, arrancar el script con `set search_path to retail, public;` y comprobar
   con la consulta B4 de §6 que todo cayó en `retail` y nada en `public`. Síntoma de error: 42P01 (CLAUDE.md).
3. Sin tablas temporales ni `set local` entre sentencias. Pegar el bloque 5 (drop + create) **de una sola vez**: entre el
   `drop` y el `create` `/compras/proveedores` no tiene función.
4. Orden de despliegue: **base primero, verificar, después la web.** Las columnas son nulas y la RPC nueva no la llama nadie
   todavía; la web vieja sigue funcionando. Lo contrario (web antes) rompe el guardado del modal.
5. En local: `npx supabase migration up --include-all`; **nunca `db reset`** (el Postgres local es compartido).
6. Aplicada la base: `pnpm datos:generar:produccion` tras refrescar el volcado (**no** `pnpm datos:generar` a secas) y
   `pnpm datos:comparar`.

## 6. Verificación

**Antes (producción, solo lectura):**
```sql
-- B1. debe dar 12 columnas y ninguna de las 4 nuevas
select column_name from information_schema.columns
 where table_schema = 'retail' and table_name = 'proveedores' order by ordinal_position;
-- B2. forma real de lo que hay en cuenta_bancaria (define cuántas filas copiará el backfill)
select id, nombre, banco,
       length(regexp_replace(cuenta_bancaria, '[^0-9]', '', 'g')) as digitos,
       cuenta_bancaria ~ '^[0-9 -]+$' as solo_digitos_espacios_guiones
  from retail.proveedores where cuenta_bancaria is not null;
-- B3. una sola firma de fn_proveedores y la RPC nueva no existe
select p.oid::regprocedure from pg_proc p
 where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_proveedores', 'guardar_cuentas_proveedor');
```
**Después:**
```sql
-- A1. 16 columnas (12 + 4); los 5 candados existen
select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'proveedores';
select conname from pg_constraint where conrelid = 'retail.proveedores'::regclass
   and conname in ('proveedores_cci_formato','proveedores_celular_billetera_formato',
                   'proveedores_billeteras_validas','proveedores_billetera_coherente','proveedores_titular_largo');
-- A2. backfill = filas de B2 con digitos = 20 y solo_digitos = true
select count(*) filter (where cci is not null) as con_cci from retail.proveedores;
-- A3. a revisar a mano: cuenta escrita que NO produjo CCI
select id, nombre, banco from retail.proveedores where cuenta_bancaria is not null and cci is null;
-- A4. CCI repetido entre fichas (sospecha de duplicado; permitido, se mira)
select cci, array_agg(nombre) from retail.proveedores where cci is not null group by cci having count(*) > 1;
-- A5. el candado rechaza (todo dentro de una transacción que se deshace)
begin; update retail.proveedores set cci = '123' where id = (select id from retail.proveedores limit 1); rollback;  -- espera 23514
-- A6. una sola firma; el directorio y su resumen responden con las columnas nuevas
select p.oid::regprocedure from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_proveedores';
select cci, celular_billetera, billeteras, titular_cuenta from retail.fn_proveedores() limit 1;
select * from retail.fn_proveedores_resumen();
-- B4. nada cayó en public
select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'guardar_cuentas_proveedor';  -- espera 0 filas
```
Roles: en el navegador ya se probó que no se debe cerrar sesión/escribir contraseñas; el caso «un integrante recibe error» se
prueba con SQL simulando la sesión, en el script de §4.

## 7. Reversa, riesgos y qué confirma Felipe

**Reversa (sin `DELETE` de datos):**
- *Web*: `git revert` del commit; las columnas nuevas quedan inertes.
- *Base*: (1) reponer `fn_proveedores()` con la definición que devolvió `pg_get_functiondef` en el paso 1 de §5(b) (guardarla **antes** de pegar);
  (2) `revoke execute on function guardar_cuentas_proveedor(...) from authenticated;` (la función queda, sin uso);
  (3) los CHECK se pueden soltar (`drop constraint if exists`) sin tocar datos.
- **Las 4 columnas no se dropean** (es borrar datos). Si se abandona la idea, se marcan «archivo» en su `comment`.
  `cuenta_bancaria` nunca se modificó, así que no hay nada que restaurar.

**Riesgos:**
1. `drop`/`create` de `fn_proveedores()` en producción: ventana de segundos sin función; sobrecarga doble si se olvida el
   `drop` (bug ya ocurrido). Mitigado con el pegado de una vez, A6 y por no tocar `registrar/actualizar_proveedor`.
2. Cuerpo copiado del repo en vez de producción → se pisaría un cambio más reciente (regla de la memoria del proyecto).
3. Otra sesión edita `ProveedorModal`/`PagoJuntosModal` (`git diff HEAD...origin/main` hoy no los toca; `origin/main` va 25
   commits adelante). Revisar `git status` y `HEAD..origin/main` antes de empezar.
4. **Sin bitácora de cambios de cuenta**: un líder (o una sesión comprometida) puede cambiar un CCI antes de un pago. Seguimiento
   propuesto, no incluido por simplicidad: tabla append-only `proveedor_cuentas_historial` con quién/cuándo/valor anterior
   enmascarado, escrita por la RPC. Recomiendo hacerlo justo después de esta, antes de que haya volumen de pagos.
5. Ley 29733: el CCI/celular de una persona natural es dato personal de un tercero (`06-DATOS-PERSONALES.md`). Agrava la
   pregunta de `BACKLOG.md:493`, no la cambia.
6. Yape/Plin: el celular puede ser el de una persona distinta al contacto; por eso `titular_cuenta` y la copia visible.

**Requiere confirmación de Felipe (esquema en producción → CLAUDE.md, «detente y confirma»):**
1. Aplicar en producción las 4 columnas + 5 candados + RPC + nueva `fn_proveedores()` (§5).
2. **Visibilidad**: mantener D-27 (recomendado ahora, por lo del §3) o cerrar las 5 columnas de pago a solo-líder
   (`BACKLOG.md:493`, con ADR-0126 a la vista) en un cambio aparte.
3. Que `telefono` **no** se copie a Yape/Plin (recomendado).
4. Si `titular_cuenta` entra (recomendado) o se deja para después.
5. Si, luego del backfill, se anula la copia duplicada en `cuenta_bancaria` (opcional; hoy no se propone).
6. Coordinar el orden con ADR-0126 (dos migraciones pendientes de pegar): son independientes, pero conviene pegarlas por separado.
