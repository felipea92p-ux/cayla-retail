# ADR-0362 · Guías interactivas con máscara: una demo por pantalla, siempre al día

- **Fecha:** 2026-10-07 · **Estado:** construido y probado en local; piloto en Ventas (Punto de Venta, Apartados, Historial,
  Comprobantes). Migración `20261007180000_guias_vistas.sql` aplicada en local y **en producción el 2026-10-07** (por orden de Felipe).
- **Pedido:** Felipe, 2026-10-07: «guías interactivas para cada módulo que tengan efecto de foto o máscara de oscurecimiento, que te
  vayan haciendo una demo en el sistema y explicando cada funcionalidad y para qué sirve», hechas «de la mejor manera posible para cada
  una de las vistas», y que **cada vez que se modifique un módulo o se cambie una vista, también cambie la guía**, para que esté siempre
  al día.
- **Complementa:** ADR-0284 (guía de foco: qué falta en un formulario — esta es la otra cara: qué es cada cosa), ADR-0350 (`/formidable`:
  se entiende en 5 segundos), ADR-0136 (movimiento), ADR-0169 y ADR-0336 (solo tokens, modo oscuro), ADR-0149 (loader único), ADR-0358
  (una función, una pieza), ADR-0306 (un módulo es una entrada del menú).

## Decisiones de Felipe (2026-10-07, preguntadas antes de construir)

1. **Hasta dónde llega la demo: piloto automático sin guardar.** La guía abre modales, cambia de pestaña, escribe ejemplos y elige; nunca
   pulsa Guardar, Cobrar, Confirmar ni nada que llegue a la base. El último paso que guarda se explica con la pieza encendida, sin tocarla.
   Descartadas: «solo señalar» (no es una demo) y «demo completa en datos de prueba» (datos de juguete conviviendo con los reales).
2. **Cuándo aparece: se ofrece una vez por persona y por pantalla**, la primera vez que entra, y se puede rechazar. Para repetirla,
   **Mi perfil ▸ «Demo»**, que deja elegir el módulo o el submódulo.
3. **Candado de «siempre al día»: por controles.** El CI falla si aparece, desaparece o cambia de nombre un botón, un campo o una pestaña
   en una pantalla con guía, hasta que alguien revisa la guía. Un cambio de estilo no la molesta. Descartados: «por archivo» (molesta en
   cada ajuste de estilo) y «solo anclas» (una función nueva podía quedar sin explicar).
4. **Piloto: Ventas**, porque es lo que más usa una colaboradora nueva y se prueba también a 375 px.

## Lo que decidí yo (técnico)

- **Motor propio, sin librería de tours** (`components/guias/GuiaInteractiva.tsx`). El velo, la tarjeta y el movimiento tienen que salir
  de los tokens y moverse como el resto del ERP. Además, la regla «nunca guardar» tiene que vivir dentro del motor. Una librería resolvía
  la máscara y nada más. Son unas 350 líneas.
- **La máscara es una caja transparente con una sombra de 200vmax** en `--color-sombra` (nunca `tinta`: en oscuro aclararía), del 62 %
  en claro y del 74 % en oscuro. Se desliza con `transform` y cambia de tamaño con `width/height`, en 420 ms con `--ease-cayla`, sin
  rebote ni bucle. Con `prefers-reduced-motion` pasa de un salto. Va en la capa 55: sobre los modales (50), bajo el loader (60) y los
  avisos (100). Una pantalla con un modal abierto se explica igual.
- **Cada paso se ancla a un `data-guia`**, nunca a una clase de estilo ni a un texto: el estilo y los textos cambian sin avisar.
- **«Nunca guardar» en dos capas.**
  1. **En vivo**, `motivoParaNoTocar` (lógica pura, con su prueba) se niega a tocar:
     - un `submit`, o un botón sin `type` dentro de un form;
     - un archivo;
     - un enlace a otra ruta o fuera del ERP;
     - cualquier control cuyo texto lleve un verbo que escribe (cobrar, guardar, apartar, agregar, quitar, abrir/cerrar caja… lista
       ancha a propósito).

     Una pestaña sí se puede tocar aunque se llame «Apartar»: se reconoce por `role="tab"` o por `aria-current`/`aria-selected`.
  2. **En la red**, el recorredor falla si durante la demo sale una escritura, salvo `marcar_guia_vista`.
