## 2026-11-07 (Catálogo ▸ Costos explica el costo de cada talla — ADR-0631)
Qué hice: revisé en producción el Short Sohanna. La compra del 7-nov, a S/ 48, dejó 48 / 46.50 / 48, y la cuenta estaba bien: en Azul
marino 30 quedaba 1 sin vender a S/ 45. Con eso, la pestaña Costos de la ficha ahora:
- dice cuánto cuesta hoy cada prenda (S/ 47.25, la misma cifra del Historial), con un enlace que abre el Historial en «Costo»;
- lleva en cada talla gris un «?» con su cuenta;
- ofrece poner el costo de la última compra a las tallas que aún no llegan por compra;
- ya no corta la columna «Costo».

La cuenta de cada talla la da una función nueva de solo lectura (`fn_costo_de_las_tallas`, `20261107232000`).
Por qué así: el costo se lleva por talla (cada una tiene su promedio), y eso está bien para valorizar el inventario. Lo que confundía era que
la pantalla no decía de dónde salía cada número. Las tallas que no llegaron no se igualan solas: una compra de la talla 28 no prueba lo que
cuesta la 32. Por eso es un botón que la persona decide usar.
Felipe se lleva: un SQL de solo lectura por pegar (sin él la ficha funciona igual, solo que el «?» explica en palabras). También una pregunta
de negocio: ¿los S/ 45 de la carga inicial eran el costo real o un estimado?
