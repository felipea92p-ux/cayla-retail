# Recibir ▸ Terminados con la marca a la vista (maqueta, 2026-11-10)

Pantalla real: `apps/web/components/recepcion-conteo/RecibidoPorEnvio.tsx` (la lista por envío y la hoja de cada envío).
Abre `index.html` en el navegador: arriba eliges la propuesta (A, B, C) y claro u oscuro. Si tocas una fila se abre su hoja, y si tocas una prenda ves sus colores y tallas.

**Ejemplo inventado** con la forma de los envíos reales del 1 al 9 de noviembre: mismas cantidades y la misma mezcla de proveedores y marcas.
Los nombres no son los reales porque el repo es público.

## Lo que se vio en la base (solo lectura, 2026-11-10)

- **Un proveedor no dice qué llegó.** Un envío del 6/11 dice solo «CAYLA SAC», pero trae 10 marcas (269 unidades).
- **Hay prendas sin marca** en 3 envíos de la semana (`productos.marca_id` vacío desde `20260930020000`).
- **Hay dos nombres casi iguales**: una marca y la misma con «Now» detrás. Habría que revisarla aparte con «Existe también» (ADR-0576).
- **La marca se lee sin migración.** `getRecepcionesRecientes` (`lib/compras.ts`) ya trae `variante → producto`; basta con sumar `marca:marcas ( nombre )` al mismo select.

## Las tres caras

| | Lista | Hoja del envío |
|---|---|---|
| **A · Marca bajo el proveedor** | «Proveedor y marca»: los proveedores arriba y las marcas en una línea tenue debajo | cada prenda dice su marca (y su proveedor si hay varios) |
| **B · Marcas al frente** | las marcas como etiquetas (las 3 con más unidades y «+N más»), «de …» el proveedor y una barrita que muestra cómo se reparte el envío | «De qué marcas llegó» (barra y leyenda que lleva a cada grupo) y prendas agrupadas por marca |
| **C · Proveedor → marca** | una línea por pareja proveedor → marca, hasta 3 y «+N más» | agrupada por proveedor y, dentro, por marca |

## Lo que comparten las tres

Fecha única («terminó …» solo si cambia), «prendas» en vez de «líneas», «Llegó con el alta» en vez de «Sin envío», «Sin marca» en ámbar con el aviso
«Ponle su marca en Catálogo», y un buscador con filtros de Marca y Proveedor.

## Decisiones abiertas (de Felipe)

1. ¿A, B o C?
2. ¿Entran el buscador y los filtros de Marca y Proveedor?
3. ¿El aviso de «Sin marca» lleva a Catálogo, o solo se informa?
