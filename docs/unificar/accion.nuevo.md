# Botón «Nuevo / Agregar / Registrar» — una sola pieza (ADR-0358)

**Decidido:** 2026-10-07, Felipe, **mirando** (página de elegir de la ronda 2). **Elegida:** B, versalitas de 11 px y 40 px de alto (la de
`label-cayla`). **Pieza:** `<Boton>` y, para lo que navega, `<BotonEnlace>` (`components/ui/campos.tsx`).

La acción principal de una pantalla («+ Registrar factura», «+ Registrar gasto», «+ Nuevo cliente», «+ Nueva orden») y el botón que le hace
pareja al lado (Exportar, Ver órdenes, Actividad) se ven igual en todo el ERP: `peso="primario"` (tinta) para la acción, `peso="fantasma"` (borde)
para su pareja.

## Qué se comparó

| Forma | Dónde vivía | Cómo se veía | Movimiento |
|---|---|---|---|
| A · `btn-cayla` | 21 pantallas: Finanzas, Productos, Caja, Colaboradores | 34 px, letra normal de 13,5 px | solo cambia de color (150 ms) |
| **B · `label-cayla`** | ~24 usos en 21 pantallas: Compras, Clientes, Producción, formularios | 40 px, VERSALITAS de 11 px | en `<Boton>`: barrido de luz, se encoge al presionar, hilo al guardar; copiada a mano: solo color |
| C · propuesta | — | letra normal, 40 px, «+» dibujado | — |

Las tres se mostraron en las mismas tres pantallas (Compras, Finanzas ▸ Gastos, Clientes). Los botones de Vender (`BotonCompacto`) **no entraron**:
se deciden con la pasada de la cuenta `terminal-ventas`.

![comparativa](capturas/accion.nuevo.jpg)

## Por qué esta

Es la que ya tenían la mitad de las cabeceras y los formularios, y es la única con movimiento propio. Se pierde la letra normal de `btn-cayla`
en esos botones; la jerarquía completa de botones (Cancelar, Guardar en las hojas…) es otra ronda (`boton`).

## El movimiento de la pieza (ronda 3, Felipe 2026-10-07, eligiéndolo con botones vivos: la D, más la animación del «+»)

Es el ÚNICO movimiento de un botón en el ERP: `.mov-boton` (`app/globals.css`). Antes había tres: el barrido de `<Boton>`, el «se levanta
1 px con sombra» de la barra de vidrio de Comprobantes (`BotonCompacto`) y el «se levanta, barrido lento de 800 ms y la flecha avanza» de los
pasos de Cambios y Devoluciones (`FlujoGuiado`, clase `boton-brillo`, que ya no existe). Felipe eligió la D tocándola y le pidió al «+» la
animación que la C tenía en la flecha.

- **Al pasar el mouse:** sube 2 px con su sombra, cruza una luz (`cayla-brillo`, 650 ms, una vez) y el primario pasa a rojo profundo (la pareja,
  borde y letra a rojo). El «+» da un cuarto de vuelta (el «+ » del texto se dibuja como ícono, `conMas` en `campos.tsx`) y la flecha que va
  adelante se adelanta 4 px.
- **Al presionar:** se encoge un 3 % y baja; deshabilitado, no.
- **Mientras guarda** (`cargando`): un hilo corre por el borde de abajo y el botón no se puede volver a tocar.
- **Con el teclado:** el anillo único del ERP (ADR-0351).
- Todo se apaga con `prefers-reduced-motion`.

Lo que se ganó al migrar: los botones B copiados a mano (Compras, Producción, Proveedores, Notas de crédito, Familias) solo cambiaban de color
y su hover era el rojo de marca; ahora tienen el barrido, el encogerse y el hover de la guía (rojo profundo). Los de `btn-cayla` pasan de 150 ms
de color a todo el movimiento.

Lo usan `<Boton>`, `<BotonEnlace>`, `<BotonAncla>`, `BotonCompacto` (Comprobantes: conserva su cara de 13 px, toma el movimiento),
`FlujoGuiado` (Cambios y Devoluciones) y los botones que tenían el barrido viejo (Notas de crédito, Compras agrupadas, el buscador de
ventas). Verificado pasando el mouse en Gastos, Proformas y Cambios: corren el barrido, la subida y la sombra; el «+» gira 90° y la flecha
avanza 4 px. La firma `boton-brillo` impide que vuelva el barrido viejo.

## Lo que queda distinto a propósito

- **El «Registrar N» del anillo de Análisis** (`components/analisis/TodaviaNo.tsx`): tiene su propio diseño y movimiento (ADR-0357). Felipe dice
  si se unifica.
- **Vender** (`BotonCompacto`: Nueva cotización, Nueva serie): espera la pasada de `terminal-ventas`.

## Deuda al decidir

20 archivos (`pnpm --filter web unificar:deuda accion.nuevo`), migrados módulo por módulo el mismo día (un commit por módulo): Compras,
Producción, Catálogo, Inventario (Traslados), Caja, Colaboradores, Configuración y Finanzas. **Deuda: 0.** El censo de después encontró un
21.º que la firma no veía (el «+ Agregar …» del kit de Atributos, con el texto en una variable) y también se migró.

Después de migrar, el censo de esas 14 pantallas cuenta 3 formas, todas con el mismo movimiento: el primario (40 px), su pareja con borde
(42 px: el borde suma 2) y el primario de Compras (42 px: lo estira su vecino con ícono). Son medidas de contenido, no dos diseños.

**Lo que cambió de lugar:** en Caja los cuatro botones en versalitas ya no caben junto al título a 1440 px y bajan de fila; la columna se
quedó a la derecha (`sm:ml-auto`), donde la busca quien cierra la caja.

**Lo que queda para la ronda `boton`:** unas 20 copias a mano de la versalita en las hojas («Guardar», «Confirmar», «Pagar»: `BTN_PRIMARIO` de
`CerrarFaltanteModal` y `ReasignarReparto`, `RegistrarNotaCreditoModal`, `EnvioRecibido`…), sin barrido ni encogerse. No son «Nuevo».
