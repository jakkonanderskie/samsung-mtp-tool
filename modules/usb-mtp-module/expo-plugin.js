const {
  withAndroidManifest,
  withSettingsGradle,
  withAppBuildGradle,
} = require('@expo/config-plugins');

/**
 * Expo Config Plugin for USB MTP Module
 *
 * This plugin:
 * 1. Adds USB Host permissions and features to AndroidManifest.xml
 * 2. Adds USB device intent filter for auto-launch
 * 3. Registers required meta-data correctly (NOT inside intent-filter)
 * 4. Includes the native module in the Android build
 */

function withUsbMtpModule(config) {
  // ---- AndroidManifest.xml modifications ----
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure uses-feature exists
    manifest['uses-feature'] = manifest['uses-feature'] || [];

    // Add USB Host feature if missing
    if (
      !manifest['uses-feature'].some(
        (f) => f.$?.['android:name'] === 'android.hardware.usb.host'
      )
    ) {
      manifest['uses-feature'].push({
        $: {
          'android:name': 'android.hardware.usb.host',
          'android:required': 'true',
        },
      });
    }

    const app = manifest.application?.[0];
    if (!app) return config;

    const mainActivity = app.activity?.find(
      (a) => a.$?.['android:name'] === '.MainActivity'
    );
    if (!mainActivity) return config;

    // ---- Intent filter (NO meta-data allowed here) ----
    mainActivity['intent-filter'] = mainActivity['intent-filter'] || [];

    const hasUsbIntentFilter = mainActivity['intent-filter'].some((filter) =>
      filter.action?.some(
        (a) =>
          a.$?.['android:name'] ===
          'android.hardware.usb.action.USB_DEVICE_ATTACHED'
      )
    );

    if (!hasUsbIntentFilter) {
      mainActivity['intent-filter'].push({
        action: [
          {
            $: {
              'android:name':
                'android.hardware.usb.action.USB_DEVICE_ATTACHED',
            },
          },
        ],
        category: [
          {
            $: {
              'android:name': 'android.intent.category.DEFAULT',
            },
          },
        ],
      });
    }

    // ---- Meta-data (MUST be under <activity>, NOT intent-filter) ----
    mainActivity['meta-data'] = mainActivity['meta-data'] || [];

    const hasUsbMetaData = mainActivity['meta-data'].some(
      (m) =>
        m.$?.['android:name'] ===
        'android.hardware.usb.action.USB_DEVICE_ATTACHED'
    );

    if (!hasUsbMetaData) {
      mainActivity['meta-data'].push({
        $: {
          'android:name':
            'android.hardware.usb.action.USB_DEVICE_ATTACHED',
          'android:resource': '@xml/usb_device_filter',
        },
      });
    }

    return config;
  });

  // ---- settings.gradle wiring ----
  config = withSettingsGradle(config, (config) => {
    if (!config.modResults.contents.includes('usb-mtp-module')) {
      config.modResults.contents += `
include ':usb-mtp-module'
project(':usb-mtp-module').projectDir = new File(rootProject.projectDir, '../modules/usb-mtp-module/android')
`;
    }
    return config;
  });

  // ---- app/build.gradle dependency ----
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('usb-mtp-module')) {
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    implementation project(':usb-mtp-module')`
      );
    }
    return config;
  });

  return config;
}

module.exports = withUsbMtpModule;