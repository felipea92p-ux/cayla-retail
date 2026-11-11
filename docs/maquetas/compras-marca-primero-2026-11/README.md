# Compras: la marca primero (maqueta, 2026-11-11)

**Pedido de Felipe:** «En los submódulos de Compras la mayoría de cosas está por proveedor, pero muchas veces no se conoce al proveedor sino la
marca, y es muy importante que se priorice la marca por encima del proveedor». Y después: «un proveedor puede vender varias marcas».

**Estado:** solo la maqueta (`index.html`, se abre en el navegador; botón «Claro / oscuro» arriba). No hay código ni migración. Espera el OK de Felipe.

## Lo que se revisó (código, 2026-11-11)

| Pantalla | Hoy se ve primero | La marca |
|---|---|---|
| Mis compras ▸ Compré ropa, paso 1 (`RegistrarCompra.tsx`, `PasoProveedor`) | «¿A quién le compraste?» y razones sociales | En gris debajo; el buscador sí la encuentra |
| Mis compras, lista del día (`lib/mi-plata-reglas.ts:819`) | «Compra a {proveedor}» | No sale |
| Historial de compras (`app/(app)/compras/page.tsx`) | Columna Proveedor + RUC | No sale; no se busca ni filtra por ella |
| Por pagar (`PorPagarLista.tsx`) | Razón social y avatar | No sale |
| Proveedores (`ProveedoresPanel.tsx`, `NombreCelda`) | Razón social | En etiquetas chicas; el buscador sí la encuentra |

## Lo que dice producción (lectura, 2026-11-11)

- 110 de 115 marcas activas tienen **un** proveedor; 5 tienen dos o más.
- 10 proveedores venden 2 marcas o más (7 con 2, uno con 3, uno con 4, uno con 5); 93 venden una; 26 no tienen marcas (servicios y gastos).
- 0 de las 35 órdenes de compra mezclan marcas, pero `orden_compra_items.marca_id` es obligatorio: cada línea ya sabe su marca.
- `compras.proveedor_id` y `ordenes_compra.proveedor_id` son obligatorios: la deuda y el pago siguen siendo con la razón social.

## La propuesta (en la maqueta)

1. **Mis compras, paso 1:** «¿Qué marca compraste?», una fila por marca con el proveedor debajo; con un solo proveedor queda puesto solo; con dos, una hoja
   «¿Quién te trajo X esta vez?». «Buscar por proveedor» queda para quien piensa por proveedor.
2. **Paso 2:** si el proveedor tiene más marcas, chips «también te trae» para sumarlas a la misma compra. Una marca de otro proveedor es otra compra.
3. **Lista del día, Historial, Por pagar:** el título son las marcas de esa compra («Kero · Lolita», «Kero y 2 más»); la razón social y el RUC debajo.
   Historial y Por pagar ganan buscar y filtrar por marca.
4. **Proveedores:** sigue siendo una fila por proveedor, con las marcas arriba y la razón social abajo.

## Lo que decide Felipe

1. **Marca nueva sin proveedor conocido:** A · un proveedor «por completar» con el nombre de la marca (pide una marca de estado en el proveedor y,
   a la larga, juntar fichas), o B · el proveedor sigue obligatorio y basta con un nombre (el registro corto que ya existe).
2. **Alcance:** las cinco pantallas, o primero Mis compras.
3. **Ajustes al dibujo.**

Todos los nombres de la maqueta son inventados (el repo es público).
