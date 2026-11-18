# Tráfico (maqueta desde cero) — Tienda web ▸ Tráfico

**Qué es:** tres direcciones para un submódulo «Tráfico» dentro de «Tienda web»: cuánta gente entra a la tienda online, qué mira, por dónde
llega, desde qué ciudad, a qué hora y dónde se va. Felipe lo pidió «sofisticado, elegante y full animaciones». Es **solo HTML, CSS y JS
estático**: no toca `apps/web`, `apps/tienda`, `supabase/` ni `docs/adr/`. Se hizo desde cero: no se abrió ni se reutilizó nada de
`docs/maquetas/trafico-2026-10/`.

**Cómo verla:** sirve esta carpeta con cualquier servidor estático y abre `index.html` (con `file://` también abre). La barra negra de arriba
**es de la maqueta, no del diseño**: cambia de dirección (A · B · C), de tema (claro / oscuro) y de ancho (1024 · 1440 · 1920), y repite la
entrada con «Ver la entrada otra vez». Todo vive en la URL (`?d=b&tema=oscuro&ancho=1920&p=aniv&camino=tiktok&vista=tabla`): dos personas con
el mismo enlace ven lo mismo. `?quieto` pone todo en su lugar sin movimiento; `?real` dibuja el marco a tamaño real (sin escalar) para
revisarlo de cerca.

## Las seis preguntas, sin bajar la pantalla a 1440 × 900

Cada dirección responde las seis a la vista (medido: la última tarjeta termina a 883 px como máximo, en los tres períodos):

| Pregunta | A · El hilo | B · De cada 100 | C · La vitrina |
|---|---|---|---|
| ¿Cuánta gente entró? ¿más o menos? | la cifra de la cabecera + «Entraron» al inicio del hilo | la cifra de la cabecera + la primera grilla (100 de 100) | la cifra de la cabecera + el primer paso de la tira |
| ¿La prenda más mirada? | el tendedero (las 3 más miradas, colgadas) | «La más mirada», de cada 100 que vieron una prenda | la baldosa grande del mosaico, con su etiqueta |
| ¿Por dónde llegan? | las 7 corrientes que nacen a la izquierda | puntos: de cada 100, cuántos por cada camino | lista con barras, al costado |
| ¿Desde qué ciudad? | hilos con su carrete (▣ = hay tienda) | puntos: de cada 100, cuántos desde cada ciudad | lista con barras, al costado |
| ¿A qué hora? | 24 hilos que cuelgan (el tramo más largo en tinta) | 12 columnas de puntos (tramos de 2 horas) | 24 barras (el tramo pico en tinta) |
| ¿Dónde se atora? | el nudo rojo sobre la cinta + «Aquí se atora» | el pie de la grilla «Aquí se atora» + la frase «de 21 que…, solo 9…» | «Aquí se atora» en la tira del recorrido |

Las tres comparten: **los tres períodos** (7 días, 30 días, Aniversario 1–23 oct), **ver solo a la gente de un camino o de una ciudad** (o de los
dos a la vez; tocar de nuevo o la ✕ del filtro puesto lo quita), **abrir el detalle de una prenda** (el cajón: su recorrido, las tallas y los
colores que eligieron, por dónde llegó, «3 de 21» con ↑ ↓) y la **vista de tabla gemela** (GRÁFICO / TABLA), con los mismos números.

## Las tres direcciones

### A · «El hilo» (`a-hilo.css`, `a-hilo.js`, prefijo `hl-`)
El recorrido es **una cinta**: los siete caminos nacen a la izquierda (lo ancho = la gente), se juntan en «Entraron» y la cinta se adelgaza en
cada paso; lo que se pierde se desprende hacia abajo. Donde menos gente pasa (en proporción) queda **un nudo rojo**. Abajo, tres tiras cortas en
el mismo idioma del hilo: ciudades (hilos con su carrete), horas (hilos que cuelgan) y la más mirada (un tendedero). Se lee **midiendo grosores**.
Al pasar el mouse o el foco por un camino, su corriente se enciende; al tocarlo, la cinta se reacomoda a solo esa gente.

