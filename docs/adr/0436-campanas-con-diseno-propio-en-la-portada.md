# ADR-0436 — Tienda web ▸ Campañas: cada campaña con su diseño en la portada, y una sola regla de cuál sale

- **Fecha:** 2026-10-17 · **Estado:** aceptado (Felipe aprobó las maquetas, «implementa todo tal cual», y la lista de 9 actividades).
  Se construye actividad por actividad (`/construir`); este ADR crece con cada una. **Nada está en producción**: cada migración se pega con
  su OK.
- **Rama:** `claude/campanas-design-customization-ddbd90`.
- **Maqueta:** `docs/maquetas/campanas-diseno-2026-10/` (con sus decisiones del 2026-10-17).
- **Relacionados:** ADR-0408 (la tienda online y su portada), ADR-0430 (el grupo «Tienda web»), ADR-0107/0108/0302/0403 (la etiqueta de
  campaña, su descuento en caja y cómo se redondea), ADR-0293 (quién configura una campaña hoy), ADR-0161 y ADR-0306 (módulos y roles).

## El problema

Felipe: «quiero que el diseño de las campañas se pueda personalizar desde algún apartado dentro del módulo de Tienda Web, ya que ahora
siempre es el mismo fondo para todos […] que cualquier colaboradora pueda exprimir su creatividad». Hoy la portada de la tienda online pinta
toda campaña con los mismos colores fijos de `apps/tienda/app/globals.css` (`--t-hero: #6a2118`), y la regla de qué campaña anuncia vive
escondida dentro de `retail.tienda_portada()`: con tres campañas que se cruzan en octubre, nadie en el ERP podía saber cuál salía.

**Analogía CAYLA:** la vitrina de la calle tiene un solo fondo rojo pintado en la pared, y cada fecha especial se anuncia con el mismo
cartel. Lo que se construye es la caja de telones de la vitrina —uno por campaña— y el calendario colgado al lado que dice qué telón va
cada semana.

## Decisiones de Felipe (2026-10-17)

1. **Dónde vive:** «Campañas» es una pantalla del grupo «Tienda web» (ADR-0430 ya lo había creado: entra como su sexta hija, después de
   Vitrina, en el tope de 6).
2. **Una campaña sin descuento sale en la portada** si tiene prendas o diseño propio; con dos a la vez, la de descuento primero, salvo
   que se cambie a mano (actividad 6).
3. **Una sola llave, como hoy:** quien ve Campañas la diseña y le pone el descuento (se descartó separar el diseño del descuento).

## Actividad 1 — El módulo, la regla de la portada en un solo lugar y la lista (`20261017144000`)

**DECIDÍ 1 — El módulo `campanas`, sexta hija de Tienda web, nace solo para el líder.** Es una entrada del menú, así que es un módulo
(ADR-0306), y todo módulo nuevo nace sin rol (ADR-0161).
**DESCARTÉ** reusar el módulo `etiquetas`, que hoy configura las campañas: ese módulo también abre las etiquetas que no son campaña (Para
liquidar, Estreno) en Atributos, y un módulo con dos pantallas en dos grupos del menú es justo lo que ADR-0306 prohíbe.
**SE ROMPE SI** nadie le da el módulo a quien hoy configura campañas: en producción, el 2026-10-17, «Terminal Almacén» y «Terminal de
ventas» tienen Etiquetas. Desde la actividad 2 configurar una campaña pide Campañas, así que esas terminales lo pierden hasta que el líder
se lo dé en Roles y accesos (se le avisa a Felipe al publicar).

**DECIDÍ 2 — LA regla de qué campaña anuncia la portada vive una sola vez, en `retail.fn_campana_en_portada(dia)`.** `tienda_portada()`
la pregunta por hoy y `campanas_portada_dias(desde, hasta)` día por día para el ERP. La regla es la de siempre, copiada tal cual (verificada
igual en producción el 2026-10-17): aprobada, activa, con descuento, vigente ese día y con prendas o categorías; la que termina primero, luego
la de mayor descuento, luego por nombre. La migración comprueba al final que la tienda ve hoy exactamente lo mismo que antes.
**DESCARTÉ** repetir la regla en TypeScript para dibujar la línea del ERP: el día que cambie (la actividad 6 la cambia) habría dos reglas,
y el ERP podría decir «sale el Gato» mientras la tienda muestra otra cosa.
**SE ROMPE SI** alguien vuelve a pegar `20261014220000` (la tienda online) después de esta: `tienda_portada()` vuelve a tener la regla
adentro. Hoy da lo mismo; cuando la actividad 6 cambie la regla, esa migración llevará su candado.

**DECIDÍ 3 — La pantalla solo mira:** las cifras de hoy (qué anuncia la portada, cuántas corren, cuál viene), la línea «La portada, día a
día» de tres meses y las campañas con un filtro. Mientras ninguna tenga diseño, su portada en chico usa los colores de siempre (son un dato
de la portada, `data-color-dato`, no del tema). La configuración sigue en Atributos hasta la actividad 2, y la pantalla lo dice con su
enlace.

**Verificación:** `pnpm pruebas:campanas-portada` (25 casos: la regla día por día, los empates, la tienda pregunta lo mismo, la lista, quién
la lee y la migración dos veces); en el navegador, el líder la ve y una colaboradora sin el módulo cae en «Tu rol no ve "Campañas"»; modo
oscuro y 375 px sin desborde; la guía recorre sus 8 pasos en escritorio y celular. Las suites `tienda_puerta` e `tienda_inicio` pasan sus
casos de la regla; sus casos «como tienda_web» no corren en la imagen local `supabase/postgres:17.6.1.143`, que se cae con
`grant tienda_web to current_user with set true` aunque sea lo único de la transacción (no es de esta rama).
