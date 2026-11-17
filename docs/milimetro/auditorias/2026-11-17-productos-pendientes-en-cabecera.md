# Auditoría al milímetro — `/productos`: los pendientes en la cabecera · 2026-11-17 · `claude/notice-icon-visibility-5aedfa`

Piezas: `PendienteDeCabecera` (`components/PendienteDeCabecera.tsx`) en sus tres usos —«Por revisar», «Fichas repetidas» y «Por crear»— y
«Nuevo producto» como «+» en el celular. Reemplazan a las tres tarjetas de aviso que iban bajo la cabecera.

Medido: `/productos` entero a 1440×900 claro (estados, espacio, tipografía, color, movimiento, textos), 1440 oscuro (estados, color),
1440 quieto (estados, movimiento) y 375×812 táctil claro (estados, espacio, tipografía); segunda pasada de foco a 1440 (80 controles).
ERP local (`next dev`) con la base local. **La base local solo tiene «por revisar» (10):** las fichas repetidas (8) y las recibidas por crear (2)
se simularon en pantalla con un cambio temporal de `page.tsx`, retirado antes del commit. La guía de la pantalla se recorrió después, con los
datos reales, a 1440 (30 pasos) y a 375 px (27 pasos).

Resumen: **0 graves · 1 media corregida · 1 leve abierta** en lo nuevo. **1 «revisar» decidido a propósito.**

## Graves
Ninguno.

## Medias
1. **Corregida: con el dedo, los botones de solo ícono medían 42 × 44 px.** La regla del repo pide 44 con `pointer: coarse` (ADR-0611, mejora 5).
   Los tres pendientes heredaban el `max-sm:!px-3` de «Rótulos» y «Revisar precios», que ya medían 42. Se sumó `max-sm:min-w-11` a los cinco
   (los tres nuevos y los dos de antes, para que la fila quede pareja). Medido después: 44 × 44 los cinco y 58 × 44 el «+»; sin scroll lateral.

## Leves
1. **Abierta: con los tres pendientes a la vez la fila no cabe en un renglón.** A 375 px, «Por crear» y el «+» bajan a un segundo renglón (la
   primera prenda queda 54 px más abajo). A 1440 px la fila entera baja bajo el título (seis botones suman 992 px junto a un título de 384 en
   1321 útiles). Con uno o dos pendientes cabe en los dos anchos. No se midió con qué frecuencia coinciden los tres.

## Decidido a propósito
- **«3 bucles que no son señal de espera» (`movimiento/medir.js`).** Es el latido de cada número: `.punto-vivo`, `cayla-pulso` de 2,2 s, solo
  `transform` y `opacity`. Tiene su fila en ADR-0136 (act. 2026-11-17). Con las animaciones apagadas: 0 animaciones, 0 bucles, y queda el número.

## Lo medido en las piezas nuevas
- **Contraste:** 0 textos y 0 controles que fallen en claro y en oscuro (72 textos, 6 controles). El número del globito: crema sobre ámbar en
  claro (6,3:1 calculado) y tinta sobre ámbar claro en oscuro.
- **Foco:** anillo visible en 80 de 80 controles, ninguno tapado.
- **Estados:** 0 apagados; hover dentro de `(hover: hover)`; cada pendiente tiene su nombre accesible («10 prendas por revisar») y el número se
  anuncia como «10 pendientes».
- **Tipografía:** 0 textos de lectura bajo 14 px. El número del globito mide 10 px: es la pieza decidida (`contador`, 2026-10-15).
- **Hoja de fichas repetidas a 375 px:** abre con sus 8 filas y la frase «no se pierden ventas, fotos ni stock»; sin scroll lateral.

## Sin medir
- Con fichas repetidas y recibidas por crear reales (solo simuladas).
- El latido en un equipo de tienda sin tarjeta gráfica (aquí, una Mac con las animaciones encendidas).
- La guía en modo oscuro.

## De antes, fuera de este cambio
- «Ver todos los colores» mide 24,9 × 24 px con el dedo.
- La opción elegida del tamaño de tarjeta («Mediano») y los puntos de color de cada prenda se distinguen solo por color o solo por ARIA.