- **El ejemplo que escribe el piloto sale de la pantalla** (`{ palabraDe: ancla }`: la primera palabra de la primera prenda visible),
  no inventado: siempre encuentra algo que existe en esa tienda (ADR-0290).
- **La tarjeta no se queda con el foco.** Lo toma solo al empezar. Si se lo quitara al buscador, su lista de resultados se cerraría
  justo cuando se la explica. El teclado (← → Enter Esc) se escucha en la captura de `window`, antes que Radix, para que Esc salga de la
  guía y no cierre el modal de la demo. Los clics sobre la capa se cortan en la propia capa, para que el modal de abajo no los tome por
  un «clic afuera».
- **«Ya se la ofrecí» en la base, no en el navegador.** En la tienda varias personas usan el mismo Mac: recordado por aparato, la
  segunda nunca vería la oferta. Va en `retail.guias_vistas (quien, guia, ofrecida_en, completada_en)`, con RLS encendido sin políticas
  y dos funciones `security definer`.
  - **Quién es la persona:** `fn_actor_persona_id(false)` (la persona de la sesión, o la responsable de turno que mande una terminal).
    Si no se sabe (una terminal sin responsable), la cuenta.
  - **Por qué no exige responsable:** no es una operación del negocio, no mueve dinero ni stock ni firma nada. Es la única excepción a
    «toda función que guarda firma con `fn_actor_persona_id(true)`», y lo es a propósito.
  - **Si la base no responde** o la migración no está, se recuerda en el navegador y la demo no se cae (principio 9).
  - Las dos peticiones llevan `x-espera: no`: anotar una oferta no abre el loader.
- **La huella de controles** (`guias/escaner.mjs`, definición única) lista los controles que dibujan los archivos de la pantalla: botón,
  enlace, campo, combo, pestaña, `Boton`, `CampoTexto`…
  - **Qué archivos cuentan:** la `page.tsx`, sus `layout.tsx` y los componentes que se importan **y se dibujan** como `<Componente>`.
  - **Qué no cuenta:** un `import { money }` no arrastra el punto de venta entero, las piezas del sistema (`components/ui`, el combo
    Responsable…) no cuentan, y los comentarios se ignoran.
  - **Cómo se nombra cada control,** del dato más estable al menos: su ancla, su `aria-label`, su etiqueta, su texto.
  - **Dónde se guarda:** `lib/guias/huellas/<id>.json`, que no se edita a mano. Si no coincide con el código, `lib/guias.test.ts` dice
    qué nació (+) y qué se fue (−), en qué archivo, y cómo seguir.

## Lo que se construyó

| Pieza | Archivo |
|---|---|
| Vocabulario y reglas puras (con prueba) | `apps/web/lib/guias/tipos.ts`, `reglas.ts`, `reglas.test.ts` |
| Motor y piloto | `apps/web/components/guias/GuiaInteractiva.tsx`, `piloto.ts`, `app/estilos/guias.css` |
| Arranque (oferta, `?demo=1`, evento) | `apps/web/components/guias/MotorGuias.tsx`, montado en `AppShell` |
| «Demo» en Mi perfil | `components/PerfilModal.tsx` → `components/guias/ElegirDemoModal.tsx` (las filas del lateral de esa cuenta; lo sin guía, «Pronto») |
| «Ya se la ofrecí» | `supabase/migrations/20261007180000_guias_vistas.sql`, `components/guias/vistas.ts` |
| Guías de Ventas | `apps/web/lib/guias/pantallas/vender.ts` (Punto de Venta 21 pasos, Apartados 12, Historial 13, Comprobantes 7) |
| Tablero | `apps/web/lib/guias/registro.ts`: 4 aplicadas, 9 no aplican, **78 pendientes** (`PENDIENTES_HOY`, solo baja) |
| Candado del CI | `apps/web/lib/guias.test.ts` + `apps/web/guias/escaner.mjs` + `lib/guias/huellas/` |
| Aceptar huella / recorrer | `pnpm --filter web guias:huella <id>` · `pnpm --filter web guias:recorrer` |
| Skill | `.claude/skills/guia/SKILL.md` (`/guia`) |

