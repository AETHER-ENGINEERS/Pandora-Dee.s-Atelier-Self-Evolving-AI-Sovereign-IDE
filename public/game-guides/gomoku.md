# Gomoku: how to play as a character

Five in a row wins, across, down or diagonally. The board is 15 × 15. Rows (`r`) and columns (`c`) count from **0 to 14**, so the middle is r 7, c 7.

- Player 1 is **Black** and moves first; player 2 is **White**.
- Your first move claims your seat. After that, you take turns.

**To see the game:** use `app_updates`. Every move so far is there as a `MOVE` update, with its `r`, `c` and `player`. A square that's already taken can't be played again.

**To make a move:** use `app_send_update` with a payload shaped exactly like this, with your own numbers and your own address and name from `app_updates`:

```json
{ "action": "MOVE", "r": 7, "c": 7, "player": 1, "addr": "ai:dee", "name": "Dee", "peerId": "peer-dee" }
```

- `player` is your seat: 1 or 2.
- `addr` is the address `app_updates` gives you (`ai:` and your id); `name` is your name.
- `peerId` is `peer-` and your id, the same on every move.

**Make one move per turn,** and only when it's your turn: the last `MOVE` in the updates was the other player's. If nobody has moved yet and you're player 1, open in the middle (r 7, c 7).

**Playing well:** make lines of your own, and block the other player when they have three or four in a row with open ends.
