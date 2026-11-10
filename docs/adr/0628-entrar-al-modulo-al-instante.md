# ADR-0628 · Entrar al módulo al instante: el clic se ve en el mismo cuadro

- **Fecha:** 2026-11-07 · **Estado:** construido en la rama `claude/entrar-al-modulo-al-instante`. Solo web, sin migraciones.
- **Pide:** Felipe: «queda cargando pero no me ingresa al módulo, pareciera que el sistema no responde… si aún no ha cargado que te muestre un
  esqueleto, pero no debería dejarte fuera del módulo; se puede percibir que no detecta el clic y clickearán más veces».
- **Sigue a:** ADR-0623 (cambiar de pantalla ya no enciende el velo del loader: dibuja el esqueleto del `loading.tsx`) y ADR-0149 (el loader).

## El problema, medido en producción con la sesión de Felipe

| Del clic en el menú a… | Caja | Historial | Existencias |
|---|---|---|---|
| El primer cambio en pantalla | ~259 ms | ~252 ms | ~267 ms |
| El módulo | 1,4 s | 0,8 s | 3,0 s |

- **Los primeros ~250 ms no pasaba nada.** Next espera la primera respuesta del servidor para montar el `loading.tsx`, y en esos ~250 ms no
  cambiaban ni la pantalla ni la fila del menú.
- **Después venía un esqueleto que no decía a dónde se entraba**, hasta que el módulo llegaba.
- **Sin una señal en el mismo cuadro, el clic parece perdido** y se vuelve a tocar.

## Decisión

El clic en una fila del menú, en el logo o en una pantalla del buscador global anota el **destino** en ese mismo instante
(`lib/navegacion-al-instante.ts`, `entrarAlInstante`, antes `alEntrarDesdeElMenu`). Con eso, el marco (`AppShell`) hace dos cosas sin esperar al servidor:

1. **El menú marca la fila de destino**, y su gota va hacia ella. Se calcula con la ruta que se VE (`rutaVista`), no con la que Next ya confirmó.
2. **El contenido pasa al esqueleto con el nombre del módulo** (`EsqueletoPantalla titulo`, en la letra y la medida del título de la cabecera,
   con «Abriendo …» para el lector de pantalla) y vuelve arriba.

Cuando la ruta cambia, el `loading.tsx` (`EsperaPantalla`) sigue con **el mismo título** hasta que el módulo llega: no cambia de nombre a medio
camino.

**La pantalla anterior queda montada y escondida.** Si la navegación no llega (un error, «atrás» o 15 s, `MS_TOPE_DESTINO`), vuelve tal cual,
con lo que tenía escrito. Nada cambia adónde lleva cada enlace: solo lo que se ve mientras llega.

**Qué no cuenta como entrar a un módulo** (`destinoDelClic`):
- un clic a la misma pantalla, aunque cambien sus parámetros (`?mes=`);
- un clic con ⌘, Ctrl, Mayús o Alt, o con el botón del medio, porque abre otra pestaña;
- un clic que otro manejador ya atajó;
- un enlace a otro sitio.

## Resultado (servidor de la rama, modo desarrollo, la navegación dejada colgada a propósito para mirar el medio)

- **A los ~60 ms del clic:** el esqueleto ya dice «Existencias» o «Resumen», la fila o su grupo («Finanzas», cerrado) queda marcada, la pantalla
  anterior está escondida y la vista arriba.
- **Pasados los 15 s sin respuesta:** vuelve la pantalla anterior.

## Lo que no hace

- **No acelera el módulo.** Existencias sigue tardando lo que tarda (3 s medido); el esqueleto con su nombre hace que esa espera se lea como
  «ya entré», no como «no pasó nada». Bajar esos 3 s es otro trabajo (ADR-0622 y su backlog).
- **Los enlaces dentro de una pantalla** (tarjetas del Inicio, «Ver» en una fila) siguen con el esqueleto del `loading.tsx` a los ~250 ms. Felipe
  pidió el menú, que es por donde se entra a un módulo. Llevarlo a otros enlaces es llamar a `entrarAlInstante` en su `onClick` (act. 2026-11-10: antes `alEntrarDesdeElMenu`).

## Actualización 2026-11-10 · Entrar a un módulo «padre» desde su hija, y Productos con su propio esqueleto

