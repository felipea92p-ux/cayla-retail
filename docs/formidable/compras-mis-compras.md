# Formidable · Compras ▸ Mis compras en escritorio (Inicio, Mis envíos, Compré ropa con «Tu compra», hojas de plata y gasto)

## Pasada rápida · 2026-10-26 (solo el paso 1: medir; sin agentes, sin prueba ciega)

- **Alcance:** lo que se construyó el 2026-10-26 en los PR #1344 a #1368 (Mis envíos, el código del envío, las propuestas A de PC, la ronda
  vacía, «Tu compra»). **No hay notas de leyes:** «sin evidencia no hay nota», y la prueba ciega y la colaboradora real **están sin hacer**.
- **Entorno:** banco propio (`cayla-miscompras`), cuenta Admin (Felipe) y una integrante (Micaela, ronda recién abierta), `medir-oficio.js` a
  1440, 1024 y 375 px; capturas a 1024, 1280, 1440 y 1920 px, claro y oscuro.

### Medido (Inicio, 1440 y 1024 px)
- 0 textos con poco contraste y 0 rojos de más. Los blancos bajo 24 px son tres piezas del sistema, no de esta pantalla: «Ver todos»
  (`EnlaceVer`, 92×14 px), «Ver 4» (`BotonVerMas`, 55×20 px) y «Salir» del marco. Se dejan para quien decida la pieza (cambiarlas mueve todo el ERP).
- Los textos de 10 a 11 px son el marco (lateral, cabecera) y las versalitas del sistema.

### Defectos encontrados y cerrados en la rama (con captura antes/después a 1024 px)
| Dónde | Antes (1024 px) | Después |
|---|---|---|
| Inicio con la ronda abierta | Tres columnas que no caben: «Manda» a 150 px de ancho, el registro de la ronda cortado y la página con scroll horizontal | Tres columnas desde 1280 px; de 1024 a 1279, dos: «Manda» y el registro apilados en la segunda. Sin desborde a 1024, 1280 y 1920 |
| Mis envíos (tabla) | La columna «Tienda» colapsaba a 0 (las filas no decían a qué tienda), «Tienda» y «Salió» encimadas en el encabezado y las pestañas cortadas por el buscador | De 1024 a 1279: sin «Fardos» ni «Ronda» (el detalle los trae), columnas más chicas y la barra de pestañas, buscador y filtros apilada hasta 1280 |
| Compré ropa, paso 3 («El papel y el pago») | Dos columnas dentro de una columna de 370 px: «Paga Compras» cortado y «Transferencia» ilegible | Una columna hasta 1279 px (el papel y el pago uno bajo otro) y dos desde 1280 |

### Lo que sobra (ley 8) y lo que no se pidió
- Sobra, y no se hace: nada que se pueda quitar sin perder información.
- Lo que Felipe no pidió y importa: «Seguir» de «Compré ropa» sigue en cada paso, no dentro de «Tu compra» (la maqueta lo ponía en el panel); y
  los tres blancos pequeños de arriba, que son del sistema.

### Pendiente de esta pasada
- Prueba ciega (agente sin contexto) y, si Felipe puede, una colaboradora real, sobre «Mandar → código», «Mis envíos» y «Tu compra».
- Concurrencia (dos personas mandando a la misma tienda a la vez: lo cubre `mandar_compras_a_tienda`, que ya serializa por compradora, no por tienda), caída
  de la base (Mis envíos dice «No se pudieron leer tus envíos» y Mis compras sigue sin ellos) y persona sin contexto: **sin probar**.
