# Auditoría al milímetro — «Venta registrada» de /vender · 2026-11-16 · `claude/izipay-auto-print-integration-959dcd` (PR #1889)

Medido: 1440×900 claro (quieto y vivo) · 375×812 claro (táctil) · 1440 oscuro · foco con teclado. Raíz: `[role=dialog]`, con
«Imprimir solo al cobrar» encendido y una venta con vuelto (la hoja que se queda abierta). Servidor: `localhost:3010`, base local
restaurada a su foto al terminar. Impresora simulada (`window.print` contado): una impresión por venta.

Resumen: **0 graves · 0 medias · 1 leve · 2 decididos a propósito** (de este cambio). Aparte, 4 cosas que ya existían.

## Graves
Ninguno.

## Medias
Ninguna.

## Leves
1. «Ya se imprimió · Enter abre una venta nueva» también se ve con el dedo, donde no hay Enter — `components/VentaRegistradaModal.tsx`
   (la línea de ayuda de la rama `alRegistrar !== "esperar"`) — medido a 375 px táctil — es el mismo patrón que la línea de antes («Enter imprime y abre…») —
   `[Práctica]` — va a `/textos`. No se cambia aquí para no apartarse de la hoja de siempre.

## Decidido a propósito
- **El interruptor mide 23,3 px de alto en escritorio:** es `<Interruptor>` del sistema (ADR-0358) y pasa AA por la excepción de separación (medido:
  `blancosBajo24PeroSeparados`). Con el dedo, `tacto.css` lo agranda: a 375 px táctil no aparece entre los blancos bajo 44.
- **«Nueva venta» sale «no concluyente» en contraste** (1,09 claro · 1,25 oscuro): el medidor no lee el degradado del vidrio. El botón primario lo mide
  `lib/vidrio-contraste.test.ts`, que pasa.

## Medido sin hallazgos
- Estados (`milimetro/medir.js`): 0 apagados, 0 errores, 0 cargando mal, 0 etiquetas faltantes, sin bucles; los mismos ceros en oscuro y a 375 px.
- Foco con teclado: 3 controles medidos, los 3 con anillo, ninguno flojo ni tapado.
- Espacio: 0 blancos bajo 24 que fallen AA, 0 valores fuera de escala, 0 grupos con proximidad rota (1440 y 375).
- Tipografía: 0 textos de lectura bajo 14 px y 0 etiquetas bajo 11 (1440 y 375).
- Color: 0 textos que fallen contraste en claro y en oscuro; los controles que el medidor marca están detrás de la hoja (el buscador y el monto del
  cobro), no en ella.
- Movimiento: el cambio no agrega ninguna animación; las que corren son del marco (aviso de cierre, aurora).

## Ya existía (no lo causa este cambio)
- Bajo 1024 px, al abrirse la hoja el foco queda en el escáner de atrás: Enter no llega a su botón (pasa igual con el interruptor apagado).
- Montos sin espacio tras «S/» (`montoMal` de `/textos`) y DM Sans sin cifras tabulares (propuesta 1 de `/tipografia`): son de todo el ERP.
- Interlineado 1,38 en el párrafo «La venta ya quedó guardada…» (`leading-snug`).
- El desplegable «Ver las 1 línea del comprobante» mide 43,3 px con el dedo (y su texto: «1 línea»).

## Sin medir
- `pnpm --filter web tema:auditar`: no tiene escenario que abra esta hoja sin registrar una venta. El oscuro se midió con `color/medir.js` y una captura.
- La térmica real con Chrome `--kiosk-printing` en una Mac de caja.
