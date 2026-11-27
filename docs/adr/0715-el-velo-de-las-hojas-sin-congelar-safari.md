# ADR-0715 — El velo de las hojas es nuestro: abrir y cerrar sin congelar Safari

**Fecha:** 2026-11-27 · **Estado:** aceptado (Felipe: «Sí, arréglalo», el mismo día, tras ver la causa medida). Solo web: sin migración,
sin cambios de RPC, de permisos ni de datos. Toca piezas de todo el ERP (`components/ui/Modal.tsx` y `Cajon.tsx`): en CAYLA Dynamic queda
como tarea.

## Contexto

Felipe (2026-11-27): en Insumos, «Llegó una compra» «demora en cargar el modal» y al cerrarla «también demora, como que se vuelve lento».

Lo que se midió (WebKit de Playwright, el motor de Safari, sobre un build de producción y un banco propio con la cuenta del seed):

- **No es la base ni la red.** En los registros de producción, las tres lecturas de la hoja tardan entre 10 y 80 ms en el servidor. Sí hay
  una vuelta de más: la hoja preguntaba cuál es el Taller (`ubicaciones`) antes de pedir las cuentas de pago, aunque la pantalla ya lo sabe:
  0,16 a 0,26 s desde Trujillo.
- **Felipe usa Safari** (registros de producción: `Version/27.2 Safari`). Ahí el vidrio que dobla (ADR-0681) no corre.
- **La pantalla se congela al abrir y al cerrar:** abrir ~205 ms (la primera vez ~300) y cerrar ~120 ms. Chrome hace lo mismo en ~85 y ~50.
- **La causa es el `Dialog.Overlay` de Radix.** Para que la página de atrás no se desplace, monta react-remove-scroll, que al abrir
  **agrega** una hoja de estilos a la página y marca el `<body>` con una variable CSS, y al cerrar **quita** la hoja. En WebKit, quitar
  una hoja de estilos obliga a rehacer las 6.316 reglas del ERP (un CSS de 1,6 MB con 100 `@property` y 498 variables en `<html>`) y a
  recalcular cada elemento: ~95 ms con 887 elementos y ~155 ms con 1.677 (la pantalla de producción, con 34 insumos, es más larga que la del
  banco). Cambiar algo heredado en `<body>` o `<html>` (la variable, el `pointer-events`) recalcula todo de nuevo: 27 a 65 ms. Chrome hace
  las dos cosas en 1 ms.
- **Descartado:** el vidrio que dobla (no corre en Safari), las reglas `:root:has(input:focus)` de la guía de foco (4 ms), los datos de la
  hoja (200 elementos) y la base.

## Decisión

1. **El velo de `<Modal>` y de `<Cajon>` es `<VeloDeHoja>`** (`components/ui/VeloDeHoja.tsx`), nunca `Dialog.Overlay`. Se ve igual: las
   mismas clases y la misma marca `data-state="open"`, de la que cuelga su vidrio (`vidrio/hoja.css`, `vidrio/dobla.css`, `perfil-vidrio.css`).
   Recibe los clics (`pointer-events: auto`, como el de Radix) para que tocarlo cierre la hoja, y con el dedo no deja arrastrar la página
   (`touch-action: pinch-zoom`; pellizcar sigue andando).
2. **El candado de lo de atrás es una sola propiedad de `<html>`** (`lib/candado-de-scroll.ts`): `overflow: hidden`, que no se hereda y que
   Safari resuelve en ~1 ms. Si la página tenía una barra que ocupa lugar (Windows), además `scrollbar-gutter: stable`, para que nada salte de
   lado. Varias hojas a la vez lo comparten: lo pone la primera, lo quita la última y lo de antes vuelve tal cual.
3. **«Llegó una compra» usa el Taller que ya trae la pantalla** para pedir las cuentas de pago (es la misma consulta que hacía
   `useIdDelTaller`): una vuelta menos a la base.
