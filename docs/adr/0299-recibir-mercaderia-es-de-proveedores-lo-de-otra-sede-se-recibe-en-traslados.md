# ADR-0299 — Recibir mercadería es de proveedores; lo que manda otra sede se recibe en Traslados

- **Fecha:** 2026-10-01
- **Estado:** Aprobado por Felipe el 2026-10-01 («recibir mercadería para proveedores, y traslados es para entre sedes, y al recibir
  en traslados se pueda indicar si va para piso o almacén»; confirmó la opción B en dos pasos). **Paso 1 (web): construido, sin
  desplegar. Paso 2 (migración `20261001140000`): escrita y probada, SIN pegar en producción** (se pega después de desplegar la web y
  con el ok puntual de Felipe).
- **Sigue a:** ADR-0113 (recibir por envío; este ADR **reemplaza solo su parte de «otra sede de CAYLA»**), ADR-0239 (recibir sin
  perder nada: D-131, piso o almacén se pregunta al confirmar), ADR-0068 (traslados en dos fases).

## Problema

Un traslado entre sedes tenía **dos puertas para recibirse**:

1. El detalle del traslado (Inventario ▸ Traslados): cuenta a ciegas, entra lo que coincide y **pregunta si la ropa va al piso de
   venta o al almacén** (ADR-0239, D-131).
2. «Recibir mercadería» (`/recibir`, `recibir_envio`): cuando la caja traía además algo de un proveedor, el traslado se contaba y se
   confirmaba aquí, **sin preguntar el lugar**.

Las dos terminan en `confirmar_traslado`, pero con reglas distintas. Verificado en producción el 2026-10-01: `recibir_envio` llama
`confirmar_traslado(id)` sin `p_destino`, así que la ropa de otra sede caía en el lugar por defecto (el almacén) y Vender no la veía
hasta que alguien la bajaba al piso — el mismo defecto que D-131 había arreglado en la otra puerta. Además, un traslado solo (el caso
normal: Taller → tienda, sin factura) no se podía recibir por `/recibir`: la base lo rechazaba. La puerta servía únicamente para el
caso raro de «caja mixta» y duplicaba reglas que ya cambiaron una vez y habrían vuelto a cambiar.

## Decisión

```
DECIDÍ:    Recibir mercadería (/recibir) es solo de proveedores. Lo que manda otra sede de CAYLA se cuenta y se confirma en Traslados,
           que es la única puerta. `recibir_envio` rechaza un traslado antes de escribir nada, con un mensaje que dice dónde recibirlo.
DESCARTÉ:  (A) que Recibir mercadería también pregunte piso o almacén — conserva la comodidad de la caja mixta, pero deja dos puertas
           con la misma regla en dos sitios: la próxima regla de traslados (como D-131) habría que ponerla dos veces y hoy ya costó un
           defecto real. (C) quitar el parámetro `p_traslados` de la firma — la web llama la función por nombre y puede haber envíos
           en cola sin conexión con ese formato; cambiar una firma de producción pide más que un reemplazo anclado y no aporta nada
           que el guardia no dé.
SE ROMPE SI: una misma caja trae comprobantes de proveedor y un traslado y quien la abre tiene que usar dos pantallas (costo aceptado:
           el aviso de arriba lo dice y lleva al traslado); un envío guardado sin conexión con un traslado sube después (hoy hay
           0 filas en `envio_traslados`: nadie ha recibido nunca un traslado por esta puerta, y subiría rechazado con un mensaje claro,
           sin duplicar nada); o alguien recrea `recibir_envio` desde un archivo viejo del repo y reabre la puerta (lo detecta
           `pnpm pruebas:recibir-envio`).
```

### Qué cambia

**Web (paso 1, solo `apps/web`, sin base):**
- `RecepcionEnvio.tsx`: sale todo el conteo de traslados (selección, conteo por línea, validación, totales, resumen, cola). En la pestaña
  «Fuera de comprobante», el bloque «¿Vino algo de otra sede?» pasa a ser una frase que dice «se cuenta y se confirma en Traslados» (con
  enlace si el rol ve el módulo).
- `AvisoTrasladosEnCamino` (nuevo): arriba de «Pendientes», si hay traslados en tránsito hacia la sede que se mira, un aviso con su
  número, su origen y un botón al traslado (o a la lista, si son varios). Lee `getTrasladosEnCurso` —la misma lectura de Inicio y
  Existencias—, no una lectura propia con una RPC por traslado como antes. Si esa lectura falla, Recibir sigue sin el aviso (se degrada,
  no se cae).
- `envio-reglas.ts`: desaparecen `ConteoTraslado`, `trasladoContadoEntero`, `TrasladoEnCamino`, `p_traslados` y `deOtraSede`; aparece
  `trasladosHaciaAca` (pura, con prueba). `envio.ts` pierde `getTrasladosHaciaAca`.

**Base (paso 2, `20261001140000_recibir_envio_ya_no_recibe_traslados.sql`):** un reemplazo anclado sobre la función **viva** (la de
producción ya difiere del archivo original: lleva candados y el costo atípico), con la huella md5 del bloque que corta. Pone el guardia,
quita el bloque que confirmaba traslados y los dos mensajes que hablaban de ellos. No cambia la firma, no toca `envio_traslados` (historia,
0 filas) ni `confirmar_traslado` / `registrar_recepcion_traslado`.

### Verificado

