'use strict';

function getStripBounds(display, stripWidth) {
  return {
    width: stripWidth,
    height: display.workAreaSize.height,
    x: display.bounds.x + display.bounds.width - stripWidth,
    y: display.workArea.y,
  };
}

function getMeetingDockBounds(display, dockHeight) {
  return {
    width: display.workAreaSize.width,
    height: dockHeight,
    x: display.workArea.x,
    y: display.workArea.y + display.workAreaSize.height - dockHeight,
  };
}

function isRightmost(display, virtualWidth) {
  return display.bounds.x + display.bounds.width >= virtualWidth;
}

function getSidebarBounds(display, sidebarWidth) {
  return {
    x: display.workArea.x + display.workAreaSize.width - sidebarWidth,
    y: display.workArea.y,
    width: sidebarWidth,
    height: display.workAreaSize.height,
  };
}

function getOverlayBounds(display) {
  return {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.size.width,
    height: display.size.height,
  };
}

function findDisplayById(displays, displayId) {
  return displays.find((d) => String(d.id) === displayId);
}

module.exports = {
  getStripBounds,
  getMeetingDockBounds,
  isRightmost,
  getSidebarBounds,
  getOverlayBounds,
  findDisplayById,
};
