# ADR-0304 · Etiquetas de precio desde una Mac: un ayudante local manda el tamaño exacto a la Brother

- **Fecha:** 2026-10-01 · **Estado:** construido en la rama `claude/mac-print-config-dcb5bc`. Web + un script por Mac. **Sin migración.**
- **Pedido:** Felipe, 2026-10-01. En la Mac de la tienda las etiquetas salían largas, con papel de sobra. Recortarlas a mano o imprimir
  desde Windows no son opción: «dame una solución real, tal vez incluir un botón en el sistema exclusivo para impresión en Mac para que salga
  bien siempre». Hoy imprimen **3 Macs**.
- **Complementa:** ADR-0180 (etiqueta de precio, `@page etiqueta-precio` de 62 × 40,1 mm, guía de impresión). **Reemplaza** la pestaña Mac
  de esa guía, que nunca se había probado contra la Brother real.

## Qué pasaba (medido el 2026-10-01 en la MacBook de la tienda, con la Brother QL-1110NWB por USB)

Se probaron, una por una, todas las vías del diálogo. En **todas** la Brother recibió la hoja girada a vertical: 40,1 mm a lo ancho
del rollo y 62 a lo largo. Por eso sale con unos 22 mm de blanco a un costado, o cortada a 62.

| Trabajo | Papel elegido | `media` que llegó a la Brother |
| --- | --- | --- |
| 4–8 | papel personalizado de la Mac, 62 × 40 | `Custom.113.00x175.00` (40 × 62) |
| 8 | papel personalizado «vertical», 40,1 × 62 | `Custom.113.00x175.00` |
| 9 | cola nueva con un tamaño `62x40mm` en su PPD | `Custom.113.00x175.00` |
| 10 | ese `62 x 40 mm` elegido en el diálogo de Chrome | `Custom.113.67x175.75` (40,1 × 62) |
| 11 | papel cuadrado 62 × 62 | `Custom.175.00x175.00`: sale bien orientada, pero con 22 mm de papel de sobra |

La Mac normaliza cualquier papel más ancho que largo a vertical antes de entregarlo a CUPS. La Brother toma el primer número como el
ancho del rollo. No hay ajuste del diálogo, de la cola ni de la forma A/B que lo evite. Ponerle a la cola un tamaño con ese mismo nombre
tampoco sirve: CUPS lee `Custom.WxH` como una medida, no como un nombre. Lo comprobó `cupsfilter`, sin gastar rollo.

En cambio, **mandado sin pasar por el diálogo**, con `lp -o media=Custom.62x40.1mm`, el raster sale de 732 × 473 px a 300 dpi, o sea
62 × 40 mm. La etiqueta de prueba del 2026-10-01 salió del tamaño justo, derecha y cortada.

## Decidí

DECIDÍ: en una Mac, «Imprimir etiquetas» no abre el diálogo. Le manda la hoja de etiquetas a un **ayudante local**
(`apps/web/public/mac-etiquetas/servidor.sh`), y el ayudante hace dos cosas:
1. La pasa a PDF con **el mismo Chrome de la Mac, sin ventana**: mismo motor, mismo `@page etiqueta-precio` y misma forma A que en Windows.
2. La imprime con `lp -o media=Custom.62x40.1mm -o CutMedia=EndOfPage`, así sale una etiqueta por corte.

1. **El ayudante es un script de shell** que launchd arranca por conexión (`inetdCompatibility`), y escucha **solo en 127.0.0.1:9631**.
   - No queda un proceso encendido.
   - No necesita Node, Python ni contraseña de administrador: solo `/bin/sh`, `lp` y Chrome.
   - Se instala una vez por Mac con una línea en Terminal: `curl -fsSL https://cayla-retail.vercel.app/mac-etiquetas/instalar.sh | sh`.
     El mismo script con `sh -s quitar` lo desinstala.
   - `proxy.ts` excluye `/mac-etiquetas/` de la sesión, como hace con `sw.js`: si no, `curl` recibía la pantalla de login en vez del script.
2. **La etiqueta no se dibuja dos veces.** La pantalla manda la misma hoja que ya imprime Windows (`#etiquetas-precio-print`), con:
   - sus hojas de estilo y las precargas de fuente, con `<base>` al origen de la app;
   - las clases de next/font en el `<body>`.

   Así cualquier cambio de diseño de la etiqueta llega igual a la Mac (lógica pura en `lib/mac-etiquetas.ts`).
