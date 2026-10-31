# Maqueta · el modal «Mi perfil» (2026-10-31)

Felipe pidió (2026-10-31): el modal de «Mi perfil» (`apps/web/components/PerfilModal.tsx`) «está demasiado básico»; tres maquetas para
elegir, lo más sofisticadas, animadas y al día con las tendencias (liquid glass y otras).

Abrir `index.html` en el navegador (no necesita servidor). La barra negra de arriba no es parte del diseño: elige la dirección, el tema,
el ancho (escritorio o celular de 375 px) y si la persona tiene foto. «↻ Ver la entrada otra vez» repite la coreografía. Todo se toca y
nada se guarda: subir una foto (JPEG hasta 3 MB, como hoy), quitarla, copiar el correo, cambiar la contraseña (con sus errores reales),
cerrar con Escape, la × o el velo, y volver a abrir tocando tu foto en la cabecera. En el celular, la hoja se baja con el dedo desde el asa.

## Lo que NO cambia

Qué hace el modal: tus datos vienen de Dynamic y son de solo lectura; lo único que se escribe es la foto y la contraseña; Colaboradores y
Configuración se ofrecen solo a quien los ve; Demo abre la guía de un módulo. Las validaciones son las de hoy (JPEG, 3 MB, 8 caracteres,
que coincidan). La barra de «fuerza» de la contraseña orienta pero no bloquea nada nuevo.

## Las tres direcciones

| | La idea | Lo que la hace distinta |
|---|---|---|
| **A · Cristal líquido** | El vidrio de las tendencias actuales (iOS 26) | La hoja es vidrio esmerilado: deja ver la pantalla de atrás, con un filo de luz que gira hacia donde está el mouse y un brillo que lo sigue. La foto vive en una lente de vidrio (al pasar el mouse, la cámara). «Tú · Cuenta · Seguridad» es un segmento con una **gota** que se estira hasta la pestaña nueva y suelta la vieja. Cada pestaña entra desenfocada y se enfoca. Ancho mediano (576). |
| **B · Bento vivo** | El mosaico de tarjetas (bento) con luz | Todo a la vista sin pestañas: tu foto con un anillo del color de tu sede que se dibuja, tu sede en el hilo punteado TRU · LIM · AQP (el del login), tu último acceso con la hora que cuenta y su lugar en el día, tu rol, tus datos y tus accesos. Una luz recorre los bordes siguiendo al mouse, las tarjetas se inclinan apenas, y arriba tres nubes de color (aurora) que llegan una vez y se corren con el mouse. «Contraseña» se abre en su lugar y las demás tarjetas se acomodan sin saltar. Ancho ancho (768). |
| **C · Fotocheck** | Tu credencial de CAYLA | A la izquierda, el fotocheck baja colgado de su cinta roja: foto, nombre, rol, sede y código de barras, con una lámina holográfica que brilla al inclinarlo con el mouse. Al cambiar la contraseña se da vuelta y su dorso muestra, en vivo, qué tan fuerte es lo que escribes; se queda a la vista mientras bajas. A la derecha, una ficha de revista: tu nombre grande, una frase en cursiva («Líder de equipo en Trujillo. Entraste hoy a las 9:42 a. m.»), tus datos con puntos guía y tus accesos. Ancho ancho (768). |

## Reglas que respetan las tres

- **Solo tokens** (ADR-0169 / ADR-0336), en claro y oscuro; el vidrio usa `--color-vidrio` y la sombra `--color-sombra`. El fotocheck es un
  objeto físico: negro (`tinta-fija`) en los dos temas, como el papel fijo.
- **Movimiento (ADR-0136):** una sola vez, sin rebote, todo se apaga con `prefers-reduced-motion`. No hay bucles: lo que se mueve después de
  la entrada (el filo y el brillo del vidrio, la luz del bento, la inclinación del fotocheck) responde al mouse y se queda quieto si tú
  te quedas quieto. **Es más movimiento del que permite la regla para un modal común: la que Felipe elija entra como excepción de ADR-0136.**
- **Guía de foco (ADR-0284)** en la contraseña: «Sigue aquí» en un campo a la vez, ✓ al cumplir, y la luz no se va del campo donde escribes.
- **Celular (ADR-0479):** la hoja llega desde abajo con su asa y se baja con el dedo.
- **Piezas del sistema** a la vista: `<Chip>`, `<Modal conCerrar>` (la ×), «Cancelar» antes del botón que guarda, el aviso de éxito
  arriba a la derecha, el hilo del botón mientras guarda, `<BotonCopiar>` con su ✓.

## Lo que decidió Felipe (2026-10-31)

La **A · Cristal líquido**, y además cerrar sesión desde ahí con un ícono sutil. Quedó en `components/PerfilModal.tsx` con
`<Modal variante="vidrio">` (`app/estilos/perfil-vidrio.css`) y como excepción de movimiento en ADR-0136 (act. 2026-10-31).
