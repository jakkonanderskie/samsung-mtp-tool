/**
 * USB Device Hook for MTP Communication
 * 
 * This hook manages USB OTG device detection and communication
 * using the native UsbMtpModule on Android.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { 
  UsbMtpModule, 
  isNativeModuleAvailable,
  UsbDeviceInfo,
  MtpCommandResult 
} from '@/modules/usb-mtp-module';
import { formatOpcode, getResponseDescription } from '@/lib/mtp-utils';

export interface UsbDevice {
  deviceId: number;
  vendorId: number;
  productId: number;
  deviceName: string;
  manufacturerName?: string;
  productName?: string;
  serialNumber?: string;
  isSamsung?: boolean;
}

export interface CommandLogEntry {
  id: string;
  timestamp: Date;
  opcode: number;
  opcodeName: string;
  status: 'pending' | 'success' | 'error';
  responseCode?: number;
  responseMessage?: string;
  bytesSent?: number;
}

export interface UseUsbDeviceReturn {
  // Connection state
  isConnected: boolean;
  device: UsbDevice | null;
  connectionError: string | null;
  
  // Available devices
  availableDevices: UsbDevice[];
  
  // Permission state
  hasPermission: boolean;
  isRequestingPermission: boolean;
  
  // Command state
  isSending: boolean;
  commandLog: CommandLogEntry[];
  
  // Native module state
  isNativeAvailable: boolean;
  
  // Actions
  refreshDevices: () => Promise<void>;
  selectDevice: (device: UsbDevice) => void;
  requestPermission: () => Promise<boolean>;
  connect: () => Promise<boolean>;
  sendCommand: (opcode: number, params?: number[]) => Promise<boolean>;
  clearLog: () => void;
  disconnect: () => Promise<void>;
}

function generateLogId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function convertDeviceInfo(info: UsbDeviceInfo): UsbDevice {
  return {
    deviceId: info.deviceId,
    vendorId: info.vendorId,
    productId: info.productId,
    deviceName: info.deviceName,
    manufacturerName: info.manufacturerName,
    productName: info.productName,
    serialNumber: info.serialNumber,
    isSamsung: info.isSamsung,
  };
}

export function useUsbDevice(): UseUsbDeviceReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState<UsbDevice | null>(null);
  const [availableDevices, setAvailableDevices] = useState<UsbDevice[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>([]);
  
  const isNativeAvailable = isNativeModuleAvailable();
  const mountedRef = useRef(true);

  // Set up device event listeners
  useEffect(() => {
    mountedRef.current = true;
    
    if (!isNativeAvailable) {
      setConnectionError(
        Platform.OS === 'android' 
          ? 'Native USB module not loaded. Build the app as an APK to enable USB features.'
          : 'USB Host API is only available on Android devices.'
      );
      return;
    }

    // Initial device scan
    refreshDevices();

    // Listen for device attach/detach events
    const unsubAttach = UsbMtpModule.onDeviceAttached((deviceInfo) => {
      if (!mountedRef.current) return;
      console.log('Device attached:', deviceInfo);
      const newDevice = convertDeviceInfo(deviceInfo);
      setAvailableDevices(prev => {
        // Avoid duplicates
        if (prev.some(d => d.deviceId === newDevice.deviceId)) {
          return prev;
        }
        return [...prev, newDevice];
      });
    });

    const unsubDetach = UsbMtpModule.onDeviceDetached((deviceInfo) => {
      if (!mountedRef.current) return;
      console.log('Device detached:', deviceInfo);
      setAvailableDevices(prev => prev.filter(d => d.deviceId !== deviceInfo.deviceId));
      
      // If the detached device was our current device, reset state
      if (device?.deviceId === deviceInfo.deviceId) {
        setDevice(null);
        setIsConnected(false);
        setHasPermission(false);
      }
    });

    return () => {
      mountedRef.current = false;
      unsubAttach();
      unsubDetach();
    };
  }, [isNativeAvailable]);

  const refreshDevices = useCallback(async () => {
    if (!isNativeAvailable) return;
    
    try {
      const devices = await UsbMtpModule.getConnectedDevices();
      if (mountedRef.current) {
        setAvailableDevices(devices.map(convertDeviceInfo));
        setConnectionError(devices.length === 0 ? 'No USB devices detected. Connect a device via USB OTG.' : null);
      }
    } catch (error: any) {
      console.error('Error refreshing devices:', error);
      if (mountedRef.current) {
        setConnectionError(`Failed to scan USB devices: ${error.message}`);
      }
    }
  }, [isNativeAvailable]);

  const selectDevice = useCallback((selectedDevice: UsbDevice) => {
    setDevice(selectedDevice);
    setIsConnected(false);
    setHasPermission(false);
    setConnectionError(null);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!device) {
      setConnectionError('No device selected');
      return false;
    }

    if (!isNativeAvailable) {
      setConnectionError('Native USB module not available');
      return false;
    }

    setIsRequestingPermission(true);
    setConnectionError(null);

    try {
      // Check if we already have permission
      const alreadyHasPermission = await UsbMtpModule.hasPermission(device.deviceId);
      if (alreadyHasPermission) {
        setHasPermission(true);
        return true;
      }

      // Request permission
      const granted = await UsbMtpModule.requestPermission(device.deviceId);
      
      if (mountedRef.current) {
        setHasPermission(granted);
        if (!granted) {
          setConnectionError('USB permission denied by user');
        }
      }
      
      return granted;
    } catch (error: any) {
      console.error('Error requesting permission:', error);
      if (mountedRef.current) {
        setConnectionError(`Permission request failed: ${error.message}`);
      }
      return false;
    } finally {
      if (mountedRef.current) {
        setIsRequestingPermission(false);
      }
    }
  }, [device, isNativeAvailable]);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!device) {
      setConnectionError('No device selected');
      return false;
    }

    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return false;
    }

    try {
      const connectionInfo = await UsbMtpModule.openConnection(device.deviceId);
      
      if (connectionInfo && mountedRef.current) {
        setIsConnected(true);
        setConnectionError(null);
        console.log('Connected:', connectionInfo);
        return true;
      } else {
        if (mountedRef.current) {
          setConnectionError('Failed to open USB connection');
        }
        return false;
      }
    } catch (error: any) {
      console.error('Error connecting:', error);
      if (mountedRef.current) {
        setConnectionError(`Connection failed: ${error.message}`);
      }
      return false;
    }
  }, [device, hasPermission, requestPermission]);

  const sendCommand = useCallback(async (opcode: number, params: number[] = []): Promise<boolean> => {
    const logEntry: CommandLogEntry = {
      id: generateLogId(),
      timestamp: new Date(),
      opcode,
      opcodeName: formatOpcode(opcode),
      status: 'pending',
    };

    setCommandLog(prev => [logEntry, ...prev]);
    setIsSending(true);

    try {
      // If not connected, try to connect first
      if (!isConnected) {
        const connected = await connect();
        if (!connected) {
          throw new Error('Not connected to device');
        }
      }

      const result = await UsbMtpModule.sendMtpCommand(opcode, params);

      if (!result) {
        throw new Error('No response from native module');
      }

      const isSuccess = result.success && (result.responseCode === -1 || result.responseCode === 0x2001);
      
      if (mountedRef.current) {
        setCommandLog(prev => prev.map(entry => 
          entry.id === logEntry.id
            ? {
                ...entry,
                status: isSuccess ? 'success' : 'error',
                responseCode: result.responseCode,
                responseMessage: result.responseCode > 0 
                  ? getResponseDescription(result.responseCode)
                  : `Sent ${result.bytesSent} bytes`,
                bytesSent: result.bytesSent,
              }
            : entry
        ));
      }
      
      return isSuccess;
    } catch (error: any) {
      console.error('Error sending command:', error);
      if (mountedRef.current) {
        setCommandLog(prev => prev.map(entry => 
          entry.id === logEntry.id
            ? {
                ...entry,
                status: 'error',
                responseMessage: error.message || 'Command failed',
              }
            : entry
        ));
      }
      return false;
    } finally {
      if (mountedRef.current) {
        setIsSending(false);
      }
    }
  }, [isConnected, connect]);

  const clearLog = useCallback(() => {
    setCommandLog([]);
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await UsbMtpModule.closeConnection();
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
    
    if (mountedRef.current) {
      setIsConnected(false);
    }
  }, []);

  return {
    isConnected,
    device,
    connectionError,
    availableDevices,
    hasPermission,
    isRequestingPermission,
    isSending,
    commandLog,
    isNativeAvailable,
    refreshDevices,
    selectDevice,
    requestPermission,
    connect,
    sendCommand,
    clearLog,
    disconnect,
  };
}