- `pnpm pruebas:recibir-envio --en-seco`: **32/32**; sin la migración fallan exactamente las 3 pruebas nuevas (29/32): la prueba distingue.
  Cubre: el traslado se rechaza con y sin comprobante; quien no puede recibir en la sede ve primero el permiso; **el rechazo no deja nada**
  (ni envío, ni lote, ni stock, ni token gastado) y el mismo token después recibe lo del proveedor; el traslado se recibe en Traslados
  y queda en piso o en almacén según se elija; pegar la migración dos veces es inocuo.
- La migración se aplicó dentro de una transacción local y se revirtió (la función vuelve a 12 156 caracteres); y contra producción se
  contaron, solo con SELECT, las 7 anclas: aparecen exactamente una vez y la huella del bloque es `d786000d6465f97d9df0dc97db1fae40`,
  igual que en local.
- Navegador (local, sesión de Felipe): `/recibir` parado en el Taller con un comprobante pendiente — marcar, contar, «los espero», y el
  resumen «Confirma lo que entra» sin la fila «De otra sede»; la pestaña «Fuera de comprobante» con el texto nuevo y el enlace a
  Traslados; el aviso con datos de ejemplo a escritorio y a 375 px. **No se corrió con un traslado real en tránsito**: la base local la
  comparten otras sesiones y no se escribió en ella. El camino de datos (`getTrasladosEnCurso` → `trasladosHaciaAca`) lo cubre la prueba
  pura y la lectura corrió sin error.

### La comprobación previa a pegar la migración (solo SELECT, contra producción)

La migración aborta sola si algo no coincide, pero conviene verlo antes. Cada ancla debe salir `veces = 1` y `ya_aplicado_ADR-0299 = 0`; la
huella del bloque debe ser `d786000d6465f97d9df0dc97db1fae40`:

```sql
with d as (select pg_get_functiondef(p.oid) as t from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'retail' and p.proname = 'recibir_envio'),
a(nombre, ancla) as (values
  ('guardia',    '  v_es_lider := fn_es_lider();'),
  ('marca_ini',  '  -- ---------- lo que vino de otra sede'),
  ('marca_fin',  '  -- ---------- los cierres'),
  ('comentario', '-- Primero la regla específica: si trae extras o traslados sin ningún comprobante, esa es la explicación útil.'),
  ('condicion',  'if jsonb_array_length(p_items) = 0 and (jsonb_array_length(p_extras) > 0 or jsonb_array_length(p_traslados) > 0) then'),
  ('mensaje1',   'Lo que llegó fuera de comprobante o dentro de un traslado necesita al menos una línea de comprobante recibida en este envío — si no viene ningún comprobante, usa Ingreso sin comprobante o Traslados'),
  ('mensaje2',   'si viene de otra sede de CAYLA, confírmalo como envío interno (traslado)'),
  ('ya_aplicado_ADR-0299', 'ADR-0299'))
select a.nombre, (length(d.t) - length(replace(d.t, a.ancla, ''))) / length(a.ancla) as veces,
       case when a.nombre = 'marca_ini' then md5(substr(d.t, position(a.ancla in d.t), position('  -- ---------- los cierres' in d.t) - position(a.ancla in d.t))) end as huella_bloque
from d, a order by 1;
```

### Quién puede quedar sin poder recibir un traslado

Nadie hoy. Consultado en producción el 2026-10-01: ningún rol ve el módulo «recibir» sin ver «traslados» (Integrante —12 personas— y
Terminal Almacén ven los dos; Terminal de ventas ve traslados y no recibir). Si un líder crea después un rol con Recibir y sin Traslados,
ese rol no podrá recibir un traslado por ninguna puerta: el aviso lo dice sin enlazar.

### Orden de despliegue y reversa

1. Desplegar la web (con ella, Recibir ya no ofrece ni manda traslados; la base todavía los aceptaría, sin consecuencia).
2. Pegar la migración en el SQL Editor (una sola transacción, sin partes; ver la cabecera del archivo). Si se pegara antes, solo fallaría
   una pantalla vieja que intente recibir un traslado: con el mensaje de dónde hacerlo y sin perder el conteo.
3. Reversa: recrear `recibir_envio` con su cuerpo anterior. Huella de producción antes de este cambio (2026-10-01):
   `pg_get_functiondef` md5 `dbabc3d0f7672d2316e8a55a2990cccb`, `prosrc` 14 527 caracteres, md5 `5cde6f5ba7d3aab60af14ecf0b79235c`.

## Lo que queda abierto

- **PR #661 (costo atípico) tocaba los mismos archivos y se fusionó antes** (`RecepcionEnvio.tsx`, `ResumenPrevioEnvio.tsx`,
  `envio-reglas.ts` y su prueba). La fusión automática de `main` a esta rama resolvió mal un conflicto real en `envio-reglas.ts` (se quedó
  con mi `p_extras` y perdió `confirma_costo`), y el typecheck del CI falló: se corrigió hacia adelante, dos líneas. **Lección:** un commit
  «Merge branch 'main' into …» que no hizo uno mismo se revisa con `tsc` y la suite, porque un texto que se fusiona sin avisar puede no compilar.
  En la base no chocan: la migración de #661 (`20260930124000`) recrea `recibir_envio` completa y esta es un reemplazo anclado que va después;
  se comprobó sobre el archivo de #661 que las 7 anclas aparecen una vez y que la huella del bloque es la misma.
- `scripts/migraciones/verificar.mjs` cuenta las funciones `pg_temp` de una migración como «falta» (ya pasaba con otras): falso positivo.
- Los envíos guardados sin conexión **antes** del despliegue que lleven un traslado subirán rechazados. No hay evidencia de que exista
  alguno (0 filas en `envio_traslados`); si apareciera, se rehace en Traslados.
