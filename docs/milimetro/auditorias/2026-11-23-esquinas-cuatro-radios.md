# Auditoría al milímetro — las esquinas salen de una escala (ADR-0698) · 2026-11-23 · `claude/esquinas-cuatro-radios`

Medido: 56 vistas, 47 a 1440 × 900 y 9 a 375 × 812, en un Chrome de prueba contra el servidor de la rama (`localhost:3010`), antes y
después del cambio y con la misma base local. Las vistas solo abren pantallas; ninguna guarda. Son: el Inicio, Vender (con la caja
cerrada), Historial, Caja, Cambios, Devoluciones, Apartados, Comprobantes, Existencias y la hoja de una prenda, Movimientos, Traslados
y Nuevo traslado, Recibir, Productos en grilla y en tabla con su vista rápida, Nuevo producto, Editar producto, Categorías y Atributos
con una hoja abierta, Campañas, Compras con el cajón de un proveedor, Por pagar, Proveedores con su hoja, Plan de campaña, Mi plata,
Análisis, Frescura, Plan del piso, Rendimiento, Clientes, Colaboradores, Configuración, Finanzas (Resumen, Gastos, Cuentas y dinero,
Estados financieros y Cierre), Producción, Tienda web y sus pedidos, y Actividad.

En cada vista se leyó la esquina que de verdad se pinta en cada pieza con fondo, borde, sombra o recorte: su radio, el lado menor de
la pieza y, si está pegada al borde de otra, la separación y el radio de su contenedor. Las 56 llegaron a la misma pantalla antes y
después. Aparte, a 375 px y en oscuro: Vender, Cambios, Devoluciones, Apartados y Existencias; y el visor de cámara de Existencias, con
una cámara de prueba.

Resumen: **0 graves · 1 media · 2 leves** · las piezas pintadas con un radio de la escala pasaron de 31 % a 73 % (83 % con lo concéntrico) y las esquinas más redondas de lo que su contenedor deja, de 83 a 4; ninguna pieza quedó como cápsula sin serlo antes.

## Lo que se midió

| Medida | Antes | Con este cambio |
|---|---|---|
| Piezas con esquina, sin píldoras, círculos ni remates de menos de 4 px | 1.582 | 1.564 |
| De esas, con un radio de la escala (6 · 10 · 14 · 22 · 26 · 28 · 32) | 489 (31 %) | 1.148 (73 %) |
| Con un radio concéntrico que sale de una cuenta (13 y 16 px) | — | 152 |
| Fuera de la escala | 1.093 | 264, todas de piezas de diseño propio |
| Medidas distintas en las 56 vistas, con los remates | 20 | 18 |
| Medidas distintas por pantalla | 6 de mediana, hasta 12 | 5 de mediana, hasta 9 |
| Esquinas de una pieza pegada al borde de otra, más redondas de lo que deja | 83 en 7 pares | 4 en 3 pares |
| Piezas con un radio de la escala que quedan como cápsula | — | 5 firmas, las mismas de antes |
| Esquinas escritas a mano en el código | 659 en 145 archivos | 434 en 52 |

Criterio de «más redonda de lo que deja»: nunca más que su contenedor y, a 12 px o menos del borde, no más que el radio de afuera menos
la separación, con 2 px de holgura.

## Hallazgos

| # | Gravedad | Qué | Dónde | Estado |
|---|---|---|---|---|
| 1 | Media | La foto de cada tarjeta era más redonda (14) de lo que deja su tarjeta (20, a 10 px del borde): 48 esquinas en una pantalla | Existencias, la tarjeta Vitrina | Resuelto: la tarjeta va a 22, como toda tarjeta, y la foto y la tira de tallas a 22 − 9 |
| 2 | Leve | La placa de quien entró (20) era más redonda de lo que deja el menú (28, a 12 px) | El menú, en toda pantalla | Resuelto: 28 − 12, y su botón 28 − 20 |
| 3 | Leve | Las filas del Historial (20) iban dentro de una placa de 22, a 7 px | Ventas ▸ Historial | Resuelto: 14 |

Quedan 4 esquinas marcadas: 2 del sello de un tipo en Movimientos (diseño propio) y 2 de un enlace dentro de un aviso chico, que solo
pinta su fondo al pasar el mouse.

## Sin medir

- El cobro de Vender: hace falta una caja abierta, que es escribir en la base local compartida. Su hoja de estilos no se tocó; las
  utilidades que usa sí siguen a la escala.
- Las hojas y modales que no se abrieron (se abrieron seis) y los visores de Bajar al piso y de Contar.
- El Inicio de almacén y Producción dentro del Taller: la cuenta de prueba estaba en Tienda Lima.
- El «antes» en oscuro: el radio no depende del tema; el «después» sí se miró en oscuro, en 13 vistas.
- Un teléfono de verdad y Safari: el celular es emulado.
- Lo impreso: las esquinas de un ticket, una boleta o una etiqueta que usan una utilidad se mueven 2 px, como en pantalla. No se
  imprimió nada. Lo que se mide en milímetros no cambió.
