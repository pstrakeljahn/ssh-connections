import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {getTexts} from './translations.js';

const COLORS = ['#8ec5ff', '#b39df3', '#8bd5ca', '#f6c177', '#f28fad', '#a6da95'];
let TEXT = getTexts('system');

export default class SSHConnectionsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._window = window;
        this._settings = this.getSettings();
        TEXT = getTexts(this._settings.get_string('language'));
        window.set_default_size(650, 680);
        const page = new Adw.PreferencesPage({title: TEXT.title, icon_name: 'network-server-symbolic'});
        const languageGroup = new Adw.PreferencesGroup({title: TEXT.language});
        const languageModel = Gtk.StringList.new([TEXT.systemLanguage, TEXT.german, TEXT.english, TEXT.spanish, TEXT.french]);
        const language = new Adw.ComboRow({title: TEXT.languageDescription, model: languageModel});
        const languageIndex = {system: 0, de: 1, en: 2, es: 3, fr: 4}[this._settings.get_string('language')] ?? 0;
        language.selected = languageIndex;
        language.connect('notify::selected', () => this._settings.set_string('language', ['system', 'de', 'en', 'es', 'fr'][language.selected] || 'system'));
        languageGroup.add(language); page.add(languageGroup);
        const monitoring = new Adw.PreferencesGroup({title: TEXT.monitoring, description: TEXT.monitorDescription});
        const enabled = new Adw.SwitchRow({title: TEXT.monitor, subtitle: TEXT.monitorSubtitle, active: this._settings.get_boolean('monitoring-enabled')});
        enabled.connect('notify::active', () => this._settings.set_boolean('monitoring-enabled', enabled.active));
        const interval = new Adw.SpinRow({title: TEXT.interval, subtitle: TEXT.seconds, adjustment: new Gtk.Adjustment({lower: 60, upper: 3600, step_increment: 60, value: Math.max(60, this._settings.get_int('ping-interval'))})});
        interval.connect('notify::value', () => this._settings.set_int('ping-interval', interval.value));
        monitoring.add(enabled); monitoring.add(interval); page.add(monitoring);
        const panel = new Adw.PreferencesGroup({title: TEXT.panel});
        const panelModel = Gtk.StringList.new([TEXT.right, TEXT.left]);
        const panelPosition = new Adw.ComboRow({title: TEXT.panelDescription, model: panelModel});
        panelPosition.selected = this._settings.get_string('panel-position') === 'left' ? 1 : 0;
        panelPosition.connect('notify::selected', () => this._settings.set_string('panel-position', panelPosition.selected === 1 ? 'left' : 'right'));
        panel.add(panelPosition); page.add(panel);
        const categoryGroup = new Adw.PreferencesGroup({title: TEXT.categories, description: TEXT.categoriesDescription});
        this._categoryList = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list']});
        categoryGroup.add(this._categoryList);
        const categoryAddRow = new Adw.ActionRow({title: TEXT.newCategory});
        this._categoryEntry = new Gtk.Entry({placeholder_text: TEXT.categoryPlaceholder, hexpand: true});
        const categoryAdd = new Gtk.Button({icon_name: 'list-add-symbolic', tooltip_text: TEXT.add, valign: Gtk.Align.CENTER});
        categoryAdd.add_css_class('suggested-action');
        categoryAdd.connect('clicked', () => this._addCategory());
        this._categoryEntry.connect('activate', () => this._addCategory());
        categoryAddRow.add_suffix(this._categoryEntry); categoryAddRow.add_suffix(categoryAdd); categoryGroup.add(categoryAddRow); page.add(categoryGroup);
        const group = new Adw.PreferencesGroup({title: TEXT.connections, description: TEXT.connectionsDescription});
        page.add(group);
        this._list = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list']});
        group.add(this._list);
        const add = new Gtk.Button({label: TEXT.newConnection, icon_name: 'list-add-symbolic', halign: Gtk.Align.CENTER, margin_top: 18});
        add.add_css_class('suggested-action');
        add.connect('clicked', () => this._edit(null));
        group.add(add);
        window.add(page);
        this._settings.connect('changed::profiles', () => this._render());
        this._settings.connect('changed::categories', () => { this._renderCategories(); this._render(); });
        this._renderCategories();
        this._render();
        window.connect('close-request', () => {
            this._settings = null;
            this._window = null;
            this._categoryList = null;
            this._categoryEntry = null;
            this._list = null;
            return false;
        });
    }

    _get() { try { return JSON.parse(this._settings.get_string('profiles')) || []; } catch (_) { return []; } }
    _save(profiles) { this._settings.set_string('profiles', JSON.stringify(profiles)); }
    _getCategories() { try { return JSON.parse(this._settings.get_string('categories')) || []; } catch (_) { return []; } }
    _saveCategories(categories) { this._settings.set_string('categories', JSON.stringify(categories)); }

    _addCategory() {
        const value = this._categoryEntry.text.trim();
        const categories = this._getCategories();
        if (!value || categories.includes(value)) return;
        categories.push(value); this._saveCategories(categories); this._categoryEntry.text = '';
    }

    _renderCategories() {
        if (!this._categoryList) return;
        while (this._categoryList.get_first_child()) this._categoryList.remove(this._categoryList.get_first_child());
        const categories = this._getCategories();
        categories.forEach((category, index) => {
            const row = new Adw.ActionRow({title: category});
            const up = new Gtk.Button({icon_name: 'go-up-symbolic', tooltip_text: TEXT.up, valign: Gtk.Align.CENTER, sensitive: index > 0});
            const down = new Gtk.Button({icon_name: 'go-down-symbolic', tooltip_text: TEXT.down, valign: Gtk.Align.CENTER, sensitive: index < categories.length - 1});
            const del = new Gtk.Button({icon_name: 'user-trash-symbolic', tooltip_text: TEXT.delete, valign: Gtk.Align.CENTER});
            up.add_css_class('flat'); down.add_css_class('flat'); del.add_css_class('flat'); del.add_css_class('destructive-action');
            up.connect('clicked', () => this._moveCategory(index, -1)); down.connect('clicked', () => this._moveCategory(index, 1));
            del.connect('clicked', () => { const next = this._getCategories(); next.splice(index, 1); this._saveCategories(next); const profiles = this._get().map(profile => profile.category === category ? {...profile, category: ''} : profile); this._save(profiles); });
            row.add_suffix(up); row.add_suffix(down); row.add_suffix(del); this._categoryList.append(row);
        });
    }

    _moveCategory(index, delta) {
        const categories = this._getCategories(); const target = index + delta;
        if (target < 0 || target >= categories.length) return;
        [categories[index], categories[target]] = [categories[target], categories[index]]; this._saveCategories(categories);
    }

    _render() {
        while (this._list.get_first_child()) this._list.remove(this._list.get_first_child());
        const profiles = this._get();
        if (!profiles.length) {
            this._list.append(new Adw.ActionRow({title: TEXT.noConnections, subtitle: TEXT.noConnectionsSubtitle}));
            return;
        }
        profiles.forEach((profile, index) => {
            const row = new Adw.ActionRow({title: profile.name || profile.host, subtitle: `${profile.user ? `${profile.user}@` : ''}${profile.host}:${profile.port || 22}`});
            const up = new Gtk.Button({icon_name: 'go-up-symbolic', tooltip_text: TEXT.up, valign: Gtk.Align.CENTER, sensitive: index > 0});
            up.add_css_class('flat');
            up.connect('clicked', () => this._move(index, -1));
            const down = new Gtk.Button({icon_name: 'go-down-symbolic', tooltip_text: TEXT.down, valign: Gtk.Align.CENTER, sensitive: index < profiles.length - 1});
            down.add_css_class('flat');
            down.connect('clicked', () => this._move(index, 1));
            const edit = new Gtk.Button({icon_name: 'document-edit-symbolic', tooltip_text: TEXT.edit, valign: Gtk.Align.CENTER});
            edit.add_css_class('flat');
            edit.connect('clicked', () => this._edit(index));
            const del = new Gtk.Button({icon_name: 'user-trash-symbolic', tooltip_text: TEXT.delete, valign: Gtk.Align.CENTER});
            del.add_css_class('flat');
            del.add_css_class('destructive-action');
            del.connect('clicked', () => { const next = this._get(); next.splice(index, 1); this._save(next); });
            row.add_suffix(up); row.add_suffix(down); row.add_suffix(edit); row.add_suffix(del); this._list.append(row);
        });
    }

    _move(index, delta) {
        const profiles = this._get();
        const target = index + delta;
        if (target < 0 || target >= profiles.length) return;
        [profiles[index], profiles[target]] = [profiles[target], profiles[index]];
        this._save(profiles);
    }

    _edit(index) {
        const profiles = this._get();
        const old = index === null ? {name: '', host: '', user: '', port: '22', identityFile: '', category: '', color: COLORS[profiles.length % COLORS.length]} : profiles[index];
        const dialog = new Adw.PreferencesDialog({title: index === null ? 'Neue Verbindung' : 'Verbindung bearbeiten'});
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        const name = new Adw.EntryRow({title: TEXT.name, text: old.name});
        const host = new Adw.EntryRow({title: TEXT.host, text: old.host});
        const user = new Adw.EntryRow({title: TEXT.user, text: old.user});
        const port = new Adw.SpinRow({title: TEXT.port, adjustment: new Gtk.Adjustment({lower: 1, upper: 65535, step_increment: 1, value: Number(old.port) || 22})});
        const key = new Adw.EntryRow({title: TEXT.key, text: old.identityFile, show_apply_button: false});
        key.set_tooltip_text('Zum Beispiel ~/.ssh/id_ed25519');
        const authHint = new Adw.ActionRow({title: TEXT.password, subtitle: TEXT.passwordHint});
        const categoryModel = Gtk.StringList.new([TEXT.noCategory, ...this._getCategories()]);
        const category = new Adw.ComboRow({title: TEXT.category, model: categoryModel});
        const categoryIndex = Math.max(0, this._getCategories().indexOf(old.category || '') + 1);
        category.selected = old.category ? categoryIndex : 0;
        group.add(name); group.add(host); group.add(user); group.add(port); group.add(key); group.add(category); group.add(authHint); page.add(group);
        const actions = new Adw.PreferencesGroup();
        const save = new Gtk.Button({label: TEXT.save, halign: Gtk.Align.CENTER, margin_top: 14});
        save.add_css_class('suggested-action');
        save.connect('clicked', () => {
            if (!host.text.trim()) { host.add_css_class('error'); return; }
            const selectedCategory = category.selected > 0 ? categoryModel.get_string(category.selected) : '';
            const profile = {name: name.text.trim() || host.text.trim(), host: host.text.trim(), user: user.text.trim(), port: String(port.value), identityFile: key.text.trim(), category: selectedCategory, color: old.color || COLORS[0]};
            if (index === null) profiles.push(profile); else profiles[index] = profile;
            this._save(profiles); dialog.close();
        });
        actions.add(save); page.add(actions); dialog.add(page); dialog.present(this._window || null);
    }
}
