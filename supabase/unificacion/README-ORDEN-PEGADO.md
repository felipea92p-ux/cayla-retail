# Orden de pegado en producción — tanda 22-25 (revisado 08-sep-2026)

> **Revisado contra producción el 08-sep antes de pegar nada.** Entre el 05 y el
> 08 alguien aplicó parte del trabajo desde otra rama, así que dos de los cuatro
> archivos se reescribieron **más chicos**: el 22 ya no toca ninguna función de
> dinero (los candados de caja ya están puestos, y bien) y el 23 ya no crea
> columnas ni funciones (ya existen) — corrige una línea en cada una de dos
> funciones. Lo que sigue abierto y no lo arregló nadie: la escalada a admin por
> `retail.personas`, las **5** ex-colaboradoras con login vivo, Egresos, y el
> céntimo del comprobante.

**Dónde se pega:** SQL Editor del proyecto de **cayla-dynamic**
(`vovjyyiafkxteijimpuy`). Producción de retail no tiene proyecto propio: vive
dentro del proyecto de Dynamic, en el schema `retail`. Por eso los cuatro
archivos llevan el prefijo `retail.` en cada tabla y en cada función — sin él,
el SQL Editor busca en `public`, que es el schema de Dynamic, y devuelve
`relation "..." does not exist` (42P01) como si la tabla no existiera.

**Quién:** solo Felipe (es el único con acceso al SQL Editor).

**Los cuatro se pegan la misma tarde, en orden, uno por uno.** Cada archivo es
una sola transacción (`begin; ... commit;`): o entra entero o no entra nada.
Después de cada `commit;`, correr el bloque **CÓMO SE VERIFICA** que está al pie
de ese mismo archivo antes de pasar al siguiente. Si algo da `false`, **parar
ahí** — no seguir con el siguiente.

---

## La tabla

| # | Archivo | Qué hace | Por qué va en esa posición |
|---|---------|----------|----------------------------|
| 1 | `22_candados_y_permisos.sql` | `puede_operar_sede`, `es_lider` y `persona_actual` pasan a exigir persona **activa** y a ser un `exists` (nunca NULL). Repone la cláusula `tienda_asociada_id` de la 0012. Revoca la escritura directa sobre `personas`, `sedes`, `movimientos`, `cajas`, `ventas`, y el `execute` de `fn_aplicar_movimiento`, `recalcular_stock` y `persona_actual`. `check (cantidad >= 0)` en `stock` y `stock_almacen`. **Ya NO reescribe `abrir_caja`, `cerrar_caja` ni `registrar_venta`** — producción ya tiene esos candados y en la forma correcta (`is not true`, que sí cubre el NULL). Volver a escribirlas con una copia del 05-sep era riesgo sin ganancia. | **Primero, siempre.** Cierra las dos cosas más graves que siguen vivas: la escalada a admin de una sola línea (`update retail.personas set auth_user_id=…`, cualquiera de los 24 logins) y las **5** ex-colaboradoras con login que siguen operando su sede de siempre — eran 4 el viernes. |
| 2 | `23_facturacion_fase1.sql` | Corrige **una línea en cada una** de `emitir_comprobante` y `emitir_nota`: el ítem genérico de respaldo pasa de `p_subtotal` (redondeado a céntimos) a `round(p_total / 1.18, 6)`. **Ya NO agrega `comprobantes.items` ni crea `actualizar_transmision_comprobante`**: ambos existen en producción desde el 08-sep, los pegó otra sesión. | Hoy S/19,90 sale en el documento por **19,89**, S/129,90 por **129,89** y S/109,90 por **109,91** — el 15 % de los precios de CAYLA. Y el arreglo del frontend que evita ese camino **no está desplegado**, así que la PRIMERA boleta real pasaría por ahí, con el correlativo ya quemado ante SUNAT. Va antes de registrar la serie. |
| 3 | `24_registrar_gasto_y_semillas.sql` | `drop` de `registrar_gasto` (6 args) + `create` de la de 7 con `p_metodo_pago`; el `check` de `metodo_pago`; semilla de las **35** `cuentas_contables`; los **14 índices** que la transcripción de julio perdió. | Egresos está desplegado y **no puede registrar ni un gasto** (el modal manda 7 parámetros, la función tiene 6). Y `cuentas_contables` está en 0 filas, justo delante de la fase de Ingresos. |
| 4 | `25_migraciones_aplicadas.sql` | Crea `retail.migraciones_aplicadas`, retro-puebla las 17 aplicaciones ya hechas con `sha256='RETRO-DESCONOCIDO'`, y registra 22/23/24/25 con su hash real. | **Último, siempre.** Registra los tres anteriores: pegarlo antes escribiría una afirmación falsa. |

