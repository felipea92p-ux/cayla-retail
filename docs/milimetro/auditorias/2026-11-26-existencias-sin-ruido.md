# Auditoría al milímetro — Existencias sin ruido: la cabecera, los atajos, la banda del barrido y el pie de la lista (PR #2041, ADR-0709) · 2026-11-26 · claude/revisar-utilidad-elementos-68e976
Medido: 1440×900 claro (vivo y quieto) · 375×812 claro · 1440 oscuro · foco con teclado · en dos sedes (Trujillo con un barrido abierto, Lima sin barrido ni cuadre)     Servidor: `http://localhost:3010` (worktree, contra una pila Supabase propia `cayla-sin-ruido`, 548xx, con todas las migraciones, el seed y un barrido inventado)
Resumen: 0 graves · 0 medias abiertas (2 corregidas) · 2 leves (1 corregida) · 5 de piezas que ya existían · 2 falsos positivos del medidor

Cómo se midió: `/inventario` real, con la sesión del líder del seed y la sede activa puesta con la cookie del selector (en otra sede no se lee el
barrido: `enSuSede`). En Trujillo, un barrido abierto con 7 prendas escaneadas; en Lima, ninguno y el piso nunca cuadrado. Los siete medidores
(`milimetro` —también con `{ foco: true }`—, `espacio`, `tipografia`, `color`, `movimiento`, `textos`, `graficos`) corrieron enteros con
Playwright, 32 pases. Las piezas son las decididas: `<EncabezadoPagina>`, `<Aviso chico>` con `<BotonVer>`, `<BotonDescargar>`, `btn-enlace`,
`<Buscador>`; los atajos y `BotonSonidoConfirmar` ya existían.

Verificado además en el navegador (capturas en el PR): con barrido abierto, una sola banda «Barrido en curso · 7 prendas escaneadas … Al
terminarlo, el piso queda cuadrado.», sin botón de barrido en la cabecera, sin franja y, a 375 px, 0 botones «Avisos» (sin barrido: 1); sin
barrido, «Barrido del piso» en la cabecera y la franja con «Hacer el barrido»; «1 según el sistema» y «6 según el sistema»; atajos Todo · Sin
stock atrás · Apartadas · Dañadas; el panel con dos filas (Prenda, Vista); el pie con Descargar CSV, Resumen por categoría y Sonido al
confirmar en tarjetas, tabla y por talla.

## Graves
Ninguno. 0 textos que fallan contraste en claro ni en oscuro (120 medidos en Lima, 110 en Trujillo). 80 controles enfocados: todos con anillo y
ninguno tapado. 0 blancos < 24 px con mouse, 0 desbordes a 375 px, 0 letras de lectura < 14 px, 0 montos partibles, 0 bucles sin señal.

## Medias
1. ~~**«Ver el valor a costo», abierto, rompía la cabecera.**~~ La sección vivía en la columna de las cifras: la ensanchaba y la columna entera
   bajaba a la izquierda, bajo el título (1440 px). Topada al ancho de las cifras, la cabecera crecía y el título bajaba de y = 128 a y = 284 px.
   — `app/(app)/inventario/page.tsx`, `components/existencias/ValorInventarioExistencias.tsx` — medido: `getBoundingClientRect` de `h1` y de
   la sección — regla: «Paleta y orden de pantalla» (ADR-0220: la cabecera no cambia de forma) — **corregido en este PR**: cerrado, el enlace
   sigue bajo las cifras; abierto, la sección se dibuja a lo ancho bajo la cabecera (`abrirEn`, un portal a una caja vacía que no ocupa lugar).
   Medido otra vez: el título en y = 128 a 1280, 1440 y 1920, claro y oscuro; la sección de 948, 1108 y 1588 px.
