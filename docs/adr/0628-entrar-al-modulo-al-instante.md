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
(`lib/navegacion-al-instante.ts`, `alEntrarDesdeElMenu`). Con eso, el marco (`AppShell`) hace dos cosas sin esperar al servidor:

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
  pidió el menú, que es por donde se entra a un módulo. Llevarlo a otros enlaces es llamar a `alEntrarDesdeElMenu` en su `onClick`.
