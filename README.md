# Fixcash

Fixcash ist eine Android-App zur Verwaltung von Einnahmen, Ausgaben und
Verträgen. Die Daten bleiben lokal auf dem Gerät.

## Funktionen

- Monatliche Übersicht über Einnahmen, Ausgaben und freies Budget
- Wiederkehrende Zahlungsrhythmen mit Umrechnung in Monatsbeträge
- Befristete und unbefristete Einträge
- Vertragsstatus, Kündigungsfristen und Erinnerungen im laufenden Monat
- CSV- und JSON-Export sowie ein vorausgefülltes Kündigungsschreiben

## Android-App bauen

Voraussetzungen sind JDK 17 oder neuer sowie Android SDK Platform 35 und
Build-Tools 35.0.0. Mit installiertem Android-SDK:

```sh
./gradlew assembleDebug
```

Die Debug-APK liegt anschließend unter
`app/build/outputs/apk/debug/app-debug.apk`.

Die App-Oberfläche wird lokal in einer Android-WebView ausgeführt. Sie benötigt
keine Netzwerkverbindung und speichert ihre Daten im LocalStorage der App.
