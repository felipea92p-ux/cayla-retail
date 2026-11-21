# 2026-11-21 · El menú del celular ya no se ve a través de «Mi perfil»

- **Qué:** en el celular, «Mi perfil» y «Apariencia» se abrían con el menú lateral todavía abierto; la hoja del perfil es de vidrio «Completo» y el menú se leía a través de ella, mezclado con la foto y los datos. Ahora abrir cualquiera de las dos cierra antes el menú (`abrirHojaDesdeElCajon`, `components/AppShell.tsx`) y la hoja se abre en el cuadro siguiente, para que tome lo de atrás (fondoDeLaHoja: una sola dueña).
- **Verificado:** a 420 × 875 en el servidor del worktree con una página temporal de datos inventados: menú abierto → «Mi perfil» → menú cerrado, hoja abierta y, con las animaciones encendidas, el fondo alejado a 0,92 como en cualquier hoja. En escritorio no cambia nada.
- **No verificado:** con una cuenta real y el perfil cargado (la prueba no tenía base), ni en Safari de iPhone.
