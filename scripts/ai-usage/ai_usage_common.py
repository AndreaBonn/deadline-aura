"""Shared filesystem and JSON helpers for the AI usage capture tooling.

Both ``claude-capture.py`` (capture mode) and ``capture_install.py``
(install/uninstall/status) import this module. Stdlib only: no uv, no
pyproject, per the ADR-1 deroga for a standalone end-user script.
"""

import json
import math
import os
import stat
import time

DIR_MODE = 0o700
FILE_MODE = 0o600
MAX_STDIN_BYTES = 1024 * 1024
SNAPSHOT_SCHEMA_VERSION = 1
DEFAULT_ACCOUNT = "default"


def home_dir():
    """Return the user's home directory, from the environment or stdlib."""
    home = os.environ.get("HOME")
    if home:
        return home
    return os.path.expanduser("~")


def usage_dir():
    """Return ``~/.local/share/deadlineaura/ai-usage``."""
    return os.path.join(home_dir(), ".local", "share", "deadlineaura", "ai-usage")


def snapshot_dir():
    """Return the directory holding one snapshot file per account."""
    return os.path.join(usage_dir(), "latest")


def snapshot_path(account):
    """Return the snapshot path for a given account id."""
    return os.path.join(snapshot_dir(), f"{account}.json")


def capture_json_path():
    """Return the shared chain-command/installer config file path."""
    return os.path.join(usage_dir(), "capture.json")


def backups_dir():
    """Return ``~/.local/share/deadlineaura/backups``."""
    return os.path.join(home_dir(), ".local", "share", "deadlineaura", "backups")


def state_dir():
    """Return ``~/.local/state/deadlineaura``."""
    return os.path.join(home_dir(), ".local", "state", "deadlineaura")


def log_path():
    """Return the capture error log path."""
    return os.path.join(state_dir(), "ai-usage-capture.log")


def ensure_dir(path, mode):
    """Create ``path`` (and parents) if missing, then enforce ``mode``.

    Parameters
    ----------
    path : str
        Directory to create.
    mode : int
        Octal permission bits to enforce after creation.
    """
    os.makedirs(path, mode=mode, exist_ok=True)
    try:
        os.chmod(path, mode)
    except OSError:
        pass


def log_error(kind, length):
    """Append one line to the capture log. Never logs raw payload content.

    Parameters
    ----------
    kind : str
        Short machine-readable error category.
    length : int
        Byte length of the input that triggered the error, for context.
    """
    try:
        ensure_dir(state_dir(), DIR_MODE)
        line = f"{int(time.time())} ERROR {kind} len={length}\n"
        with open(log_path(), "a", encoding="utf-8") as handle:
            handle.write(line)
        os.chmod(log_path(), FILE_MODE)
    except OSError:
        pass


def is_symlink(path):
    """Return True if ``path`` exists and is a symlink (no dereference)."""
    try:
        return stat.S_ISLNK(os.lstat(path).st_mode)
    except OSError:
        return False


def is_finite_number(value):
    """Return True if ``value`` is a non-bool int/float and finite."""
    if isinstance(value, bool):
        return False
    if not isinstance(value, (int, float)):
        return False
    return math.isfinite(value)


def clamp(value, low, high):
    """Clamp ``value`` into the inclusive ``[low, high]`` range."""
    return max(low, min(high, value))


def atomic_write_text(path, text, mode):
    """Write ``text`` to ``path`` atomically with explicit ``mode``.

    Writes a sibling temp file created with ``O_CREAT|O_EXCL``, fsyncs
    it, then ``os.replace``s it onto ``path``. ``os.replace`` swaps the
    directory entry itself, so it never follows a symlink at ``path``.
    """
    directory = os.path.dirname(path)
    tmp_path = os.path.join(
        directory, f".{os.path.basename(path)}.{os.getpid()}.{time.time_ns()}.tmp"
    )
    fd = os.open(tmp_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, mode)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_path, mode)
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def atomic_write_json(path, payload, mode):
    """Write ``payload`` as compact JSON to ``path`` atomically (see atomic_write_text)."""
    atomic_write_text(path, json.dumps(payload, ensure_ascii=False), mode)


def atomic_write_settings(path, payload, mode):
    """Write a Claude Code settings file in its own layout: 2-space indent, final newline."""
    atomic_write_text(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n", mode)


def load_json_file(path):
    """Load and parse a JSON object file, preserving key order.

    Returns
    -------
    tuple
        ``(data, mode)``: the parsed JSON value and the file's
        permission bits. Raises ``OSError``/``ValueError`` on failure,
        which the caller decides how to react to.
    """
    with open(path, "r", encoding="utf-8") as handle:
        text = handle.read()
    data = json.loads(text)
    mode = stat.S_IMODE(os.stat(path).st_mode)
    return data, mode
