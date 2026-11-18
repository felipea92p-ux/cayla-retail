## 2026-11-13 (Recibir: el precio de la IA se calcula antes de llegar al paso)
Qué hice: en «Crear la prenda que llegó», la propuesta de precio se pide al pasar de «Cómo es» a «Tallas y colores» (`adelantarPropuestaDePrecio`), y al llegar a «Precio» la pieza toma esa misma consulta, lista o a medio camino, en vez de pedir otra.
Por qué así: la IA lee el nombre, el tejido y el detalle, que se llenan en el paso 1; pedirla al abrir la hoja la haría sin esos datos y, al elegir tejido, gastaría una segunda consulta. Si la adelantada falla, se pide sola al llegar, como antes.
Felipe se lleva: una sola consulta por prenda y casi sin espera en el paso del precio; verificado en local (una sola petición, ninguna en el paso 1), falta verlo con la clave real en producción.