### B · «De cada 100» (`b-cien.css`, `b-cien.js`, prefijo `cc-`)
**Las personas se cuentan.** Seis grillas de 100 figuritas, una por paso: llenas las que siguieron, en contorno las que se fueron en ese paso,
tenues las que se fueron antes. Se lee **contando**: «de 21 que la pusieron en la bolsa, solo 9 separaron». Abajo, cuatro tarjetas que hablan
igual (de cada 100: por dónde, desde dónde, a qué hora, qué prenda). Al pasar por un camino o una ciudad, **se encienden sus personas en las seis
grillas**: se ve hasta dónde llega la gente de TikTok frente a la de WhatsApp sin cambiar de pantalla. Las 100 figuritas no son 100 clientes:
son el recorrido repartido en 100, con filas y columnas cuadradas a la vez (resto mayor en dos sentidos): lo que dice cada pie de grilla y cada
fila es exactamente lo que se ve encendido (probado en los 180 casos de período × filtro).

### C · «La vitrina» (`c-vitrina.css`, `c-vitrina.js`, prefijo `vt-`)
**Las prendas son la pantalla.** Un mosaico (treemap) de las 21 prendas reales: cada baldosa ocupa lo que la miraron (área proporcional; error
medido 0,00007) y va pintada con **los colores que eligieron, en franjas**. De cada una cuelga una etiqueta de papel con su nombre y su cifra; la
más mirada es la baldosa grande. Arriba, el recorrido en una tira fina; al costado, de dónde vienen y a qué hora. Se lee **viendo la prenda**.
Al filtrar, cada baldosa viaja de su lugar viejo al nuevo (una sola transición, FLIP).

## La elegida: C · La vitrina (Felipe, 2026-10-23)

Felipe eligió **C · La vitrina**. Desde ese día la maqueta abre en C (`?d=c`, con ✓ en la barra); A y B se quedan aquí para comparar y no se
siguen. Lo que sigue abierto está en «Lo que decide Felipe».

Por qué la recomendé (el «aquí se atora» de A queda como mejora futura si se extraña): es la única donde el protagonista es lo que CAYLA
vende — la prenda, con su color de verdad — y la respuesta a «¿qué miran?» se ve antes de leer (ley 5 de Formidable). Las otras dos responden
mejor «¿dónde se va la gente?», pero esa pregunta ya la contesta la tira de arriba de C con su veredicto. A es la más bella y la más «full
animación»; B es la más fácil de explicar en voz alta y la mejor para comparar caminos (el resaltado en las seis grillas).

## Piezas comunes (`piezas.js`, `estilos.css`, prefijos `tr-` y `erp-`)

Imitan las del ERP, no las reinventan (CLAUDE.md «Una función, una pieza»):
- **Marco**: el lateral con Tienda web abierta y sus hijas (Resumen, Pedidos, Vitrina, Campañas, Recomendaciones, **Tráfico «Nuevo»**, Conf.
  Tienda) y la cabecera (buscador, Actividad, tema, sede). Solo funcionan Tráfico y el botón del tema; lo demás es dibujo.
- **`EncabezadoPagina`**: sede · fecha · «Tienda web» con el hilo taupe → «Tráfico» en 46 px → frase; a la derecha, la cifra («Entraron a la tienda»,
  el cambio con su flecha **y en palabras**, y el punto verde «Ahora, 9 mirando»).
- **Período** en `pildora-cayla`; **filtro puesto** (`FiltroPuesto`, tinta con su ✕) y **Limpiar filtros** (`BotonLimpiar`, punteado);
  **GRÁFICO / TABLA** como segmento de modo (la caja arena, elegida en papel, versalitas).
- **`Cajon`**: la banda de Compras (marca de 40 px, versalitas, título serif de 24, frase taupe, insignias), el cuerpo que corre, el pie con «Ver en
  la vitrina» (`BotonVer`) y «3 de 21» con ↑ ↓ (también con las flechas del teclado). Esc cierra; el foco vuelve a lo que lo abrió.
