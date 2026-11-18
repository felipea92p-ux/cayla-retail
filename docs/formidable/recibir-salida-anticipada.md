# Formidable · Recibir ▸ Crear la prenda, tabla de Cerrar y «Llevar al stock ahora»

- **Fecha:** 2026-11-03 · **Rama:** `claude/recibir-marca-opcional` · **ADR:** 0608
- **Prueba:** un agente ciego recorrió la salida y la corrección en el navegador local (22 pasos). Sin colaboradora real.

## Lo observado (prueba ciega)

**[Observado]** Sacó 3 polos sin cerrar el envío y los corrigió sola. Dudó en cuatro lugares:

| Dónde | Qué pasó | Ley | Qué se hizo |
|---|---|---|---|
| Hoja «Llevar 3 de…» | No decía qué talla llevaba, y no pudo revisarla antes de confirmar | 5, 9 | La hoja lista talla, color y cantidad; «Corregir» y «Ya en stock», también |
| Tallas y colores ahora | «Entra al stock al cerrar» le hizo creer que no se podía sin cerrar | 1 | «Entra al stock al cerrar, o antes si tú la llevas» |
| Bajo la tabla | «Se guarda cuando cuadre… corrige lo contado a 3» empujaba a bajar el conteo | 3, 4 | «Lleva estas al stock, o sigue repartiendo. Si en total llegaron 3…» |
| Hoja de después | «Ya están en el stock» no decía que todavía no se venden | 4 | «Están en el almacén: se venden cuando las bajes al piso» |

También: «Corregir» junto a «10 ya en stock» asustaba por las 10: ahora dice «Corregir 3». El aviso de reabrir nombraba un botón que no estaba, y se quitó. «Todo contado y con su prenda identificada» contradecía a «Faltan tallas»: ahora dice «Todo contado».

## Notas

| Eje | Nota | Evidencia |
|---|---|---|
| Leyes | 7,5 | Observado: logró la tarea sin ayuda, con dudas ya atendidas; falta repetir la prueba con los textos nuevos |
| Oficio | 7,5 | Medido a 1280 px: controles de 40 px, sin desborde; a 375 px sin desborde de página. Las tallas no se mueven al marcarlas (posiciones idénticas) |

## Lo que queda sin hacer

- El botón «Llevar al stock ahora» solo aparece al repartir: quien no reparte no sabe que existe. Se explica en la guía y en la opción de tallas.
- «¿De quién es la mercadería?» se pregunta en cada tanda de Lima. Recordarlo entre tandas toca dinero de dos empresas: lo decide Felipe.
- Repetir con una colaboradora real y en un teléfono real.
