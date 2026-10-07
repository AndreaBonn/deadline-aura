"""Install/uninstall/status for the Claude Code statusline chain.

Imported lazily by ``claude-capture.py`` so the capture fast path (run
on every prompt) never pays for this module's extra stdlib imports.
"""

import hashlib
import json
import os
import sys
import time
from collections import namedtuple

import ai_usage_common as common

MAX_BACKUPS = 10

TargetFile = namedtuple("TargetFile", ("path", "data", "mode"))


def our_command():
    """Return the realpath of the running script (what we install)."""
    return os.path.realpath(os.path.abspath(sys.argv[0]))


def _candidate_paths(home):
    """List ``~/.claude/settings.json`` and every Cloak profile settings path."""
    profiles_dir = os.path.join(home, ".cloak", "profiles")
    candidates = [os.path.join(home, ".claude", "settings.json")]
    try:
        for name in sorted(os.listdir(profiles_dir)):
            candidates.append(os.path.join(profiles_dir, name, "settings.json"))
    except OSError:
        pass
    return candidates


def discover_targets(create_if_missing):
    """Return the sorted, deduplicated realpaths of every settings.json target.

    Collects ``~/.claude/settings.json`` plus every
    ``~/.cloak/profiles/*/settings.json`` that exists. If none exist
    at all and ``create_if_missing`` is set, creates an empty
    ``~/.claude/settings.json`` so there is always one target.
    """
    candidates = _candidate_paths(common.home_dir())
    existing = [path for path in candidates if os.path.exists(path)]
    if not existing and create_if_missing:
        claude_settings = candidates[0]
        common.ensure_dir(os.path.dirname(claude_settings), mode=common.DIR_MODE)
        with open(claude_settings, "w", encoding="utf-8") as handle:
            handle.write("{}")
        existing = [claude_settings]
    return sorted({os.path.realpath(path) for path in existing})


