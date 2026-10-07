'use strict';

const { isSafeExternalUrl } = require('../../core/url-safety');

describe('isSafeExternalUrl', () => {
  it.each([
    'https://example.com/meeting',
    'http://example.com/meeting',
    'http://172.15.255.255/',
    'http://172.32.0.1/',
    'https://[2606:4700:4700::1111]/',
  ])('allows public HTTP(S) URL %s', (url) => {
    const result = isSafeExternalUrl(url);
    expect(result).toBe(true);
  });

  it.each([
    'file:///tmp/meeting',
    'javascript:alert(1)',
    'data:text/plain,meeting',
    'https://user:pass@example.com/',
    'https://user@example.com/',
    'http://localhost/',
    'http://127.0.0.1/',
    'http://0.0.0.0/',
    'http://10.20.30.40/',
    'http://192.168.1.10/',
    'http://172.16.0.1/',
    'http://172.20.0.1/',
    'http://172.31.255.255/',
    'not a URL',
    '',
  ])('rejects unsafe or malformed URL %s', (url) => {
    const result = isSafeExternalUrl(url);
    expect(result).toBe(false);
  });

  it.each(['http://[::1]/', 'http://[0:0:0:0:0:0:0:1]/'])('rejects IPv6 loopback %s', (url) => {
    const result = isSafeExternalUrl(url);
    expect(result).toBe(false);
  });

  it.each([
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:10.0.0.1]/',
    'http://[::ffff:192.168.1.1]/',
    'http://[fe80::1]/',
    'http://[febf::1]/',
    'http://[fc00::1]/',
    'http://[fd12:3456::1]/',
    'http://[::]/',
    'http://[::127.0.0.1]/',
    'http://[::10.0.0.1]/',
    'http://localhost./',
    'http://localhost../',
  ])('rejects IPv6 private, link-local or mapped-private and trailing-dot URL %s', (url) => {
    const result = isSafeExternalUrl(url);
    expect(result).toBe(false);
  });

  it.each(['https://[2001:db8::1]/', 'https://[::ffff:8.8.8.8]/', 'https://[fec0::1]/'])(
    'allows public IPv6 or mapped-public URL %s',
    (url) => {
      const result = isSafeExternalUrl(url);
      expect(result).toBe(true);
    },
  );

  it.each(['http://127.0.0.2/', 'http://127.255.255.254/', 'http://169.254.10.20/'])(
    'rejects additional loopback and link-local URL %s',
    (url) => {
      const result = isSafeExternalUrl(url);
      expect(result).toBe(false);
    },
  );
});
