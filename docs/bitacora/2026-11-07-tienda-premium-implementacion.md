## 2026-11-07 (Tienda online: el rediseño Premium en producción — ADR-0626)
Qué hice: llevé a `apps/tienda` la maqueta Premium (`docs/maquetas/tienda-premium-2026-11/`, PR #1695) en doce actividades con su commit
cada una: base del sistema (botones, campos, error global), cabecera y pie (Recomendaciones al pie), una insignia por tarjeta, Inicio
(Club en vino, bajadas; sin «Outfits listos» ni «Las ofertas», que Felipe pidió sacar por ser demasiado para la primera pantalla), fichas de filtros en el catálogo, la galería de la ficha, la búsqueda con disponibilidad y lo
recién llegado, los nombres «Outfits listos» / «Arma tu outfit», la bolsa con «Pagas hoy» y sus plazos, Entrar en una tarjeta, y dos
páginas nuevas: `/club` y `/preguntas-frecuentes`.
Por qué así: solo lo visual y lo que ordena; lo que choca con una regla ya decidida (ADR-0458, sin migas, paginación) se dejó y está
escrito en el ADR-0626. Toda cifra sale de la base (plazos, puntos, disponibilidad).
Qué se rompería sin esto: la tienda seguiría con el Club en el mismo rojo que los botones, cuatro nombres para los outfits, una bolsa que
no dice cuándo se paga y una búsqueda que no dice si hay en tu tienda.
Cómo se verificó: en local, con 375 prendas reales sembradas en la base local (script fuera del repo; las previas de Vercel no construyen
la tienda), a 1440 y 390 px; 1064 pruebas de la tienda, tipos, lint y Knip en verde.
