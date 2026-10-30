# Reel su riprese vere

Motion design e musica originale sopra un montaggio già fatto di riprese vere (battaglie in arena,
test), in verticale 1080x1920 a 30 fps. Segue la regola dei video in [`CLAUDE.md`](../../../CLAUDE.md):
- titoli animati;
- callout con nome e combo;
- lampi e punch-in sugli impatti;
- il logo GEAR//DROP animato in chiusura.

Il montaggio resta quello: qui non si taglia niente.

| File | Cosa fa |
| --- | --- |
| `overlay.html` | La grafica. Ogni fotogramma è funzione del tempo (`window.seek(t)`). |
| `render.mjs` | Fotografa la grafica in Chromium e la mette sul video con ffmpeg. Fa il punch-in e unisce la musica. Controlla da solo il risultato. |
| `score.py` | Musica originale sintetizzata con numpy: niente campioni né brani esistenti. È phonk a 150 BPM. Accenta ogni taglio, mette un riser e un colpo su ogni impatto e un tempo dimezzato nei rallenty. Masterizzata a -14 LUFS e ≤ -1 dBTP. |
| `qa/verify_flash.py` | Conta i lampi al secondo sul video finito (massimo 3, WCAG 2.3.1). |
| `qa/verify_punch.py` | Misura il punch-in dai pixel. |
| `<reel>/timeline.json` | Tagli, tipo di inquadratura (`fast`, `lead`, `slow`) e impatti. Tutti i tempi vengono da qui. |
| `<reel>/labels.json` | Tutte le parole a schermo e i colori delle trottole. |

Comandi, dalla cartella `scripts/clips/footage` (i file prodotti vanno in `out/clips/`, che non si
versiona):

```
python3 score.py --timeline spin-hype/timeline.json --out ../../../out/clips/spin-hype/spin-music.wav
node render.mjs --video MONTAGGIO.mp4 --audio ../../../out/clips/spin-hype/spin-music.wav \
  --timeline spin-hype/timeline.json --labels spin-hype/labels.json \
  --out ../../../out/clips/spin-hype/spin-reel.mp4 --cover 4.6 --sheet
python3 qa/verify_flash.py ../../../out/clips/spin-hype/spin-reel.mp4
```

Con `--audio anullsrc` esce la versione senza musica, per chi vuole aggiungere un brano dalla libreria
di Instagram.

## spin-hype: in pausa, manca il video

È il montaggio "SPIN hype" del 29/10: 16,23 s di colpi e rallenty.
- Il file è `spin-hype-muto.mp4`, sul PC del proprietario in `output/instagram/spin-hype/`.
- C'è anche `spin-hype-arena.mp4`, che ha il suono vero dell'arena.

Musica e grafica sono pronte e provate su un video segnaposto. Per finirlo:

1. **Tagli e impatti.** I tempi in `timeline.json` vengono dal log del montaggio, non dal file. Vanno
   rimisurati sul video: i tagli con il rilevamento delle scene, gli impatti guardando i fotogrammi.
   Poi si aggiornano `shots[].start/end` e si scrive `hits` con i tempi di contatto veri.
2. **Etichette giuste per ogni inquadratura.** Non sono tutte come dice ora `labels.json`:
   - le inquadrature 1, 10 e 11 vengono dal test 3 del video Drake: la build con il chip Emperor, la
     Gravity e il 6-60 Hexa, contro una trottola blu. Lì non va scritto DRAKE BRAVE;
   - le inquadrature 3 e 21 sono Drake Brave Gravity 1-50 Low Rush (G1-50LR). Nella 21 è Drake Brave a
     uscire;
   - le inquadrature 5 e 14 sono Luster con 1-80 Low Rush, in una battaglia fermata a mano: lì non va
     scritto 1-70 UNITE;
   - Luster e Drake non si sfidano mai: meglio "O" che "VS" nel gancio;
   - l'unico finale confermato è l'Xtreme dell'inquadratura 7, parola del proprietario. Gli altri
     impatti restano senza scritta finché lui non dice il tipo;
   - i colori sono da prendere dal video. Luster è argento e viola, Drake Brave blu metallizzato,
     Wizard Rod giallo: l'ambra di Luster ora si confonde con Rod.
3. **Caption.** `caption.txt` dice che Luster batte Rod cinque volte di fila: viene dalle note del test
   (dopo la ricostruzione, una sconfitta e poi cinque vittorie). Va confermato dal proprietario.
   Non nomina SPIN né BAND-MAID, perché la musica è nostra.
4. **Render e controllo.** Si guarda il provino e si contano i lampi. Poi si fa ascoltare la musica
   sul telefono prima di pubblicare: è stata verificata solo con le misure.
