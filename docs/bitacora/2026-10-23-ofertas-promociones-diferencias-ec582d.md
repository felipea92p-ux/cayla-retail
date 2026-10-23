## 2026-10-23 (Ofertas de una campaña: «Tres preguntas» — ADR-0496, solo en local)
Qué hice: la hoja «Configurar» de una campaña (Catálogo ▸ Insignias ▸ Campañas) ahora registra OFERTAS con el formulario «Tres preguntas» que eligió Felipe (¿Qué le das al cliente? · ¿En qué prendas y dónde? · ¿Cuándo?), con días de la semana («solo martes y jueves»), solo/fuera de categorías, borrador y activar por líder, historial al editar y la etiqueta que se arma con cada respuesta. Hoy solo existe «un % menos»; las otras formas se ven apagadas con «Pronto».
Por qué así: la caja ya leía el descuento de una sola función (`fn_campanas_en_sede`), así que las ofertas entran por ahí y Vender, Apartados, la tienda web, el club y `registrar_venta` las heredan sin tocar el cobro. Una oferta que nunca rige (ningún día cae entre sus fechas) es un estado imposible: la base la rechaza.
Qué se rompería sin esto: un descuento «solo martes y jueves» se tendría que registrar como dos campañas o apagarse a mano cada día, y quien no es líder no podría dejarlo preparado.
Estado: migración `20261023232000` aplicada SOLO a la base local (58/58 casos en `pnpm pruebas:campana-reglas`); NO está en producción, nada se subió ni se hizo commit. Probado en el navegador como líder y como Integrante, en claro, oscuro y a 375 px, y la guía interactiva recorre sus 28 pasos. Suite de la web en verde.

## 2026-10-23 (más tarde: las tiendas por oferta y sin el formulario viejo — ADR-0496)
Qué hice: Felipe objetó al probarla: no podía elegir las tiendas de una oferta y «Cambiar tiendas» abría la hoja vieja (y después, al embeberla, objetó otra vez: la hoja nueva reemplaza a la vieja, no la contiene). Ahora cada oferta puede regir solo en algunas tiendas de su campaña (tabla `campana_regla_sedes`) y el formulario viejo ya no aparece en Insignias: sus campos viven en las tres preguntas de cada oferta; lo que queda de la campaña (cambiar o repetir sus fechas, retirar su descuento de siempre, quitar un límite de tiendas) se toca en su franja.
Por qué así: cada campo de la hoja vieja ya tenía su pregunta en el asistente; mostrar los dos era pedirle a la persona que aprenda dos maneras de lo mismo. La base cuida que una oferta no llegue a una tienda donde su campaña no rige.
Qué se rompería sin esto: una promoción «martes solo en Lima, jueves solo en Trujillo» no se podía registrar, y quien tocaba «Cambiar tiendas» se encontraba con la ventana de la que se suponía reemplazada.
Estado: migración local reaplicada (65/65 casos); suite de la web, tipos, Knip y lint en verde; guía interactiva de 26 pasos sin escribir; probado en el navegador. Sigue SIN commit y sin producción. Falta decidir dónde se eligen las categorías de la campaña (ver backlog).

## 2026-10-23 (ajustes finales de la pregunta 2 — ADR-0496)
Qué hice: quité el botón «Todas las tiendas» (la persona marca cada tienda; sin ninguna marcada no se puede seguir ni guardar y el «Falta:» lo dice) y los conteos por categoría ahora dicen cuántas prendas de la campaña alcanzaría la oferta, sin las de Claurè salvo que se incluyan.
Por qué así: un botón «Todas» escondía una decisión (qué pasa con una tienda nueva); marcarlas todas la deja explícita y la base las guarda como sin límite. Un conteo de la categoría entera prometía más prendas de las que la oferta baja.
Qué se rompería sin esto: una oferta guardada sin querer en todas las tiendas, y una cifra de «prendas afectadas» que no cuadra con lo que cobra la caja.

## 2026-10-23 (se acoplan los cambios de producción en la hoja de ofertas — ADR-0496)
Qué hice: traje `main` (106 commits, entre ellos el rediseño de la hoja de la campaña, ADR-0488) y lo acoplé a «Tres preguntas» sin perder las etapas: ahora son ¿Qué le das? → ¿Cuándo? → ¿En qué prendas y tiendas?; bajo el % sale la alerta de «por debajo del costo» de producción; la etiqueta de la derecha es la de producción con un resumen de qué prendas, en qué tiendas y cuándo rige la oferta; y las categorías usan su grilla por familia.
Por qué así: producción ya tenía piezas más completas (etiqueta viva, grilla, alerta) y Felipe pidió una sola de cada: mantener las etapas hace el formulario más amable, y usar las piezas de producción evita que la persona aprenda dos etiquetas y dos grillas distintas para lo mismo.
Qué se rompería sin esto: dos hojas de campaña que se ven y cuentan distinto (1 696 prendas en un lado y 1 679 en otro), y una alerta de costo que dejaría de verse justo cuando se elige el descuento.
Estado: sigue SOLO en local y sin producción (migración `20261023232000`); hay un commit WIP y el merge de main en la rama, sin push. Suite web, tipos, Knip, eslint, 65 casos SQL, guía de 27 pasos y auditoría de tema en verde. Decisión abierta: dónde se eligen las categorías de una campaña nueva (ver backlog).

## 2026-10-23 (¿Cuándo y dónde? y la selección de prendas de producción — ADR-0496)
Qué hice: Felipe pidió que las tiendas se elijan junto a las fechas y que las prendas se elijan como en producción. Ahora la etapa 2 es «¿Cuándo y dónde?» (fechas, días y tiendas) y la 3, «¿En qué prendas?», es la grilla de categorías de producción con todas las categorías, su buscador y «Elegir todas / Quitar todas».
Por qué así: la etapa de fechas quedaba casi vacía, y la grilla de producción es la que la gente ya conoce. Para que se pueda marcar cualquier categoría, «solo estas categorías» ahora rige en ellas aunque la campaña no las tenga; sumarlas a la campaña habría cambiado en silencio el descuento de siempre y las otras ofertas.
Qué se rompería sin esto: una grilla que lista 31 categorías pero solo deja usar las pocas que la campaña ya tiene, o una oferta en borrador que cambia precios de otras ofertas antes de que un líder la active.
Estado: la migración local se reaplicó (68/68 casos SQL); suite web, tipos, Knip, eslint, guía de 27 pasos y auditoría de tema en verde; probado en el navegador a 1440, 1024 y 375 px. Sigue solo local, sin producción. Costo asumido: esas prendas no entran a la vitrina ni al pase de la campaña hasta marcarlas en «Prendas».



## 2026-10-23 (familias plegables en la grilla de categorías — ADR-0496)
Qué hice: cada familia de la grilla de categorías de la etapa «¿En qué prendas?» se pliega con un toque en su título o su flecha; empiezan plegadas las que no tienen nada marcado, y el título dice cuántas hay marcadas. Es una opción de la grilla (`plegables`) que solo usa esta hoja.
Por qué así: con 31 categorías la grilla ocupaba varias pantallas. Plegar por familia deja ver las 5 de un vistazo sin esconder lo marcado.
Qué se rompería sin esto: una colaboradora que baja y baja buscando una categoría, o que marca una y no ve que la marcó.

