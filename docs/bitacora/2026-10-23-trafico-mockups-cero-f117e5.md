## 2026-10-23 (Tienda web ▸ Tráfico: tres maquetas nuevas, desde cero)
Qué hice: tres direcciones para ver el tráfico de la tienda online en `docs/maquetas/trafico-cero-2026-10/` — A «El hilo» (el recorrido como una cinta que se adelgaza, con un nudo donde se atora), B «De cada 100» (seis grillas de 100 figuritas que se cuentan) y C «La vitrina» (un mosaico de las 21 prendas reales, del tamaño de lo que las miraron y con sus colores de verdad). Las tres responden las seis preguntas sin bajar a 1440 × 900, con tres períodos, filtro por camino y por ciudad, cajón de la prenda, vista de tabla, claro y oscuro.
Por qué así: hoy la tienda no cuenta visitas (solo su velocidad, ADR-0447), así que las visitas se inventan persona por persona con una semilla fija y todo se cuenta desde esa misma lista: filtrar por Instagram da exactamente la fila de Instagram. Las prendas, categorías y colores son los del catálogo real (base local).
Felipe se lleva: elegir una dirección (recomiendo C), decidir cómo se medirán las visitas de verdad y dónde entra Tráfico en el menú (Tienda web ya tiene 6 hijas, `TOPE_HIJAS = 6`); el módulo nacería solo para el líder (ADR-0161).

## 2026-10-23 (Tráfico: Felipe eligió C · La vitrina)
Qué hice: dejé C como la elegida en la maqueta (abre en C, con ✓ en la barra) y lo anoté en su README; A y B quedan solo para comparar.
Por qué así: C es la única donde lo primero que se ve es la prenda con su color de verdad; «dónde se atora» lo responde igual, en la tira de arriba.
Felipe se lleva: siguen abiertos dónde entra Tráfico en el menú (Tienda web ya tiene 6 hijas) y cómo se medirán las visitas de verdad.

## 2026-10-23 (Tráfico: dónde entra en el menú)
Qué hice: anoté la decisión de Felipe en el README de la maqueta y en el backlog: Tráfico es la 7.ª hija de «Tienda web», con la excepción `tiendaWeb: 7` en `EXCEPCIONES_TOPE_HIJAS`, y su propio módulo, solo para el líder.
Por qué así: como entrada del menú es un módulo (ADR-0306), así el líder lo da a quien quiera, aparte del Resumen; como pestaña del Resumen lo habría visto todo el que ve el Resumen.
Felipe se lleva: falta decidir cómo se medirán las visitas; sin eso la pantalla no tiene datos reales. El código (menú, módulo, migración y ADR) va en la misma construcción.

## 2026-10-23 (Tráfico: la medición propia y la pantalla, actividades 1 a 8, ADR-0495)
Qué hice: la tienda online anota pasos anónimos en `retail.trafico_web` (entró, vio la prenda, eligió talla, a la bolsa, separó; nunca un nombre, un DNI ni la IP) y el ERP tiene Tienda web ▸ Tráfico, solo para el líder: el recorrido con dónde se atora, la vitrina de prendas por miradas con el cajón de cada una, de dónde vienen, a qué hora entran, tres períodos (7 días, 30 días, la campaña), filtros, vista de tabla, guía de 14 pasos, oscuro y anchos de 375 a 1920. El QR del cartel y el look compartido llevan su marca de camino. Un commit por actividad (`6298ade4d` … `fca5b7d71`).
Por qué así: se cuenta por persona y por el paso más lejano al que llegó, así el recorrido nunca crece hacia abajo; dónde se atora se contrae hacia lo de costumbre para que dos personas no muevan el veredicto; cada lista de filtros se cuenta sin su propio filtro, para poder pasar de un camino a otro.
Felipe se lleva: pegar las dos migraciones en producción, juntos (`20261023230000` y después `20261023231000`); recién después tiene sentido publicar la tienda con la medición. Y decidir los 3 cambios de la pasada rápida de `/formidable`.

## 2026-10-27 (Tráfico: eliminar una prenda que la gente miró)
Qué hice: una prenda que alguien miró en la tienda online ahora se puede eliminar desde Catálogo, con «Eliminar con su historia» y un aviso de cuántas personas la miraron; sus visitas se quedan en Tráfico sin la prenda (`20261027211000`). Lo pidió Felipe al ver que la tabla de visitas frenaba el borrado (la prueba `eliminar-producto` del CI lo marcó).
Por qué así: borrar las visitas bajaría las cifras de días pasados; dejarlas sin la prenda las conserva y la tabla sigue sin editarse salvo eso. El renglón nuevo se ancla en el 19 para no romper las migraciones de pedidos web y de compras que se vuelven a pegar.
Felipe se lleva: pegar esa migración en producción antes de fusionar el PR #1394.
