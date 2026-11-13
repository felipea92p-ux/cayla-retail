## 2026-11-13 (La tienda web deja de rearmar su catálogo cuando nada cambió)
Qué hice: `retail.tienda_catalogo_version()` (migración `20261113202000`, sin pegar), una huella que cambia con todo lo que muestran el
catálogo, los filtros y el probador (el día, precios y fotos, cada movimiento, la Vitrina, campañas, insignias, el Taller y las funciones);
la tienda la pregunta cada 30 s y solo vuelve a pedir la lectura cara (~470 ms en producción) si cambió. Antes de construir, medí: con el
día normal de ADR-0194 cambia hasta 33 veces en la hora punta, y nada de 21:00 a 9:00. En vivo: 3 min de visitas sin cambios, 0
rearmados; precio, campaña, foto y venta se ven a los 3, 4, 18 y 33 s.
Por qué así: una huella que se compara y no una copia guardada en una tabla (el descarte de `20261031161000`), y que solo LEE: un contador
con disparador en `stock` haría esperarse a las cajas entre ellas. La lectura se pide junto con su huella en la misma consulta, así nunca
queda guardado algo bajo una huella que no es la suya. Y las dos copias van una al lado de la otra: Next 16 se salta la caché de una
`unstable_cache` anidada en otra (la primera versión rearmaba igual; se vio midiendo, no leyendo).
Felipe se lleva: pegar `20261113202000` cuando quiera (una parte, sin políticas; la tienda funciona igual sin ella) y, después, correr
`scripts/rendimiento/huella-tienda-por-hora.sql` en el SQL Editor para ver la cifra real; la prueba falla si el catálogo empieza a leer una
tabla que la huella no mira.
