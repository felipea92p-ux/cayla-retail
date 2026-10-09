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

## Actualización 2026-10-07 (e) — todo el ERP (Felipe: «sigue con los demás módulos hasta que termines con todos»)

Con el OK expreso de Felipe para correr toda la noche, se recorrió el ERP módulo por módulo. Cada tramo lo hizo un agente siguiendo la
skill `/guia`, UNO A LA VEZ en esta misma rama: todos tocan el registro y el mismo servidor de desarrollo. Antes de lanzar el siguiente
tramo revisé cada informe y miré sus capturas.

| Tramo | Guías | Archivo |
|---|---:|---|
| Ventas: Punto de Venta, Apartados, Historial, Comprobantes (piloto) | 4 | `pantallas/vender.ts` |
| Ventas: Emitidos, Por enviar, Proformas, Series, Caja, Historial de caja, Cambios, Devoluciones | 8 | `pantallas/ventas-posventa.ts` |
| Inventario: Existencias, Bajar, Cuadrar, Frescura, Movimientos, Por regularizar, Análisis, Pedidos, Conteo (4), Traslados (3), Recibir | 16 | `pantallas/inventario.ts` |
| Catálogo: Productos (con la vista rápida y su Historial), Editar, Historial, Atributos, Categorías, Familias, Marcas, Nuevo | 8 | `pantallas/catalogo.ts` |
| Compras: Facturas, factura, Notas de crédito, Registrar, Mi parte, Plan, Por pagar, Proveedores y su ficha | 9 | `pantallas/compras.ts` |
| Finanzas: Resumen, Gastos, Cuentas y dinero (4), Reportes (6), Impuestos, Cierre | 14 | `pantallas/finanzas.ts` |
| Producción (el Taller) | 9 | `pantallas/produccion.ts` |
| Inicio (Observatorio, tienda, almacén), Actividad, Buscar, Colaboradores, Comercial (2), Configuración, Global, Rendimiento | 9 | `pantallas/general.ts` |
| Clientes: Fichas y Avisos del club | 2 | `pantallas/clientes.ts` |

**Total: 79 guías, 12 `no-aplica`, `PENDIENTES_HOY = 0`.** Las piezas comunes ganaron una prop opcional `guia` que solo pone el
`data-guia`: `Pestanas`, `SegmentoDeslizante`, `SegmentoEnlaces`, el kit de Finanzas, `SeccionFicha`, el kit de atributos, `ChipEstado`
y el `Segmento` del Observatorio. Fuera de eso, solo se agregaron atributos `data-guia` y algún envoltorio neutro: no cambió cómo se ve
ni cómo funciona ninguna pantalla.

**Defectos del motor encontrados en el camino, ya corregidos:**
1. **`?demo=1` en una ruta interceptada** (el Historial de un producto). El `router.replace` hacía que Next respondiera 500 y
   recargara la página. Ahora la URL se limpia con `history.replaceState`, y el recorredor falla si una guía recorre menos de 2 pasos.
2. **El velo no se pintaba en Finanzas** (y a veces en otras pantallas). Chrome no repintaba la sombra gigante del recorte mientras
   estaba animada. Ahora la sombra es de 100vmax y quieta, el recorte se mueve con `left/top` y el velo entra con el fundido de la capa.
3. **El recorredor:**
   - espera a que el piloto termine antes de avanzar (cortaba las acciones a los 2,3 s);
   - acepta URLs de ejemplo con parámetros (`/buscar?q=…`);
   - informa con ⚠ las pantallas que la base local no puede mostrar (`sinDatos` en `ejemplos.mjs`) en vez de darlas por rotas.

**Sin verificar en el navegador, por falta de datos locales** (escritas y con sus anclas comprobadas por la prueba; no se crearon datos):
- Revisar y Confirmar conteo, y la cara «contar» de un conteo: no hay ningún conteo abierto.
- Compras ▸ Mi parte de la factura: ninguna compra repartida entre tiendas, ni una cuenta que no sea líder con su parte.
- Las piezas de Producción que dependen de órdenes, insumos o facturas: el Taller local está vacío.
- Inicio de Almacén: no hay una cuenta de prueba parada en un almacén.
- Pedidos no atendidos con pedidos, y Análisis con prendas (la base local no las lee).

**Un incidente durante la obra.** Un agente cortó un comando colgado con `pkill -f cat`, y eso cerró Docker Desktop unos 3 minutos: la
base local compartida quedó caída en esa ventana. Se levantó de nuevo y se comprobó que la base estaba sana. No hubo escrituras. Desde
entonces las instrucciones de cada agente prohíben `pkill`, `killall` y `kill` por patrón.