4. **Lo vigila `lib/hojas-velo.test.ts`:** ningún archivo de la web usa `Dialog.Overlay` ni importa react-remove-scroll, `<Modal>` y `<Cajon>`
   dibujan su velo con `VeloDeHoja`, y el velo lleva su marca. El candado tiene su prueba (`lib/candado-de-scroll.test.ts`).

```
DECIDÍ:     velo propio + candado en <html>: lo único que hacía el Overlay de Radix y que necesitamos, sin agregar ni quitar hojas de estilos.
DESCARTÉ:   parchar react-style-singleton para que su hoja no se vaya nunca (simulado: cerrar quedaba en ~80 ms, porque la marca del body sigue
            recalculando todo; y un parche de dependencia cambia el lockfile en cada actualización de Radix).
DESCARTÉ:   `modal={false}` en Radix: se pierde el foco atrapado y el `aria-hidden` de lo de atrás, que sí queremos.
DESCARTÉ:   por ahora, neutralizar el `pointer-events: none` que Radix pone en el body (~30 ms más al abrir en Safari): cambiaría qué se puede
            tocar por encima del velo (avisos, menús, la isla). Queda medido en el backlog para decidirlo aparte.
DESCARTÉ:   achicar el CSS del ERP: es lo que encarece todo en Safari, pero es un trabajo de muchos módulos (y de Dynamic). Queda anotado.
```

## Verificación

- Medido en WebKit, «Llegó una compra», mismo banco y mismo build salvo el cambio (mediana de 8 a 10 vueltas; lo que la pantalla queda
  congelada hasta poder pintar): **abrir de ~205 a ~100 ms** (la primera vez después de entrar a la pantalla, de ~300 a ~220) y **cerrar de
  ~120 a ~50 ms**. «Nueva tela»: abrir de ~135 a ~100 ms y cerrar de ~130 a ~55. Chrome no empeora (abrir de ~90 a ~75, cerrar de ~50 a ~45).
- Funcionamiento, en WebKit (18 de 18) y en Chrome (20 de 20): el velo lleva su vidrio de siempre (la marca `data-state`; en Chrome, con la
  lente que dobla, suelta su desenfoque al marco de afuera como antes); la rueda sobre el velo no mueve la página y dentro de la hoja la
  desplaza a ella; tocar el velo y Escape cierran; 40 Tab no sacan el foco de la hoja; al cerrar, `<html>` queda como estaba y la página en
  la misma posición; un cajón con velo (Compras ▸ Proveedores) hace lo mismo; a 375 px, arrastrar con el dedo sobre el velo no mueve la
  página y dentro de la hoja sí (gesto táctil de verdad, en Chrome). Vender a 375 px: la hoja «Más» abre, bloquea y se cierra con Escape.
- «Llegó una compra» al abrir pide solo `fn_mi_fondo` y `fn_cuentas_para_elegir` (con el Taller), sin `ubicaciones`; con «Ya la pagué»
  propone la cuenta del Taller como antes.
- Ojo al mirar capturas: WebKit sin pantalla (Playwright) no dibuja `backdrop-filter`, así que ahí toda hoja se ve más transparente que en
  Safari. Lo que se compara es el estilo calculado del velo, no la captura.
- `tsc`, eslint y las pruebas de hojas, movimiento, unificar, guía de foco y arquitectura en verde.

## Consecuencias

- Toda hoja y todo cajón con velo del ERP abren y cierran más rápido en Safari, y más cuanto más larga es la pantalla.
- Lo que sigue costando en Safari: la primera apertura (~0,2 s: el motor todavía no conoce el código de la hoja), dibujar la hoja contra un CSS
  de 6.316 reglas, y el `pointer-events` del body. Medir en WebKit, no solo en Chrome, todo lo que toque `<html>` o `<body>` o agregue y
  quite una hoja de estilos.
- **Dynamic:** `components/ui/` es de la familia. Allá hay que copiar `VeloDeHoja.tsx` y `lib/candado-de-scroll.ts`, y cambiar su
  `Dialog.Overlay` por `<VeloDeHoja>` en su hoja y su cajón (cambia cómo funciona, no cómo se ve).
