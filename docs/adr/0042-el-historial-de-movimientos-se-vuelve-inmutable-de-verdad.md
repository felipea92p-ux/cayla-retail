# ADR-0042 — El historial de movimientos se vuelve inmutable de verdad

**Fecha:** 2026-09-14
**Estado:** Aplicado y verificado en la base local (V2). **No aplicado en producción**
— el gemelo con prefijo `retail.` lo pega Felipe (D-11), ver «Lo que falta».
**Afecta:** `retail.movimientos` en `supabase/migrations/20260914165703_movimientos_inmutables.sql`.

## Contexto

`movimientos` es la única fuente desde la que se puede reconstruir el stock
(`recalcular_stock`). Toda la documentación de la casa la presenta como una tabla
que "nunca se edita y nunca se borra" — `ARQUITECTURA.md` la llama *append-only*,
`docs/datos/00-MAPA.md` lo dice en presente.

Eso no era cierto. Era una **costumbre, no un candado**, y la diferencia se mide
con una pregunta: *si alguien pega un `update` a mano, ¿entra?* Entraba. La tabla
se salvaba por **omisión** —nadie había escrito una policy de `UPDATE` ni de
`DELETE`, así que RLS denegaba por defecto— y esa omisión no cubre al dueño de la
tabla, a la llave de servicio, ni a ninguna función `security definer`, que se
saltan las policies por definición. Verificado además contra la base local: el rol
`authenticated` tenía concedidos `UPDATE` y `DELETE` sobre la tabla.

Es el hueco **P-04** de `docs/datos/13-PROMESAS-INCUMPLIDAS.md`, la decisión
**D-22**, y el que esa misma lista pone tercero en "si hubiera que empezar por
tres, hoy" — *porque es el candado que protege lo único que no se puede
reconstruir: el pasado*.

## Decisión

**DECIDÍ: un disparador `before update or delete` que siempre rechaza, con un
mensaje que dice qué hacer en su lugar**, más el retiro de `UPDATE`/`DELETE`/
`TRUNCATE` a `authenticated` y `anon` sobre esa tabla.

`TRUNCATE` se revoca aunque hoy no estuviera concedido en local, porque **la
seguridad por fila no se aplica a `TRUNCATE`**: vaciaría la tabla entera saltándose
todas las policies, y con ella el inventario de CAYLA.

Se verificó antes de escribirlo, no después: se le preguntó a la base qué funciones
del schema `retail` actualizan o borran movimientos, y devolvió **cero**. El candado
no le quita nada a nadie — vuelve imposible lo que ya nadie hacía. El `INSERT` no se
toca: `registrar_venta`, `registrar_movimiento` y el resto siguen igual.

**Se probó en rojo antes de creerle al verde:** un `update` y un `delete` dentro de
una transacción con `rollback` fallan los dos con el mensaje en castellano, las 105
filas quedan intactas, y `authenticated` se queda solo con `INSERT` y `SELECT`.

**DESCARTÉ: quitar también la policy de `INSERT` directo** (hueco P-05, que deja
escribir en `movimientos` sin pasar por la RPC, dejando una fila que no mueve el
stock). Es un hueco real y distinto, y cerrarlo exige primero buscar qué script o
herramienta inserta directo hoy. Va aparte, no mezclado con este.

**DESCARTÉ por ahora: `force row level security`** — la tercera pieza de D-22. Haría
que las policies apliquen también al dueño, y las funciones `security definer` que
insertan movimientos (venta, transferencia, conteo) tendrían que pasarlas. Tiene
riesgo real de romper flujos legítimos y merece su propia prueba; el objetivo de
este ADR —que el pasado no se pueda editar— ya se cumple con el disparador, que se
dispara para todos, incluido el dueño.

## Cómo se corrige un error a partir de acá

No borrando: **escribiendo lo contrario**. Un movimiento de corrección con el signo
opuesto y su motivo. El stock queda bien y el historial muestra las dos cosas — el
error y quién lo corrigió. Es la lógica del libro contable: un asiento equivocado se
revierte con un contra-asiento, no con corrector líquido.

La salida de emergencia queda abierta a propósito (**D-11**): el candado frena a la
aplicación y a las funciones, **no a Felipe desde el SQL Editor** — el dueño de la
tabla puede desactivar su propio disparador un minuto, corregir y reactivarlo.
Imposible por accidente, posible a propósito y con rastro.

## Se rompe si

Alguien escribe una RPC nueva que necesite corregir una fila de `movimientos` en vez
de compensarla con otra. Si eso pasa, la pregunta no es cómo saltarse el disparador
— es por qué esa operación no se puede expresar como un movimiento nuevo.

## Lo que falta

1. **El gemelo de producción** (cuarta pieza de D-22), con el prefijo `retail.` en
   cada tabla. Lo pega Felipe, no esta sesión.
2. **`force row level security`**, con su propia prueba de que las RPC de venta,
   transferencia y conteo siguen pudiendo insertar.
3. **Cerrar el `INSERT` directo** (P-05).

Los tres quedan anotados en `docs/BACKLOG.md`.
