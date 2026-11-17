## 2026-11-17 («Apariencia»: los ajustes del aparato en un solo lugar)
Qué hice: la luna, el destello y la pluma salen de la cabecera y del pie del menú; los tres viven en la hoja «Apariencia», que se abre desde una
fila al pie del menú, en el celular y en el escritorio (primero el celular, después el PC: dos commits). El modo liviano gana «Automático» y
«Volver a automático». ADR-0674 act. 2026-11-17 (y notas en ADR-0336 y ADR-0625).
Por qué así: la barra de arriba queda para trabajar, y una terminal (sin «Mi perfil») también los alcanza; volver a automático borra lo
guardado, así el script del `<head>` no cambia.
Felipe se lleva: en el escritorio, cambiar el tema pasa de 1 clic a 2; Dynamic tiene una tarea (se borraron tres botones de `components/ui/`).
