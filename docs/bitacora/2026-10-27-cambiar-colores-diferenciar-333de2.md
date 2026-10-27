## 2026-10-27 (Colores del «De cada S/ 100» que se distinguen)
Qué hice: en `RecorridoPlata.tsx` (`COLOR_TIPO`), «Lo que costaron las prendas» pasó a azul pizarra oscuro y «Gastos» a azul pizarra suave; lo demás no cambió.
Por qué así: prendas, gastos y Empresa eran tres beiges y grises casi iguales en la cuadrícula de Resumen de Finanzas; el azul no lo usa ningún otro renglón y sale de tokens, así que el modo oscuro lo ajusta solo. No se tocó `--color-sede-emp`, que es el color de Empresa en todo Finanzas.
Felipe se lleva: lo vio en local en claro y en oscuro (con los seis colores simulados, porque la base local solo tiene prendas y «Te deja»). Pendiente aparte: el botón «¿Y de cada S/ 100?» muestra el código del espacio literal en pantalla.
