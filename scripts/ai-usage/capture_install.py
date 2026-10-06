"""Install/uninstall/status for the Claude Code statusline chain.

Imported lazily by ``claude-capture.py`` so the capture fast path (run
on every prompt) never pays for this module's extra stdlib imports.
"""

import hashlib
import json
import os
import sys
import time

import ai_usage_common as common

MAX_BACKUPS = 10


def our_command():
    """Return the realpath of the running script (what we install)."""
    return os.path.realpath(os.path.abspath(sys.argv[0]))


def discover_targets(create_if_missing):
    """Return the deduplicated realpaths of every settings.json target.

    Collects ``~/.claude/settings.json`` plus every
    ``~/.cloak/profiles/*/settings.json`` that exists. If none exist
    at all and ``create_if_missing`` is set, creates an empty
    ``~/.claude/settings.json`` so there is always one target.
    """
    home = common.home_dir()
    claude_settings = os.path.join(home, ".claude", "settings.json")
    profiles_dir = os.path.join(home, ".cloak", "profiles")

    candidates = [claude_settings]
    try:
        for name in sorted(os.listdir(profiles_dir)):
            candidates.append(os.path.join(profiles_dir, name, "settings.json"))
    except OSError:
        pass

    existing = [path for path in candidates if os.path.exists(path)]
    if not existing and create_if_missing:
        common.ensure_dir(os.path.dirname(claude_settings), common.DIR_MODE)
        with open(claude_settings, "w", encoding="utf-8") as handle:
            handle.write("{}")
        existing = [claude_settings]

    seen = set()
    realpaths = []
    for path in existing:
        real = os.path.realpath(path)
        if real not in seen:
            seen.add(real)
            realpaths.append(real)
    return sorted(realpaths)


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
    common.ensure_dir(os.path.dirname(path), common.DIR_MODE)
    common.atomic_write_json(path, {"v": 1, "targets": targets}, common.FILE_MODE)


def backup_target(path):
    """Copy ``path``'s current bytes into the backups directory, pruned."""
    common.ensure_dir(common.backups_dir(), common.DIR_MODE)
    digest = hashlib.sha256(path.encode("utf-8")).hexdigest()[:16]
    dest = os.path.join(common.backups_dir(), f"settings-{digest}-{time.time_ns()}.json")
    with open(path, "rb") as source:
        content = source.read()
    with open(dest, "wb") as handle:
        handle.write(content)
    os.chmod(dest, common.FILE_MODE)
    _prune_backups(digest)


def _prune_backups(digest):
    """Keep only the most recent ``MAX_BACKUPS`` backups for one target."""
    prefix = f"settings-{digest}-"
    try:
        names = sorted(n for n in os.listdir(common.backups_dir()) if n.startswith(prefix))
    except OSError:
        return
    excess = names[:-MAX_BACKUPS] if len(names) > MAX_BACKUPS else []
    for name in excess:
        try:
            os.remove(os.path.join(common.backups_dir(), name))
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
        current = data.get("statusLine")
        already_ours = (
            isinstance(current, dict)
            and current.get("type") == "command"
            and current.get("command") == command
        )
        if already_ours:
            unchanged.append(path)
            continue
        backup_target(path)
        capture_targets[path] = current
        new_status = dict(current) if isinstance(current, dict) else {}
        new_status["type"] = "command"
        new_status["command"] = command
        data["statusLine"] = new_status
        common.atomic_write_json(path, data, mode)
        changed.append(path)

    save_capture_targets(capture_targets)
    _print_result(changed, unchanged, [])
    return 0


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
        current = data.get("statusLine")
        is_ours = (
            isinstance(current, dict)
            and current.get("type") == "command"
            and current.get("command") == command
        )
        if not is_ours:
            unchanged.append(path)
            if path in capture_targets:
                warnings.append(f"{path}: statusLine was changed by the user, left untouched")
            continue
        backup_target(path)
        previous = capture_targets.pop(path, None)
        if previous is None:
            data.pop("statusLine", None)
        else:
            data["statusLine"] = previous
        common.atomic_write_json(path, data, mode)
        changed.append(path)

    save_capture_targets(capture_targets)
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
        current = data.get("statusLine")
        is_ours = (
            isinstance(current, dict)
            and current.get("type") == "command"
            and current.get("command") == command
        )
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
