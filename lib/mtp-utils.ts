/**
 * MTP (Media Transfer Protocol) utilities for Samsung devices
 * 
 * This module provides constants and utilities for constructing MTP packets
 * to send vendor-specific commands to Samsung devices via USB OTG.
 */

// MTP Container Types
export const MTP_CONTAINER_TYPE = {
  COMMAND: 0x0001,
  DATA: 0x0002,
  RESPONSE: 0x0003,
  EVENT: 0x0004,
} as const;

// Standard MTP Operation Codes (0x1000-0x1FFF)
export const MTP_OPERATION = {
  GET_DEVICE_INFO: 0x1001,
  OPEN_SESSION: 0x1002,
  CLOSE_SESSION: 0x1003,
  GET_STORAGE_IDS: 0x1004,
  GET_STORAGE_INFO: 0x1005,
  GET_NUM_OBJECTS: 0x1006,
  GET_OBJECT_HANDLES: 0x1007,
  GET_OBJECT_INFO: 0x1008,
  GET_OBJECT: 0x1009,
  GET_THUMB: 0x100A,
  DELETE_OBJECT: 0x100B,
  SEND_OBJECT_INFO: 0x100C,
  SEND_OBJECT: 0x100D,
  FORMAT_STORE: 0x100F,
  RESET_DEVICE: 0x1010,
} as const;

// Samsung Vendor-Specific MTP Operation Codes
export const SAMSUNG_MTP_OPCODE = {
  FACTORY_RESET: 0xFE01,
  ENABLE_ADB: 0xFE03,
  REBOOT: 0xFE05,
  READ_DEVICE_INFO: 0xFE07,
  READ_FRP_STATUS: 0xFE09,
  CLEAR_FRP: 0xFE0B,
} as const;

// Preset opcode definitions for UI with detailed descriptions
export interface OpcodePreset {
  code: number;
  name: string;
  shortDescription: string;
  detailedDescription: string;
  warning?: string;
  category: 'dangerous' | 'safe' | 'read-only';
}

export const PRESET_OPCODES: OpcodePreset[] = [
  {
    code: SAMSUNG_MTP_OPCODE.FACTORY_RESET,
    name: "Factory Reset",
    shortDescription: "Triggers factory reset via MTP mode",
    detailedDescription: "Sends a factory reset command to the Samsung device through MTP protocol. This bypasses the normal Android factory reset flow and directly triggers a wipe at the system level. Used by tools like SamFw to reset devices when normal methods are unavailable. The device will reboot and erase all user data, apps, and settings.",
    warning: "⚠️ DESTRUCTIVE: This will permanently erase ALL data on the device including photos, apps, and settings. The device will reboot and return to initial setup.",
    category: 'dangerous',
  },
  {
    code: SAMSUNG_MTP_OPCODE.ENABLE_ADB,
    name: "Enable ADB",
    shortDescription: "Enables USB debugging on the device",
    detailedDescription: "Attempts to enable Android Debug Bridge (ADB) / USB Debugging on the connected Samsung device. This is commonly used in FRP bypass workflows to gain ADB access without going through Settings. When successful, the device may show the 'Allow USB debugging?' prompt, or ADB may be silently enabled depending on the device's security state.",
    warning: "Enabling ADB grants computer access to device internals. Only use on devices you own.",
    category: 'safe',
  },
  {
    code: SAMSUNG_MTP_OPCODE.REBOOT,
    name: "Reboot Device",
    shortDescription: "Reboots the connected device",
    detailedDescription: "Sends a reboot command to the Samsung device via MTP. This performs a soft reboot similar to holding the power button. The device will restart normally. Useful for applying changes or recovering from a stuck state without physically accessing the device's buttons.",
    category: 'safe',
  },
  {
    code: SAMSUNG_MTP_OPCODE.READ_DEVICE_INFO,
    name: "Read Device Info",
    shortDescription: "Reads device information",
    detailedDescription: "Queries the Samsung device for extended device information through the MTP vendor extension. This may return details like model number, firmware version, IMEI status, bootloader state, and other diagnostic information not available through standard MTP queries. Response data format is Samsung-proprietary.",
    category: 'read-only',
  },
  {
    code: SAMSUNG_MTP_OPCODE.READ_FRP_STATUS,
    name: "Read FRP Status",
    shortDescription: "Reads Factory Reset Protection status",
    detailedDescription: "Queries the current Factory Reset Protection (FRP) lock status on the Samsung device. FRP is Google's security feature that requires the previous Google account after a factory reset. This command returns whether FRP is active, the associated account status, and security level. Useful for diagnostics before attempting bypass procedures.",
    category: 'read-only',
  },
  {
    code: SAMSUNG_MTP_OPCODE.CLEAR_FRP,
    name: "Clear FRP Lock",
    shortDescription: "Clears FRP lock from device",
    detailedDescription: "Attempts to clear the Factory Reset Protection (FRP) lock from the Samsung device. This writes zeros to the FRP partition, removing the Google account association that prevents device setup after a factory reset. Success depends on the device's security patch level and Knox status. Modern devices with recent security patches may reject this command.",
    warning: "⚠️ SECURITY: Clearing FRP removes theft protection. Only use on devices you legitimately own. May not work on devices with recent security patches.",
    category: 'dangerous',
  },
];

