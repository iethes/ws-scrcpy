Device Tracker 3-Column Flex Layout - Documentation Summary
CSS Changes (src/style/devicelist.css)
The device list container uses flexbox with 3 columns:
#devices .device-list {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 20px;
}
#devices .device-list div.device {
    flex: 0 0 calc(33.33% - 14px);
    box-sizing: border-box;
    min-width: 200px;
}
HTML Structure
The DOM structure is:
<div id="devices">
  <div id="goog_device_list" class="device-list">
    <div id="tracker_instance1" style="display: contents;">
      <div id="tracker_instance1_name" class="tracker-name">aDevice Tracker [hostname]</div>
      <div class="device">...</div>
      <div class="device">...</div>
      <div class="device">...</div>
    </div>
  </div>
</div>
Key Implementation Points
1. .device-list is the flex container with display: flex and flex-wrap: wrap
2. .device cards are set to flex: 0 0 calc(33.33% - 14px) for exactly 3 columns accounting for 20px gap
3. tracker_instance# uses display: contents to not interfere with flex layout (children participate in flex parent)
4. .tracker-name spans full width with width: 100% and flex-basis: 100%
JavaScript (src/app/client/BaseDeviceTracker.ts)
- Line 132-145: getOrCreateTrackerBlock() - Creates wrapper with display: contents
- Line 106-115: buildDeviceTable() - Appends devices to tracker block (not directly to tbody)
Build System Changes (webpack/ws-scrcpy.common.ts)
Added cache-busting to avoid stale assets:
- bundle.[contenthash].js for JavaScript
- main.[contenthash].css for CSS
