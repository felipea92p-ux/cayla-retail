# 2026-10-24 · Las píldoras de «Las ofertas» cambian al instante (tienda)

- **Problema:** en producción, tocar una píldora de campaña en el Inicio de la tienda esperaba 2–9 s (medido: 2,1 a 8,9 s con la caché vencida; 0,3 s en local) porque pedía la página entera al servidor; mientras tanto la lista quedaba al 45 % con la píldora ya marcada, y parecía que el toque no funcionaba.
- **Cambio:** `components/OfertasPorCampana.tsx` (cliente). El servidor arma la lista de cada campaña (hasta 8 tarjetas c/u, las no vistas en `hidden`) y el navegador solo elige cuál mostrar; «Ver todas» y su número siguen a la elegida; la dirección se actualiza con `replaceState` y cada píldora conserva su `href` (sin JavaScript navega como antes). Desvanecido de 0,28 s, sin rebote, apagado con «reducir movimiento». Colores de letra intactos.
- **Verificado:** página temporal con datos de ejemplo (borrada): cambio en 76 ms, URL, píldora y «Ver todas» correctos; `tsc` y `eslint` limpios. Local no tiene campañas: falta verlo con las reales.
- **Costo:** el Inicio trae ~3 listas de 8 tarjetas en vez de una.
