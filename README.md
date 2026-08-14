# Übersetzer – Web-App

Statischer, framework-freier Klon der iOS-App (reines HTML/CSS/JS, keine Build-Schritte, keine
Abhängigkeiten). Läuft komplett im Browser und spricht die PONS Dictionary API direkt per
`fetch()` an (CORS ist auf `api.pons.com` offen, ein Server/Proxy ist nicht nötig).

## Lokal testen

Da die App ES-Module lädt, muss sie über `http://` statt `file://` geöffnet werden:

```bash
cd web
python3 -m http.server 8080
```

Danach `http://localhost:8080` im Browser öffnen.

## Deployment auf GitHub Pages

Der Workflow [`../.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)
deployt den Inhalt von `web/` automatisch bei jedem Push auf `main`. Einmalig in den
Repo-Einstellungen aktivieren:

**Settings → Pages → Source → „GitHub Actions"**

Danach läuft jeder Push auf `main`, der `web/` verändert, automatisch durch und veröffentlicht
die Seite unter `https://<username>.github.io/<repo>/`.

## Datenhaltung

Alle Nutzerdaten (Suchverlauf, API-Key, Einstellungen) liegen ausschließlich im `localStorage`
des Browsers – nichts wird an einen eigenen Server geschickt. Der PONS API-Key wird 1:1 wie in
der iOS-App vom Nutzer selbst eingegeben und nur direkt an `api.pons.com` übertragen.

## Bekannte Abweichungen zur iOS-App

- **Haptisches Feedback** (`UIImpactFeedbackGenerator`) gibt es im Web nicht in vergleichbarer
  Form – iOS Safari unterstützt die Vibration API nicht. Wo im Original Haptik ausgelöst wird,
  passiert im Web nichts Spürbares (die Aktion selbst funktioniert unverändert). Auf Android/
  Desktop-Chrome wird stattdessen `navigator.vibrate()` genutzt, falls verfügbar.
- Als PWA installierbar („Zum Home-Bildschirm hinzufügen") für ein möglichst app-ähnliches
  Gefühl ganz ohne Entwicklerzertifikat.