def load_capture_targets():
    """Load ``capture.json``'s ``targets`` map, tolerating a missing file."""
    path = common.capture_json_path()
    if common.is_symlink(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return {}
    if isinstance(data, dict) and isinstance(data.get("targets"), dict):
        return data["targets"]
    return {}


def save_capture_targets(targets):
    """Persist the ``targets`` map to ``capture.json`` atomically."""
    path = common.capture_json_path()
    if common.is_symlink(path):
        return
    common.ensure_dir(os.path.dirname(path), mode=common.DIR_MODE)
    common.atomic_write_json(path, {"v": 1, "targets": targets}, mode=common.FILE_MODE)


def backup_target(path):
    """Copy ``path``'s current bytes into this tool's own backups subdirectory, pruned."""
    backups = common.ensure_private_subdir(common.backups_dir(), "statusline", mode=common.DIR_MODE)
    digest = hashlib.sha256(path.encode("utf-8")).hexdigest()[:16]
    dest = os.path.join(backups, f"settings-{digest}-{time.time_ns()}.json")
    with open(path, "rb") as source:
        content = source.read()
    with open(dest, "wb") as handle:
        handle.write(content)
    os.chmod(dest, common.FILE_MODE)
    _prune_backups(backups, digest)


def _prune_backups(backups, digest):
    """Keep only the most recent ``MAX_BACKUPS`` backups for one target."""
    prefix = f"settings-{digest}-"
    try:
        names = sorted(n for n in os.listdir(backups) if n.startswith(prefix))
    except OSError:
        return
    excess = names[:-MAX_BACKUPS] if len(names) > MAX_BACKUPS else []
    for name in excess:
        try:
            os.remove(os.path.join(backups, name))
        except OSError:
            pass


def _load_targets_or_abort(targets):
    """Parse every target's JSON upfront so a bad file aborts with no writes.

    Returns
    -------
    dict or None
        Map of target path to ``(data, mode)``, or ``None`` if any
        target failed to parse. The caller exits 1 in that case.
    """
    parsed = {}
    for path in targets:
        try:
            parsed[path] = common.load_json_file(path)
        except (OSError, ValueError) as exc:
            print(f"{path}: {exc}", file=sys.stderr)
            return None
    return parsed


def _is_our_status_line(current, command):
    """Return True when ``current`` is the statusLine this tool installed."""
    return (
        isinstance(current, dict)
        and current.get("type") == "command"
        and current.get("command") == command
    )


def _install_target(target, command, capture_targets):
    """Point one target at the capture, recording its previous statusLine first.

    ``capture.json`` is saved before ``settings.json`` is written, so an
    interruption on a later target never loses the statusLine to restore.

    Parameters
    ----------
    target : TargetFile
        The settings file being installed into (path, data, mode).
    command : str
        The capture command to install as the new ``statusLine``.
    capture_targets : dict
        Map of target path to its previous ``statusLine``, updated in place.
    """
    current = target.data.get("statusLine")
    backup_target(target.path)
    capture_targets[target.path] = current
    save_capture_targets(capture_targets)
    new_status = dict(current) if isinstance(current, dict) else {}
    new_status["type"] = "command"
    new_status["command"] = command
    common.atomic_write_settings(
        target.path, {**target.data, "statusLine": new_status}, target.mode
    )


def run_install():
    """Install the chain command on every discovered settings target."""
    targets = discover_targets(create_if_missing=True)
    parsed = _load_targets_or_abort(targets)
    if parsed is None:
        return 1

    capture_targets = load_capture_targets()
    changed, unchanged = [], []
    command = our_command()
    for path in targets:
        data, mode = parsed[path]
        if _is_our_status_line(current=data.get("statusLine"), command=command):
            unchanged.append(path)
            continue
        _install_target(TargetFile(path, data, mode), command, capture_targets)
        changed.append(path)

    _print_result(changed, unchanged, warnings=[])
    return 0


def _uninstall_target(path, data, mode, capture_targets):
    """Restore one target, then drop its record from ``capture.json``.

    The record is removed only after ``settings.json`` is written, so a
    failed write leaves it available for the next uninstall.
    """
    backup_target(path)
    previous = capture_targets[path]
    # Replacing the value in place keeps statusLine at its original position.
    if previous is None:
        restored = {key: value for key, value in data.items() if key != "statusLine"}
    else:
        restored = {**data, "statusLine": previous}
    common.atomic_write_settings(path, restored, mode)
    del capture_targets[path]
    save_capture_targets(capture_targets)


def _uninstall_warning(path, data, command, capture_targets):
    """Explain why a target is left untouched, or return None when it is not ours."""
    if not _is_our_status_line(current=data.get("statusLine"), command=command):
        if path in capture_targets:
            return f"{path}: statusLine was changed by the user, left untouched"
        return None
    if path not in capture_targets:
        return f"{path}: no recorded statusLine to restore, left untouched (see backups)"
    return None


def run_uninstall():
    """Restore the pre-install statusLine on every target that is still ours."""
    targets = discover_targets(create_if_missing=False)
    parsed = _load_targets_or_abort(targets)
    if parsed is None:
        return 1

    capture_targets = load_capture_targets()
    changed, unchanged, warnings = [], [], []
    command = our_command()
    for path in targets:
        data, mode = parsed[path]
        restorable = (
            _is_our_status_line(current=data.get("statusLine"), command=command)
            and path in capture_targets
        )
        if not restorable:
            unchanged.append(path)
            warning = _uninstall_warning(path, data, command, capture_targets)
            if warning:
                warnings.append(warning)
            continue
        _uninstall_target(path, data, mode, capture_targets)
        changed.append(path)

    _print_result(changed, unchanged, warnings)
    return 0


def run_status():
    """Report install status for every target without modifying anything."""
    targets = discover_targets(create_if_missing=False)
    command = our_command()
    result = {}
    installed_any = False
    for path in targets:
        try:
            data, _ = common.load_json_file(path)
        except (OSError, ValueError):
            result[path] = {"installed": False, "error": "invalid_json"}
            continue
        is_ours = _is_our_status_line(current=data.get("statusLine"), command=command)
        result[path] = {"installed": is_ours}
        installed_any = installed_any or is_ours
    print(json.dumps({"installed": installed_any, "targets": result}))
    return 0


def _print_result(changed, unchanged, warnings):
    """Print the install/uninstall JSON result contract to stdout."""
    print(json.dumps({"ok": True, "changed": changed, "unchanged": unchanged, "warnings": warnings}))


def run(mode):
    """Dispatch to the requested installer subcommand."""
    if mode == "install":
        return run_install()
    if mode == "uninstall":
        return run_uninstall()
    return run_status()
