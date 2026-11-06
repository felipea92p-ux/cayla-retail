# 2026-11-05 — En Safari de iPhone, el título de Cambios y Devoluciones ya no queda bajo la cabecera

**Qué se hizo:** al entrar a un flujo, cambiar de paso o registrar, la vista va al inicio del flujo, bajo la cabecera fija, y el título recibe el foco sin moverla. Los paneles ya no piden un viaje suave.
**Por qué:** la primera prueba en Safari (simulador de iPhone, iOS 26.5, 375 × 667) mostró que, sin pantalla en blanco, el título igual quedaba a 0 px, tapado por la cabecera: quien registraba no veía «Devolución registrada». Chrome no lo mostraba.
**Felipe se lleva:** el asa, la red de la página, el botón negro y las hojas pasaron la prueba en Safari. Falta probar en un iPhone en la mano, y queda anotado que en un teléfono chico el pie de una hoja corta queda 17 px bajo la barra de Safari cuando un campo tiene el foco.
