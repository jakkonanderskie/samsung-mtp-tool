# USB MTP Module

Native Android module for USB Host communication with MTP devices via USB OTG.

## Overview

This module provides React Native bindings to Android's USB Host API, enabling the app to:

- Detect USB devices connected via OTG adapter
- Request USB permissions from the user
- Open connections to MTP-capable devices
- Send raw MTP command packets via bulk transfer
- Receive responses from devices

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native Layer                        │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  useUsbDevice   │───▶│  modules/usb-mtp-module/index.ts│ │
│  │     Hook        │    │     (TypeScript API)            │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Native Android Layer                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              UsbMtpModule.kt                            ││
│  │  - USB device enumeration                               ││
│  │  - Permission management                                ││
│  │  - Connection handling                                  ││
│  │  - Bulk transfer for MTP commands                       ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │              UsbMtpPackage.kt                           ││
│  │  - Registers module with React Native                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Android USB Host API                      │
│  - UsbManager                                                │
│  - UsbDevice                                                 │
│  - UsbDeviceConnection                                       │
│  - UsbEndpoint (Bulk IN/OUT)                                │
└─────────────────────────────────────────────────────────────┘
```

## Files

```
modules/usb-mtp-module/
├── android/
│   ├── build.gradle                    # Gradle build config
│   └── src/main/
│       ├── AndroidManifest.xml         # USB permissions
│       ├── res/xml/
│       │   └── usb_device_filter.xml   # Device vendor IDs
│       └── java/com/usbmtpmodule/
│           ├── UsbMtpModule.kt         # Main native module
│           └── UsbMtpPackage.kt        # RN package registration
├── index.ts                            # TypeScript API
├── expo-plugin.js                      # Expo config plugin
├── package.json                        # Module metadata
└── README.md                           # This file
```

## Supported Devices

The module includes a USB device filter that automatically recognizes:

| Vendor | Vendor ID | Notes |
|--------|-----------|-------|
| Samsung | 0x04E8 | Primary target |
| Google/Nexus | 0x18D1 | |
| LG | 0x1004 | |
| Huawei | 0x12D1 | |
| Xiaomi | 0x2717 | |
| OnePlus | 0x2A70 | |
| Sony | 0x0FCE | |
| Motorola | 0x22B8 | |
| HTC | 0x0BB4 | |
| OPPO | 0x22D9 | |
| Vivo/Realme | 0x2D95 | |

Additionally, any device presenting as MTP class (class 6, subclass 1, protocol 1) will be detected.

## MTP Packet Format

The module constructs MTP command packets in the standard format:

```
┌────────────────┬────────────────┬────────────────┬────────────────┐
│ Container Len  │ Container Type │ Operation Code │ Transaction ID │
│   (4 bytes)    │   (2 bytes)    │   (2 bytes)    │   (4 bytes)    │
├────────────────┴────────────────┴────────────────┴────────────────┤
│                     Parameters (4 bytes each)                      │
└───────────────────────────────────────────────────────────────────┘
```

- **Container Length**: Total packet size in bytes (little-endian)
- **Container Type**: 0x0001 for command, 0x0003 for response
- **Operation Code**: The MTP opcode (e.g., 0xFE01 for Samsung Factory Reset)
- **Transaction ID**: Incrementing counter for request/response matching
- **Parameters**: Optional 32-bit parameters

## API Reference

### `UsbMtpModule.getConnectedDevices()`

Returns a list of all connected USB devices.

```typescript
const devices = await UsbMtpModule.getConnectedDevices();
// Returns: UsbDeviceInfo[]
```

### `UsbMtpModule.requestPermission(deviceId)`

Requests USB permission for a specific device. Shows system dialog.

```typescript
const granted = await UsbMtpModule.requestPermission(device.deviceId);
// Returns: boolean
```

### `UsbMtpModule.openConnection(deviceId)`

Opens a USB connection and claims the MTP interface.

```typescript
const connection = await UsbMtpModule.openConnection(device.deviceId);
// Returns: ConnectionInfo | null
```

### `UsbMtpModule.sendMtpCommand(opcode, params?)`

Sends an MTP command packet to the connected device.

```typescript
const result = await UsbMtpModule.sendMtpCommand(0xFE01, []);
// Returns: MtpCommandResult | null
```

### `UsbMtpModule.closeConnection()`

Closes the current USB connection.

```typescript
await UsbMtpModule.closeConnection();
```

### Event Listeners

```typescript
// Device attached
const unsubscribe = UsbMtpModule.onDeviceAttached((device) => {
  console.log('Device connected:', device);
});

// Device detached
const unsubscribe = UsbMtpModule.onDeviceDetached((device) => {
  console.log('Device disconnected:', device);
});
```

## Building the App

Since this module uses native Android code, you must build an APK:

### Development Build

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS (first time only)
eas build:configure

# Build development APK
eas build --platform android --profile development
```

### Production Build

```bash
eas build --platform android --profile production
```

### Local Build (requires Android Studio)

```bash
# Generate native project
npx expo prebuild --platform android

# Build APK
cd android && ./gradlew assembleRelease
```

## Troubleshooting

### "Native module not available"

The app is running in Expo Go or web mode. Build a native APK.

### "No USB devices detected"

1. Ensure the target device is in MTP mode (not charging only)
2. Check that the OTG adapter is working
3. Try a different USB cable
4. Restart both devices

### "Permission denied"

The user declined the USB permission dialog. Tap "Grant Permission" again.

### "No MTP interface found"

The connected device may not support MTP or may be in a different USB mode.
Try changing the USB mode on the target device to "File Transfer / MTP".

### "Bulk transfer failed"

The device may have disconnected or the interface was not properly claimed.
Try disconnecting and reconnecting the device.

## Security Considerations

- This module can send arbitrary commands to connected devices
- Some commands (like 0xFE01) can factory reset devices
- Only use on devices you own and have authorization to modify
- The app requires explicit user permission for each USB device
