import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, validateLead, formatLeadMessage, formatPhone } from '../api/_lead.js';

const valid = { name: 'Aziz Karimov', phone: '90 123 45 67', clinic: 'Shifo Med', city: 'Toshkent shahri', doctors: '4-10' };

test('normalizePhone accepts 9 local digits and full +998 numbers', () => {
  assert.equal(normalizePhone('90 123 45 67'), '998901234567');
  assert.equal(normalizePhone('+998 (90) 123-45-67'), '998901234567');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('+7 912 345 67 89'), null);
});

test('validateLead returns a clean lead for valid input', () => {
  const result = validateLead({ ...valid, utm_source: 'fb', utm_campaign: 'clinic owners', extra: 'x' });
  assert.equal(result.ok, true);
  assert.equal(result.lead.phone, '998901234567');
  assert.deepEqual(result.lead.utm, { utm_source: 'fb', utm_campaign: 'clinic owners' });
  assert.equal(result.lead.lang, 'uz');
});

test('validateLead rejects missing name and bad phone', () => {
  assert.deepEqual(validateLead({ ...valid, name: ' ' }), { ok: false, error: 'name' });
  assert.deepEqual(validateLead({ ...valid, phone: '123' }), { ok: false, error: 'phone' });
  assert.deepEqual(validateLead(null), { ok: false, error: 'name' });
});

test('validateLead accepts a lead with only name and phone', () => {
  const result = validateLead({ name: 'Aziz', phone: '901234567' });
  assert.equal(result.ok, true);
  assert.equal(result.lead.clinic, '');
  assert.doesNotMatch(formatLeadMessage(result.lead), /🏥/);
});

test('validateLead drops unknown doctor ranges and trims long text', () => {
  const result = validateLead({ ...valid, doctors: 'many', name: 'A'.repeat(300) });
  assert.equal(result.lead.doctors, '');
  assert.equal(result.lead.name.length, 80);
});

test('formatLeadMessage includes contact, clinic and ad source', () => {
  const { lead } = validateLead({ ...valid, utm_source: 'instagram' });
  const text = formatLeadMessage(lead, new Date('2026-11-20T10:00:00Z'));
  assert.match(text, /Aziz Karimov/);
  assert.match(text, new RegExp(formatPhone('998901234567').replace(/\+/g, '\\+')));
  assert.match(text, /Shifo Med/);
  assert.match(text, /source: instagram/);
});