### Archivos que NO se pegan

| Archivo | Motivo |
|---------|--------|
| `13_recibir_lote_valida_sede.sql` | SUPERADO por el 14 (ya marcado en su cabecera). |
| `16_crear_producto_variantes.sql` | SUPERADO por el 18. Define la firma de 7 args de `crear_producto_con_variantes`; producción tiene la de 8 y **ninguno de los dos hace `drop`**. Pegarlo hoy recrea la sobrecarga fantasma del ADR-0004. El BACKLOG todavía lo lista como pendiente: hay que corregirlo. |
| `20_comprobantes_items.sql` | SUPERADO por el 23, que lo fusiona con el 21. Cabecera puesta. |
| `21_actualizar_transmision_comprobante.sql` | Ídem. Cabecera puesta. |

---

## Los hashes de esta tanda

Calculados con `shasum -a 256` sobre los archivos tal como se pegan. **Si editas
alguno antes de pegarlo, recalculá el hash y corregí la fila correspondiente en
el archivo 25** — si no, la tabla `migraciones_aplicadas` va a afirmar algo
falso, que es exactamente el problema que existe para resolver.

```
48b2822301b15c3f0fb2ef954696ef463dcd5157bdad72e4ca14bc233185cdb7  22_candados_y_permisos.sql
3b657d266f87fef194924c584c0b067af45452db6d91827d4455c6053c351ceb  23_facturacion_fase1.sql
59486296a12be48cf201fca9f997fb866e733e61cd0c8bc385d4684934bca8d8  24_registrar_gasto_y_semillas.sql
55a48a497cda634e56849670032af34294268f701529551ee4eff00a04afde8b  25_migraciones_aplicadas.sql
```

Para comprobarlos vos mismo, desde la raíz del repo:

```bash
shasum -a 256 supabase/unificacion/2[2-5]_*.sql
```

### El caso raro del archivo 25

El 25 registra su propia fila con `sha256 = 'AUTO-REFERENCIA'`, no con un hash.
No es descuido: **un archivo no puede contener su propio sha256** — escribirlo
adentro cambia el archivo, y con él el hash. No existe el punto fijo.

Su hash real es el de la lista de arriba (`ab422e51…`), y es estable porque se
calcula sobre el archivo ya terminado, con el `'AUTO-REFERENCIA'` adentro. Si
querés estamparlo igual, después de pegar el 25 corré esta línea (opcional):

```sql
update retail.migraciones_aplicadas
   set sha256 = 'ab422e518f4657e07eea6654c613140d2cf30b6a024a41e4e565df632dfd1d6a'
 where archivo = 'unificacion/25_migraciones_aplicadas.sql';
```

---

## Verificación final — los 7 booleanos

Cuando los cuatro estén pegados, esta consulta única. **Los 7 tienen que dar
`true`.** Si alguno da `false`, el archivo que lo produce no entró bien.

```sql
select
  (select count(*) from pg_proc where proname='actualizar_transmision_comprobante'
     and pronamespace='retail'::regnamespace) = 1                                  as rpc_transmision,
  (select count(*) from pg_proc where proname='registrar_gasto'
     and pronamespace='retail'::regnamespace) = 1                                  as gasto_una_sola_firma,
  (select count(*) from information_schema.columns where table_schema='retail'
     and table_name='comprobantes' and column_name='items') = 1                    as comprobantes_items,
  (select count(*) from retail.cuentas_contables) = 35                             as plan_de_cuentas,
  (select bool_and(pg_get_functiondef(oid) ~* 'puede_operar_sede')
     from pg_proc where pronamespace='retail'::regnamespace
     and proname in ('abrir_caja','cerrar_caja','registrar_venta'))                as candados_repuestos,
  (select has_table_privilege('authenticated','retail.personas','UPDATE')) = false as personas_cerrada,
  (select count(*) from retail.migraciones_aplicadas) = 21                         as registro_sembrado;
```

Qué archivo responde por cada columna:

| Columna | Archivo | Si da `false` |
|---|---|---|
| `rpc_transmision` | 23 | La función no se creó, o quedaron dos firmas. |
| `gasto_una_sola_firma` | 24 | Quedó la sobrecarga fantasma: falta el `drop` de la firma de 6 args. |
| `comprobantes_items` | 23 | El `alter table` no corrió. |
| `plan_de_cuentas` | 24 | La semilla no entró completa (deben ser 35). |
| `candados_repuestos` | 22 | Alguna de las tres funciones no se reemplazó. |
| `personas_cerrada` | 22 | El `revoke` no corrió: la escalada a admin sigue abierta. |
| `registro_sembrado` | 25 | Deben ser 21 filas: 17 retro + 22 + 23 + 24 + 25. |

