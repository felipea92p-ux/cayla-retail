# ADR-0026 — Cómo sabemos qué corrió en producción, y por qué la firma vieja se borra

**Fecha:** 2026-09-09
**Estado:** Aplicado (el verificador). **Pendiente de decisión de Felipe:** el arreglo de las
cuatro funciones sobrecargadas, que es DDL en el proyecto compartido con Dynamic.
**Afecta:** `scripts/migraciones/` (nuevo), y de aquí en adelante toda migración que cambie la
firma de una función.

## Contexto

El repo tiene **75 scripts SQL** en dos carpetas con reglas distintas: `supabase/migrations/`
se pega a mano en el SQL Editor de producción, y `supabase/unificacion/` corre en el proyecto de
cayla-dynamic y el historial de Supabase ni siquiera la conoce. No había forma de saber cuáles
habían corrido. El BACKLOG lo llamaba, con razón, *"la deuda que produce todas las anteriores"*:
ya cobró con la `0030` (un round-trip por el prefijo `retail.`) y con las `20`/`21`/`22`, que se
descubrieron sin aplicar solo porque una pantalla se rompió con la clienta esperando.

## Decisión A — el verificador, y qué se le permite afirmar

Dos piezas, sin dependencias nuevas y sin credenciales nuevas:

- **`scripts/migraciones/inventario.sql`** — una consulta que devuelve, en un solo JSON, los
  objetos vivos de los schemas `retail`, `public` y `storage`. Se pega en el SQL Editor de
  producción, que es el camino que este repo ya usa; en local la corre el script solo, contra el
  contenedor del `supabase start`.
- **`scripts/migraciones/verificar.mjs`** — lee cada archivo, extrae lo que **promete** crear y
  lo busca en ese inventario.

Lo que define el diseño no es lo que detecta, sino **lo que se le prohíbe afirmar**:

1. **La ausencia es certeza; la presencia, no.** Si promete `fn_x` y no está, ese archivo no
   corrió — afirmación dura, y es la dirección que importa. Pero `create or replace` se repite
   entre archivos (`fn_aplicar_movimiento` se reescribe en 0008, 0010, 0011, 0044 y 0045), así
   que encontrarla no dice **cuál versión** está viva. Un archivo sin faltantes significa "nada
   delata que falte", nunca "corrió".
2. **Lo que no supo leer, lo dice.** Los archivos de solo `insert` o `grant` salen como *sin
   promesas detectables*, no como aprobados. Un verificador que aprueba lo que no entendió es
   peor que no tenerlo: enseña a confiar en un verde vacío. Misma regla que ADR-0022 con las
   huellas que no reconoce.
3. **Las dos carpetas se informan por separado.** `unificacion/` ausente mirando la base local no
   es un hallazgo, es lo esperado. Mezclarlas produciría 28 falsas alarmas, que es exactamente
   cómo se enseña a ignorar un informe.
4. **La foto de producción no se commitea.** `inventario-produccion.json` es un momento; una foto
   vieja miente con cara de dato.

Detalle que costó una corrida entender: **el schema es `retail` también en local**, porque
`supabase/seed.sql` renombra `public` al terminar (ADR-0010). Y `unificacion/` crea sus tablas
(`retail_sede_meta`) en el `public` de Dynamic, no en `retail` — por eso el inventario mira tres
schemas y no uno.

## Decisión B — la firma vieja se borra, siempre

En su primera corrida el verificador encontró **cuatro funciones con más de una firma viva** en
la base local:

| Función | Firmas |
|---|---|
| `registrar_movimiento` | 10 y 12 argumentos |
| `recibir_lote` | 6, 7 y 8 |
| `registrar_produccion` | 11, 13 y 15 |
| `crear_producto_con_variantes` | 7 y 8 |

Es la trampa que ya había documentado ADR-0009 —`create or replace` con un argumento nuevo no
reemplaza, **crea una segunda función**— pero ahí se vio como una anécdota de una migración. No
lo es: nadie borró las viejas, y **una llamada que solo nombra los parámetros comunes no
resuelve**. Comprobado con `explain`, que no ejecuta nada:

```
explain select retail.registrar_movimiento(p_variante_id => …, p_sede_id => …,
                                           p_tipo => …, p_cantidad => …, p_motivo => …,
                                           p_sede_destino_id => …);
→ ERROR: function retail.registrar_movimiento(...) is not unique
```

Con `p_contenedor_id` agregado resuelve bien. O sea: en la base local, **una devolución al
almacén funciona y un ajuste, una merma o un traslado normal no** — porque `MovimientoModal`
solo manda `p_contenedor_id` cuando es devolución, y `supabase-js` borra del JSON las claves
`undefined`. La misma forma explica dos cosas que el BACKLOG atribuía a otra causa:
`recibir_lote` no aparece en los tipos generados, y `RecibirLoteForm` "siempre falla cuando se
usa".

**La regla, desde hoy:** toda migración que le agregue o quite un argumento a una función
existente lleva su `drop function <nombre>(<tipos de la firma vieja>);` en el mismo archivo, con
los tipos explícitos. Sin eso, `create or replace` no es un reemplazo: es una bifurcación.

## Consecuencias

- El verificador **informa, no bloquea**: sale siempre con código 0. Meterlo a CI hoy sería un
  rojo permanente sin acción clara; el día que entre, se decide ahí qué convierte en fallo.
- Empareja por nombre pelado, sin schema. Dos objetos homónimos en schemas distintos se
  confundirían — precio aceptado a cambio de que el mismo objeto se reconozca entre entornos.
- **Lo que este ADR NO hace: arreglar las cuatro sobrecargas.** Borrar funciones en producción es
  DDL en el proyecto compartido con Dynamic, o sea "parar y confirmar con Felipe" (CLAUDE.md), y
  además hay otra sesión escribiendo migraciones en paralelo. Queda el diagnóstico, la prueba y
  la orden exacta; la decisión es de él.
- Falta saber si producción tiene las mismas cuatro. Se responde corriendo `inventario.sql` allá
  — que es, precisamente, para lo que existe.