/**
 * MTP Opcode Range Information for Exploration
 * 
 * MTP opcodes are 16-bit values (0x0000-0xFFFF) divided into ranges:
 */
export interface OpcodeRange {
  start: number;
  end: number;
  name: string;
  description: string;
  explorationNotes: string;
}

export const OPCODE_RANGES: OpcodeRange[] = [
  {
    start: 0x1000,
    end: 0x1FFF,
    name: "Standard MTP Operations",
    description: "Core MTP/PTP operations defined in the USB-IF MTP specification. These are universal across all MTP devices.",
    explorationNotes: "Well-documented. See USB-IF MTP spec. Not Samsung-specific.",
  },
  {
    start: 0x9000,
    end: 0x97FF,
    name: "Vendor Extension Operations",
    description: "Reserved for vendor-specific extensions. Different manufacturers use different codes in this range.",
    explorationNotes: "Good range to explore for undocumented Samsung commands. Try systematic scanning (0x9000, 0x9001, etc.).",
  },
  {
    start: 0x9800,
    end: 0x9FFF,
    name: "Microsoft MTP Extensions",
    description: "Microsoft-defined extensions for Windows Media DRM and other features.",
    explorationNotes: "May have Samsung implementations. Worth exploring 0x9800-0x98FF.",
  },
  {
    start: 0xFE00,
    end: 0xFEFF,
    name: "Samsung Vendor Commands",
    description: "Primary range for Samsung-specific MTP vendor commands. This is where most known Samsung opcodes reside (0xFE01, 0xFE03, etc.).",
    explorationNotes: "MOST PROMISING for discovery. Known codes are odd numbers (0xFE01, 0xFE03, 0xFE05...). Try even numbers and higher values (0xFE10+) for undiscovered commands.",
  },
  {
    start: 0xFF00,
    end: 0xFFFF,
    name: "Extended Vendor Commands",
    description: "Additional vendor command space. May contain diagnostic or factory-only commands.",
    explorationNotes: "Less explored. Could contain hidden diagnostic commands. Try 0xFF00-0xFF0F first.",
  },
];

/**
 * Get exploration suggestions for a given opcode
 */
export function getExplorationSuggestions(currentOpcode: number): number[] {
  const suggestions: number[] = [];
  
  // Suggest nearby opcodes
  if (currentOpcode > 0) suggestions.push(currentOpcode - 1);
  if (currentOpcode < 0xFFFF) suggestions.push(currentOpcode + 1);
  
  // If in Samsung range, suggest pattern-based codes
  if (currentOpcode >= 0xFE00 && currentOpcode <= 0xFEFF) {
    // Samsung seems to use odd numbers, suggest next odd
    const nextOdd = currentOpcode % 2 === 0 ? currentOpcode + 1 : currentOpcode + 2;
    if (nextOdd <= 0xFEFF && !suggestions.includes(nextOdd)) {
      suggestions.push(nextOdd);
    }
  }
  
  return suggestions.filter(s => s >= 0 && s <= 0xFFFF);
}

// MTP Response Codes
export const MTP_RESPONSE = {
  OK: 0x2001,
  GENERAL_ERROR: 0x2002,
  SESSION_NOT_OPEN: 0x2003,
  INVALID_TRANSACTION_ID: 0x2004,
  OPERATION_NOT_SUPPORTED: 0x2005,
  PARAMETER_NOT_SUPPORTED: 0x2006,
  INCOMPLETE_TRANSFER: 0x2007,
  INVALID_STORAGE_ID: 0x2008,
  INVALID_OBJECT_HANDLE: 0x2009,
  DEVICE_PROP_NOT_SUPPORTED: 0x200A,
  INVALID_OBJECT_FORMAT_CODE: 0x200B,
  STORE_FULL: 0x200C,
  OBJECT_WRITE_PROTECTED: 0x200D,
  STORE_READ_ONLY: 0x200E,
  ACCESS_DENIED: 0x200F,
  NO_THUMBNAIL_PRESENT: 0x2010,
  SELF_TEST_FAILED: 0x2011,
  PARTIAL_DELETION: 0x2012,
  STORE_NOT_AVAILABLE: 0x2013,
  SPECIFICATION_BY_FORMAT_UNSUPPORTED: 0x2014,
  NO_VALID_OBJECT_INFO: 0x2015,
  INVALID_CODE_FORMAT: 0x2016,
  UNKNOWN_VENDOR_CODE: 0x2017,
} as const;

