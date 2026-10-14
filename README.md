# Mamarracho

Juego de dibujo para jugar con amigos, cada uno desde su celu o compu. Es como un teléfono descompuesto dibujado y termina con una subasta de los mejores dibujos.

## Cómo se juega

1. Alguien crea una sala y comparte el código de 4 letras, el link o el QR.
2. Cada uno escribe una frase disparatada.
3. Te toca la frase de otro y la dibujás. El siguiente adivina tu dibujo, el otro dibuja lo que adivinaron… y así.
4. Se revelan los álbumes y todos reaccionan con emojis.
5. **Subasta:** los dibujos con más reacciones salen a remate. Todos arrancan con 1.000 mangos, el artista cobra lo que pagan por su obra y el tasador revela el valor real de cada una (¡puede ser falsa!). Gana quien termina con más fortuna: mangos que le quedan más el valor de sus obras.

## Modos

- 📞 **Clásico:** escribir, dibujar, adivinar.
- 🙈 **Copión:** mirás un dibujo unos segundos y lo copiás de memoria.
- 👻 **Tinta invisible:** la tinta se borra mientras dibujás.
- 〰️ **Un solo trazo:** sin levantar el lápiz.
- 🧟 **Monstruo por partes:** cabeza, cuerpo y piernas, cada parte de alguien distinto.

Se puede jugar de 2 a 12 personas, con tres velocidades (Tranqui, Normal y Rápido).

## Cómo funciona por dentro

- Es una página estática: HTML, CSS y JavaScript sin compilar.
- La partida corre en el navegador de quien crea la sala. Los demás se conectan directo con WebRTC usando [PeerJS](https://peerjs.com) y su servidor público gratuito.
- Por eso, quien crea la sala tiene que dejar la pestaña abierta mientras juegan.

## Probarlo en tu compu

```bash
python -m http.server 5173
```

Después abrí `http://localhost:5173` en varias pestañas para simular jugadores.
