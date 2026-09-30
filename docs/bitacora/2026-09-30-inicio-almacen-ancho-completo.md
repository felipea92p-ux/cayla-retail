## 2026-09-30 (El Inicio de almacén ocupa todo el ancho, a cualquier resolución o zoom)

Qué hice: Felipe vio el Inicio de almacén con datos reales y pidió que ocupe toda la pantalla «en cualquier resolución o zoom in o zoom out». Estaba centrado en una columna de 64 rem (el tope
`max-w-5xl` que `AppShell` pone a toda pantalla que no esté en `SIN_TOPE_DE_ANCHO`), con el espacio a los lados vacío. Ahora el Inicio de almacén escribe un marcador y el `<main>` le quita el tope solo a
esta pantalla; además, título, tarjetas y columnas crecen con el ancho para que en pantalla grande no sobre el espacio. Cambian `components/AppShell.tsx`, `components/inicio-almacen/InicioAlmacen.tsx`
y `app/estilos/inicio-almacen.css`; nuevo `lib/ancho-completo.test.ts` (4 pruebas).

Por qué así: agregar «/» a `SIN_TOPE_DE_ANCHO` es lo obvio y estiraría el Inicio de todas las cuentas (Equipo de hoy, «Te toca» de tienda), que no se pensaron para eso. Con `has-[[data-ancho-completo]]` la pantalla
pide su ancho sin prop-drilling ni que `AppShell` sepa de cuentas. Sin crecer, quitar el tope solo dejaba lo mismo de pequeño con más aire: por eso la tarjeta pasa de 250 a 360 px, el título de 56 a 104 px y, desde 1500 px, las
columnas se reparten con tope. No usé `zoom` de CSS: los efectos de mouse (foco de luz, inclinación) miden con `getBoundingClientRect` y se desfasarían.

Felipe se lleva: recargar `/` con la terminal de almacén. Medido en el navegador a 3840, 2560, 1920, 1280, 1024, 768 y 375 px: el contenido ocupa entre 96 % y 100 % del ancho útil, sin desborde horizontal; en
celular sigue el botón fijo. La prueba de mutación confirma que el candado falla si alguien quita la regla de `AppShell` o pone «/» en la lista. No probé un zoom real del navegador (emulé el ancho de ventana, que para el
diseño es equivalente porque todo se mide por contenedor), ni Safari ni Firefox.
