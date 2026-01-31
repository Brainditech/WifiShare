import { networkInterfaces } from 'os';

/**
 * Get the local IP address of this machine on the LAN
 * Prioritizes real network interfaces over virtual ones (WSL, Docker, VPN)
 */
export function getLocalIP(): string {
    const nets = networkInterfaces();

    // Interfaces to EXCLUDE (virtual adapters)
    const excludePatterns = [
        'vethernet', 'wsl', 'docker', 'vmware', 'virtualbox',
        'vbox', 'hyper-v', 'vpn', 'loopback', 'bluetooth'
    ];

    // Priority order for network interfaces
    const priorityInterfaces = ['wi-fi', 'wifi', 'ethernet', 'en0', 'eth0', 'wlan0', 'lan'];

    const allAddresses: { name: string; address: string; priority: number }[] = [];

    for (const [name, interfaces] of Object.entries(nets)) {
        if (!interfaces) continue;

        const nameLower = name.toLowerCase();

        // Skip excluded interfaces
        if (excludePatterns.some(pattern => nameLower.includes(pattern))) {
            continue;
        }

        for (const net of interfaces) {
            if (net.family === 'IPv4' && !net.internal) {
                // Skip 172.x.x.x addresses (often Docker/WSL)
                if (net.address.startsWith('172.')) {
                    continue;
                }

                // Calculate priority (lower is better)
                let priority = 100;

                // Prefer 192.168.x.x addresses (typical home/office LAN)
                if (net.address.startsWith('192.168.')) {
                    priority = 1;
                }
                // Then 10.x.x.x (also common for LAN)
                else if (net.address.startsWith('10.')) {
                    priority = 2;
                }

                // Boost priority for known good interface names
                for (let i = 0; i < priorityInterfaces.length; i++) {
                    if (nameLower.includes(priorityInterfaces[i])) {
                        priority = Math.min(priority, i + 1);
                        break;
                    }
                }

                allAddresses.push({ name, address: net.address, priority });
            }
        }
    }

    // Sort by priority and return the best one
    allAddresses.sort((a, b) => a.priority - b.priority);

    if (allAddresses.length > 0) {
        console.log('Available IPs:', allAddresses.map(a => `${a.name}: ${a.address}`));
        console.log('Selected IP:', allAddresses[0].address);
        return allAddresses[0].address;
    }

    return '127.0.0.1';
}

/**
 * Get all available local IP addresses
 */
export function getAllLocalIPs(): string[] {
    const nets = networkInterfaces();
    const ips: string[] = [];

    for (const interfaces of Object.values(nets)) {
        if (interfaces) {
            for (const net of interfaces) {
                if (net.family === 'IPv4' && !net.internal) {
                    ips.push(net.address);
                }
            }
        }
    }

    return ips;
}
