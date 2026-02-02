import { useState, useCallback } from "react";
import {
  ScrollView,
  Text,
  View,
  TextInput,
  Alert,
  Platform,
  StyleSheet,
  Modal,
  RefreshControl,
} from "react-native";
import { Pressable } from "react-native";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { useUsbDevice, CommandLogEntry, UsbDevice } from "@/hooks/use-usb-device";
import {
  PRESET_OPCODES,
  OPCODE_RANGES,
  formatOpcode,
  parseHexOpcode,
  getOpcodeRangeInfo,
  OpcodePreset,
  OpcodeRange,
} from "@/lib/mtp-utils";
import { useColors } from "@/hooks/use-colors";

function ConnectionStatusBadge({ isConnected, isNativeAvailable }: { isConnected: boolean; isNativeAvailable: boolean }) {
  const colors = useColors();
  
  if (!isNativeAvailable) {
    return (
      <View className="flex-row items-center gap-2">
        <View className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.warning }} />
        <Text className="text-sm text-muted">Dev Mode</Text>
      </View>
    );
  }
  
  return (
    <View className="flex-row items-center gap-2">
      <View
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: isConnected ? colors.success : colors.error }}
      />
      <Text className="text-sm text-muted">
        {isConnected ? "Connected" : "Disconnected"}
      </Text>
    </View>
  );
}

