# ADR-0124 — Facturación en cuatro vistas, con una «isla» de vidrio

**Fecha:** 2026-09-18 · **Estado:** aceptado (Felipe aprobó el look entre maquetas interactivas y el spec completo el 2026-09-19); R1 (la estructura, 2026-09-19) y las cuatro vistas con su look (R2 rebanadas A a C, R3 y R4, 2026-09-19 a 2026-09-21) construidas y verificadas en el navegador, sin push; la franja de proformas del Resumen (2026-09-21) cierra R2, y las dos migraciones que pidió el Resumen (`fn_ventas_del_dia` y `anular_venta`) están pegadas en producción; falta el cierre (BACKLOG)
**Alcance:** presentación y organización de `/vender/facturacion`. Ninguna regla de negocio ni tabla cambia. La única RPC que se toca es `fn_ventas_del_dia` (una fila por venta y sin las anuladas, migración `20260921103000`): la leen también Caja y Vender, y se arregló en su origen para que las tres pantallas cuenten lo mismo.
**Spec:** `docs/superpowers/specs/2026-09-18-facturacion-cuatro-vistas-design.md`
**Numeración:** nació como 0113 y se renumeró dos veces el 2026-09-19. Primero a 0121: otras dos ramas (`claude/panel-calidad` y `claude/inventory-view-ux-analysis-ca30fa`) ya reclamaban el 0113, `main` tiene el 0114 y el 0116, hay ramas con 0117 a 0120, y el 0115 lo dejó libre la sesión de Caja para quien tenga que moverse. Después a 0124: al sincronizar `main` para empezar la construcción apareció la rama local `claude/interface-recommendations-8ce365` (Cambios, Devoluciones y Atelier) con el 0121, el 0122 y el 0123, y ninguna rama ni worktree usaba el 0124 ni el 0125. Re-verificar antes de cualquier push.
**Reabre parcialmente:** ADR-0011 (movimiento) y ADR-0012 (radios y sombras), solo dentro de Facturación.

## Contexto

Felipe pidió analizar Facturación a partir de un boceto suyo y hacerla «más futurista, sofisticada y con animaciones». La pantalla era una página larga con tres mundos apilados (ventas de hoy, proformas, comprobantes) y una ruta suelta para los códigos de descuento. La pregunta real del líder —«¿qué me falta enviar a SUNAT?»— no tenía lugar, y varias cifras no decían la verdad: «Monto facturado» sumaba todos los estados y los comprobantes de prueba, y una proforma vencida seguía contando como vigente.

Antes de tocar la app se armaron ocho maquetas interactivas con los mismos datos del boceto, hasta que Felipe aprobó una. En el camino cambió el rumbo tres veces: pidió el fondo plano «como el resto del sistema», sin la regla graduada, y pestañas y botones más sobrios.

## Decisión

1. **Cuatro vistas por ruta bajo un layout común**: Resumen, Proformas, Comprobantes y Códigos de descuento. Cada una carga solo lo suyo, así que una consulta caída no tumba las demás. El mes solo aparece donde aplica.
2. **Una «isla» visual de vidrio**: tarjetas de vidrio con un borde izquierdo de 3 px y un color de estado (verde, ámbar, rojo o taupe, los mismos que usa Caja) que se difumina hacia la derecha; pestañas de vidrio con una píldora negra que se desliza; botones compactos; fondo plano. **Reabre ADR-0011 y ADR-0012 solo aquí**: se permiten `backdrop-filter` y un degradado de estado. Se conserva todo lo demás: los tres colores más el semáforo, sin modo oscuro, el rojo como acento, sombra únicamente al pasar el mouse, campos sin caja. Vive bajo una clase del layout y no en `:root`: llevarla al resto de la app sería otra decisión.
3. **«El hilo del comprobante»**: cuatro nodos (venta, número reservado, enviado a SUNAT, aceptado) que muestran hasta dónde llegó cada venta, y *Transmitir* desde la propia fila. Un comprobante «aceptado» en el sandbox de Lucode no se ve como uno real: el color solo no basta (ADR-0015).
4. **Se construye sobre Atelier** (el diseño de Cambios y Devoluciones: nació como ADR-0106 en la rama `interface-recommendations-8ce365` y entró a `main` el 2026-09-19 como **ADR-0123**): `CifraAnimada`, `FechaHoraLima`, `anim-sube`, `hilo-dibuja` y `check-trazo`. La estructura de rutas salió primero, sin depender de esa rama (R1); el Resumen y lo demás se apoyan en Atelier ya en `main`.
5. **Las cifras se dicen honestas**: el comparativo es «el mismo día de la semana pasada, hasta la misma hora», con la misma medida en ambos lados; «Por enviar» cuenta pendientes y rechazados sin filtro de mes; «Monto facturado» son los aceptados en producción; «vencida» se deriva en la proforma.

