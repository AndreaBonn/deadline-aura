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

module.exports = { getStripBounds, getMeetingDockBounds, isRightmost };