`Pestanas` (`components/ui/`) acepta un ancla por fila (`guia`) y por pestaña (`items[].guia`): la usará cualquier módulo.

## Verificación (2026-10-07, ERP local, `next dev` de esta rama)

- Navegador integrado, cuenta Admin, oscuro: oferta de la primera vez → «Ver la demo» → recorrido completo de Punto de Venta, con Atrás.
  Al terminar, el buscador quedó vacío, no quedó ningún modal abierto y `retail.guias_vistas` guardó la fila a nombre de Felipe con
  `completada_en`. Mi perfil ▸ Demo ▸ Punto de Venta la repite. La consola quedó sin errores.
- `guias:recorrer` con las cuatro guías:
  - Admin, 1440 × 900, claro: ✓, sin una sola escritura.
  - A 375 × 812 en oscuro: ✓ Punto de Venta (cuenta integrante), ✓ Apartados y ✓ Historial (cuenta admin).
  - Capturas miradas una por una.
- El candado: un `<button>Imprimir lista</button>` agregado a propósito en Apartados hizo fallar la prueba, con su archivo y el comando
  para seguir. Se quitó.

## Lo que queda abierto

- ~~Producción~~ **Hecho el 2026-10-07** (Felipe: «pega la migración en producción»). Se pegó el archivo tal cual, por el MCP, en una
  sola transacción. Quedó registrada con la versión del archivo (`20261007180000`) en `supabase_migrations.schema_migrations`.
  Comprobado después:
  - la tabla existe, con RLS encendido y sin políticas;
  - las tres funciones son `security definer`;
  - `anon` no las puede llamar y `authenticated` no lee la tabla directo.
- ~~Las terminales no tienen Mi perfil~~ **Hecho el 2026-10-07** (Felipe: «aplica lo de las terminales en la cabecera»). Una terminal ve
  **«Demo»** en la cabecera, en el lugar de «Actividad» (que una terminal nunca ve) y con su misma forma
  (`components/guias/BotonDemo.tsx`). Abre el mismo selector que el perfil. Una cuenta de persona no lo ve: lo tiene en Mi perfil.
  Verificado con la terminal de ventas de Lima, en escritorio y a 375 px.
- **Las 78 pantallas pendientes,** módulo por módulo con `/guia <módulo>`, cada una con el OK de Felipe.
- El «3 de N» se estima al empezar; si la pantalla tiene menos piezas de las previstas (un rol que no ve algo), termina en «14 de 14»
  aunque haya dicho «de 16».

## Actualización 2026-10-07 (d) — el movimiento rico (Felipe: «lo más sofisticado e interactivo posible, con muchas animaciones»)

Al pedir el resto de los módulos, Felipe pidió que el diseño fuera «lo más sofisticado posible y lo más interactivo, amigable, con
muchas animaciones». Es una excepción a ADR-0136 decidida por él, como la vista rápida o los sellos de Movimientos. Se mantiene **sin
rebote** y todo se apaga con `prefers-reduced-motion`.

- **El cursor fantasma.** Antes de que el piloto toque o escriba, una flecha sale del botón «Siguiente» y viaja (700 ms) hasta la
  pieza. Hace «clic» con una onda roja, o se vuelve un cursor de texto que parpadea mientras escribe. Se dibuja en tinta y crema
  *fijas*, así que se lee sobre cualquier fondo en los dos temas. Así se ve DÓNDE pasa cada cosa antes de que pase.
- **La llegada.** El recorte viaja de pieza en pieza; al llegar sale una onda una sola vez, y un halo respira alrededor mientras la
  guía espera (señal, como el punto que late en «Vencida»).
- **La tarjeta.** El número del paso gira y crece al llegar. Título, texto y nota entran en cascada (60 ms), desde el lado de la pieza
  que explican. El tramo nuevo de la línea de avance se llena de izquierda a derecha. En el primer paso se muestran los atajos ← → Esc.
- **El cierre.** Un visto verde que se dibuja y ocho chispas que salen una vez.
- **La oferta.** Una luz cruza «Ver la demo» una vez al aparecer.

Se corrigió de paso un defecto: en los pasos sin pieza (bienvenida y cierre), el recorte de 0 × 0 px no dibujaba la sombra en Chrome y
la pantalla quedaba sin velo. Ahora es un punto de 2 px.