- **`Chip`** (verde = más, ámbar = menos, neutro, tinta para «La más mirada»), **`MosaicoPrenda`** (el ícono de su categoría sobre su color, los
  mismos trazos de `lib/icono-categoria-reglas.ts`), **`Tabla`** (cabecera arena, cebra hueso), **«¿Por qué?»** (lo difícil a un toque).

Dos desvíos a propósito, para que Felipe los vea: el **«Ver las 21»** (`EnlaceVer`) va en tinta y no en rojo, porque el rojo de la pantalla se
lo lleva «aquí se atora»; y **la insignia «Nuevo»** del lateral va sobre papel con filo, porque el tinte de pizarra sobre la fila elegida daba 4,42:1.

## Movimiento (ADR-0136 y la excepción de Tienda web, ADR-0430)

Rico, **una sola vez**, sin rebote, con `--ease-cayla`. Lo único que se repite es el **punto verde** de «Ahora, N mirando» (la señal de «está vivo»).
- **A**: el hilo se desenrolla de izquierda a derecha (un `clip-path` sobre el SVG), cada rótulo aparece cuando el hilo pasa y su cifra cuenta, lo
  que se pierde cae, el nudo se ata (trazo que se dibuja) y aparece «Aquí se atora»; abajo, los hilos de ciudad se estiran, los de hora cuelgan
  y las prendas se cuelgan del tendedero.
- **B**: las 100 de la primera grilla aparecen en ola diagonal; en cada grilla siguiente, las que se van llegan llenas y se apagan a contorno, y
  el número cuenta hacia abajo (66 → 33); los puntos se cuentan de izquierda a derecha.
- **C**: las prendas entran en cascada por puesto, sus etiquetas se cuelgan (bajan girando un poco hasta quedar quietas) y una luz cruza la vitrina
  una vez; la tira del recorrido se llena.
- **Un cambio** (período o filtro) no repite la entrada: una sola transición (A la cinta se reacomoda, B solo se mueven las figuritas que cambian de
  estado, C cada baldosa viaja a su lugar nuevo) y las cifras cuentan desde el valor anterior.
- **Rendimiento**: Web Animations y transiciones; ningún recálculo de diseño forzado por elemento; las cifras se mueven con una animación «muda»
  (`opacity 1→1`) cuyo avance se lee en un solo `requestAnimationFrame`, así se pausan y adelantan como las demás (`document.getAnimations()`).
  No se anima ningún `font-size` (ni con `cqi`): las medidas que dependen del ancho se toman en px una vez, con JS.
- `prefers-reduced-motion` y `?quieto`: todo puesto, sin transiciones; el punto verde no late.

## Qué es real y qué es de ejemplo

- **Real:** las 21 prendas (nombre, código, categoría y prefijo, precio, tallas y colores con su hex), sacadas de la base local el 2026-10-23
  (`retail.productos` + `variantes` + `categorias` + `colores` + `tallas`). El hex de cada color es **dato**: se pinta con `data-color-dato` y no
  cambia con el tema; la etiqueta de C es papel (`.papel-fijo`) y no se oscurece.
- **De ejemplo:** todas las visitas. Se inventan persona por persona con una **semilla fija** (`SEMILLA = 20261023`, mulberry32), del 25 de agosto
  al viernes 23 de octubre a las 4:40 p. m., y **todo se cuenta desde esa misma lista**: por eso, si filtras por Instagram, «entraron» es igual a
  la fila de Instagram, y los caminos suman el total (probado en 1.836 pintadas: 3 anchos × 2 temas × 3 direcciones × 3 períodos × 17 filtros × gráfico/tabla,
  sin un «NaN», un «undefined» ni un desborde). La historia que cuentan los datos: el Aniversario subió el tráfico (92 % más que el
  mismo tramo de setiembre), un video de TikTok subió el **Top Daniela** esta semana (es la más mirada en 7 días; en 30 días y en el Aniversario
  lo es el **Vestido Aurora**), la gente de TikTok se va apenas entra, la de WhatsApp y Google se atora al elegir talla, y en las ciudades sin
  tienda CAYLA casi nadie separa (no hay dónde recoger: el «¿Por qué?» lo dice).
