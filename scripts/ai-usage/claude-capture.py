#!/usr/bin/python3 -IS
"""Entry point for the deadline-aura AI usage capture/installer tool.

Modes
-----
(no argument)
    Statusline capture: reads a Claude Code statusline JSON payload
    from stdin, extracts and persists the rate-limit windows it
    recognizes, then prints a fallback line or forwards a chained
    statusline's own output. Always exits 0.
install / uninstall / status
    Delegated to ``capture_install``, imported lazily so the capture
    fast path (run on every prompt) never pays for it.
"""

import json
import math
import os
import re
import stat
import subprocess
import sys
import time

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

import ai_usage_common as common

ACCOUNT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
CHAIN_TIMEOUT_SECONDS = 2
RATE_LIMIT_WINDOWS = ("five_hour", "seven_day")
MS_THRESHOLD = 1e12


def read_stdin_capped(limit):
    """Drain stdin fully, keeping only the first ``limit`` bytes.

    Draining instead of stopping early avoids leaving data unread in
    the pipe, which could otherwise block or error out the writer.
    """
    data = bytearray()
    try:
        fd = sys.stdin.fileno()
    except (AttributeError, ValueError, OSError):
        return bytes(data)
    while True:
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            break
        if not chunk:
            break
        if len(data) < limit:
            data.extend(chunk[: limit - len(data)])
    return bytes(data)


def determine_account():
    """Resolve the account id from ``CLAUDE_CONFIG_DIR``.

    Returns
    -------
    str or None
        The account id, ``"default"`` if the variable is unset, or
        ``None`` if the value is not a safe single path segment.
    """
    raw = os.environ.get("CLAUDE_CONFIG_DIR")
    if not raw:
        return common.DEFAULT_ACCOUNT
    if ".." in raw.replace("\\", "/").split("/"):
        return None
    candidate = os.path.basename(raw.rstrip("/"))
    if candidate and ACCOUNT_ID_PATTERN.match(candidate):
        return candidate
    return None


def extract_windows(payload):
    """Extract whitelisted, validated rate-limit windows from a payload.

    Only ``rate_limits.five_hour``/``rate_limits.seven_day`` are read,
    and only their ``used_percentage``/``resets_at`` numeric fields.
    Everything else in the payload (cwd, session id, ...) is ignored.
    """
    windows = {}
    if not isinstance(payload, dict):
        return windows
    rate_limits = payload.get("rate_limits")
    if not isinstance(rate_limits, dict):
        return windows
    for name in RATE_LIMIT_WINDOWS:
        block = rate_limits.get(name)
        if not isinstance(block, dict):
            continue
        pct = block.get("used_percentage")
        resets_at = block.get("resets_at")
        if not (common.is_finite_number(pct) and common.is_finite_number(resets_at)):
            continue
        windows[name] = {
            "pct": common.clamp(pct, 0, 100),
            "resets_at": normalize_resets_at(resets_at),
        }
    return windows


def normalize_resets_at(value):
    """Convert a millisecond epoch to seconds; pass seconds through."""
    if value > MS_THRESHOLD:
        return int(value / 1000)
    return int(value)


def merge_windows(previous, current):
    """Merge extracted windows with the previous snapshot's windows.

    A window missing from ``current`` keeps the value from
    ``previous``, so a payload reporting only one window never erases
    the other.
    """
    merged = {}
    for name in RATE_LIMIT_WINDOWS:
        if name in current:
            merged[name] = current[name]
        elif isinstance(previous, dict) and isinstance(previous.get(name), dict):
            merged[name] = previous[name]
    return merged


