# LeitDim – Leitungsdimensionierung nach NIN 2025

Windows-Programm zur Dimensionierung von Leitungen nach **NIN 2025 (SN 411000:2025)**:
Strombelastbarkeit (Tab. 4–15, Faktoren Tab. 18/19/21/37/38, 5-%-Regel), Spannungsfall,
Überlast-, Kurzschluss- und Fehlerschutz, Rechenweg wie Lösungsblatt «Bestimmung Querschnitt»,
Kabelliste und PDF-Bericht.

**Download:** [neueste Version](https://github.com/2014patrick/leitdim/releases/latest)

| Datei | Für |
|---|---|
| `LeitDim-x.y.z-arm64-Ordner.zip` | Windows auf ARM – schnellster Start |
| `LeitDim-x.y.z-x64-Ordner.zip` | Intel/AMD-PCs – schnellster Start |
| `LeitDim-x.y.z-portable-*.exe` | Einzeldatei (entpackt sich bei jedem Start) |

## Lizenz
Ohne Lizenzschlüssel läuft LeitDim als Testversion (max. 3 Stromkreise, PDF mit Wasserzeichen).
Lizenzschlüssel sind mit Ed25519 signiert und werden offline geprüft; gesperrte Lizenzen stehen in
[`lizenzen/gesperrt.json`](lizenzen/gesperrt.json) (nur IDs).

## Updates
LeitDim prüft beim Start und alle 6 Stunden die neueste Version auf GitHub, lädt sie im Hintergrund
und installiert sie beim Schliessen – für Ordner- und Portable-Version.

## Entwicklung
```
app/     LeitDim (Electron)
admin/   LeitDim Lizenzen – Lizenzverwaltung (Electron)
lizenzen/ öffentlicher Schlüssel und Sperrliste
.github/workflows/build.yml  Build + Test in Windows-VMs (x64, ARM64), Release bei Tag v*
```
Neue Version: Tag `vX.Y.Z` setzen (oder in der Lizenzverwaltung unter «Versionen» veröffentlichen).

© 2026 Patrick Thommen. Hilfsmittel – massgebend sind NIN, Werkvorschriften und Herstellerangaben.
