#!/usr/bin/env bash
# Installa DeadlineAura come servizio systemd user (auto-start + auto-restart)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_SRC="$PROJECT_DIR/autostart/deadlineaura.service"
DESKTOP_SRC="$PROJECT_DIR/autostart/deadlineaura.desktop"

SYSTEMD_DIR="$HOME/.config/systemd/user"
AUTOSTART_DIR="$HOME/.config/autostart"

echo "=== DeadlineAura Autostart Setup ==="

# 1. Installa systemd user service
mkdir -p "$SYSTEMD_DIR"
cp "$SERVICE_SRC" "$SYSTEMD_DIR/deadlineaura.service"
echo "✓ Service copiato in $SYSTEMD_DIR"

# 2. Installa desktop entry per autostart GNOME (backup)
mkdir -p "$AUTOSTART_DIR"
cp "$DESKTOP_SRC" "$AUTOSTART_DIR/deadlineaura.desktop"
echo "✓ Desktop entry copiato in $AUTOSTART_DIR"

# 3. Abilita e avvia il service
systemctl --user daemon-reload
systemctl --user enable deadlineaura.service
systemctl --user start deadlineaura.service
echo "✓ Service abilitato e avviato"

# 4. Abilita lingering (service attivo anche prima del login grafico)
loginctl enable-linger "$USER"
echo "✓ Linger abilitato per $USER"

echo ""
echo "=== Comandi utili ==="
echo "  Status:   systemctl --user status deadlineaura"
echo "  Log:      journalctl --user -u deadlineaura -f"
echo "  Stop:     systemctl --user stop deadlineaura"
echo "  Restart:  systemctl --user restart deadlineaura"
echo "  Disable:  systemctl --user disable deadlineaura"