### Tres verificaciones más que conviene correr

Estas no están en los 7, y son las que prueban que el arreglo hace lo que dice:

```sql
-- 1. Los helpers ya no devuelven NULL. En el SQL Editor auth.uid() es NULL, así
--    que un helper sano responde `false`. HOY, antes del 22, responden NULL —
--    y `not NULL` es NULL, por eso el `if not ... then raise` nunca lanzaba.
select retail.es_lider() is not null                                       as lider_nunca_null,
       retail.puede_operar_sede('00000000-0000-0000-0000-000000000000'::uuid)
         is not null                                                       as sede_nunca_null;

-- 2. Las tres funciones de identidad exigen persona activa.
select bool_and(pg_get_functiondef(oid) ~* 'estado\s*=\s*''activo''')      as exigen_persona_activa
  from pg_proc where pronamespace='retail'::regnamespace
   and proname in ('puede_operar_sede','es_lider','persona_actual');

-- 3. Los 14 índices.
select count(*) = 14 as indices_repuestos
  from pg_indexes where schemaname='retail' and indexname in (
    'variantes_producto_id_idx','movimientos_venta_id_idx','gastos_sede_id_idx',
    'cajas_sede_id_idx','lotes_sede_id_idx','depositos_bancarios_sede_idx',
    'activos_fijos_unidad_idx','asientos_unidad_fecha_idx','asientos_referencia_idx',
    'asiento_lineas_asiento_idx','asiento_lineas_cuenta_idx','producciones_unidad_idx',
    'producciones_producto_idx','producciones_variante_idx');
```

---

## Las pruebas de negocio (las que valen de verdad)

El SQL Editor corre como `postgres`, que se salta RLS y todos los candados. Las
tres pruebas que importan se hacen **en la app**:

1. **Un gasto real.** Entrar a `/finanzas/egresos` como Líder y registrar S/1 en
   AQP con método "Efectivo". Después:
   `select total, metodo_pago from retail.gastos order by created_at desc limit 1;`
   Debe traer la fila con `metodo_pago='efectivo'`. Hoy, antes del 24, ese
   formulario devuelve error y no guarda nada.

2. **Una integrante activa sigue trabajando igual.** Abre caja en su sede, vende,
   cierra caja. Nada debe cambiar para ella.

3. **Una persona inactiva ya no puede operar.** Con un login de los 4 inactivos,
   `abrir_caja` sobre su sede de siempre debe responder "No tienes permiso…".
   Antes del 22, **abría la caja**.

---

## Lo que esta tanda NO desbloquea

Facturación no emite todavía aunque los cuatro archivos entren perfectos. Faltan
tres cosas que no son SQL:

1. **Registrar la serie autorizada por SUNAT de cada sede.**
   `select count(*) from retail.series_comprobantes` → **0**. Sin serie,
   `fn_reservar_numero_serie` corta antes de llegar al botón Transmitir. Es el
   bloqueante más barato y el que no estaba anotado en ninguna lista.
2. **Confirmar el alta como PSE tercero en SUNAT SOL** (GIOR `20515809822` /
   VIDA `20600337832`).
3. **`LUCODE_TOKEN` y `LUCODE_ENTORNO=sandbox`** en `.env.local` y en Vercel.
   Nunca en el chat.

---

## De acá en adelante

Toda migración nueva de `retail` termina, **dentro de su propio `begin/commit`**,
con su línea de registro — así aplicar y registrar son una sola operación:

```sql
insert into retail.migraciones_aplicadas (archivo, sha256, aplicada_por, nota)
values ('unificacion/26_lo_que_sea.sql', '<shasum -a 256 del archivo>',
        current_user, 'una línea de qué hace')
on conflict (archivo) do update set
  sha256 = excluded.sha256, aplicada_at = now(), nota = excluded.nota;
```

Y lo que esta tabla **no** puede hacer: decirte si producción tiene lo que el
repo promete. `migraciones_aplicadas` registra lo que **creemos** haber corrido;
hace falta además un `pnpm db:diff` que compare `pg_proc`, `pg_policies` e
`information_schema` contra el repo y falle cuando el repo declara algo que
producción no tiene. Los seis drifts de septiembre los habría encontrado ese
script en dos segundos — esta tabla no habría atrapado ninguno.
