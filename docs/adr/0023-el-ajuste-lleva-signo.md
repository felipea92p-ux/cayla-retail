# ADR-0023 — El ajuste lleva signo, y el stock no puede ser negativo

**Fecha:** 2026-09-09
**Estado:** aplicado y verificado en local
(`supabase/migrations/0044_almacen_interno.sql`, `0045_ajuste_con_signo.sql`).
**`unificacion/26` ya está aplicado en producción** (verificado contra la base el
2026-09-09: `fn_aplicar_movimiento` conserva la línea de `ultima_venta`).
**`unificacion/27` sigue pendiente** — es el que trae la guarda del ajuste y las
tres redes de no-negatividad, que producción todavía no tiene.

## Contexto

Hasta hoy era **imposible registrar un conteo físico menor a lo que dice el
sistema**. Si `stock` dice 5 y en la percha hay 3, no había forma de decirlo: la
única salida era mentir con una `salida` de `motivo='merma'`, que afirma que dos
prendas se perdieron cuando en realidad el equivocado era el sistema.

El síntoma visible era `MovimientoModal.tsx:148` (`min={1}` en el input de
cantidad, bajo una opción que se llama, literalmente, "Ajuste (conteo físico)").
Pero la pantalla solo reflejaba lo que la base ya imponía. La rama `ajuste` de
`fn_aplicar_movimiento` proponía la fila con el **delta**:

```sql
insert into stock (variante_id, sede_id, cantidad)
  values (m.variante_id, m.sede_id, m.cantidad)   -- ← propone -2
  on conflict (variante_id, sede_id) do update
    set cantidad = stock.cantidad + excluded.cantidad
```

Verificado en local el 2026-09-09, intentando contar hacia abajo:

```
ERROR: new row for relation "stock" violates check constraint "stock_cantidad_no_negativa"
DETAIL: Failing row contains (..., -2, ...)
```

**Es el mismo bug de ADR-0020**, en otra rama de la misma familia de código. Y
vale decirlo con precisión porque tiene una lección: ADR-0020 cierra afirmando
que `fn_aplicar_movimiento` *no* tiene el problema "porque aplica un movimiento a
la vez sobre una fila que bloquea con `for update`, y nunca propone un total
negativo". Las dos mitades de esa frase son ciertas para las ramas `salida` y
`traslado` — que sí bloquean — y falsas para la rama `ajuste`, que no bloquea
nada y propone el delta crudo. La "tercera función" que ADR-0020 anticipaba ya
existía, dentro de la misma función que había dado por segura.

Nadie lo notó porque hasta ahora ninguna ruta escribía un ajuste negativo.

## El agujero que esto destapó en producción

`stock_cantidad_no_negativa` existe **solo** en `0010_stock_concurrencia.sql`.
No está en `unificacion/05_operacion.sql` ni en ningún archivo posterior:
**producción nunca lo tuvo.** `stock_almacen` tampoco lo tiene en ningún lado, y
`movimientos.cantidad` no tiene ningún check de signo — hoy una `entrada` de −5 o
una `salida` de 0 se aceptan sin chistar.

Eso invierte el riesgo entre los dos entornos. En local, un ajuste negativo
revienta ruidosamente. En producción **habría entrado en silencio**, y sobre una
variante sin fila previa de stock habría creado una fila negativa que nada
detecta. Es peor un error que no avisa que uno que aborta.

## Decisión

**1. La rama `ajuste` deja de proponer negativos.** Pasa al patrón
asegurar → bloquear → verificar → sumar:

```sql
insert into stock (variante_id, sede_id, cantidad)
  values (m.variante_id, m.sede_id, 0)
  on conflict (variante_id, sede_id) do nothing;   -- un 0 nunca viola el CHECK
select cantidad into v_actual from stock
  where variante_id = m.variante_id and sede_id = m.sede_id for update;
if v_actual + m.cantidad < 0 then
  raise exception 'El ajuste dejaría el stock en negativo en la sede % (hay %, se ajusta %)', …;
end if;
update stock set cantidad = cantidad + m.cantidad, updated_at = now() where …;
```

**Se descartó** la versión corta —calcular el absoluto en memoria y hacer
`do update set cantidad = excluded.cantidad`— porque deja una carrera abierta
justo cuando la fila todavía no existe: dos ajustes simultáneos calcularían
ambos sobre 0 y el segundo pisaría al primero. Asegurar la fila primero hace que
el `for update` tenga de verdad algo que bloquear, que es lo que la rama `salida`
viene haciendo bien desde `0010`.

Para un ajuste **positivo** el comportamiento observable no cambia en nada.

**2. Se ponen las tres redes que faltaban:** `cantidad >= 0` en `stock` (en
producción por primera vez) y en `stock_almacen`, y en `movimientos` la regla de
que el signo lo lleva **solo** el ajuste:

```sql
check (cantidad <> 0 and (tipo = 'ajuste' or cantidad > 0))
```

El signo deja de ser una convención que hay que recordar y pasa a ser una regla
de la base (principio 2).

**3. Las tres se agregan con `not valid` + `validate` por separado**, para que
una fila histórica sucia deje la guarda puesta para todo lo nuevo y falle
ruidosamente señalando el problema, en vez de que el `alter` entero se caiga y
quedemos sin protección. `unificacion/27` trae el pre-flight para correr y leer
**antes** de aplicar.

## Consecuencias

- **El censo del catálogo real se vuelve posible.** Contar es afirmar un número
  absoluto sobre una percha; sin ajustes con signo, el sistema solo sabía sumar.
- Un ajuste imposible ahora falla diciendo qué sede y cuánto hay, en castellano,
  en vez de un error de constraint que nadie interpreta.
- Verificado en local con datos reales, en una transacción revertida: entrada al
  almacén (10) → bajar a piso (4) → venta (1) → **ajuste de −2 que aplica y deja
  el piso en 1**; un censo desde cero sobre una variante sin fila previa
  (ajuste +7 → 7); un ajuste de −99 rechazado con el mensaje nuevo; una `entrada`
  de −5 rechazada por `movimientos_cantidad_coherente`; y `recalcular_stock()`
  reproduciendo las dos bolsas sin mezclarlas (8 piso / 6 almacén).
- `MovimientoModal.tsx:148` (`min={1}`) queda como la última puerta cerrada, ya
  del lado de la pantalla. Se abre cuando llegue el flujo de conteo, no antes:
  hoy sería un input donde cualquiera puede tipear un negativo sin contexto.
- **Orden obligatorio en producción:** `26` antes que `27`. Los dos reemplazan el
  cuerpo de `retail.fn_aplicar_movimiento` y el segundo incluye lo del primero;
  al revés se pierde `ultima_venta` otra vez.

## Lo que esto enseña, más allá del bug

ADR-0020 dejó escrito el patrón peligroso —"inserto el delta y que el ON CONFLICT
lo sume" es seguro solo mientras el delta propuesto pase los CHECK por sí solo— y
aun así la tercera ocurrencia estaba a cincuenta líneas de distancia, dentro de
la función que el mismo ADR daba por segura. Escribir la regla no alcanza: hay
que ir a buscar todas sus apariciones el mismo día.

Quedan dos, y conviene tenerlas anotadas: la rama `entrada` (piso y almacén) y la
pata que recibe un `traslado` siguen usando `on conflict do update` sumando el
delta. **Hoy son seguras** porque `movimientos_cantidad_coherente` garantiza que
esas cantidades son positivas. Dejaron de depender de una convención y pasaron a
depender de un CHECK — que es exactamente donde deben estar.
