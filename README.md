# Fixcash

Fixcash ist eine Android-App zur Verwaltung von Einnahmen, Ausgaben und
Verträgen. Die Daten bleiben lokal auf dem Gerät.

## Android-App herunterladen

- [Aktuelle stabile Version herunterladen](https://github.com/Inrouder/Fixcash/releases/latest)
- [Alle Versionen anzeigen](https://github.com/Inrouder/Fixcash/releases)
- [Debug-Builds öffnen](https://github.com/Inrouder/Fixcash/actions/workflows/build-apk.yml)

Die stabile Version wird als `Fixcash.apk` veröffentlicht. Die App prüft beim Start auf neue GitHub-Releases, schlägt verfügbare Updates vor und kann die APK herunterladen. Android zeigt vor der Installation weiterhin den Systemdialog zur Bestätigung an.

## Einmalige Einrichtung für signierte Updates

Android akzeptiert App-Updates nur, wenn sie mit demselben privaten Signaturschlüssel wie die installierte App signiert sind. Für automatische Update-Releases muss einmalig ein Release-Schlüssel erstellt und als GitHub Actions Secret hinterlegt werden.

1. Erstelle lokal einen Schlüssel mit JDK:
   ```powershell
   keytool -genkeypair -v -keystore fixcash-release.jks -alias fixcash -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Erzeuge den Base64-Wert unter Windows PowerShell:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\fixcash-release.jks")) | Set-Clipboard
   ```
3. Öffne **Settings → Secrets and variables → Actions** im Repository und lege diese Repository Secrets an:
   - `FIXCASH_KEYSTORE_BASE64`: den kopierten Base64-Wert
   - `FIXCASH_KEYSTORE_PASSWORD`: Keystore-Passwort
   - `FIXCASH_KEY_ALIAS`: `fixcash`
   - `FIXCASH_KEY_PASSWORD`: Passwort des Schlüssels
4. Bewahre `fixcash-release.jks` und Passwörter sicher auf. Ohne diesen Schlüssel können künftige Versionen nicht als Update installiert werden.

Danach erstellt der Workflow bei Pushes auf `main` eine signierte APK und veröffentlicht sie als GitHub Release. Ohne konfigurierte Secrets wird kein signiertes Release veröffentlicht.

**Wichtig für bereits installierte Debug-Versionen:** Die bisherige Debug-APK wurde mit einem temporären GitHub-Runner-Schlüssel signiert. Sie kann deshalb nicht direkt durch eine mit dem neuen Release-Schlüssel signierte Version ersetzt werden. Vor dem Wechsel bitte die Daten in Fixcash über JSON exportieren, die alte App deinstallieren, die erste signierte Release-Version installieren und die Daten wieder importieren. Künftige signierte Versionen können dann über den integrierten Update-Dialog installiert werden.

## Funktionen

- Monatliche Übersicht über Einnahmen, Ausgaben und freies Budget
- Wiederkehrende Zahlungsrhythmen mit Umrechnung in Monatsbeträge
- Befristete und unbefristete Einträge
- Vertragsstatus, Kündigungsfristen und Erinnerungen im laufenden Monat
- CSV- und JSON-Export sowie ein vorausgefülltes Kündigungsschreiben

## Android-App lokal bauen

Voraussetzungen sind JDK 17 oder neuer sowie Android SDK Platform 35 und
Build-Tools 35.0.0. Mit installiertem Android-SDK:

```sh
./gradlew assembleDebug
```

Die Debug-APK liegt anschließend unter
`app/build/outputs/apk/debug/app-debug.apk`.

Die App-Oberfläche wird lokal in einer Android-WebView ausgeführt. Die Update-Prüfung benötigt Internetzugriff; die Finanzdaten bleiben lokal im LocalStorage der App.
