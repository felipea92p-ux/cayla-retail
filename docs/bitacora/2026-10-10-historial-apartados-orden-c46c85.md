## 2026-10-10 (El Historial de Apartados abre en «Todos»)
Qué hice: en Apartados ▸ Historial el filtro «Todos» pasó a ser el primero de la fila y el que viene marcado al entrar; «Necesitan algo», «Por recoger» y «Cerrados» quedan después, para acotar.
Por qué así: un historial se lee completo primero; abrir en «Necesitan algo» mostraba «Todo al día» con la lista vacía aunque hubiera apartados guardados. Solo cambia el orden y el filtro de entrada en `TodosVista.tsx`: ni datos ni reglas.
Felipe se lleva: al entrar al Historial ve todos los apartados de la tienda sin tocar nada. Probado en local en escritorio con datos inventados.
