package com.usbmtpmodule

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.*
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.nio.ByteBuffer
import java.nio.ByteOrder

class UsbMtpModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "UsbMtpModule"
        const val TAG = "UsbMtpModule"
        const val ACTION_USB_PERMISSION = "com.usbmtpmodule.USB_PERMISSION"
        
        // MTP Container Types
        const val MTP_CONTAINER_TYPE_COMMAND: Short = 0x0001
        const val MTP_CONTAINER_TYPE_DATA: Short = 0x0002
        const val MTP_CONTAINER_TYPE_RESPONSE: Short = 0x0003
        const val MTP_CONTAINER_TYPE_EVENT: Short = 0x0004
        
        // MTP Response Codes
        const val MTP_RESPONSE_OK: Short = 0x2001
        const val MTP_RESPONSE_GENERAL_ERROR: Short = 0x2002
        const val MTP_RESPONSE_OPERATION_NOT_SUPPORTED: Short = 0x2005
        
        // Samsung Vendor ID
        const val SAMSUNG_VENDOR_ID = 0x04E8
        
        // USB Timeouts
        const val USB_TIMEOUT_MS = 5000
        const val BULK_TRANSFER_TIMEOUT_MS = 3000
    }

    private var usbManager: UsbManager? = null
    private var currentDevice: UsbDevice? = null
    private var currentConnection: UsbDeviceConnection? = null
    private var currentInterface: UsbInterface? = null
    private var bulkOutEndpoint: UsbEndpoint? = null
    private var bulkInEndpoint: UsbEndpoint? = null
    private var transactionId: Int = 1
    private var permissionPromise: Promise? = null

    // USB Permission Broadcast Receiver
    private val usbPermissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (ACTION_USB_PERMISSION == intent?.action) {
                synchronized(this) {
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    }
                    
                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    
                    if (granted && device != null) {
                        Log.d(TAG, "USB permission granted for device: ${device.deviceName}")
                        permissionPromise?.resolve(true)
                    } else {
                        Log.d(TAG, "USB permission denied")
                        permissionPromise?.resolve(false)
                    }
                    permissionPromise = null
                }
            }
        }
    }

    // USB Device Attach/Detach Receiver
    private val usbDeviceReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    }
                    device?.let {
                        Log.d(TAG, "USB device attached: ${it.deviceName}")
                        sendDeviceEvent("onDeviceAttached", deviceToMap(it))
                    }
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    }
                    device?.let {
                        Log.d(TAG, "USB device detached: ${it.deviceName}")
                        if (currentDevice?.deviceId == it.deviceId) {
                            closeConnection()
                        }
                        sendDeviceEvent("onDeviceDetached", deviceToMap(it))
                    }
                }
            }
        }
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        usbManager = reactApplicationContext.getSystemService(Context.USB_SERVICE) as UsbManager
        
        // Register USB permission receiver
        val permissionFilter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactApplicationContext.registerReceiver(usbPermissionReceiver, permissionFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactApplicationContext.registerReceiver(usbPermissionReceiver, permissionFilter)
        }
        
        // Register USB attach/detach receiver
        val deviceFilter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactApplicationContext.registerReceiver(usbDeviceReceiver, deviceFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactApplicationContext.registerReceiver(usbDeviceReceiver, deviceFilter)
        }
        
        Log.d(TAG, "UsbMtpModule initialized")
    }

    override fun invalidate() {
        super.invalidate()
        try {
            reactApplicationContext.unregisterReceiver(usbPermissionReceiver)
            reactApplicationContext.unregisterReceiver(usbDeviceReceiver)
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering receivers: ${e.message}")
        }
        closeConnection()
    }

    @ReactMethod
    fun getConnectedDevices(promise: Promise) {
        try {
            val deviceList = usbManager?.deviceList ?: emptyMap()
            val devicesArray = Arguments.createArray()
            
            for ((_, device) in deviceList) {
                devicesArray.pushMap(deviceToMap(device))
            }
            
            Log.d(TAG, "Found ${deviceList.size} USB devices")
            promise.resolve(devicesArray)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting connected devices: ${e.message}")
            promise.reject("USB_ERROR", "Failed to get connected devices: ${e.message}")
        }
    }

    @ReactMethod
    fun requestPermission(deviceId: Int, promise: Promise) {
        try {
            val device = findDeviceById(deviceId)
            if (device == null) {
                promise.reject("DEVICE_NOT_FOUND", "Device with ID $deviceId not found")
                return
            }

            if (usbManager?.hasPermission(device) == true) {
                Log.d(TAG, "Already have permission for device: ${device.deviceName}")
                promise.resolve(true)
                return
            }

            permissionPromise = promise
            
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_MUTABLE
            } else {
                0
            }
            
            val permissionIntent = PendingIntent.getBroadcast(
                reactApplicationContext,
                0,
                Intent(ACTION_USB_PERMISSION),
                flags
            )
            
            usbManager?.requestPermission(device, permissionIntent)
            Log.d(TAG, "Requested permission for device: ${device.deviceName}")
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting permission: ${e.message}")
            promise.reject("PERMISSION_ERROR", "Failed to request permission: ${e.message}")
        }
    }

    @ReactMethod
    fun openConnection(deviceId: Int, promise: Promise) {
        try {
            val device = findDeviceById(deviceId)
            if (device == null) {
                promise.reject("DEVICE_NOT_FOUND", "Device with ID $deviceId not found")
                return
            }

            if (usbManager?.hasPermission(device) != true) {
                promise.reject("NO_PERMISSION", "No USB permission for device")
                return
            }

            // Close any existing connection
            closeConnection()

            // Open connection
            val connection = usbManager?.openDevice(device)
            if (connection == null) {
                promise.reject("CONNECTION_FAILED", "Failed to open USB connection")
                return
            }

            // Find MTP interface and endpoints
            var mtpInterface: UsbInterface? = null
            var outEndpoint: UsbEndpoint? = null
            var inEndpoint: UsbEndpoint? = null

            for (i in 0 until device.interfaceCount) {
                val intf = device.getInterface(i)
                // MTP/PTP uses class 6 (Still Image), or look for bulk endpoints
                if (intf.interfaceClass == UsbConstants.USB_CLASS_STILL_IMAGE ||
                    intf.interfaceClass == UsbConstants.USB_CLASS_VENDOR_SPEC ||
                    intf.interfaceClass == 0xFF) {
                    
                    for (j in 0 until intf.endpointCount) {
                        val endpoint = intf.getEndpoint(j)
                        if (endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                            if (endpoint.direction == UsbConstants.USB_DIR_OUT) {
                                outEndpoint = endpoint
                            } else if (endpoint.direction == UsbConstants.USB_DIR_IN) {
                                inEndpoint = endpoint
                            }
                        }
                    }
                    
                    if (outEndpoint != null && inEndpoint != null) {
                        mtpInterface = intf
                        break
                    }
                }
            }

            // If no MTP interface found, try to find any interface with bulk endpoints
            if (mtpInterface == null) {
                for (i in 0 until device.interfaceCount) {
                    val intf = device.getInterface(i)
                    outEndpoint = null
                    inEndpoint = null
                    
                    for (j in 0 until intf.endpointCount) {
                        val endpoint = intf.getEndpoint(j)
                        if (endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                            if (endpoint.direction == UsbConstants.USB_DIR_OUT && outEndpoint == null) {
                                outEndpoint = endpoint
                            } else if (endpoint.direction == UsbConstants.USB_DIR_IN && inEndpoint == null) {
                                inEndpoint = endpoint
                            }
                        }
                    }
                    
                    if (outEndpoint != null) {
                        mtpInterface = intf
                        break
                    }
                }
            }

            if (mtpInterface == null || outEndpoint == null) {
                connection.close()
                promise.reject("NO_MTP_INTERFACE", "No suitable MTP interface found on device")
                return
            }

            // Claim the interface
            if (!connection.claimInterface(mtpInterface, true)) {
                connection.close()
                promise.reject("CLAIM_FAILED", "Failed to claim USB interface")
                return
            }

            // Store connection info
            currentDevice = device
            currentConnection = connection
            currentInterface = mtpInterface
            bulkOutEndpoint = outEndpoint
            bulkInEndpoint = inEndpoint
            transactionId = 1

            Log.d(TAG, "USB connection opened successfully")
            Log.d(TAG, "Interface: ${mtpInterface.interfaceClass}, Out EP: ${outEndpoint.address}, In EP: ${inEndpoint?.address}")

            val result = Arguments.createMap().apply {
                putInt("deviceId", device.deviceId)
                putString("deviceName", device.deviceName)
                putInt("interfaceClass", mtpInterface.interfaceClass)
                putInt("outEndpoint", outEndpoint.address)
                putInt("inEndpoint", inEndpoint?.address ?: -1)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error opening connection: ${e.message}")
            promise.reject("CONNECTION_ERROR", "Failed to open connection: ${e.message}")
        }
    }

    @ReactMethod
    fun closeConnection(promise: Promise) {
        closeConnection()
        promise.resolve(true)
    }

    private fun closeConnection() {
        try {
            currentInterface?.let { intf ->
                currentConnection?.releaseInterface(intf)
            }
            currentConnection?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing connection: ${e.message}")
        }
        currentDevice = null
        currentConnection = null
        currentInterface = null
        bulkOutEndpoint = null
        bulkInEndpoint = null
    }

    @ReactMethod
    fun sendMtpCommand(opcode: Int, params: ReadableArray?, promise: Promise) {
        try {
            val connection = currentConnection
            val outEndpoint = bulkOutEndpoint
            
            if (connection == null || outEndpoint == null) {
                promise.reject("NOT_CONNECTED", "No USB connection open")
                return
            }

            // Build MTP command packet
            val paramList = mutableListOf<Int>()
            params?.let {
                for (i in 0 until it.size()) {
                    paramList.add(it.getInt(i))
                }
            }
            
            val packet = buildMtpCommandPacket(opcode, transactionId++, paramList)
            
            Log.d(TAG, "Sending MTP command: opcode=0x${opcode.toString(16).uppercase()}, txId=${transactionId - 1}")
            Log.d(TAG, "Packet (${packet.size} bytes): ${packet.joinToString(" ") { "0x${it.toUByte().toString(16).padStart(2, '0').uppercase()}" }}")

            // Send command via bulk transfer
            val bytesSent = connection.bulkTransfer(
                outEndpoint,
                packet,
                packet.size,
                BULK_TRANSFER_TIMEOUT_MS
            )

            if (bytesSent < 0) {
                Log.e(TAG, "Bulk transfer failed with error: $bytesSent")
                promise.reject("TRANSFER_FAILED", "Bulk transfer failed with error code: $bytesSent")
                return
            }

            Log.d(TAG, "Sent $bytesSent bytes successfully")

            // Try to read response if we have an in endpoint
            var responseCode: Int = -1
            var responseData: ByteArray? = null
            
            bulkInEndpoint?.let { inEndpoint ->
                val responseBuffer = ByteArray(512)
                val bytesRead = connection.bulkTransfer(
                    inEndpoint,
                    responseBuffer,
                    responseBuffer.size,
                    BULK_TRANSFER_TIMEOUT_MS
                )
                
                if (bytesRead > 0) {
                    responseData = responseBuffer.copyOf(bytesRead)
                    Log.d(TAG, "Received $bytesRead bytes response")
                    
                    // Parse response
                    if (bytesRead >= 12) {
                        val buffer = ByteBuffer.wrap(responseBuffer).order(ByteOrder.LITTLE_ENDIAN)
                        val length = buffer.int
                        val type = buffer.short
                        responseCode = buffer.short.toInt() and 0xFFFF
                        Log.d(TAG, "Response: length=$length, type=$type, code=0x${responseCode.toString(16).uppercase()}")
                    }
                } else {
                    Log.d(TAG, "No response received (bytesRead=$bytesRead)")
                }
            }

            val result = Arguments.createMap().apply {
                putInt("bytesSent", bytesSent)
                putInt("opcode", opcode)
                putInt("transactionId", transactionId - 1)
                putInt("responseCode", responseCode)
                putBoolean("success", bytesSent > 0)
                responseData?.let {
                    putArray("responseData", Arguments.fromList(it.map { b -> b.toInt() and 0xFF }))
                }
            }
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending MTP command: ${e.message}")
            promise.reject("SEND_ERROR", "Failed to send MTP command: ${e.message}")
        }
    }

    @ReactMethod
    fun sendRawData(data: ReadableArray, promise: Promise) {
        try {
            val connection = currentConnection
            val outEndpoint = bulkOutEndpoint
            
            if (connection == null || outEndpoint == null) {
                promise.reject("NOT_CONNECTED", "No USB connection open")
                return
            }

            val byteArray = ByteArray(data.size())
            for (i in 0 until data.size()) {
                byteArray[i] = data.getInt(i).toByte()
            }

            val bytesSent = connection.bulkTransfer(
                outEndpoint,
                byteArray,
                byteArray.size,
                BULK_TRANSFER_TIMEOUT_MS
            )

            if (bytesSent < 0) {
                promise.reject("TRANSFER_FAILED", "Bulk transfer failed with error code: $bytesSent")
                return
            }

            val result = Arguments.createMap().apply {
                putInt("bytesSent", bytesSent)
                putBoolean("success", bytesSent > 0)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending raw data: ${e.message}")
            promise.reject("SEND_ERROR", "Failed to send raw data: ${e.message}")
        }
    }

    @ReactMethod
    fun hasPermission(deviceId: Int, promise: Promise) {
        try {
            val device = findDeviceById(deviceId)
            if (device == null) {
                promise.resolve(false)
                return
            }
            promise.resolve(usbManager?.hasPermission(device) == true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun isConnected(promise: Promise) {
        promise.resolve(currentConnection != null && currentDevice != null)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    private fun buildMtpCommandPacket(opcode: Int, transactionId: Int, params: List<Int>): ByteArray {
        // MTP Command Container:
        // - Container Length (4 bytes, little-endian)
        // - Container Type (2 bytes, little-endian) = 0x0001 for command
        // - Operation Code (2 bytes, little-endian)
        // - Transaction ID (4 bytes, little-endian)
        // - Parameters (4 bytes each, little-endian)
        
        val headerSize = 12
        val paramsSize = params.size * 4
        val totalSize = headerSize + paramsSize
        
        val buffer = ByteBuffer.allocate(totalSize).order(ByteOrder.LITTLE_ENDIAN)
        
        buffer.putInt(totalSize)                           // Container Length
        buffer.putShort(MTP_CONTAINER_TYPE_COMMAND)        // Container Type (Command)
        buffer.putShort(opcode.toShort())                  // Operation Code
        buffer.putInt(transactionId)                       // Transaction ID
        
        // Add parameters
        for (param in params) {
            buffer.putInt(param)
        }
        
        return buffer.array()
    }

    private fun findDeviceById(deviceId: Int): UsbDevice? {
        val deviceList = usbManager?.deviceList ?: return null
        return deviceList.values.find { it.deviceId == deviceId }
    }

    private fun deviceToMap(device: UsbDevice): WritableMap {
        return Arguments.createMap().apply {
            putInt("deviceId", device.deviceId)
            putInt("vendorId", device.vendorId)
            putInt("productId", device.productId)
            putString("deviceName", device.deviceName)
            putString("manufacturerName", device.manufacturerName ?: "Unknown")
            putString("productName", device.productName ?: "Unknown")
            putString("serialNumber", device.serialNumber ?: "Unknown")
            putInt("deviceClass", device.deviceClass)
            putInt("deviceSubclass", device.deviceSubclass)
            putInt("deviceProtocol", device.deviceProtocol)
            putInt("interfaceCount", device.interfaceCount)
            putBoolean("isSamsung", device.vendorId == SAMSUNG_VENDOR_ID)
        }
    }

    private fun sendDeviceEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
