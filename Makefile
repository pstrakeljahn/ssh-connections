UUID := ssh-connections@pstrakeljahn
DIST := dist
ZIP := $(DIST)/$(UUID).shell-extension.zip

.PHONY: check pack clean

check:
	node --check extension.js
	node --check prefs.js
	node --check translations.js
	glib-compile-schemas schemas

pack: check
	@mkdir -p $(DIST)
	@gnome-extensions pack --force --extra-source translations.js --out-dir $(DIST) .
	@echo "Release-Paket: $(ZIP)"

clean:
	rm -rf $(DIST)