2. ~~**«Por colgar» aparecía un instante y se iba.**~~ Mientras el plan del piso se calcula, el atajo se dibujaba con su cifra «calculando»; al
   llegar el plan, con el piso en pausa, desaparecía y «Sin stock atrás», «Apartadas» y «Dañadas» saltaban a la izquierda. — `FiltrosRapidos.tsx`
   — medido: los atajos muestreados cada 100 ms durante la carga (12 s) — regla: «La página no se encoge bajo el mouse» (ADR-0185) —
   **corregido en este PR**: `pausaPrevista` (el piso nunca cuadrado, que la capacidad ya sabe antes del plan) lo calla desde el principio.
   Medido otra vez: en las dos sedes, «Por colgar» no aparece en ningún muestreo.

## Leves
1. ~~**El pie se partía en dos renglones con 8 px entre ellos**~~ (12 px entre las piezas de un mismo grupo): la leyenda se leía pegada a las
   herramientas. — `InventarioPanel.tsx`, los tres pies — medido: `espacio/medir.js` «proximidadRota» a 375 y 1440 px — [Práctica] Gestalt,
   proximidad — **corregido en este PR**: `gap-y-4` (16 px). Medido otra vez: 0 a 375 px en las dos sedes.
2. ~~**«Sonido al confirmar» medía 36 px de alto con el dedo**~~ (pide 44). — `components/BotonSonidoConfirmar.tsx` — medido: `espacio/medir.js`
   «blancosBajo44» a 375 px — regla del repo (ADR-0611, mejora 5) — **corregido en este PR**: `area-dedo`, que agranda el área sin cambiar el
   dibujo. Medido otra vez: 0.

## De piezas que ya existían (no de este PR)
1. **«Sonido al confirmar» es un interruptor dibujado a mano** (`button[aria-pressed]` con «Sí/No» escrito), no `<Interruptor>`. Este PR solo lo
   movió al pie. Va a `/unificar` (`casilla`).
2. **Los puntos de color de la Vitrina** (`vitrina-punto`): el elegido solo cambia de fondo y el control no llega a 3:1 contra su vecino
   (relleno 1–1,08:1). El color de la prenda es dato (ADR-0336) y la onda que sale del elegido es una excepción de ADR-0136; lo que marca la
   elección se decide con la Vitrina (ADR-0589), no aquí.
3. **El ícono de `<Aviso>` se dibuja en 520 ms** (`cayla-trazo-dibuja`, 20 ms sobre el tope de 500): pieza decidida, va a `/movimiento`.
4. **Dos `:hover` fuera de `(hover: hover)`** que el navegador entrega sin comentarios (`.barra-t:hover`, `.parecidas-punto:hover::after`): no
   son de esta pantalla; los vigila `lib/hover-con-mouse.test.ts`.
5. **Proximidad dentro de la tarjeta de la tabla** a 1440 (14 px adentro, 12 afuera) y 7 cifras proporcionales en las tarjetas: piezas de antes.

## Falsos positivos
1. **«Anillo flojo» en «Todo» (1,07:1).** El medidor lee el `outline-color` en el mismo instante del foco; el atajo tiene `transition-colors`,
   que también anima el color del anillo (150 ms, del crema del texto a la tinta). Ya asentado: tinta, 2 px a 2 px, sobre el claro de la
   tarjeta (medido en vivo con Tab: `rgb(26, 26, 24)`).
2. **«Sumarme» en oscuro, no concluyente (3,97 a 6,45:1).** Medido sobre los píxeles de la captura a 1920 px: letra `rgb(162,184,205)` sobre
   `rgb(65,64,61)`, **5,07:1** (pide 4,5).

## Sin medir
`graficos/medir.js` marcó dos `path` a mano: son el ícono de la categoría dentro de la foto (`<SinFoto>`), no un gráfico. El hover con el dedo
(`pointer: coarse`) no se emuló: `tacto:medir` lo cubre. La hoja «Resumen» del celular con el valor a costo no se abrió: allí la sección se
dibuja en su lugar, como antes (`abrirEn` solo lo pasa la cabecera).