## Actualización 2026-10-08 — una corrección honesta sobre el «velo que no se pintaba»

El arreglo 2 de la actualización (e) partió de un diagnóstico equivocado. En Finanzas el velo **sí estaba**: medido después píxel a
píxel, fuera del recorte la pantalla da ~100 (en claro), contra ~240 sin velo. Las capturas vistas en miniatura parecían claras y se
leyeron mal; un agente repitió la misma lectura con el cajón de Existencias, y también estaba oscurecido. El cambio que se hizo entonces
no hace daño, y el velo quedó además en un **SVG con un agujero de relleno par-impar**, que el motor lleva de pieza en pieza cuadro a
cuadro: es más simple que la sombra gigante de una caja y no depende de cómo Chrome pinte las capas. Desde ahora, un «sin velo» se
comprueba midiendo un píxel, no a ojo.

En la segunda vuelta («sigue con todos los módulos del sistema entero», Felipe 2026-10-08) cada tramo mide la cobertura en vivo
(`guias:recorrer --cobertura`: qué controles de la pantalla quedaron dentro de algún recorte) y profundiza hasta que lo que queda sin
encender sea solo repetición. También recorre las vistas por parámetro de la misma ruta y abre los modales que no guardan. Además:
- **La regla se endureció:** «Anotar que no había» guardaba y no estaba prohibido; se sumaron 15 verbos (anotar, pedir, unir,
  reintentar…).
- **`aria-haspopup`:** un botón que solo abre una ventana lo declara y se puede tocar.
- **`prepararSoloAlAvanzar`:** un `preparar` que no corre al volver con ←.
- **El recorredor:** espera el `demostrar` y falla si la guía pide un toque que el motor niega.

### Resultado de la segunda vuelta (2026-10-08/09)

Siete tramos, uno a la vez, con la cobertura medida en vivo antes y después. Lo que queda sin encender es repetición (la talla 2 de
una tarjeta, la fila 2 de una lista) o un botón que guarda y que solo se explica.

| Tramo | Lo más importante que sumó |
|---|---|
| Ventas | Personalizado, Atajos y Filtros del Historial; el paso 3 de un cambio; los filtros del historial de cierres; botones de cada comprobante |
| Inventario | Filtros y vistas de Existencias (tabla, por talla), toda la pestaña Pérdidas, «Ver todo lo recibido», el detalle de Frescura |
| Catálogo | Las seis pestañas de Atributos (con la ficha de un color y de un tejido, Temporadas y sus vistas), los modales de Editar producto |
| Compras | Las ventanas de la factura (faltante, reasignar, pago), el alta de proveedor, Registrar nota, la ventana de pago de Por pagar |
| Finanzas | Registrar gasto y movimiento completos, los deslizadores de Escenarios, el mes en curso de Impuestos, el Balance por tienda |
| Producción | Nueva orden con ejemplo y costo por prenda en vivo, medios de pago al contado, estados vacíos que dicen qué hacer primero |
| General | Las cuatro caras de Inicio (Observatorio, tienda, almacén, rol corto), terminales en Colaboradores, ventanas de Configuración |

**Corrida completa al cierre:** 76 ✓, 0 rotas, 3 ⚠ sin datos locales (Revisar y Confirmar conteo, Mi parte de la factura).

**El motor ganó en el camino:**
- **Un `?demo=1` que vuelve por un enlace no reinicia la guía.**
- **Toque «si está»:** `{ tipo: "clic", ancla, siEsta: true }` no espera ni avisa si la pieza no está.
- **El escáner lee anclas dentro de `guia={…}`.**
- **El recorredor mide la cobertura** (`--cobertura`).

## Actualización 2026-10-09 — se ofrece sola solo en las entradas del menú (Felipe)

Con 79 guías, «una vez por persona y por pantalla» eran hasta 79 ofertas por persona. Felipe tomó la recomendación: la demo se
**ofrece sola solo en las pantallas que son una entrada del menú de esa persona** (`esEntradaDelMenu`, con su prueba; las rutas
salen del mismo `menuPara` del lateral). Una pantalla interna (una factura, editar un producto, un conteo, Series) no se ofrece sola.
Su demo queda a un toque: el selector «Demo» muestra arriba **«Esta pantalla»** cuando la pantalla abierta tiene guía. Verificado con
la terminal de ventas en Comprobantes ▸ Series: sin oferta, y «Esta pantalla» arranca su guía.

Pendiente de la tienda (Felipe tomó la recomendación del punto 2): las pantallas sin datos locales (Revisar y Confirmar conteo, Mi
parte de la factura, Producción con datos, Inicio de Almacén) se verifican después de fusionar, con datos reales, repitiendo su demo
desde «Demo ▸ Esta pantalla».