**Pide:** Felipe: «cuando le doy clic a Productos desde otro módulo no me deja ingresar y después de unos segundos recién entra… lo ideal
sería que, si tarda en cargar, se vea el esquema, pero que no dé la sensación de que no entra al dar clic».

**Medido en producción con la sesión de Felipe** (clic real en el menú, cada cambio de pantalla con su tiempo):

| Del clic en «Productos» a… | desde Movimientos | desde Catálogo ▸ Marcas |
|---|---|---|
| El esqueleto con «Productos» | 26 ms | **nunca** |
| La fila del menú marcada | 26 ms | 2,6 s |
| Productos | 3,3 s | 2,6 s (de golpe; hasta entonces seguía Marcas, quieta) |

**Las dos causas.**

1. **El marco daba por llegado el destino en el mismo clic.** `llegoAlDestino` decía «llegó» si la ruta era la del destino *o una hija
   suya*. Entrar a una fila del menú que es PADRE de la pantalla donde estás (Marcas → Productos) cumplía eso antes de navegar: el esqueleto
   se soltaba en el mismo cuadro y la pantalla anterior volvía a la vista. Les pasaba a las 7 filas del menú que tienen hijas en el menú:
   Productos, Existencias (`/inventario`), Punto de Venta (`/vender`), Historial de compras (`/compras`), Fichas (`/clientas`), Resumen de
   Producción (`/produccion`) y Resumen de Tienda web (`/tienda-web`).
2. **Productos no tenía `loading.tsx`.** Al llegar desde una pantalla de su propia carpeta (Catálogo ▸ Marcas, o «Volver» desde una ficha), el
   segmento que cambia vive debajo del `layout` de Productos, que no tenía límite de carga: Next dejaba la pantalla anterior hasta que
   terminaban las 16 lecturas de la lista.

**Decisión.**

- **El marco navega él mismo y suelta el esqueleto cuando Next termina.** El clic de una fila del menú, del logo o del buscador global pasa por
  `entrarAlInstante` (antes `alEntrarDesdeElMenu`): marca el destino, ataja el clic y navega con `router.push` dentro de una transición que
  abre el marco (`useDestinoEnCamino`, `registrarNavegador`). React deja abierta esa transición hasta que monta la pantalla nueva o su
  `loading.tsx`; cuando se cierra, el esqueleto del marco se va. No depende de qué ruta resulte: una hija, un `redirect` que vuelve a la misma
  ruta (Historial de compras sin su módulo cae en su primera pestaña), «Sin acceso». Siguen el tope de 15 s y «atrás».
- **Productos se dibuja en dos tiempos:** su `page.tsx` responde al instante con `<Suspense fallback={<EsperaPantalla />}>` y la lista entra
  cuando están sus datos. Cambiar un filtro o la vista no lo muestra (React deja la lista mientras llega la nueva).

**Descarté** un `productos/loading.tsx`: Next aplica el `loading.tsx` de una carpeta a CADA ranura de su `layout` (lo dice su propio código,
`layout-router.js`), y Productos tiene la ranura `@modal` del historial: abrir el historial de una prenda habría dibujado un esqueleto de
pantalla entera debajo de la lista. **Descarté** también mirar si la ruta «cambió desde el clic»: con un `redirect` de vuelta a la misma
ruta el esqueleto se habría quedado 15 s.

**Se rompe si** una pantalla del menú navega por su cuenta con `router.push` fuera de `entrarAlInstante` y espera ver el esqueleto: no lo verá
(la regla es la de siempre: el esqueleto instantáneo es del menú, del logo y del buscador global). Y si Next dejara de abrir su navegación
dentro de la misma transición de React (`sequential-router-queue.js`, `startTransition` síncrono dentro del clic), el esqueleto se iría
recién a los 15 s: lo vería cualquiera al primer clic.

**Verificado** en local (modo desarrollo, clic real en el menú): Marcas → Productos, esqueleto «Productos» y fila marcada a los 98 ms, la
lista a los 5 s (con la compilación de la primera visita); Movimientos → Existencias, esqueleto a los 134 ms y Existencias a los 4,1 s;
«Grilla → Tabla» en Productos sin esqueleto; el historial de una prenda abre en su hoja sobre la lista, sin esqueleto.
