# ADR-0113 — Facturación en cuatro vistas, con una «isla» de vidrio

**Fecha:** 2026-09-18 · **Estado:** aceptado (Felipe lo aprobó entre maquetas interactivas); la construcción está pendiente
**Alcance:** presentación y organización de `/vender/facturacion`. Ninguna regla de negocio, RPC ni tabla cambia.
**Spec:** `docs/superpowers/specs/2026-09-18-facturacion-cuatro-vistas-design.md`
**Numeración:** escrito como 0113 porque del 0109 al 0112 ya están tomados en otras ramas. Renumerar si choca al sincronizar.
**Reabre parcialmente:** ADR-0011 (movimiento) y ADR-0012 (radios y sombras), solo dentro de Facturación.

## Contexto

Felipe pidió analizar Facturación a partir de un boceto suyo y hacerla «más futurista, sofisticada y con animaciones». La pantalla era una página larga con tres mundos apilados (ventas de hoy, proformas, comprobantes) y una ruta suelta para los códigos de descuento. La pregunta real del líder —«¿qué me falta enviar a SUNAT?»— no tenía lugar, y varias cifras no decían la verdad: «Monto facturado» sumaba todos los estados y los comprobantes de prueba, y una proforma vencida seguía contando como vigente.

Antes de tocar la app se armaron ocho maquetas interactivas con los mismos datos del boceto, hasta que Felipe aprobó una. En el camino cambió el rumbo tres veces: pidió el fondo plano «como el resto del sistema», sin la regla graduada, y pestañas y botones más sobrios.

## Decisión

1. **Cuatro vistas por ruta bajo un layout común**: Resumen, Proformas, Comprobantes y Códigos de descuento. Cada una carga solo lo suyo, así que una consulta caída no tumba las demás. El mes solo aparece donde aplica.
2. **Una «isla» visual de vidrio**: tarjetas de vidrio con un borde izquierdo de 3 px y un color de estado (verde, ámbar, rojo o taupe, los mismos que usa Caja) que se difumina hacia la derecha; pestañas de vidrio con una píldora negra que se desliza; botones compactos; fondo plano. **Reabre ADR-0011 y ADR-0012 solo aquí**: se permiten `backdrop-filter` y un degradado de estado. Se conserva todo lo demás: los tres colores más el semáforo, sin modo oscuro, el rojo como acento, sombra únicamente al pasar el mouse, campos sin caja. Vive bajo una clase del layout y no en `:root`: llevarla al resto de la app sería otra decisión.
3. **«El hilo del comprobante»**: cuatro nodos (venta, número reservado, enviado a SUNAT, aceptado) que muestran hasta dónde llegó cada venta, y *Transmitir* desde la propia fila. Un comprobante «aceptado» en el sandbox de Lucode no se ve como uno real: el color solo no basta (ADR-0015).
4. **Se construye sobre Atelier** (ADR-0106 de la rama `interface-recommendations-8ce365`, el diseño de Cambios y Devoluciones): `CifraAnimada`, `FechaHoraLima`, `anim-sube`, `hilo-dibuja` y `check-trazo`. La estructura de rutas sale primero, sin depender de esa rama; el Resumen y lo demás esperan a que entre a `main`.
5. **Las cifras se dicen honestas**: el comparativo es «el mismo día de la semana pasada, hasta la misma hora», con la misma medida en ambos lados; «Por enviar» cuenta pendientes y rechazados sin filtro de mes; «Monto facturado» son los aceptados en producción; «vencida» se deriva en la proforma.

## Se descartó

- **Un tema oscuro con vidrio** («Tinta y luz»): el más futurista, pero reabría «sin modo oscuro» y habría hecho que Facturación pareciera otro producto junto a Caja y Punto de Venta.
- **Cuadrícula, luces suaves y regla graduada** en el fondo y las tarjetas: se probaron y se quitaron.
- **«Vs. ayer»**: compara medio día contra un día entero y un lunes contra un domingo, así que pinta un rojo sin sentido en una tienda.
- **Cambiar `Boton`**: es compartido y su tipografía en versalitas es otra. Se crea `BotonCompacto` aparte.
- **`?vista=` en una sola página**: pierde el aislamiento de fallos, la carga por vista y el botón atrás.
- **El `EncabezadoPagina` de Atelier**: su título de 46 px desentona con el de 24 px aprobado aquí.

## Consecuencias

- Habrá tres lenguajes visuales en el grupo «Ventas»: Caja (borde de color), Atelier (papel e hilo) y Facturación (vidrio con color de estado). Se comparten tokens, tipografía, chips y el vocabulario de movimiento; lo demás es de cada isla.
- La rebanada 2 depende de Atelier; hay un punto de decisión con Felipe al terminar la primera.
- Sin cambios de esquema en las rebanadas 1 a 3. Si `fn_ventas_del_dia` incluye ventas anuladas en producción, se abre una migración aparte, con el OK de Felipe.
- Cuando `panel-comercial` (ADR-0110) esté en producción, «Vendido hoy» y su referencia pasan a salir de sus funciones SQL: una sola fuente de lo vendido.

## Verificación

Las maquetas se midieron en el navegador (tamaños, pesos y anchos calculados, no solo leídos del CSS): así apareció un error propio, una regla `button{font:inherit}` que inflaba botones y pestañas. **No hay código de producto todavía**; cada rebanada se verifica con tipos, lint, pruebas de las funciones puras y prueba en el navegador con la sesión de Felipe.
