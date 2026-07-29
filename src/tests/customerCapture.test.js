import { describe, it, expect } from 'vitest';
import {
  isLoyaltyActive,
  hasMemberTargetedRule,
  needsCustomerCapture,
  cleanPhone,
  isValidPhone,
  parsePhoneFromScan,
} from '../utils/customerCapture';

describe('isLoyaltyActive', () => {
  it('accepts boolean and legacy string true', () => {
    expect(isLoyaltyActive({ isActive: true })).toBe(true);
    expect(isLoyaltyActive({ isActive: 'true' })).toBe(true);
  });
  it('is false when off or unset', () => {
    expect(isLoyaltyActive({ isActive: false })).toBe(false);
    expect(isLoyaltyActive(null)).toBe(false);
  });
});

describe('hasMemberTargetedRule', () => {
  it('detects an active member/nonmember rule', () => {
    expect(hasMemberTargetedRule([{ isActive: true, conditions: { customer: 'member' } }])).toBe(true);
    expect(hasMemberTargetedRule([{ isActive: true, conditions: { customer: 'nonmember' } }])).toBe(true);
  });
  it('ignores inactive rules and non-membership conditions', () => {
    expect(hasMemberTargetedRule([{ isActive: false, conditions: { customer: 'member' } }])).toBe(false);
    expect(hasMemberTargetedRule([{ isActive: true, conditions: { customer: 'any' } }])).toBe(false);
    expect(hasMemberTargetedRule([{ isActive: true, conditions: {} }])).toBe(false);
    expect(hasMemberTargetedRule(null)).toBe(false);
  });
});

describe('needsCustomerCapture', () => {
  it('is true when loyalty is active even with no discount rules', () => {
    expect(needsCustomerCapture({ isActive: true }, [])).toBe(true);
  });
  it('is true when a members-only discount is live even with loyalty off', () => {
    expect(needsCustomerCapture({ isActive: false }, [{ isActive: true, conditions: { customer: 'member' } }])).toBe(true);
  });
  it('is false when loyalty is off and no rule targets membership', () => {
    expect(needsCustomerCapture({ isActive: false }, [{ isActive: true, conditions: { customer: 'any' } }])).toBe(false);
  });
});

describe('phone helpers', () => {
  it('cleans and validates 10-digit numbers', () => {
    expect(cleanPhone('222 123 4567')).toBe('2221234567');
    expect(isValidPhone('222-123-4567')).toBe(true);
    expect(isValidPhone('12345')).toBe(false);
  });
});

describe('parsePhoneFromScan', () => {
  it('reads the c= param from an enroll-card URL', () => {
    expect(parsePhoneFromScan('https://shop.app/enroll?c=2221234567')).toBe('2221234567');
    expect(parsePhoneFromScan('https://shop.app/enroll?foo=1&phone=2221234567')).toBe('2221234567');
  });
  it('reads a bare 10-digit number', () => {
    expect(parsePhoneFromScan('2221234567')).toBe('2221234567');
    expect(parsePhoneFromScan('222 123 4567')).toBe('2221234567');
  });
  it('returns null when no 10-digit phone is present', () => {
    expect(parsePhoneFromScan('hello world')).toBeNull();
    expect(parsePhoneFromScan('12345')).toBeNull();
    expect(parsePhoneFromScan('')).toBeNull();
    expect(parsePhoneFromScan(null)).toBeNull();
  });
});
