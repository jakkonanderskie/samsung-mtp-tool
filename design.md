# Samsung MTP Command Tool - Design Document

## Overview

A specialized Android app for sending custom MTP (Media Transfer Protocol) vendor opcodes to Samsung devices via USB OTG connection. This tool is designed for technicians and advanced users who need to send low-level MTP commands to Samsung phones.

## Target Platform

- **Primary**: Android (portrait orientation, 9:16)
- **Connection Method**: USB OTG adapter
- **Target Devices**: Samsung phones in MTP mode

---

## Screen List

### 1. Home Screen (Main Interface)
The single-screen app with all functionality accessible immediately.

### 2. Connection Status Panel (Inline)
Shows USB device connection state and device info when connected.

### 3. Command Log Panel (Inline)
Displays history of sent commands and responses.

---

## Primary Content and Functionality

### Home Screen Layout (Top to Bottom)

1. **Header Section**
   - App title: "Samsung MTP Tool"
   - Connection status indicator (green dot = connected, red = disconnected)

2. **Device Info Card** (when connected)
   - Device name/model
   - Vendor ID / Product ID
   - Connection status

3. **Preset Opcodes Section**
   - Grid of buttons for known Samsung MTP vendor opcodes:
     - **0xFE01** - Factory Reset (MTP Mode)
     - **0xFE03** - Enable ADB
     - **0xFE05** - Reboot Device
     - **0xFE07** - Read Device Info
     - **0xFE09** - Read FRP Status
     - **0xFE0B** - Clear FRP
   - Each button shows opcode hex value and description

4. **Manual Opcode Input Section**
   - Hex input field (restricted to 0x0000-0xFFFF range)
   - "Send" button
   - Input validation feedback

5. **Command Log Section**
   - Scrollable list of sent commands
   - Timestamp, opcode, and response status
   - Clear log button

---

## Key User Flows

### Flow 1: Connect Device
1. User connects Samsung phone via USB OTG
2. App detects USB device attachment
3. App requests USB permission
4. User grants permission
5. App displays device info and enables command buttons

### Flow 2: Send Preset Command
1. User taps preset opcode button (e.g., "0xFE01 - Factory Reset")
2. App constructs MTP packet with opcode
3. App sends packet via USB bulk transfer
4. Response logged in command log
5. User sees success/failure feedback

### Flow 3: Send Custom Command
1. User enters hex value in manual input (e.g., "FE01")
2. App validates input is in valid opcode range (0x0000-0xFFFF)
3. User taps "Send" button
4. App constructs and sends MTP packet
5. Response logged in command log

---

## Color Choices

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| primary | #1E88E5 | #42A5F5 | Samsung blue accent |
| background | #FAFAFA | #121212 | Screen background |
| surface | #FFFFFF | #1E1E1E | Cards and panels |
| foreground | #212121 | #E0E0E0 | Primary text |
| muted | #757575 | #9E9E9E | Secondary text |
| border | #E0E0E0 | #424242 | Dividers |
| success | #4CAF50 | #66BB6A | Connected state, success |
| warning | #FF9800 | #FFA726 | Pending state |
| error | #F44336 | #EF5350 | Disconnected, errors |

---

## Technical Implementation Notes

### USB Host API Usage
- Use `android.hardware.usb.UsbManager` for device detection
- Use `UsbDeviceConnection.bulkTransfer()` for raw MTP packets
- MTP packets follow PTP container format:
  - Container Length (4 bytes)
  - Container Type (2 bytes): 0x0001 = Command
  - Code/Opcode (2 bytes)
  - Transaction ID (4 bytes)
  - Parameters (optional)

### MTP Packet Structure
```
| Length (4) | Type (2) | Code (2) | TransID (4) | Params... |
```

### Known Samsung Vendor Opcodes
| Opcode | Description | Notes |
|--------|-------------|-------|
| 0xFE01 | Factory Reset | Triggers factory reset via MTP |
| 0xFE03 | Enable ADB | Enables USB debugging |
| 0xFE05 | Reboot | Reboots the device |
| 0xFE07 | Read Info | Reads device information |
| 0xFE09 | Read FRP | Reads FRP lock status |
| 0xFE0B | Clear FRP | Clears FRP lock |

### Permissions Required
- `android.permission.USB_HOST` (manifest)
- Runtime USB device permission via intent

---

## UI/UX Guidelines

- Follow Material Design / iOS HIG principles
- Large touch targets for buttons (min 48dp)
- Clear visual feedback for all actions
- Haptic feedback on button press
- Dark mode support for low-light environments
- One-handed operation friendly layout
