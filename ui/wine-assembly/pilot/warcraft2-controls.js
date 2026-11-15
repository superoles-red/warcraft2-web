/* Wine-Assembly transport for the existing BNE UI bridge. Browser gesture
 * ownership, packet handling and command behavior live in the shared code. */
(function (global) {
  'use strict';

  const UI_COMMAND_MESSAGE = 0x8120;
  const UI_COMMAND_SIGNATURE = 0x31554957;

  function create(wine, renderer) {
    if (!wine || !Array.isArray(renderer?.inputQueue) ||
        !['_unmapExclusiveInputPoint', 'handleMouseMove', 'handleMouseDown',
          'handleMouseUp', '_wakeMessageWait'].every(name => typeof renderer[name] === 'function')) {
      throw new TypeError('Wine-Assembly input transport is unavailable');
    }

    function target() {
      if (!wine.running || !wine.instance || wine.renderer !== renderer) return null;
      const transform = renderer._exclusiveTransform;
      const window = renderer.windows?.[transform?.hwnd];
      if (!window?.visible || window.isChild) return null;
      const owned = window.processId && wine.processId
        ? window.processId === wine.processId : window.wasm === wine.instance;
      return owned ? {window, transform} : null;
    }

    function inputPoint(x, y) {
      const current = target();
      if (!current || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      const {window, transform} = current;
      x = Math.floor(x);
      y = Math.floor(y);
      if (x < 0 || y < 0 || x >= window.w || y >= window.h) return null;
      const screenX = x + window.x;
      const screenY = y + window.y;
      const view = renderer._exclusivePresentationViewport;
      const useView = view && view.outputW > 0 && view.outputH > 0 &&
        view.dstW > 0 && view.dstH > 0 && view.nativeW > 0 && view.nativeH > 0;
      const left = useView ? view.nativeX : transform.srcX;
      const top = useView ? view.nativeY : transform.srcY;
      const width = useView ? view.nativeW : transform.srcW;
      const height = useView ? view.nativeH : transform.srcH;
      if (screenX < left || screenY < top || screenX >= left + width ||
          screenY >= top + height) return null;
      // The forward map floors. Send the center of the native pixel to avoid
      // losing one coordinate to floating-point rounding during inversion.
      const point = renderer._unmapExclusiveInputPoint(screenX + 0.5, screenY + 0.5);
      return Number.isFinite(point?.x) && Number.isFinite(point?.y) ? point : null;
    }

    function move(x, y) {
      const point = inputPoint(x, y);
      if (!point) return false;
      renderer.handleMouseMove(point.x, point.y);
      return true;
    }

    function button(down, internalButton, x, y) {
      // The native renderer handles left/right only. DOM button 1 would
      // otherwise become a left click, so reject it at this boundary.
      if (internalButton !== 0 && internalButton !== 1) return false;
      const point = inputPoint(x, y);
      if (!point) return false;
      const domButton = internalButton === 1 ? 2 : 0;
      const deliver = down ? renderer.handleMouseDown : renderer.handleMouseUp;
      deliver.call(renderer, point.x, point.y, domButton);
      return true;
    }

    function command(scan, radius) {
      const current = target();
      if (!current || !Number.isInteger(scan) || scan < 62 || scan > 71) return false;
      const hwnd = current.window.hwnd >>> 0;
      if (!hwnd) return false;
      const near = scan === 62 && Number.isInteger(radius) && radius >= 1 && radius <= 12;
      // Use the same FIFO as the preceding native button release. A separate
      // PostMessage could overtake it, and queued keyboard modifiers can be
      // consumed by the guest message pump before DispatchMessage.
      renderer.inputQueue.push({
        type: 'message', hwnd, processId: wine.processId,
        msg: UI_COMMAND_MESSAGE, wParam: near ? 0x100 + radius : 0x74 + scan - 62, lParam: UI_COMMAND_SIGNATURE,
      });
      renderer._wakeMessageWait(true);
      return true;
    }

    return Object.freeze({move, button, command, touchSelection:true});
  }

  const api = Object.freeze({create});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.WarcraftAssemblyInput = api;
})(typeof window !== 'undefined' ? window : globalThis);
