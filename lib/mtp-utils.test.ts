import { describe, it, expect } from 'vitest';
import {
  buildMtpCommandPacket,
  parseMtpResponse,
  formatOpcode,
  parseHexOpcode,
  isVendorOpcode,
  getOpcodeRangeInfo,
  getResponseDescription,
  SAMSUNG_MTP_OPCODE,
  MTP_RESPONSE,
  PRESET_OPCODES,
  OPCODE_RANGES,
} from './mtp-utils';

describe('MTP Utils', () => {
  describe('formatOpcode', () => {
    it('formats opcode as 4-digit hex string', () => {
      expect(formatOpcode(0xFE01)).toBe('0xFE01');
      expect(formatOpcode(0x1001)).toBe('0x1001');
      expect(formatOpcode(0x0001)).toBe('0x0001');
      expect(formatOpcode(0)).toBe('0x0000');
    });
  });

  describe('parseHexOpcode', () => {
    it('parses valid hex strings', () => {
      expect(parseHexOpcode('FE01')).toBe(0xFE01);
      expect(parseHexOpcode('fe01')).toBe(0xFE01);
      expect(parseHexOpcode('0xFE01')).toBe(0xFE01);
      expect(parseHexOpcode('1')).toBe(0x0001);
      expect(parseHexOpcode('FF')).toBe(0x00FF);
      expect(parseHexOpcode('FFFF')).toBe(0xFFFF);
      expect(parseHexOpcode('0000')).toBe(0x0000);
    });

    it('returns null for invalid hex strings', () => {
      expect(parseHexOpcode('')).toBe(null);
      expect(parseHexOpcode('GGGG')).toBe(null);
      expect(parseHexOpcode('12345')).toBe(null); // Too long
      expect(parseHexOpcode('hello')).toBe(null);
    });
  });

  describe('isVendorOpcode', () => {
    it('identifies vendor opcodes correctly', () => {
      expect(isVendorOpcode(0xFE01)).toBe(true);
      expect(isVendorOpcode(0x9000)).toBe(true);
      expect(isVendorOpcode(0xFFFF)).toBe(true);
      expect(isVendorOpcode(0x1001)).toBe(false);
      expect(isVendorOpcode(0x0001)).toBe(false);
    });
  });

  describe('getOpcodeRangeInfo', () => {
    it('returns correct range for Samsung vendor opcodes', () => {
      const range = getOpcodeRangeInfo(0xFE01);
      expect(range).not.toBeNull();
      expect(range?.name).toBe('Samsung Vendor Commands');
    });

    it('returns correct range for standard MTP opcodes', () => {
      const range = getOpcodeRangeInfo(0x1001);
      expect(range).not.toBeNull();
      expect(range?.name).toBe('Standard MTP Operations');
    });

    it('returns null for opcodes outside defined ranges', () => {
      const range = getOpcodeRangeInfo(0x0001);
      expect(range).toBeNull();
    });
  });

  describe('getResponseDescription', () => {
    it('returns description for known response codes', () => {
      expect(getResponseDescription(MTP_RESPONSE.OK)).toBe('OK - Operation successful');
      expect(getResponseDescription(MTP_RESPONSE.OPERATION_NOT_SUPPORTED)).toBe('Operation Not Supported');
      expect(getResponseDescription(MTP_RESPONSE.ACCESS_DENIED)).toBe('Access Denied');
    });

    it('returns formatted hex for unknown response codes', () => {
      expect(getResponseDescription(0x9999)).toContain('Unknown Response');
      expect(getResponseDescription(0x9999)).toContain('9999');
    });
  });

  describe('buildMtpCommandPacket', () => {
    it('builds correct packet for simple command', () => {
      const packet = buildMtpCommandPacket(0xFE01, 1, []);
      
      // Packet should be 12 bytes (header only, no params)
      expect(packet.length).toBe(12);
      
      // Check container length (little-endian)
      expect(packet[0]).toBe(12);
      expect(packet[1]).toBe(0);
      expect(packet[2]).toBe(0);
      expect(packet[3]).toBe(0);
      
      // Check container type (0x0001 = command)
      expect(packet[4]).toBe(0x01);
      expect(packet[5]).toBe(0x00);
      
      // Check opcode (0xFE01)
      expect(packet[6]).toBe(0x01);
      expect(packet[7]).toBe(0xFE);
      
      // Check transaction ID (1)
      expect(packet[8]).toBe(0x01);
      expect(packet[9]).toBe(0x00);
      expect(packet[10]).toBe(0x00);
      expect(packet[11]).toBe(0x00);
    });

    it('builds correct packet with parameters', () => {
      const packet = buildMtpCommandPacket(0xFE01, 1, [0x12345678]);
      
      // Packet should be 16 bytes (12 header + 4 param)
      expect(packet.length).toBe(16);
      
      // Check container length
      expect(packet[0]).toBe(16);
      
      // Check parameter (little-endian)
      expect(packet[12]).toBe(0x78);
      expect(packet[13]).toBe(0x56);
      expect(packet[14]).toBe(0x34);
      expect(packet[15]).toBe(0x12);
    });
  });

  describe('parseMtpResponse', () => {
    it('parses valid response packet', () => {
      // Create a mock response: length=12, type=3 (response), code=0x2001 (OK), txId=1
      const response = new Uint8Array([
        0x0C, 0x00, 0x00, 0x00, // length = 12
        0x03, 0x00,             // type = 3 (response)
        0x01, 0x20,             // code = 0x2001 (OK)
        0x01, 0x00, 0x00, 0x00, // transaction ID = 1
      ]);
      
      const parsed = parseMtpResponse(response);
      
      expect(parsed).not.toBeNull();
      expect(parsed?.length).toBe(12);
      expect(parsed?.type).toBe(3);
      expect(parsed?.code).toBe(0x2001);
      expect(parsed?.transactionId).toBe(1);
      expect(parsed?.params).toHaveLength(0);
    });

    it('returns null for too-short packets', () => {
      const shortPacket = new Uint8Array([0x01, 0x02, 0x03]);
      expect(parseMtpResponse(shortPacket)).toBeNull();
    });
  });

  describe('PRESET_OPCODES', () => {
    it('contains all expected Samsung opcodes', () => {
      const opcodes = PRESET_OPCODES.map(p => p.code);
      
      expect(opcodes).toContain(SAMSUNG_MTP_OPCODE.FACTORY_RESET);
      expect(opcodes).toContain(SAMSUNG_MTP_OPCODE.ENABLE_ADB);
      expect(opcodes).toContain(SAMSUNG_MTP_OPCODE.REBOOT);
      expect(opcodes).toContain(SAMSUNG_MTP_OPCODE.READ_DEVICE_INFO);
      expect(opcodes).toContain(SAMSUNG_MTP_OPCODE.READ_FRP_STATUS);
      expect(opcodes).toContain(SAMSUNG_MTP_OPCODE.CLEAR_FRP);
    });

    it('has required fields for each preset', () => {
      PRESET_OPCODES.forEach(preset => {
        expect(preset.code).toBeGreaterThan(0);
        expect(preset.name).toBeTruthy();
        expect(preset.shortDescription).toBeTruthy();
        expect(preset.detailedDescription).toBeTruthy();
        expect(['dangerous', 'safe', 'read-only']).toContain(preset.category);
      });
    });

    it('has warnings for dangerous opcodes', () => {
      const dangerousOpcodes = PRESET_OPCODES.filter(p => p.category === 'dangerous');
      dangerousOpcodes.forEach(preset => {
        expect(preset.warning).toBeTruthy();
      });
    });
  });

  describe('OPCODE_RANGES', () => {
    it('covers Samsung vendor range', () => {
      const samsungRange = OPCODE_RANGES.find(r => r.name === 'Samsung Vendor Commands');
      expect(samsungRange).toBeDefined();
      expect(samsungRange?.start).toBe(0xFE00);
      expect(samsungRange?.end).toBe(0xFEFF);
    });

    it('has exploration notes for each range', () => {
      OPCODE_RANGES.forEach(range => {
        expect(range.explorationNotes).toBeTruthy();
      });
    });
  });
});
