'use strict';

// ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (IPv4-compatible); WHATWG URL serialises the
// IPv4 part as two hex groups, e.g. ::ffff:127.0.0.1 becomes ::ffff:7f00:1.
const EMBEDDED_IPV4 = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;
// fe80::/10 (link-local) and fc00::/7 (unique local), matched on the first hextet.
const PRIVATE_IPV6_PREFIX = /^(fe[89ab][0-9a-f]|f[cd][0-9a-f]{2}):/;

function isPrivateIpv4(host) {
  if (host === '0.0.0.0' || host.startsWith('127.')) {
    return true;
  }
  if (host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) {
    return true;
  }
  return /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function embeddedIpv4(host) {
  const match = host.match(EMBEDDED_IPV4);
  if (!match) {
    return null;
  }
  const [high, low] = [match[1], match[2]].map((part) => parseInt(part, 16));
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function isPrivateIpv6(host) {
  if (host === '::' || host === '::1' || PRIVATE_IPV6_PREFIX.test(host)) {
    return true;
  }
  const ipv4 = embeddedIpv4(host);
  return ipv4 !== null && isPrivateIpv4(ipv4);
}

/**
 * Tell whether a URL hostname is loopback, private or link-local.
 * Literal check only: a name that resolves to a private address is not detected.
 * @param {string} hostname - `URL.hostname`, IPv6 literals still in brackets.
 * @returns {boolean} True when the host must not be reached.
 */
function isPrivateHost(hostname) {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
  if (host === 'localhost') {
    return true;
  }
  return host.includes(':') ? isPrivateIpv6(host) : isPrivateIpv4(host);
}

/**
 * Allow only public HTTP(S) URLs without credentials; deny loopback and private networks.
 * Checks literal hostnames and addresses only, without resolving DNS.
 * @param {string} url - External URL requested by the renderer.
 * @returns {boolean} Whether the URL can be opened externally.
 */
function isSafeExternalUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    return !isPrivateHost(parsed.hostname);
  } catch {
    return false;
  }
}

module.exports = { isSafeExternalUrl, isPrivateHost };
