# ADR-0255 · Los arreglos que vivían solo en producción, llevados a `main`

- **Fecha:** 2026-09-28 · **Estado:** construido; **sin pegar en producción** (pegarlo cambia solo cinco funciones de
  lectura, ver «Cómo se pega»).
- **Origen:** la primera corrida de la deriva (ADR-0251, 2026-09-28): 14 diferencias reales entre producción y `main`.
- **Migraciones:** `20260928200000_arreglos_en_vivo_a_main.sql` y `20260928200100_nota_pendiente_por_cierre_o_faltante.sql`.
- **Prueba:** `pnpm pruebas:arreglos-en-vivo` (`scripts/pruebas/arreglos_en_vivo.mjs`, en el job «Pruebas de RPC contra
  Postgres» del CI).

## Problema

Varias cosas se corrigieron directo en producción (SQL Editor o el MCP de Supabase) y su migración nunca llegó a `main`.
Esto cuesta dos cosas, y las dos pasan sin que nadie se entere: el CI y el Postgres de cada worktree prueban un sistema
distinto al que corre en las tiendas, y la próxima migración que recree una de esas funciones desde el repo borra el
arreglo (le pasó a Análisis con el PR 397). La deriva encontró:

- `emitir_comprobante` y `emitir_nota`: en producción, ningún rol de la app las ejecuta (cerrado el 2026-09-26).
- `fn_aplicar_movimiento` y `recalcular_stock`: en producción, `service_role` tampoco las ejecuta.
- `stock` y `movimientos`: en producción, `authenticated` solo lee y `service_role` no escribe.
- `fn_rentabilidad`: existe solo en producción (la del PR #168, en borrador, pegada sin su pantalla).
- `fn_stock_por_sede_json`, `fn_resumen_comparacion_json` y `fn_resumen_variantes_json`: la de producción llama
  `fn_x()` y la de `main`, `retail.fn_x()`. Son equivalentes.
- `compras_nota_pendiente` y `notas_credito_tablero`: producción tiene otra regla (commit `1807fdfb8`, nunca fusionado).

## Decidí

1. **Traer a `main` lo que producción tiene** (primera migración): los `revoke` de las cuatro funciones y de la
   escritura de las dos tablas, y `fn_rentabilidad` con su cuerpo exacto. Solo se quita lo que sobra, con `revoke`
   explícito. Una guarda de md5 aborta si el cuerpo vivo no es el de `main` ni el de producción, y una verificación final
   aborta si el resultado no quedó EXACTAMENTE como producción para los roles de la app: si otro rol dejó una puerta
   abierta, si hay un permiso de más (también por columna, o cualquiera para `anon`), o si la dueña perdió su EXECUTE.
2. **Las tres `_json`: se queda la de `main`**, copiada tal cual. Es lo único que esa migración cambia en producción.
3. **Notas de crédito: ni la de `main` ni la de producción, sino la regla combinada** (segunda migración, decisión
   técnica del 2026-09-28). Un cierre deja de esperar su nota si **(a)** tiene una nota atada, de cualquier motivo, **o
   (b)** su comprobante ya tiene la nota por faltante, que es una sola y cubre todos sus cierres. La de `main` cuenta dos
   veces un cierre saldado con una nota por devolución (Felipe pidió corregirlo el 2026-09-22). La de producción deja un
   cierre «pendiente» para siempre cuando el comprobante tiene dos líneas cerradas y una sola nota por faltante, atada al
   último cierre, que es como la manda la pantalla (reproducido; y `pruebas:compras-faltantes` se pone roja). Va sin
   esperar otro visto bueno porque junta dos reglas que ya estaban escritas, cumple lo pedido el 22-sep, y producción no
   tiene hoy ni un cierre ni una nota: ninguna cifra que el líder ya vio cambia.
4. **Una suite que mira el estado vivo** (`pruebas:arreglos-en-vivo`, 47 casos, los mismos con y sin superusuario, o sea
   también en el CI): si una migración futura vuelve a abrir una de estas puertas (por ejemplo con `drop function` +
   `create function`, que no conserva los `revoke`), se pone roja. Los permisos se comparan contra la lista EXPLÍCITA de
   producción, no contra una foto de la misma base (sería circular). También prueba que cerrar las puertas no rompe la
   tienda: como `authenticated`, una venta con boleta sigue emitiendo su comprobante y bajando el stock, y aprobar una
   devolución de una venta aceptada sigue emitiendo su nota de crédito.
5. **Las pruebas del PEGADO no congelan las funciones** (revisión del 2026-09-28). Pegan cada migración sobre la foto de
   producción armada dentro del ROLLBACK desde el TEXTO de la propia migración, no sobre los cuerpos vivos. Una migración
   posterior que cambie una `_json`, `fn_rentabilidad` o las notas de crédito —algo legítimo— no pone roja la suite ni
   le pide a nadie editar una migración ya fusionada (medido: con un `where true` sumado a `fn_stock_por_sede_json`, antes
   caían 7 casos). Si cambia la FIRMA de una de las cuatro que A exige, A ya no se puede pegar sobre esa base y sus
   pruebas de pegado se omiten con un aviso que lo dice. Lo que queda en la base lo siguen vigilando los candados de
   estado vivo y los casos de negocio de las notas (con montos, por motivo, por comprobante y por sede).

## Descarté

- **`revoke all` + volver a otorgar lo justo.** En producción quitaría y devolvería permisos que hoy están bien, y la
  huella cambiaría sin razón.
- **Anotar las diferencias como «conocidas» en `deriva.mjs`.** El CI seguiría probando puertas que producción ya cerró:
  una pantalla nueva que escribiera `stock` directo pasaría todas las pruebas y fallaría recién en la tienda.
- **Traer las notas de crédito de producción tal cual.** Deja el cierre fantasma en la pantalla más usada del módulo.

## Se rompe si

- **Una pantalla o un script futuro escribe `stock` o `movimientos` directo, o llama a una de las cuatro funciones** con
  la sesión o con la llave del servidor: recibe `permission denied` (42501). La salida es una función `security definer`
  con su candado, nunca devolver el permiso.
- **Alguien recrea una de las cuatro con `drop` + `create`**: la suite se pone roja en el CI.
- **La dueña (`postgres`) pierde su EXECUTE de una de las cuatro**: se caen las ventas, devoluciones y movimientos. La
  verificación de la migración aborta nombrándola, y la suite lo prueba con una dueña que no es superusuaria.
- **Una nota chica atada a un cierre lo apaga entero**: la regla (a) no mira el monto (una devolución de S/ 59 atada a un
  cierre de S/ 590 borra el pendiente, y los S/ 531 que faltan dejan de verse). Hoy solo se llega llamando a la RPC a
  mano: el modal ata el cierre solo en la nota por faltante. **Si la pantalla empieza a atar notas de otro motivo, solo
  puede hacerlo cuando la nota cubre el esperado de ese cierre** (costo + IGV, con `MARGEN_NOTA`); si no, el cambio va en
  la base (que la regla (a) sume las notas atadas y las compare con el esperado). `pruebas:arreglos-en-vivo` deja el
  comportamiento a la vista («una nota por descuento de S/ 50 atada a un cierre de S/ 590 lo apaga entero»).
- **La nota por faltante deja de ser una por comprobante**: la regla (b) apagaría cierres que esa nota no cubre.
- **El PR #168 cambia el cuerpo de `fn_rentabilidad` antes de que esta migración entre**: la guarda aborta. **El PR #168 tiene que quitar su propia
  creación de `fn_rentabilidad` (`20260918194000_panel_rentabilidad.sql`) o dejarla idéntica** (hoy lo es: mismo
  `pg_get_functiondef`, comprobado pegándola antes de la de este ADR).

## Qué se comprobó antes de cerrar las puertas

- **La web de `main` no llama a ninguna de las cuatro funciones** (solo aparecen en comentarios) y no escribe `stock`
  ni `movimientos`: son 8 lecturas de `stock` y 3 de `movimientos`. La llave del servidor solo toca comprobantes (el
  reintento de SUNAT) y terminales.
- **Las 31 funciones de la base que escriben `stock`/`movimientos` o llaman a las cuatro son `security definer` con
  dueña `postgres`**: ninguna corre con los permisos de quien la llama.
- **Producción ya opera así**: después del cierre del 2026-09-26 hubo 3 comprobantes, 1 venta y 76 movimientos. Allá
  `postgres` no es superusuario, igual que en el CI.

## Cómo se pega

Dos partes, cada una sola en el SQL Editor, tal cual (ya traen `retail.`), en cualquier orden y a cualquier hora. Se
pueden pegar dos veces. Sin políticas, sin `drop trigger`, sin `alter table` (ADR-0195).

| Parte | Cambia en producción | Huella antes → después |
|---|---|---|
| `20260928200000` | `fn_stock_por_sede_json` · `fn_resumen_comparacion_json` · `fn_resumen_variantes_json` (lo demás ya está así) | `4365f322…` → `8ea080da9ff1b07de8f893afc8f5ce74` · `cc71c6d6…` → `2921579370257dba433159ce171f9779` · `972b6bc8…` → `23e23e1359bdf05e822669f86e317187` |
| `20260928200100` | `compras_nota_pendiente` · `notas_credito_tablero` | `fe0f9ae0…` → `a80fc31534b8b63cedfe4732b7601e41` · `802b9630…` → `e9a4ec7b34d54f65ac5be101cb7aa1fd` |

Las huellas son el md5 del cuerpo sin comentarios ni espacios (el de `deriva.sql`); la consulta está en el encabezado de
cada migración. Después de pegar las dos, la deriva debe quedar solo con la política de Clientas que se decide en su PR.