/**
 * Get human-readable response code description
 */
export function getResponseDescription(code: number): string {
  const descriptions: Record<number, string> = {
    [MTP_RESPONSE.OK]: "OK - Operation successful",
    [MTP_RESPONSE.GENERAL_ERROR]: "General Error",
    [MTP_RESPONSE.SESSION_NOT_OPEN]: "Session Not Open",
    [MTP_RESPONSE.INVALID_TRANSACTION_ID]: "Invalid Transaction ID",
    [MTP_RESPONSE.OPERATION_NOT_SUPPORTED]: "Operation Not Supported",
    [MTP_RESPONSE.PARAMETER_NOT_SUPPORTED]: "Parameter Not Supported",
    [MTP_RESPONSE.ACCESS_DENIED]: "Access Denied",
    [MTP_RESPONSE.UNKNOWN_VENDOR_CODE]: "Unknown Vendor Code",
  };
  return descriptions[code] || `Unknown Response (0x${code.toString(16).toUpperCase()})`;
}

/**
 * Build an MTP command packet
 * 
 * MTP Packet Structure:
 * | Length (4 bytes) | Type (2 bytes) | Code (2 bytes) | TransID (4 bytes) | Params... |
 * 
 * @param opcode - The MTP operation code (2 bytes)
 * @param transactionId - Transaction ID for this command
 * @param params - Optional parameters (each 4 bytes)
 * @returns Uint8Array containing the complete MTP packet
 */
export function buildMtpCommandPacket(
  opcode: number,
  transactionId: number,
  params: number[] = []
): Uint8Array {
  // Calculate total length: header (12 bytes) + params (4 bytes each)
  const headerLength = 12;
  const paramsLength = params.length * 4;
  const totalLength = headerLength + paramsLength;

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  // Write container length (4 bytes, little-endian)
  view.setUint32(0, totalLength, true);

  // Write container type (2 bytes, little-endian) - Command = 0x0001
  view.setUint16(4, MTP_CONTAINER_TYPE.COMMAND, true);

  // Write operation code (2 bytes, little-endian)
  view.setUint16(6, opcode, true);

  // Write transaction ID (4 bytes, little-endian)
  view.setUint32(8, transactionId, true);

  // Write parameters (4 bytes each, little-endian)
  params.forEach((param, index) => {
    view.setUint32(headerLength + index * 4, param, true);
  });

  return new Uint8Array(buffer);
}

/**
 * Parse an MTP response packet
 * 
 * @param data - Raw response data from device
 * @returns Parsed response object
 */
export function parseMtpResponse(data: Uint8Array): {
  length: number;
  type: number;
  code: number;
  transactionId: number;
  params: number[];
} | null {
  if (data.length < 12) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const length = view.getUint32(0, true);
  const type = view.getUint16(4, true);
  const code = view.getUint16(6, true);
  const transactionId = view.getUint32(8, true);

  const params: number[] = [];
  const paramsStart = 12;
  const paramsCount = Math.floor((length - paramsStart) / 4);

  for (let i = 0; i < paramsCount; i++) {
    params.push(view.getUint32(paramsStart + i * 4, true));
  }

  return { length, type, code, transactionId, params };
}

/**
 * Format opcode as hex string
 */
export function formatOpcode(code: number): string {
  return `0x${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Parse hex string to number
 */
export function parseHexOpcode(hex: string): number | null {
  // Remove 0x prefix if present
  const cleaned = hex.replace(/^0x/i, '').trim();
  
  // Validate hex format
  if (!/^[0-9A-Fa-f]{1,4}$/.test(cleaned)) {
    return null;
  }

  const value = parseInt(cleaned, 16);
  
  // Validate range (0x0000 - 0xFFFF)
  if (isNaN(value) || value < 0 || value > 0xFFFF) {
    return null;
  }

  return value;
}

/**
 * Validate if opcode is in vendor extension range
 * Samsung vendor opcodes are typically in 0xFE00-0xFEFF range
 */
export function isVendorOpcode(code: number): boolean {
  return code >= 0x9000 && code <= 0xFFFF;
}

/**
 * Get the range info for a given opcode
 */
export function getOpcodeRangeInfo(code: number): OpcodeRange | null {
  return OPCODE_RANGES.find(range => code >= range.start && code <= range.end) || null;
}

/**
 * Get opcode name from preset list
 */
export function getOpcodeName(code: number): string {
  const preset = PRESET_OPCODES.find(p => p.code === code);
  return preset?.name || formatOpcode(code);
}

/**
 * Get category color for opcode
 */
export function getOpcodeCategory(code: number): 'dangerous' | 'safe' | 'read-only' | 'unknown' {
  const preset = PRESET_OPCODES.find(p => p.code === code);
  return preset?.category || 'unknown';
}
