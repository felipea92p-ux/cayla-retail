## Scroll lateral a 640 px exactos (medido 2026-11-05)

El lateral aparece desde 640 px y deja 288 px de contenido. Ahí, y solo ahí entre los anchos medidos (375, 640, 768, 1024, 1280 y 1440), quedan tres pantallas con scroll lateral:

- `/vender/historial`: +104, una píldora de la fila de filtros (`button.pildora-cayla`, `shrink-0`).
- `/productos/categorias`: +91, el botón principal, que no baja de línea.
- `/compras`: +15, una cifra de la cabecera (`font-display whitespace-nowrap`).

## Aviso de hidratación en las pestañas

`/cambios` y `/devoluciones` en local avisan en consola que `data-mas-der` no coincide entre servidor y navegador. Es de las pestañas, no del scroll lateral: el arreglo de esta rama no la toca.