6. **Las listas se acomodan según el ancho de SU tarjeta, no el de la ventana** (container queries, `@min-[640px]` y `@min-[900px]`): con el menú lateral desplegado una ventana de 768 px deja ~480 px de contenido y una regla por ventana (`sm:`) armaba la tabla de cuatro columnas apretada hasta cortar el estado y los botones (lo halló la verificación de R3 en «Actividad de hoy», de R2). Se usa `@min-[…]` arbitrario porque el CSS compilado ordena las de 640 antes que las de 900.
7. **Cada vista dice de dónde salen sus cuentas y cuánto valen**: «Monto facturado» resta las notas de crédito y aparta lo de prueba, lo que falta enviar y lo que está por confirmar; «Pendientes» y «Rechazados» cuentan todos los meses y lo dicen; los códigos de descuento se leen contra «hoy» en Lima, la misma fecha con la que `registrar_venta` valida al cobrar; las tarjetas no llevan globos de ayuda (la tarjeta recorta lo que se sale).

## Se descartó

- **Un tema oscuro con vidrio** («Tinta y luz»): el más futurista, pero reabría «sin modo oscuro» y habría hecho que Facturación pareciera otro producto junto a Caja y Punto de Venta.
- **Cuadrícula, luces suaves y regla graduada** en el fondo y las tarjetas: se probaron y se quitaron.
- **«Vs. ayer»**: compara medio día contra un día entero y un lunes contra un domingo, así que pinta un rojo sin sentido en una tienda.
- **Cambiar `Boton`**: es compartido y su tipografía en versalitas es otra. Se crea `BotonCompacto` aparte.
- **`?vista=` en una sola página**: pierde el aislamiento de fallos, la carga por vista y el botón atrás.
- **El `EncabezadoPagina` de Atelier**: su título de 46 px desentona con el de 24 px aprobado aquí.

## Consecuencias

- Habrá tres lenguajes visuales en el grupo «Ventas»: Caja (borde de color), Atelier (papel e hilo) y Facturación (vidrio con color de estado). Se comparten tokens, tipografía, chips y el vocabulario de movimiento; lo demás es de cada isla.
- La rebanada 2 depende de Atelier, que entró a `main` el 2026-09-19: el punto de decisión previsto al terminar la primera dejó de hacer falta.
- Sin cambios de esquema en las rebanadas 1 a 3. Si `fn_ventas_del_dia` incluye ventas anuladas en producción, se abre una migración aparte, con el OK de Felipe.
- Cuando `panel-comercial` (ADR-0110) esté en producción, «Vendido hoy» y su referencia pasan a salir de sus funciones SQL: una sola fuente de lo vendido.

## Verificación

Las maquetas se midieron en el navegador (tamaños, pesos y anchos calculados, no solo leídos del CSS): así apareció un error propio, una regla `button{font:inherit}` que inflaba botones y pestañas. La rebanada 1 (R1) ya está construida y se verificó en el navegador con la sesión de líder de Felipe contra la base local el 2026-09-19 (y allí aparecieron tres defectos que ni el CSS escrito ni las revisiones de código veían: recorte de la sombra de la píldora, pestaña activa fuera de pantalla en celular, texto «1 vigentes»). Cada rebanada se verifica con tipos, lint, pruebas de las funciones puras y prueba en el navegador con la sesión de Felipe.
