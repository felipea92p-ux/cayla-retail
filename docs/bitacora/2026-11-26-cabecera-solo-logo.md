## 2026-11-26 (La cabecera de Entrar, Crear cuenta y recuperar la contraseña lleva solo el logo)
Qué hice: a Felipe no le gustaba el enlace suelto al lado del logo («Entrar» o «Volver a la tienda»); se quitó y `components/Cabecera.tsx` quedó solo con el logo, que lleva al inicio.
Por qué así: cada formulario ya trae su otro camino («¿Ya tienes cuenta? Entra», «Volver a entrar», «Crear mi cuenta»), así que el enlace de arriba repetía lo de abajo.
Felipe se lleva: verlo en producción tras fusionar.