def load_previous_snapshot(path):
    """Load a previous snapshot, refusing to follow a symlink target."""
    if common.is_symlink(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def write_snapshot(path, account, merged):
    """Write the merged snapshot atomically, refusing a symlinked target."""
    if common.is_symlink(path):
        common.log_error("snapshot_target_symlink", 0)
        return
    common.ensure_dir(os.path.dirname(path), common.DIR_MODE)
    payload = {
        "v": common.SNAPSHOT_SCHEMA_VERSION,
        "account": account,
        "captured_at": int(time.time()),
    }
    payload.update(merged)
    try:
        common.atomic_write_json(path, payload, common.FILE_MODE)
    except OSError:
        common.log_error("snapshot_write_error", 0)


def format_pct(value):
    """Render a clamped percentage as an integer string, rounding half up."""
    # Matches JS Math.round in the band; Python's round() is half-to-even.
    return str(math.floor(value + 0.5))


def format_fallback_text(merged):
    """Render the own-text statusline fallback from known windows."""
    parts = []
    if "five_hour" in merged:
        parts.append(f"5h {format_pct(merged['five_hour']['pct'])}%")
    if "seven_day" in merged:
        parts.append(f"7d {format_pct(merged['seven_day']['pct'])}%")
    return " | ".join(parts) if parts else "limits n/a"


def resolve_settings_path():
    """Return the realpath of the settings.json this call belongs to."""
    config_dir = os.environ.get("CLAUDE_CONFIG_DIR")
    if config_dir:
        candidate = os.path.join(config_dir, "settings.json")
    else:
        candidate = os.path.join(common.home_dir(), ".claude", "settings.json")
    return os.path.realpath(candidate)


def _stat_is_unsafe(st):
    """True if ``st`` is a symlink, not ours, or group/other-writable."""
    if stat.S_ISLNK(st.st_mode):
        return True
    if st.st_uid != os.getuid():
        return True
    return bool(st.st_mode & (stat.S_IWGRP | stat.S_IWOTH))


def load_chain_command():
    """Return the configured chain command for this call's settings target.

    Only trusts ``capture.json`` if it is not a symlink, is owned by
    the current user, and has no group/other write bits -- otherwise a
    co-located process with a different UID could plant a command for
    us to execute.
    """
    path = common.capture_json_path()
    try:
        st = os.lstat(path)
    except OSError:
        return None
    if _stat_is_unsafe(st):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
    except (OSError, ValueError):
        return None
    if not isinstance(config, dict):
        return None
    targets = config.get("targets")
    if not isinstance(targets, dict):
        return None
    entry = targets.get(resolve_settings_path())
    if not isinstance(entry, dict):
        return None
    command = entry.get("command")
    return command if isinstance(command, str) and command.strip() else None


def run_chain(command, raw_bytes):
    """Run the configured chain command, forwarding the original stdin."""
    try:
        # Deroga ADR-1/A4 a "no shell=True": stessa semantica con cui
        # Claude Code esegue la statusline; la stringa è dell'utente e
        # il file che la contiene è 0600 e di sua proprietà.
        result = subprocess.run(
            ["/bin/sh", "-c", command],
            input=raw_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=CHAIN_TIMEOUT_SECONDS,
        )
    except (subprocess.TimeoutExpired, OSError):
        return None
    if result.returncode != 0 or not result.stdout:
        return None
    return result.stdout


def run_capture():
    """Run the statusline capture mode end-to-end. Always returns 0."""
    raw = read_stdin_capped(common.MAX_STDIN_BYTES)
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        common.log_error("invalid_payload", len(raw))
        payload = None

    account = determine_account()
    windows = extract_windows(payload)

    previous = None
    if account is not None:
        path = common.snapshot_path(account)
        previous = load_previous_snapshot(path)
        if windows:
            write_snapshot(path, account, merge_windows(previous, windows))

    merged_for_display = merge_windows(previous, windows)

    command = load_chain_command()
    chain_output = run_chain(command, raw) if command else None
    if chain_output is not None:
        sys.stdout.buffer.write(chain_output)
    else:
        sys.stdout.write(format_fallback_text(merged_for_display))
    return 0


def main(argv):
    """Dispatch to capture mode or to the installer module."""
    if len(argv) > 1 and argv[1] in ("install", "uninstall", "status"):
        import capture_install

        return capture_install.run(argv[1])
    try:
        return run_capture()
    except Exception:  # capture must never fail the statusline
        try:
            common.log_error("unhandled_exception", 0)
        except Exception:
            pass
        try:
            sys.stdout.write("limits n/a")
        except Exception:
            pass
        return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
