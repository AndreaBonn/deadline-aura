#!/bin/bash
# Maintainer postinst. Replaces electron-builder's default after-install
# template, so it must reproduce its essential steps (launcher symlink,
# chrome-sandbox SUID, cache refresh) and then register the login autostart.
set -e

APP_DIR="/opt/DeadlineAura"

# Expose the launcher in PATH.
ln -sf "${APP_DIR}/deadlineaura" /usr/bin/deadlineaura

# Electron's sandbox helper needs SUID root, otherwise the app fails to start.
chmod 4755 "${APP_DIR}/chrome-sandbox" || true

# Refresh desktop, mime and icon caches.
update-mime-database /usr/share/mime || true
update-desktop-database /usr/share/applications || true
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

# Launch at login for every user; users can disable it from GNOME settings.
AUTOSTART_SRC="${APP_DIR}/resources/autostart/deadlineaura.desktop"
if [ -f "$AUTOSTART_SRC" ]; then
    install -d /etc/xdg/autostart
    install -m 0644 "$AUTOSTART_SRC" /etc/xdg/autostart/deadlineaura.desktop
fi

exit 0
