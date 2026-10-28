# ADR-0405 · Catálogo después de /chaos: el precio y el costo son números de verdad, y los nombres tienen tope

- **Fecha:** 2026-10-14 · **Estado:** construido y verificado en local (suite de base con control, vitest y la pantalla en un Chrome sin
  cabeza). **La migración está en producción** desde el 2026-10-14 (con el OK de Felipe): los 11 candados puestos y validados contra todas
  las filas. Rama `claude/chaos-catalogo-5c56e1`, PR #1078.
- **Pedido:** Felipe, 2026-10-14: «continúa con otro módulo» después de Inventario (con la consigna de antes: cubrir y arreglar lo que
  haga falta sin interrumpir el flujo). Compras quedó para después porque otra sesión lo está reconstruyendo hoy (#1055, #1056, #1040,
  #1032): atacarlo ahora era probar código que va a cambiar.
- **Extiende:** ADR-0398 (montos finitos en Ventas y Caja). **Complementa:** ADR-0356 (`/chaos`), ADR-0384 (precio 0 solo en empaque).

## Lo que estaba abierto (corrida del 2026-10-13, semilla `20261013`)

1. **Gravedad 1, solo por la API:** una prenda con precio o costo `NaN`. Las reglas comparan `<= 0`, y en Postgres `NaN` es mayor que
   cualquier número. Una prenda así no se puede vender y vuelve `NaN` toda suma que la toque. Y `variantes.costo` es el **costo oficial**
   que también escriben Compras (al recibir) y Producción (al cerrar una orden): por ahí entraba el `NaN` que `/chaos` vio en esos dos
   módulos el mismo día, que no se corrige a mano.
2. **Gravedad 3:** Editar producto con un id que no es uuid caía en la pantalla de error.
3. **Gravedad 2, solo por la API:** nombres de producto y de marca de 5000 letras (la pantalla tampoco cortaba).
4. **No cubierto:** el navegador en Nuevo y Editar producto.

## La decisión

- **Base** (`20261014182000`, solo `alter table`):
  - `<tabla>_montos_finitos` en `variantes` (precio y costo), `precios_sede`, `precios_sede_prenda` y las tres de Liquidación. La
    frase en castellano ya existía para todo candado con ese nombre.
  - `<tabla>_textos_con_tope` en `productos` (nombre 80, descripción 500), `marcas`, `categorias`, `colores` y `familias` (80; una migración vieja, `20260927200000`, escribe un nombre de categoría de 73
    letras si se vuelve a pegar).
    En producción, lo más largo guardado mide 38, 128, 43, 22, 20 y 25 (2026-10-14), y ninguna fila tiene un monto no finito.
  - Cada candado nace `not valid` y se valida si nada viejo lo viola. En las columnas con precisión (`numeric(12,2)`) el infinito ya no
    entraba por el tipo: ahí el candado frena el `NaN`.
- **Web:** los mismos topes con `maxLength`, en una sola definición (`lib/catalogo-topes.ts`) que una prueba compara con la migración.
  La marca nueva se escribe en un combo y se avisa antes de guardar. Editar producto con un id basura da «Esta pantalla no existe».
- **Nuevo producto (lo que faltaba del navegador):** la respuesta perdida ya la resolvía la cola sin conexión con el mismo token, y la
  base no duplica ni el producto ni el stock con el mismo token (probado: 1 producto, 3 unidades, 1 movimiento). Lo que sí podía
  duplicarse eran las **fotos**, que se suben después de cada respuesta buena. Un segundo clic mientras guarda ya no envía otra vez
  (freno síncrono) y «Crear» se apaga mientras guarda. No se reprodujo con fotos reales (riesgo inferido del código).

## Lo que queda para Felipe

> **Actualización 2026-10-15:** las dos preguntas de abajo se resolvieron con la recomendación (Felipe: «aplica tus recomendaciones»), en ADR-0415: tope de S/ 5 000 con aviso de costo sobre precio, y el precio de catálogo sigue en manos de quien ve Productos.


- **¿Un tope para el precio?** Un precio de S/ 1 000 000 000 o un costo mayor que el precio entran sin aviso: un 5990 tipeado por 59.90
  pasaría. Un costo mayor que el precio puede ser legítimo (liquidar), así que es una regla de negocio, no un candado obvio.
- **¿El precio de catálogo es solo del líder?** Una integrante con el módulo Productos cambia el precio de toda la cadena (ADR-0306:
  quien ve el módulo hace lo de adentro). El precio por sede sí está limitado a su tienda (ADR-0370).

## Cómo se pega en producción

Una sola parte, solo `alter table` (sin políticas ni funciones), mejor fuera de horario: cada `alter` toma un candado breve de su tabla y
`variantes` la lee Vender. Idempotente.
