[English](./USER-GUIDE.md) | **Italiano**

# Guida utente

Tutto quello che serve per installare Deadline Aura e usarla ogni giorno. Non serve saper programmare. Se invece vuoi compilare l'app dai sorgenti, la strada è descritta nel [README](../README.it.md).

## Indice

- [Prima di cominciare](#prima-di-cominciare)
- [Installare l'app](#installare-lapp)
- [Cosa vedi al primo avvio](#cosa-vedi-al-primo-avvio)
- [Collegare Google Calendar](#collegare-google-calendar)
- [Collegare Outlook](#collegare-outlook)
- [Collegare Jira](#collegare-jira)
- [Attivare l'AI scoring](#attivare-lai-scoring)
- [Leggere i colori](#leggere-i-colori)
- [Vedere i limiti di Claude e Codex](#vedere-i-limiti-di-claude-e-codex)
- [Lavorare con i task](#lavorare-con-i-task)
- [Tracciare il tempo](#tracciare-il-tempo)
- [Promemoria delle riunioni](#promemoria-delle-riunioni)
- [Capire il punteggio](#capire-il-punteggio)
- [Le impostazioni, tab per tab](#le-impostazioni-tab-per-tab)
- [Dove finiscono i tuoi dati](#dove-finiscono-i-tuoi-dati)
- [Quando qualcosa non funziona](#quando-qualcosa-non-funziona)
- [Aggiornare e disinstallare](#aggiornare-e-disinstallare)

## Prima di cominciare

Deadline Aura gira su Linux con GNOME su X11. Non funziona su Wayland, Windows o macOS. Se non sai quale sessione stai usando, guarda la pagina "Informazioni" nelle impostazioni di sistema, oppure esci e controlla l'icona dell'ingranaggio nella schermata di accesso, dove si sceglie il tipo di sessione.

Per installare non serve altro. Gli account Google, Outlook e Jira sono tutti facoltativi: l'app funziona anche con i soli task che scrivi tu.

## Installare l'app

**1. Scarica.** Apri l'[ultima release](https://github.com/AndreaBonn/deadline-aura/releases/latest). Nella sezione **Assets** clicca il file che termina con `.deb` e salvalo, di solito nella cartella `Download`.

**2. Installa.** Fai doppio clic sul file scaricato. Si apre l'installatore di applicazioni del sistema: clicca **Installa** e inserisci la password.

Se preferisci il terminale:

```bash
cd ~/Download
sudo apt install ./deadlineaura_*.deb
```

**3. Avvia.** Cerca "DeadlineAura" nel menu delle applicazioni e aprila. Da quel momento parte da sola a ogni accesso. Per impedirlo, disattivala nelle impostazioni GNOME delle applicazioni di avvio.

## Cosa vedi al primo avvio

Sul bordo destro di ogni schermo collegato compare una striscia colorata sottile. Quella striscia è tutta l'interfaccia a riposo: il suo colore è il tuo carico di lavoro del momento.

Clicca la striscia e la sidebar si apre. In alto trovi l'orologio, la barra di urgenza con il punteggio e l'icona di un gatto. In mezzo i tuoi task, raggruppati per provenienza. In basso una fila di pulsanti: impostazioni (ingranaggio), Layout, sync manuale e chiusura.

Senza account collegati la sidebar è quasi vuota, ed è normale. Le sezioni che seguono la riempiono.

## Collegare Google Calendar

È la parte più lunga della configurazione, e si fa una volta sola. Google pretende che ogni applicazione che legge un calendario sia registrata, quindi devi creare le tue credenziali. Restano sul tuo computer.

**1. Crea un progetto Google Cloud.** Vai su [console.cloud.google.com](https://console.cloud.google.com) e accedi. In alto apri il selettore dei progetti e creane uno nuovo. Il nome è indifferente.

**2. Abilita le API del calendario.** Nel menu a sinistra scegli **API e servizi → Libreria**, cerca "Google Calendar API", aprila e clicca **Abilita**. Ripeti la ricerca con "Google Tasks API" e abilita anche quella, se vuoi vedere i tuoi task di Google.

**3. Crea le credenziali.** Vai su **API e servizi → Credenziali**, clicca **Crea credenziali → ID client OAuth**. Se Google ti chiede prima di configurare la schermata di consenso, fallo: scegli **Esterno**, compila nome dell'app e indirizzo email dove richiesto, e aggiungi il tuo account Google fra gli **utenti di test**.

Tornato alla pagina delle credenziali, scegli il tipo di applicazione **App desktop**. Alla voce **URI di reindirizzamento autorizzati** aggiungi esattamente:

```
http://localhost:34567/oauth/callback
```

Clicca **Crea**. Google ti mostra un **Client ID** e un **Client Secret**: lascia aperta quella finestra.

**4. Incollali nell'app.** In Deadline Aura clicca l'ingranaggio in fondo alla sidebar, vai nel tab **Sorgenti** e incolla client ID e client secret nei campi Google. Salva.

**5. Autorizza.** Si apre una finestra del browser che chiede di concedere l'accesso. Accedi con l'account di cui vuoi il calendario e conferma.

L'app chiede accesso al calendario in lettura e scrittura, non in sola lettura. La lettura è ciò che colora il desktop; la scrittura è ciò che permette al time log e al timer live di creare voci sul calendario. Se non hai intenzione di usarli, puoi concedere comunque l'accesso e semplicemente non premere quei pulsanti.

Dopo la conferma, la sidebar comincia a riempirsi con i tuoi impegni.

## Collegare Outlook

Outlook non richiede account, password né permessi dal reparto IT. Deadline Aura legge il calendario attraverso il link pubblico che Outlook stesso sa pubblicare.

**1. Pubblica il calendario.** In Outlook sul web apri **Impostazioni → Calendario → Calendari condivisi → Pubblica un calendario**. Scegli il calendario, imposta il permesso su **Tutti i dettagli** e pubblica. Outlook mostra due link: copia quello **ICS**.

**2. Incollalo nell'app.** In Deadline Aura apri **Impostazioni → Sorgenti → Outlook**, attiva la sorgente, incolla il link e salva.

Due cose da sapere:

- **Il link è una password.** Chiunque lo abbia legge il tuo intero calendario senza autenticarsi da nessuna parte. Non incollarlo in una chat o in un ticket. Se sfugge, l'unico rimedio è smettere di pubblicare il calendario da Outlook, il che lo invalida per tutti.
- **Il feed non è in tempo reale.** Microsoft rigenera il file pubblicato ogni poche ore. Una riunione aggiunta stamattina può comparire solo nel pomeriggio. Per quello che non può aspettare, Google Calendar resta la sorgente più pronta.

Le riunioni ricorrenti sono gestite come si deve: ogni occorrenza compare alla sua data, le istanze spostate finiscono dove sono state spostate e quelle cancellate non compaiono affatto.

## Collegare Jira

Apri **Impostazioni → Sorgenti → Jira** e compila:

- **Dominio**: il tuo indirizzo Atlassian, per esempio `tuaazienda.atlassian.net`
- **Email**: l'indirizzo del tuo account Atlassian
- **API token**: creane uno su [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- **JQL**: quali issue portare dentro. Il valore predefinito, `assignee = currentUser() AND statusCategory != Done`, vuol dire "tutto quello che è assegnato a me e non è finito"

## Attivare l'AI scoring

Questo passaggio è facoltativo e l'app funziona anche senza. Quando è attivo, un modello AI legge i titoli dei tuoi impegni in arrivo e stima quanto pesa il carico, di solito avvicinandosi alla realtà più di quanto faccia il semplice conteggio delle scadenze.

Apri **Impostazioni → AI** e incolla una chiave API di almeno uno fra Groq, Gemini, OpenAI e Anthropic. Groq e Gemini hanno entrambi un piano gratuito. Se ne indichi più di uno, l'app li prova in ordine e passa al successivo quando un provider non risponde.

Tieni presente cosa esce dal tuo computer: i titoli degli eventi e, dove ci sono, descrizione, organizzatore e numero di partecipanti vengono inviati al provider che hai scelto. Se i titoli delle tue riunioni sono riservati, lascia la funzione spenta. Il resto dell'app non ne risente: il punteggio viene allora calcolato solo da date e priorità.

## Leggere i colori

Striscia, tinta del wallpaper e barra di urgenza mostrano tutte lo stesso numero, distribuito su cinque bande:

| Colore                    | Cosa significa                        |
| ------------------------- | ------------------------------------- |
| Verde                     | Calma. Niente che incalzi.            |
| Verde chiaro verso giallo | Carico di lavoro normale.             |
| Giallo                    | Vale la pena tenerlo d'occhio.        |
| Arancione                 | Urgente. Qualcosa deve muoversi oggi. |
| Rosso                     | Critico.                              |

Il colore nasce da una miscela: la valutazione AI pesa il 70 per cento, il calcolo meccanico su date e priorità il 30. Senza un provider AI, la parte meccanica è l'intero punteggio.

La visualizzazione si aggiorna ogni 60 secondi. I dati vengono recuperati ogni 10 minuti e l'AI ricalcola quando cambiano gli eventi oppure ogni 6 ore, a seconda di cosa arriva prima. Tutti e tre gli intervalli sono configurabili.

## Vedere i limiti di Claude e Codex

In fondo allo sfondo c'è una fascia larga quanto lo schermo, con una scheda per ogni account Claude presente sul computer e una per Codex. Se usi più account Claude con Cloak, vedi una scheda per ogni profilo; senza Cloak, una sola per l'account normale.

Sotto il nome dell'account, ogni scheda ha due righe:

- **5h**: quanto hai usato del limite di 5 ore e quando si azzera, per esempio `14:30 (~2h 15m)`.
- **7g**: quanto hai usato del limite settimanale e quando si azzera, per esempio `ven 09:00 (3g 4h)`.

La barretta è bianca sotto il 70 per cento, ambra fino all'89 e rossa dal 90 in su. Qualche simbolo da conoscere:

| Cosa vedi    | Cosa significa                                                                 |
| ------------ | ------------------------------------------------------------------------------ |
| `~0%` libera | La finestra è già scaduta: il valore è stimato finché non arriva un dato nuovo |
| `n/d`        | Il dato non c'è ancora                                                         |
| `agg. 01:06` | L'ultimo dato ha più di 30 minuti: da allora non ne è arrivato uno nuovo       |

I dati di Codex arrivano da soli, dai log che Codex scrive sul tuo computer. Per Claude serve un passaggio una volta sola: in **Impostazioni → Wallpaper** premi **Installa cattura**. L'app aggiunge un piccolo script davanti alla statusline di Claude Code, che continua a funzionare come prima. Lo script salva solo le percentuali e gli orari di reset, non legge mai le credenziali e richiede `python3`. La modifica riguarda `~/.claude/settings.json` e quindi tutti i profili Cloak, che condividono quel file; prima di scriverlo l'app ne salva una copia in `~/.local/share/deadlineaura/backups/statusline`.

Un account si aggiorna solo quando hai una sessione di Claude Code aperta su quell'account. Lo sfondo si ridisegna quando cambia qualcosa di visibile e comunque almeno ogni 15 minuti, quindi una percentuale può restare indietro di qualche punto, al massimo per un quarto d'ora.

Se la fascia non ti serve, spegnila da **Impostazioni → Wallpaper → Mostra consumo limiti Claude/Codex**.

## Lavorare con i task

Apri la sidebar cliccando la striscia. I task sono raggruppati in sezioni, e una sezione senza contenuto semplicemente non viene disegnata:

1. **In Corso** - il task con il timer avviato
2. **Locale** - quello che hai scritto tu
3. **Google Tasks** - i tuoi task Google aperti
4. **Google Calendar** - gli impegni in arrivo
5. **Outlook** - gli eventi dal feed pubblicato
6. **Preferiti Jira** - le issue Jira che hai stellato
7. **Jira** - tutto il resto che rientra nel tuo filtro

Ogni card mostra titolo, countdown, punteggio di urgenza e un badge con la sorgente. Cliccando una card Jira o Google Calendar la apri nel browser. Le card Outlook non aprono nulla, perché un feed pubblicato non porta con sé una pagina per singolo evento.

**Creare un task.** Clicca **+** nell'intestazione della sezione Locale, scrivi un titolo, scegli una data e una priorità da P1 a P4, premi Invio.

**Agire su un task.** Le icone su ogni card permettono di modificarlo, segnarlo come fatto, eliminarlo, stellarlo (solo Jira), fissarlo sul desktop, registrare tempo o avviare un timer.

**Fissare sul desktop.** L'icona a puntina trasforma un task in un post-it disegnato dentro lo sfondo, così lo vedi senza aprire niente. Per risistemare i biglietti clicca **Layout** in fondo alla sidebar: si apre un livello trasparente dove trascini ogni post-it dove preferisci. Clicca Salva, oppure premi Esc per buttare via le modifiche. Le posizioni sono salvate in percentuale, quindi sopravvivono a un cambio di risoluzione o di monitor.

## Tracciare il tempo

Due strade, entrambe scrivono sul tuo Google Calendar.

**Registrare il tempo a posteriori.** Clicca l'icona dell'orologio su una card. Compare un modulo con data e ora (che partono da adesso, arrotondate al quarto d'ora), una durata fra 15 e 480 minuti e il calendario su cui scrivere. La voce viene creata come `[CODICE-JIRA] - Titolo`, il formato che Tempo e strumenti simili si aspettano. Il calendario scelto viene ricordato per la volta dopo.

**Cronometrare dal vivo.** Clicca il pulsante verde di avvio. Una voce sul calendario viene creata subito e il suo orario di fine viene spostato in avanti ogni 60 secondi finché il timer gira. Il pulsante diventa uno stop rosso che mostra il tempo trascorso; premendolo la voce si chiude alla durata esatta. Un solo timer alla volta: avviarne un secondo ferma il primo. Se l'app si chiude a timer acceso, lo riprende alla riapertura.

Per un task locale che non ha un codice Jira nel titolo ti viene chiesto di associarne uno, scegliendolo fra le tue issue o digitandolo.

## Promemoria delle riunioni

Tre cose distinte ti avvisano di una riunione, dalla più discreta alla più insistente.

**La dock.** Una barra traslucida in fondo a ogni schermo che elenca le riunioni in partenza entro 10 minuti, con il link cliccabile per Meet, Teams o Zoom. Compare quando c'è qualcosa da mostrare e sparisce quando non c'è, e non ruba mai spazio alle tue finestre.

**Il flyby.** Sessanta secondi prima dell'inizio, un gatto in pixel art attraversa ogni schermo trainando uno striscione con il titolo della riunione e il countdown, poi se ne va dopo una ventina di secondi. Esiste per il caso in cui la dock sia nascosta dietro una finestra a schermo intero.

Per comandarlo, clicca l'icona del gatto in cima alla sidebar:

| Voce di menu           | Effetto                                          |
| ---------------------- | ------------------------------------------------ |
| Sospendi 1h / 3h / 24h | Silenzio, poi torna da solo                      |
| Per sempre             | Spento finché non lo riaccendi                   |
| Riattiva               | Annulla subito una sospensione o uno spegnimento |

Mentre gli avvisi sono sospesi, l'icona del gatto è disegnata sbarrata, così te ne accorgi al volo.

**Le notifiche desktop.** Notifiche di sistema quando il punteggio supera una soglia che decidi tu, più gli avvisi di burnout. Il rilevatore di burnout guarda 7 giorni di storico AI e scatta quando vede stress prolungato, recupero insufficiente o un carico emotivo alto. Non richiede configurazione.

## Capire il punteggio

Accanto al punteggio di urgenza c'è un pulsante `?`. Apre un pannello che spiega da dove arriva il numero: cosa ha valutato l'AI e quanto ha pesato il suo parere, cosa ha prodotto il calcolo meccanico compreso l'amplificatore che entra in gioco su un calendario affollato e quanti eventi di assenza sono rimasti fuori, e quali tre task stanno spingendo il numero verso l'alto. Se nessun provider AI ha risposto, il pannello lo dichiara e riporta il solo punteggio meccanico.

I giorni segnati come ferie o assenza non contano come carico, quindi una settimana di vacanza risulta tranquilla invece che un muro di eventi.

Cliccando la barra colorata di urgenza si apre invece un altro pannello: una valutazione scritta del carico attuale e una previsione dello stress a cinque giorni.

## Le impostazioni, tab per tab

Clicca l'ingranaggio in fondo alla sidebar. Ogni tab ha il suo pulsante **Reset sezione**, così puoi annullare le modifiche in un'area senza toccare le altre.

| Tab         | Cosa ci trovi                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------- |
| Generale    | Ogni quanto si aggiorna la visualizzazione, ogni quanto si scaricano i dati, quanto guardare avanti |
| Sorgenti    | Credenziali e calendari Google, feed Outlook, istanze e filtro Jira                                 |
| AI          | Chiavi dei provider, ordine in cui vengono provati, intervallo di ricalcolo, timeout, temperatura   |
| Wallpaper   | Se colorare lo sfondo, quali immagini usare, opzioni dei post-it, fascia dei limiti Claude e Codex  |
| Sidebar     | Su quale lato si apre, quanto è larga, quanto è trasparente                                         |
| Notifiche   | Notifiche desktop, punteggio che le fa scattare, pausa fra una e l'altra, e la meeting dock         |
| Interfaccia | Lingua, quanti task mostrare, formato del countdown                                                 |
| Turno       | I tuoi giorni e orari di lavoro, e le ferie                                                         |
| Avanzate    | Le costanti dietro il calcolo dell'urgenza                                                          |

Il tab **Turno** alimenta il countdown mostrato sotto l'orologio: quanto manca alla fine del turno, o quando comincia il prossimo. Non modifica il punteggio di urgenza.

I segreti già salvati vengono mostrati come pallini invece del valore vero. Lasciare i pallini così com'è conserva il valore salvato; scriverci sopra lo sostituisce.

## Dove finiscono i tuoi dati

Resta tutto sul tuo computer.

| Percorso                                    | Cosa contiene                                              |
| ------------------------------------------- | ---------------------------------------------------------- |
| `~/.config/deadlineaura/config.json`        | Le tue impostazioni, token e chiavi compresi               |
| `~/.config/deadlineaura/google-token.json`  | L'autorizzazione Google                                    |
| `~/.local/share/deadlineaura/db.sqlite`     | Task e storico dei punteggi                                |
| `~/.local/share/deadlineaura/wallpaper.png` | Lo sfondo generato                                         |
| `~/.local/share/deadlineaura/ai-usage/`     | Percentuali e orari di reset degli account Claude          |
| `~/.local/share/deadlineaura/bin/`          | Lo script di cattura usato dalla statusline di Claude Code |

I due file sotto `.config` sono scritti in modo che li possa leggere solo il tuo account. Non sono cifrati, quindi qualsiasi cosa giri a tuo nome può leggerli. Il quadro completo è nella [security policy](../SECURITY.it.md).

## Quando qualcosa non funziona

**Dopo l'installazione non compare nessuna striscia.** Quasi sempre è una sessione Wayland. Esci e, nella schermata di accesso, usa l'icona dell'ingranaggio per scegliere la variante X11 o "Xorg" di GNOME.

**Lo sfondo non cambia mai colore.** L'app imposta il wallpaper tramite GNOME. Su un altro ambiente desktop ripiega su `feh`, che potrebbe non essere installato. Sidebar e striscia funzionano comunque.

**Nessuna notifica desktop.** Passano da `notify-send`, che sta nel pacchetto `libnotify-bin`. Installalo se manca.

**Il calendario resta vuoto.** Controlla l'orario dell'ultimo sync in fondo alla sidebar, poi premi il pulsante di sync per forzare un aggiornamento. Se non cambia niente, la causa più comune è l'URI di reindirizzamento scritto male nella console Google Cloud: deve essere esattamente `http://localhost:34567/oauth/callback`, senza barra finale.

**Google smette di funzionare dopo un po'.** Se la schermata di consenso su Google Cloud è ancora in modalità test, Google fa scadere l'autorizzazione a intervalli regolari. Pubblicare la schermata di consenso risolve; in alternativa basta riautorizzare quando succede.

**Manca una riunione Outlook, o è vecchia.** È previsto nell'arco di qualche ora da una modifica, perché Microsoft ricostruisce il file pubblicato quando decide lei. Se un evento non compare proprio mai, ripubblica il calendario con il permesso **Tutti i dettagli**: un feed pubblicato con meno dettagli nasconde i titoli.

**Il gatto non si fa vedere.** Guarda l'icona del gatto in cima alla sidebar. Se è sbarrata, gli avvisi sono sospesi o spenti, e **Riattiva** li riporta indietro.

**È tutto rosso e non dovrebbe.** Apri il pannello `?` accanto al punteggio per vedere cosa lo sta spingendo. Una causa frequente è un periodo di ferie non segnato come assenza sul calendario, che l'app legge quindi come un blocco compatto di impegni. Segnare quei giorni come fuori sede su Google Calendar li toglie dal conteggio.

## Aggiornare e disinstallare

Per aggiornare, scarica il `.deb` più recente dalla [pagina delle release](https://github.com/AndreaBonn/deadline-aura/releases/latest) e installalo come la prima volta. Sostituisce la versione vecchia e conserva i dati.

Per rimuoverla:

```bash
sudo apt remove deadlineaura
```

Se hai installato la cattura dei limiti di Claude, premi prima **Rimuovi cattura** in **Impostazioni → Wallpaper**: rimette la statusline com'era. Se te ne dimentichi, non si rompe niente: lo script resta in `~/.local/share/deadlineaura/bin` e continua a passare i dati alla tua statusline; per toglierlo dopo, esegui `~/.local/share/deadlineaura/bin/claude-capture.py uninstall`.

Impostazioni e database restano al loro posto, quindi reinstallando più avanti ritrovi tutto. Per cancellare anche quelli, elimina `~/.config/deadlineaura` e `~/.local/share/deadlineaura`.

---

[Torna al README](../README.it.md) | [Security policy](../SECURITY.it.md) | [Architettura](./ARCHITECTURE.it.md)
