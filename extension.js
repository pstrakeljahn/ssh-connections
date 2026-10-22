import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {getTexts} from './translations.js';

const COLORS = ['#8ec5ff', '#b39df3', '#8bd5ca', '#f6c177', '#f28fad', '#a6da95'];
let TEXT = getTexts('system');

function shellQuote(value) {
    return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const SSHMenuItem = GObject.registerClass(
class SSHMenuItem extends PopupMenu.PopupBaseMenuItem {
    constructor(profile, status, checking, info, onConnect) {
        super({reactive: true, can_focus: true});
        this.profile = profile;
        this._onConnect = onConnect;

        const statusColor = status === 'online' ? '#8bd5ca' : status === 'offline' ? '#f28fad' : '#f6c177';
        const dot = new St.Widget({style_class: 'ssh-profile-dot', style: `background-color: ${statusColor};`, x_expand: false, y_expand: false, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        this.add_child(dot);
        const box = new St.BoxLayout({vertical: true, x_expand: true});
        box.add_child(new St.Label({text: profile.name || profile.host, style_class: 'ssh-profile-name'}));
        const target = profile.user ? `${profile.user}@${profile.host}` : profile.host;
        box.add_child(new St.Label({text: `${target}:${profile.port || 22}`, style_class: 'ssh-profile-host'}));
        if (info?.disk || info?.uptime || info?.system) {
            if (info.system) {
                const systemRow = new St.BoxLayout({style_class: 'ssh-info-row ssh-system-row'});
                systemRow.add_child(new St.Icon({icon_name: 'computer-symbolic', style_class: 'ssh-info-icon'}));
                systemRow.add_child(new St.Label({text: info.system, style_class: 'ssh-profile-info'}));
                box.add_child(systemRow);
            }
            if (info.uptime) {
                const uptimeRow = new St.BoxLayout({style_class: 'ssh-info-row ssh-uptime-row'});
                uptimeRow.add_child(new St.Icon({icon_name: 'preferences-system-time-symbolic', style_class: 'ssh-info-icon'}));
                uptimeRow.add_child(new St.Label({text: info.uptime, style_class: 'ssh-profile-info'}));
                box.add_child(uptimeRow);
            }
            if (info.disk) {
                const diskRow = new St.BoxLayout({style_class: 'ssh-disk-row', x_expand: true, x_align: Clutter.ActorAlign.FILL});
                const track = new St.Widget({style_class: 'ssh-disk-track', x_expand: true, x_align: Clutter.ActorAlign.FILL});
                const [usedText, totalSize] = info.disk.split('|');
                const percent = Math.max(0, Math.min(100, Number.parseInt(usedText, 10) || 0));
                const fill = new St.Widget({style_class: 'ssh-disk-fill'});
                track.add_child(fill);
                const resizeFill = () => {
                    const width = track.get_width();
                    if (width > 0) fill.set_width(Math.max(1, Math.round(width * percent / 100)));
                };
                track.connect('notify::width', resizeFill);
                resizeFill();
                diskRow.add_child(track);
                diskRow.add_child(new St.Label({text: `${usedText || `${percent}%`} / ${totalSize || ''}`.trim(), style_class: 'ssh-disk-percent'}));
                box.add_child(diskRow);
            }
        }
        this.add_child(box);

        const arrow = new St.Icon({icon_name: 'go-next-symbolic', style_class: 'popup-menu-arrow'});
        this.add_child(arrow);
        this.connect('activate', () => this._onConnect(profile));
    }
});

export default class SSHConnectionsExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._statuses = new Map();
        this._checking = new Set();
        this._serverInfo = new Map();
        this._pingSource = 0;
        TEXT = getTexts(this._settings.get_string('language'));
        this._createIndicator();
        this._settings.connectObject('changed::profiles', () => { this._rebuildMenu(); this._monitorAll(); }, this);
        this._settings.connectObject('changed::monitoring-enabled', () => this._scheduleMonitoring(), this);
        this._settings.connectObject('changed::ping-interval', () => this._scheduleMonitoring(), this);
        this._settings.connectObject('changed::panel-position', () => this._createIndicator(), this);
        this._settings.connectObject('changed::language', () => { TEXT = getTexts(this._settings.get_string('language')); this._rebuildMenu(); }, this);
        this._rebuildMenu();
        this._scheduleMonitoring();
    }

    disable() {
        this._settings?.disconnectObject(this);
        if (this._pingSource) GLib.source_remove(this._pingSource);
        this._pingSource = 0;
        this._indicator?.destroy();
        this._settings = null;
        this._indicator = null;
    }

    _profiles() {
        try { return JSON.parse(this._settings.get_string('profiles')) || []; }
        catch (_) { return []; }
    }

    _createIndicator() {
        this._indicator?.destroy();
        this._panelIcon = new St.Icon({icon_name: 'network-server-symbolic', style_class: 'ssh-panel-icon'});
        this._summary = new St.Label({text: '', style_class: 'ssh-panel-summary'});
        this._indicator = new PanelMenu.Button(0.5, TEXT.title, false);
        this._indicator.add_style_class_name('ssh-panel-button');
        this._indicator.add_child(this._panelIcon);
        this._indicator.add_child(this._summary);
        this._indicator.menu.box.add_style_class_name('ssh-menu');
        Main.panel.addToStatusArea('ssh-connections', this._indicator, 1, this._settings.get_string('panel-position') || 'right');
        this._rebuildMenu();
    }

    _rebuildMenu() {
        const menu = this._indicator.menu;
        menu.removeAll();
        const header = new PopupMenu.PopupMenuItem('', {reactive: false, can_focus: false});
        header.add_style_class_name('ssh-menu-header');
        const headerBox = new St.BoxLayout({vertical: true});
        headerBox.add_child(new St.Label({text: TEXT.title, style_class: 'ssh-menu-title'}));
        header.label.hide();
        header.add_child(headerBox);
        menu.addMenuItem(header);

        const profiles = this._profiles();
        if (!profiles.length) {
            const empty = new PopupMenu.PopupMenuItem(TEXT.empty, {reactive: false, can_focus: false});
            empty.add_style_class_name('ssh-empty');
            menu.addMenuItem(empty);
        } else {
            const uncategorized = profiles.filter(profile => !profile.category);
            this._addProfileGroup(menu, uncategorized, null, !uncategorized.length);
            const categories = this._categories();
            categories.forEach(category => {
                const members = profiles.filter(profile => profile.category === category);
                this._addProfileGroup(menu, members, category, false);
            });
        }

        const online = profiles.filter(p => this._statuses.get(p.id || this._profileId(p)) === 'online').length;
        this._summary.set_text(profiles.length ? `${online}/${profiles.length}` : '');
        this._summary.set_style(`color: ${online === profiles.length && profiles.length ? '#8bd5ca' : online ? '#f6c177' : profiles.length ? '#f28fad' : '#a8a8b3'};`);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const settingsRow = new PopupMenu.PopupMenuItem('', {reactive: false, can_focus: false});
        settingsRow.label.hide();
        const refreshButton = new St.Button({style_class: 'ssh-settings-button', child: new St.Icon({icon_name: 'view-refresh-symbolic', style_class: 'ssh-settings-icon'}), reactive: true, can_focus: true});
        refreshButton.set_accessible_name(TEXT.refresh);
        refreshButton.connect('clicked', () => this._monitorAll(true));
        settingsRow.add_child(refreshButton);
        const settingsButton = new St.Button({style_class: 'ssh-settings-button', child: new St.Icon({icon_name: 'preferences-system-symbolic', style_class: 'ssh-settings-icon'}), reactive: true, can_focus: true});
        settingsButton.set_accessible_name(TEXT.settings);
        settingsButton.connect('clicked', () => this.openPreferences());
        settingsRow.add_child(settingsButton);
        menu.addMenuItem(settingsRow);
    }

    _categories() {
        try { return JSON.parse(this._settings.get_string('categories')) || []; }
        catch (_) { return []; }
    }

    _addProfileGroup(menu, profiles, title, hideWhenEmpty) {
        if (hideWhenEmpty) return;
        if (title) {
            const heading = new PopupMenu.PopupMenuItem(title, {reactive: false, can_focus: false});
            heading.add_style_class_name('ssh-category-heading');
            menu.addMenuItem(heading);
        }
        profiles.forEach(profile => {
            const id = profile.id || this._profileId(profile);
            menu.addMenuItem(new SSHMenuItem(profile, this._statuses.get(id), this._checking.has(id), this._serverInfo.get(id), p => this._connect(p)));
        });
    }

    _profileId(profile) { return `${profile.host}|${profile.port || 22}|${profile.user || ''}`; }

    _scheduleMonitoring() {
        if (this._pingSource) GLib.source_remove(this._pingSource);
        this._pingSource = 0;
        if (!this._settings.get_boolean('monitoring-enabled')) {
            this._panelIcon.set_style('color: #a8a8b3;');
            return;
        }
        this._monitorAll();
        const interval = Math.max(60, this._settings.get_int('ping-interval'));
        this._pingSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._monitorAll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _monitorAll(force = false) {
        if (!force && !this._settings.get_boolean('monitoring-enabled')) return;
        this._profiles().forEach(profile => this._ping(profile));
        this._rebuildMenu();
    }

    _ping(profile) {
        const id = profile.id || this._profileId(profile);
        this._checking.add(id);
        this._rebuildMenu();
        try {
            const process = Gio.Subprocess.new(['ping', '-c', '1', '-W', '1', profile.host.trim()], Gio.SubprocessFlags.NONE);
            process.wait_check_async(null, (proc, result) => {
                let online = false;
                try { online = proc.wait_check_finish(result); } catch (_) { online = false; }
                this._checking.delete(id);
                this._statuses.set(id, online ? 'online' : 'offline');
                if (online) this._fetchInfo(profile);
                this._updatePanelStatus();
                this._rebuildMenu();
            });
        } catch (_) {
            this._checking.delete(id);
            this._statuses.set(id, 'offline');
            this._updatePanelStatus();
            this._rebuildMenu();
        }
    }

    _fetchInfo(profile) {
        const id = profile.id || this._profileId(profile);
        const {target, key, port} = this._connectionData(profile);
        const command = "if [ -r /etc/os-release ]; then . /etc/os-release; printf '%s\\n' \"$PRETTY_NAME\"; else uname -s; fi; df -P -h / | awk 'NR==2 {print $5 \"|\" $2}' ; uptime -p 2>/dev/null || uptime ; uname -r";
        try {
            const process = Gio.Subprocess.new([
                'ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-p', String(port), '-i', key,
                target, command,
            ], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            process.communicate_utf8_async(null, null, (proc, result) => {
                try {
                    const [, stdout] = proc.communicate_utf8_finish(result);
                    if (!proc.get_successful()) return;
                    const lines = stdout.trim().split('\n').map(line => line.trim()).filter(Boolean);
                    this._serverInfo.set(id, {system: lines[0] || '', disk: lines[1] || '', uptime: lines[2] || '', version: lines[3] || ''});
                    this._rebuildMenu();
                } catch (_) {}
            });
        } catch (_) {}
    }

    _updatePanelStatus() {
        const profiles = this._profiles();
        const online = profiles.filter(p => this._statuses.get(p.id || this._profileId(p)) === 'online').length;
        const offline = profiles.filter(p => this._statuses.get(p.id || this._profileId(p)) === 'offline').length;
        this._panelIcon.set_style(`color: ${offline ? '#f28fad' : online === profiles.length && profiles.length ? '#8bd5ca' : '#f6c177'};`);
    }

    _connect(profile) {
        if (!profile?.host?.trim()) return;
        const {port, target, key} = this._connectionData(profile);
        const portArg = String(port);
        const bashArgs = '${SSH_ARGS[@]}';
        const script = `
KEY=${shellQuote(key)}
TARGET=${shellQuote(target)}
PORT=${shellQuote(portArg)}

if [ ! -f "$KEY" ]; then
    mkdir -p "$(dirname "$KEY")"
    echo "Erzeuge lokalen SSH-Schlüssel: $KEY"
    ssh-keygen -t ed25519 -f "$KEY" -N '' -C "$TARGET"
fi

SSH_ARGS=(-p "$PORT" -i "$KEY")
if ssh -o BatchMode=yes -o ConnectTimeout=5 "${bashArgs}" "$TARGET" true >/dev/null 2>&1; then
    exec ssh "${bashArgs}" "$TARGET"
fi

echo "Noch kein passender SSH-Schlüssel auf $TARGET."
echo "Bitte das Server-Passwort einmal eingeben."
if ssh-copy-id -i "$KEY.pub" -p "$PORT" "$TARGET"; then
    echo "SSH-Schlüssel eingerichtet."
    exec ssh "${bashArgs}" "$TARGET"
fi

echo "Der SSH-Schlüssel konnte nicht übertragen werden."
read -r -p "Enter zum Schließen …" _
`;
        const terminal = GLib.find_program_in_path('gnome-terminal') || GLib.find_program_in_path('kgx') || GLib.find_program_in_path('xterm');
        if (!terminal) return;
        const argv = terminal.endsWith('xterm')
            ? [terminal, '-e', 'bash', '-lc', script]
            : [terminal, '--', 'bash', '-lc', script];
        try { Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE); }
        catch (error) { logError(error, 'SSH-Verbindung konnte nicht gestartet werden'); }
        this._indicator.menu.close();
    }

    _connectionData(profile) {
        const port = Number.parseInt(profile.port, 10) || 22;
        const target = profile.user?.trim() ? `${profile.user.trim()}@${profile.host.trim()}` : profile.host.trim();
        let key = profile.identityFile?.trim() || GLib.build_filenamev([GLib.get_home_dir(), '.ssh', 'id_ed25519']);
        if (key.startsWith('~/')) key = GLib.build_filenamev([GLib.get_home_dir(), key.slice(2)]);
        return {port, target, key};
    }
}