- **Hoy la tienda NO cuenta visitas.** Solo mide su velocidad (LCP, INP, CLS, una visita de cada dos, en el registro de Vercel: ADR-0447). En la
  base sí existen los pedidos (`retail.pedidos_web`: `creado_en` es «separaron» y `entregado_en` es «recogieron»). `retail.cuentas_web_visitas`
  **no** es tráfico: guarda solo cuándo entró una cuenta a «Mi cuenta», para «Novedades para ti».

## Cómo se medirían las visitas (lo que falta para que esto sea real)

1. **Qué se cuenta.** Una persona por día y por aparato (un id anónimo en `localStorage`, sin cookies de terceros ni datos personales), el camino
   (`utm_source` o el `referrer`: Instagram, TikTok, WhatsApp, Google; «Directo» si no hay; «QR en tienda» con un `?utm_source=qr` en las
   etiquetas y carteles), la ciudad (de la IP, en el servidor, **sin guardar la IP**), la hora de Lima y los pasos: ver una prenda, elegir talla,
   ponerla en la bolsa. «Separaron» y «recogieron» ya están en `pedidos_web`.
2. **Dónde.** El mismo camino que eligió ADR-0447 para la velocidad (un envío al cerrar la pestaña) puede llevar estos eventos; pero el registro de
   Vercel guarda 1 día, así que para mirar 30 días hace falta guardarlos: una tabla de eventos en la base (append-only, como `movimientos`) o un
   servicio de analítica. **Es una decisión de Felipe** (costo, privacidad, cuánto tiempo se guarda) y lleva su ADR.
3. **Si no responde** (principio 9): el envío se pierde en silencio y la tienda sigue igual; Tráfico muestra «sin datos de hoy», nunca un cero falso.

## Lo que decide Felipe

1. ~~**Cuál de las tres**~~ — **decidido el 2026-10-23: C · La vitrina.**
2. ~~**El menú.**~~ — **decidido el 2026-10-23: Tráfico es la 7.ª hija de «Tienda web»**, entre Recomendaciones y Conf. Tienda (como en la
   maqueta), con la excepción `tiendaWeb: 7` en `EXCEPCIONES_TOPE_HIJAS` de `apps/web/lib/menu.test.ts` (la misma que ya tiene `compras: 7`).
   Se descartó la pestaña del Resumen: no sería un módulo (ADR-0306) y la vería todo el que ve el Resumen.
3. ~~**El módulo.**~~ — **decidido el 2026-10-23: módulo propio, solo para el líder** (ADR-0161). Al construirlo: migración propia con
   `insert into retail.modulos` (sin `rol_modulos`), su clave en `CLAVES_MODULO`/`MODULOS` (`lib/modulos.ts`), `modulo:` en su nodo de `lib/menu.ts`
   y `exigirModulo` en el `layout.tsx` de su ruta; el líder decide después a qué rol se lo da. Va con su ADR (número reservado con `pnpm reservar adr`).
4. **Cómo se miden las visitas** (punto de arriba): sin eso no hay pantalla real.
5. **Los dos desvíos** de las piezas (el «Ver las 21» en tinta y la insignia «Nuevo» sobre papel).
6. **Sin acción principal (`btn-primario`).** Tráfico es una pantalla de mirar: lo que se hace es filtrar y abrir una prenda. Si Felipe quiere
   una acción («Llevar la más mirada a la vitrina», «Avisar al equipo»), es otra decisión.

## Skills aplicadas

- **dataviz** — forma por el trabajo del dato (flujo en A, conteo en B, área en C; nunca dos ejes); **un tono secuencial** (la tinta, de tenue
  a plena) **y un acento** (el rojo de «aquí se atora»); leyendas en las tres (A: cada camino / los que siguen / los que se van; B: siguió / se fue
  en ese paso / se fue antes; C: tamaño = cuántos la miraron, franjas = colores que eligieron); vista de tabla gemela; globitos que suman pero no
  son la única forma de leer un valor; zonas de mouse de columna entera en las horas. `validate_palette.js --ordinal`: la escala de tres estados
  de B **pasa en claro y en oscuro** (el paso más tenue quedó al 33 % para llegar a 2:1 contra el papel; empezó en 11 % y fallaba) y las
  corrientes de A se subieron al mismo piso. Cifras grandes con números proporcionales; tabulares solo en filas. La cifra grande va en la serif
  de la casa (dataviz pide sans): **manda el ERP** (`TarjetaCifra`, ADR-0169).
