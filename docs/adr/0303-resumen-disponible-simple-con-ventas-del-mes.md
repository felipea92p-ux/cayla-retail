# ADR-0303 · «Resumen disponible» se lee de un vistazo: prendas por categoría en almacén y piso, y lo vendido en el mes

- **Fecha:** 2026-10-01 · **Estado:** construido en la rama `claude/resumen-disponible-simple`. Solo web: **sin migración y sin tocar producción**.
- **Pedido:** Felipe, 2026-10-01, con captura de «Cómo se mueve el stock»: rediseñar lo que abre «Resumen disponible» para que sea **útil,
  básico, moderno, directo, simple y entendible por alguien no técnico**: qué productos tienen más stock, cuáles no han bajado al piso, cuáles
  se venden más rápido, una tabla de prendas por categoría en almacén y en piso, **sin cobertura ni «para cuántos días alcanza»**, con lo
  vendido por categoría y **ese número en cero cada día 1 del mes**.
- **Reemplaza:** la ventana que se hizo con «Prioridades de hoy» (2026-09-29, `ResumenComercialOverlay`: 7 días, cobertura, «sale rápido»,
  «sin ventas esta semana»). **Complementa:** ADR-0237 (Existencias por prenda: prenda = modelo + color), ADR-0136 (movimiento de modales).

## Qué había

La ventana respondía «¿para cuántos días alcanza?» con una proyección (stock ÷ ritmo de 7 días) que una tienda con un mes de historia no puede
sostener, y mezclaba tres ideas (ritmo, cobertura, valor a precio de venta) que quien atiende en tienda no lee de corrido. Y no decía lo más
básico: cuántas prendas hay de cada categoría y dónde están.

## Decidí

DECIDÍ: la ventana muestra **solo lo que se cuenta**, en este orden: tres cifras (Hay en la tienda con su piso/almacén; Vendidas en el mes;
Esperando en el almacén), la tabla **Por categoría** (Almacén · Piso · Vendidas, con barra de piso/almacén y fila de Total), «Lo que más se
vende», «De lo que más hay» y «Esperando en el almacén» (hasta 5 prendas cada una, «y N más» si hay más).

1. **«No han bajado al piso»** = una prenda (modelo + color) con stock libre en el almacén y **ninguna** en el piso. Una talla suelta sin
   colgar no cuenta: la Negra con 1 en el piso ya la ve la clienta.
2. **El mes arranca el día 1, en hora de Lima.** La lectura es del día 1 a hoy (`mesEnCurso`), no «los últimos 30 días»: el día 1 a las
   00:00 la ventana ya es solo ese día y el contador vuelve a cero sin job ni columna que reiniciar. El servidor decide el mes y lo manda en la
   respuesta, así que el texto «desde el 1 de octubre» es el mismo día con que se contó.
3. **Lo que hay se ve al instante; lo vendido se lee al abrir.** El stock sale de lo que el panel ya tiene cargado; las ventas del mes son una
   lectura de toda la sede (~1.200 tallas) que se pide por `GET /api/existencias/ventas-del-mes` solo cuando alguien abre la ventana, y viaja
   recortada a las tallas con ventas netas. Un GET a `/api` no abre el loader global (`clasificarPeticion`): mirar un resumen no tapa la pantalla.
4. **Sin cobertura, sin valor a precio de venta.** Se ve lo que hay y lo que se vendió, nada proyectado. Se quita el «valor a precio de
   venta» que veían solo los líderes: no estaba en el pedido y era el tercer concepto que enredaba la lectura.
5. **Se mide lo libre** (sin lo apartado para clientas), las mismas cifras de la tarjeta y de las tarjetas por prenda. Donde no se separa piso y
   almacén (Taller) la tabla es «Hay · Vendidas» y no hay «Esperando».

## Descarté

DESCARTÉ: **leer las ventas del mes en cada visita a Existencias** (como los 7 días del Taller) porque suma una tercera lectura pesada a una
pantalla que se abre todo el día, para algo que se mira de vez en cuando.
DESCARTÉ: **una ventana móvil «últimos 30 días»** porque no vuelve a cero el día 1 y «este mes» es como la tienda cuenta las ventas.
DESCARTÉ: **una server action para leer las ventas** porque el loader global la trata como «guardado» y bloquearía la pantalla mientras se mira.
DESCARTÉ: **una función SQL nueva por categoría** porque `fn_resumen_variantes_json` ya trae ventas, devoluciones y categoría por talla; sumar
en la web 1.200 filas cuesta menos que una migración a producción.

## Se rompe si

SE ROMPE SI **el servidor y la tienda no están en el mismo día**: se usa `hoyEnLima`, no UTC; con UTC, a las 7 de la noche de Lima del último día
del mes ya sería día 1 y el contador volvería a cero 5 horas antes de tiempo. Lo cubre `mesEnCursoDe` en `existencias-resumen.test.ts`.
SE ROMPE SI **una categoría se renombra o una prenda queda sin categoría**: entra como «Sin categoría» y se ve, no desaparece.
SE ROMPE SI **la lectura de ventas falla**: la ventana dice «No pudimos leerlas», con «Reintentar», y todo lo del stock se ve igual; la tabla
muestra «—» y no un cero que parezca «no se vendió nada».

## Cómo se verificó

- Pruebas: `lib/existencias-resumen.test.ts` (20): mes en curso y reinicio el día 1, recorte de ventas, stock por categoría, lo que más hay,
  esperando en el almacén, apartadas, tallas, sin categoría, Taller, ventas y tabla.
- Navegador (localhost:3010, Tienda Trujillo, datos locales): la ventana abre con 73 prendas (6 piso · 67 almacén), 23 esperando en 3 prendas y
  **0 vendidas el día 1**; con ventas simuladas en el navegador (14 vendidas) la tabla, el total y «Lo que más se vende» cuadran; con la lectura
  fallando se ve «No pudimos leerlas» y «Reintentar» la recupera.
- **No probado:** la ventana en el Taller (sin piso/almacén; cubierto solo por prueba de lógica), ni en celular (fuera de este pedido).
