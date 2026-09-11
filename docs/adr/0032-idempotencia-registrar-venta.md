# ADR-0032 — `registrar_venta` deja de duplicar una venta si la red se corta

**Fecha:** 2026-09-10
**Estado:** Backend aplicado y verificado en producción. Frontend (envío del token) pendiente — ver Consecuencias.

## Contexto

`registrar_venta` era atómica dentro de Postgres pero no idempotente hacia
afuera: si la red se cortaba después del commit y antes de que la respuesta
llegara al navegador, la Encargada veía un error o la pantalla cargando,
reintentaba, y entraban DOS ventas con doble descuento de stock. `ventas` no
tenía cómo distinguir un reintento de una venta nueva.

Este es el mismo tipo de bug que ya se cerró para `abrir_caja`/`cerrar_caja`
(candado de sede) y para `retail.personas` (privilegio de escritura) en
sesiones anteriores — pero acá el arreglo mismo tuvo que corregirse dos
veces antes de llegar a producción, y vale la pena documentar el proceso
completo, no solo el resultado.

**Original en producción (antes de este ADR):**

```sql
declare
  v_caja cajas%rowtype; v_persona_id uuid; v_venta_id uuid; v_movimiento_id uuid;
  v_monto_total numeric := 0; v_linea_total numeric; v_item jsonb;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then raise exception 'La caja % no existe', p_caja_id; end if;
  if retail.puede_operar_sede(v_caja.sede_id) is not true then
    raise exception 'No tienes permiso para vender en esa sede';
  end if;
  if v_caja.estado <> 'abierta' then raise exception 'Esta caja ya está cerrada — no se pueden registrar más ventas ahí'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;
  select id into v_persona_id from public.personas where auth_user_id = auth.uid();
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_monto_total := v_monto_total + (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
  end loop;
  insert into ventas (sede_id, caja_id, metodo_pago, monto_total, usuario_id, nota)
    values (v_caja.sede_id, p_caja_id, p_metodo_pago, v_monto_total, v_persona_id, p_nota)
    returning id into v_venta_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_linea_total := (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, canal, monto, venta_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, v_caja.sede_id, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', 'tienda', v_linea_total, v_venta_id, v_persona_id)
      returning id into v_movimiento_id;
    perform retail.fn_aplicar_movimiento(v_movimiento_id);
  end loop;
  return v_venta_id;
end;
```

## Decisión

**DECIDÍ:** agregar un `p_token uuid default null` (quinto parámetro,
generado por el cliente — un uuid por carrito) más una columna
`ventas.token_cliente` con índice único, reemplazando la función con
`DROP` + `CREATE` explícito (nunca `CREATE OR REPLACE` con un parámetro
nuevo — es la sobrecarga fantasma de ADR-0004/ADR-0026).

El proceso real tuvo tres rondas de revisión adversarial, y las dos primeras
encontraron bugs reales que no eran evidentes hasta que alguien intentó
refutar el diseño en vez de solo revisarlo:

**RONDA 1 — DESCARTÉ** devolver la venta existente apenas se encontraba el
token, antes de validar sede/caja/estado. Motivo del descarte: es un bypass
de autorización real. El orden original era:

```sql
if p_token is not null then
  select id into v_venta_id from ventas where token_cliente = p_token;
  if found then return v_venta_id; end if;  -- sale ANTES de tocar v_caja
end if;
select * into v_caja from cajas where id = p_caja_id;  -- el candado vivía acá, después
```

Cualquiera con ese token (un uuid, no adivinable por fuerza bruta, pero
arquitectónicamente un bypass real) recibía el `venta_id` sin que se
revisara ningún permiso, ni el estado de la caja, ni que el carrito tuviera
sentido. **DECIDÍ en su lugar:** la validación de sede/caja/estado/carrito
corre siempre primero, sin excepción — el chequeo de token va después,
nunca antes, sin importar si es la primera llamada o un reintento.

