# SSH Connections

A GNOME Shell extension for saving, grouping, monitoring, and quickly opening SSH connections.

## Features

- SSH profiles with name, host, user, port, and private key
- Opens connections in a new GNOME Terminal window
- Automatic first-time key setup using `ssh-copy-id`
- Passwords are never stored by the extension
- Background reachability monitoring via ICMP ping
- Server information via SSH: operating system, version, disk usage, and uptime
- Categories with reorderable server lists
- Panel icon position can be set to left or right
- German, English, Spanish, and French interface translations

## Requirements

- GNOME Shell 45–50
- `ssh`, `ssh-copy-id`, and `ssh-keygen`
- GNOME Terminal, `kgx`, or `xterm`

## Installation from a release package

```bash
gnome-extensions install --force ssh-connections@pstrakeljahn.shell-extension.zip
gnome-extensions enable ssh-connections@pstrakeljahn
```

On Wayland, log out and back in after the first installation. Later changes can usually be loaded with:

```bash
gnome-extensions disable ssh-connections@pstrakeljahn
gnome-extensions enable ssh-connections@pstrakeljahn
```

## Development

```bash
make check
make pack
```

The release package is written to `dist/`.

## Security

The extension does not store passwords. For first-time setup it uses `ssh-copy-id`; subsequent connections use the local private key or SSH agent. Host-key verification and `~/.ssh/config` remain part of the normal SSH behavior.

## License

MIT — see [LICENSE](LICENSE).
