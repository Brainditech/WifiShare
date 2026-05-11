import { networkInterfaces } from 'os';
import { createSocket } from 'dgram';

/**
 * MAC OUI prefixes assigned to known virtual-adapter vendors.
 * Matches the first 3 octets of the MAC address.
 */
const VIRTUAL_MAC_PREFIXES = [
    '08:00:27', // VirtualBox
    '0a:00:27', // VirtualBox host-only
    '00:50:56', // VMware
    '00:0c:29', // VMware
    '00:05:69', // VMware
    '00:1c:14', // VMware
    '00:15:5d', // Hyper-V
    '00:03:ff', // Microsoft Virtual PC
    '52:54:00', // QEMU / KVM
    '00:16:3e', // Xen
];

/**
 * Substrings (lowercased) that mark an interface as virtual / non-LAN.
 * Matched against the OS-reported interface name.
 */
const VIRTUAL_NAME_PATTERNS = [
    'vethernet', 'wsl', 'docker', 'vmware', 'virtualbox', 'vbox',
    'hyper-v', 'hyperv', 'vpn', 'loopback', 'bluetooth',
    'tap', 'tun', 'npcap', 'pseudo', 'virtual',
    'tailscale', 'wireguard', 'zerotier', 'radmin',
    // Windows-specific virtual switches ("Local Area Connection* N")
    'local area connection*',
];

const PRIORITY_NAMES = ['wi-fi', 'wifi', 'ethernet', 'en0', 'eth0', 'wlan0', 'lan'];

function isVirtualMac(mac: string | undefined): boolean {
    if (!mac) return false;
    const normalized = mac.toLowerCase();
    return VIRTUAL_MAC_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function hasVirtualName(name: string): boolean {
    const lower = name.toLowerCase();
    return VIRTUAL_NAME_PATTERNS.some(pattern => lower.includes(pattern));
}

/**
 * Ask the OS routing table which local IP would be used to reach a public host.
 * No packet is actually sent — udp.connect() just binds the socket using the
 * OS routing decision, so this works even when offline (as long as a default
 * route exists, which is true on any normal LAN setup).
 *
 * This is the most reliable way to find the "real" LAN IP when virtual adapters
 * (VirtualBox, VMware, Hyper-V, WSL, VPN clients) are present.
 */
function getPrimaryOutboundIP(timeoutMs: number = 500): Promise<string | null> {
    return new Promise((resolve) => {
        let settled = false;
        const socket = createSocket('udp4');
        const finish = (result: string | null) => {
            if (settled) return;
            settled = true;
            try { socket.close(); } catch { /* already closed */ }
            resolve(result);
        };

        socket.on('error', () => finish(null));

        const timer = setTimeout(() => finish(null), timeoutMs);

        try {
            // Connect to a public IP (no traffic actually sent for UDP).
            // The OS resolves the source address from its routing table.
            socket.connect(53, '8.8.8.8', () => {
                clearTimeout(timer);
                try {
                    const addr = socket.address();
                    if (addr && addr.address && addr.address !== '0.0.0.0') {
                        finish(addr.address);
                    } else {
                        finish(null);
                    }
                } catch {
                    finish(null);
                }
            });
        } catch {
            clearTimeout(timer);
            finish(null);
        }
    });
}

/**
 * Fallback: enumerate network interfaces and pick the best non-virtual one.
 * Used when the UDP routing-table trick fails (rare).
 */
function getLocalIPFromInterfaces(): string {
    const nets = networkInterfaces();
    const candidates: { name: string; address: string; priority: number }[] = [];

    for (const [name, interfaces] of Object.entries(nets)) {
        if (!interfaces) continue;
        if (hasVirtualName(name)) continue;

        for (const net of interfaces) {
            if (net.family !== 'IPv4' || net.internal) continue;
            // Skip MACs from known virtual-adapter vendors
            if (isVirtualMac(net.mac)) continue;
            // Skip link-local / APIPA (no DHCP)
            if (net.address.startsWith('169.254.')) continue;
            // Skip 172.16-31 (usually Docker/WSL bridge)
            const parts = net.address.split('.').map(Number);
            if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) continue;
            // Skip 100.64-127 (carrier-grade NAT, used by Tailscale)
            if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) continue;

            let priority = 100;
            if (net.address.startsWith('192.168.')) priority = 10;
            else if (net.address.startsWith('10.')) priority = 20;

            const lower = name.toLowerCase();
            for (let i = 0; i < PRIORITY_NAMES.length; i++) {
                if (lower.includes(PRIORITY_NAMES[i])) {
                    priority = Math.min(priority, i + 1);
                    break;
                }
            }

            candidates.push({ name, address: net.address, priority });
        }
    }

    candidates.sort((a, b) => a.priority - b.priority);

    if (candidates.length > 0) {
        return candidates[0].address;
    }

    return '127.0.0.1';
}

