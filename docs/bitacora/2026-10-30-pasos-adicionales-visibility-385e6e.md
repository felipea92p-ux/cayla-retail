## 2026-10-30 (Ojales y botones ya no desaparecen de «Agregar un paso» sin decir por qué)
Qué hice: en la hoja «Agregar un paso» los pasos que no se pueden sumar (porque el de después ya empezó) salen en la lista apagados y con su motivo, con una frase debajo; «Otro proceso…» se frena antes de dar de alta si iría antes de un paso ya empezado; y la fila ya no dice `__otro__`.
Por qué así: el líder siempre ve el botón, así que la explicación de la página nunca le salía; el motivo tenía que vivir donde se elige. La regla de la base (`paso_despues_empezado`) no se tocó.
Qué se rompería sin esto: un líder en una orden con Planchado hecho no encontraba Ojales y botones y, peor, podía dar de alta un proceso que la base luego rechazaba, dejándolo huérfano en el catálogo.