3. **La pantalla decide sola.** En una Mac pregunta `GET /estado` al abrirse:
   - Si el ayudante responde, «Imprimir» va por él y desaparece la elección A/B.
   - Si no responde, sigue con `window.print()` y muestra una nota con lo que falta: el ayudante, la Brother o Chrome. Si falta el
     ayudante, trae la línea para instalarlo y el botón Copiar.
   - Windows no cambia.
4. **Seguridad:**
   - **Origen:** solo imprime un `POST` cuyo `Origin` es el ERP (`cayla-retail.vercel.app`, o `localhost:3000/3010` en desarrollo).
   - **Host:** solo atiende a nombre de `localhost` o `127.0.0.1`, contra el rebinding de DNS.
   - **JavaScript:** el documento tiene que empezar exacto con `<!doctype html><html><head>`, y justo detrás el ayudante cuela una CSP
     `script-src 'none'`.
   - **Tamaño:** pesa 2 MB como máximo.
   - **Perfil:** Chrome corre con un perfil desechable.
   - **Respuesta:** CORS y `Access-Control-Allow-Private-Network` solo para el origen permitido.

DESCARTÉ:
- **(a) Papel cuadrado de 62 × 62.** Funciona sin instalar nada, pero gasta 35 % más rollo y hay que recortar 22 mm a mano por etiqueta.
  Felipe lo descartó.
- **(b) Imprimir desde Windows.** Felipe lo descartó.
- **(c) Dibujar la etiqueta en un `<canvas>` o generar el PDF en el servidor.** Era una segunda copia del diseño, con fuentes y medidas
  que se desalinearían de la etiqueta real.
- **(d) WebUSB directo a la Brother.** Hay que implementar el protocolo raster de Brother, y macOS ya tiene tomada la interfaz USB con
  `ippusbd`.
- **(e) Instalar un filtro de CUPS que corrija la medida.** Necesita `/usr/libexec/cups/filter`, protegido por SIP.
- **(f) `--blink-settings=scriptEnabled=false`** para apagar JavaScript. Con eso Chrome no escribe el PDF (medido); por eso se usa la CSP.

SE ROMPE SI:
- **Chrome cambia `--print-to-pdf`.** El ayudante espera el mensaje «bytes written to file» y después cierra Chrome, porque en Chrome 154
  escribe el PDF y no se cierra solo. Si el mensaje cambia, el ayudante espera los 40 s del tope.
- **Chrome bloquea el acceso de una página pública a `127.0.0.1`.** Chrome ya pide «acceso a la red local»: se elige Permitir una vez
  por Mac.
- **Se cambia el prefijo o el puerto en un solo lado.** Están repetidos en la web y en los scripts, y lo vigila `lib/mac-etiquetas.test.ts`.

## Verificado

- **Ayudante (`node scripts/mac-etiquetas/servidor.prueba.mjs`):** 9 comprobaciones contra el Chrome real y una impresora falsa.
  - CORS y preflight: solo para el ERP.
  - Rechazos: 403 a otro origen o a un POST sin `Origin`, 403 a otro `Host`, 400 a un documento sin el prefijo, 413 a un cuerpo vacío.
  - Impresión: 3 etiquetas dan un PDF de 3 páginas de 62,1 × 40,2 mm, y se manda con `media=Custom.62x40.1mm` y `CutMedia=EndOfPage`.
  - JavaScript: el `<script>` del documento no corrió.
- **Instalado en la MacBook de la tienda con launchd:** `GET /estado` responde. Una etiqueta de prueba de 62 × 40,1 por el ayudante
  (trabajo 13, `media=Custom.62x40.1mm`) salió del tamaño justo, derecha y cortada, según la foto de Felipe.
- **Ensayo con el diseño de producción:** `EtiquetaPrecio` real, con el CSS y las fuentes de `cayla-retail.vercel.app`, pasada a PDF por
  el mismo camino. Da la etiqueta completa, con DM Sans, girada en su hoja de 62 × 40,1, igual a la vista previa de Chrome.
- **Código:** `tsc`, `eslint` y las 301 suites de `vitest` en verde, incluida `lib/mac-etiquetas.test.ts`: documento, estados, avisos y
  que la web y los scripts digan el mismo prefijo, puerto, dominio y medida.
- **Falta, porque sale con el deploy:** imprimir desde la pantalla de producción en la Mac, con la tanda real, y instalar el ayudante en
  las otras 2 Macs.
