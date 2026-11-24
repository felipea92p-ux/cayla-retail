# Formidable · Existencias ▸ el modal de la prenda, más liviano · 2026-11-24

Rama `claude/existencias-modal-liviano` (ADR-0391 act. 2026-11-24). Banco Supabase propio con el seed, cuenta Líder en Tienda Lima, prenda
«Blusa Emma» (piso en pausa). Escritorio primero (1440 y 1024), celular a 375. Agentes: uno, la prueba ciega (Sonnet sin contexto, sobre capturas).

## Notas

| Ley | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 | Observado: la ciega leyó prenda, talla, cantidades y dónde están en 5 s; supo colgar («Colgar en el piso»). |
| 2 Una pregunta, una respuesta | 8 | Medido: una sola acción primaria por vista (`accionesPrimarias 1`). Con todo bien no hay botón: la ciega dudó «¿qué me toca?», y la respuesta correcta es «nada». |
| 3 Simplicidad profunda | 8 | Observado: la frase grande traduce los números («1 en el piso y 4 en el almacén»); el estado va en una línea. |
| 4 Lenguaje de tienda | 7 | Observado: dudas con «stock», «el resto del modelo», «subir a almacén», «cuarentena», «En camino» (¿llega o sale?). |
| 5 Contenido primero | 8 | Observado: la prenda y su cantidad dominan; «Más» guarda lo secundario. |
| 6 Lo difícil, a un toque | 8 | Medido: el ritmo de venta detrás del «?»; el «?» mide 14 × 14 (pieza decidida `<Ayuda>`). |
| 7 Perdonar antes que preguntar | 9 | Medido (/chaos): doble clic, corte y rechazo no dejan nada a medias; Escape con trabajo a medias pregunta. |
| 8 Quitar antes de agregar | 8 | Observado: la ciega no extrañó nada; leyó como ruido las teclas en cajita (4, 1, 2, 3, 7, 6). |
| 9 De punta a punta | 8 | Medido: 375 px sin cortes ni desbordes; quieto, claro y oscuro limpios (/milimetro, tema:auditar). |
| **Leyes** | **8,0** | |
| **Oficio** | **8** | Medido (medir-oficio, solo la hoja): 0 poco contraste, 0 rojos, 1 primaria; bordes a 1–2 px (uno arreglado: «En camino»); el «?» de `<Ayuda>` de 14 px. |

## Los 3 cambios propuestos (esperan el OK de Felipe; no se aplicaron)

1. **Las teclas, solo para quien usa teclado** (ley 8). Hoy cada acción lleva su tecla en una cajita (4, 1, 2, 3, 7, 6) y la ciega las leyó como
   cantidades («¿Reportar dañada 7 si hay 0?»). Antes → después: la tecla se ve al pasar el mouse o con el foco del teclado, no siempre.
   Se verifica: ciega de nuevo; los atajos siguen funcionando (/chaos TEC).
2. **«Falta colgar» con palabra, no solo con color** (leyes 1 y 4). En «Todas», el ámbar de lo que falta se confundió con el color «Beige» de la
   prenda. Antes → después: la celda que falta colgar dice «falta» bajo su número (como ya hace con el filtro «En piso»). Se verifica: ciega.
3. **Otras sedes y En camino, sin dudas** (ley 4). «Taller 14» no dice si es de esta talla; «En camino 0» no dice hacia dónde. Antes → después:
   «Viene en camino» y «En otras sedes (esta talla)». Se verifica: ciega.

Lo que sobra (ley 8): «color \ talla» en la esquina del cuadro de escritorio (en el celular ya dice «Color»).
Lo que Felipe no pidió y importa más: probarlo con una colaboradora real; la ciega es un sustituto.

## Sin probar

Colaboradora real. «Todas» con un modelo de más de 5 tallas (corre de lado en el celular, a propósito).
