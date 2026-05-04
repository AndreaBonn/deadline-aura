'use strict';

document.body.addEventListener('click', function () {
  window.deadlineAura.toggleSidebar();
});

window.deadlineAura.onStripColor(function (hex) {
  document.body.style.backgroundColor = hex;
});