**RONDA 2 — DESCARTÉ** que solo la rama del `select` previo comparara
contexto (caja/método/monto) contra la venta encontrada, dejando la rama
`exception when unique_violation` — la que de verdad se dispara en una
carrera real, dos requests casi simultáneos con el mismo token — sin esa
misma comparación. Es la rama que existe PARA ese escenario exacto, así que
dejarla sin el candado de contexto anulaba la mitad del propósito del
cambio: una carrera con caja o método distintos habría devuelto la venta
ajena sin avisar. **DECIDÍ:** las dos ramas repiten la misma comparación,
usando `is distinct from` (no `<>`) para que un campo `NULL` nunca deje una
comparación sin resolver.

**DESCARTÉ** una tabla aparte de "solicitudes procesadas" en vez de una
columna + índice único en `ventas` — habría exigido coordinar dos
escrituras a mano dentro de la misma transacción, exactamente lo que un
índice único evita: que Postgres, no el código, sea quien impide la fila
duplicada.

**DESCARTÉ** resolver la carrera solo con un `select ... for update` antes
del insert — no alcanza: dos transacciones nuevas (sin fila previa que
bloquear) pueden pasar el `select` al mismo tiempo y las dos intentar el
`insert`. El índice único + captura de `unique_violation` es la única forma
correcta de cerrar esa ventana en Postgres.

**SE ROMPE SI:** se agrega otra restricción única a `ventas` en el futuro —
el `exception when unique_violation` de la función nueva asume que la única
causa posible de ese error (aparte del PK) es el índice de `token_cliente`.

## Alternativas descartadas (proceso de verificación)

Antes de escribir la primera línea, se verificó en vivo contra producción
(no contra lo que el código o un ADR anterior dijeran) el cuerpo real de
`registrar_venta`, las columnas de `ventas`, los grants de la función, y el
cuerpo de `retail.puede_operar_sede` — confirmando que ya usa
`coalesce(...,false)` en ambos términos (no hay bypass por NULL ahí, a
diferencia de lo que una auditoría anterior había temido sobre una función
de nombre similar que no existe en producción).

Cada una de las tres rondas de revisión fue un agente distinto, sin ver el
razonamiento del anterior más que el borrador mismo — a cada uno se le pidió
explícitamente intentar refutar, no aprobar por default. La tercera ronda
confirmó `SEGURO_PARA_APLICAR` con una sola observación menor (usar
`is distinct from` en vez de `<>`, ya incorporada arriba).

## Consecuencias

Aplicado y verificado en producción el 2026-09-10: firma nueva de 5
argumentos activa, firma vieja de 4 ausente, índice único presente,
`authenticated`/`service_role` con `EXECUTE` y `anon`/`PUBLIC` sin él. La
autocomprobación del propio script incluye una prueba de comportamiento real
(llamar la función con una caja inventada y confirmar que se rechaza), no
solo una verificación de texto — y se confirmó por separado que no dejó
ninguna fila de prueba en `ventas`.

**Pendiente, no bloqueante:** `apps/web/components/RegistrarVentaModal.tsx`
todavía no genera ni manda `p_token` — la protección queda instalada pero
inerte hasta que el frontend la use (es retrocompatible: sin token, el
comportamiento es idéntico al de antes). El parche del componente (token por
carrito con `useRef`, regenerado solo cuando el carrito realmente cambia —
no cuando un guardia de stock lo rechaza sin cambiar nada) se aplica en el
mismo commit que este ADR.

**Deuda anotada, no de este cambio:** el chequeo de sede sigue siendo
`retail.puede_operar_sede(v_caja.sede_id) is not true` — correcto hoy, pero
si algún día se necesita repetir este patrón de idempotencia en otra función
de dinero, revisar primero el cuerpo real en producción de su candado
correspondiente, no asumir que se llama igual que en otra función parecida
(fue justo la confusión de nombres — `fn_puede_operar_sede` vs.
`retail.puede_operar_sede` — la que hizo perder tiempo en la sesión anterior
a esta).
