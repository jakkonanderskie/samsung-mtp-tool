import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

/**
 * USB Device information returned from the native module
 */
export interface UsbDeviceInfo {
  deviceId: number;
  vendorId: number;
  productId: number;
  deviceName: string;
  manufacturerName: string;
  productName: string;
  serialNumber: string;
  deviceClass: number;
  deviceSubclass: number;
  deviceProtocol: number;
  interfaceCount: number;
  isSamsung: boolean;
}

/**
 * Connection information after opening a USB connection
 */
export interface ConnectionInfo {
  deviceId: number;
  deviceName: string;
  interfaceClass: number;
  outEndpoint: number;
  inEndpoint: number;
}

/**
 * Result from sending an MTP command
 */
export interface MtpCommandResult {
  bytesSent: number;
  opcode: number;
  transactionId: number;
  responseCode: number;
  success: boolean;
  responseData?: number[];
}

/**
 * Result from sending raw data
 */
export interface RawDataResult {
  bytesSent: number;
  success: boolean;
}

/**
 * Native USB MTP Module interface
 */
interface UsbMtpModuleInterface {
  getConnectedDevices(): Promise<UsbDeviceInfo[]>;
  requestPermission(deviceId: number): Promise<boolean>;
  hasPermission(deviceId: number): Promise<boolean>;
  openConnection(deviceId: number): Promise<ConnectionInfo>;
  closeConnection(): Promise<boolean>;
  sendMtpCommand(opcode: number, params?: number[]): Promise<MtpCommandResult>;
  sendRawData(data: number[]): Promise<RawDataResult>;
  isConnected(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

// Get the native module
const NativeUsbMtpModule = NativeModules.UsbMtpModule as UsbMtpModuleInterface | undefined;

// Check if native module is available
export const isNativeModuleAvailable = (): boolean => {
  return Platform.OS === 'android' && NativeUsbMtpModule != null;
};

// Create event emitter if native module is available
let eventEmitter: NativeEventEmitter | null = null;
if (isNativeModuleAvailable() && NativeUsbMtpModule) {
  eventEmitter = new NativeEventEmitter(NativeModules.UsbMtpModule);
}

/**
 * USB MTP Module API
 * 
 * Provides access to USB Host functionality for sending MTP commands
 * to connected devices via USB OTG.
 */
export const UsbMtpModule = {
  /**
   * Check if the native module is available
   */
  isAvailable: isNativeModuleAvailable,

  /**
   * Get list of connected USB devices
   */
  getConnectedDevices: async (): Promise<UsbDeviceInfo[]> => {
    if (!isNativeModuleAvailable() || !NativeUsbMtpModule) {
      console.warn('UsbMtpModule: Native module not available');
      return [];
    }
    return NativeUsbMtpModule.getConnectedDevices();
  },

  /**
   * Request USB permission for a device
   */
  requestPermission: async (deviceId: number): Promise<boolean> => {
    if (!isNativeModuleAvailable() || !NativeUsbMtpModule) {
      console.warn('UsbMtpModule: Native module not available');
      return false;
    }
    return NativeUsbMtpModule.requestPermission(deviceId);
  },

  /**
   * Check if we have permission for a device
   */
  hasPermission: async (deviceId: number): Promise<boolean> => {
    if (!isNativeModuleAvailable() || !NativeUsbMtpModule) {
      return false;
    }
    return NativeUsbMtpModule.hasPermission(deviceId);
  },

  /**
   * Open a connection to a USB device
   */
  openConnection: async (deviceId: number): Promise<ConnectionInfo | null> => {
    if (!isNativeModuleAvailable() || !NativeUsbMtpModule) {
      console.warn('UsbMtpModule: Native module not available');
      return null;
    }
    return NativeUsbMtpModule.openConnection(deviceId);
  },

  /**
   * Close the current USB connection
   */
  closeConnection: async (): Promise<boolean> => {
    if (!isNativeModuleAvailable() || !NativeUsbMtpModule) {
      return false;
    }
    return NativeUsbMtpModule.closeConnection();
  },

  /**
   * Send an MTP command to the connected device
   */
  sendMtpCommand: async (opcode: number, params?: number[]): Promise<MtpCommandResult | null> => {
    if (!isNativeModuleAvailable() || !NativeUsbMtpModule) {
      console.warn('UsbMtpModule: Native module not available');
      return null;
    }
    return NativeUsbMtpModule.sendMtpCommand(opcode, params || []);
  },

  /**
   * Send raw data to the connected device
   */
  sendRawData: async (data: number[]): Promise<RawDataResult | null> => {
    if (!isNativeModuleAvailable() || !NativeUsbMtpModule) {
      console.warn('UsbMtpModule: Native module not available');
      return null;
    }
    return NativeUsbMtpModule.sendRawData(data);
  },

  /**
   * Check if currently connected to a device
   */
  isConnected: async (): Promise<boolean> => {
    if (!isNativeModuleAvailable() || !NativeUsbMtpModule) {
      return false;
    }
    return NativeUsbMtpModule.isConnected();
  },

  /**
   * Subscribe to device attached events
   */
  onDeviceAttached: (callback: (device: UsbDeviceInfo) => void): (() => void) => {
    if (!eventEmitter) {
      console.warn('UsbMtpModule: Event emitter not available');
      return () => {};
    }
    const subscription = eventEmitter.addListener('onDeviceAttached', callback);
    return () => subscription.remove();
  },

  /**
   * Subscribe to device detached events
   */
  onDeviceDetached: (callback: (device: UsbDeviceInfo) => void): (() => void) => {
    if (!eventEmitter) {
      console.warn('UsbMtpModule: Event emitter not available');
      return () => {};
    }
    const subscription = eventEmitter.addListener('onDeviceDetached', callback);
    return () => subscription.remove();
  },
};

export default UsbMtpModule;
