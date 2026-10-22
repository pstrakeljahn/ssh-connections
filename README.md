# SSH Connections

Eine GNOME-Shell-Extension zum Speichern, Gruppieren und schnellen Öffnen von SSH-Verbindungen.

## Funktionen

- SSH-Profile mit Name, Host, Benutzer, Port und privatem Schlüssel
- Start in einem neuen GNOME Terminal
- Automatische Schlüssel-Einrichtung über `ssh-copy-id`
- Passwörter werden nicht gespeichert
- Hintergrund-Monitoring per Ping
- Serverinformationen per SSH: Betriebssystem, Version, Festplatte und Uptime
- Kategorien und frei sortierbare Serverlisten
- Panel-Position links oder rechts
- Deutsch, Englisch, Spanisch und Französisch

## Voraussetzungen

- GNOME Shell 45–50
- `ssh`, `ssh-copy-id`, `ssh-keygen`
- GNOME Terminal, `kgx` oder `xterm`

## Installation aus einem Release-Paket

```bash
gnome-extensions install --force ssh-connections@pstrakeljahn.shell-extension.zip
gnome-extensions enable ssh-connections@pstrakeljahn
```

Unter Wayland ist nach der ersten Installation eine Ab- und Anmeldung nötig. Danach können Änderungen meist mit `disable`/`enable` geladen werden.

## Entwicklung

```bash
make check
make pack
```

Das fertige Paket liegt anschließend unter `dist/`.

## Sicherheit

Die Extension speichert keine Passwörter. Für die erste Einrichtung nutzt sie `ssh-copy-id`; danach authentifiziert SSH über den lokalen privaten Schlüssel oder den SSH-Agenten. Host-Key-Prüfungen und `~/.ssh/config` bleiben Bestandteil des normalen SSH-Verhaltens.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
