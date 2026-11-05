# 2026-10-26 · Finanzas: todo a ancho completo y la barra de sede pegada a la cabecera

- **Qué:** las seis pantallas de Finanzas usan todo el ancho (`/finanzas` salió de `CON_TOPE_DE_ANCHO`), la barra de sede nace pegada a la cabecera (de 88 a 60 px en 1440) y se queda en una fila hasta 1280 px (solo íconos y sin el «dicho» cuando no caben). ADR-0493, actualización d.
- **Por qué:** Felipe veía cinco pantallas topadas en 64 rem con la barra a 28 px bajo la cabecera y «Registrar gasto» en una segunda fila: aire sin usar. Con las seis al mismo ancho, pasar de una a otra tampoco mueve el título ni la barra.
- **Lo que falta:** a 375 px el «+» de «Registrar gasto» cae a una tercera fila cuando «Te toca» trae su número (cabe por ~8 px; ya pasaba antes). Las capturas a 1920 px no se pudieron sacar con el navegador del panel (salen encogidas): se midió con el DOM y se miró a 1440 y 1680.
