# Entrada al ERP: el colibrí se abre (maqueta, 2026-10-13)

**Idea de Felipe:** al iniciar sesión, el colibrí del login se coloca en el centro de la pantalla y se agranda hasta que, en el
centro, aparece la pantalla de después del login.

**No está en el ERP.** Es una página suelta (`index.html`) para mirar y elegir; no toca `apps/web`. Las cifras y nombres de
«Inicio» son inventados. Sirve con `maqueta-referentes` (`.claude/launch.json`) en `http://localhost:3031/login-entrada-2026-10/`.

## Cómo se mira

- Toca **Entrar** (o **↻ Repetir**). Abajo hay una línea de tiempo: arrástrala para detenerte en cualquier instante.
- `?v=B` (por defecto): la ventana **tiene la forma del colibrí**. `?v=A`: la ventana es un círculo dentro del ala.
- `&tema=oscuro` o el botón «Oscuro». `?t=1900` deja la maqueta quieta en ese milisegundo (para capturas).

## La coreografía (3,8 s, una sola vez)

| ms | Qué pasa |
|---|---|
| 0–300 | «Entrar» se confirma; el formulario se apaga y el fondo se oscurece (como la mitad izquierda del login). |
| 250–1150 | El colibrí, aleteando, cruza en arco hasta el **centro** de la pantalla y crece un poco. |
| 1000–1550 | En el centro se abre una ventana **con su forma**: dentro, Inicio entero y chiquito. |
| 1450–3050 | El colibrí se agranda (×20) hasta salirse de la pantalla; sus trazos barren hacia afuera, Inicio crece con él y las cifras cuentan. |
| 3050–3800 | Llegas a Inicio. Los aleteos se apagaron en la pose del logo. |

Sin rebote ni bucle (ADR-0136), con la curva `suave` del vuelo del login; con `prefers-reduced-motion` salta directo a Inicio.

## Para pasarla al ERP (si Felipe la aprueba) — decisiones que quedan

1. **La ventana tiene que mostrar la pantalla real, no un dibujo.** Se haría con una capa en `app/layout.tsx` (como `EsperaGlobal`,
   ADR-0149) que sobrevive a `router.push("/")`: un velo oscuro con un agujero con forma de colibrí (máscara) que crece y deja ver
   la pantalla de verdad que está debajo. Así no se duplica Inicio.
2. **Qué pantalla aparece.** Depende del rol: una terminal o una vendedora aterriza en Vender y el Admin en el Observatorio
   (`aterrizajeDe`). La ventana muestra la que toque.
3. **Si la pantalla tarda más que el vuelo**, el colibrí espera flotando en el centro (la parte 1150–1450 se alarga) en vez de abrir
   una ventana vacía. Mientras vuela no se muestra el loader global (el vuelo reemplaza a «Entrando…»).
4. **Cuándo se repite.** Solo al iniciar sesión (no al recargar ni al cambiar de sede). Mientras vuela se puede hacer clic para saltarlo.
5. Movimiento nuevo: hay que sumarlo a la lista de excepciones de «Movimiento y modales» (CLAUDE.md / ADR-0136 act.) y a
   `tema/escenarios/registro.mjs` para el modo oscuro.

## La salida («Salir»), pedida por Felipe — tres versiones para elegir mirando (eligió la B, 2026-10-13; ya está en el ERP)

En Inicio, arriba a la derecha, está **Salir**; el selector de abajo cambia el efecto (`?s=A|B|C`, o `?modo=salir` para arrancar dentro de Inicio).

| | Qué se ve | Dura |
|---|---|---|
| **A · Espejo** | El vuelo de entrada exactamente al revés: la pantalla se encoge dentro del colibrí, la ventana se cierra, el colibrí se achica y vuela de vuelta a su lugar mientras vuelve el login. | 3,8 s |
| **B · Espejo rápido** | Lo mismo que A, a mayor velocidad. | 2,2 s |
| **C · Cortina y vuelo** | Cae una cortina oscura sobre Inicio, el colibrí asoma en el centro y vuela de vuelta a su lugar con el login apareciendo. Sin ventana ni agrandar. | 1,5 s |

**Para el ERP real (si se elige):** el cierre de sesión es `LogoutButton` → `signOut` → `/login`. La capa de la entrada (`EntradaColibri`) se reutilizaría: A y B cierran el agujero sobre la pantalla real que se está dejando y recién ahí navegan a `/login`, escondido bajo el velo
oscuro; C solo oscurece, hace volar al ave y navega. Igual que la entrada: una vez, sin rebote, sin empezar con `prefers-reduced-motion`, y el aviso de «otra pestaña» (PR #1045) tiene que seguir sin salir.

## El saludo (pedido de Felipe, 2026-10-13) — eligió el texto corto y el diseño B; ya está en el ERP

Mientras el colibrí flota en el centro, un saludo con el nombre de la persona o de la terminal: al **entrar**, «Bienvenido(a), Camila»; al **salir**, «Hasta luego, Camila» (el texto corto que pidió Felipe).
Se elige con los selectores de abajo (o `?sd=A|B&cuenta=persona|terminal`):

- **Diseño A · una línea:** frase en serif cursiva, el nombre en rojo, una sola línea bajo el colibrí.
- **Diseño B · dos líneas:** la frase pequeña en versalitas y el nombre grande debajo (más de «marca»).
- **Cuenta:** una persona se saluda por su nombre de pila (Camila); una terminal, por el nombre completo del aparato («Terminal Ventas TRU»).

La maqueta pone una pausa de 0,45 s con el colibrí quieto en el centro para que alcance a leerse; en el ERP real esa pausa es lo que tarde en cargar la pantalla (con ese mínimo).