function DeviceListItem({ 
  device, 
  isSelected, 
  onSelect 
}: { 
  device: UsbDevice; 
  isSelected: boolean;
  onSelect: () => void;
}) {
  const colors = useColors();
  
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.deviceItem,
        { 
          backgroundColor: isSelected ? colors.primary + '20' : colors.surface,
          borderColor: isSelected ? colors.primary : colors.border,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View className="flex-row items-center gap-3">
        <View 
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: device.isSamsung ? '#1E88E5' + '30' : colors.muted + '30' }}
        >
          <Text className="text-lg">{device.isSamsung ? '📱' : '🔌'}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-foreground font-medium" numberOfLines={1}>
            {device.productName || device.manufacturerName || 'Unknown Device'}
          </Text>
          <Text className="text-muted text-xs font-mono">
            VID: 0x{device.vendorId.toString(16).toUpperCase().padStart(4, '0')} | 
            PID: 0x{device.productId.toString(16).toUpperCase().padStart(4, '0')}
          </Text>
        </View>
        {device.isSamsung && (
          <View className="px-2 py-1 rounded" style={{ backgroundColor: '#1E88E5' + '20' }}>
            <Text className="text-xs font-medium" style={{ color: '#1E88E5' }}>Samsung</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function DeviceInfoCard({
  device,
  availableDevices,
  hasPermission,
  isConnected,
  isRequestingPermission,
  isNativeAvailable,
  onSelectDevice,
  onRequestPermission,
  onConnect,
  onRefresh,
  connectionError,
}: {
  device: UsbDevice | null;
  availableDevices: UsbDevice[];
  hasPermission: boolean;
  isConnected: boolean;
  isRequestingPermission: boolean;
  isNativeAvailable: boolean;
  onSelectDevice: (device: UsbDevice) => void;
  onRequestPermission: () => void;
  onConnect: () => void;
  onRefresh: () => void;
  connectionError: string | null;
}) {
  const colors = useColors();

  // Not on Android or native module not available
  if (!isNativeAvailable) {
    return (
      <View className="bg-surface rounded-xl p-4 border border-border">
        <Text className="text-foreground font-medium mb-2">Development Mode</Text>
        <Text className="text-warning text-sm" style={{ color: colors.warning }}>
          {connectionError || 'USB Host API requires a native Android build.'}
        </Text>
        <Text className="text-muted text-xs mt-2">
          Build the app as an APK and install on an Android device with USB OTG support to enable USB communication.
        </Text>
      </View>
    );
  }

  // No devices found
  if (availableDevices.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-4 border border-border">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-foreground font-medium">USB Devices</Text>
          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <Text className="text-primary text-sm" style={{ color: colors.primary }}>Refresh</Text>
          </Pressable>
        </View>
        <Text className="text-muted text-sm">
          No USB devices detected. Connect a Samsung phone via USB OTG adapter and ensure it's in MTP mode.
        </Text>
        {connectionError && (
          <Text className="text-error text-xs mt-2" style={{ color: colors.error }}>
            {connectionError}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 border border-border">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-foreground font-medium">
          USB Devices ({availableDevices.length})
        </Text>
        <Pressable
          onPress={onRefresh}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Text className="text-primary text-sm" style={{ color: colors.primary }}>Refresh</Text>
        </Pressable>
      </View>
      
      {/* Device List */}
      <View className="gap-2 mb-3">
        {availableDevices.map((d) => (
          <DeviceListItem
            key={d.deviceId}
            device={d}
            isSelected={device?.deviceId === d.deviceId}
            onSelect={() => onSelectDevice(d)}
          />
        ))}
      </View>

      {/* Selected Device Actions */}
      {device && (
        <View className="gap-2 mt-2">
          {connectionError && (
            <Text className="text-error text-xs" style={{ color: colors.error }}>
              {connectionError}
            </Text>
          )}
          
          {!hasPermission ? (
            <Pressable
              onPress={onRequestPermission}
              disabled={isRequestingPermission}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                isRequestingPermission && { opacity: 0.5 },
              ]}
            >
              <Text className="text-background font-semibold text-center">
                {isRequestingPermission ? "Requesting Permission..." : "Grant USB Permission"}
              </Text>
            </Pressable>
          ) : !isConnected ? (
            <Pressable
              onPress={onConnect}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.success },
                pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text className="text-background font-semibold text-center">
                Connect to Device
              </Text>
            </Pressable>
          ) : (
            <View className="flex-row items-center justify-center gap-2 py-2">
              <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.success }} />
              <Text className="text-success font-medium" style={{ color: colors.success }}>
                Connected and Ready
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function OpcodeDetailModal({
  visible,
  preset,
  onClose,
  onSend,
  canSend,
}: {
  visible: boolean;
  preset: OpcodePreset | null;
  onClose: () => void;
  onSend: () => void;
  canSend: boolean;
}) {
  const colors = useColors();
  
  if (!preset) return null;

  const categoryColors = {
    dangerous: colors.error,
    safe: colors.success,
    'read-only': colors.primary,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable 
        style={styles.modalOverlay} 
        onPress={onClose}
      >
        <Pressable 
          style={[styles.modalContent, { backgroundColor: colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="flex-row justify-between items-start mb-4">
            <View className="flex-1">
              <Text 
                className="font-mono text-xl font-bold"
                style={{ color: colors.primary }}
              >
                {formatOpcode(preset.code)}
              </Text>
              <Text className="text-foreground text-lg font-semibold mt-1">
                {preset.name}
              </Text>
            </View>
            <View 
              className="px-2 py-1 rounded"
              style={{ backgroundColor: categoryColors[preset.category] + '20' }}
            >
              <Text 
                className="text-xs font-medium capitalize"
                style={{ color: categoryColors[preset.category] }}
              >
                {preset.category}
              </Text>
            </View>
          </View>

          <Text className="text-foreground text-sm leading-6 mb-4">
            {preset.detailedDescription}
          </Text>

          {preset.warning && (
            <View 
              className="p-3 rounded-lg mb-4"
              style={{ backgroundColor: colors.error + '15' }}
            >
              <Text className="text-sm" style={{ color: colors.error }}>
                {preset.warning}
              </Text>
            </View>
          )}

          <View className="flex-row gap-3 mt-2">
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.modalButton,
                { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text className="text-foreground font-medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              style={({ pressed }) => [
                styles.modalButton,
                { backgroundColor: preset.category === 'dangerous' ? colors.error : colors.primary, flex: 1 },
                pressed && { opacity: 0.8 },
                !canSend && { opacity: 0.4 },
              ]}
            >
              <Text className="text-background font-semibold">
                {canSend ? "Send Command" : "Select Device First"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OpcodeButton({
  preset,
  onPress,
  disabled,
}: {
  preset: OpcodePreset;
  onPress: () => void;
  disabled: boolean;
}) {
  const colors = useColors();

  const categoryColors = {
    dangerous: colors.error,
    safe: colors.success,
    'read-only': colors.primary,
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.opcodeButton,
        { 
          backgroundColor: colors.surface, 
          borderColor: categoryColors[preset.category] + '40',
          borderLeftColor: categoryColors[preset.category],
          borderLeftWidth: 3,
        },
        pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text
        className="font-mono font-bold text-base"
        style={{ color: categoryColors[preset.category] }}
      >
        {formatOpcode(preset.code)}
      </Text>
      <Text className="text-foreground font-medium text-sm mt-1">
        {preset.name}
      </Text>
      <Text className="text-muted text-xs mt-0.5" numberOfLines={2}>
        {preset.shortDescription}
      </Text>
    </Pressable>
  );
}

function OpcodeRangeCard({ range }: { range: OpcodeRange }) {
  const colors = useColors();
  
  return (
    <View className="bg-surface rounded-lg p-3 border border-border mb-2">
      <View className="flex-row justify-between items-center mb-1">
        <Text className="font-mono text-sm font-medium" style={{ color: colors.primary }}>
          {formatOpcode(range.start)} - {formatOpcode(range.end)}
        </Text>
      </View>
      <Text className="text-foreground font-medium text-sm">{range.name}</Text>
      <Text className="text-muted text-xs mt-1">{range.description}</Text>
      <View className="mt-2 p-2 rounded" style={{ backgroundColor: colors.primary + '10' }}>
        <Text className="text-xs" style={{ color: colors.primary }}>
          💡 {range.explorationNotes}
        </Text>
      </View>
    </View>
  );
}

function CommandLogItem({ entry }: { entry: CommandLogEntry }) {
  const colors = useColors();
  
  const statusColor = {
    pending: colors.warning,
    success: colors.success,
    error: colors.error,
  }[entry.status];

  return (
    <View className="bg-surface rounded-lg p-3 border border-border mb-2">
      <View className="flex-row justify-between items-center mb-1">
        <Text className="font-mono text-primary font-medium" style={{ color: colors.primary }}>
          {entry.opcodeName}
        </Text>
        <View className="flex-row items-center gap-2">
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          <Text className="text-xs text-muted capitalize">{entry.status}</Text>
        </View>
      </View>
      {entry.responseMessage && (
        <Text className="text-xs text-muted">{entry.responseMessage}</Text>
      )}
      {entry.bytesSent !== undefined && entry.bytesSent > 0 && (
        <Text className="text-xs text-muted">Bytes sent: {entry.bytesSent}</Text>
      )}
      <Text className="text-xs text-muted mt-1">
        {entry.timestamp.toLocaleTimeString()}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const {
    isConnected,
    device,
    availableDevices,
    connectionError,
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
  } = useUsbDevice();

  const [manualOpcode, setManualOpcode] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<OpcodePreset | null>(null);
  const [showRangeInfo, setShowRangeInfo] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const canSendCommands = (isConnected || (device && hasPermission)) && !isSending;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshDevices();
    setIsRefreshing(false);
  }, [refreshDevices]);

  const handlePresetPress = useCallback((preset: OpcodePreset) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedPreset(preset);
  }, []);

  const handleSendPreset = useCallback(() => {
    if (!selectedPreset) return;
    
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    sendCommand(selectedPreset.code);
    setSelectedPreset(null);
  }, [selectedPreset, sendCommand]);

  const handleSendManual = useCallback(() => {
    const parsed = parseHexOpcode(manualOpcode);
    
    if (parsed === null) {
      setInputError("Invalid hex value. Enter 1-4 hex digits (e.g., FE01)");
      return;
    }

    setInputError(null);
    
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    sendCommand(parsed);
    setManualOpcode("");
  }, [manualOpcode, sendCommand]);

  const handleOpcodeChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
    setManualOpcode(cleaned.slice(0, 4));
    setInputError(null);
  }, []);

  const handleClearLog = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    clearLog();
  }, [clearLog]);

  const currentRangeInfo = manualOpcode.length >= 2 
    ? getOpcodeRangeInfo(parseInt(manualOpcode, 16)) 
    : null;

  return (
    <ScreenContainer className="px-4">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View className="flex-row justify-between items-center py-4">
          <View>
            <Text className="text-2xl font-bold text-foreground">
              MTP Commander
            </Text>
            <Text className="text-sm text-muted">
              Send MTP commands via USB OTG
            </Text>
          </View>
          <ConnectionStatusBadge isConnected={isConnected} isNativeAvailable={isNativeAvailable} />
        </View>

        {/* Device Info / Selection */}
        <DeviceInfoCard
          device={device}
          availableDevices={availableDevices}
          hasPermission={hasPermission}
          isConnected={isConnected}
          isRequestingPermission={isRequestingPermission}
          isNativeAvailable={isNativeAvailable}
          onSelectDevice={selectDevice}
          onRequestPermission={requestPermission}
          onConnect={connect}
          onRefresh={handleRefresh}
          connectionError={connectionError}
        />

        {/* Preset Opcodes */}
        <View className="mt-6">
          <Text className="text-lg font-semibold text-foreground mb-1">
            Known Samsung Opcodes
          </Text>
          <Text className="text-muted text-xs mb-3">
            Tap a command to see detailed description before sending
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {PRESET_OPCODES.map((preset) => (
              <OpcodeButton
                key={preset.code}
                preset={preset}
                onPress={() => handlePresetPress(preset)}
                disabled={false}
              />
            ))}
          </View>
        </View>

        {/* Manual Input / Exploration Section */}
        <View className="mt-6">
          <Text className="text-lg font-semibold text-foreground mb-1">
            Explore Custom Opcodes
          </Text>
          <Text className="text-muted text-xs mb-3">
            Enter any hex value (0000-FFFF) to discover undocumented commands
          </Text>
          
          <View className="bg-surface rounded-xl p-4 border border-border">
            <View className="flex-row gap-3">
              <View className="flex-1 flex-row items-center bg-background rounded-lg border border-border px-3">
                <Text className="text-muted font-mono">0x</Text>
                <TextInput
                  className="flex-1 py-3 font-mono text-foreground text-lg"
                  style={{ color: colors.foreground }}
                  value={manualOpcode}
                  onChangeText={handleOpcodeChange}
                  placeholder="FE0D"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={4}
                  returnKeyType="done"
                  onSubmitEditing={handleSendManual}
                />
              </View>
              <Pressable
                onPress={handleSendManual}
                disabled={!canSendCommands || !manualOpcode}
                style={({ pressed }) => [
                  styles.sendButton,
                  { backgroundColor: colors.primary },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                  (!canSendCommands || !manualOpcode) && { opacity: 0.4 },
                ]}
              >
                <Text className="text-background font-semibold">Send</Text>
              </Pressable>
            </View>
            
            {inputError && (
              <Text className="text-error text-sm mt-2" style={{ color: colors.error }}>
                {inputError}
              </Text>
            )}
            
            {currentRangeInfo && (
              <View className="mt-3 p-2 rounded-lg" style={{ backgroundColor: colors.primary + '10' }}>
                <Text className="text-xs font-medium" style={{ color: colors.primary }}>
                  Range: {currentRangeInfo.name}
                </Text>
                <Text className="text-xs text-muted mt-1">
                  {currentRangeInfo.explorationNotes}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Opcode Range Reference */}
        <View className="mt-6">
          <Pressable
            onPress={() => setShowRangeInfo(!showRangeInfo)}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-foreground">
                Opcode Range Reference
              </Text>
              <Text style={{ color: colors.primary }}>
                {showRangeInfo ? "▼ Hide" : "▶ Show"}
              </Text>
            </View>
          </Pressable>
          
          {showRangeInfo && (
            <View>
              <Text className="text-muted text-xs mb-3">
                MTP opcodes are 16-bit values. Different ranges serve different purposes. 
                Samsung vendor commands are primarily in the 0xFE00-0xFEFF range.
              </Text>
              {OPCODE_RANGES.map((range, index) => (
                <OpcodeRangeCard key={index} range={range} />
              ))}
              
              <View className="bg-surface rounded-lg p-3 border border-border mt-2">
                <Text className="text-foreground font-medium text-sm mb-2">
                  🔬 Exploration Tips
                </Text>
                <Text className="text-muted text-xs leading-5">
                  • Known Samsung opcodes use odd numbers (0xFE01, 0xFE03, 0xFE05...){"\n"}
                  • Try even numbers in the 0xFE00 range for potential hidden commands{"\n"}
                  • Response code 0x2005 means "Operation Not Supported" - move on{"\n"}
                  • Response code 0x2001 means "OK" - you found a working command!{"\n"}
                  • The 0x9000-0x97FF range may contain additional vendor commands{"\n"}
                  • Document any new working opcodes you discover!
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Command Log */}
        <View className="mt-6">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-lg font-semibold text-foreground">
              Command Log
            </Text>
            {commandLog.length > 0 && (
              <Pressable
                onPress={handleClearLog}
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              >
                <Text className="text-primary text-sm" style={{ color: colors.primary }}>
                  Clear
                </Text>
              </Pressable>
            )}
          </View>
          
          {commandLog.length === 0 ? (
            <View className="bg-surface rounded-xl p-4 border border-border">
              <Text className="text-muted text-sm text-center">
                No commands sent yet. Select a device and send a command to see the log.
              </Text>
            </View>
          ) : (
            <View>
              {commandLog.slice(0, 20).map((entry) => (
                <CommandLogItem key={entry.id} entry={entry} />
              ))}
            </View>
          )}
        </View>

        {/* Info Section */}
        <View className="mt-6 mb-4">
          <View className="bg-surface rounded-xl p-4 border border-border">
            <Text className="text-foreground font-medium mb-2">About This Tool</Text>
            <Text className="text-muted text-sm leading-5">
              This tool sends raw MTP (Media Transfer Protocol) vendor commands to Samsung 
              devices via USB OTG. These low-level commands can trigger device functions 
              that are not accessible through normal Android interfaces.
            </Text>
            <Text className="text-muted text-sm leading-5 mt-2">
              The known opcodes are based on reverse engineering of tools like SamFw. 
              Use the exploration feature to discover additional undocumented commands.
            </Text>
            <Text className="text-warning text-xs mt-3" style={{ color: colors.warning }}>
              ⚠️ Use responsibly. Some commands can reset or modify device settings permanently.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Opcode Detail Modal */}
      <OpcodeDetailModal
        visible={selectedPreset !== null}
        preset={selectedPreset}
        onClose={() => setSelectedPreset(null)}
        onSend={handleSendPreset}
        canSend={canSendCommands || (device !== null)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  deviceItem: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  opcodeButton: {
    width: "47%",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sendButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
});
