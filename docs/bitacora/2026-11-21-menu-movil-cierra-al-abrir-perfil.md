# 2026-11-21 · El menú del celular ya no se ve a través de «Mi perfil»

- **Qué:** en el celular, «Mi perfil» y «Apariencia» se abrían con el menú lateral todavía abierto; la hoja del perfil es de vidrio «Completo» y el menú se leía a través de ella, mezclado con la foto y los datos. Ahora abrir cualquiera de las dos cierra antes el menú (`abrirHojaDesdeElCajon`, `components/AppShell.tsx`) y la hoja se abre en el cuadro siguiente, para que tome lo de atrás (fondoDeLaHoja: una sola dueña).
- **Verificado:** a 420 × 875 en el servidor del worktree con una página temporal de datos inventados: menú abierto → «Mi perfil» → menú cerrado, hoja abierta y, con las animaciones encendidas, el fondo alejado a 0,92 como en cualquier hoja. En escritorio no cambia nada.
- **No verificado:** con una cuenta real y el perfil cargado (la prueba no tenía base), ni en Safari de iPhone.

## La causa de fondo: «Mi perfil» transparente en modo liviano

- **Qué:** cerrar el menú no bastaba: Felipe volvió a ver la pantalla de atrás («Historial de compras») nítida a través de «Mi perfil». El modo liviano (y «menos transparencia» del sistema) apaga todo desenfoque, y las demás hojas pasan a papel por sus recetas; «Mi perfil» tiene su fondo al 54 % escrito a mano en `perfil-vidrio.css`, así que quedaba transparente y sin desenfoque. Ahora pasa a papel en esos dos casos.
- **Verificado:** a 420 × 757, con `data-liviano="si"` la hoja da `rgb(251, 248, 242)` (papel) y no se lee nada detrás; con `"no"` sigue el vidrio con `blur(28px)`. 265 pruebas de estilos en verde.
- **No verificado:** que el aparato de Felipe esté en modo liviano (es lo único que reproduce su captura aquí); en iPhone real.
