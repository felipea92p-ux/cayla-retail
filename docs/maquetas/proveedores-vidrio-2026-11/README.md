# Maqueta · Compras ▸ Proveedores con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Compras ▸ Proveedores (`app/(app)/compras/proveedores` →
`components/ProveedoresPanel.tsx`; el ranking de Mercadería, dirección «C · Filas con su venta», Felipe 2026-10-26).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la cara de lo propio, el tema y el ancho (de 320
a 1920 px); «Marcar dos para comparar» muestra «Comparar» con «Para hoy» debajo (y en el celular, la isla oscura). Las casillas de la tabla
también marcan, hasta 3.

Está armada **solo con lo ya elegido**: cabecera A con sus gotas («Nuevo proveedor»), pestañas A con su globito, el segmento de modo («Ordenar
por»), buscador A · Pozo, filtros A · Gotas, tabla B · Placa Serena, insignia A, gráficos B · Tinta sobre vidrio (la línea, el anillo y la
barra), la isla oscura del celular y botones gota.

## Lo propio de Proveedores (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| «Qué hacer» (`ProveedoresLoQueNoSeVe`) | Como ahora | Tarjeta de papel con la lista de tareas (verbo, número, flecha); lo urgente en rojo. |
| | **A · Placa con filas** (recomendada) | La placa Serena; cada tarea una fila que se aclara al pasar, como la lista de los combos; la urgente con su ícono en una gota roja. |
| | B · Tareas en gotas | Cada tarea una gota clara; la urgente, una lente roja. |
| «Comparar» (`ProveedoresComparar`) | Como ahora | Tarjeta de papel, una columna por proveedor, cada dato en su fila. |
| | **A · Placa con columnas** (recomendada) | La placa Serena; el nombre arriba con su × en gota; las filas con rayas finas. |
| | B · Columnas hundidas | Cada proveedor en su pozo, de arriba abajo. |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

El orden del ranking y lo que mide cada columna, el anillo, la barra (lo oscuro ya se vendió), las insignias de ritmo, la fila entera que abre
la vista rápida, el enlace a Por pagar, hasta 3 para comparar, «Para hoy» debajo de «Comparar» y la columna que baja bajo 1280 px.

## Reglas que respeta

Solo tokens. Claro y oscuro. Sin movimiento nuevo; todo se apaga con `prefers-reduced-motion`. Datos inventados. Medida de 320 a 1920 px sin
que nada se salga (a 320 px, «todo vencido» se corta con sus puntos suspensivos, como hoy). «Comparar» alinea cada dato en su fila con
`subgrid`.

## Lo que decidió Felipe

Pendiente.
