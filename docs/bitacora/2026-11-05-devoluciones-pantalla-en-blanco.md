# 2026-11-05 — Cambios y Devoluciones ya no dejan la pantalla en blanco

**Qué se hizo:** entrar a un flujo, cambiar de paso y salir ya no deja la vista sobre aire: `useVistaDelPaso` suelta `<PaginaEstable />` antes de pintar. El foco ahora espera a que se vaya el loader, así que llega al título del éxito o al aviso de error también con una respuesta lenta.
**Por qué:** al registrar una devolución a 375 px el aviso de éxito ya estaba a la vista y `<PaginaEstable />` lo sacaba 25 ms después, con 1205 px de aire: la persona no sabía si se había guardado. Pasaba igual al entrar desde abajo de una lista.
**Felipe se lleva:** es el sexto arreglo local del mismo defecto (ADR-0185, actualización 2026-11-05). Queda por decidir si se pone una red en la regla misma, que toca todo el ERP. Falta probarlo en un iPhone real.
