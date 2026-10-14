## 2026-10-13 (El saludo del colibrí)
Qué hice: al entrar, bajo el colibrí que flota en el centro dice «Bienvenido(a)» y el nombre de la persona (o de la terminal); al salir, «Hasta luego» y el nombre. Es el diseño B de la maqueta
(la frase pequeña en versalitas y el nombre grande en serif cursiva y rojo). Para que se alcance a leer, el colibrí flota en el centro al menos 450 ms aunque la pantalla de destino cargue al
instante, así que la entrada y la salida duran ese tiempo más.
Por qué así: Felipe lo pidió como un plus y eligió el texto corto («Bienvenido(a), Nombre» / «Hasta luego, Nombre») y el diseño B mirando la maqueta. Al salir el nombre ya está en el menú; al entrar se
pide a la base (`fn_persona_actual_resumen` y `fn_mi_terminal`) apenas se abre la sesión, con un tope de 4 s: si falla, el saludo va sin nombre y nada se retrasa. Una persona se saluda por su nombre de
pila y una terminal por el nombre completo del aparato. En la maqueta, el colibrí dejaba de aletear en la pausa del centro: se corrigió (en el ERP real el aleteo ya corría con el tiempo real).
Felipe se lleva: al iniciar sesión y al salir, el colibrí saluda. Pendiente: verlo con cuentas reales (una persona y una terminal) y a 375 px. Verificado en local con páginas de prueba (sin sesión real)
con el reloj de animación congelado: el saludo asoma, se queda mientras el colibrí espera, el nombre que llega tarde se incorpora y se va cuando el vuelo sigue; `lib/login-saludo.test.ts` (15 pruebas).