- **design:accessibility-review** — contraste medido de cada texto contra su fondo real en claro y oscuro, gráfico y tabla: **0 fallas** (la
  única, «Nuevo», se corrigió); todo se alcanza con Tab en orden lógico, Enter activa, Esc cierra el cajón y devuelve el foco, el foco no sale del
  cajón; nombre accesible en cada control (los caminos y ciudades dicen sus personas y «de cada 100»); estado elegido con ✕ y en el filtro puesto,
  nunca solo con color; SVG con `role="img"` y su resumen; un anuncio `aria-live` dice el resultado de cada filtro; controles de 24 px como mínimo.
- **design:ux-copy** — «tú», «de cada 100» (nunca «tasa de conversión»), singular y plural («1 persona»); un mismo verbo para lo mismo («la
  miraron», ya no «la abrieron»); «Desde qué ciudad miran» en todas; el «¿Por qué?» dice qué mide y, en una ciudad sin tienda, la causa; el vacío
  dice qué pasó y cómo seguir («Quita un filtro para ver a más gente»).
- **design:design-critique** — lo primero que se ve es el protagonista de cada idea (la cinta, las grillas, el mosaico), la cifra queda arriba a la
  derecha; la debilidad de A y B es que «la más mirada» queda abajo y chica, la de C que «a qué hora» es lo más chico de la pantalla.
- **design:design-system** — 0 colores fuera de los tokens (los únicos hex en JS son los 21 colores de prenda del catálogo); las piezas del ERP
  copiadas con sus medidas (la marca del cajón se corrigió a 40 px); los radios salen de la escala (los 6 px pasaron a 8).
- **/formidable rapido** (solo medir, sin agentes; `referencia/medir-oficio.js` sobre el marco a 1440): 0 controles bajo 24 px, 0 textos con poco
  contraste, 1 rojo visible, 0 acciones primarias. Lo que marca y se queda a propósito: las versalitas de 11 px (son las del ERP) y bordes «casi
  alineados» que son números alineados a la derecha. Las 9 leyes **no se califican**: con `rapido` no hay prueba ciega (está «sin probar»).
- **frontend-design** y **ui-ux-pro-max** solo se consultaron: no mandan sobre los tokens ni sobre las piezas, y no se usó `--persist`.

## Cómo se verificó

Servidor local sin caché, panel de navegador, en claro y oscuro, a 1024, 1440 y 1920, en los tres períodos y cada dirección: sin errores de
consola, sin desborde horizontal, sin «NaN» ni «undefined». Se probaron los filtros (uno, dos, quitar, limpiar), el cajón (abrir, ↑ ↓, Esc, clic en
el velo), la vista de tabla y el teclado (Tab, Enter, Esc). Las animaciones se revisaron pausándolas con `document.getAnimations()` y fijando
`currentTime`. **Sin probar:** lectores de pantalla reales (VoiceOver), el zoom al 200 % y la prueba ciega con una colaboradora.

## Archivos

| Archivo | Qué tiene |
|---|---|
| `index.html` | la barra de maqueta, el marco y la carga de todo |
| `estilos.css` | tokens (copia de `globals.css` y `tema.css`), barra `mq-`, marco `erp-`, piezas `tr-` |
| `datos.js` | el catálogo real y las visitas inventadas con semilla; `resumen(periodo, filtro)` cuenta todo |
| `piezas.js` | marco, cabecera, controles, tabla gemela, cajón, globito, movimiento, estado en la URL |
| `a-hilo.*`, `b-cien.*`, `c-vitrina.*` | una dirección cada uno, con su prefijo |