/**
 * Validate that an IP returned by the routing-table trick actually belongs
 * to a non-virtual interface. Guards against rare cases where the OS routes
 * through a VPN or virtual adapter.
 */
function isAddressOnRealInterface(ip: string): boolean {
    const nets = networkInterfaces();
    for (const [name, interfaces] of Object.entries(nets)) {
        if (!interfaces) continue;
        for (const net of interfaces) {
            if (net.address === ip) {
                if (hasVirtualName(name)) return false;
                if (isVirtualMac(net.mac)) return false;
                return true;
            }
        }
    }
    // Not found in any interface — treat as suspect
    return false;
}

/**
 * Get the local LAN IP of this machine.
 *
 * Strategy:
 *   1. Ask the OS routing table (UDP socket trick) — handles VirtualBox,
 *      VMware, Hyper-V, WSL, and VPN clients correctly because the OS itself
 *      knows which interface routes to the outside world.
 *   2. Verify the result belongs to a non-virtual interface (sanity check).
 *   3. Fall back to interface enumeration with name + MAC filtering.
 */
export async function getLocalIP(): Promise<string> {
    const outboundIP = await getPrimaryOutboundIP();

    if (outboundIP && outboundIP !== '127.0.0.1' && !outboundIP.startsWith('169.254.')) {
        if (isAddressOnRealInterface(outboundIP)) {
            return outboundIP;
        }
        // OS routed through a virtual adapter (e.g. always-on VPN) —
        // fall back to manual selection of a real LAN interface.
    }

    return getLocalIPFromInterfaces();
}

/**
 * Synchronous fallback for legacy callers that cannot await.
 * Skips the routing-table check and goes straight to interface enumeration.
 */
export function getLocalIPSync(): string {
    return getLocalIPFromInterfaces();
}

/**
 * Get all candidate non-virtual local IP addresses, sorted by quality.
 * Useful when the UI wants to show alternatives to the user.
 */
export function getAllLocalIPs(): string[] {
    const nets = networkInterfaces();
    const ips: { address: string; priority: number }[] = [];

    for (const [name, interfaces] of Object.entries(nets)) {
        if (!interfaces) continue;
        if (hasVirtualName(name)) continue;

        for (const net of interfaces) {
            if (net.family !== 'IPv4' || net.internal) continue;
            if (isVirtualMac(net.mac)) continue;
            if (net.address.startsWith('169.254.')) continue;

            let priority = 100;
            if (net.address.startsWith('192.168.')) priority = 10;
            else if (net.address.startsWith('10.')) priority = 20;

            const lower = name.toLowerCase();
            for (let i = 0; i < PRIORITY_NAMES.length; i++) {
                if (lower.includes(PRIORITY_NAMES[i])) {
                    priority = Math.min(priority, i + 1);
                    break;
                }
            }

            ips.push({ address: net.address, priority });
        }
    }

    return ips.sort((a, b) => a.priority - b.priority).map(x => x.address);
}
