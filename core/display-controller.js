'use strict';

const { execFile } = require('child_process');

const STRUT_RIGHT_END_Y = 65535;

/**
 * Returns the total width of the virtual screen spanning all connected displays.
 *
 * @param {Electron.Screen} screen - Electron screen module.
 * @returns {number} Total virtual width in pixels.
 */
function getVirtualScreenWidth(screen) {
  return screen.getAllDisplays().reduce((max, d) => Math.max(max, d.bounds.x + d.bounds.width), 0);
}

/**
 * Sets the _NET_WM_STRUT_PARTIAL X11 property on a strip window so that
 * GNOME/X11 reserves the strip area and prevents other windows from overlapping it.
 * Only applied to the display on the right edge of the virtual screen.
 *
 * @param {Electron.BrowserWindow} win - Strip window to apply the strut to.
 * @param {Electron.Display} display - Display the strip occupies.
 * @param {number} strutWidth - Width to reserve (pixels).
 * @param {Electron.Screen} screen - Electron screen module.
 */
function setX11Strut(win, display, strutWidth, screen) {
  if (process.platform !== 'linux' || !process.env.DISPLAY) {
    return;
  }
  if (!win || win.isDestroyed()) {
    return;
  }
  try {
    const xid = win.getNativeWindowHandle().readUInt32LE(0);
    const virtualWidth = getVirtualScreenWidth(screen);
    const displayRightEdge = display.bounds.x + display.bounds.width;
    // Only apply strut if this display is on the right edge of the virtual screen
    if (displayRightEdge < virtualWidth) {
      return;
    }
    // _NET_WM_STRUT_PARTIAL: left,right,top,bottom,l_sy,l_ey,r_sy,r_ey,t_sx,t_ex,b_sx,b_ex
    // STRUT_RIGHT_END_Y = 65535: guarantees full-height coverage regardless of HiDPI scaling
    const strut = `0, ${strutWidth}, 0, 0, 0, 0, 0, ${STRUT_RIGHT_END_Y}, 0, 0, 0, 0`;
    const xidStr = String(xid);
    execFile(
      'xprop',
      ['-id', xidStr, '-f', '_NET_WM_STRUT_PARTIAL', '32c', '-set', '_NET_WM_STRUT_PARTIAL', strut],
      (err) => {
        if (err) {
          console.error('[strut] xprop strut error:', err.message);
        }
      },
    );
    // Make the window sticky across all workspaces so the strut applies everywhere
    execFile(
      'xprop',
      ['-id', xidStr, '-f', '_NET_WM_DESKTOP', '32c', '-set', '_NET_WM_DESKTOP', '0xffffffff'],
      (err) => {
        if (err) {
          console.error('[strut] xprop desktop error:', err.message);
        }
      },
    );
  } catch (err) {
    console.error('[strut] error:', err.message);
  }
}

/**
 * Queries wmctrl for all open windows and returns the set of display IDs
 * that currently have at least one non-DeadlineAura window visible.
 *
 * @param {Electron.Screen} screen - Electron screen module.
 * @param {(occupiedIds: Set<string>|null) => void} callback
 *   Called with a Set of occupied display ID strings, or null if wmctrl failed.
 */
function getDisplaysWithWindows(screen, callback) {
  execFile('wmctrl', ['-l', '-G', '-x'], (err, stdout) => {
    if (err) {
      callback(null);
      return;
    }

    const occupiedDisplayIds = new Set();

    for (const line of stdout.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 9) {
        continue;
      }

      const desktop = parseInt(parts[1], 10);
      if (desktop === -1) {
        continue;
      }

      const wmClass = parts[6].toLowerCase();
      if (wmClass.includes('deadlineaura') || wmClass === 'electron.electron') {
        continue;
      }

      const x = parseInt(parts[2], 10);
      const y = parseInt(parts[3], 10);
      const display = screen.getDisplayNearestPoint({ x, y });
      occupiedDisplayIds.add(String(display.id));
    }

    callback(occupiedDisplayIds);
  });
}

module.exports = { getVirtualScreenWidth, setX11Strut, getDisplaysWithWindows };
