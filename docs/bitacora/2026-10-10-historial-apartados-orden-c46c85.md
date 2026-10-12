## 2026-10-10 (El Historial de Apartados abre en «Todos»)
Qué hice: en Apartados ▸ Historial el filtro «Todos» pasó a ser el primero de la fila y el que viene marcado al entrar; «Necesitan algo», «Por recoger» y «Cerrados» quedan después, para acotar.
Por qué así: un historial se lee completo primero; abrir en «Necesitan algo» mostraba «Todo al día» con la lista vacía aunque hubiera apartados guardados. Solo cambia el orden y el filtro de entrada en `TodosVista.tsx`: ni datos ni reglas.
Felipe se lleva: al entrar al Historial ve todos los apartados de la tienda sin tocar nada. Probado en local en escritorio con datos inventados.

## 2026-10-10 (El Historial de Apartados se lee por período: los últimos 30 días al entrar)
Qué hice: el Historial trae los apartados cerrados de los últimos 30 días al entrar, con los botones Hoy · 7 · 30 · 90 días · Personalizado (Desde/Hasta y «Todo el historial»), como el Historial de ventas. `buscar_separaciones` recibe `p_desde`/`p_hasta` (migración `20261010180000`, con su prueba en `pruebas:separaciones`); otro período se lee desde el navegador sin recargar la pantalla. Si una búsqueda no encuentra nada, ofrece «Buscar en todo el historial».
Por qué así: el rango acota solo lo cerrado, por el día en que se hizo (Felipe). Lo abierto o por devolver sale siempre: lo normal es que no pase de 16 días (7 + extensión de 7 + 2 de gracia), pero un abono suma 2–3 días sin tope y un adelanto que nadie cobró puede quedar meses, y Entregar y el conteo de la pestaña leen la misma lista.
Felipe se lleva: el Historial abre rápido aunque la tienda acumule años de apartados. Falta pegar la migración en producción antes de fusionar; sin ella, la pantalla lee como antes y avisa si se elige otro período.
